#!/usr/bin/env bash
# =============================================================================
# Deactivate revisions that serve nothing but still run replicas.
# =============================================================================
#   retire-stale-revisions.sh [--dry-run] [--when-healthy] [<app> ...]
#
# With no app named, every Container App in $RESOURCE_GROUP is checked.
#
# Every app here runs in single-revision mode, where a new revision replaces
# the old one only once the new one is healthy. When the new one never gets
# healthy, the old one stays active with no traffic and keeps its replicas.
# On 2026-10-04 that was four apps:
#
#   - mvhd-neo4j: --0000179 held /data/databases/store_lock on the shared
#     neo4j-data share, so --0000181, which had all the traffic, crash-looped
#     104 times on "Lock file has been locked by another process". The graph
#     was down while a healthy copy ran beside it serving nothing.
#   - mvhd-dp-fhir, mvhd-dp-omop: revisions from April, ActivationFailed,
#     two replicas each, billed every hour since (#421).
#   - mvhd-postgres: --0000148 idle beside a --0000149 that cannot start.
#
# A stop and a start (ADR-053, set-app-power.sh) keep every active revision,
# so a start brings the stale ones back too. The start job therefore runs this
# before it starts any app.
#
# Retired: an active revision that is not the app's latest revision and has
# no traffic. Such a revision answers no request, so deactivating it loses
# nothing; `az containerapp revision activate` brings it back. Apps in
# multiple-revision mode are skipped, since there a revision without traffic
# may be on purpose.
#
# --when-healthy: retire only once the app's latest revision reports Healthy
# (waiting up to WAIT_SECONDS, default 600), and otherwise leave the old one
# serving. For a deploy, where the old revision is the fallback: without it,
# deploys of Keycloak and Grafana retired the old revision while the new one
# was still activating, and sign-in answered 404 (2026-10-05, 2026-10-06).
# Not for the Neo4j case above, where the latest revision cannot become
# healthy until the old one is gone.
#
# Exit codes: 0 done (or nothing to do), 1 a deactivation failed.
set -euo pipefail

RESOURCE_GROUP="${RESOURCE_GROUP:-rg-mvhd-dev}"

dry_run=""
when_healthy=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --dry-run) dry_run=1; shift ;;
    --when-healthy) when_healthy=1; shift ;;
    *) break ;;
  esac
done
WAIT_SECONDS="${WAIT_SECONDS:-600}"

# Written for bash 3.2 as well (macOS): no mapfile, no ${var,,}.
if [ "$#" -eq 0 ]; then
  # shellcheck disable=SC2046 # app names have no spaces
  set -- $(az containerapp list --resource-group "$RESOURCE_GROUP" \
    --query "[].name" -o tsv)
fi

failed=0
retired=0
for app in "$@"; do
  mode=$(az containerapp show --name "$app" --resource-group "$RESOURCE_GROUP" \
    --query "properties.configuration.activeRevisionsMode" -o tsv)
  latest=$(az containerapp show --name "$app" --resource-group "$RESOURCE_GROUP" \
    --query "properties.latestRevisionName" -o tsv)
  if [ "$(echo "$mode" | tr '[:upper:]' '[:lower:]')" != "single" ]; then
    echo "  $app: $mode revision mode, skipped"
    continue
  fi
  if [ -n "$when_healthy" ]; then
    health=""
    waited=0
    while :; do
      health=$(az containerapp revision show --name "$app" --resource-group "$RESOURCE_GROUP" \
        --revision "$latest" --query "properties.healthState" -o tsv 2>/dev/null || true)
      [ "$health" = "Healthy" ] && break
      [ "$waited" -ge "$WAIT_SECONDS" ] && break
      sleep 10
      waited=$((waited + 10))
    done
    if [ "$health" != "Healthy" ]; then
      echo "  $app: latest revision $latest is '${health:-unknown}' after ${waited}s; the old one keeps serving"
      continue
    fi
  fi
  stale=$(az containerapp revision list --name "$app" \
    --resource-group "$RESOURCE_GROUP" \
    --query "[?properties.active && name != '$latest' && (properties.trafficWeight == \`0\` || properties.trafficWeight == null)].name" \
    -o tsv)
  for rev in $stale; do
    if [ -n "$dry_run" ]; then
      echo "  $app: would deactivate $rev (latest is $latest)"
      continue
    fi
    echo "  $app: deactivating $rev (latest is $latest)"
    if az containerapp revision deactivate --name "$app" \
      --resource-group "$RESOURCE_GROUP" --revision "$rev" -o none; then
      retired=$((retired + 1))
    else
      echo "::error::could not deactivate $rev"
      failed=1
    fi
  done
done

echo "Retired $retired stale revision(s)${dry_run:+ (dry run, nothing changed)}."
exit "$failed"
