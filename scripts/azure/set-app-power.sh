#!/usr/bin/env bash
# =============================================================================
# Stop or start Container Apps, for real (ADR-053).
# =============================================================================
#   set-app-power.sh stop  <app> [<app> ...]
#   set-app-power.sh start <app> [<app> ...]
#
# The off-hours schedule used to set min=0 and trust scale-to-zero. That only
# reaches zero for an app nobody calls, and in this stack almost everything is
# called by something: the EDC services poll Vault, the enricher holds a NATS
# connection, the crawler reached Neo4j and the UI every five minutes. ADR-047
# recorded it for Vault ("it never reached zero anyway"); the bill for nights
# and weekends (PR #482) says it held for more than Vault.
#
# A stopped app has no replicas whatever calls it, and keeps its revision,
# scale settings, secrets and ingress, so a start brings back exactly what was
# stopped. The CLI has no command for it, so this calls the ARM operations
# ContainerApps_Stop and ContainerApps_Start, and then waits until the app
# reports the state it was asked for.
#
# Exit codes: 0 every app reached the state, 1 at least one did not, 2 usage.
set -euo pipefail

API_VERSION="2024-03-01"
RESOURCE_GROUP="${RESOURCE_GROUP:-rg-mvhd-dev}"
WAIT_SECONDS="${WAIT_SECONDS:-180}"

usage() {
  echo "usage: $0 stop|start <app> [<app> ...]" >&2
  exit 2
}

[ "$#" -ge 2 ] || usage
action="$1"
shift
case "$action" in
  stop) want="Stopped" ;;
  start) want="Running" ;;
  *) usage ;;
esac

# runningStatus is Progressing, Running, Ready, Stopped or Suspended. The API
# documents both Running and Ready as settled states of a started app, and
# which one this stack reports has not been measured yet, so either counts.
is_wanted() {
  case "$action:$1" in
    stop:Stopped | start:Running | start:Ready) return 0 ;;
    *) return 1 ;;
  esac
}

status_of() {
  az containerapp show --name "$1" --resource-group "$RESOURCE_GROUP" \
    --query "properties.runningStatus" -o tsv 2>/dev/null || echo "unknown"
}

failed=0
for app in "$@"; do
  id=$(az containerapp show --name "$app" --resource-group "$RESOURCE_GROUP" \
    --query id -o tsv 2>/dev/null || true)
  if [ -z "$id" ]; then
    echo "::error::$app not found in $RESOURCE_GROUP"
    failed=1
    continue
  fi
  now=$(status_of "$app")
  if is_wanted "$now"; then
    echo "  $app: already $now"
    continue
  fi
  echo "  $app: $now -> $action"
  if ! az rest --method post \
    --url "https://management.azure.com${id}/${action}?api-version=${API_VERSION}" \
    -o none; then
    echo "::error::$action failed for $app"
    failed=1
    continue
  fi
  # A start reports Running once a replica is scheduled; an app at min=0
  # with no traffic may stay at Running with no replica, which is correct.
  reached=""
  for _ in $(seq 1 $((WAIT_SECONDS / 10))); do
    now=$(status_of "$app")
    if is_wanted "$now"; then
      reached=1
      break
    fi
    sleep 10
  done
  if [ -n "$reached" ]; then
    echo "  $app: $now"
  else
    echo "::error::$app is '$now' after ${WAIT_SECONDS}s, expected $want"
    failed=1
  fi
done

exit "$failed"
