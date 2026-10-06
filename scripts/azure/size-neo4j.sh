#!/usr/bin/env bash
# =============================================================================
# Gives mvhd-neo4j the size env.sh names (ADR-056).
# =============================================================================
#   size-neo4j.sh           apply NEO4J_CPU, NEO4J_MEMORY, heap, page cache and
#                           direct memory to the live app; a short graph outage
#   size-neo4j.sh --check   show what the app runs with now, change nothing
#
# Neo4j Community has no cluster, so the database grows only up. The memory
# settings must fit the container together: heap + page cache + direct memory
# + the JVM's rest (#571: at 2 GiB it idled at 2.0 GB and stress killed it).
#
# The new revision cannot start while the old one holds the store lock on the
# neo4j-data share (docs/gotchas.md, 2026-10-04), so the old one is retired
# first and the graph is away for a minute or two: no k6 run, no demo.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=env.sh
source "${SCRIPT_DIR}/env.sh"

show() {
  az containerapp show --name "$NEO4J_APP" --resource-group "$RG" --query "{
      cpu: properties.template.containers[0].resources.cpu,
      memory: properties.template.containers[0].resources.memory,
      latestRevision: properties.latestRevisionName,
      memoryEnv: properties.template.containers[0].env[?starts_with(name, 'NEO4J_server_memory') || name == 'NEO4J_server_jvm_additional'].{name: name, value: value}}" -o json
  az containerapp revision list --name "$NEO4J_APP" --resource-group "$RG" \
    --query "[?properties.active].{revision: name, health: properties.healthState, running: properties.runningState}" -o table
}

if [[ "${1:-}" == "--check" ]]; then
  show
  exit 0
fi

log "Sizing $NEO4J_APP: ${NEO4J_CPU} vCPU, ${NEO4J_MEMORY}; heap ${NEO4J_HEAP}, page cache ${NEO4J_PAGECACHE}, direct memory ${NEO4J_DIRECT_MEMORY}"
# --set-env-vars merges, so NEO4J_AUTH, the plugins and the rest stay.
az containerapp update --name "$NEO4J_APP" --resource-group "$RG" \
  --cpu "$NEO4J_CPU" --memory "$NEO4J_MEMORY" \
  --set-env-vars \
    "NEO4J_server_memory_heap_initial__size=${NEO4J_HEAP}" \
    "NEO4J_server_memory_heap_max__size=${NEO4J_HEAP}" \
    "NEO4J_server_memory_pagecache_size=${NEO4J_PAGECACHE}" \
    "NEO4J_server_jvm_additional=-XX:MaxDirectMemorySize=${NEO4J_DIRECT_MEMORY}" \
  -o none

log "Replacing the old revision (it holds the store lock)"
RESOURCE_GROUP="$RG" "${SCRIPT_DIR}/retire-stale-revisions.sh" "$NEO4J_APP" ||
  warn "a stale $NEO4J_APP revision is still active"
LATEST="$(az containerapp show --name "$NEO4J_APP" --resource-group "$RG" \
  --query properties.latestRevisionName -o tsv)"
health=""
for i in $(seq 1 40); do
  health="$(az containerapp revision show --name "$NEO4J_APP" --resource-group "$RG" \
    --revision "$LATEST" --query properties.healthState -o tsv)"
  [[ "$health" == Healthy ]] && break
  # A first start that met the old revision's lock gives up; start it again.
  if [[ "$i" == 12 ]]; then
    az containerapp revision restart --name "$NEO4J_APP" --resource-group "$RG" \
      --revision "$LATEST" -o none
  fi
  sleep 15
done
if [[ "$health" != Healthy ]]; then
  err "$LATEST is '$health' after 10 minutes"
  exit 1
fi
ok "$LATEST healthy"
show
