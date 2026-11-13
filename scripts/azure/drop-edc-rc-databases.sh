#!/usr/bin/env bash
# =============================================================================
# Drop the database set of a previous EDC release candidate (#930)
# =============================================================================
#   drop-edc-rc-databases.sh plan <suffix>   read only: guards and what would go
#   drop-edc-rc-databases.sh drop <suffix>   drop them, then list what is left
#
# Each release candidate the hub moves to starts on its own databases,
# <name><suffix> for the control plane, IdentityHub and IssuerService, and the
# set before it stays as the rollback (env.sh, EDC_DB_SUFFIX). Once the new RC
# has run through an off-hours stop and start, the old set can go: e.g.
# `drop _v1` drops RC5's controlplane_v1, identityhub_v1 and issuerservice_v1.
# siglet_v1 is not part of a set and is never dropped here.
#
# It refuses unless:
#   - the suffix is not the one the apps run on (EDC_DB_SUFFIX);
#   - the Flexible Server is Ready (it stops off hours, ADR-053);
#   - every active revision of the control plane, IdentityHub and
#     IssuerService reads only its database of the current set;
#   - no other app or job names one of the databases in its environment.
#
# The keys the old set's participants had in Vault are not touched.
#
# Dropping a database needs write access to the Flexible Server, which the
# maintainer account does not have, so .github/workflows/edc-drop-rc-databases.yml
# runs this as the CI identity.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=env.sh
source "${SCRIPT_DIR}/env.sh"

MODE="${1:-}"
OLD="${2:-}"
case "$MODE" in plan | drop) ;; *) sed -n '5,6p' "$0"; exit 64 ;; esac
[[ "$OLD" =~ ^_v1[a-z0-9]*$ ]] || { err "the suffix looks like _v1 or _v1rc6, not '${OLD}'"; exit 64; }
[ "$OLD" != "$EDC_DB_SUFFIX" ] || { err "${OLD} is the set the apps run on (EDC_DB_SUFFIX); refusing"; exit 1; }

DROP_DBS=("controlplane${OLD}" "identityhub${OLD}" "issuerservice${OLD}")
CORE_APPS=("${CONTROLPLANE_APP}:controlplane${EDC_DB_SUFFIX}"
           "${IDENTITYHUB_APP}:identityhub${EDC_DB_SUFFIX}"
           "${ISSUER_APP}:issuerservice${EDC_DB_SUFFIX}")

# The databases an env value names, if it is a Postgres URL or a bare PGDATABASE.
DB_OF_ENV='
import json, sys
def dbs_of(containers):
    out = set()
    for c in containers or []:
        for e in c.get("env") or []:
            v = str(e.get("value") or "")
            for part in v.split():
                if "5432/" in part:
                    out.add(part.split("5432/", 1)[1].split("?")[0].split("\"")[0])
            if e.get("name") == "PGDATABASE" and v:
                out.add(v)
    return out
'

blocked=0
block() { echo "  BLOCKED  $*"; blocked=1; }

state=$(az postgres flexible-server show --name "$PG_FLEX_NAME" --resource-group "$RG" \
  --query state -o tsv 2>/dev/null || echo "unknown")
if [ "$state" = "Ready" ]; then
  echo "  ok       ${PG_FLEX_NAME} is Ready"
else
  block "${PG_FLEX_NAME} is ${state}; run during office hours (ADR-053) or start it first"
fi

# Every active revision, not only the template: a revision left taking traffic
# beside the new one would still read the old database. The IssuerService's
# membership attestation reads its own database too, so a set is compared, not
# a single name.
for entry in "${CORE_APPS[@]}"; do
  app="${entry%%:*}"
  want="${entry##*:}"
  dbs=$(az containerapp revision list --name "$app" --resource-group "$RG" -o json |
    python3 -c "${DB_OF_ENV}"'
dbs = set()
for r in json.load(sys.stdin):
    if r["properties"].get("active"):
        dbs |= dbs_of(r["properties"]["template"]["containers"])
print(" ".join(sorted(dbs)))')
  if [ "$dbs" = "$want" ]; then
    echo "  ok       ${app}: ${dbs}"
  else
    block "${app}: active revisions read '${dbs}', not only ${want}"
  fi
done

# As files: the definitions of every app run to megabytes, more than an
# argument may carry (docs/gotchas.md, 2026-11-11).
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
az containerapp list --resource-group "$RG" -o json >"${tmp}/apps.json"
az containerapp job list --resource-group "$RG" -o json >"${tmp}/jobs.json"
users=$(python3 -c "${DB_OF_ENV}"'
targets = set(sys.argv[1].split())
core = set(sys.argv[2].split())
hits = []
for kind, path in (("app", sys.argv[3]), ("job", sys.argv[4])):
    for it in json.load(open(path)):
        if it["name"] in core:
            continue
        found = dbs_of(it["properties"]["template"]["containers"]) & targets
        if found:
            hits.append(kind + " " + it["name"] + " (" + " ".join(sorted(found)) + ")")
print("; ".join(hits))' \
  "${DROP_DBS[*]}" "${CONTROLPLANE_APP} ${IDENTITYHUB_APP} ${ISSUER_APP}" \
  "${tmp}/apps.json" "${tmp}/jobs.json")
if [ -z "$users" ]; then
  echo "  ok       no other app or job names these databases"
else
  block "named in an environment: ${users}"
fi

have=$(az postgres flexible-server db list --server-name "$PG_FLEX_NAME" \
  --resource-group "$RG" --query "[].name" -o tsv 2>/dev/null || true)
for db in "${DROP_DBS[@]}"; do
  if grep -qx "$db" <<<"$have"; then echo "  present  ${db}"; else echo "  gone     ${db}"; fi
done

if [ "$MODE" = plan ]; then
  if [ "$blocked" -eq 0 ]; then
    ok "guards pass; 'drop ${OLD}' would drop the databases listed as present"
  else
    warn "guards block the drop"
  fi
  exit 0
fi

[ "$blocked" -eq 0 ] || { err "not dropping: a guard above blocks it"; exit 1; }
for db in "${DROP_DBS[@]}"; do
  grep -qx "$db" <<<"$have" || continue
  az postgres flexible-server db delete --server-name "$PG_FLEX_NAME" \
    --resource-group "$RG" --name "$db" --yes -o none
  ok "dropped ${db}"
done
echo "Left on ${PG_FLEX_NAME}:"
az postgres flexible-server db list --server-name "$PG_FLEX_NAME" --resource-group "$RG" \
  --query "[].name" -o tsv | sed 's/^/  /'
