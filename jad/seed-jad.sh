#!/bin/sh
# =============================================================================
# JAD Seed Script — Initialize IssuerService, TenantManager, ProvisionManager
# =============================================================================
# Docker Compose equivalent of K8s seed jobs:
#   - issuerservice-seed-job.yaml
#   - tenant-manager-seed-job.yaml
#   - provision-manager-seed-job.yaml
#
# Run this AFTER all services are healthy:
#   docker compose -f docker-compose.yml -f docker-compose.jad.yml \
#     run --rm jad-seed
#
# Or directly:
#   docker exec -i health-dataspace-jad-seed sh < jad/seed-jad.sh
# =============================================================================

set -e

KC_HOST="${KC_HOST:-http://keycloak:8080}"
ISSUER_HOST="${ISSUER_HOST:-http://issuerservice}"
TM_HOST="${TM_HOST:-http://tenant-manager:8080}"
PM_HOST="${PM_HOST:-http://provision-manager:8080}"
ISSUER_CLIENT_ID="${ISSUER_CLIENT_ID:-issuer}"
ISSUER_CLIENT_SECRET="${ISSUER_CLIENT_SECRET:-issuer-secret}"

# Utility: wait for a service to be ready
wait_for() {
  local name="$1" url="$2" max_retries="${3:-30}"
  echo "Waiting for $name to be ready..."
  i=0
  while [ $i -lt $max_retries ]; do
    if curl -sf "$url" > /dev/null 2>&1; then
      echo "✓ $name is ready"
      return 0
    fi
    i=$((i + 1))
    sleep 5
  done
  echo "✗ $name did not become ready after $((max_retries * 5))s"
  return 1
}

echo ""
echo "========================================================"
echo "  JAD Stack Seeding — Docker Compose"
echo "========================================================"
echo ""

# =============================================================================
# Phase 1: Wait for all services
# =============================================================================
wait_for "Keycloak"         "$KC_HOST/realms/edcv"
wait_for "IssuerService"    "$ISSUER_HOST:10010/api/check/readiness"
wait_for "TenantManager"    "$TM_HOST/api/v1alpha1/cells"
wait_for "ProvisionManager" "$PM_HOST/api/v1alpha1/activity-definitions"

# =============================================================================
# Phase 2: IssuerService Seed (from issuerservice-seed-job.yaml)
# =============================================================================
echo ""
echo "========================================================"
echo "  Step 1: Create Vault Access Client (Issuer)"
echo "========================================================"

# Get Keycloak admin token
KC_TOKEN=$(curl -sf -X POST "$KC_HOST/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password" \
  -d "username=admin" \
  -d "password=admin" \
  -d "client_id=admin-cli" | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')

if [ -z "$KC_TOKEN" ]; then
  echo "✗ Failed to get Keycloak admin token"
  exit 1
fi
echo "✓ Got Keycloak admin token"

# Create Keycloak client for Vault access (issuer)
echo "Creating Vault Access Client for issuer..."
if curl -sf -X POST "$KC_HOST/admin/realms/edcv/clients" \
  -H "Authorization: Bearer $KC_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "'"$ISSUER_CLIENT_ID"'",
    "name": "Issuer Client",
    "description": "Client for Vault Access (Issuer)",
    "enabled": true,
    "secret": "'"$ISSUER_CLIENT_SECRET"'",
    "protocol": "openid-connect",
    "publicClient": false,
    "serviceAccountsEnabled": true,
    "standardFlowEnabled": false,
    "directAccessGrantsEnabled": false,
    "fullScopeAllowed": true,
    "protocolMappers": [
      {
        "name": "participantContextId",
        "protocol": "openid-connect",
        "protocolMapper": "oidc-hardcoded-claim-mapper",
        "consentRequired": false,
        "config": {
          "claim.name": "participant_context_id",
          "claim.value": "issuer",
          "jsonType.label": "String",
          "access.token.claim": "true",
          "id.token.claim": "true",
          "userinfo.token.claim": "true"
        }
      },
      {
        "name": "role",
        "protocol": "openid-connect",
        "protocolMapper": "oidc-hardcoded-claim-mapper",
        "consentRequired": false,
        "config": {
          "claim.name": "role",
          "claim.value": "participant",
          "jsonType.label": "String",
          "access.token.claim": "true",
          "id.token.claim": "true",
          "userinfo.token.claim": "true"
        }
      }
    ]
  }'; then
  echo ""
  echo "✓ Vault Access Client created"
else
  echo "⚠ Vault Access Client creation failed (may already exist)"
fi

echo ""
echo "========================================================"
echo "  Step 2: Create Issuer Tenant in IssuerService"
echo "========================================================"

# Get provisioner token
PROVISIONER_TOKEN=$(curl -sf -X POST "$KC_HOST/realms/edcv/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials" \
  -d "client_id=provisioner" \
  -d "client_secret=provisioner-secret" \
  -d "scope=issuer-admin-api:write" | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')

if [ -z "$PROVISIONER_TOKEN" ]; then
  echo "✗ Failed to get provisioner token"
  exit 1
fi
echo "✓ Got provisioner token"

# Create issuer tenant
curl -sf -X POST "$ISSUER_HOST:10015/api/identity/v1alpha/participants" \
  -H "Authorization: Bearer $PROVISIONER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "roles": ["admin"],
    "serviceEndpoints": [
      {
        "type": "IssuerService",
        "serviceEndpoint": "http://issuerservice:10012/api/issuance/v1alpha/participants/issuer",
        "id": "issuer-service-1"
      }
    ],
    "active": true,
    "participantContextId": "issuer",
    "did": "did:web:issuerservice%3A10016:issuer",
    "key": {
      "keyId": "did:web:issuerservice%3A10016:issuer#key-1",
      "privateKeyAlias": "did:web:issuerservice%3A10016:issuer#key-1",
      "keyGeneratorParams": {
        "algorithm": "EdDSA"
      }
    },
    "additionalProperties": {
      "edc.vault.hashicorp.config": {
        "credentials": {
          "clientId": "'"$ISSUER_CLIENT_ID"'",
          "clientSecret": "'"$ISSUER_CLIENT_SECRET"'",
          "tokenUrl": "http://keycloak:8080/realms/edcv/protocol/openid-connect/token"
        },
        "config": {
          "secretPath": "v1/participants",
          "folderPath": "'"$ISSUER_CLIENT_ID"'",
          "vaultUrl": "http://vault:8200"
        }
      }
    }
  }'
echo ""
echo "✓ Issuer tenant created"

echo ""
echo "========================================================"
echo "  Step 3: Create AttestationDefinitions"
echo "========================================================"

# Get issuer token
ISSUER_TOKEN=$(curl -sf -X POST "$KC_HOST/realms/edcv/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials" \
  -d "client_id=issuer" \
  -d "client_secret=issuer-secret" \
  -d "scope=issuer-admin-api:write" | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')

if [ -z "$ISSUER_TOKEN" ]; then
  echo "✗ Failed to get issuer token"
  exit 1
fi
echo "✓ Got issuer token"

echo "Creating Membership AttestationDefinition..."
curl -sfS -w "\n  HTTP_STATUS:%{http_code}\n" -X POST "$ISSUER_HOST:10013/api/admin/v1alpha/participants/issuer/attestations" \
  -H "Authorization: Bearer $ISSUER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "attestationType": "membership",
    "configuration": {},
    "id": "membership-attestation-def-1"
  }'

echo "Creating Manufacturer AttestationDefinition..."
curl -sfS -w "\n  HTTP_STATUS:%{http_code}\n" -X POST "$ISSUER_HOST:10013/api/admin/v1alpha/participants/issuer/attestations" \
  -H "Authorization: Bearer $ISSUER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "attestationType": "manufacturer",
    "configuration": {},
    "id": "manufacturer-attestation-def-1"
  }'
echo "✓ AttestationDefinitions created"

echo ""
echo "========================================================"
echo "  Step 4: Create CredentialDefinitions"
echo "========================================================"

echo "Creating Membership CredentialDefinition..."
curl -sfS -w "\n  HTTP_STATUS:%{http_code}\n" -X POST "$ISSUER_HOST:10013/api/admin/v1alpha/participants/issuer/credentialdefinitions" \
  -H "Authorization: Bearer $ISSUER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "attestations": ["membership-attestation-def-1"],
    "credentialType": "MembershipCredential",
    "id": "membership-credential-def",
    "jsonSchema": "{}",
    "jsonSchemaUrl": "https://example.com/schema/membership-credential.json",
    "mappings": [
      { "input": "membership", "output": "credentialSubject.membership", "required": true },
      { "input": "membershipType", "output": "credentialSubject.membershipType", "required": "true" },
      { "input": "membershipStartDate", "output": "credentialSubject.membershipStartDate", "required": true }
    ],
    "rules": [],
    "format": "VC1_0_JWT",
    "validity": "604800"
  }'

echo "Creating Manufacturer CredentialDefinition..."
curl -sfS -w "\n  HTTP_STATUS:%{http_code}\n" -X POST "$ISSUER_HOST:10013/api/admin/v1alpha/participants/issuer/credentialdefinitions" \
  -H "Authorization: Bearer $ISSUER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "attestations": ["manufacturer-attestation-def-1"],
    "credentialType": "ManufacturerCredential",
    "id": "manufacturer-credential-def",
    "jsonSchema": "{}",
    "jsonSchemaUrl": "https://example.com/schema/manufacturer-credential.json",
    "mappings": [
      { "input": "contractVersion", "output": "credentialSubject.contractVersion", "required": true },
      { "input": "component_types", "output": "credentialSubject.part_types", "required": "true" },
      { "input": "since", "output": "credentialSubject.since", "required": true }
    ],
    "rules": [],
    "format": "VC1_0_JWT",
    "validity": "604800"
  }'
echo "✓ CredentialDefinitions created"

# =============================================================================
# Phase 3: TenantManager Seed (from tenant-manager-seed-job.yaml)
# =============================================================================
echo ""
echo "========================================================"
echo "  Step 5: Seed TenantManager (Cell + Dataspace Profile)"
echo "========================================================"

# Create Cell
echo "Creating Cell..."
CELL_RESPONSE=$(curl -s -X POST "$TM_HOST/api/v1alpha1/cells" \
  -H "Content-Type: application/json" \
  -d '{
    "properties": { "environment": "health-dataspace-dev" },
    "state": "active",
    "stateTimestamp": "'"$(date -u +"%Y-%m-%dT%H:%M:%SZ")"'"
  }')
CELL_ID=$(echo "$CELL_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | sed 's/"id":"//;s/"//')
echo "✓ Cell created with ID: $CELL_ID"

# Create Dataspace Profile
echo "Creating Dataspace Profile..."
PROFILE_RESPONSE=$(curl -s -X POST "$TM_HOST/api/v1alpha1/dataspace-profiles" \
  -H "Content-Type: application/json" \
  -d '{
    "artifacts": [],
    "properties": {},
    "dataspaceSpec": {
      "protocolStack": ["dsp-2025-1", "dcp-2025-1"],
      "credentialSpecs": [
        {
          "type": "MembershipCredential",
          "issuer": "did:web:issuerservice%3A10016:issuer",
          "format": "VC1_0_JWT",
          "id": "membership-credential-def"
        },
        {
          "type": "ManufacturerCredential",
          "issuer": "did:web:issuerservice%3A10016:issuer",
          "format": "VC1_0_JWT",
          "id": "manufacturer-credential-def",
          "role": "manufacturer"
        },
        {
          "type": "EHDSParticipantCredential",
          "issuer": "did:web:issuerservice%3A10016:issuer",
          "format": "VC1_0_JWT",
          "id": "ehds-participant-credential-def"
        },
        {
          "type": "DataProcessingPurposeCredential",
          "issuer": "did:web:issuerservice%3A10016:issuer",
          "format": "VC1_0_JWT",
          "id": "data-processing-purpose-credential-def",
          "role": "data-user"
        },
        {
          "type": "DataQualityLabelCredential",
          "issuer": "did:web:issuerservice%3A10016:issuer",
          "format": "VC1_0_JWT",
          "id": "data-quality-label-credential-def",
          "role": "data-holder"
        }
      ]
    }
  }')
DATASPACE_PROFILE_ID=$(echo "$PROFILE_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | sed 's/"id":"//;s/"//')
echo "✓ Dataspace Profile created with ID: $DATASPACE_PROFILE_ID"

# Deploy Dataspace Profile
echo "Deploying Dataspace Profile..."
curl -sfS -w "\n  HTTP_STATUS:%{http_code}\n" -X POST "$TM_HOST/api/v1alpha1/dataspace-profiles/$DATASPACE_PROFILE_ID/deployments" \
  -H "Content-Type: application/json" \
  -d '{
    "profileId": "'"$DATASPACE_PROFILE_ID"'",
    "cellId": "'"$CELL_ID"'"
  }'
echo "✓ Dataspace Profile deployed"

# =============================================================================
# Phase 4: ProvisionManager Seed (from provision-manager-seed-job.yaml)
# =============================================================================
echo ""
echo "========================================================"
echo "  Step 6: Seed ProvisionManager (Activities + Orchestration)"
echo "========================================================"

# Create Activity Definitions
for ACTIVITY_TYPE in network-activity edcv-activity registration-activity keycloak-activity onboarding-activity; do
  echo "Creating $ACTIVITY_TYPE ActivityDefinition..."
  curl -sfS -w " HTTP_STATUS:%{http_code}\n" -X POST "$PM_HOST/api/v1alpha1/activity-definitions" \
    -H "Content-Type: application/json" \
    -d '{
      "description": "Provisions '"$ACTIVITY_TYPE"' entries",
      "inputSchema": {},
      "outputSchema": {},
      "type": "'"$ACTIVITY_TYPE"'"
    }'
done
echo "✓ All ActivityDefinitions created"

# Create Orchestration Definition (deploy + dispose)
DEPLOY_ORCH_ID=$(cat /proc/sys/kernel/random/uuid 2>/dev/null || python3 -c "import uuid; print(uuid.uuid4())" 2>/dev/null || echo "orch-$(date +%s)")

echo "Creating Orchestration Definition..."
curl -sfS -w "\n  HTTP_STATUS:%{http_code}\n" -X POST "$PM_HOST/api/v1alpha1/orchestration-definitions" \
  -H "Content-Type: application/json" \
  -d '{
    "activities": {
      "cfm.orchestration.vpa.dispose": [
        { "id": "offboarding-agent", "type": "onboarding-activity", "dependsOn": [] },
        { "id": "kc-client-remover", "type": "keycloak-activity", "dependsOn": ["offboarding-agent", "connector-rollback", "registration-rollback"] },
        { "id": "registration-rollback", "type": "registration-activity", "dependsOn": [] },
        { "id": "connector-rollback", "type": "edcv-activity", "dependsOn": [] }
      ],
      "cfm.orchestration.vpa.deploy": [
        { "id": "kc-client-provisioner", "type": "keycloak-activity", "dependsOn": [] },
        { "id": "registration-agent", "type": "registration-activity", "dependsOn": ["kc-client-provisioner"] },
        { "id": "connector-provisioner", "type": "edcv-activity", "dependsOn": ["kc-client-provisioner"] },
        { "id": "onboarding-agent", "type": "onboarding-activity", "dependsOn": ["connector-provisioner", "registration-agent"] }
      ]
    },
    "description": "Orchestrates the deployment of a new dataspace member",
    "schema": {},
    "id": "'"$DEPLOY_ORCH_ID"'"
  }'
echo "✓ Orchestration Definition created"

echo ""
echo "========================================================"
echo "  JAD Stack Seeding Complete!"
echo "========================================================"
echo ""
echo "Services seeded:"
echo "  ✓ IssuerService (tenant + attestations + credentials)"
echo "  ✓ TenantManager  (cell + dataspace profile)"
echo "  ✓ ProvisionManager (activities + orchestration)"
echo ""
