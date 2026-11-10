#!/usr/bin/env bash
# =============================================================================
# Phase 13: Azure Database for PostgreSQL Flexible Server (ADR-041)
# =============================================================================
# Replaces the ephemeral `mvhd-postgres` container app as the system of record.
#
# Why this exists: Postgres cannot keep its data directory on an SMB Azure
# Files share, because `initdb` chmods PGDATA and SMB returns EPERM. ACA offers
# no block storage, and Azure Files NFS needs a Premium FileStorage account and
# a VNet-injected environment, neither of which this estate has. So the
# container app has been running on ephemeral storage and losing every database
# on each replica restart. See docs/gotchas.md (2026-10-02) and ADR-041.
#
#   ./scripts/azure/13-postgres-flexible-server.sh check   # read-only
#   ./scripts/azure/13-postgres-flexible-server.sh 1       # create the server
#   ./scripts/azure/13-postgres-flexible-server.sh 2       # create keycloak and cfm
#   ./scripts/azure/13-postgres-flexible-server.sh 3       # cut Keycloak over
#   ./scripts/azure/13-postgres-flexible-server.sh 3b      # retired (#927)
#   ./scripts/azure/13-postgres-flexible-server.sh 4       # retire mvhd-postgres
#   ./scripts/azure/13-postgres-flexible-server.sh 4b      # retire the pg-data share
#
# Run them in order and read the output. Each phase verifies itself and exits
# non-zero rather than continuing on a bad state.
#
# Phase 3 restarts Keycloak and re-imports the realm, so expect a short outage.
# Phase 4 is destructive and deliberately separate: run it only once phase 3 has
# been verified, because it deletes the old container app.
#
# Cost (Azure Retail Prices API, westeurope, PAYG, read 2026-10-02):
#   B1ms compute  $0.0199/h   730 h   $14.53/month
#   32 GiB storage $0.1369/GB          $4.38/month
#   backup at 7-day retention, within 100% of storage, included
#   total $18.91/month, always on: Keycloak stays up overnight and needs it
#
# Needs: az (logged in), Key Vault Secrets Officer on $KEY_VAULT_NAME, psql.
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=env.sh
source "${SCRIPT_DIR}/env.sh"

# Globally unique across Azure, so it carries the same suffix as the Key Vault
# rather than a name somebody else may already hold.
PG_FLEX_NAME="${PG_FLEX_NAME:-mvhd-pg-b53a0449}"
PG_FLEX_ADMIN="${PG_FLEX_ADMIN:-mvhdadmin}"
PG_FLEX_SKU="${PG_FLEX_SKU:-Standard_B1ms}"
PG_FLEX_TIER="${PG_FLEX_TIER:-Burstable}"
PG_FLEX_STORAGE_GB="${PG_FLEX_STORAGE_GB:-32}"
PG_FLEX_VERSION="${PG_FLEX_VERSION:-17}"
PG_FLEX_FQDN="${PG_FLEX_NAME}.postgres.database.azure.com"
PG_SECRET_NAME="postgres-admin-password"

# `keycloak` first because it is the one that gates sign-in. `cfm` stays for
# eclipse-cfm 0.0.7 (ADR-085), emptied of the 2026-03 managers' tables.
#
# ADR-001's other five (controlplane, dataplane, dataplane_omop, identityhub,
# issuerservice) were EDC 0.18's and the April build's, dropped on 2026-11-05
# (#594); listing them here put them back on every run of this phase, which
# cfm-seed.yml made (#927). The databases EDC 1.0 reads are created by
# create-edc-v1-databases.sh (edc-v1-databases.yml), vault by
# 14-vault-on-postgres.sh, taskdb by wire-task-store.sh.
PG_DATABASES=(keycloak cfm)

say() { echo "[$(date -u +%H:%M:%S)] $*"; }
die() { echo "FAIL: $*" >&2; exit 1; }

require_az() {
  # `az account show` reads the cached profile and returns 0 with a dead token;
  # get-access-token actually attempts the refresh. Same trap as
  # repair-live-stack.sh:require_az.
  az account get-access-token -o none >/dev/null 2>&1 || die "$(cat <<'MSG'
the Azure CLI is not logged in, or its token has expired. Re-authenticate:
  az login --tenant 8b87af7d-8647-4dc7-8df4-5f69a2011bb5
MSG
)"
}

# pg_admin_password comes from env.sh: Key Vault, then the pg-flex-password ACA
# secret on the control plane. Never echoed, never on a logged command line.

# ── check ───────────────────────────────────────────────────────────────────
phase_check() {
  say "resource provider"
  local state
  state=$(az provider show -n Microsoft.DBforPostgreSQL \
    --query registrationState -o tsv 2>/dev/null || echo "unknown")
  echo "  Microsoft.DBforPostgreSQL: ${state}"
  [ "$state" = "Registered" ] ||
    echo "  (register with: az provider register -n Microsoft.DBforPostgreSQL)"

  echo ""
  say "flexible server"
  if az postgres flexible-server show --name "$PG_FLEX_NAME" --resource-group "$RG" \
       --query "{name:name,state:state,sku:sku.name,storage:storage.storageSizeGb,version:version}" \
       -o table 2>/dev/null; then
    # firewall-rule takes --server-name; --name is rejected, and with stderr
    # discarded that reads as "no rules" rather than as the mistake it is.
    az postgres flexible-server firewall-rule list --server-name "$PG_FLEX_NAME" \
      --resource-group "$RG" --query "[].{rule:name,start:startIpAddress,end:endIpAddress}" \
      -o table || true
  else
    echo "  ${PG_FLEX_NAME} does not exist yet (phase 1 creates it)"
  fi

  echo ""
  say "secret"
  if [ -n "$(pg_admin_password)" ]; then
    echo "  ${PG_SECRET_NAME} present in ${KEY_VAULT_NAME}"
  else
    echo "  ${PG_SECRET_NAME} NOT in ${KEY_VAULT_NAME} (phase 1 writes it)"
  fi

  echo ""
  say "what Keycloak currently points at"
  az containerapp show --name "$KEYCLOAK_APP" --resource-group "$RG" \
    --query "properties.template.containers[0].env[?name=='KC_DB_URL'].value | [0]" \
    -o tsv 2>/dev/null || true

  echo ""
  say "the container app this replaces"
  az containerapp revision list --name "$PG_APP" --resource-group "$RG" \
    --query "[].{rev:name,health:properties.healthState,state:properties.runningState,traffic:properties.trafficWeight}" \
    -o table 2>/dev/null || echo "  ${PG_APP} is gone (phase 4 has run)"
}

# ── 1: the server ───────────────────────────────────────────────────────────
phase_1() {
  say "Phase 1: create ${PG_FLEX_NAME} (${PG_FLEX_SKU}, ${PG_FLEX_STORAGE_GB} GiB, PG ${PG_FLEX_VERSION})"

  local state
  state=$(az provider show -n Microsoft.DBforPostgreSQL \
    --query registrationState -o tsv 2>/dev/null || echo "unknown")
  [ "$state" = "Registered" ] ||
    die "Microsoft.DBforPostgreSQL is '${state}'. Run 'az provider register -n Microsoft.DBforPostgreSQL' and wait for Registered."

  if az postgres flexible-server show --name "$PG_FLEX_NAME" --resource-group "$RG" \
       -o none 2>/dev/null; then
    say "${PG_FLEX_NAME} already exists, skipping create"
  else
    # Generated here and written straight to Key Vault (ADR-036). It is never
    # printed, and nothing else in this repo holds a copy.
    local pw
    pw="$(openssl rand -base64 30 | tr -d '/+=' | cut -c1-28)Aa1!"
    az keyvault secret set --vault-name "$KEY_VAULT_NAME" --name "$PG_SECRET_NAME" \
      --value "$pw" -o none ||
      die "could not write ${PG_SECRET_NAME} to ${KEY_VAULT_NAME}; you need Key Vault Secrets Officer"
    say "admin password generated and stored in ${KEY_VAULT_NAME} as ${PG_SECRET_NAME}"

    # --public-access 0.0.0.0 is the Azure-services-only rule, NOT open to the
    # internet (that would be --public-access all). ACA Consumption publishes
    # no stable egress IP (outboundIpAddresses is null on mvhd-env), so an
    # IP-scoped rule cannot be written reliably. ADR-041 records this as the
    # weaker fallback it is; revisit if the environment ever gets a VNet.
    az postgres flexible-server create \
      --name "$PG_FLEX_NAME" --resource-group "$RG" --location "$LOCATION" \
      --tier "$PG_FLEX_TIER" --sku-name "$PG_FLEX_SKU" \
      --storage-size "$PG_FLEX_STORAGE_GB" --version "$PG_FLEX_VERSION" \
      --admin-user "$PG_FLEX_ADMIN" --admin-password "$pw" \
      --public-access 0.0.0.0 --backup-retention 7 --yes -o none ||
      die "server creation failed"
    unset pw
  fi

  az postgres flexible-server show --name "$PG_FLEX_NAME" --resource-group "$RG" \
    --query "{name:name,state:state,sku:sku.name,storage:storage.storageSizeGb,version:version}" \
    -o table

  # B1ms allows 50 connections, 35 of them to users, and PgBouncer is not
  # offered on Burstable. Keycloak's default Agroal pool alone is 100, so the
  # budget in ADR-041 has to be enforced on the consumers in phase 3. Pin
  # max_connections explicitly so a later SKU change does not silently move it.
  az postgres flexible-server parameter set --server-name "$PG_FLEX_NAME" \
    --resource-group "$RG" --name max_connections --value 50 -o none 2>/dev/null ||
    say "note: could not pin max_connections; the SKU default already applies"

  say "Phase 1 done. ${PG_FLEX_FQDN}"
}

# ── 2: keycloak and cfm ─────────────────────────────────────────────────────
phase_2() {
  say "Phase 2: create ${#PG_DATABASES[@]} databases on ${PG_FLEX_NAME}"
  local db
  for db in "${PG_DATABASES[@]}"; do
    # Both `db show` and `db create` take --name/-n. --database-name is the
    # spelling on other az command groups and is rejected here.
    if az postgres flexible-server db show --server-name "$PG_FLEX_NAME" \
         --resource-group "$RG" --name "$db" -o none 2>/dev/null; then
      say "  ${db} exists"
    else
      az postgres flexible-server db create --server-name "$PG_FLEX_NAME" \
        --resource-group "$RG" --name "$db" -o none ||
        die "could not create database ${db}"
      say "  ${db} created"
    fi
  done

  local got
  got=$(az postgres flexible-server db list --server-name "$PG_FLEX_NAME" \
    --resource-group "$RG" --query "length([?name!='azure_maintenance'])" -o tsv 2>/dev/null || echo 0)
  say "Phase 2 done. ${got} databases on the server."
}

# ── 3: cut Keycloak over ────────────────────────────────────────────────────
phase_3() {
  say "Phase 3: point ${KEYCLOAK_APP} at ${PG_FLEX_FQDN}"
  local pw rollback
  pw="$(pg_admin_password)"
  [ -n "$pw" ] || die "no ${PG_SECRET_NAME} in ${KEY_VAULT_NAME}; run phase 1 first"

  # Print the way back before changing anything. If the new server is
  # unreachable Keycloak will not start, and the old data is still live in the
  # mvhd-postgres replica, so restoring this one value restores sign-in.
  rollback=$(az containerapp show --name "$KEYCLOAK_APP" --resource-group "$RG" \
    --query "properties.template.containers[0].env[?name=='KC_DB_URL'].value | [0]" -o tsv 2>/dev/null || echo "")
  say "rollback, if this goes wrong:"
  say "  az containerapp update --name ${KEYCLOAK_APP} --resource-group ${RG} \\"
  say "    --set-env-vars 'KC_DB_URL=${rollback}' 'KC_DB_PASSWORD=<the old value>'"

  # The password becomes an ACA secret and is referenced, never an env var in
  # clear. mvhd-keycloak carried KC_DB_PASSWORD in plaintext until this ran;
  # that is the ADR-036 violation this phase also closes.
  az containerapp secret set --name "$KEYCLOAK_APP" --resource-group "$RG" \
    --secrets "kc-db-password=${pw}" -o none || die "could not set the ACA secret"
  unset pw

  # Azure requires TLS. sslmode=require is what makes this URL different from
  # the local one, which stays sslmode=disable.
  # KC_BOOTSTRAP_ADMIN_* matter here and did not before. Keycloak 26 renamed
  # KEYCLOAK_ADMIN/KEYCLOAK_ADMIN_PASSWORD, and this app carries only the old
  # pair. On the existing database that is harmless, because the admin user was
  # created long ago. On an EMPTY database Keycloak bootstraps a fresh master
  # realm, and if it honours neither name there is no admin account, so
  # restore-keycloak-realm.sh cannot get a token and the realm cannot be
  # imported. docker-compose.jad.yml already sets both; this brings ACA level
  # with it. Both point at the same secret, so either name works.
  #
  # --set-env-vars leaves variables it does not name untouched ("Existing
  # environment variables are not modified"), which is why KC_HOSTNAME and the
  # proxy settings survive this. --replace-env-vars would remove them.
  az containerapp update --name "$KEYCLOAK_APP" --resource-group "$RG" \
    --set-env-vars \
      "KC_DB_URL=jdbc:postgresql://${PG_FLEX_FQDN}:5432/${KC_DB_NAME}?sslmode=require" \
      "KC_DB_USERNAME=${PG_FLEX_ADMIN}" \
      "KC_DB_PASSWORD=secretref:kc-db-password" \
      "KC_DB_POOL_MAX_SIZE=10" \
      "KC_BOOTSTRAP_ADMIN_USERNAME=${KC_ADMIN_USER}" \
      "KC_BOOTSTRAP_ADMIN_PASSWORD=secretref:keycloak-admin-password" \
    -o none || die "could not update ${KEYCLOAK_APP}"

  say "waiting 150s for Keycloak to run its Liquibase migrations on the new server"
  sleep 150

  # The realm only ever exists by import, so a fresh database has none.
  say "re-importing the edcv realm"
  KEYCLOAK_PUBLIC_URL="https://auth.${CUSTOM_DOMAIN}" \
    "${SCRIPT_DIR}/restore-keycloak-realm.sh" || die "realm import failed"

  "${SCRIPT_DIR}/check-keycloak-health.sh" "https://auth.${CUSTOM_DOMAIN}" edcv ||
    die "Keycloak is not healthy against the new server"
  say "Phase 3 done. Sign in at https://${CUSTOM_DOMAIN}/auth/signin and prove it by hand."
}

# ── 3b: retired ─────────────────────────────────────────────────────────────
# Moved the five EDC 0.18 services and the two 2026-03 CFM managers from
# mvhd-postgres to this server on 2026-10-02. All seven apps were deleted or
# replaced by EDC 1.0 (#927); the 1.0 apps get their datasource from
# migrate-edc-to-v1.sh. Run again, it would point them at dropped databases.
phase_3b() {
  die "phase 3b is retired (#927): the apps it moved are gone, and EDC 1.0 gets its datasource from migrate-edc-to-v1.sh"
}

# Every app other than mvhd-postgres and Keycloak whose env still names it.
pg_app_consumers() {
  local app hits out=""
  for app in $(az containerapp list --resource-group "$RG" --query '[].name' -o tsv 2>/dev/null); do
    [ "$app" = "$PG_APP" ] && continue
    [ "$app" = "$KEYCLOAK_APP" ] && continue
    hits=$(az containerapp show --name "$app" --resource-group "$RG" \
      --query "properties.template.containers[].env[?contains(to_string(value),'${PG_APP}')].name" \
      -o tsv 2>/dev/null | tr -s '[:space:]' ' ' | sed 's/^ *//; s/ *$//')
    # No match prints an empty line, and `tr '\n' ' '` alone turns that into
    # a single space, which -n counts as a hit: every app then "still points
    # at" mvhd-postgres and phase 4 refuses forever. Trimmed, empty is empty.
    [ -n "$hits" ] && out="${out}  ${app}: ${hits}"$'\n'
  done
  printf '%s' "$out"
}

# ── 4: retire the container app ─────────────────────────────────────────────
phase_4() {
  say "Phase 4: retire ${PG_APP}"
  local url
  url=$(az containerapp show --name "$KEYCLOAK_APP" --resource-group "$RG" \
    --query "properties.template.containers[0].env[?name=='KC_DB_URL'].value | [0]" -o tsv 2>/dev/null || echo "")
  case "$url" in
    *"${PG_FLEX_FQDN}"*) : ;;
    *) die "Keycloak still points at '${url}'. Run and verify phase 3 first." ;;
  esac

  # Keycloak is not the only consumer. On 2026-10-02 seven other apps still
  # named mvhd-postgres in their connection strings: the five EDC services via
  # EDC_DATASOURCE_DEFAULT_URL, plus mvhd-tenant-mgr and mvhd-provision-mgr via
  # DATABASE_URL. They sit at minReplicas 0 and mostly fail to activate
  # (ADR-022), which is exactly why deleting their database would go unnoticed
  # until someone tried to use them. Enumerate rather than assume; phase 3b
  # moves them.
  local others
  others=$(pg_app_consumers)

  if [ -n "$others" ]; then
    echo "These apps still point at ${PG_APP}:" >&2
    printf '%s' "$others" >&2
    if [ "${PG_RETIRE_FORCE:-0}" != "1" ]; then
      die "move them to ${PG_FLEX_FQDN} first, or accept losing their databases and re-run with PG_RETIRE_FORCE=1"
    fi
    say "PG_RETIRE_FORCE=1 set, continuing with those apps still pointed at ${PG_APP}"
  fi

  echo ""
  echo "This deletes the container app ${PG_APP} and everything still in it."
  echo "Nothing else should be using it. Type 'retire' to continue:"
  local answer
  read -r answer
  [ "$answer" = "retire" ] || die "not confirmed"

  az containerapp delete --name "$PG_APP" --resource-group "$RG" --yes -o none ||
    die "could not delete ${PG_APP}"
  say "Phase 4 done. ${PG_APP} is gone, and with it the pg-data mount question."
  # 01-foundation.sh no longer creates the share; an existing install still
  # has it. On rg-mvhd-dev it was empty (0 bytes) when this ran, 2026-10-04.
  say "The pg-data share and its storage definition are left in place. Once"
  say "no app mounts pg-data, remove both:"
  say "  az containerapp env storage remove -n ${ACA_ENV} -g ${RG} --storage-name pg-data --yes"
  say "  az storage share-rm delete --storage-account ${STORAGE_ACCOUNT} -g ${RG} --name pg-data --yes"
  say "or run phase 4b, which checks first (needs Contributor on ${RG})."
}

# ── 4b: retire the pg-data share ────────────────────────────────────────────
# Needs Microsoft.App/managedEnvironments/storages/delete and
# Microsoft.Storage/.../shares/delete, which Container Apps Contributor lacks;
# .github/workflows/retire-pg-data-share.yml runs it as the CI identity.
# Idempotent: what is already gone is reported, not an error.
PG_SHARE="pg-data"

phase_4b() {
  say "Phase 4b: retire the ${PG_SHARE} share and its storage definition"
  if az containerapp show --name "$PG_APP" --resource-group "$RG" -o none 2>/dev/null; then
    die "${PG_APP} still exists. Run phase 4 first."
  fi

  local mounted
  mounted=$(
    {
      az containerapp list --resource-group "$RG" \
        --query "[?contains(to_string(properties.template.volumes), '\"${PG_SHARE}\"')].name" -o tsv
      az containerapp job list --resource-group "$RG" \
        --query "[?contains(to_string(properties.template.volumes), '\"${PG_SHARE}\"')].name" -o tsv
    } | sed '/^$/d'
  )
  [ -z "$mounted" ] || die "still mounted by: $(echo "$mounted" | tr '\n' ' ')"
  say "no Container App or job mounts ${PG_SHARE}"

  local storage_exists=false share_exists=false usage=""
  az containerapp env storage show --name "$ACA_ENV" --resource-group "$RG" \
    --storage-name "$PG_SHARE" -o none 2>/dev/null && storage_exists=true
  if usage=$(az storage share-rm show --storage-account "$STORAGE_ACCOUNT" \
    --resource-group "$RG" --name "$PG_SHARE" --expand stats \
    --query shareUsageBytes -o tsv 2>/dev/null); then
    share_exists=true
  fi
  say "storage definition on ${ACA_ENV}: ${storage_exists}; share on ${STORAGE_ACCOUNT}: ${share_exists} (${usage:-n/a} bytes)"

  if ! $storage_exists && ! $share_exists; then
    say "Phase 4b: nothing left to retire."
    return 0
  fi
  if $share_exists && [ "${usage:-0}" != "0" ] && [ "${PG_SHARE_FORCE:-0}" != "1" ]; then
    die "${PG_SHARE} holds ${usage} bytes. Look before deleting; re-run with PG_SHARE_FORCE=1 to delete anyway."
  fi

  local answer="${PG_SHARE_CONFIRM:-}"
  if [ -z "$answer" ]; then
    echo "This deletes the ${PG_SHARE} share and its storage definition. Type 'retire' to continue:"
    read -r answer
  fi
  [ "$answer" = "retire" ] || die "not confirmed"

  if $storage_exists; then
    az containerapp env storage remove --name "$ACA_ENV" --resource-group "$RG" \
      --storage-name "$PG_SHARE" --yes -o none || die "could not remove the storage definition"
    say "removed storage definition ${PG_SHARE} from ${ACA_ENV}"
  fi
  if $share_exists; then
    az storage share-rm delete --storage-account "$STORAGE_ACCOUNT" --resource-group "$RG" \
      --name "$PG_SHARE" --yes -o none || die "could not delete the share"
    say "deleted share ${PG_SHARE} from ${STORAGE_ACCOUNT}"
  fi

  if az containerapp env storage show --name "$ACA_ENV" --resource-group "$RG" \
    --storage-name "$PG_SHARE" -o none 2>/dev/null ||
    az storage share-rm show --storage-account "$STORAGE_ACCOUNT" --resource-group "$RG" \
      --name "$PG_SHARE" -o none 2>/dev/null; then
    die "${PG_SHARE} is still there after the delete"
  fi
  say "Phase 4b done. ADR-041 phase 4 is complete."
}

case "${1:-}" in
  check) require_az; phase_check ;;
  1) require_az; phase_1 ;;
  2) require_az; phase_2 ;;
  3) require_az; phase_3 ;;
  3b) require_az; phase_3b ;;
  4) require_az; phase_4 ;;
  4b) require_az; phase_4b ;;
  *) sed -n '14,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac
