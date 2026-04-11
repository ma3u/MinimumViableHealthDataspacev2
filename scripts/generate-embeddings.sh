#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# generate-embeddings.sh
# Generate vector embeddings for GraphRAG (Phase 24e)
#
# Reads nodes from Neo4j (HealthDataset, Condition, SnomedConcept),
# generates 384-dim embeddings via Ollama (nomic-embed-text) or
# OpenAI (text-embedding-3-small), and writes vectors back as
# node properties. Idempotent: skips nodes that already have embeddings.
#
# Usage:
#   ./scripts/generate-embeddings.sh                    # Ollama (default)
#   OPENAI_API_KEY=sk-... ./scripts/generate-embeddings.sh   # OpenAI
#
# Prerequisites:
#   - Neo4j running on bolt://localhost:7687
#   - Ollama running on http://localhost:11434 with nomic-embed-text
#     OR OPENAI_API_KEY set in environment
#   - cypher-shell installed (comes with Neo4j)
# ============================================================

NEO4J_URI="${NEO4J_URI:-bolt://localhost:7687}"
NEO4J_USER="${NEO4J_USER:-neo4j}"
NEO4J_PASSWORD="${NEO4J_PASSWORD:-healthdataspace}"
OLLAMA_URL="${OLLAMA_URL:-http://localhost:11434}"
OPENAI_API_KEY="${OPENAI_API_KEY:-}"
BATCH_SIZE="${BATCH_SIZE:-50}"

echo "=== GraphRAG Embedding Generator ==="
echo "Neo4j: ${NEO4J_URI}"
echo "Provider: $([ -n "${OPENAI_API_KEY}" ] && echo 'OpenAI' || echo 'Ollama')"

# Function to generate embedding via Ollama
embed_ollama() {
  local text="$1"
  curl -s "${OLLAMA_URL}/api/embeddings" \
    -H "Content-Type: application/json" \
    -d "{\"model\":\"nomic-embed-text\",\"prompt\":$(echo "$text" | jq -Rs .)}" \
    | jq -c '.embedding'
}

# Function to generate embedding via OpenAI
embed_openai() {
  local text="$1"
  curl -s "https://api.openai.com/v1/embeddings" \
    -H "Authorization: Bearer ${OPENAI_API_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"model\":\"text-embedding-3-small\",\"input\":$(echo "$text" | jq -Rs .),\"dimensions\":384}" \
    | jq -c '.data[0].embedding'
}

# Select embedding function
if [ -n "${OPENAI_API_KEY}" ]; then
  embed() { embed_openai "$1"; }
else
  embed() { embed_ollama "$1"; }
fi

# Process a label type
process_label() {
  local label="$1"
  local text_field="$2"
  local id_field="$3"

  echo ""
  echo "--- Processing ${label} (text: ${text_field}, id: ${id_field}) ---"

  # Get nodes without embeddings
  local nodes
  nodes=$(echo "MATCH (n:${label}) WHERE n.embedding IS NULL RETURN n.${id_field} AS id, n.${text_field} AS text LIMIT ${BATCH_SIZE};" \
    | cypher-shell -u "${NEO4J_USER}" -p "${NEO4J_PASSWORD}" -a "${NEO4J_URI}" --format plain 2>/dev/null \
    | tail -n +2)

  if [ -z "$nodes" ]; then
    echo "  No nodes without embeddings found for ${label}. Skipping."
    return
  fi

  local count=0
  while IFS=$'\t' read -r node_id node_text; do
    if [ -z "$node_text" ] || [ "$node_text" = "null" ]; then
      continue
    fi

    # Generate embedding
    local vec
    vec=$(embed "$node_text")
    if [ -z "$vec" ] || [ "$vec" = "null" ]; then
      echo "  WARN: No embedding returned for ${label} ${node_id}"
      continue
    fi

    # Write embedding back to Neo4j
    echo "MATCH (n:${label} {${id_field}: '${node_id}'}) SET n.embedding = ${vec};" \
      | cypher-shell -u "${NEO4J_USER}" -p "${NEO4J_PASSWORD}" -a "${NEO4J_URI}" --format plain 2>/dev/null

    count=$((count + 1))
    echo "  [${count}] ${label} ${node_id}: embedded (${#vec} chars)"
  done <<< "$nodes"

  echo "  Done: ${count} ${label} nodes embedded."
}

# Process each label type
process_label "HealthDataset" "title" "datasetId"
process_label "Condition" "display" "resourceId"
process_label "SnomedConcept" "display" "conceptId"

echo ""
echo "=== Embedding generation complete ==="
