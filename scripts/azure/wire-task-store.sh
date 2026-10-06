#!/usr/bin/env bash
set -euo pipefail
# =============================================================================
# The proxy's task store on the Flexible Server (#566).
# =============================================================================
# `services/neo4j-proxy/src/routes/tasks.ts` keeps the merged task list of
# /api/tasks in Postgres. On Azure it had no setting, fell back to the compose
# host `postgres` (the container retired on 2026-10-04, ADR-041), and every
# /tasks call answered 500 with `getaddrinfo ENOTFOUND postgres`.
#
#   1. the database `taskdb` on the Flexible Server (the proxy creates its
#      table on first use);
#   2. on mvhd-neo4j-proxy: the identity that reads Key Vault (the one the UI
#      and Keycloak use), the secret `task-db-password` as a Key Vault
#      reference to `postgres-admin-password` (ADR-036: one copy, never
#      printed, never copied), and TASK_DB_HOST/USER/NAME/SSL/PASSWORD.
#
# The proxy connects as the server admin, as the EDC services do; a role of
# its own needs SQL as the admin and is a later step.
#
# Usage:  scripts/azure/wire-task-store.sh          create and wire
#         scripts/azure/wire-task-store.sh --check  report, change nothing
# Needs the PIM role for the database (Container Apps Contributor alone cannot
# write to the Flexible Server). Idempotent. The settings make a new proxy
# revision.
# =============================================================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/azure/env.sh
source "$SCRIPT_DIR/env.sh"

MODE="${1:-wire}"
DB="taskdb"
SECRET_NAME="task-db-password"
IDENTITY_NAME="${TASK_DB_IDENTITY:-id-mvhd-claude-federation}"

report() {
  if az postgres flexible-server db show --server-name "$PG_FLEX_NAME" \
       --resource-group "$RG" --name "$DB" -o none 2>/dev/null; then
    echo "  present  database ${DB} on ${PG_FLEX_NAME}"
  else
    echo "  MISSING  database ${DB} on ${PG_FLEX_NAME}"
  fi
  az containerapp show --name "$NEO4J_PROXY_APP" --resource-group "$RG" \
    --query "properties.template.containers[0].env[?starts_with(name,'TASK_DB')].{name:name,value:value,secretRef:secretRef}" \
    -o table
}

if [ "$MODE" = "--check" ]; then report; exit 0; fi

if az postgres flexible-server db show --server-name "$PG_FLEX_NAME" \
     --resource-group "$RG" --name "$DB" -o none 2>/dev/null; then
  ok "${DB} exists on ${PG_FLEX_NAME}"
else
  az postgres flexible-server db create --server-name "$PG_FLEX_NAME" \
    --resource-group "$RG" --name "$DB" -o none
  ok "${DB} created on ${PG_FLEX_NAME}"
fi

KV_URI="$(az keyvault show --name "$KEY_VAULT_NAME" --query properties.vaultUri -o tsv)"
SECRET_URL="${KV_URI%/}/secrets/postgres-admin-password"
IDENTITY_ID="$(az identity show --name "$IDENTITY_NAME" --resource-group "$RG" --query id -o tsv)"

log "${NEO4J_PROXY_APP}: identity, secret reference, settings"
az containerapp identity assign --name "$NEO4J_PROXY_APP" --resource-group "$RG" \
  --user-assigned "$IDENTITY_ID" -o none
az containerapp secret set --name "$NEO4J_PROXY_APP" --resource-group "$RG" \
  --secrets "${SECRET_NAME}=keyvaultref:${SECRET_URL},identityref:${IDENTITY_ID}" -o none
az containerapp update --name "$NEO4J_PROXY_APP" --resource-group "$RG" \
  --set-env-vars "TASK_DB_HOST=${PG_HOST}" "TASK_DB_USER=${PG_ADMIN}" \
                 "TASK_DB_NAME=${DB}" "TASK_DB_SSL=require" \
                 "TASK_DB_PASSWORD=secretref:${SECRET_NAME}" -o none
ok "${NEO4J_PROXY_APP} reads the task store at ${PG_HOST}/${DB}"
report
