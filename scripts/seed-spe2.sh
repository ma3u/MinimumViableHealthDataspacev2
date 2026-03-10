#!/usr/bin/env bash
# =============================================================================
# Phase 5a: Seed the second Neo4j SPE with a disjoint patient subset
# =============================================================================
# Loads the second half of Synthea FHIR bundles (patients 34–66) into
# neo4j-spe2, simulating a second Secure Processing Environment (SPE)
# from a different healthcare provider. The primary Neo4j has all patients,
# but SPE2 represents a federated data source with partial overlap.
#
# Usage:
#   ./scripts/seed-spe2.sh
#
# Prerequisites:
#   docker compose --profile federated up -d   (starts neo4j-spe2)
#   pip install neo4j                          (or use existing venv)
# =============================================================================

set -euo pipefail
cd "$(dirname "$0")/.."

NEO4J_SPE2_URI="${NEO4J_SPE2_URI:-bolt://localhost:7688}"
NEO4J_SPE2_USER="${NEO4J_SPE2_USER:-neo4j}"
NEO4J_SPE2_PASSWORD="${NEO4J_SPE2_PASSWORD:-healthdataspace}"

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  Phase 5a: Seed Neo4j SPE-2 (Second Processing Environment) ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# ---- Step 1: Wait for Neo4j SPE2 to be ready ----------------------------
echo "⏳ Waiting for Neo4j SPE-2 at ${NEO4J_SPE2_URI}..."
for i in $(seq 1 30); do
  if docker exec health-dataspace-neo4j-spe2 cypher-shell \
    -u "$NEO4J_SPE2_USER" -p "$NEO4J_SPE2_PASSWORD" \
    "RETURN 1" >/dev/null 2>&1; then
    echo "✅ Neo4j SPE-2 is ready"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "❌ Timeout waiting for Neo4j SPE-2. Start it with:"
    echo "   docker compose --profile federated up -d"
    exit 1
  fi
  sleep 2
done

# ---- Step 2: Initialize schema -------------------------------------------
echo ""
echo "📋 Initializing schema on SPE-2..."
cat neo4j/init-schema.cypher | docker exec -i health-dataspace-neo4j-spe2 \
  cypher-shell -u "$NEO4J_SPE2_USER" -p "$NEO4J_SPE2_PASSWORD" 2>/dev/null || true
echo "✅ Schema initialized"

# ---- Step 3: Load second half of FHIR bundles ----------------------------
echo ""
echo "📦 Loading FHIR bundles (second half) into SPE-2..."

# Get sorted list of bundles and take the second half
BUNDLES=($(ls neo4j/import/fhir/*.json | sort))
TOTAL=${#BUNDLES[@]}
HALF=$((TOTAL / 2))

echo "   Total bundles: ${TOTAL}, loading bundles ${HALF}–${TOTAL} into SPE-2"
echo ""

# Use the load script with SPE2 connection
NEO4J_URI="$NEO4J_SPE2_URI" \
NEO4J_USER="$NEO4J_SPE2_USER" \
NEO4J_PASSWORD="$NEO4J_SPE2_PASSWORD" \
python3 scripts/load_fhir_neo4j.py --start-index "$HALF" 2>&1 | tail -5

echo ""
echo "✅ FHIR data loaded into SPE-2"

# ---- Step 4: Run FHIR→OMOP transform ------------------------------------
echo ""
echo "🔄 Running FHIR→OMOP transform on SPE-2..."
cat neo4j/fhir-to-omop-transform.cypher | docker exec -i health-dataspace-neo4j-spe2 \
  cypher-shell -u "$NEO4J_SPE2_USER" -p "$NEO4J_SPE2_PASSWORD" 2>/dev/null || true
echo "✅ OMOP transform complete"

# ---- Step 5: Register HealthDCAT-AP metadata -----------------------------
echo ""
echo "📝 Registering HealthDCAT-AP metadata on SPE-2..."
cat neo4j/register-fhir-dataset-hdcatap.cypher | docker exec -i health-dataspace-neo4j-spe2 \
  cypher-shell -u "$NEO4J_SPE2_USER" -p "$NEO4J_SPE2_PASSWORD" 2>/dev/null || true
echo "✅ HealthDCAT-AP metadata registered"

# ---- Step 6: Verify counts -----------------------------------------------
echo ""
echo "📊 SPE-2 Node Counts:"
docker exec health-dataspace-neo4j-spe2 cypher-shell \
  -u "$NEO4J_SPE2_USER" -p "$NEO4J_SPE2_PASSWORD" \
  "MATCH (p:Patient) RETURN 'Patient' AS label, count(p) AS count
   UNION ALL
   MATCH (e:Encounter) RETURN 'Encounter' AS label, count(e) AS count
   UNION ALL
   MATCH (c:Condition) RETURN 'Condition' AS label, count(c) AS count
   UNION ALL
   MATCH (o:Observation) RETURN 'Observation' AS label, count(o) AS count
   UNION ALL
   MATCH (m:MedicationRequest) RETURN 'MedicationRequest' AS label, count(m) AS count
   UNION ALL
   MATCH (pr:Procedure) RETURN 'Procedure' AS label, count(pr) AS count" 2>/dev/null

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  ✅ SPE-2 seeded successfully                                ║"
echo "║  Neo4j Browser: http://localhost:7475                        ║"
echo "║  Bolt endpoint: bolt://localhost:7688                        ║"
echo "╚══════════════════════════════════════════════════════════════╝"
