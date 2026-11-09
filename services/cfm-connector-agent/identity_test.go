package main

import (
	"context"
	"testing"

	"github.com/eclipse-cfm/cfm/common/system"
	"github.com/eclipse-cfm/cfm/pmanager/api"
)

type fakeIdentityHub struct {
	created  map[string]any
	deleted  string
	failWith error
}

func (f *fakeIdentityHub) CreateParticipant(_ context.Context, _ string, m map[string]any) error {
	f.created = m
	return f.failWith
}

func (f *fakeIdentityHub) DeleteParticipant(_ context.Context, id string) error {
	f.deleted = id
	return f.failWith
}

var identityConfig = IdentityConfig{
	CredentialServiceURL: "http://identityhub:7082/api/credentials/v1/participants/%s",
	ProtocolURL:          "http://controlplane:8082/api/dsp/%s/http-dsp-profile-2025-1",
	DataServiceURL:       "http://controlplane:8082/api/dsp/%s/.well-known/dspace-version",
}

func TestIdentityDeployCreatesTheParticipantWithAnSTSAccountAndNoPartition(t *testing.T) {
	ih := &fakeIdentityHub{}
	p := IdentityProcessor{Monitor: system.NoopMonitor{}, IdentityHub: ih, Config: identityConfig}
	result := p.ProcessDeploy(activityContext(api.DeployDiscriminator, deployData(nil)))

	if result.Result != api.ActivityResultComplete {
		t.Fatalf("result %v, error %v", result.Result, result.Error)
	}
	m := ih.created
	if m["did"] != did || m["participantContextId"] != contextID {
		t.Fatalf("manifest %v", m)
	}
	if _, set := m["provisionStsAccount"]; set {
		t.Error("provisionStsAccount must stay at IdentityHub's default (true)")
	}
	if _, set := m["additionalProperties"]; set {
		t.Error("no Vault partition expected")
	}
	key := m["keys"].([]map[string]any)[0]
	if key["privateKeyAlias"] != contextID+"-key1" || key["keyId"] != did+"#key1" {
		t.Errorf("key %v", key)
	}
	endpoints := m["serviceEndpoints"].([]map[string]string)
	if endpoints[0]["serviceEndpoint"] != "http://identityhub:7082/api/credentials/v1/participants/"+contextID {
		t.Errorf("credential service %v", endpoints[0])
	}
}

func TestIdentityDisposeDeletesTheParticipant(t *testing.T) {
	ih := &fakeIdentityHub{}
	p := IdentityProcessor{Monitor: system.NoopMonitor{}, IdentityHub: ih, Config: identityConfig}
	result := p.ProcessDispose(activityContext(api.DisposeDiscriminator, deployData(nil)))

	if result.Result != api.ActivityResultComplete || ih.deleted != contextID {
		t.Fatalf("result %v, deleted %q", result.Result, ih.deleted)
	}
}

func TestRedactSecretsHidesTheKeyAndTheSecret(t *testing.T) {
	got := redactSecrets(`{"apiKey":"k","clientSecret":"s","clientId":"c"}`)
	if got != `{"apiKey":"[redacted]","clientId":"c","clientSecret":"[redacted]"}` {
		t.Fatalf("got %s", got)
	}
}
