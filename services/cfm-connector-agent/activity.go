// Package main is the hub's own CFM activity (ADR-085, #973): it provisions a
// participant's control plane context the way our EDC 1.0 launchers need it,
// in place of eclipse-cfm's EDC-V agent.
//
// Why it exists: since eclipse-cfm v0.0.3 (eclipse-cfm/cfm#148) the EDC-V
// agent writes a participant config without STS entries and with a
// per-participant Vault partition reached by jwtlet token exchange
// (agent/common/controlplane/controlplane.go L52-L66 at v0.0.7). Our control
// plane signs through the IdentityHub's STS and refuses that config:
// "400 'edc.iam.sts.oauth.client.id' is required" (measured 2026-11-09,
// docs/planning/current/issue-973-cfm-0-0-7-spike.md). It cannot run before
// the EDC-V agent instead: that agent creates the context and accepts only a
// 200, so a context created first makes it fail.
//
// What it does is what ui/src/lib/edc/provision.ts does for the control plane:
// the context, the STS config entries, the DSP profile. siglet's agent
// registers the data plane after it, as upstream. It goes when the control
// plane takes CFM's config, or when CFM writes STS entries again.
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/eclipse-cfm/cfm/agent/common/controlplane"
	"github.com/eclipse-cfm/cfm/common/model"
	"github.com/eclipse-cfm/cfm/common/system"
	"github.com/eclipse-cfm/cfm/pmanager/api"
)

// ActivityType is the type the orchestration definition names (scripts/seed-cfm.sh).
const ActivityType = "mvhd-connector-activity"

// The keys of the cfm.connector VPA properties this activity reads; the same
// key as eclipse-cfm's EDC-V agent for the dataspace profiles.
const (
	dataspaceProfilesKey = "dataspaceProfiles"
	// contextPropertiesKey carries the registration's details (display name,
	// role, ...) onto the context, where the hub's participant list reads them,
	// as provision.ts's contextProperties() does.
	contextPropertiesKey = "contextProperties"
)

// ControlPlane is the part of eclipse-cfm's control plane client this activity uses.
type ControlPlane interface {
	CreateParticipantContext(ctx context.Context, manifest controlplane.ParticipantContext) error
	PatchConfig(ctx context.Context, participantContextID string, config controlplane.ParticipantContextConfig) error
	AssociateProfiles(ctx context.Context, participantContextID string, profiles []string) error
	DeleteParticipantContext(ctx context.Context, participantContextID string) error
}

// Config holds what the launcher reads from mvhdconnectoragent.env.
type Config struct {
	// STSTokenURL is the IdentityHub's STS token endpoint the control plane calls.
	STSTokenURL string
	// DefaultProfiles are associated when the VPA properties name none, as provision.ts does.
	DefaultProfiles []string
}

type Processor struct {
	api.BaseActivityProcessor
	Monitor      system.LogMonitor
	ControlPlane ControlPlane
	Config       Config
}

type connectorData struct {
	ParticipantID        string `json:"cfm.participant.id" validate:"required"`
	ParticipantContextID string `json:"participantContextId" validate:"required,participantcontextid"`
}

// STSConfig is the context config provision.ts writes (stsConfig()): the ids,
// and the IdentityHub STS client whose secret IdentityHub keeps under
// <context>-sts-client-secret.
func STSConfig(participantContextID, did, stsTokenURL string) controlplane.ParticipantContextConfig {
	return controlplane.ParticipantContextConfig{
		ParticipantContextID: participantContextID,
		Entries: map[string]string{
			"edc.participant.id":                    did,
			"edc.iam.issuer.id":                     did,
			"edc.iam.sts.oauth.client.id":           did,
			"edc.iam.sts.oauth.token.url":           stsTokenURL,
			"edc.iam.sts.oauth.client.secret.alias": participantContextID + "-sts-client-secret",
		},
		SecretEntries: map[string]string{},
	}
}

func (p Processor) ProcessDeploy(ctx api.ActivityContext) api.ActivityResult {
	var data connectorData
	if err := ctx.ReadValues(&data); err != nil {
		return fatal(fmt.Errorf("connector activity for orchestration %s: %w", ctx.OID(), err))
	}
	props, err := ctx.VpaProperties(model.ConnectorType)
	if err != nil {
		return fatal(fmt.Errorf("connector activity for orchestration %s: %w", ctx.OID(), err))
	}
	profiles, err := p.profiles(props)
	if err != nil {
		return fatal(fmt.Errorf("connector activity for orchestration %s: %w", ctx.OID(), err))
	}
	properties, _ := props[contextPropertiesKey].(map[string]any)
	if properties == nil {
		properties = map[string]any{}
	}
	if !strings.HasPrefix(data.ParticipantID, "did:web:") {
		p.Monitor.Warnf("participant identifier %q is not a did:web", data.ParticipantID)
	}

	c := ctx.Context()
	if err := p.ControlPlane.CreateParticipantContext(c, controlplane.ParticipantContext{
		ParticipantContextID: data.ParticipantContextID,
		Identifier:           data.ParticipantID,
		Properties:           properties,
		State:                controlplane.ParticipantContextStateActivated,
	}); err != nil {
		return fatal(fmt.Errorf("cannot create participant context: %w", err))
	}
	if err := p.ControlPlane.PatchConfig(c, data.ParticipantContextID,
		STSConfig(data.ParticipantContextID, data.ParticipantID, p.Config.STSTokenURL)); err != nil {
		return fatal(fmt.Errorf("cannot write participant config: %w", err))
	}
	if len(profiles) > 0 {
		if err := p.ControlPlane.AssociateProfiles(c, data.ParticipantContextID, profiles); err != nil {
			return fatal(fmt.Errorf("cannot associate dataspace profiles: %w", err))
		}
	}
	p.Monitor.Infof("control plane context %s for %s with STS config and profiles %v",
		data.ParticipantContextID, data.ParticipantID, profiles)
	return api.ActivityResult{Result: api.ActivityResultComplete}
}

// ProcessDispose removes the context. eclipse-cfm v0.0.7 sends dispose
// without participantContextId (measured 2026-11-09); until it does, this
// fails like the upstream agents and the hub removes participants itself.
func (p Processor) ProcessDispose(ctx api.ActivityContext) api.ActivityResult {
	var data connectorData
	if err := ctx.ReadValues(&data); err != nil {
		return fatal(fmt.Errorf("connector dispose for orchestration %s: %w", ctx.OID(), err))
	}
	if err := p.ControlPlane.DeleteParticipantContext(ctx.Context(), data.ParticipantContextID); err != nil &&
		!isDeleted(err) {
		return fatal(fmt.Errorf("cannot delete participant context: %w", err))
	}
	return api.ActivityResult{Result: api.ActivityResultComplete}
}

func (p Processor) profiles(props map[string]any) ([]string, error) {
	raw, ok := props[dataspaceProfilesKey]
	if !ok || raw == nil {
		return p.Config.DefaultProfiles, nil
	}
	// a JSON round trip, as eclipse-cfm's EDC-V agent decodes the same property
	encoded, err := json.Marshal(raw)
	if err != nil {
		return nil, err
	}
	var profiles []string
	if err := json.Unmarshal(encoded, &profiles); err != nil {
		return nil, fmt.Errorf("%s is not a list of names: %w", dataspaceProfilesKey, err)
	}
	if len(profiles) == 0 {
		return p.Config.DefaultProfiles, nil
	}
	return profiles, nil
}

// isDeleted: eclipse-cfm's client calls a 204 (EDC 1.0's answer to a delete)
// and a 404 errors; for a dispose both mean the context is gone.
func isDeleted(err error) bool {
	msg := err.Error()
	return strings.Contains(msg, "status code 204") || strings.Contains(msg, "not found")
}

func fatal(err error) api.ActivityResult {
	return api.ActivityResult{Result: api.ActivityResultFatalError, Error: err}
}
