#!/usr/bin/env bash
# =============================================================================
# The five EDC databases for the 0.18 build, beside the April ones (ADR-055)
# =============================================================================
#   create-edc-v018-databases.sh          create what is missing, then list
#   create-edc-v018-databases.sh check    list only
#
# ADR-055 moves the EDC apps to the build compose and CI run, on fresh
# databases: the April tables were made by a build whose schema is unknown,
# and leaving them untouched keeps a rollback that is only a revision away.
# The 0.18 services create their own tables on first start
# (EDC_SQL_SCHEMA_AUTOCREATE=true).
#
# Creating a database needs write access to the Flexible Server, which the
# maintainer account does not have (Container Apps Contributor only), so the
# workflow .github/workflows/edc-v018-databases.yml runs this as the CI
# identity. Running it again is a no-op.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/env.sh"

DBS=(controlplane_v018 dataplane_v018 dataplane_omop_v018 identityhub_v018 issuerservice_v018)

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
[ "$missing" -eq 0 ] || { err "not all five databases exist on ${PG_FLEX_NAME}"; exit 1; }
ok "all five 0.18 databases exist on ${PG_FLEX_NAME}"
