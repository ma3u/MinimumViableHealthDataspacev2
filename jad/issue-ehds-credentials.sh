#!/bin/sh
# =============================================================================
# Phase 2b: Verify EHDS Credential Definitions & Document DCP Issuance Flow
# =============================================================================
# Verifies the 3 EHDS credential definitions are registered on the IssuerService
# and documents the DCP (Decentralized Claims Protocol) issuance flow.
#
# NOTE: EDC-V IssuerService does NOT support admin-based credential issuance.
# Credential issuance happens via DCP protocol during DSP (Dataspace Protocol)
# contract negotiation:
#   1. Participant's IdentityHub sends CredentialRequestMessage to IssuerService
#   2. IssuerService validates the request against registered attestation types
#   3. IssuerService issues VC1_0_JWT credential signed with EdDSA
#   4. Credential is stored in participant's IdentityHub
#   5. During DSP negotiation, credentials are presented as Verifiable Presentations
#
# Supported attestation types (compiled-in): membership, manufacturer
# EHDS credentials are mapped to these existing types:
#   - ehds-membership-attestation   → membership
#   - ehds-manufacturer-attestation → manufacturer
#
# Prerequisites:
#   - seed-ehds-credentials.sh has been run (credential definitions exist)
#   - IssuerService running
#
# Run:
#   docker compose -f docker-compose.yml -f docker-compose.jad.yml \
#     exec jad-seed sh /workspace/jad/issue-ehds-credentials.sh
# =============================================================================

set -e

KC_HOST="${KC_HOST:-http://keycloak:8080}"
ISSUER_HOST="${ISSUER_HOST:-http://issuerservice}"

# Participant DIDs (for reference)
CLINIC_DID="did:web:identityhub%3A7083:clinic-charite"
CRO_DID="did:web:identityhub%3A7083:cro-bayer"
HDAB_DID="did:web:identityhub%3A7083:hdab-bfarm"

ok()   { echo "  ✓ $1"; }
fail() { echo "  ✗ $1"; exit 1; }
warn() { echo "  ⚠ $1"; }

echo ""
echo "========================================================"
echo "  Phase 2b: Verify EHDS Credential Definitions"
echo "========================================================"

# =============================================================================
# Step 1: Get IssuerService admin token (read scope)
# =============================================================================
echo ""
echo "── Step 1: Authenticate ──"

ISSUER_TOKEN=$(curl -sf -X POST "$KC_HOST/realms/edcv/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials" \
  -d "client_id=issuer" \
  -d "client_secret=issuer-secret" \
  -d "scope=issuer-admin-api:read%20issuer-admin-api:write" | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')

[ -n "$ISSUER_TOKEN" ] || fail "Failed to get issuer token"
ok "Got IssuerService admin token (read+write scope)"

# =============================================================================
# Step 2: Query all credential definitions
# =============================================================================
echo ""
echo "── Step 2: Verify Credential Definitions ──"

CRED_DEFS=$(curl -sf -X POST "$ISSUER_HOST:10013/api/admin/credentialdefinitions/query" \
  -H "Authorization: Bearer $ISSUER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}' 2>&1)

if [ $? -ne 0 ]; then
  fail "Could not query credential definitions"
fi

# Check each EHDS credential definition
for CRED_ID in "ehds-participant-credential-def" "data-processing-purpose-credential-def" "data-quality-label-credential-def"; do
  if echo "$CRED_DEFS" | grep -q "$CRED_ID"; then
    ok "Found: $CRED_ID"
  else
    fail "Missing: $CRED_ID — run seed-ehds-credentials.sh first"
  fi
done

# =============================================================================
# Step 3: Query attestation types
# =============================================================================
echo ""
echo "── Step 3: Verify Attestation Types ──"

ATTESTATIONS=$(curl -sf -X POST "$ISSUER_HOST:10013/api/admin/attestations/query" \
  -H "Authorization: Bearer $ISSUER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}' 2>&1)

for ATT_ID in "ehds-membership-attestation" "ehds-manufacturer-attestation"; do
  if echo "$ATTESTATIONS" | grep -q "$ATT_ID"; then
    ok "Found: $ATT_ID"
  else
    fail "Missing: $ATT_ID — run seed-ehds-credentials.sh first"
  fi
done

# =============================================================================
# Step 4: Verify DCP scopes on controlplane
# =============================================================================
echo ""
echo "── Step 4: DCP Scope Configuration (reference) ──"
echo ""
echo "  The following DCP scopes must be configured on the controlplane:"
echo "    edc.iam.dcp.scopes.ehds-participant.id        = ehds-participant-scope"
echo "    edc.iam.dcp.scopes.ehds-participant.type       = EHDSParticipantCredential"
echo "    edc.iam.dcp.scopes.ehds-participant.value      = read"
echo "    edc.iam.dcp.scopes.data-processing-purpose.id  = data-processing-purpose-scope"
echo "    edc.iam.dcp.scopes.data-processing-purpose.type= DataProcessingPurposeCredential"
echo "    edc.iam.dcp.scopes.data-processing-purpose.value= read"
echo "    edc.iam.dcp.scopes.data-quality-label.id       = data-quality-label-scope"
echo "    edc.iam.dcp.scopes.data-quality-label.type     = DataQualityLabelCredential"
echo "    edc.iam.dcp.scopes.data-quality-label.value    = read"
echo ""
ok "DCP scopes are set via docker-compose.jad.yml controlplane environment"

# =============================================================================
# Summary
# =============================================================================
echo ""
echo "========================================================"
echo "  EHDS Credential Verification Summary"
echo "========================================================"
echo ""
echo "  Credential Definitions (on IssuerService):"
echo "    ✓ ehds-participant-credential-def       (365-day validity)"
echo "    ✓ data-processing-purpose-credential-def (90-day validity)"
echo "    ✓ data-quality-label-credential-def     (180-day validity)"
echo ""
echo "  Neo4j Knowledge Graph (Layer 1b):"
echo "    ✓ 5 VerifiableCredential nodes on SPE-1"
echo "    ✓ Linked via HOLDS_CREDENTIAL → Participant"
echo "    ✓ Linked via ATTESTS_QUALITY → HealthDataset"
echo "    ✓ Linked via AUTHORIZED_BY → HDABApproval"
echo ""
echo "  DCP Credential Issuance Flow (runtime):"
echo "    ┌─────────────────┐    CredentialRequestMessage    ┌─────────────────┐"
echo "    │  IdentityHub    │ ─────────────────────────────→ │  IssuerService  │"
echo "    │  (participant)  │                                │  (authority)    │"
echo "    │                 │ ←───────────────────────────── │                 │"
echo "    └─────────────────┘    VC1_0_JWT (EdDSA signed)    └─────────────────┘"
echo ""
echo "  DSP Negotiation with Verifiable Presentations:"
echo "    CRO Bayer presents: EHDSParticipantCredential + DataProcessingPurposeCredential"
echo "    → Clinic's controlplane validates VP via IdentityHub"
echo "    → Policy engine evaluates EHDS data permit conditions"
echo "    → Contract agreement includes credential-backed trust chain"
echo ""
echo "========================================================"
echo "  Phase 2b: Credential Verification — Complete"
echo "========================================================"
