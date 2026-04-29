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

# Phase 26 fast-path: when re-seeding just the federated discovery bits
# on Azure, the full pipeline takes too long (FastRP on 100k+ nodes blew
# past the 60 min replica-timeout last time). SEED_PHASE=phase26-only
# lets operators run just the two small MERGE-idempotent files.
if [ "${SEED_PHASE:-}" = "phase26-only" ]; then
  echo ""
  echo "=== SEED_PHASE=phase26-only — running just the two Phase 26 files ==="
  run_file /seed/participant-source-init.cypher "participant source labels (Phase 26a)"
  run_file /seed/nlq-glossary.cypher "NLQ glossary (Phase 26d)"
  echo ""
  echo "=== Verifying ==="
  cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" \
    --non-interactive --format plain \
    "MATCH (p:Participant) WHERE p.dspCatalogUrl IS NOT NULL RETURN count(p) AS crawlerTargets;"
  cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" \
    --non-interactive --format plain \
    "MATCH (g:NlqGlossary) RETURN count(g) AS glossaryRows;"
  echo ""
  echo "SEED_COMPLETE"
  exit 0
fi

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

# Phase 26a: bootstrap :Participant source labels + dspCatalogUrl so the
# catalog-crawler has targets and the enricher can link federated datasets
# back to their publishers. Idempotent MERGE, safe to re-run.
run_file /seed/participant-source-init.cypher "participant source labels (Phase 26a)"

# Phase 26d: NLQ glossary — NL->code mappings for federated templates.
# Stored in Neo4j (not hardcoded) so operators can extend without a
# redeploy. ~30 curated terms across kind=country|concept|credential.
run_file /seed/nlq-glossary.cypher "NLQ glossary (Phase 26d)"

# Issue #19: backfill :CODED_BY edges from Condition/MedicationRequest/
# Observation to their ontology nodes, using the code strings that are
# already present on the clinical nodes. Fills in the relationships the
# Synthea bulk-import leaves empty so NLQ queries can join to the
# ontology layer cleanly. Idempotent.
run_file /seed/backfill-coded-by.cypher "CODED_BY edge backfill (issue #19)"

# Issue #19: pharmacovigilance demo cohort (ciprofloxacin + UTI + tendon
# rupture) so the canonical NLQ teaching question returns a real cohort
# against the Synthea-based synthetic dataset (which does not include
# fluoroquinolones out of the box). 6 fictional patients. Idempotent.
run_file /seed/issue-19-demo-seed.cypher "pharmacovigilance demo cohort (issue #19)"

# Phase 25b (Issue #13): Structural embeddings (FastRP) — always on, no API.
# Requires the graph-data-science plugin; silently no-ops on installs without
# it (the CALL gds.version() check below logs a warning so the operator sees
# the miss, but the rest of the seed still succeeds).
if cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" \
     --non-interactive --format plain \
     "CALL gds.version() YIELD gdsVersion RETURN gdsVersion;" > /dev/null 2>&1; then
  run_file /seed/register-embeddings-fastrp.cypher "FastRP structural embeddings"
else
  echo ""
  echo "=== SKIPPED: FastRP embeddings (graph-data-science plugin not loaded) ==="
  echo "  Install GDS to enable GraphRAG — see docker-compose.yml NEO4J_PLUGINS."
fi

# Phase 25d (Issue #13): Semantic embeddings via Azure OpenAI — optional.
# Only runs when AZURE_OPENAI_API_KEY is present in the seed environment; a
# fresh local install with no API key simply skips this step.
if [ -n "${AZURE_OPENAI_API_KEY:-}" ] && [ -n "${AZURE_OPENAI_EMBEDDINGS_URL:-}" ]; then
  run_file /seed/register-embeddings-aoai.cypher "Azure OpenAI semantic embeddings"
fi

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
