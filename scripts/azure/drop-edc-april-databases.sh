#!/usr/bin/env bash
# =============================================================================
# Drop the April EDC databases on the Flexible Server (#594, ADR-055)
# =============================================================================
#   drop-edc-april-databases.sh plan   read only: guards and what would go
#   drop-edc-april-databases.sh drop   drop them, then list what is left
#
# ADR-055 moved the EDC apps to fresh *_v018 databases and kept the April ones
# as a rollback: controlplane (2026-10-05), identityhub, issuerservice, and the
# data planes' dataplane and dataplane_omop (#593, 2026-10-07). This drops
# those five once the rollback window is over. It refuses unless:
#   - it is 2026-10-12 or later (Europe/Berlin), and
#   - every active revision of the five EDC apps uses a *_v018 database, so
#     no rollback to an April revision is live.
#
# Dropping a database needs write access to the Flexible Server, which the
# maintainer account does not have, so .github/workflows/edc-drop-april-databases.yml
# runs this as the CI identity. Afterwards remove ~/.mvhd/edc-v018-rollback/,
# whose definitions point at the dropped databases.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=env.sh
source "${SCRIPT_DIR}/env.sh"

MODE="${1:-plan}"
NOT_BEFORE="2026-10-12"
APRIL_DBS=(controlplane dataplane dataplane_omop identityhub issuerservice)
APPS=("$CONTROLPLANE_APP" mvhd-identityhub mvhd-issuerservice mvhd-dp-fhir mvhd-dp-omop)

case "$MODE" in plan | drop) ;; *) sed -n '5,6p' "$0"; exit 64 ;; esac

blocked=0
today=$(TZ=Europe/Berlin date +%F)
if [[ "$today" < "$NOT_BEFORE" ]]; then
  echo "  WAIT     today is ${today}; not before ${NOT_BEFORE}"
  blocked=1
else
  echo "  ok       ${today} is on or after ${NOT_BEFORE}"
fi

# Every active revision, not only the template: a rollback can leave an April
# revision taking traffic beside the new one.
for app in "${APPS[@]}"; do
  dbs=$(az containerapp revision list --name "$app" --resource-group "$RG" -o json | python3 -c '
import json, sys
dbs = set()
for r in json.load(sys.stdin):
    if not r["properties"].get("active"):
        continue
    for c in r["properties"]["template"]["containers"]:
        for e in c.get("env") or []:
            if e["name"] == "EDC_DATASOURCE_DEFAULT_URL":
                dbs.add(e.get("value", "").split("/")[-1].split("?")[0])
print(" ".join(sorted(dbs)))')
  if [ -z "$dbs" ]; then
    echo "  BLOCKED  ${app}: no active revision with a datasource URL"
    blocked=1
  elif [ -n "$(tr ' ' '\n' <<<"$dbs" | grep -v '^$' | grep -v '_v018$' || true)" ]; then
    echo "  BLOCKED  ${app}: an active revision uses ${dbs}"
    blocked=1
  else
    echo "  ok       ${app}: ${dbs}"
  fi
done

have=$(az postgres flexible-server db list --server-name "$PG_FLEX_NAME" \
  --resource-group "$RG" --query "[].name" -o tsv)
for db in "${APRIL_DBS[@]}"; do
  if grep -qx "$db" <<<"$have"; then echo "  present  ${db}"; else echo "  gone     ${db}"; fi
done

if [ "$MODE" = plan ]; then
  if [ "$blocked" -eq 0 ]; then
    ok "guards pass; '$0 drop' would drop the April databases listed as present"
  else
    warn "guards block the drop"
  fi
  exit 0
fi

[ "$blocked" -eq 0 ] || { err "not dropping: a guard above blocks it"; exit 1; }
for db in "${APRIL_DBS[@]}"; do
  grep -qx "$db" <<<"$have" || continue
  az postgres flexible-server db delete --server-name "$PG_FLEX_NAME" \
    --resource-group "$RG" --name "$db" --yes -o none
  ok "dropped ${db}"
done
echo "Left on ${PG_FLEX_NAME}:"
az postgres flexible-server db list --server-name "$PG_FLEX_NAME" --resource-group "$RG" \
  --query "[].name" -o tsv | sed 's/^/  /'
