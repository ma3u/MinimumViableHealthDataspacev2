#!/usr/bin/env bash
# =============================================================================
# The push data plane's database and role on the Flexible Server (ADR-095)
# =============================================================================
#   create-dataplane-database.sh          same as plan
#   create-dataplane-database.sh plan     say what exists; change nothing on the server
#   create-dataplane-database.sh apply    the role `dataplane`, the database
#                                         `dataplane_v1` owned by it, read back
#
# The data plane is the first service here with a role of its own: the EDC
# apps, siglet and the task store connect as the server's admin, with the
# admin's password. A data plane that is pushed data for an SPE gets the one
# database it needs and nothing else on the server.
#
# Why not a line in create-edc-v1-databases.sh: that script creates empty
# databases through ARM and its set moves with every EDC release candidate
# (EDC_DB_SUFFIX). A role is SQL, not an ARM resource, and the Flexible Server
# admits only Azure addresses, so the work runs as a one-shot job inside the
# environment (scripts/azure/dataplane/database-in-env.sh), the way
# edc-retire-v018-azure.yml reaches the server.
#
# Both passwords stay in Key Vault and reach the job as references:
#   postgres-admin-password   the admin's, to create the role
#   dataplane-db-password     the role's; `23-dataplane.sh secrets` generates
#                             it first. Running `apply` again sets the role's
#                             password to Key Vault's value: that is the rotation.
# This shell never holds either, so the workflow
# .github/workflows/dataplane-database.yml can run it as the CI identity, which
# may not read the vault. `plan` also creates and deletes the job: it changes
# nothing on the server, but it is not free of Azure writes.
#
# Needs: az (logged in) with rights to create a Container Apps job and to
# assign KV_READER_IDENTITY to it; python3.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=env.sh
source "${SCRIPT_DIR}/env.sh"
# shellcheck source=dataplane/job-lib.sh
source "${SCRIPT_DIR}/dataplane/job-lib.sh"

MODE="${1:-plan}"
case "$MODE" in plan | apply) ;; *) sed -n '5,7p' "$0"; exit 2 ;; esac
DB="${DATAPLANE_DB:-dataplane_v1}"
ROLE="${DATAPLANE_DB_USER:-dataplane}"

az account get-access-token --query expiresOn -o none 2>/dev/null || {
  err "az is not signed in, or its token expired: az login first"
  exit 2
}

DP_JOB_ENV="MODE=${MODE}
PGHOST=${PG_HOST}
PGPORT=${PG_PORT}
PGUSER=${PG_ADMIN}
DB=${DB}
ROLE=${ROLE}"
DP_JOB_KV_SECRETS="PGPASSWORD=postgres-admin-password
ROLE_PASSWORD=dataplane-db-password"

# The image brings psql and bash; nothing is installed at run time. Major 16,
# as the server (POSTGRES_VERSION in env.sh).
dp_run_job mvhd-dataplane-database "docker.io/library/postgres:16-alpine" 300 ":" \
  database-in-env.sh "${SCRIPT_DIR}/dataplane/database-in-env.sh"

# What ARM itself says, after the job (ADR-031). The role is not an ARM
# resource: its proof is the job's last line.
if az postgres flexible-server db show --server-name "$PG_FLEX_NAME" --resource-group "$RG" \
     --name "$DB" -o none 2>/dev/null; then
  echo "  present  database ${DB} on ${PG_FLEX_NAME}"
else
  echo "  MISSING  database ${DB} on ${PG_FLEX_NAME}"
  [ "$MODE" = plan ] || { err "${DB} is not on ${PG_FLEX_NAME} after apply"; exit 1; }
fi
