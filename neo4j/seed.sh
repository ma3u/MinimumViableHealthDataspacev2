#!/bin/sh
set -e

NEO4J_URL="https://mvhd-neo4j.internal.blackforest-0a04f26e.westeurope.azurecontainerapps.io"
AUTH="bmVvNGo6aGVhbHRoZGF0YXNwYWNl"

echo "Waiting for Neo4j..."
for i in $(seq 1 30); do
  if curl -sf "$NEO4J_URL" > /dev/null 2>&1; then
    echo "Neo4j is ready"
    break
  fi
  sleep 2
done

run_file() {
  local file="$1"
  local label="$2"
  echo "=== Loading $label ==="

  local stmt=""
  local count=0
  while IFS= read -r line || [ -n "$line" ]; do
    # Skip comments and empty lines
    case "$line" in
      //*) continue ;;
      "") continue ;;
    esac
    stmt="${stmt} ${line}"
    # Execute when we hit a semicolon at end of line
    if printf '%s' "$line" | grep -q ';[[:space:]]*$'; then
      # Remove trailing semicolon
      stmt=$(printf '%s' "$stmt" | sed 's/;[[:space:]]*$//')
      # JSON-escape the statement
      escaped=$(printf '%s' "$stmt" | jq -Rs .)

      curl -sf -X POST "$NEO4J_URL/db/neo4j/tx/commit" \
        -H "Authorization: Basic $AUTH" \
        -H "Content-Type: application/json" \
        -d "{\"statements\":[{\"statement\":${escaped}}]}" > /dev/null 2>&1 || echo "  WARN: statement failed"

      count=$((count + 1))
      if [ $((count % 50)) -eq 0 ]; then
        echo "  $count statements executed..."
      fi
      stmt=""
    fi
  done < "$file"
  echo "  $label complete: $count statements"
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

echo "=== Verifying ==="
RESULT=$(curl -sf -X POST "$NEO4J_URL/db/neo4j/tx/commit" \
  -H "Authorization: Basic $AUTH" \
  -H "Content-Type: application/json" \
  -d '{"statements":[{"statement":"MATCH (n) RETURN count(n) as nodeCount"}]}')
echo "Result: $RESULT"
echo "SEED_COMPLETE"
