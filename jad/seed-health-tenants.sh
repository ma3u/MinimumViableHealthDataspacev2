#!/usr/bin/env bash
# =============================================================================
# Phase 1b: Health-Specific Tenant Configuration
# =============================================================================
# Creates 3 health-domain tenants via CFM TenantManager and deploys
# participant profiles that trigger automated provisioning via CFM agents.
#
# Tenants:
#   1. Clinic (clinic-riverside)  — FHIR R4 data provider
#   2. CRO   (cro-trialcorp)       — OMOP research data consumer
#   3. HDAB  (hdab-healthgov)      — HealthDCAT-AP catalog operator
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

# --- Create a tenant ---
# Usage: create_tenant <display_name> <properties_json>
# Returns: tenant ID (via TENANT_ID variable)
create_tenant() {
  local name="$1"
  local props="$2"

  echo "Creating tenant: $name ..."
  local response
  response=$(curl -sf -X POST "$TM_HOST/api/v1alpha1/tenants" \
    -H "Content-Type: application/json" \
    -d "$props")

  TENANT_ID=$(echo "$response" | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")
  [ -n "$TENANT_ID" ] || fail "Failed to create tenant $name"
  ok "Tenant '$name' created: $TENANT_ID"
}

# --- Deploy a participant profile on a tenant ---
# Usage: deploy_participant <tenant_id> <display_name> <did_suffix> <roles_json>
# Returns: participant profile ID (via PARTICIPANT_ID variable)
deploy_participant() {
  local tenant_id="$1"
  local name="$2"
  local did_suffix="$3"
  local roles_json="$4"

  local identifier="${DID_BASE}:${did_suffix}"

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

# --- Tenant 1: Clinic (Data Provider) ---
echo "────────────────────────────────────────────────"
echo "Tenant 1/3: Clinic Riverside (Data Provider)"
echo "────────────────────────────────────────────────"
create_tenant "Clinic Riverside" '{"properties": {"displayName": "Clinic Riverside", "role": "provider", "organization": "Riverside General Hospital", "ehdsParticipantType": "data-holder"}}'

CLINIC_TENANT_ID="$TENANT_ID"

deploy_participant "$CLINIC_TENANT_ID" "Clinic Riverside" "clinic-riverside" \
  "{\"$PROFILE_ID\": [\"provider\"]}"

CLINIC_PARTICIPANT_ID="$PARTICIPANT_ID"

echo ""

# --- Tenant 2: CRO (Data Consumer) ---
echo "────────────────────────────────────────────────"
echo "Tenant 2/3: CRO TrialCorp (Data Consumer)"
echo "────────────────────────────────────────────────"
create_tenant "CRO TrialCorp" '{"properties": {"displayName": "CRO TrialCorp", "role": "consumer", "organization": "TrialCorp AG — Clinical Research", "ehdsParticipantType": "data-user"}}'

CRO_TENANT_ID="$TENANT_ID"

deploy_participant "$CRO_TENANT_ID" "CRO TrialCorp" "cro-trialcorp" \
  "{\"$PROFILE_ID\": [\"consumer\"]}"

CRO_PARTICIPANT_ID="$PARTICIPANT_ID"

echo ""

# --- Tenant 3: HDAB (Health Data Access Body) ---
echo "────────────────────────────────────────────────"
echo "Tenant 3/3: HDAB HealthGov (Catalog Operator)"
echo "────────────────────────────────────────────────"
create_tenant "HDAB HealthGov" '{"properties": {"displayName": "HDAB HealthGov", "role": "operator", "organization": "HealthGov Data Access Authority", "ehdsParticipantType": "health-data-access-body"}}'

HDAB_TENANT_ID="$TENANT_ID"

deploy_participant "$HDAB_TENANT_ID" "HDAB HealthGov" "hdab-healthgov" \
  "{\"$PROFILE_ID\": [\"operator\"]}"

HDAB_PARTICIPANT_ID="$PARTICIPANT_ID"

echo ""

# --- Wait for all participants to become ACTIVE ---
echo "════════════════════════════════════════════════"
echo "Waiting for provisioning to complete..."
echo "════════════════════════════════════════════════"
echo ""

FAILED=0
wait_for_active "$CLINIC_TENANT_ID" "$CLINIC_PARTICIPANT_ID" "Clinic Riverside" 180 || FAILED=1
wait_for_active "$CRO_TENANT_ID" "$CRO_PARTICIPANT_ID" "CRO TrialCorp" 180 || FAILED=1
wait_for_active "$HDAB_TENANT_ID" "$HDAB_PARTICIPANT_ID" "HDAB HealthGov" 180 || FAILED=1

echo ""

# --- Summary ---
echo "════════════════════════════════════════════════"
echo "Phase 1b Summary"
echo "════════════════════════════════════════════════"
echo ""
echo "Tenants created:"
echo "  Clinic Riverside : $CLINIC_TENANT_ID"
echo "  CRO TrialCorp      : $CRO_TENANT_ID"
echo "  HDAB HealthGov     : $HDAB_TENANT_ID"
echo ""
echo "Participant DIDs:"
echo "  Clinic: ${DID_BASE}:clinic-riverside"
echo "  CRO:    ${DID_BASE}:cro-trialcorp"
echo "  HDAB:   ${DID_BASE}:hdab-healthgov"
echo ""

if [ "$FAILED" -eq 0 ]; then
  ok "All 3 tenants provisioned successfully!"
  echo ""
  echo "Next steps:"
  echo "  1. Register NEO4J data assets on Clinic's EDC-V instance"
  echo "  2. Register HealthDCAT-AP catalog on HDAB's Federated Catalog"
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
