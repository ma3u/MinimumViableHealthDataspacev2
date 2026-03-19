#!/usr/bin/env bash
# =============================================================================
# Phase 1b: Health-Specific Tenant Configuration
# =============================================================================
# Creates 5 health-domain tenants via CFM TenantManager and deploys
# participant profiles that trigger automated provisioning via CFM agents.
#
# Tenants (all fictional — see .github/copilot-instructions.md):
#   1. AlphaKlinik Berlin   (alpha-klinik)  — FHIR R4 data provider (DE)
#   2. PharmaCo Research AG  (pharmaco)      — OMOP research data consumer (DE)
#   3. MedReg DE             (medreg)        — HealthDCAT-AP catalog operator (DE)
#   4. Limburg Medical Centre (lmc)          — FHIR R4 data provider (NL)
#   5. Institut de Recherche Santé (irs)     — Research HDAB (FR)
#
# Prerequisites:
#   - All JAD services running (docker-compose.jad.yml)
#   - Seed data from jad/seed-jad.sh already applied
# =============================================================================
set -euo pipefail

# --- Configuration ---
TM_HOST="${TM_HOST:-http://localhost:11006}"
PM_HOST="${PM_HOST:-http://localhost:11007}"

# Known IDs from seed-jad.sh
CELL_ID="${CELL_ID:-}"
PROFILE_ID="${PROFILE_ID:-}"

# DID base — participants get did:web identifiers resolved via IdentityHub
DID_BASE="did:web:identityhub%3A7083"

# --- Colors ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ok()   { echo -e "${GREEN}✓${NC} $*"; }
warn() { echo -e "${YELLOW}⚠${NC} $*"; }
fail() { echo -e "${RED}✗${NC} $*"; exit 1; }

# --- Auto-discover Cell and Profile IDs if not set ---
discover_ids() {
  if [ -z "$CELL_ID" ]; then
    CELL_ID=$(curl -sf "$TM_HOST/api/v1alpha1/cells" | python3 -c "import json,sys; cells=json.load(sys.stdin); print(cells[0]['id'] if cells else '')" 2>/dev/null)
    [ -n "$CELL_ID" ] || fail "No cells found in TenantManager"
    ok "Discovered Cell ID: $CELL_ID"
  fi
  if [ -z "$PROFILE_ID" ]; then
    PROFILE_ID=$(curl -sf "$TM_HOST/api/v1alpha1/dataspace-profiles" | python3 -c "import json,sys; profiles=json.load(sys.stdin); print(profiles[0]['id'] if profiles else '')" 2>/dev/null)
    [ -n "$PROFILE_ID" ] || fail "No dataspace profiles found in TenantManager"
    ok "Discovered Profile ID: $PROFILE_ID"
  fi
}

# --- Create a tenant (idempotent — skip if displayName already exists) ---
# Usage: create_tenant <display_name> <properties_json>
# Returns: tenant ID (via TENANT_ID variable)
create_tenant() {
  local name="$1"
  local props="$2"

  # Check if tenant already exists by displayName
  local existing
  existing=$(curl -sf "$TM_HOST/api/v1alpha1/tenants" 2>/dev/null | python3 -c "
import json, sys
tenants = json.load(sys.stdin)
for t in tenants:
    if t.get('properties', {}).get('displayName') == '$name':
        print(t['id'])
        break
" 2>/dev/null || true)

  if [ -n "$existing" ]; then
    TENANT_ID="$existing"
    ok "Tenant '$name' already exists: $TENANT_ID (skipped)"
    return 0
  fi

  echo "Creating tenant: $name ..."
  local response
  response=$(curl -sf -X POST "$TM_HOST/api/v1alpha1/tenants" \
    -H "Content-Type: application/json" \
    -d "$props")

  TENANT_ID=$(echo "$response" | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")
  [ -n "$TENANT_ID" ] || fail "Failed to create tenant $name"
  ok "Tenant '$name' created: $TENANT_ID"
}

# --- Deploy a participant profile on a tenant (idempotent — skip if already deployed) ---
# Usage: deploy_participant <tenant_id> <display_name> <did_suffix> <roles_json>
# Returns: participant profile ID (via PARTICIPANT_ID variable)
deploy_participant() {
  local tenant_id="$1"
  local name="$2"
  local did_suffix="$3"
  local roles_json="$4"

  local identifier="${DID_BASE}:${did_suffix}"

  # Check if participant profile already exists for this tenant
  local existing
  existing=$(curl -sf "$TM_HOST/api/v1alpha1/tenants/${tenant_id}/participant-profiles" 2>/dev/null | python3 -c "
import json, sys
profiles = json.load(sys.stdin)
for p in profiles:
    if p.get('identifier') == '$identifier':
        print(p['id'])
        break
" 2>/dev/null || true)

  if [ -n "$existing" ]; then
    PARTICIPANT_ID="$existing"
    ok "Participant '$name' already deployed: $PARTICIPANT_ID (skipped)"
    return 0
  fi

  echo "Deploying participant '$name' (DID: $identifier) ..."
  local payload
  payload=$(python3 -c "
import json
data = {
    'identifier': '$identifier',
    'dataspaceProfileIds': ['$PROFILE_ID'],
    'participantRoles': $roles_json,
    'properties': {
        'displayName': '$name',
        'type': '$did_suffix'
    }
}
print(json.dumps(data))
")

  local response
  response=$(curl -sf -X POST "$TM_HOST/api/v1alpha1/tenants/${tenant_id}/participant-profiles" \
    -H "Content-Type: application/json" \
    -d "$payload")

  PARTICIPANT_ID=$(echo "$response" | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")
  [ -n "$PARTICIPANT_ID" ] || fail "Failed to deploy participant $name"

  local vpa_count
  vpa_count=$(echo "$response" | python3 -c "import json,sys; print(len(json.load(sys.stdin).get('vpas',[])))")
  ok "Participant '$name' deployed: $PARTICIPANT_ID ($vpa_count VPAs created)"
}

# --- Wait for all VPAs to become ACTIVE ---
# Usage: wait_for_active <tenant_id> <participant_id> <display_name> <timeout_seconds>
wait_for_active() {
  local tenant_id="$1"
  local participant_id="$2"
  local name="$3"
  local timeout="${4:-120}"

  echo "Waiting for participant '$name' VPAs to become ACTIVE (timeout: ${timeout}s) ..."
  local start=$SECONDS

  while (( SECONDS - start < timeout )); do
    local status
    status=$(curl -sf "$TM_HOST/api/v1alpha1/tenants/${tenant_id}/participant-profiles/${participant_id}" 2>/dev/null)

    local result
    result=$(echo "$status" | python3 -c "
import json, sys
data = json.load(sys.stdin)
vpas = data.get('vpas', [])
total = len(vpas)
active = sum(1 for v in vpas if v.get('state') == 'active')
error = data.get('error', False)
error_detail = data.get('errorDetail', '')
if error:
    print(f'ERROR:{error_detail}')
elif active == total and total > 0:
    print(f'DONE:{active}/{total}')
else:
    states = ', '.join(f\"{v.get('type','?')}={v.get('state','?')}\" for v in vpas)
    print(f'WAITING:{active}/{total} [{states}]')
" 2>/dev/null)

    case "$result" in
      DONE:*)
        ok "Participant '$name' — all VPAs ACTIVE (${result#DONE:})"
        return 0
        ;;
      ERROR:*)
        fail "Participant '$name' — provisioning ERROR: ${result#ERROR:}"
        ;;
      WAITING:*)
        echo "  ... $name: ${result#WAITING:}"
        ;;
    esac

    sleep 5
  done

  warn "Participant '$name' — timeout after ${timeout}s. Checking final state..."
  curl -sf "$TM_HOST/api/v1alpha1/tenants/${tenant_id}/participant-profiles/${participant_id}" | python3 -m json.tool
  return 1
}

# =============================================================================
# Main
# =============================================================================
echo "================================================"
echo "Phase 1b: Health-Specific Tenant Configuration"
echo "================================================"
echo ""

discover_ids

echo ""
echo "Using:"
echo "  Cell ID:    $CELL_ID"
echo "  Profile ID: $PROFILE_ID"
echo "  DID Base:   $DID_BASE"
echo ""

# --- Tenant 1: AlphaKlinik Berlin (Data Provider / DE) ---
echo "────────────────────────────────────────────────"
echo "Tenant 1/5: AlphaKlinik Berlin (Data Provider)"
echo "────────────────────────────────────────────────"
create_tenant "AlphaKlinik Berlin" '{"properties": {"displayName": "AlphaKlinik Berlin", "role": "provider", "organization": "AlphaKlinik Berlin — Universitätsklinikum", "ehdsParticipantType": "data-holder", "contactPerson": "Dr. Sophie Richter", "email": "data-office@alpha-klinik.de", "phone": "+49 30 4501-0", "website": "https://alpha-klinik.de", "address": "Augustenburger Platz 1", "city": "Berlin", "country": "DE", "postalCode": "13353"}}'

ALPHA_KLINIK_TENANT_ID="$TENANT_ID"

deploy_participant "$ALPHA_KLINIK_TENANT_ID" "AlphaKlinik Berlin" "alpha-klinik" \
  "{\"$PROFILE_ID\": [\"provider\"]}"

ALPHA_KLINIK_PARTICIPANT_ID="$PARTICIPANT_ID"

echo ""

# --- Tenant 2: PharmaCo Research AG (Data Consumer / DE) ---
echo "────────────────────────────────────────────────"
echo "Tenant 2/5: PharmaCo Research AG (Data Consumer)"
echo "────────────────────────────────────────────────"
create_tenant "PharmaCo Research AG" '{"properties": {"displayName": "PharmaCo Research AG", "role": "consumer", "organization": "PharmaCo Research AG — Clinical Trials Division", "ehdsParticipantType": "data-user", "contactPerson": "Dr. Klaus Berger", "email": "research-data@pharmaco.de", "phone": "+49 69 8100-0", "website": "https://pharmaco.de", "address": "Industriepark Hoechst G879", "city": "Frankfurt am Main", "country": "DE", "postalCode": "65926"}}'

PHARMACO_TENANT_ID="$TENANT_ID"

deploy_participant "$PHARMACO_TENANT_ID" "PharmaCo Research AG" "pharmaco" \
  "{\"$PROFILE_ID\": [\"consumer\"]}"

PHARMACO_PARTICIPANT_ID="$PARTICIPANT_ID"

echo ""

# --- Tenant 3: MedReg DE (Health Data Access Body / DE) ---
echo "────────────────────────────────────────────────"
echo "Tenant 3/5: MedReg DE (Catalog Operator)"
echo "────────────────────────────────────────────────"
create_tenant "MedReg DE" '{"properties": {"displayName": "MedReg DE", "role": "operator", "organization": "MedReg DE — Health Data Access Body", "ehdsParticipantType": "health-data-access-body", "contactPerson": "Anke Hoffmann", "email": "contact@medreg.de", "phone": "+49 228 3080-0", "website": "https://medreg.de", "address": "Friedrich-Ebert-Allee 38", "city": "Bonn", "country": "DE", "postalCode": "53113"}}'

MEDREG_TENANT_ID="$TENANT_ID"

deploy_participant "$MEDREG_TENANT_ID" "MedReg DE" "medreg" \
  "{\"$PROFILE_ID\": [\"operator\"]}"

MEDREG_PARTICIPANT_ID="$PARTICIPANT_ID"

echo ""

# --- Tenant 4: Limburg Medical Centre (Data Provider / NL) ---
echo "────────────────────────────────────────────────"
echo "Tenant 4/5: Limburg Medical Centre (Data Provider)"
echo "────────────────────────────────────────────────"
create_tenant "Limburg Medical Centre" '{"properties": {"displayName": "Limburg Medical Centre", "role": "provider", "organization": "Limburg Medical Centre — Academic Hospital", "ehdsParticipantType": "data-holder", "contactPerson": "Dr. Jan van der Berg", "email": "dataaccess@lmc.nl", "phone": "+31 77 320 5555", "website": "https://lmc.nl", "address": "Tegelseweg 210", "city": "Venlo", "country": "NL", "postalCode": "5912 BL"}}'

LMC_TENANT_ID="$TENANT_ID"

deploy_participant "$LMC_TENANT_ID" "Limburg Medical Centre" "lmc" \
  "{\"$PROFILE_ID\": [\"provider\"]}"

LMC_PARTICIPANT_ID="$PARTICIPANT_ID"

echo ""

# --- Tenant 5: Institut de Recherche Santé (Research HDAB / FR) ---
echo "────────────────────────────────────────────────"
echo "Tenant 5/5: Institut de Recherche Santé (Research HDAB)"
echo "────────────────────────────────────────────────"
create_tenant "Institut de Recherche Santé" '{"properties": {"displayName": "Institut de Recherche Santé", "role": "operator", "organization": "Institut de Recherche Santé — Research HDAB", "ehdsParticipantType": "health-data-access-body", "contactPerson": "Prof. Marie Leblanc", "email": "data@irs.fr", "phone": "+33 1 44 23 60 00", "website": "https://irs.fr", "address": "101 rue de Tolbiac", "city": "Paris", "country": "FR", "postalCode": "75013"}}' 

IRS_TENANT_ID="$TENANT_ID"

deploy_participant "$IRS_TENANT_ID" "Institut de Recherche Santé" "irs" \
  "{\"$PROFILE_ID\": [\"operator\"]}"

IRS_PARTICIPANT_ID="$PARTICIPANT_ID"

echo ""

# --- Wait for all participants to become ACTIVE ---
echo "════════════════════════════════════════════════"
echo "Waiting for provisioning to complete..."
echo "════════════════════════════════════════════════"
echo ""

FAILED=0
wait_for_active "$ALPHA_KLINIK_TENANT_ID" "$ALPHA_KLINIK_PARTICIPANT_ID" "AlphaKlinik Berlin" 180 || FAILED=1
wait_for_active "$PHARMACO_TENANT_ID" "$PHARMACO_PARTICIPANT_ID" "PharmaCo Research AG" 180 || FAILED=1
wait_for_active "$MEDREG_TENANT_ID" "$MEDREG_PARTICIPANT_ID" "MedReg DE" 180 || FAILED=1
wait_for_active "$LMC_TENANT_ID" "$LMC_PARTICIPANT_ID" "Limburg Medical Centre" 180 || FAILED=1
wait_for_active "$IRS_TENANT_ID" "$IRS_PARTICIPANT_ID" "Institut de Recherche Santé" 180 || FAILED=1

echo ""

# --- Summary ---
echo "════════════════════════════════════════════════"
echo "Phase 1b Summary"
echo "════════════════════════════════════════════════"
echo ""
echo "Tenants created:"
echo "  AlphaKlinik Berlin         : $ALPHA_KLINIK_TENANT_ID"
echo "  PharmaCo Research AG       : $PHARMACO_TENANT_ID"
echo "  MedReg DE                  : $MEDREG_TENANT_ID"
echo "  Limburg Medical Centre     : $LMC_TENANT_ID"
echo "  Institut de Recherche Santé: $IRS_TENANT_ID"
echo ""
echo "Participant DIDs:"
echo "  AlphaKlinik: ${DID_BASE}:alpha-klinik"
echo "  PharmaCo:    ${DID_BASE}:pharmaco"
echo "  MedReg:      ${DID_BASE}:medreg"
echo "  Limburg MC:  ${DID_BASE}:lmc"
echo "  IRS:         ${DID_BASE}:irs"
echo ""

if [ "$FAILED" -eq 0 ]; then
  ok "All 5 tenants provisioned successfully!"
  echo ""
  echo "Next steps:"
  echo "  1. Register NEO4J data assets on AlphaKlinik Berlin's EDC-V instance"
  echo "  2. Register HealthDCAT-AP catalog on MedReg DE's Federated Catalog"
  echo "  3. Issue Verifiable Credentials (Phase 2b)"
else
  warn "Some tenants did not reach ACTIVE state — check agent logs:"
  echo "  docker logs health-dataspace-cfm-edcv-agent"
  echo "  docker logs health-dataspace-cfm-keycloak-agent"
  echo "  docker logs health-dataspace-cfm-registration-agent"
  echo "  docker logs health-dataspace-cfm-onboarding-agent"
fi

echo ""
echo "Verify with:"
echo "  curl -s http://localhost:11006/api/v1alpha1/tenants | python3 -m json.tool"
