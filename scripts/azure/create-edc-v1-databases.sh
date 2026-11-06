#!/usr/bin/env bash
# =============================================================================
# The four databases for EDC 1.0, beside the 0.18 ones (#881, ADR-078)
# =============================================================================
#   create-edc-v1-databases.sh          create what is missing, then list
#   create-edc-v1-databases.sh check    list only
#
# EDC ships no migration from 0.18 to 1.0, and the schemas differ, so the 1.0
# launchers start on fresh databases and create their own tables. The 0.18
# databases (create-edc-v018-databases.sh) stay untouched: a rollback is the
# saved app definition, which names them (migrate-edc-to-v1.sh rollback).
# siglet_v1 is for siglet 0.1.6, which refuses a database a newer build
# migrated, so the 0.18 siglet keeps its own.
#
# Creating a database needs write access to the Flexible Server, which the
# maintainer account does not have (Container Apps Contributor only), so the
# workflow .github/workflows/edc-v1-databases.yml runs this as the CI
# identity. Running it again is a no-op.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=env.sh
source "${SCRIPT_DIR}/env.sh"

DBS=(controlplane_v1 identityhub_v1 issuerservice_v1 siglet_v1)

if [ "${1:-}" != check ]; then
  for db in "${DBS[@]}"; do
    if az postgres flexible-server db show --server-name "$PG_FLEX_NAME" \
         --resource-group "$RG" --name "$db" -o none 2>/dev/null; then
      ok "${db} exists"
    else
      az postgres flexible-server db create --server-name "$PG_FLEX_NAME" \
        --resource-group "$RG" --name "$db" -o none ||
        { err "could not create ${db}"; exit 1; }
      ok "${db} created"
    fi
  done
fi

# Read back from the server (ADR-031).
have=$(az postgres flexible-server db list --server-name "$PG_FLEX_NAME" \
  --resource-group "$RG" --query "[].name" -o tsv)
missing=0
for db in "${DBS[@]}"; do
  if grep -qx "$db" <<<"$have"; then echo "  present  ${db}"; else echo "  MISSING  ${db}"; missing=1; fi
done
[ "$missing" -eq 0 ] || { err "not all four 1.0 databases exist on ${PG_FLEX_NAME}"; exit 1; }
ok "all four 1.0 databases exist on ${PG_FLEX_NAME}"
