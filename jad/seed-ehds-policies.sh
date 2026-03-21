#!/usr/bin/env bash
# =============================================================================
# Seed EHDS ODRL Policies on EDC-V Management API
# =============================================================================
# Creates EHDS-specific ODRL policies for all 5 participants.
# Policies reflect Article 53 secondary use purposes.
# =============================================================================
set -euo pipefail

CP_HOST="${CP_HOST:-http://localhost:11003}"
CP_MGMT="${CP_HOST}/api/mgmt"
KC_HOST="${KC_HOST:-http://localhost:8080}"
KC_REALM="edcv"
EDC_CTX="https://w3id.org/edc/connector/management/v2"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'
ok()   { echo -e "${GREEN}✓${NC} $*"; }
warn() { echo -e "${YELLOW}⚠${NC} $*"; }
fail() { echo -e "${RED}✗${NC} $*"; exit 1; }

get_token() {
  curl -sf -X POST "$KC_HOST/realms/$KC_REALM/protocol/openid-connect/token" \
    -d "grant_type=client_credentials&client_id=admin&client_secret=edc-v-admin-secret" \
    | python3 -c "import json,sys; print(json.load(sys.stdin)['access_token'])"
}

create_policy() {
  local ctx_id="$1"
  local policy_id="$2"
  local policy_json="$3"
  local token
  token=$(get_token)

  local payload
  payload=$(python3 -c "
import json
p = {
    '@context': ['$EDC_CTX'],
    '@type': 'PolicyDefinition',
    '@id': '$policy_id',
    'policy': $policy_json
}
print(json.dumps(p))
")

  local http_code response body
  response=$(curl -s -w '\n%{http_code}' -X POST "$CP_MGMT/v5alpha/participants/$ctx_id/policydefinitions" \
    -H "Authorization: Bearer $token" \
    -H "Content-Type: application/json" \
    -d "$payload")
  http_code=$(echo "$response" | tail -1)
  body=$(echo "$response" | sed '$d')

  if [ "$http_code" = "200" ] || [ "$http_code" = "204" ]; then
    ok "Policy '$policy_id' created"
  elif [ "$http_code" = "409" ]; then
    ok "Policy '$policy_id' already exists (idempotent)"
  else
    warn "Policy '$policy_id' HTTP $http_code: $body"
  fi
}

# Discover current participant context IDs from EDC-V
discover_ctx() {
  local slug="$1"
  local token
  token=$(get_token)
  curl -sf -H "Authorization: Bearer $token" "$CP_MGMT/v5alpha/participants" \
    | python3 -c "
import json, sys
slug = '$slug'
for p in json.load(sys.stdin):
    identity = p.get('identity', '')
    if slug in identity:
        print(p.get('@id', ''))
        sys.exit(0)
print('')
"
}

echo "================================================"
echo "Seed EHDS ODRL Policies"
echo "================================================"
echo ""

echo "Discovering participant contexts..."
AK_CTX=$(discover_ctx "alpha-klinik")
LMC_CTX=$(discover_ctx "lmc")
PC_CTX=$(discover_ctx "pharmaco")
MR_CTX=$(discover_ctx "medreg")
IRS_CTX=$(discover_ctx "irs")

echo "  AlphaKlinik: $AK_CTX"
echo "  LMC:         $LMC_CTX"
echo "  PharmaCo:    $PC_CTX"
echo "  MedReg:      $MR_CTX"
echo "  IRS:         $IRS_CTX"
echo ""

# -- Policy definitions (ODRL Set) --
# NOTE: EDC-V requires leftOperands to be bound to registered scope/function bindings.
# Custom EHDS leftOperands (purpose, patientConsent) are not yet configured,
# so all policies use open constraints for now. EHDS semantics are encoded in
# the policy IDs. Phase 2 will add proper scope bindings for purpose-based constraints.

OPEN_USE='{"@type":"Set","permission":[{"action":"use","constraint":[]}]}'

# -- AlphaKlinik Berlin (DATA_HOLDER) --
echo "── AlphaKlinik Berlin ──"
create_policy "$AK_CTX" "ehds-open-fhir-access"        "$OPEN_USE"
create_policy "$AK_CTX" "ehds-research-access-ak"       "$OPEN_USE"
create_policy "$AK_CTX" "ehds-crossborder-access-ak"    "$OPEN_USE"
echo ""

# -- Limburg Medical Centre (DATA_HOLDER) --
echo "── Limburg Medical Centre ──"
create_policy "$LMC_CTX" "ehds-open-catalog-access"     "$OPEN_USE"
create_policy "$LMC_CTX" "ehds-research-access-lmc"     "$OPEN_USE"
create_policy "$LMC_CTX" "ehds-public-health-access"    "$OPEN_USE"
create_policy "$LMC_CTX" "ehds-crossborder-access-lmc"  "$OPEN_USE"
echo ""

# -- PharmaCo Research AG (DATA_USER) --
echo "── PharmaCo Research AG ──"
create_policy "$PC_CTX" "ehds-research-access-pc"       "$OPEN_USE"
create_policy "$PC_CTX" "ehds-ai-training-access-pc"    "$OPEN_USE"
echo ""

# -- MedReg DE (HDAB) --
echo "── MedReg DE ──"
create_policy "$MR_CTX" "ehds-regulatory-access-mr"     "$OPEN_USE"
create_policy "$MR_CTX" "ehds-statistics-access-mr"     "$OPEN_USE"
create_policy "$MR_CTX" "ehds-catalog-open-mr"          "$OPEN_USE"
echo ""

# -- Institut de Recherche Santé (HDAB) --
echo "── Institut de Recherche Santé ──"
create_policy "$IRS_CTX" "ehds-research-access-irs"     "$OPEN_USE"
create_policy "$IRS_CTX" "ehds-statistics-access-irs"   "$OPEN_USE"
echo ""

# Verify counts
echo "── Verify policy counts ──"
TOKEN=$(get_token)
for ctx_label in "$AK_CTX:AlphaKlinik" "$LMC_CTX:LMC" "$PC_CTX:PharmaCo" "$MR_CTX:MedReg" "$IRS_CTX:IRS"; do
  ctx="${ctx_label%%:*}"
  label="${ctx_label##*:}"
  count=$(curl -sf -X POST "$CP_MGMT/v5alpha/participants/$ctx/policydefinitions/request" \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d "{\"@context\":[\"$EDC_CTX\"],\"@type\":\"QuerySpec\",\"filterExpression\":[]}" \
    | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else 0)" 2>/dev/null)
  echo "  $label: $count policies"
done

echo ""
echo "Done."
