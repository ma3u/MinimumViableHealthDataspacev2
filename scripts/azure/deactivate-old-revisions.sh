#!/usr/bin/env bash
# =============================================================================
# Leave only the latest revision of a Container App active.
# =============================================================================
#   deactivate-old-revisions.sh <app>
#
# For Neo4j, after anything that can create a revision: an image or env change,
# and also a scale change, because minReplicas and maxReplicas are part of the
# revision template.
#
# Single revision mode keeps the last *ready* revision running until the new
# one is ready. Neo4j holds a store lock on the shared /data share, so the new
# one never can be: it crash-loops on `store_lock` while the old one serves.
# Revision 181 did that 111 times between 2026-10-03 and 2026-10-04, created by
# the off-hours schedule changing minReplicas (docs/gotchas.md, 2026-10-02 and
# 2026-10-04). Stopping the others costs a short outage, which a single-writer
# database on a shared volume cannot avoid.
#
# Exit codes: 0 only the latest revision is active, 1 it is not, 2 usage.
set -euo pipefail

RESOURCE_GROUP="${RESOURCE_GROUP:-rg-mvhd-dev}"

[ "$#" -eq 1 ] || {
  echo "usage: $0 <app>" >&2
  exit 2
}
app="$1"

latest=$(az containerapp show --name "$app" --resource-group "$RESOURCE_GROUP" \
  --query "properties.latestRevisionName" -o tsv)
if [ -z "$latest" ]; then
  echo "$app: no latest revision found" >&2
  exit 1
fi

active=$(az containerapp revision list --name "$app" --resource-group "$RESOURCE_GROUP" \
  --query "[?properties.active].name" -o tsv)
for rev in $active; do
  [ "$rev" = "$latest" ] && continue
  echo "$app: deactivating $rev so $latest can take over"
  az containerapp revision deactivate --name "$app" --resource-group "$RESOURCE_GROUP" \
    --revision "$rev" -o none
done

remaining=$(az containerapp revision list --name "$app" --resource-group "$RESOURCE_GROUP" \
  --query "[?properties.active].name" -o tsv | tr '\n' ' ')
if [ "${remaining% }" != "$latest" ]; then
  echo "$app: active revisions are '${remaining% }', expected only $latest" >&2
  exit 1
fi
echo "$app: only $latest is active"
