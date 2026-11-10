#!/usr/bin/env bash
# =============================================================================
# Drop the EDC 0.18 databases on the Flexible Server (#927 step 6)
# =============================================================================
#   drop-edc-v018-databases.sh plan   read only: guards and what would go
#   drop-edc-v018-databases.sh drop   drop them, then list what is left
#
# EDC 1.0 has run the hub since 2026-11-06 (ADR-078), on controlplane_v1,
# identityhub_v1, issuerservice_v1 and siglet_v1. The 0.18 data planes and the
# 2026-03 CFM apps were deleted on 2026-11-09 (#927 step 5), after Matthias
# decided there is no way back to 0.18 (step 3). What they left:
#
#   controlplane_v018 identityhub_v018 issuerservice_v018   0.18 (ADR-055)
#   dataplane_v018 dataplane_omop_v018                      the 0.18 data planes
#   siglet_v2                                               the 0.18 siglet (sha-54382c8)
#   siglet                                                  the July siglet, before 0.18
#
# This drops those seven. It leaves cfm (ADR-085 keeps it, emptied: the
# workflow does that inside the environment), keycloak, vault, taskdb and the
# _v1 databases. It refuses unless:
#   - the Flexible Server is Ready (it stops off hours, ADR-053);
#   - every active revision of the control plane, IdentityHub and
#     IssuerService reads a *_v1 database, and every active revision of the
#     siglet reads siglet_v1;
#   - none of the deleted 0.18 or 2026-03 CFM apps exists, and no CFM app of
#     ADR-085 decision 4 exists yet (it would hold data in cfm);
#   - no other app or job names one of these databases or cfm in its
#     environment.
#
# Dropping a database needs write access to the Flexible Server, which the
# maintainer account does not have, so .github/workflows/edc-retire-v018-azure.yml
# runs this as the CI identity.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=env.sh
source "${SCRIPT_DIR}/env.sh"

MODE="${1:-plan}"
DROP_DBS=(controlplane_v018 identityhub_v018 issuerservice_v018
          dataplane_v018 dataplane_omop_v018 siglet_v2 siglet)
# The four 1.0 apps with a database, and the one each must read.
CORE_APPS=("${CONTROLPLANE_APP}:controlplane_v1" "${IDENTITYHUB_APP}:identityhub_v1"
           "${ISSUER_APP}:issuerservice_v1" "${SIGLET_APP}:siglet_v1")
# Gone since step 5; any of them back means something still runs 0.18 or the
# 2026-03 CFM. mvhd-cfm-* also matches ADR-085's new apps, which would use cfm.
GONE_APP_PATTERN='^(mvhd-dp-fhir|mvhd-dp-omop|mvhd-tenant-mgr|mvhd-provision-mgr|mvhd-cfm-.*|mvhd-remove-tenants)$'

case "$MODE" in plan | drop) ;; *) sed -n '5,6p' "$0"; exit 64 ;; esac

# The database an env value names, if it is a Postgres URL or a bare PGDATABASE.
DB_OF_ENV='
import json, sys
def dbs_of(containers):
    out = set()
    for c in containers or []:
        for e in c.get("env") or []:
            v = str(e.get("value") or "")
            if "5432/" in v:
                out.add(v.split("5432/", 1)[1].split("?")[0].split("\"")[0])
            elif e.get("name") == "PGDATABASE" and v:
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
# beside the new one would still read the old database.
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

apps_json=$(az containerapp list --resource-group "$RG" -o json)
jobs_json=$(az containerapp job list --resource-group "$RG" -o json)

gone=$(python3 -c '
import json, re, sys
pat = re.compile(sys.argv[1])
names = [a["name"] for a in json.loads(sys.argv[2])] + [j["name"] for j in json.loads(sys.argv[3])]
print(" ".join(sorted(n for n in names if pat.match(n))))' \
  "$GONE_APP_PATTERN" "$apps_json" "$jobs_json")
if [ -z "$gone" ]; then
  echo "  ok       no 0.18 data plane and no CFM app or job exists"
else
  block "these exist and would use a 0.18 database or cfm: ${gone}"
fi

# Any other app or job whose environment names one of the databases, or cfm.
users=$(python3 -c "${DB_OF_ENV}"'
targets = set(sys.argv[1].split()) | {"cfm"}
core = set(sys.argv[2].split())
hits = []
for kind, items in (("app", json.loads(sys.argv[3])), ("job", json.loads(sys.argv[4]))):
    for it in items:
        if it["name"] in core:
            continue
        found = dbs_of(it["properties"]["template"]["containers"]) & targets
        if found:
            hits.append(kind + " " + it["name"] + " (" + " ".join(sorted(found)) + ")")
print("; ".join(hits))' \
  "${DROP_DBS[*]}" "${CONTROLPLANE_APP} ${IDENTITYHUB_APP} ${ISSUER_APP} ${SIGLET_APP}" \
  "$apps_json" "$jobs_json")
if [ -z "$users" ]; then
  echo "  ok       no other app or job names these databases or cfm"
else
  block "named in an environment: ${users}"
fi

have=$(az postgres flexible-server db list --server-name "$PG_FLEX_NAME" \
  --resource-group "$RG" --query "[].name" -o tsv 2>/dev/null || true)
for db in "${DROP_DBS[@]}"; do
  if grep -qx "$db" <<<"$have"; then echo "  present  ${db}"; else echo "  gone     ${db}"; fi
done
if grep -qx cfm <<<"$have"; then
  echo "  keep     cfm (emptied by the in-environment job, ADR-085)"
else
  echo "  missing  cfm (ADR-085 keeps it; 13-postgres-flexible-server.sh 2 creates it)"
fi

if [ "$MODE" = plan ]; then
  if [ "$blocked" -eq 0 ]; then
    ok "guards pass; '$0 drop' would drop the databases listed as present"
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
