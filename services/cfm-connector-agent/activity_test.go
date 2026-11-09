package main

import (
	"context"
	"errors"
	"testing"

	"github.com/eclipse-cfm/cfm/agent/common/controlplane"
	"github.com/eclipse-cfm/cfm/common/model"
	"github.com/eclipse-cfm/cfm/common/system"
	"github.com/eclipse-cfm/cfm/pmanager/api"
)

const (
	contextID = "a7c9211b5dd153169b3ba01dce12c570"
	did       = "did:web:identityhub%3A7083:cfm-check"
	stsURL    = "http://identityhub:7084/api/sts/token"
)

type fakeControlPlane struct {
	calls    []string
	created  controlplane.ParticipantContext
	config   controlplane.ParticipantContextConfig
	profiles []string
	failOn   string
	failWith error
}

func (f *fakeControlPlane) fail(step string) error {
	f.calls = append(f.calls, step)
	if f.failOn == step {
		if f.failWith != nil {
			return f.failWith
		}
		return errors.New(step + " failed")
	}
	return nil
}

func (f *fakeControlPlane) CreateParticipantContext(_ context.Context, m controlplane.ParticipantContext) error {
	f.created = m
	return f.fail("create")
}

func (f *fakeControlPlane) PatchConfig(_ context.Context, _ string, c controlplane.ParticipantContextConfig) error {
	f.config = c
	return f.fail("config")
}

func (f *fakeControlPlane) AssociateProfiles(_ context.Context, _ string, p []string) error {
	f.profiles = p
	return f.fail("profiles")
}

func (f *fakeControlPlane) DeleteParticipantContext(_ context.Context, _ string) error {
	return f.fail("delete")
}

func processor(cp *fakeControlPlane) Processor {
	return Processor{
		Monitor:      system.NoopMonitor{},
		ControlPlane: cp,
		Config:       Config{STSTokenURL: stsURL, DefaultProfiles: []string{"http-dsp-profile-2025-1"}},
	}
}

func activityContext(discriminator api.Discriminator, data map[string]any) api.ActivityContext {
	activity := api.Activity{ID: "connector", Type: ActivityType, Discriminator: discriminator}
	return api.NewActivityContext(context.Background(), "orch-1", activity, data, map[string]any{})
}

func deployData(profiles any) map[string]any {
	props := map[string]any{}
	if profiles != nil {
		props[dataspaceProfilesKey] = profiles
	}
	return map[string]any{
		model.ParticipantIdentifier: did,
		"participantContextId":      contextID,
		model.VPAData: []any{map[string]any{
			"vpaType":    model.ConnectorType.String(),
			"properties": props,
		}},
	}
}

func TestDeployWritesTheContextTheSTSConfigAndTheDefaultProfile(t *testing.T) {
	cp := &fakeControlPlane{}
	result := processor(cp).ProcessDeploy(activityContext(api.DeployDiscriminator, deployData(nil)))

	if result.Result != api.ActivityResultComplete {
		t.Fatalf("result %v, error %v", result.Result, result.Error)
	}
	if got := cp.calls; len(got) != 3 || got[0] != "create" || got[1] != "config" || got[2] != "profiles" {
		t.Fatalf("calls %v, want create, config, profiles", got)
	}
	if cp.created.ParticipantContextID != contextID || cp.created.Identifier != did {
		t.Errorf("context %+v", cp.created)
	}
	want := map[string]string{
		"edc.participant.id":                    did,
		"edc.iam.issuer.id":                     did,
		"edc.iam.sts.oauth.client.id":           did,
		"edc.iam.sts.oauth.token.url":           stsURL,
		"edc.iam.sts.oauth.client.secret.alias": contextID + "-sts-client-secret",
	}
	for k, v := range want {
		if cp.config.Entries[k] != v {
			t.Errorf("config %s = %q, want %q", k, cp.config.Entries[k], v)
		}
	}
	if len(cp.config.SecretEntries) != 0 {
		t.Errorf("no Vault partition expected, got %v", cp.config.SecretEntries)
	}
	if len(cp.profiles) != 1 || cp.profiles[0] != "http-dsp-profile-2025-1" {
		t.Errorf("profiles %v", cp.profiles)
	}
}

func TestDeployCarriesTheContextProperties(t *testing.T) {
	data := deployData(nil)
	data[model.VPAData].([]any)[0].(map[string]any)["properties"].(map[string]any)[contextPropertiesKey] =
		map[string]any{"displayName": "Limburg Medical Centre", "role": "DATA_HOLDER"}
	cp := &fakeControlPlane{}
	result := processor(cp).ProcessDeploy(activityContext(api.DeployDiscriminator, data))

	if result.Result != api.ActivityResultComplete || cp.created.Properties["displayName"] != "Limburg Medical Centre" {
		t.Fatalf("result %v, properties %v", result.Result, cp.created.Properties)
	}
}

func TestDeployTakesTheProfilesTheVPANames(t *testing.T) {
	cp := &fakeControlPlane{}
	result := processor(cp).ProcessDeploy(activityContext(api.DeployDiscriminator, deployData([]string{"p1", "p2"})))

	if result.Result != api.ActivityResultComplete || len(cp.profiles) != 2 || cp.profiles[1] != "p2" {
		t.Fatalf("result %v, profiles %v", result.Result, cp.profiles)
	}
}

func TestDeployStopsAtTheFirstFailure(t *testing.T) {
	cp := &fakeControlPlane{failOn: "config"}
	result := processor(cp).ProcessDeploy(activityContext(api.DeployDiscriminator, deployData(nil)))

	if result.Result != api.ActivityResultFatalError || len(cp.calls) != 2 {
		t.Fatalf("result %v, calls %v", result.Result, cp.calls)
	}
}

func TestDeployNeedsTheContextID(t *testing.T) {
	data := deployData(nil)
	delete(data, "participantContextId")
	cp := &fakeControlPlane{}
	result := processor(cp).ProcessDeploy(activityContext(api.DeployDiscriminator, data))

	if result.Result != api.ActivityResultFatalError || len(cp.calls) != 0 {
		t.Fatalf("result %v, calls %v", result.Result, cp.calls)
	}
}

func TestDisposeTakesA204AsDeleted(t *testing.T) {
	cp := &fakeControlPlane{failOn: "delete", failWith: errors.New("failed to delete participant context on control plane: received status code 204, body: ")}
	result := processor(cp).ProcessDispose(activityContext(api.DisposeDiscriminator, deployData(nil)))

	if result.Result != api.ActivityResultComplete {
		t.Fatalf("result %v, error %v", result.Result, result.Error)
	}
}

func TestDisposeFailsOnAnyOtherError(t *testing.T) {
	cp := &fakeControlPlane{failOn: "delete", failWith: errors.New("received status code 500")}
	result := processor(cp).ProcessDispose(activityContext(api.DisposeDiscriminator, deployData(nil)))

	if result.Result != api.ActivityResultFatalError {
		t.Fatalf("result %v", result.Result)
	}
}
