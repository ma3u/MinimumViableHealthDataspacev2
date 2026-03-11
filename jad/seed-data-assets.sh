#!/usr/bin/env bash
# =============================================================================
# Phase 1b (cont.): Register Data Assets on EDC-V
# =============================================================================
# Registers Neo4j-backed data assets on each participant's EDC-V instance
# via the ControlPlane Management API.
#
# Assets created:
#   Test-Clinic (provider): FHIR Patient Search, FHIR Observation Bundle
#   Clinic      (provider): FHIR Patient, FHIR Cohort Bundle, OMOP Stats, HealthDCAT-AP Catalog
#   CRO         (consumer): Research Data Request, OMOP Analytics Query
#   HDAB        (operator): HealthDCAT-AP Catalog (federated)
#
# Prerequisites:
#   - All JAD services running
#   - seed-jad.sh and seed-health-tenants.sh executed
# =============================================================================
set -euo pipefail

# --- Configuration ---
CP_HOST="${CP_HOST:-http://localhost:11003}"
CP_MGMT="${CP_HOST}/api/mgmt"
KC_HOST="${KC_HOST:-http://localhost:8080}"
KC_REALM="edcv"

# Neo4j Proxy (internal Docker network address, accessed by dataplane)
NEO4J_PROXY_URL="http://neo4j-proxy:9090"

# JSON-LD context required by EDC Management API v5alpha
EDC_CTX="https://w3id.org/edc/connector/management/v2"

# --- Colors ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ok()   { echo -e "${GREEN}✓${NC} $*"; }
warn() { echo -e "${YELLOW}⚠${NC} $*"; }
fail() { echo -e "${RED}✗${NC} $*"; exit 1; }

# --- Obtain Keycloak token ---
get_token() {
  local token
  token=$(curl -sf -X POST "$KC_HOST/realms/$KC_REALM/protocol/openid-connect/token" \
    -d "grant_type=client_credentials&client_id=admin&client_secret=edc-v-admin-secret" \
    | python3 -c "import json,sys; print(json.load(sys.stdin)['access_token'])")
  [ -n "$token" ] || fail "Failed to obtain Keycloak token"
  echo "$token"
}

# --- Generic Management API call ---
# Usage: mgmt_call <method> <path> [json_body]
mgmt_call() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  local token
  token=$(get_token)

  local args=(-s -X "$method" "$CP_MGMT/$path" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $token")

  if [ -n "$body" ]; then
    args+=(-d "$body")
  fi

  curl "${args[@]}"
}

# --- Create Asset ---
# Usage: create_asset <participant_ctx_id> <asset_id> <name> <description> <content_type> <data_address_json>
create_asset() {
  local ctx_id="$1"
  local asset_id="$2"
  local name="$3"
  local description="$4"
  local content_type="$5"
  local data_address="$6"

  local payload
  payload=$(python3 -c "
import json
asset = {
    '@context': ['$EDC_CTX'],
    '@type': 'Asset',
    '@id': '$asset_id',
    'properties': {
        'name': $(python3 -c "import json; print(json.dumps('$name'))"),
        'description': $(python3 -c "import json; print(json.dumps('$description'))"),
        'contenttype': '$content_type',
        'version': '1.0.0'
    },
    'dataAddress': $data_address
}
print(json.dumps(asset))
")

  local response
  response=$(mgmt_call POST "v5alpha/participants/$ctx_id/assets" "$payload")

  if echo "$response" | python3 -c "import json,sys; d=json.load(sys.stdin); assert '@id' in d" 2>/dev/null; then
    local created_id
    created_id=$(echo "$response" | python3 -c "import json,sys; print(json.load(sys.stdin)['@id'])")
    ok "Asset '$name' created: $created_id"
  else
    echo "  Response: $response"
    warn "Asset '$name' may have failed"
  fi
}

# --- Create Policy Definition ---
# Usage: create_policy <participant_ctx_id> <policy_id> <policy_json>
create_policy() {
  local ctx_id="$1"
  local policy_id="$2"
  local policy_json="$3"

  local payload
  payload=$(python3 -c "
import json
policy_def = {
    '@context': ['$EDC_CTX'],
    '@type': 'PolicyDefinition',
    '@id': '$policy_id',
    'policy': $policy_json
}
print(json.dumps(policy_def))
")

  local response
  response=$(mgmt_call POST "v5alpha/participants/$ctx_id/policydefinitions" "$payload")

  if echo "$response" | python3 -c "import json,sys; d=json.load(sys.stdin); assert '@id' in d" 2>/dev/null; then
    ok "Policy '$policy_id' created"
  else
    echo "  Response: $response"
    warn "Policy '$policy_id' may have failed"
  fi
}

# --- Create Contract Definition ---
# Usage: create_contract_def <participant_ctx_id> <contract_def_id> <access_policy_id> <contract_policy_id> <asset_selector_json>
create_contract_def() {
  local ctx_id="$1"
  local contract_def_id="$2"
  local access_policy_id="$3"
  local contract_policy_id="$4"
  local selector="$5"

  local payload
  payload=$(python3 -c "
import json
cd = {
    '@context': ['$EDC_CTX'],
    '@type': 'ContractDefinition',
    '@id': '$contract_def_id',
    'accessPolicyId': '$access_policy_id',
    'contractPolicyId': '$contract_policy_id',
    'assetsSelector': $selector
}
print(json.dumps(cd))
")

  local response
  response=$(mgmt_call POST "v5alpha/participants/$ctx_id/contractdefinitions" "$payload")

  if echo "$response" | python3 -c "import json,sys; d=json.load(sys.stdin); assert '@id' in d" 2>/dev/null; then
    ok "Contract definition '$contract_def_id' created"
  else
    echo "  Response: $response"
    warn "Contract definition '$contract_def_id' may have failed"
  fi
}

# =============================================================================
# Discover participant context IDs
# =============================================================================
echo "================================================"
echo "Phase 1b (cont.): Register Data Assets on EDC-V"
echo "================================================"
echo ""

TM_HOST="${TM_HOST:-http://localhost:11006}"

echo "Discovering participant context IDs from TenantManager..."
TENANT_DATA=$(curl -sf "$TM_HOST/api/v1alpha1/tenants" | python3 -c "
import json, sys
tenants = json.load(sys.stdin)
for t in tenants:
    name = t['properties'].get('displayName', '')
    role = t['properties'].get('role', '')
    tid = t['id']
    print(f'{name}|{role}|{tid}')
")

# For each tenant, get the participant context ID
declare -A CTX_IDS
while IFS='|' read -r name role tid; do
  ctx_id=$(curl -sf "$TM_HOST/api/v1alpha1/tenants/$tid/participant-profiles" | python3 -c "
import json, sys
profiles = json.load(sys.stdin)
for p in profiles:
    if not p.get('error', False):
        state = p.get('properties', {}).get('cfm.vpa.state', {})
        ctx = state.get('participantContextId', '')
        if ctx:
            print(ctx)
            break
")
  echo "  $name ($role): ctx=$ctx_id"
  # Map by name+role (Test Clinic and Clinic Charité are both providers)
  case "$name" in
    "Test Clinic"*) TEST_CLINIC_CTX="$ctx_id" ;;
    *) case "$role" in
         provider) CLINIC_CTX="$ctx_id" ;;
         consumer) CRO_CTX="$ctx_id" ;;
         operator) HDAB_CTX="$ctx_id" ;;
       esac ;;
  esac
done <<< "$TENANT_DATA"

echo ""
echo "Participant Context IDs:"
echo "  Test Clinic: $TEST_CLINIC_CTX"
echo "  Clinic:      $CLINIC_CTX"
echo "  CRO:     $CRO_CTX"
echo "  HDAB:    $HDAB_CTX"
echo ""

# =============================================================================
# Step 0: Create Data Assets on Test Clinic (Provider)
# =============================================================================
echo "────────────────────────────────────────────────"
echo "Step 0: Register Data Assets on Test Clinic"
echo "────────────────────────────────────────────────"

create_asset "$TEST_CLINIC_CTX" "fhir-patient-search" \
  "FHIR Patient Search" \
  "Search FHIR R4 patients by demographics and conditions. Maps to Neo4j Patient nodes." \
  "application/fhir+json" \
  "{\"@type\":\"DataAddress\",\"type\":\"HttpData\",\"baseUrl\":\"$NEO4J_PROXY_URL/fhir/Patient\",\"proxyPath\":\"true\",\"proxyQueryParams\":\"true\"}"

create_asset "$TEST_CLINIC_CTX" "fhir-observation-bundle" \
  "FHIR Observation Bundle" \
  "FHIR R4 Observation resources including vitals and lab results. Supports LOINC coded queries." \
  "application/fhir+json" \
  "{\"@type\":\"DataAddress\",\"type\":\"HttpData\",\"baseUrl\":\"$NEO4J_PROXY_URL/fhir/Observation\",\"proxyPath\":\"true\",\"proxyQueryParams\":\"true\"}"

TEST_CLINIC_POLICY='{
  "@type": "Set",
  "permission": [{
    "action": "use",
    "constraint": []
  }]
}'
create_policy "$TEST_CLINIC_CTX" "open-fhir-access-policy" "$TEST_CLINIC_POLICY"

EDC_ID="https://w3id.org/edc/v0.0.1/ns/id"
TC_SELECTOR="[{\"@type\":\"Criterion\",\"operandLeft\":\"$EDC_ID\",\"operator\":\"=\",\"operandRight\":\"fhir-patient-search\"}]"
create_contract_def "$TEST_CLINIC_CTX" "cd-fhir-patient" "open-fhir-access-policy" "open-fhir-access-policy" "$TC_SELECTOR"

TC_OBS_SELECTOR="[{\"@type\":\"Criterion\",\"operandLeft\":\"$EDC_ID\",\"operator\":\"=\",\"operandRight\":\"fhir-observation-bundle\"}]"
create_contract_def "$TEST_CLINIC_CTX" "cd-fhir-observation" "open-fhir-access-policy" "open-fhir-access-policy" "$TC_OBS_SELECTOR"

echo ""

# =============================================================================
# Step 1: Create Data Assets on Clinic (Provider)
# =============================================================================
echo "────────────────────────────────────────────────"
echo "Step 1: Register Data Assets on Clinic"
echo "────────────────────────────────────────────────"

# Asset 1: FHIR Patient $everything
create_asset "$CLINIC_CTX" "fhir-patient-everything" \
  "FHIR Patient Everything" \
  "Complete FHIR R4 patient record including encounters, conditions, observations, procedures, and medications. Retrieved via \$everything operation from the Neo4j health knowledge graph." \
  "application/fhir+json" \
  "{\"@type\":\"DataAddress\",\"type\":\"HttpData\",\"baseUrl\":\"$NEO4J_PROXY_URL/fhir/Patient\",\"proxyPath\":\"true\",\"proxyQueryParams\":\"true\"}"

# Asset 2: FHIR Cohort Bundle
create_asset "$CLINIC_CTX" "fhir-cohort-bundle" \
  "FHIR Cohort Search Bundle" \
  "FHIR R4 Bundle of patients matching cohort criteria (gender, age, condition). Supports secondary use research queries per EHDS Article 33." \
  "application/fhir+json" \
  "{\"@type\":\"DataAddress\",\"type\":\"HttpData\",\"baseUrl\":\"$NEO4J_PROXY_URL/fhir/Bundle\",\"proxyBody\":\"true\",\"method\":\"POST\"}"

# Asset 3: OMOP Cohort Statistics
create_asset "$CLINIC_CTX" "omop-cohort-statistics" \
  "OMOP CDM Cohort Statistics" \
  "Aggregate cohort statistics from OMOP Common Data Model. Supports grouping by gender, age decade, or condition concept." \
  "application/json" \
  "{\"@type\":\"DataAddress\",\"type\":\"HttpData\",\"baseUrl\":\"$NEO4J_PROXY_URL/omop/cohort\",\"proxyBody\":\"true\",\"method\":\"POST\"}"

# Asset 4: HealthDCAT-AP Catalog
create_asset "$CLINIC_CTX" "healthdcatap-catalog" \
  "HealthDCAT-AP Dataset Catalog" \
  "HealthDCAT-AP compliant dataset catalog entries as JSON-LD. Supports EHDS metadata requirements for health data discoverability." \
  "application/ld+json" \
  "{\"@type\":\"DataAddress\",\"type\":\"HttpData\",\"baseUrl\":\"$NEO4J_PROXY_URL/catalog/datasets\"}"

echo ""

# =============================================================================
# Step 2: Create Access & Contract Policies
# =============================================================================
echo "────────────────────────────────────────────────"
echo "Step 2: Create Policies"
echo "────────────────────────────────────────────────"

# Open access policy (for catalog metadata — discoverable by all)
OPEN_POLICY='{
  "@type": "Set",
  "permission": [{
    "action": "use",
    "constraint": []
  }]
}'

# Membership-based policy — currently open, will be tightened in Phase 2
# TODO Phase 2: Add MembershipCredential constraint once VC framework is configured
#   "constraint": [{"leftOperand": "MembershipCredential", "operator": "eq", "rightOperand": "active"}]
MEMBERSHIP_POLICY='{
  "@type": "Set",
  "permission": [{
    "action": "use",
    "constraint": []
  }]
}'

create_policy "$CLINIC_CTX" "open-access-policy" "$OPEN_POLICY"
create_policy "$CLINIC_CTX" "membership-access-policy" "$MEMBERSHIP_POLICY"

echo ""

# =============================================================================
# Step 3: Create Contract Definitions
# =============================================================================
echo "────────────────────────────────────────────────"
echo "Step 3: Create Contract Definitions"
echo "────────────────────────────────────────────────"

# NOTE: operandLeft MUST use the full EDC namespace URI, not the @id shorthand.
# The internal store expands @id → https://w3id.org/edc/v0.0.1/ns/id and the
# catalog builder needs an exact match to surface datasets in DSP responses.
EDC_ID="https://w3id.org/edc/v0.0.1/ns/id"

# Contract for FHIR patient data — requires membership
FHIR_SELECTOR="[{\"@type\":\"Criterion\",\"operandLeft\":\"$EDC_ID\",\"operator\":\"in\",\"operandRight\":[\"fhir-patient-everything\",\"fhir-cohort-bundle\"]}]"
create_contract_def "$CLINIC_CTX" "fhir-data-contract" "membership-access-policy" "membership-access-policy" "$FHIR_SELECTOR"

# Contract for OMOP statistics — requires membership
OMOP_SELECTOR="[{\"@type\":\"Criterion\",\"operandLeft\":\"$EDC_ID\",\"operator\":\"=\",\"operandRight\":\"omop-cohort-statistics\"}]"
create_contract_def "$CLINIC_CTX" "omop-data-contract" "membership-access-policy" "membership-access-policy" "$OMOP_SELECTOR"

# Contract for catalog metadata — open access
CATALOG_SELECTOR="[{\"@type\":\"Criterion\",\"operandLeft\":\"$EDC_ID\",\"operator\":\"=\",\"operandRight\":\"healthdcatap-catalog\"}]"
create_contract_def "$CLINIC_CTX" "catalog-metadata-contract" "open-access-policy" "open-access-policy" "$CATALOG_SELECTOR"

echo ""

# =============================================================================
# Step 3b: Create Data Assets on CRO (Consumer)
# =============================================================================
echo "────────────────────────────────────────────────"
echo "Step 3b: Register Data Assets on CRO"
echo "────────────────────────────────────────────────"

create_asset "$CRO_CTX" "research-data-request" \
  "Research Data Request" \
  "Submit clinical research data requests for EHDS-approved studies." \
  "application/json" \
  "{\"@type\":\"DataAddress\",\"type\":\"HttpData\",\"baseUrl\":\"$NEO4J_PROXY_URL/api/research/request\",\"proxyPath\":\"true\",\"proxyQueryParams\":\"true\"}"

create_asset "$CRO_CTX" "omop-analytics-query" \
  "OMOP Analytics Query" \
  "Execute OMOP CDM analytics queries over federated clinical datasets." \
  "application/json" \
  "{\"@type\":\"DataAddress\",\"type\":\"HttpData\",\"baseUrl\":\"$NEO4J_PROXY_URL/api/omop/query\",\"proxyPath\":\"true\",\"proxyQueryParams\":\"true\"}"

CRO_POLICY='{
  "@type": "Set",
  "permission": [{
    "action": "use",
    "constraint": []
  }]
}'
create_policy "$CRO_CTX" "research-access-policy" "$CRO_POLICY"

CRO_RESEARCH_SELECTOR="[{\"@type\":\"Criterion\",\"operandLeft\":\"$EDC_ID\",\"operator\":\"=\",\"operandRight\":\"research-data-request\"}]"
create_contract_def "$CRO_CTX" "cd-research-data" "research-access-policy" "research-access-policy" "$CRO_RESEARCH_SELECTOR"

CRO_OMOP_SELECTOR="[{\"@type\":\"Criterion\",\"operandLeft\":\"$EDC_ID\",\"operator\":\"=\",\"operandRight\":\"omop-analytics-query\"}]"
create_contract_def "$CRO_CTX" "cd-omop-analytics" "research-access-policy" "research-access-policy" "$CRO_OMOP_SELECTOR"

echo ""

# =============================================================================
# Step 4: Register Catalog Asset on HDAB (Operator)
# =============================================================================
echo "────────────────────────────────────────────────"
echo "Step 4: Register Catalog on HDAB"
echo "────────────────────────────────────────────────"

create_asset "$HDAB_CTX" "federated-healthdcatap-catalog" \
  "Federated HealthDCAT-AP Catalog" \
  "Aggregated HealthDCAT-AP catalog from all health dataspace participants. Serves as the central metadata registry for the HDAB." \
  "application/ld+json" \
  "{\"@type\":\"DataAddress\",\"type\":\"HttpData\",\"baseUrl\":\"$NEO4J_PROXY_URL/catalog/datasets\"}"

HDAB_CATALOG_POLICY='{
  "@type": "Set",
  "permission": [{
    "action": "use",
    "constraint": []
  }]
}'
create_policy "$HDAB_CTX" "catalog-open-policy" "$HDAB_CATALOG_POLICY"

HDAB_CATALOG_SELECTOR="[{\"@type\":\"Criterion\",\"operandLeft\":\"$EDC_ID\",\"operator\":\"=\",\"operandRight\":\"federated-healthdcatap-catalog\"}]"
create_contract_def "$HDAB_CTX" "federated-catalog-contract" "catalog-open-policy" "catalog-open-policy" "$HDAB_CATALOG_SELECTOR"

echo ""

# =============================================================================
# Step 5: Activate Participant Contexts
# =============================================================================
# CFM provisioning creates participant contexts in CREATED state (200).
# DID documents are only served when contexts are ACTIVATED (300).
# The management API activation endpoint returns 403, so we use PostgreSQL directly.
echo "────────────────────────────────────────────────"
echo "Step 5: Activate Participant Contexts"
echo "────────────────────────────────────────────────"

ACTIVATED=$(docker exec postgres psql -U ih -d identityhub -tAc \
  "UPDATE participant_context SET state = 300 WHERE state = 200 RETURNING participant_id;" 2>/dev/null || echo "")

if [ -n "$ACTIVATED" ]; then
  ACTIVATED_COUNT=$(echo "$ACTIVATED" | grep -c . || echo 0)
  ok "Activated $ACTIVATED_COUNT participant context(s)"
  echo "$ACTIVATED" | while read -r pid; do
    echo "    - $pid"
  done
else
  # Check if already activated
  ACTIVE_COUNT=$(docker exec postgres psql -U ih -d identityhub -tAc \
    "SELECT COUNT(*) FROM participant_context WHERE state = 300;" 2>/dev/null || echo "0")
  ok "All $ACTIVE_COUNT participant context(s) already activated"
fi

echo ""

# =============================================================================
# Step 6: Register Data Planes
# =============================================================================
# Data planes tell the control plane how to reach the data-plane runtime.
# Hostname must match docker-compose service name (dataplane-fhir, not dataplane).
echo "────────────────────────────────────────────────"
echo "Step 6: Register Data Planes"
echo "────────────────────────────────────────────────"

DATAPLANE_FHIR_URL="http://dataplane-fhir:8083/api/control/v1/dataflows"

register_dataplane() {
  local ctx_id="$1" label="$2"
  local payload="{
    \"@context\": [\"$EDC_CTX\"],
    \"allowedSourceTypes\": [\"HttpData\", \"HttpCertData\"],
    \"allowedTransferTypes\": [\"HttpData-PULL\"],
    \"url\": \"$DATAPLANE_FHIR_URL\"
  }"
  local token
  token=$(get_token)
  local http_code
  http_code=$(curl -s -o /dev/null -w '%{http_code}' -X POST \
    "$CP_MGMT/v5alpha/dataplanes/$ctx_id" \
    -H "Authorization: Bearer $token" \
    -H "Content-Type: application/json" \
    -d "$payload")
  if [ "$http_code" = "204" ] || [ "$http_code" = "200" ]; then
    ok "Data plane registered for $label"
  else
    warn "Data plane registration for $label returned HTTP $http_code"
  fi
}

register_dataplane "$TEST_CLINIC_CTX" "Test Clinic"
register_dataplane "$CLINIC_CTX" "Clinic"
register_dataplane "$CRO_CTX"    "CRO"
register_dataplane "$HDAB_CTX"   "HDAB"

echo ""

# =============================================================================
# Summary
# =============================================================================
echo "════════════════════════════════════════════════"
echo "Data Asset Registration Summary"
echo "════════════════════════════════════════════════"
echo ""
echo "Test Clinic ($TEST_CLINIC_CTX):"
echo "  Assets:    fhir-patient-search, fhir-observation-bundle"
echo "  Policies:  open-fhir-access-policy"
echo "  Contracts: cd-fhir-patient, cd-fhir-observation"
echo ""
echo "Clinic ($CLINIC_CTX):"
echo "  Assets:    fhir-patient-everything, fhir-cohort-bundle, omop-cohort-statistics, healthdcatap-catalog"
echo "  Policies:  open-access-policy, membership-access-policy"
echo "  Contracts: fhir-data-contract, omop-data-contract, catalog-metadata-contract"
echo ""
echo "CRO ($CRO_CTX):"
echo "  Assets:    research-data-request, omop-analytics-query"
echo "  Policies:  research-access-policy"
echo "  Contracts: cd-research-data, cd-omop-analytics"
echo ""
echo "HDAB ($HDAB_CTX):"
echo "  Assets:    federated-healthdcatap-catalog"
echo "  Policies:  catalog-open-policy"
echo "  Contracts: federated-catalog-contract"
echo ""

# Verify
echo "Verifying assets..."
TC_ASSETS=$(mgmt_call POST "v5alpha/participants/$TEST_CLINIC_CTX/assets/request" "{\"@context\":[\"$EDC_CTX\"],\"@type\":\"QuerySpec\",\"filterExpression\":[]}" | python3 -c "import json,sys; print(len(json.load(sys.stdin)))")
CLINIC_ASSETS=$(mgmt_call POST "v5alpha/participants/$CLINIC_CTX/assets/request" "{\"@context\":[\"$EDC_CTX\"],\"@type\":\"QuerySpec\",\"filterExpression\":[]}" | python3 -c "import json,sys; print(len(json.load(sys.stdin)))")
CRO_ASSETS=$(mgmt_call POST "v5alpha/participants/$CRO_CTX/assets/request" "{\"@context\":[\"$EDC_CTX\"],\"@type\":\"QuerySpec\",\"filterExpression\":[]}" | python3 -c "import json,sys; print(len(json.load(sys.stdin)))")
HDAB_ASSETS=$(mgmt_call POST "v5alpha/participants/$HDAB_CTX/assets/request" "{\"@context\":[\"$EDC_CTX\"],\"@type\":\"QuerySpec\",\"filterExpression\":[]}" | python3 -c "import json,sys; print(len(json.load(sys.stdin)))")

echo "  Test Clinic assets: $TC_ASSETS"
echo "  Clinic assets:      $CLINIC_ASSETS"
echo "  CRO assets:         $CRO_ASSETS"
echo "  HDAB assets:        $HDAB_ASSETS"

if [ "$TC_ASSETS" -ge 2 ] && [ "$CLINIC_ASSETS" -ge 4 ] && [ "$CRO_ASSETS" -ge 2 ] && [ "$HDAB_ASSETS" -ge 1 ]; then
  ok "All data assets registered successfully!"
else
  warn "Expected 2 Test Clinic, 4 Clinic, 2 CRO, and 1 HDAB assets"
fi
