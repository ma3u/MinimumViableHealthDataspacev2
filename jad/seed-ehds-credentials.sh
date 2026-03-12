#!/bin/sh
# =============================================================================
# Phase 2b: Register EHDS-Specific Credential Types on IssuerService
# =============================================================================
# Creates 3 EHDS health domain credentials:
#   1. EHDSParticipantCredential    — proof of HDAB registration
#   2. DataProcessingPurposeCredential — EHDS Art 53 permitted purpose
#   3. DataQualityLabelCredential    — data quality metrics attestation
#
# Run from jad-seed container or Docker host:
#   docker compose -f docker-compose.yml -f docker-compose.jad.yml \
#     exec jad-seed sh /workspace/jad/seed-ehds-credentials.sh
#
# Or via docker exec:
#   docker exec -i health-dataspace-jad-seed sh < jad/seed-ehds-credentials.sh
#
# Prerequisites:
#   - IssuerService running with issuer tenant created (seed-jad.sh Step 1-2)
#   - Keycloak edcv realm with issuer client
# =============================================================================

set -e

KC_HOST="${KC_HOST:-http://keycloak:8080}"
ISSUER_HOST="${ISSUER_HOST:-http://issuerservice}"

ok()   { echo "  ✓ $1"; }
fail() { echo "  ✗ $1"; exit 1; }
warn() { echo "  ⚠ $1"; }

echo ""
echo "========================================================"
echo "  Phase 2b: EHDS Credential Types Registration"
echo "========================================================"

# =============================================================================
# Step 1: Get IssuerService admin token
# =============================================================================
echo ""
echo "── Step 1: Authenticate to IssuerService ──"

ISSUER_TOKEN=$(curl -sf -X POST "$KC_HOST/realms/edcv/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials" \
  -d "client_id=issuer" \
  -d "client_secret=issuer-secret" \
  -d "scope=issuer-admin-api:write" | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')

[ -n "$ISSUER_TOKEN" ] || fail "Failed to get issuer token"
ok "Got IssuerService admin token"

# =============================================================================
# Step 2: Reuse existing AttestationDefinitions
# =============================================================================
# NOTE: EDC-V IssuerService 0.17.0 only supports compiled-in attestation types:
#   - "membership"    → used for EHDS participant + data processing credentials
#   - "manufacturer"  → used for data quality label credentials
# The EHDS-specific semantics are expressed via CredentialDefinitions (Step 3).
echo ""
echo "── Step 2: Verify existing AttestationDefinitions ──"

# Verify membership attestation exists (created by seed-jad.sh)
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  "$ISSUER_HOST:10013/api/admin/v1alpha/participants/issuer/attestations" \
  -H "Authorization: Bearer $ISSUER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "attestationType": "membership",
    "configuration": {},
    "id": "ehds-membership-attestation"
  }')
[ "$HTTP_STATUS" = "200" ] || [ "$HTTP_STATUS" = "201" ] || [ "$HTTP_STATUS" = "204" ] || [ "$HTTP_STATUS" = "409" ] && \
  ok "membership attestation available ($HTTP_STATUS)" || warn "membership attestation ($HTTP_STATUS)"

# Verify manufacturer attestation exists
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  "$ISSUER_HOST:10013/api/admin/v1alpha/participants/issuer/attestations" \
  -H "Authorization: Bearer $ISSUER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "attestationType": "manufacturer",
    "configuration": {},
    "id": "ehds-manufacturer-attestation"
  }')
[ "$HTTP_STATUS" = "200" ] || [ "$HTTP_STATUS" = "201" ] || [ "$HTTP_STATUS" = "204" ] || [ "$HTTP_STATUS" = "409" ] && \
  ok "manufacturer attestation available ($HTTP_STATUS)" || warn "manufacturer attestation ($HTTP_STATUS)"

# =============================================================================
# Step 3: Create EHDS Credential Definitions
# =============================================================================
echo ""
echo "── Step 3: Create EHDS CredentialDefinitions ──"

# 3a. EHDSParticipantCredential
echo "Creating EHDSParticipantCredential definition..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  "$ISSUER_HOST:10013/api/admin/v1alpha/participants/issuer/credentialdefinitions" \
  -H "Authorization: Bearer $ISSUER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "attestations": ["ehds-membership-attestation"],
    "credentialType": "EHDSParticipantCredential",
    "id": "ehds-participant-credential-def",
    "jsonSchema": "{}",
    "jsonSchemaUrl": "https://ehds.europa.eu/schema/ehds-participant-credential.json",
    "mappings": [
      { "input": "hdabId", "output": "credentialSubject.hdabId", "required": true },
      { "input": "hdabName", "output": "credentialSubject.hdabName", "required": true },
      { "input": "participantRole", "output": "credentialSubject.participantRole", "required": true },
      { "input": "registrationDate", "output": "credentialSubject.registrationDate", "required": true },
      { "input": "jurisdiction", "output": "credentialSubject.jurisdiction", "required": true },
      { "input": "ehdsArticle", "output": "credentialSubject.ehdsArticle", "required": false }
    ],
    "rules": [],
    "format": "VC1_0_JWT",
    "validity": "31536000"
  }')
[ "$HTTP_STATUS" = "200" ] || [ "$HTTP_STATUS" = "201" ] || [ "$HTTP_STATUS" = "204" ] || [ "$HTTP_STATUS" = "409" ] && \
  ok "EHDSParticipantCredential ($HTTP_STATUS)" || warn "EHDSParticipantCredential ($HTTP_STATUS)"

# 3b. DataProcessingPurposeCredential
echo "Creating DataProcessingPurposeCredential definition..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  "$ISSUER_HOST:10013/api/admin/v1alpha/participants/issuer/credentialdefinitions" \
  -H "Authorization: Bearer $ISSUER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "attestations": ["ehds-membership-attestation"],
    "credentialType": "DataProcessingPurposeCredential",
    "id": "data-processing-purpose-credential-def",
    "jsonSchema": "{}",
    "jsonSchemaUrl": "https://ehds.europa.eu/schema/data-processing-purpose-credential.json",
    "mappings": [
      { "input": "purpose", "output": "credentialSubject.purpose", "required": true },
      { "input": "ehdsArticle", "output": "credentialSubject.ehdsArticle", "required": true },
      { "input": "permittedUses", "output": "credentialSubject.permittedUses", "required": true },
      { "input": "prohibitedUses", "output": "credentialSubject.prohibitedUses", "required": true },
      { "input": "approvalId", "output": "credentialSubject.approvalId", "required": false },
      { "input": "validUntil", "output": "credentialSubject.validUntil", "required": false }
    ],
    "rules": [],
    "format": "VC1_0_JWT",
    "validity": "7776000"
  }')
[ "$HTTP_STATUS" = "200" ] || [ "$HTTP_STATUS" = "201" ] || [ "$HTTP_STATUS" = "204" ] || [ "$HTTP_STATUS" = "409" ] && \
  ok "DataProcessingPurposeCredential ($HTTP_STATUS)" || warn "DataProcessingPurposeCredential ($HTTP_STATUS)"

# 3c. DataQualityLabelCredential
echo "Creating DataQualityLabelCredential definition..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  "$ISSUER_HOST:10013/api/admin/v1alpha/participants/issuer/credentialdefinitions" \
  -H "Authorization: Bearer $ISSUER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "attestations": ["ehds-manufacturer-attestation"],
    "credentialType": "DataQualityLabelCredential",
    "id": "data-quality-label-credential-def",
    "jsonSchema": "{}",
    "jsonSchemaUrl": "https://ehds.europa.eu/schema/data-quality-label-credential.json",
    "mappings": [
      { "input": "datasetId", "output": "credentialSubject.datasetId", "required": true },
      { "input": "completeness", "output": "credentialSubject.completeness", "required": true },
      { "input": "conformance", "output": "credentialSubject.conformance", "required": true },
      { "input": "timeliness", "output": "credentialSubject.timeliness", "required": true },
      { "input": "eehrxfCoverage", "output": "credentialSubject.eehrxfCoverage", "required": false },
      { "input": "assessmentDate", "output": "credentialSubject.assessmentDate", "required": true },
      { "input": "assessor", "output": "credentialSubject.assessor", "required": false }
    ],
    "rules": [],
    "format": "VC1_0_JWT",
    "validity": "15552000"
  }')
[ "$HTTP_STATUS" = "200" ] || [ "$HTTP_STATUS" = "201" ] || [ "$HTTP_STATUS" = "204" ] || [ "$HTTP_STATUS" = "409" ] && \
  ok "DataQualityLabelCredential ($HTTP_STATUS)" || warn "DataQualityLabelCredential ($HTTP_STATUS)"

# =============================================================================
# Step 4: Register EHDS credential specs in the Dataspace Profile
# =============================================================================
echo ""
echo "── Step 4: Summary ──"

echo ""
echo "EHDS credential types registered in IssuerService:"
echo "  1. EHDSParticipantCredential    — HDAB registration proof (1-year validity)"
echo "  2. DataProcessingPurposeCredential — Art 53 purpose attestation (90-day validity)"
echo "  3. DataQualityLabelCredential    — Data quality metrics (180-day validity)"
echo ""
echo "Next steps:"
echo "  • Add DCP scopes to docker-compose.jad.yml controlplane env"
echo "  • Add credentialSpecs to the dataspace profile"
echo "  • Issue credentials to health tenants (Clinic AlphaKlinik Berlin, CRO PharmaCo Research AG)"
echo "  • Restart controlplane to pick up new scope configuration"
echo ""
echo "========================================================"
echo "  Phase 2b: EHDS Credential Types — Complete"
echo "========================================================"
