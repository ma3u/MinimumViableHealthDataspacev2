#!/bin/bash
# Neo4j seed runner. Uses cypher-shell over Bolt (port 7687), which is the
# primary transport for the mvhd-neo4j ACA ingress. No HTTP API dependency.
set -uo pipefail

NEO4J_HOST="${NEO4J_HOST:-mvhd-neo4j.internal.blackforest-0a04f26e.westeurope.azurecontainerapps.io}"
NEO4J_PORT="${NEO4J_PORT:-7687}"
NEO4J_USER="${NEO4J_USER:-neo4j}"
NEO4J_PASSWORD="${NEO4J_PASSWORD:-healthdataspace}"
NEO4J_URI="bolt://${NEO4J_HOST}:${NEO4J_PORT}"

echo "Waiting for Neo4j at ${NEO4J_URI}..."
for i in $(seq 1 60); do
  if cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" \
       --non-interactive "RETURN 1;" > /dev/null 2>&1; then
    echo "Neo4j is ready (after ${i} attempts)"
    break
  fi
  echo "  attempt ${i}: not ready"
  sleep 3
done

run_file() {
  local file="$1"
  local label="$2"
  echo ""
  echo "=== Loading ${label} (${file}) ==="

  if [ ! -f "$file" ]; then
    echo "  ERROR: file not found, skipping"
    return 0
  fi

  local start_ts
  start_ts=$(date +%s)
  if cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" \
       --non-interactive --format plain --fail-at-end < "$file" 2>&1 | tail -20; then
    local end_ts
    end_ts=$(date +%s)
    echo "  OK ${label} complete in $((end_ts - start_ts))s"
  else
    echo "  WARN ${label} had errors (continuing — check output above)"
  fi
}

run_file /seed/init-schema.cypher "schema"
run_file /seed/insert-synthetic-schema-data.cypher "synthetic data"
run_file /seed/register-dsp-marketplace.cypher "DSP marketplace"
run_file /seed/register-fhir-dataset-hdcatap.cypher "FHIR DCAT-AP"
run_file /seed/register-fhir-dataset-hdcatap-spe2.cypher "FHIR DCAT-AP SPE2"
run_file /seed/register-eehrxf-profiles.cypher "EEHRxF profiles"
run_file /seed/register-ehds-credentials.cypher "EHDS credentials"
run_file /seed/fhir-to-omop-transform.cypher "FHIR→OMOP transform"
run_file /seed/seed-transfer-events.cypher "transfer events"
run_file /seed/seed-trust-center.cypher "trust center"
run_file /seed/seed-audit-provenance.cypher "audit provenance"
run_file /seed/seed-compliance-matrix.cypher "compliance matrix"

echo ""
echo "=== Verifying ==="
cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" \
  --non-interactive --format plain \
  "MATCH (n) RETURN count(n) AS nodeCount;"
cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" \
  --non-interactive --format plain \
  "MATCH ()-[r]->() RETURN count(r) AS relCount;"

echo ""
echo "SEED_COMPLETE"
