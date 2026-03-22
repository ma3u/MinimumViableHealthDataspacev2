#!/usr/bin/env bash
# =============================================================================
# Seed IssuerService Attestation + Credential Definitions (Host-Side)
# =============================================================================
# Creates ALL attestation and credential definitions required for the Health
# Dataspace on the IssuerService admin API. Includes base definitions (from
# jad-seed Steps 3-4) and EHDS credential types.
#
# This script is idempotent — HTTP 409 (Conflict) is treated as success.
#
# Usage:
#   ./jad/seed-issuer-defs.sh                     # defaults: localhost ports
#   KC_HOST=http://keycloak:8080 \
#     ISSUER_API=http://issuerservice:10013 \
#     ./jad/seed-issuer-defs.sh                   # inside Docker network
#
# Called automatically by bootstrap-jad.sh Phase 8.
#
# Prerequisites:
#   - Keycloak running with edcv realm + issuer client
#   - IssuerService running with 'issuer' participant ACTIVATED
# =============================================================================
set -euo pipefail

KC_HOST="${KC_HOST:-http://localhost:8080}"
ISSUER_API="${ISSUER_API:-http://localhost:10013}"
ISSUER_BASE="$ISSUER_API/api/admin/v1alpha/participants/issuer"

ok()   { echo "  ✓ $1"; }
warn() { echo "  ⚠ $1"; }
fail() { echo "  ✗ $1" >&2; exit 1; }

# Helper: POST a definition and handle 409 as success
create_def() {
  local kind="$1"   # "attestations" or "credentialdefinitions"
  local label="$2"
  local payload="$3"
  local url="$ISSUER_BASE/$kind"

  local http_code
  http_code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$url" \
    -H "Authorization: Bearer $ISSUER_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$payload" 2>/dev/null) || http_code="000"

  case "$http_code" in
    200|201|204) ok "$label (created)" ;;
    409)         ok "$label (exists)" ;;
    *)           warn "$label (HTTP $http_code)" ;;
  esac
}

echo ""
echo "════════════════════════════════════════════════════════"
echo "  Seeding IssuerService Definitions"
echo "════════════════════════════════════════════════════════"

# ── Authenticate ──────────────────────────────────────────────────────────
echo ""
echo "── Authenticating to Keycloak ──"

ISSUER_TOKEN=$(curl -sf -X POST "$KC_HOST/realms/edcv/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&client_id=issuer&client_secret=issuer-secret&scope=issuer-admin-api:write" \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['access_token'])" 2>/dev/null) \
  || fail "Could not get issuer token from Keycloak ($KC_HOST)"
ok "Got issuer admin token"

# ── Attestation Definitions ──────────────────────────────────────────────
echo ""
echo "── Attestation Definitions (4) ──"

create_def "attestations" "membership-attestation-def-1" \
  '{"attestationType":"membership","configuration":{},"id":"membership-attestation-def-1"}'

create_def "attestations" "manufacturer-attestation-def-1" \
  '{"attestationType":"manufacturer","configuration":{},"id":"manufacturer-attestation-def-1"}'

create_def "attestations" "ehds-membership-attestation" \
  '{"attestationType":"membership","configuration":{},"id":"ehds-membership-attestation"}'

create_def "attestations" "ehds-manufacturer-attestation" \
  '{"attestationType":"manufacturer","configuration":{},"id":"ehds-manufacturer-attestation"}'

# ── Credential Definitions ───────────────────────────────────────────────
echo ""
echo "── Credential Definitions (5) ──"

# Base: MembershipCredential (7-day validity)
create_def "credentialdefinitions" "MembershipCredential" '{
  "attestations": ["membership-attestation-def-1"],
  "credentialType": "MembershipCredential",
  "id": "membership-credential-def",
  "jsonSchema": "{}",
  "jsonSchemaUrl": "https://example.com/schema/membership-credential.json",
  "mappings": [
    {"input":"membership","output":"credentialSubject.membership","required":true},
    {"input":"membershipType","output":"credentialSubject.membershipType","required":"true"},
    {"input":"membershipStartDate","output":"credentialSubject.membershipStartDate","required":true}
  ],
  "rules": [],
  "format": "VC1_0_JWT",
  "validity": "604800"
}'

# Base: ManufacturerCredential (7-day validity)
create_def "credentialdefinitions" "ManufacturerCredential" '{
  "attestations": ["manufacturer-attestation-def-1"],
  "credentialType": "ManufacturerCredential",
  "id": "manufacturer-credential-def",
  "jsonSchema": "{}",
  "jsonSchemaUrl": "https://example.com/schema/manufacturer-credential.json",
  "mappings": [
    {"input":"contractVersion","output":"credentialSubject.contractVersion","required":true},
    {"input":"component_types","output":"credentialSubject.part_types","required":"true"},
    {"input":"since","output":"credentialSubject.since","required":true}
  ],
  "rules": [],
  "format": "VC1_0_JWT",
  "validity": "604800"
}'

# EHDS: EHDSParticipantCredential (1-year validity)
create_def "credentialdefinitions" "EHDSParticipantCredential" '{
  "attestations": ["ehds-membership-attestation"],
  "credentialType": "EHDSParticipantCredential",
  "id": "ehds-participant-credential-def",
  "jsonSchema": "{}",
  "jsonSchemaUrl": "https://ehds.europa.eu/schema/ehds-participant-credential.json",
  "mappings": [
    {"input":"hdabId","output":"credentialSubject.hdabId","required":true},
    {"input":"hdabName","output":"credentialSubject.hdabName","required":true},
    {"input":"participantRole","output":"credentialSubject.participantRole","required":true},
    {"input":"registrationDate","output":"credentialSubject.registrationDate","required":true},
    {"input":"jurisdiction","output":"credentialSubject.jurisdiction","required":true},
    {"input":"ehdsArticle","output":"credentialSubject.ehdsArticle","required":false}
  ],
  "rules": [],
  "format": "VC1_0_JWT",
  "validity": "31536000"
}'

# EHDS: DataProcessingPurposeCredential (90-day validity)
create_def "credentialdefinitions" "DataProcessingPurposeCredential" '{
  "attestations": ["ehds-membership-attestation"],
  "credentialType": "DataProcessingPurposeCredential",
  "id": "data-processing-purpose-credential-def",
  "jsonSchema": "{}",
  "jsonSchemaUrl": "https://ehds.europa.eu/schema/data-processing-purpose-credential.json",
  "mappings": [
    {"input":"purpose","output":"credentialSubject.purpose","required":true},
    {"input":"ehdsArticle","output":"credentialSubject.ehdsArticle","required":true},
    {"input":"permittedUses","output":"credentialSubject.permittedUses","required":true},
    {"input":"prohibitedUses","output":"credentialSubject.prohibitedUses","required":true},
    {"input":"approvalId","output":"credentialSubject.approvalId","required":false},
    {"input":"validUntil","output":"credentialSubject.validUntil","required":false}
  ],
  "rules": [],
  "format": "VC1_0_JWT",
  "validity": "7776000"
}'

# EHDS: DataQualityLabelCredential (180-day validity)
create_def "credentialdefinitions" "DataQualityLabelCredential" '{
  "attestations": ["ehds-manufacturer-attestation"],
  "credentialType": "DataQualityLabelCredential",
  "id": "data-quality-label-credential-def",
  "jsonSchema": "{}",
  "jsonSchemaUrl": "https://ehds.europa.eu/schema/data-quality-label-credential.json",
  "mappings": [
    {"input":"datasetId","output":"credentialSubject.datasetId","required":true},
    {"input":"completeness","output":"credentialSubject.completeness","required":true},
    {"input":"conformance","output":"credentialSubject.conformance","required":true},
    {"input":"timeliness","output":"credentialSubject.timeliness","required":true},
    {"input":"eehrxfCoverage","output":"credentialSubject.eehrxfCoverage","required":false},
    {"input":"assessmentDate","output":"credentialSubject.assessmentDate","required":true},
    {"input":"assessor","output":"credentialSubject.assessor","required":false}
  ],
  "rules": [],
  "format": "VC1_0_JWT",
  "validity": "15552000"
}'

echo ""
echo "════════════════════════════════════════════════════════"
echo "  IssuerService Definitions — Complete"
echo "════════════════════════════════════════════════════════"
echo "  4 attestation definitions"
echo "  5 credential definitions (2 base + 3 EHDS)"
echo ""
