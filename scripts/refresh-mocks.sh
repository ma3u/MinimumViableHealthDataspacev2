#!/usr/bin/env bash
set -euo pipefail
# ─────────────────────────────────────────────────────────────────────────────
# refresh-mocks.sh — Generate mock JSON fixtures from live API responses.
#
# Usage:
#   ./scripts/refresh-mocks.sh [BASE_URL]
#
# Defaults to http://localhost:3000. Requires the Next.js dev/server
# and Neo4j to be running.
#
# This script is called by the pages.yml CI workflow to ensure the static
# GitHub Pages build always has fresh data matching the live API.
# ─────────────────────────────────────────────────────────────────────────────

BASE="${1:-http://localhost:3000}"
MOCK_DIR="$(cd "$(dirname "$0")/../ui/public/mock" && pwd)"
TIMEOUT=10

echo "🔄 Refreshing mock fixtures from ${BASE}..."
echo "   Target: ${MOCK_DIR}"

# Helper: fetch endpoint, save to file if response is valid JSON
fetch_mock() {
  local endpoint="$1"
  local filename="$2"
  local url="${BASE}${endpoint}"

  local response
  response=$(curl -sf --max-time "$TIMEOUT" "$url" 2>/dev/null) || {
    echo "   ⚠️  SKIP ${endpoint} (unreachable or error)"
    return 0
  }

  # Validate it's JSON (not an HTML error page)
  if echo "$response" | python3 -c "import sys,json; json.load(sys.stdin)" 2>/dev/null; then
    echo "$response" | python3 -c "import sys,json; json.dump(json.load(sys.stdin),sys.stdout,indent=2)" > "${MOCK_DIR}/${filename}"
    echo "   ✅ ${endpoint} → ${filename}"
  else
    echo "   ⚠️  SKIP ${endpoint} (not valid JSON)"
  fi
}

# ── Exact endpoint → mock file mappings ───────────────────────────────────────

fetch_mock "/api/catalog" "catalog.json"
fetch_mock "/api/graph" "graph.json"
fetch_mock "/api/compliance" "compliance.json"
fetch_mock "/api/compliance/tck" "compliance_tck.json"
fetch_mock "/api/patient" "patient.json"
fetch_mock "/api/patient/profile" "patient_profile_list.json"
fetch_mock "/api/patient/profile?patientId=P1" "patient_profile_patient1.json"
fetch_mock "/api/patient/profile?patientId=P2" "patient_profile_patient2.json"
fetch_mock "/api/patient/insights" "patient_insights.json"
fetch_mock "/api/patient/research" "patient_research.json"
fetch_mock "/api/analytics" "analytics.json"
fetch_mock "/api/eehrxf" "eehrxf.json"
fetch_mock "/api/nlq" "nlq_templates.json"
fetch_mock "/api/credentials" "credentials.json"
fetch_mock "/api/participants" "participants.json"
fetch_mock "/api/participants/me" "participants_me.json"
fetch_mock "/api/assets" "assets.json"
fetch_mock "/api/admin/tenants" "admin_tenants.json"
fetch_mock "/api/admin/policies" "admin_policies.json"
fetch_mock "/api/admin/components" "admin_components.json"
fetch_mock "/api/admin/components/topology" "admin_components_topology.json"
fetch_mock "/api/admin/audit" "admin_audit.json"
fetch_mock "/api/odrl/scope" "odrl_scope.json"
fetch_mock "/api/federated" "federated_stats.json"
fetch_mock "/api/negotiations" "negotiations.json"
fetch_mock "/api/transfers" "transfers.json"
fetch_mock "/api/tasks" "tasks.json"

# ── Persona-specific graph views ──────────────────────────────────────────────

fetch_mock "/api/graph?persona=patient" "graph_patient.json"
fetch_mock "/api/graph?persona=hospital" "graph_hospital.json"
fetch_mock "/api/graph?persona=researcher" "graph_researcher.json"
fetch_mock "/api/graph?persona=edc-admin" "graph_edc_admin.json"
fetch_mock "/api/graph?persona=hdab" "graph_hdab.json"
fetch_mock "/api/graph?persona=trust-center" "graph_trust_center.json"

echo ""
echo "✅ Mock refresh complete. $(ls "${MOCK_DIR}"/*.json | wc -l | tr -d ' ') files in ${MOCK_DIR}"
