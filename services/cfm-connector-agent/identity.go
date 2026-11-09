package main

// The hub's own IdentityHub activity (ADR-085, #973), in place of
// eclipse-cfm's IdentityHub agent.
//
// Why it exists: eclipse-cfm v0.0.7's IdentityHub agent creates the
// participant with provisionStsAccount false and a per-participant Vault
// partition (agent/common/identityhub/identityhub.go L208-L255,
// agent/orchestration/ih/activity/activity.go L130-L140). The participant then
// has no STS client (IdentityHub 1.0 creates one only when provisionStsAccount
// is true, ParticipantManifest L43), and the control plane's DSP call fails at
// "Failed to fetch client secret from the vault with alias:
// <context>-sts-client-secret" (measured 2026-11-09). This creates the
// participant as ui/src/lib/edc/provision.ts's identityManifest() does: the
// default STS account, whose secret IdentityHub stores under
// <context>-sts-client-secret in the Vault the control plane reads, and no
// partition. It goes with the connector activity.

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"

	"github.com/eclipse-cfm/cfm/common/system"
	"github.com/eclipse-cfm/cfm/common/token"
	"github.com/eclipse-cfm/cfm/pmanager/api"
)

// IdentityActivityType is the type the orchestration definition names (scripts/seed-cfm.sh).
const IdentityActivityType = "mvhd-identityhub-activity"

// identityAdminScope is the scope eclipse-cfm's IdentityHub client asks for (identityhub.go L41).
const identityAdminScope = "identity-api:admin"

// IdentityHub is the part of the IdentityHub Identity API this activity uses.
type IdentityHub interface {
	CreateParticipant(ctx context.Context, participantContextID string, manifest map[string]any) error
	DeleteParticipant(ctx context.Context, participantContextID string) error
}

// IdentityConfig holds the endpoint templates (%s is the context id), from mvhdidentityagent.env.
type IdentityConfig struct {
	CredentialServiceURL string
	ProtocolURL          string
	DataServiceURL       string
}

type IdentityProcessor struct {
	api.BaseActivityProcessor
	Monitor     system.LogMonitor
	IdentityHub IdentityHub
	Config      IdentityConfig
}

// Manifest is provision.ts's identityManifest(), plus the DataService entry
// eclipse-cfm's agent publishes; provisionStsAccount is left at its default (true).
func Manifest(participantContextID, did string, c IdentityConfig) map[string]any {
	return map[string]any{
		"participantContextId": participantContextID,
		"did":                  did,
		"active":               true,
		"roles":                []string{"participant"},
		"serviceEndpoints": []map[string]string{
			{"type": "CredentialService", "id": participantContextID + "-credentialservice",
				"serviceEndpoint": fmt.Sprintf(c.CredentialServiceURL, participantContextID)},
			{"type": "ProtocolEndpoint", "id": participantContextID + "-dsp",
				"serviceEndpoint": fmt.Sprintf(c.ProtocolURL, participantContextID)},
			{"type": "DataService", "id": participantContextID + "-dataservice",
				"serviceEndpoint": fmt.Sprintf(c.DataServiceURL, participantContextID)},
		},
		"keys": []map[string]any{{
			"keyId":              did + "#key1",
			"privateKeyAlias":    participantContextID + "-key1",
			"active":             true,
			"keyGeneratorParams": map[string]string{"algorithm": "EdDSA"},
			"usage":              []string{"sign_token", "sign_presentation", "sign_credentials"},
		}},
	}
}

func (p IdentityProcessor) ProcessDeploy(ctx api.ActivityContext) api.ActivityResult {
	var data connectorData
	if err := ctx.ReadValues(&data); err != nil {
		return fatal(fmt.Errorf("identity activity for orchestration %s: %w", ctx.OID(), err))
	}
	if err := p.IdentityHub.CreateParticipant(ctx.Context(), data.ParticipantContextID,
		Manifest(data.ParticipantContextID, data.ParticipantID, p.Config)); err != nil {
		return fatal(fmt.Errorf("cannot create IdentityHub participant: %w", err))
	}
	p.Monitor.Infof("IdentityHub participant %s for %s with an STS account", data.ParticipantContextID, data.ParticipantID)
	return api.ActivityResult{Result: api.ActivityResultComplete}
}

func (p IdentityProcessor) ProcessDispose(ctx api.ActivityContext) api.ActivityResult {
	var data connectorData
	if err := ctx.ReadValues(&data); err != nil {
		return fatal(fmt.Errorf("identity dispose for orchestration %s: %w", ctx.OID(), err))
	}
	if err := p.IdentityHub.DeleteParticipant(ctx.Context(), data.ParticipantContextID); err != nil {
		return fatal(fmt.Errorf("cannot delete IdentityHub participant: %w", err))
	}
	return api.ActivityResult{Result: api.ActivityResultComplete}
}

// HTTPIdentityHub calls the Identity API with a token from the token exchange.
type HTTPIdentityHub struct {
	BaseURL       string
	TokenProvider token.TokenProvider
	HTTPClient    *http.Client
}

func (h HTTPIdentityHub) do(ctx context.Context, method, path, participantContextID string, body any) (int, string, error) {
	accessToken, err := h.TokenProvider.GetToken(ctx, identityAdminScope, participantContextID)
	if err != nil {
		return 0, "", fmt.Errorf("no API access token: %w", err)
	}
	var reader io.Reader
	if body != nil {
		encoded, err := json.Marshal(body)
		if err != nil {
			return 0, "", err
		}
		reader = bytes.NewReader(encoded)
	}
	req, err := http.NewRequestWithContext(ctx, method, h.BaseURL+path, reader)
	if err != nil {
		return 0, "", err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := h.HTTPClient.Do(req)
	if err != nil {
		return 0, "", err
	}
	defer resp.Body.Close()
	text, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
	return resp.StatusCode, string(text), nil
}

func (h HTTPIdentityHub) CreateParticipant(ctx context.Context, participantContextID string, manifest map[string]any) error {
	status, body, err := h.do(ctx, http.MethodPost, "/v1/participants", participantContextID, manifest)
	if err != nil {
		return err
	}
	// The answer carries the API key and the STS client secret: never logged.
	if status < 200 || status >= 300 {
		return fmt.Errorf("IdentityHub answered %d: %s", status, redactSecrets(body))
	}
	return nil
}

func (h HTTPIdentityHub) DeleteParticipant(ctx context.Context, participantContextID string) error {
	status, body, err := h.do(ctx, http.MethodDelete, "/v1/participants/"+url.PathEscape(participantContextID), participantContextID, nil)
	if err != nil {
		return err
	}
	if status == http.StatusNotFound || (status >= 200 && status < 300) {
		return nil
	}
	return fmt.Errorf("IdentityHub answered %d: %s", status, body)
}

// redactSecrets keeps an error body from carrying a key or secret into the log.
func redactSecrets(body string) string {
	var m map[string]any
	if json.Unmarshal([]byte(body), &m) == nil {
		for _, k := range []string{"apiKey", "clientSecret"} {
			if _, ok := m[k]; ok {
				m[k] = "[redacted]"
			}
		}
		if out, err := json.Marshal(m); err == nil {
			return string(out)
		}
	}
	return body
}
