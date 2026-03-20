#!/usr/bin/env bash
# =============================================================================
# Health Dataspace v2 — End-to-End Test Runner
# =============================================================================
# Verifies the full dataspace stack is operational on localhost by checking:
#   A. Infrastructure health (Docker services, databases, endpoints)
#   B. Dataspace state (participants, credentials, assets, negotiations)
#   C. API routes (Next.js backend returns non-empty 200 responses)
#   D. Key data counts match expected values
#
# Usage:
#   ./scripts/run-e2e-tests.sh                # Run all tests
#   ./scripts/run-e2e-tests.sh --section A    # Run only infrastructure checks
#   ./scripts/run-e2e-tests.sh --section B    # Run only dataspace state checks
#   ./scripts/run-e2e-tests.sh --section C    # Run only API route checks
#   ./scripts/run-e2e-tests.sh --verbose      # Show response bodies on failure
#
# Prerequisites:
#   - Full JAD stack running (bootstrap-jad.sh)
#   - Dataspace seeded (seed-all.sh or bootstrap-jad.sh default)
#   - UI running for section C (cd ui && npm run dev)
# =============================================================================
set -uo pipefail

# --- Configuration ---
CP_HOST="${CP_HOST:-http://localhost:11003}"
DP_FHIR="${DP_FHIR:-http://localhost:11002}"
DP_OMOP="${DP_OMOP:-http://localhost:11012}"
IH_HOST="${IH_HOST:-http://localhost:11005}"
ISSUER="${ISSUER:-http://localhost:10013}"
KC_HOST="${KC_HOST:-http://localhost:8080}"
VAULT="${VAULT:-http://localhost:8200}"
NATS="${NATS:-http://localhost:8222}"
PROXY="${PROXY:-http://localhost:9090}"
UI_HOST="${UI_HOST:-http://localhost:3000}"

# --- Colors ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

PASS=0
FAIL=0
WARN=0
SKIP=0
VERBOSE=false
SECTION="ALL"
ERRORS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --section) SECTION="$(echo "$2" | tr '[:lower:]' '[:upper:]')"; shift 2 ;;
    --verbose) VERBOSE=true; shift ;;
    --help|-h)
      echo "Usage: $0 [--section A|B|C] [--verbose] [--help]"
      exit 0
      ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

pass() { ((PASS++)); echo -e "  ${GREEN}PASS${NC} $1"; }
fail() { ((FAIL++)); ERRORS+=("$1"); echo -e "  ${RED}FAIL${NC} $1"; }
warn() { ((WARN++)); echo -e "  ${YELLOW}WARN${NC} $1"; }
skip() { ((SKIP++)); echo -e "  ${BLUE}SKIP${NC} $1"; }

section() { echo -e "\n${BOLD}━━━ $1 ━━━${NC}"; }

# --- Helper: Get Keycloak token ---
get_token() {
  curl -sf -X POST "${KC_HOST}/realms/edcv/protocol/openid-connect/token" \
    -d "grant_type=client_credentials&client_id=admin&client_secret=edc-v-admin-secret" \
    | python3 -c "import json,sys; print(json.load(sys.stdin)['access_token'])" 2>/dev/null
}

# --- Helper: Check HTTP endpoint ---
check_endpoint() {
  local name="$1"
  local url="$2"
  local expected_code="${3:-200}"

  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null)
  if [ "$code" = "$expected_code" ]; then
    pass "$name ($url)"
  elif [ "$code" = "000" ]; then
    fail "$name — connection refused ($url)"
  else
    fail "$name — HTTP $code (expected $expected_code) ($url)"
  fi
}

# --- Helper: Check HTTP endpoint is reachable (any non-000 response = alive) ---
check_alive() {
  local name="$1"
  local url="$2"

  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null)
  if [ "$code" != "000" ]; then
    pass "$name (HTTP $code)"
  else
    fail "$name — connection refused ($url)"
  fi
}

# --- Helper: Check Docker container health ---
check_container() {
  local name="$1"
  local container="$2"

  local status
  status=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null)
  if [ "$status" = "healthy" ]; then
    pass "$name (healthy)"
  elif [ -z "$status" ]; then
    # No healthcheck defined — check running state
    local running
    running=$(docker inspect --format='{{.State.Running}}' "$container" 2>/dev/null)
    if [ "$running" = "true" ]; then
      pass "$name (running, no healthcheck)"
    else
      fail "$name — not running"
    fi
  else
    fail "$name — $status"
  fi
}

# --- Helper: Check HTTP endpoint returns non-empty JSON ---
check_api() {
  local name="$1"
  local url="$2"
  local token="${3:-}"

  local args=(-s -o /tmp/e2e_response -w "%{http_code}")
  [ -n "$token" ] && args+=(-H "Authorization: Bearer $token")
  args+=("$url")

  local code
  code=$(curl "${args[@]}" 2>/dev/null)
  local body_size
  body_size=$(wc -c < /tmp/e2e_response 2>/dev/null || echo "0")

  if [ "$code" = "200" ] && [ "$body_size" -gt 2 ]; then
    pass "$name (${body_size}B)"
  elif [ "$code" = "200" ] && [ "$body_size" -le 2 ]; then
    warn "$name — 200 but empty body"
  elif [ "$code" = "000" ]; then
    fail "$name — connection refused ($url)"
  else
    fail "$name — HTTP $code ($url)"
    if [ "$VERBOSE" = true ] && [ -f /tmp/e2e_response ]; then
      echo "    Response: $(head -c 200 /tmp/e2e_response)"
    fi
  fi
}

# --- Helper: SQL count check ---
check_sql_count() {
  local name="$1"
  local query="$2"
  local min_expected="$3"

  local count
  count=$(docker exec health-dataspace-postgres psql -U cp -d controlplane -tAc "$query" 2>/dev/null | tr -d '[:space:]')
  if [ -z "$count" ] || ! [[ "$count" =~ ^[0-9]+$ ]]; then
    fail "$name — query failed"
  elif [ "$count" -ge "$min_expected" ]; then
    pass "$name ($count >= $min_expected)"
  else
    fail "$name — got $count, expected >= $min_expected"
  fi
}

# =============================================================================
# Section A: Infrastructure Health
# =============================================================================
run_section_a() {
  section "A. Infrastructure Health"

  # Docker containers
  local running
  running=$(docker compose -f docker-compose.yml -f docker-compose.jad.yml ps --status running -q 2>/dev/null | wc -l | tr -d '[:space:]')
  if [ "$running" -ge 19 ]; then
    pass "Docker containers running ($running >= 19)"
  else
    fail "Docker containers running ($running < 19)"
  fi

  # Core infrastructure (public endpoints)
  check_endpoint "Vault health" "${VAULT}/v1/sys/health"
  check_endpoint "Keycloak realm" "${KC_HOST}/realms/edcv"
  check_endpoint "NATS health" "${NATS}/healthz"
  check_endpoint "Neo4j Query Proxy" "${PROXY}/health"

  # EDC services (check Docker health status — HTTP endpoints require auth)
  check_container "Control Plane" "health-dataspace-controlplane"
  check_container "Data Plane FHIR" "health-dataspace-dataplane-fhir"
  check_container "Data Plane OMOP" "health-dataspace-dataplane-omop"
  check_container "Identity Hub" "health-dataspace-identityhub"
  check_container "Issuer Service" "health-dataspace-issuerservice"
  check_container "Neo4j" "health-dataspace-neo4j"

  # PostgreSQL connectivity
  if docker exec health-dataspace-postgres psql -U cp -d controlplane -c "SELECT 1" > /dev/null 2>&1; then
    pass "PostgreSQL controlplane DB"
  else
    fail "PostgreSQL controlplane DB — connection failed"
  fi

  # Neo4j connectivity
  if docker exec health-dataspace-neo4j cypher-shell -u neo4j -p healthdataspace "RETURN 1" > /dev/null 2>&1; then
    pass "Neo4j Bolt connection"
  else
    fail "Neo4j Bolt connection — failed"
  fi

  # Keycloak token
  local token
  token=$(get_token 2>/dev/null)
  if [ -n "$token" ]; then
    pass "Keycloak OAuth2 token (admin client)"
  else
    fail "Keycloak OAuth2 token — could not obtain"
  fi
}

# =============================================================================
# Section B: Dataspace State
# =============================================================================
run_section_b() {
  section "B. Dataspace State"

  # Participant contexts
  check_sql_count "Participant contexts (ACTIVATED)" \
    "SELECT COUNT(*) FROM participant_context WHERE state = 200" 5

  # Verifiable Credentials
  local vc_count
  vc_count=$(docker exec health-dataspace-postgres psql -U ih -d identityhub -tAc \
    "SELECT COUNT(*) FROM credential_resource" 2>/dev/null | tr -d '[:space:]')
  if [ -n "$vc_count" ] && [ "$vc_count" -ge 10 ]; then
    pass "Verifiable Credentials ($vc_count >= 10)"
  elif [ -n "$vc_count" ]; then
    warn "Verifiable Credentials ($vc_count < 10)"
  else
    fail "Verifiable Credentials — query failed"
  fi

  # Data assets
  check_sql_count "Data assets registered" \
    "SELECT COUNT(*) FROM edc_asset" 9

  # Policy definitions
  check_sql_count "Policy definitions" \
    "SELECT COUNT(*) FROM edc_policydefinitions" 5

  # Contract definitions
  check_sql_count "Contract definitions" \
    "SELECT COUNT(*) FROM edc_contract_definitions" 5

  # Contract negotiations FINALIZED
  check_sql_count "Contract negotiations (FINALIZED)" \
    "SELECT COUNT(*) FROM edc_contract_negotiation WHERE state = 1200" 6

  # Transfers STARTED
  check_sql_count "Transfer processes (STARTED)" \
    "SELECT COUNT(*) FROM edc_transfer_process WHERE state = 600" 4

  # Data plane instances
  check_sql_count "Data plane instances" \
    "SELECT COUNT(DISTINCT id) FROM edc_data_plane_instance" 10

  # DID documents served (port 7083 is internal to Docker network)
  local did_ok=0
  for participant in alpha-klinik lmc pharmaco medreg irs; do
    if docker exec health-dataspace-identityhub \
      curl -sf "http://identityhub:7083/${participant}/did.json" 2>/dev/null | grep -q "verificationMethod"; then
      ((did_ok++))
    fi
  done
  if [ "$did_ok" -ge 5 ]; then
    pass "DID documents served ($did_ok/5)"
  else
    warn "DID documents served ($did_ok/5)"
  fi

  # Issuer DID (204 = service up but DID not yet provisioned)
  local iss_code
  iss_code=$(docker exec health-dataspace-issuerservice \
    curl -s -o /dev/null -w "%{http_code}" "http://localhost:10016/issuer/did.json" 2>/dev/null)
  if [ "$iss_code" = "200" ]; then
    pass "Issuer DID document"
  elif [ "$iss_code" = "204" ]; then
    warn "Issuer DID document — 204 (not yet provisioned)"
  else
    fail "Issuer DID document — HTTP $iss_code"
  fi
}

# =============================================================================
# Section C: API Route Verification
# =============================================================================
run_section_c() {
  section "C. API Routes (Next.js)"

  # Check if UI is running
  if ! curl -sf -o /dev/null "${UI_HOST}" 2>/dev/null; then
    warn "UI not running at ${UI_HOST} — skipping API tests"
    skip "All API route tests (UI not running)"
    return
  fi

  # Public API routes (no auth required or server-side auth)
  check_api "GET /api/graph"                  "${UI_HOST}/api/graph"
  check_api "GET /api/catalog"                "${UI_HOST}/api/catalog"
  check_api "GET /api/patient"                "${UI_HOST}/api/patient"
  check_api "GET /api/analytics"              "${UI_HOST}/api/analytics"
  check_api "GET /api/eehrxf"                 "${UI_HOST}/api/eehrxf"
  check_api "GET /api/compliance"             "${UI_HOST}/api/compliance"
  check_api "GET /api/assets"                 "${UI_HOST}/api/assets"
  check_api "GET /api/participants"           "${UI_HOST}/api/participants"
  check_api "GET /api/credentials"            "${UI_HOST}/api/credentials"
  check_api "GET /api/credentials/definitions" "${UI_HOST}/api/credentials/definitions"
  # Routes that require a participant context ID (UUID, not name)
  local ctx_id
  ctx_id=$(docker exec health-dataspace-postgres psql -U cp -d controlplane -tAc \
    "SELECT participant_context_id FROM participant_context WHERE identity LIKE '%alpha%' LIMIT 1" 2>/dev/null | tr -d '[:space:]')
  if [ -n "$ctx_id" ]; then
    check_api "GET /api/negotiations"           "${UI_HOST}/api/negotiations?participantId=${ctx_id}"
    check_api "GET /api/transfers"              "${UI_HOST}/api/transfers?participantId=${ctx_id}"
  else
    warn "Cannot determine alpha-klinik context ID — skipping negotiations/transfers"
  fi
  check_api "GET /api/tasks"                  "${UI_HOST}/api/tasks"
  check_api "GET /api/admin/tenants"          "${UI_HOST}/api/admin/tenants"
  check_api "GET /api/admin/policies"         "${UI_HOST}/api/admin/policies"
  check_api "GET /api/admin/components"       "${UI_HOST}/api/admin/components"
  check_api "GET /api/admin/audit"            "${UI_HOST}/api/admin/audit"
  check_api "GET /api/federated"              "${UI_HOST}/api/federated"
}

# =============================================================================
# Run Tests
# =============================================================================
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║   Health Dataspace v2 — End-to-End Tests                   ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

if [ "$SECTION" = "ALL" ] || [ "$SECTION" = "A" ]; then
  run_section_a
fi

if [ "$SECTION" = "ALL" ] || [ "$SECTION" = "B" ]; then
  run_section_b
fi

if [ "$SECTION" = "ALL" ] || [ "$SECTION" = "C" ]; then
  run_section_c
fi

# =============================================================================
# Summary
# =============================================================================
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║   E2E Test Summary                                        ║"
echo "╠══════════════════════════════════════════════════════════════╣"
printf "║  ${GREEN}PASS${NC}: %-3d  ${RED}FAIL${NC}: %-3d  ${YELLOW}WARN${NC}: %-3d  ${BLUE}SKIP${NC}: %-3d              ║\n" "$PASS" "$FAIL" "$WARN" "$SKIP"
echo "╚══════════════════════════════════════════════════════════════╝"

if [ ${#ERRORS[@]} -gt 0 ]; then
  echo ""
  echo -e "${RED}Failed tests:${NC}"
  for err in "${ERRORS[@]}"; do
    echo -e "  ${RED}x${NC} $err"
  done
fi

echo ""
if [ "$FAIL" -eq 0 ]; then
  echo -e "${GREEN}All tests passed!${NC}"
  exit 0
else
  echo -e "${RED}$FAIL test(s) failed.${NC}"
  exit 1
fi
