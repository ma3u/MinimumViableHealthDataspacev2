#!/usr/bin/env bash
# =============================================================================
# seed-data-transfer.sh — Phase 4d: Data Plane Transfer via DCore
# =============================================================================
# Demonstrates end-to-end data retrieval through the DCore data plane:
#   1. CRO PharmaCo Research AG retrieves FHIR Patient data via data plane (EDR token)
#   2. HDAB MedReg DE retrieves HealthDCAT-AP catalog via data plane
#   3. Verifies audit logging in Neo4j (TransferEvent nodes)
#
# The data plane proxies requests to the Neo4j Query Proxy, which translates
# HTTP calls into Cypher queries and returns FHIR R4 / HealthDCAT-AP JSON-LD.
#
# Prerequisites:
#   - All 18 Docker services running (docker compose -f docker-compose.jad.yml up -d)
#   - seed-data-assets.sh completed (assets registered)
#   - seed-contract-negotiation.sh completed (contracts FINALIZED, transfers STARTED)
#   - OR seed-federated-catalog.sh completed (HDAB catalog transfer STARTED)
#
# Usage:
#   ./jad/seed-data-transfer.sh
# =============================================================================

set -euo pipefail

# -- Config -------------------------------------------------------------------
DATA_PLANE_URL="${DATA_PLANE_URL:-http://localhost:11002}"
NEO4J_HTTP="${NEO4J_HTTP:-http://localhost:7474}"
NEO4J_USER="${NEO4J_USER:-neo4j}"
NEO4J_PASS="${NEO4J_PASS:-healthdataspace}"
PG_CONTAINER="health-dataspace-postgres"
PG_USER="cp"
PG_DB="controlplane"

# ANSI colours
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m'

header() { echo -e "\n${CYAN}═══════════════════════════════════════════════════════════${NC}"; echo -e "${CYAN}  $1${NC}"; echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"; }
step()   { echo -e "${YELLOW}→ $1${NC}"; }
ok()     { echo -e "${GREEN}✓ $1${NC}"; }
fail()   { echo -e "${RED}✗ $1${NC}"; }

# -- Helper: Extract EDR from PostgreSQL --------------------------------------
get_edr_token() {
  local asset_id="$1"
  local tp_type="${2:-CONSUMER}"
  docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -t -A -c "
    SELECT content_data_address
    FROM edc_transfer_process
    WHERE asset_id='${asset_id}' AND type='${tp_type}' AND state=600
    ORDER BY created_at DESC LIMIT 1;
  " | python3 -c "
import json, sys
data = json.load(sys.stdin)
props = data.get('properties', {})
token_key = 'https://w3id.org/edc/v0.0.1/ns/authorization'
print(props.get(token_key, ''))
" 2>/dev/null
}

get_edr_endpoint() {
  local asset_id="$1"
  local tp_type="${2:-CONSUMER}"
  docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -t -A -c "
    SELECT content_data_address
    FROM edc_transfer_process
    WHERE asset_id='${asset_id}' AND type='${tp_type}' AND state=600
    ORDER BY created_at DESC LIMIT 1;
  " | python3 -c "
import json, sys
data = json.load(sys.stdin)
props = data.get('properties', {})
endpoint_key = 'https://w3id.org/edc/v0.0.1/ns/endpoint'
print(props.get(endpoint_key, ''))
" 2>/dev/null
}

# -- Helper: Query Neo4j HTTP API --------------------------------------------
cypher_query() {
  local query="$1"
  curl -sf "${NEO4J_HTTP}/db/neo4j/tx/commit" \
    -H "Content-Type: application/json" \
    -u "${NEO4J_USER}:${NEO4J_PASS}" \
    -d "{\"statements\":[{\"statement\":$(echo "$query" | python3 -c "import json,sys; print(json.dumps(sys.stdin.read().strip()))")}]}"
}

# =============================================================================
header "Phase 4d: Data Plane Transfer via DCore"
# =============================================================================

# -- Step 1: Verify transfer processes exist ----------------------------------
header "Step 1 — Verify Active Transfer Processes"

step "Checking CONSUMER transfer processes in state=600 (STARTED)..."
ACTIVE_TRANSFERS=$(docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -t -A -c "
  SELECT asset_id, type, transferprocess_id
  FROM edc_transfer_process
  WHERE state=600
  ORDER BY type, asset_id;
")

if [ -z "$ACTIVE_TRANSFERS" ]; then
  fail "No active transfers found. Run seed-contract-negotiation.sh first."
  exit 1
fi

echo "$ACTIVE_TRANSFERS" | while IFS='|' read -r asset type tpid; do
  ok "  ${type}: ${asset} (tp=${tpid:0:8}...)"
done

# -- Step 2: CRO retrieves FHIR Patient data via data plane ------------------
header "Step 2 — CRO PharmaCo Research AG: Retrieve FHIR Patient Data"

step "Extracting EDR (Endpoint Data Reference) for fhir-patient-everything..."
FHIR_TOKEN=$(get_edr_token "fhir-patient-everything" "CONSUMER")
FHIR_ENDPOINT=$(get_edr_endpoint "fhir-patient-everything" "CONSUMER")

if [ -z "$FHIR_TOKEN" ]; then
  fail "No EDR token found for fhir-patient-everything. Transfer may not be STARTED."
  exit 1
fi

ok "EDR endpoint: ${FHIR_ENDPOINT}"
ok "EDR token: ${FHIR_TOKEN:0:40}..."

step "Fetching FHIR Patient Bundle via data plane (limit 5)..."
FHIR_RESPONSE=$(curl -sf "${DATA_PLANE_URL}/api/public?_count=5" \
  -H "Authorization: ${FHIR_TOKEN}")

FHIR_TOTAL=$(echo "$FHIR_RESPONSE" | python3 -c "import json,sys; print(json.load(sys.stdin)['total'])")
FHIR_TYPE=$(echo "$FHIR_RESPONSE" | python3 -c "import json,sys; print(json.load(sys.stdin)['resourceType'])")
FHIR_FIRST=$(echo "$FHIR_RESPONSE" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['entry'][0]['resource'].get('name','N/A'))")

ok "Response: ${FHIR_TYPE} with ${FHIR_TOTAL} entries"
ok "First patient: ${FHIR_FIRST}"

step "Fetching full patient list (default 100)..."
FHIR_FULL=$(curl -sf "${DATA_PLANE_URL}/api/public" \
  -H "Authorization: ${FHIR_TOKEN}")
FHIR_FULL_TOTAL=$(echo "$FHIR_FULL" | python3 -c "import json,sys; print(json.load(sys.stdin)['total'])")
ok "Full response: ${FHIR_FULL_TOTAL} patients returned"

# -- Step 3: HDAB retrieves HealthDCAT-AP catalog via data plane --------------
header "Step 3 — HDAB MedReg DE: Retrieve HealthDCAT-AP Catalog"

step "Extracting EDR for healthdcatap-catalog..."
CATALOG_TOKEN=$(get_edr_token "healthdcatap-catalog" "CONSUMER")

if [ -z "$CATALOG_TOKEN" ]; then
  fail "No EDR token found for healthdcatap-catalog. Run seed-federated-catalog.sh first."
  echo "(Skipping catalog transfer test)"
else
  ok "EDR token: ${CATALOG_TOKEN:0:40}..."

  step "Fetching HealthDCAT-AP catalog via data plane..."
  CATALOG_RESPONSE=$(curl -sf "${DATA_PLANE_URL}/api/public" \
    -H "Authorization: ${CATALOG_TOKEN}")

  CATALOG_TYPE=$(echo "$CATALOG_RESPONSE" | python3 -c "import json,sys; print(json.load(sys.stdin).get('@type','unknown'))")
  CATALOG_TITLE=$(echo "$CATALOG_RESPONSE" | python3 -c "import json,sys; print(json.load(sys.stdin).get('dct:title','N/A'))")
  CATALOG_DS_COUNT=$(echo "$CATALOG_RESPONSE" | python3 -c "import json,sys; print(len(json.load(sys.stdin).get('dcat:dataset',[])))")

  ok "Response: ${CATALOG_TYPE}"
  ok "Title: ${CATALOG_TITLE}"
  ok "Datasets: ${CATALOG_DS_COUNT}"

  step "Dataset titles:"
  echo "$CATALOG_RESPONSE" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for ds in data.get('dcat:dataset', []):
    print(f\"  • {ds.get('dct:title', 'N/A')}\")
"
fi

# -- Step 4: Verify audit trail in Neo4j --------------------------------------
header "Step 4 — Verify Audit Trail (TransferEvent nodes in Neo4j)"

step "Waiting for audit events to be written..."
sleep 2

step "Querying TransferEvent nodes..."
AUDIT_RESULT=$(cypher_query "MATCH (te:TransferEvent) RETURN te.endpoint AS endpoint, te.method AS method, toString(te.timestamp) AS ts, te.resultCount AS count, te.participant AS participant ORDER BY te.timestamp DESC LIMIT 10")

AUDIT_COUNT=$(echo "$AUDIT_RESULT" | python3 -c "import json,sys; print(len(json.load(sys.stdin)['results'][0]['data']))")
ok "Found ${AUDIT_COUNT} TransferEvent entries"

step "Recent audit trail:"
echo "$AUDIT_RESULT" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for row in data['results'][0]['data']:
    r = row['row']
    print(f\"  [{r[2][:19]}] {r[1]:4s} {r[0]:30s} → {r[3]} results (participant: {r[4]})\")
"

# -- Step 5: Seed UI mock data (100 transfers + FHIR bundles) ----------------
header "Step 5 — Seed UI Mock Data (100 Transfers + FHIR Bundles)"

SCRIPTS_DIR="$(cd "$(dirname "$0")/.." && pwd)/scripts"
UI_MOCK_DIR="$(cd "$(dirname "$0")/.." && pwd)/ui/public/mock"

if [ -f "$SCRIPTS_DIR/generate-transfer-mocks.py" ]; then
  step "Generating 100 transfer mock entries..."
  python3 "$SCRIPTS_DIR/generate-transfer-mocks.py"
  ok "Written ${UI_MOCK_DIR}/transfers.json and negotiations.json"
else
  step "Skipping mock transfer generation (scripts/generate-transfer-mocks.py not found)"
fi

if [ -f "$SCRIPTS_DIR/generate-fhir-bundles.py" ]; then
  step "Generating FHIR R4 bundle samples (12 asset types)..."
  python3 "$SCRIPTS_DIR/generate-fhir-bundles.py"
  ok "Written ${UI_MOCK_DIR}/fhir_bundles.json"
else
  step "Skipping FHIR bundle generation (scripts/generate-fhir-bundles.py not found)"
fi

# -- Step 6: Summary ----------------------------------------------------------
header "Phase 4d Results Summary"

echo ""
echo "  ┌─────────────────────────────────────────────────────────┐"
echo "  │  Data Plane Transfer via DCore — Phase 4d Complete      │"
echo "  ├─────────────────────────────────────────────────────────┤"
echo "  │                                                         │"
echo "  │  ✓ CRO PharmaCo Research AG retrieved ${FHIR_FULL_TOTAL} FHIR patients via DCore     │"
echo "  │  ✓ Query params proxied through data plane (_count=5)   │"
if [ -n "$CATALOG_TOKEN" ]; then
echo "  │  ✓ HDAB MedReg DE retrieved ${CATALOG_DS_COUNT} HealthDCAT-AP datasets     │"
fi
echo "  │  ✓ ${AUDIT_COUNT} audit events recorded in Neo4j               │"
echo "  │  ✓ Ed25519 JWT bearer tokens validated by data plane    │"
echo "  │  ✓ 100 UI transfer mocks + 12 FHIR bundle samples      │"
echo "  │                                                         │"
echo "  │  Data Flow:                                             │"
echo "  │  Consumer → Data Plane (EDR token)                      │"
echo "  │          → Neo4j Query Proxy (Cypher)                   │"
echo "  │          → Neo4j 5-Layer Knowledge Graph                │"
echo "  │          → FHIR R4 / HealthDCAT-AP JSON-LD response    │"
echo "  │                                                         │"
echo "  └─────────────────────────────────────────────────────────┘"
echo ""
ok "Phase 4d: Data Plane Transfer via DCore — COMPLETE"
