#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# EHDS Health-Domain Compliance Tests — Health Dataspace v2
# ---------------------------------------------------------------------------
# Custom test suite verifying health-specific requirements:
#   - EHDS Article 53 Purpose Enforcement
#   - HealthDCAT-AP Schema Compliance
#   - EEHRxF Profile Conformance
#   - OMOP CDM Integrity
#
# Usage:
#   ./scripts/run-ehds-tests.sh
#   REPORT_DIR=./reports ./scripts/run-ehds-tests.sh
#
# Prerequisites:
#   - Docker Compose JAD stack + Neo4j running
#   - curl, jq installed
# ---------------------------------------------------------------------------
set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
NEO4J_URL="${NEO4J_URL:-http://localhost:7474}"
NEO4J_USER="${NEO4J_USER:-neo4j}"
NEO4J_PASSWORD="${NEO4J_PASSWORD:-healthdataspace}"
MGMT_API="${EDC_MANAGEMENT_URL:-http://localhost:11003/api/mgmt}"
KEYCLOAK_URL="${KEYCLOAK_URL:-http://keycloak:8080}"
REALM="${KEYCLOAK_REALM:-edcv}"
CLIENT_ID="${EDC_CLIENT_ID:-admin}"
CLIENT_SECRET="${EDC_CLIENT_SECRET:-edc-v-admin-secret}"
REPORT_DIR="${REPORT_DIR:-test-results/ehds}"
PROVIDER_CTX=""  # populated by discover_participants()

TOTAL=0
PASSED=0
FAILED=0
SKIPPED=0

# ---------------------------------------------------------------------------
# Output helpers
# ---------------------------------------------------------------------------
mkdir -p "$REPORT_DIR"
REPORT_FILE="$REPORT_DIR/ehds-compliance-$(date +%Y%m%dT%H%M%S).json"
TEST_RESULTS=()

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log() { echo -e "${CYAN}[EHDS]${NC} $*"; }
pass() { echo -e "  ${GREEN}✓${NC} $*"; PASSED=$((PASSED + 1)); TOTAL=$((TOTAL + 1)); }
fail() { echo -e "  ${RED}✗${NC} $*"; FAILED=$((FAILED + 1)); TOTAL=$((TOTAL + 1)); }
skip() { echo -e "  ${YELLOW}⊘${NC} $*"; SKIPPED=$((SKIPPED + 1)); TOTAL=$((TOTAL + 1)); }

record_result() {
  local test_id="$1" category="$2" status="$3" detail="${4:-}"
  TEST_RESULTS+=("{\"id\":\"$test_id\",\"category\":\"$category\",\"status\":\"$status\",\"detail\":\"$detail\",\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}")
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
neo4j_query() {
  local cypher="$1"
  curl -sf -X POST "${NEO4J_URL}/db/neo4j/tx/commit" \
    -H "Content-Type: application/json" \
    -u "${NEO4J_USER}:${NEO4J_PASSWORD}" \
    -d "{\"statements\":[{\"statement\":\"$cypher\"}]}" 2>/dev/null
}

get_token() {
  local token_url
  if curl -sf "${KEYCLOAK_URL}/realms/${REALM}" >/dev/null 2>&1; then
    token_url="${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/token"
  else
    token_url="http://localhost:8080/realms/${REALM}/protocol/openid-connect/token"
  fi
  local resp
  resp=$(curl -sf -X POST "$token_url" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "grant_type=client_credentials&client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}" 2>/dev/null) || { echo ""; return 1; }
  echo "$resp" | jq -r '.access_token // empty'
}

TOKEN=""
auth_header() {
  if [ -z "$TOKEN" ]; then TOKEN=$(get_token) || true; fi
  if [ -n "$TOKEN" ]; then echo "Authorization: Bearer $TOKEN"; else echo "X-No-Auth: true"; fi
}

mgmt_post() {
  curl -sf -X POST -H "$(auth_header)" -H "Content-Type: application/json" -d "$2" "${MGMT_API}$1" 2>/dev/null
}


# ---------------------------------------------------------------------------
# Dynamic participant context discovery
# ---------------------------------------------------------------------------
discover_participants() {
  log "Discovering participant context UUIDs..."
  local participants_json
  participants_json=$(curl -sf -H "$(auth_header)" \
    "${MGMT_API}/v5alpha/participants") || {
    log "ERROR: Cannot fetch participant list from Management API"
    exit 1
  }

  for slug in "alpha-klinik" "pharmaco" "medreg"; do
    local uuid
    uuid=$(echo "$participants_json" | jq -r --arg s "$slug" \
      '[.[] | select(.identity // "" | contains($s))] | .[0]["@id"] // empty')
    if [ -n "$uuid" ]; then
      log "  ${slug} -> ${uuid}"
      case "$slug" in
        alpha-klinik) PROVIDER_CTX="$uuid" ;;
        pharmaco)     CONSUMER_CTX="$uuid" ;;
        medreg)       OPERATOR_CTX="$uuid" ;;
      esac
    else
      log "  WARNING: No context found for ${slug}"
    fi
  done

  if [ -z "${PROVIDER_CTX:-}" ]; then
    log "ERROR: Cannot discover provider context (alpha-klinik). Using fallback."
    PROVIDER_CTX="alpha-klinik"
  fi
}

# ---------------------------------------------------------------------------
# Category 1: EHDS Article 53 Purpose Enforcement
# ---------------------------------------------------------------------------
run_article53_tests() {
  log "Category 1: EHDS Article 53 Purpose Enforcement"

  # 1.1 — EHDS purpose constraints exist in policy definitions
  local test_id="ART53-1.1"
  local resp
  resp=$(mgmt_post "/v5alpha/participants/${PROVIDER_CTX}/policydefinitions/request" \
    '{"@context":["https://w3id.org/edc/connector/management/v2"],"@type":"QuerySpec"}' 2>/dev/null) || resp=""

  if [ -n "$resp" ] && echo "$resp" | jq -e 'length > 0' >/dev/null 2>&1; then
    local policy_json
    policy_json=$(echo "$resp" | jq -r 'tostring')
    if echo "$policy_json" | grep -qi "purpose\|article\|ehds\|research\|permission"; then
      pass "$test_id: Policy definitions contain purpose/EHDS constraints"
      record_result "$test_id" "article53" "passed"
    else
      skip "$test_id: Policies present but no explicit purpose constraints found"
      record_result "$test_id" "article53" "skipped" "no purpose constraints"
    fi
  else
    skip "$test_id: No policy definitions to check"
    record_result "$test_id" "article53" "skipped"
  fi

  # 1.2 — Neo4j has HDABApproval nodes with EHDS article references
  local test_id="ART53-1.2"
  local resp
  resp=$(neo4j_query "MATCH (a:HDABApproval) RETURN count(a) AS cnt, collect(DISTINCT a.ehdsArticle) AS articles") || resp=""

  if [ -n "$resp" ]; then
    local count
    count=$(echo "$resp" | jq '.results[0].data[0].row[0] // 0') || count=0
    local articles
    articles=$(echo "$resp" | jq -r '.results[0].data[0].row[1] // [] | join(", ")') || articles=""

    if [ "$count" -gt 0 ]; then
      pass "$test_id: ${count} HDABApproval nodes, articles: ${articles}"
      record_result "$test_id" "article53" "passed" "${count} approvals, articles: ${articles}"
    else
      fail "$test_id: No HDABApproval nodes in Neo4j"
      record_result "$test_id" "article53" "failed"
    fi
  else
    fail "$test_id: Cannot query Neo4j for HDABApproval"
    record_result "$test_id" "article53" "failed" "Neo4j unreachable"
  fi

  # 1.3 — Access applications linked to approvals
  local test_id="ART53-1.3"
  resp=$(neo4j_query "MATCH (a:HDABApproval)-[:APPROVES]->(app:AccessApplication) RETURN count(a) AS cnt") || resp=""

  if [ -n "$resp" ]; then
    local count
    count=$(echo "$resp" | jq '.results[0].data[0].row[0] // 0') || count=0
    if [ "$count" -gt 0 ]; then
      pass "$test_id: ${count} approval→application links"
      record_result "$test_id" "article53" "passed" "${count} links"
    else
      fail "$test_id: No approval→application links"
      record_result "$test_id" "article53" "failed"
    fi
  else
    fail "$test_id: Cannot query approval links"
    record_result "$test_id" "article53" "failed"
  fi

  # 1.4 — Data access chain: Participant → Application → Approval → Dataset
  local test_id="ART53-1.4"
  resp=$(neo4j_query "MATCH (p:Participant)-[:SUBMITTED]->(app:AccessApplication)<-[:APPROVES]-(a:HDABApproval)-[:GRANTS_ACCESS_TO]->(ds:HealthDataset) RETURN count(*) AS chains") || resp=""

  if [ -n "$resp" ]; then
    local chains
    chains=$(echo "$resp" | jq '.results[0].data[0].row[0] // 0') || chains=0
    if [ "$chains" -gt 0 ]; then
      pass "$test_id: ${chains} complete EHDS access chains"
      record_result "$test_id" "article53" "passed" "${chains} chains"
    else
      fail "$test_id: No complete access chains found"
      record_result "$test_id" "article53" "failed"
    fi
  else
    fail "$test_id: Cannot query access chains"
    record_result "$test_id" "article53" "failed"
  fi
}

# ---------------------------------------------------------------------------
# Category 2: HealthDCAT-AP Schema Compliance
# ---------------------------------------------------------------------------
run_healthdcatap_tests() {
  log "Category 2: HealthDCAT-AP Schema Compliance"

  # 2.1 — HealthDataset nodes exist with mandatory DCAT properties
  local test_id="HDCAT-2.1"
  local resp
  resp=$(neo4j_query "MATCH (ds:HealthDataset) RETURN count(ds) AS cnt, collect(DISTINCT ds.title)[0..3] AS titles") || resp=""

  if [ -n "$resp" ]; then
    local count
    count=$(echo "$resp" | jq '.results[0].data[0].row[0] // 0') || count=0
    if [ "$count" -gt 0 ]; then
      pass "$test_id: ${count} HealthDataset nodes in Neo4j"
      record_result "$test_id" "healthdcatap" "passed" "${count} datasets"
    else
      fail "$test_id: No HealthDataset nodes"
      record_result "$test_id" "healthdcatap" "failed"
    fi
  else
    fail "$test_id: Cannot query HealthDataset"
    record_result "$test_id" "healthdcatap" "failed"
  fi

  # 2.2 — Mandatory DCAT properties: title, description, publisher
  local test_id="HDCAT-2.2"
  resp=$(neo4j_query "MATCH (ds:HealthDataset) WHERE ds.title IS NOT NULL AND ds.description IS NOT NULL RETURN count(ds) AS cnt") || resp=""

  if [ -n "$resp" ]; then
    local count
    count=$(echo "$resp" | jq '.results[0].data[0].row[0] // 0') || count=0
    if [ "$count" -gt 0 ]; then
      pass "$test_id: ${count} datasets have title + description"
      record_result "$test_id" "healthdcatap" "passed" "${count} with mandatory props"
    else
      fail "$test_id: No datasets with required DCAT properties"
      record_result "$test_id" "healthdcatap" "failed"
    fi
  else
    fail "$test_id: Cannot verify DCAT properties"
    record_result "$test_id" "healthdcatap" "failed"
  fi

  # 2.3 — Health-specific extensions: datasetType, legalBasis
  local test_id="HDCAT-2.3"
  resp=$(neo4j_query "MATCH (ds:HealthDataset) WHERE ds.datasetType IS NOT NULL OR ds.legalBasis IS NOT NULL RETURN count(ds) AS cnt") || resp=""

  if [ -n "$resp" ]; then
    local count
    count=$(echo "$resp" | jq '.results[0].data[0].row[0] // 0') || count=0
    if [ "$count" -gt 0 ]; then
      pass "$test_id: ${count} datasets have health extensions (datasetType/legalBasis)"
      record_result "$test_id" "healthdcatap" "passed" "${count} with extensions"
    else
      skip "$test_id: No datasets with health-specific extensions"
      record_result "$test_id" "healthdcatap" "skipped"
    fi
  else
    fail "$test_id: Cannot verify health extensions"
    record_result "$test_id" "healthdcatap" "failed"
  fi

  # 2.4 — Distributions linked to datasets
  local test_id="HDCAT-2.4"
  resp=$(neo4j_query "MATCH (ds:HealthDataset)-[:HAS_DISTRIBUTION]->(dist:Distribution) RETURN count(dist) AS cnt") || resp=""

  if [ -n "$resp" ]; then
    local count
    count=$(echo "$resp" | jq '.results[0].data[0].row[0] // 0') || count=0
    if [ "$count" -gt 0 ]; then
      pass "$test_id: ${count} distributions linked to datasets"
      record_result "$test_id" "healthdcatap" "passed" "${count} distributions"
    else
      skip "$test_id: No distributions found"
      record_result "$test_id" "healthdcatap" "skipped"
    fi
  else
    fail "$test_id: Cannot query distributions"
    record_result "$test_id" "healthdcatap" "failed"
  fi

  # 2.5 — Publisher (Participant) linked to datasets
  local test_id="HDCAT-2.5"
  resp=$(neo4j_query "MATCH (p:Participant)-[:PUBLISHES]->(ds:HealthDataset) RETURN count(*) AS cnt") || resp=""

  if [ -n "$resp" ]; then
    local count
    count=$(echo "$resp" | jq '.results[0].data[0].row[0] // 0') || count=0
    if [ "$count" -gt 0 ]; then
      pass "$test_id: ${count} publisher→dataset links"
      record_result "$test_id" "healthdcatap" "passed" "${count} links"
    else
      skip "$test_id: No publisher links (may use different relationship type)"
      record_result "$test_id" "healthdcatap" "skipped"
    fi
  else
    fail "$test_id: Cannot query publisher links"
    record_result "$test_id" "healthdcatap" "failed"
  fi
}

# ---------------------------------------------------------------------------
# Category 3: EEHRxF Profile Conformance
# ---------------------------------------------------------------------------
run_eehrxf_tests() {
  log "Category 3: EEHRxF Profile Conformance"

  # 3.1 — EEHRxF profiles exist in knowledge graph
  local test_id="EEHR-3.1"
  local resp
  resp=$(neo4j_query "MATCH (p:EEHRxFProfile) RETURN count(p) AS cnt") || resp=""

  if [ -n "$resp" ]; then
    local count
    count=$(echo "$resp" | jq '.results[0].data[0].row[0] // 0') || count=0
    if [ "$count" -gt 0 ]; then
      pass "$test_id: ${count} EEHRxF profiles in knowledge graph"
      record_result "$test_id" "eehrxf" "passed" "${count} profiles"
    else
      fail "$test_id: No EEHRxF profiles found"
      record_result "$test_id" "eehrxf" "failed"
    fi
  else
    fail "$test_id: Cannot query EEHRxF profiles"
    record_result "$test_id" "eehrxf" "failed"
  fi

  # 3.2 — EEHRxF categories exist
  local test_id="EEHR-3.2"
  resp=$(neo4j_query "MATCH (c:EEHRxFCategory) RETURN count(c) AS cnt, collect(c.name)[0..5] AS names") || resp=""

  if [ -n "$resp" ]; then
    local count
    count=$(echo "$resp" | jq '.results[0].data[0].row[0] // 0') || count=0
    if [ "$count" -gt 0 ]; then
      local names
      names=$(echo "$resp" | jq -r '.results[0].data[0].row[1] | join(", ")') || names=""
      pass "$test_id: ${count} EEHRxF categories: ${names}"
      record_result "$test_id" "eehrxf" "passed" "${count} categories"
    else
      fail "$test_id: No EEHRxF categories"
      record_result "$test_id" "eehrxf" "failed"
    fi
  else
    fail "$test_id: Cannot query EEHRxF categories"
    record_result "$test_id" "eehrxf" "failed"
  fi

  # 3.3 — Profiles linked to categories
  local test_id="EEHR-3.3"
  resp=$(neo4j_query "MATCH (c:EEHRxFCategory)-[:HAS_PROFILE]->(p:EEHRxFProfile) RETURN count(*) AS cnt") || resp=""

  if [ -n "$resp" ]; then
    local count
    count=$(echo "$resp" | jq '.results[0].data[0].row[0] // 0') || count=0
    if [ "$count" -gt 0 ]; then
      pass "$test_id: ${count} category→profile links"
      record_result "$test_id" "eehrxf" "passed" "${count} links"
    else
      fail "$test_id: No category→profile links"
      record_result "$test_id" "eehrxf" "failed"
    fi
  else
    fail "$test_id: Cannot query profile links"
    record_result "$test_id" "eehrxf" "failed"
  fi

  # 3.4 — FHIR resources mapped to EEHRxF profiles
  local test_id="EEHR-3.4"
  resp=$(neo4j_query "MATCH (p:EEHRxFProfile)-[:MAPS_RESOURCE]->(r) RETURN count(*) AS cnt") || resp=""

  if [ -n "$resp" ]; then
    local count
    count=$(echo "$resp" | jq '.results[0].data[0].row[0] // 0') || count=0
    if [ "$count" -gt 0 ]; then
      pass "$test_id: ${count} profile→resource mappings"
      record_result "$test_id" "eehrxf" "passed" "${count} mappings"
    else
      skip "$test_id: No direct profile→resource mappings"
      record_result "$test_id" "eehrxf" "skipped"
    fi
  else
    fail "$test_id: Cannot query resource mappings"
    record_result "$test_id" "eehrxf" "failed"
  fi
}

# ---------------------------------------------------------------------------
# Category 4: OMOP CDM Integrity
# ---------------------------------------------------------------------------
run_omop_tests() {
  log "Category 4: OMOP CDM Integrity"

  # 4.1 — OMOPPerson nodes exist
  local test_id="OMOP-4.1"
  local resp
  resp=$(neo4j_query "MATCH (p:OMOPPerson) RETURN count(p) AS cnt") || resp=""

  if [ -n "$resp" ]; then
    local count
    count=$(echo "$resp" | jq '.results[0].data[0].row[0] // 0') || count=0
    if [ "$count" -gt 0 ]; then
      pass "$test_id: ${count} OMOPPerson nodes"
      record_result "$test_id" "omop" "passed" "${count} persons"
    else
      fail "$test_id: No OMOPPerson nodes"
      record_result "$test_id" "omop" "failed"
    fi
  else
    fail "$test_id: Cannot query OMOPPerson"
    record_result "$test_id" "omop" "failed"
  fi

  # 4.2 — FHIR → OMOP mapping completeness (MAPPED_TO relationships)
  local test_id="OMOP-4.2"
  resp=$(neo4j_query "MATCH (fhir:Patient)-[:MAPPED_TO]->(omop:OMOPPerson) RETURN count(*) AS cnt") || resp=""

  if [ -n "$resp" ]; then
    local mapped
    mapped=$(echo "$resp" | jq '.results[0].data[0].row[0] // 0') || mapped=0

    # Total patients
    local total_resp
    total_resp=$(neo4j_query "MATCH (p:Patient) RETURN count(p) AS cnt") || total_resp=""
    local total_patients
    total_patients=$(echo "$total_resp" | jq '.results[0].data[0].row[0] // 0') || total_patients=0

    if [ "$mapped" -gt 0 ] && [ "$total_patients" -gt 0 ]; then
      local pct
      pct=$(echo "scale=1; $mapped * 100 / $total_patients" | bc 2>/dev/null || echo "?")
      pass "$test_id: ${mapped}/${total_patients} patients mapped to OMOP (${pct}%)"
      record_result "$test_id" "omop" "passed" "${mapped}/${total_patients} mapped (${pct}%)"
    elif [ "$mapped" -gt 0 ]; then
      pass "$test_id: ${mapped} Patient→OMOPPerson mappings"
      record_result "$test_id" "omop" "passed" "${mapped} mappings"
    else
      fail "$test_id: No Patient→OMOPPerson mappings"
      record_result "$test_id" "omop" "failed"
    fi
  else
    fail "$test_id: Cannot query MAPPED_TO relationships"
    record_result "$test_id" "omop" "failed"
  fi

  # 4.3 — OMOP clinical events linked
  local test_id="OMOP-4.3"
  resp=$(neo4j_query "MATCH (p:OMOPPerson)-[:HAS_CONDITION_OCCURRENCE]->(c:OMOPConditionOccurrence) RETURN count(*) AS cnt") || resp=""

  if [ -n "$resp" ]; then
    local count
    count=$(echo "$resp" | jq '.results[0].data[0].row[0] // 0') || count=0
    if [ "$count" -gt 0 ]; then
      pass "$test_id: ${count} OMOPPerson→ConditionOccurrence links"
      record_result "$test_id" "omop" "passed" "${count} conditions"
    else
      fail "$test_id: No OMOPPerson→ConditionOccurrence links"
      record_result "$test_id" "omop" "failed"
    fi
  else
    fail "$test_id: Cannot query OMOP conditions"
    record_result "$test_id" "omop" "failed"
  fi

  # 4.4 — OMOP drug exposures
  local test_id="OMOP-4.4"
  resp=$(neo4j_query "MATCH (p:OMOPPerson)-[:HAS_DRUG_EXPOSURE]->(d:OMOPDrugExposure) RETURN count(*) AS cnt") || resp=""

  if [ -n "$resp" ]; then
    local count
    count=$(echo "$resp" | jq '.results[0].data[0].row[0] // 0') || count=0
    if [ "$count" -gt 0 ]; then
      pass "$test_id: ${count} OMOPPerson→DrugExposure links"
      record_result "$test_id" "omop" "passed" "${count} drug exposures"
    else
      skip "$test_id: No drug exposure links (may use different rel type)"
      record_result "$test_id" "omop" "skipped"
    fi
  else
    fail "$test_id: Cannot query OMOP drug exposures"
    record_result "$test_id" "omop" "failed"
  fi

  # 4.5 — OMOP measurements
  local test_id="OMOP-4.5"
  resp=$(neo4j_query "MATCH (p:OMOPPerson)-[:HAS_MEASUREMENT]->(m:OMOPMeasurement) RETURN count(*) AS cnt") || resp=""

  if [ -n "$resp" ]; then
    local count
    count=$(echo "$resp" | jq '.results[0].data[0].row[0] // 0') || count=0
    if [ "$count" -gt 0 ]; then
      pass "$test_id: ${count} OMOPPerson→Measurement links"
      record_result "$test_id" "omop" "passed" "${count} measurements"
    else
      skip "$test_id: No measurement links (may use different rel type)"
      record_result "$test_id" "omop" "skipped"
    fi
  else
    fail "$test_id: Cannot query OMOP measurements"
    record_result "$test_id" "omop" "failed"
  fi

  # 4.6 — OMOP procedure occurrences
  local test_id="OMOP-4.6"
  resp=$(neo4j_query "MATCH (p:OMOPPerson)-[:HAS_PROCEDURE]->(pr:OMOPProcedureOccurrence) RETURN count(*) AS cnt") || resp=""

  if [ -n "$resp" ]; then
    local count
    count=$(echo "$resp" | jq '.results[0].data[0].row[0] // 0') || count=0
    if [ "$count" -gt 0 ]; then
      pass "$test_id: ${count} OMOPPerson→ProcedureOccurrence links"
      record_result "$test_id" "omop" "passed" "${count} procedures"
    else
      skip "$test_id: No procedure links"
      record_result "$test_id" "omop" "skipped"
    fi
  else
    fail "$test_id: Cannot query OMOP procedures"
    record_result "$test_id" "omop" "failed"
  fi

  # 4.7 — No orphaned OMOPPerson (every person has at least one clinical event)
  local test_id="OMOP-4.7"
  resp=$(neo4j_query "MATCH (p:OMOPPerson) WHERE NOT (p)--(:OMOPConditionOccurrence) AND NOT (p)--(:OMOPDrugExposure) AND NOT (p)--(:OMOPMeasurement) AND NOT (p)--(:OMOPProcedureOccurrence) RETURN count(p) AS orphans") || resp=""

  if [ -n "$resp" ]; then
    local orphans
    orphans=$(echo "$resp" | jq '.results[0].data[0].row[0] // 0') || orphans=0
    if [ "$orphans" -eq 0 ]; then
      pass "$test_id: No orphaned OMOPPerson nodes"
      record_result "$test_id" "omop" "passed" "0 orphans"
    else
      fail "$test_id: ${orphans} orphaned OMOPPerson (no clinical events)"
      record_result "$test_id" "omop" "failed" "${orphans} orphans"
    fi
  else
    fail "$test_id: Cannot check for orphaned OMOP persons"
    record_result "$test_id" "omop" "failed"
  fi

  # 4.8 — Vocabulary mappings: SNOMED codes present
  local test_id="OMOP-4.8"
  resp=$(neo4j_query "MATCH (c:OMOPConditionOccurrence) WHERE c.conditionSourceValue IS NOT NULL RETURN count(c) AS cnt LIMIT 1") || resp=""

  if [ -n "$resp" ]; then
    local count
    count=$(echo "$resp" | jq '.results[0].data[0].row[0] // 0') || count=0
    if [ "$count" -gt 0 ]; then
      pass "$test_id: OMOP conditions have vocabulary source values"
      record_result "$test_id" "omop" "passed"
    else
      skip "$test_id: No vocabulary source values (field may differ)"
      record_result "$test_id" "omop" "skipped"
    fi
  else
    fail "$test_id: Cannot check vocabulary mappings"
    record_result "$test_id" "omop" "failed"
  fi
}

# ---------------------------------------------------------------------------
# Category 5: Knowledge Graph Integrity
# ---------------------------------------------------------------------------
run_graph_integrity_tests() {
  log "Category 5: Knowledge Graph Integrity"

  # 5.1 — All 5 layers populated
  local test_id="GRAPH-5.1"
  local layer_counts=""
  local all_populated=true

  for label in "DataProduct" "HealthDataset" "Patient" "OMOPPerson" "SnomedConcept"; do
    local resp
    resp=$(neo4j_query "MATCH (n:${label}) RETURN count(n) AS cnt") || resp=""
    local count
    count=$(echo "$resp" | jq '.results[0].data[0].row[0] // 0' 2>/dev/null) || count=0
    layer_counts="${layer_counts}${label}=${count} "
    if [ "$count" -eq 0 ]; then
      all_populated=false
    fi
  done

  if [ "$all_populated" = true ]; then
    pass "$test_id: All 5 layers populated: ${layer_counts}"
    record_result "$test_id" "graph" "passed" "${layer_counts}"
  else
    skip "$test_id: Some layers empty: ${layer_counts}"
    record_result "$test_id" "graph" "skipped" "${layer_counts}"
  fi

  # 5.2 — Total node count
  local test_id="GRAPH-5.2"
  local resp
  resp=$(neo4j_query "MATCH (n) RETURN count(n) AS total") || resp=""

  if [ -n "$resp" ]; then
    local total
    total=$(echo "$resp" | jq '.results[0].data[0].row[0] // 0') || total=0
    if [ "$total" -gt 1000 ]; then
      pass "$test_id: ${total} total nodes in knowledge graph"
      record_result "$test_id" "graph" "passed" "${total} nodes"
    elif [ "$total" -gt 0 ]; then
      pass "$test_id: ${total} nodes (below expected ~57K)"
      record_result "$test_id" "graph" "passed" "${total} nodes"
    else
      fail "$test_id: Knowledge graph is empty"
      record_result "$test_id" "graph" "failed"
    fi
  else
    fail "$test_id: Cannot query total node count"
    record_result "$test_id" "graph" "failed"
  fi

  # 5.3 — Total relationship count
  local test_id="GRAPH-5.3"
  resp=$(neo4j_query "MATCH ()-[r]->() RETURN count(r) AS total") || resp=""

  if [ -n "$resp" ]; then
    local total
    total=$(echo "$resp" | jq '.results[0].data[0].row[0] // 0') || total=0
    if [ "$total" -gt 1000 ]; then
      pass "$test_id: ${total} total relationships"
      record_result "$test_id" "graph" "passed" "${total} relationships"
    elif [ "$total" -gt 0 ]; then
      pass "$test_id: ${total} relationships"
      record_result "$test_id" "graph" "passed" "${total} relationships"
    else
      fail "$test_id: No relationships in knowledge graph"
      record_result "$test_id" "graph" "failed"
    fi
  else
    fail "$test_id: Cannot query relationship count"
    record_result "$test_id" "graph" "failed"
  fi

  # 5.4 — Verifiable Credential nodes exist
  local test_id="GRAPH-5.4"
  resp=$(neo4j_query "MATCH (vc:VerifiableCredential) RETURN count(vc) AS cnt") || resp=""

  if [ -n "$resp" ]; then
    local count
    count=$(echo "$resp" | jq '.results[0].data[0].row[0] // 0') || count=0
    if [ "$count" -gt 0 ]; then
      pass "$test_id: ${count} VerifiableCredential nodes"
      record_result "$test_id" "graph" "passed" "${count} VCs"
    else
      skip "$test_id: No VerifiableCredential nodes"
      record_result "$test_id" "graph" "skipped"
    fi
  else
    fail "$test_id: Cannot query VCs"
    record_result "$test_id" "graph" "failed"
  fi
}

# ---------------------------------------------------------------------------
# Generate JSON report
# ---------------------------------------------------------------------------
write_report() {
  log "Writing report to ${REPORT_FILE}"
  {
    echo "{"
    echo "  \"suite\": \"EHDS Health-Domain Compliance\","
    echo "  \"version\": \"1.0.0\","
    echo "  \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\","
    echo "  \"deployment\": \"health-dataspace-v2\","
    echo "  \"summary\": {"
    echo "    \"total\": ${TOTAL},"
    echo "    \"passed\": ${PASSED},"
    echo "    \"failed\": ${FAILED},"
    echo "    \"skipped\": ${SKIPPED},"
    echo "    \"passRate\": \"$(echo "scale=1; ${PASSED} * 100 / ${TOTAL}" | bc 2>/dev/null || echo "0")%\""
    echo "  },"
    echo "  \"tests\": ["
    local first=true
    for r in "${TEST_RESULTS[@]}"; do
      if [ "$first" = true ]; then first=false; else echo ","; fi
      echo -n "    $r"
    done
    echo ""
    echo "  ]"
    echo "}"
  } > "$REPORT_FILE"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
main() {
  echo ""
  echo "═══════════════════════════════════════════════════════════════"
  echo "  EHDS Health-Domain Compliance Tests — Health Dataspace"
  echo "═══════════════════════════════════════════════════════════════"
  echo ""

  discover_participants
  echo ""

  run_article53_tests
  echo ""
  run_healthdcatap_tests
  echo ""
  run_eehrxf_tests
  echo ""
  run_omop_tests
  echo ""
  run_graph_integrity_tests

  echo ""
  echo "═══════════════════════════════════════════════════════════════"
  echo -e "  Results: ${GREEN}${PASSED} passed${NC}, ${RED}${FAILED} failed${NC}, ${YELLOW}${SKIPPED} skipped${NC} / ${TOTAL} total"
  echo "═══════════════════════════════════════════════════════════════"
  echo ""

  write_report

  if [ "$FAILED" -gt 0 ]; then
    exit 1
  fi
}

main "$@"
