#!/usr/bin/env bash
# =============================================================================
# Gives mvhd-ui the size and scale rule env.sh names (ADR-061).
# =============================================================================
#   size-ui.sh           apply UI_CPU, UI_MEMORY, UI_MIN_REPLICAS, UI_MAX_REPLICAS
#                        and the HTTP concurrency rule to the live app
#   size-ui.sh --check   show what the app runs with now, change nothing
#
# The UI is one Node process per replica: a replica never uses more than one
# core, and at 0.5 vCPU it runs at half speed. The stress runs of 2026-10-06
# pinned three replicas of 0.5 vCPU from 200 users on while Neo4j and the
# proxy idled (#571). Scaling it is more replicas of a whole core each, added
# on the number of concurrent requests a replica holds, instead of ACA's
# default rule of 10. A new revision rolls in without an outage: the UI holds
# no lock, unlike Neo4j (size-neo4j.sh). Not during a k6 run.
#
# Sticky sessions stay on with more than one replica: an EUDI Wallet sign-in
# lives in the memory of the replica that started it (ui/src/lib/eudi-store.ts),
# so a status poll that reaches another replica answers 404 and the page says
# the request expired before a QR code shows (#708, docs/gotchas.md).
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=env.sh
source "${SCRIPT_DIR}/env.sh"

show() {
  az containerapp show --name "$UI_APP" --resource-group "$RG" --query "{
      cpu: properties.template.containers[0].resources.cpu,
      memory: properties.template.containers[0].resources.memory,
      minReplicas: properties.template.scale.minReplicas,
      maxReplicas: properties.template.scale.maxReplicas,
      rules: properties.template.scale.rules,
      affinity: properties.configuration.ingress.stickySessions.affinity,
      latestRevision: properties.latestRevisionName}" -o json
  az containerapp revision list --name "$UI_APP" --resource-group "$RG" \
    --query "[?properties.active].{revision: name, health: properties.healthState, running: properties.runningState, replicas: properties.replicas}" -o table
}

if [[ "${1:-}" == "--check" ]]; then
  show
  exit 0
fi

log "Sizing $UI_APP: ${UI_CPU} vCPU, ${UI_MEMORY}, ${UI_MIN_REPLICAS} to ${UI_MAX_REPLICAS} replicas, ${UI_SCALE_CONCURRENCY} concurrent requests per replica"
az containerapp update --name "$UI_APP" --resource-group "$RG" \
  --cpu "$UI_CPU" --memory "$UI_MEMORY" \
  --min-replicas "$UI_MIN_REPLICAS" --max-replicas "$UI_MAX_REPLICAS" \
  --scale-rule-name http-concurrency --scale-rule-type http \
  --scale-rule-http-concurrency "$UI_SCALE_CONCURRENCY" \
  -o none
az containerapp ingress sticky-sessions set --name "$UI_APP" --resource-group "$RG" \
  --affinity sticky -o none

LATEST="$(az containerapp show --name "$UI_APP" --resource-group "$RG" \
  --query properties.latestRevisionName -o tsv)"
health=""
for _ in $(seq 1 20); do
  health="$(az containerapp revision show --name "$UI_APP" --resource-group "$RG" \
    --revision "$LATEST" --query properties.healthState -o tsv)"
  [[ "$health" == Healthy ]] && break
  sleep 15
done
if [[ "$health" != Healthy ]]; then
  err "$LATEST is '$health' after 5 minutes"
  exit 1
fi
ok "$LATEST healthy"
show
