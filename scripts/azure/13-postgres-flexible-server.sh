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
#   ./scripts/azure/13-postgres-flexible-server.sh 2       # create the 7 databases
#   ./scripts/azure/13-postgres-flexible-server.sh 3       # cut Keycloak over
#   ./scripts/azure/13-postgres-flexible-server.sh 3b      # move EDC + CFM over
#   ./scripts/azure/13-postgres-flexible-server.sh 4       # retire mvhd-postgres
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

# ADR-001's seven. `keycloak` first because it is the one that gates sign-in.
PG_DATABASES=(keycloak controlplane dataplane dataplane_omop identityhub
              issuerservice cfm)

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

# ── 2: the seven databases ──────────────────────────────────────────────────
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

# ── 3b: move every other consumer ───────────────────────────────────────────
# The five EDC services and the two CFM managers. Measured 2026-10-02: all
# seven named mvhd-postgres, and all seven carried the shared mvhdadmin
# password in a plaintext env var, the one committed in env.sh. After this
# phase they carry the Key Vault password as an ACA secret and nothing else.
#
# Pool budget (ADR-041): B1ms gives users 35 connections. Keycloak holds 10.
#
# EDC: commons-pool defaults max-total to 8, so five services alone would want
# 40. The cap cannot go in as an env var: EDC maps EDC_FOO_BAR to edc.foo.bar,
# and the key is `pool.connections.max-total`, whose hyphen no env name can
# spell. EDC also reads JVM system properties (ConfigurationLoader takes
# SystemProperties.ofDefault()), and the JVM honours JAVA_TOOL_OPTIONS by
# itself, so that is the way in. None of these apps set it before.
#
# CFM: the managers use database/sql with lib/pq, which leaves open
# connections unbounded and has no DSN parameter to cap them. At demo load
# they hold a handful; if `too many clients` ever appears, they are the first
# suspect and the fix is upstream (SetMaxOpenConns).
EDC_DB_APPS=(
  "mvhd-controlplane:controlplane"
  "mvhd-dp-fhir:dataplane"
  "mvhd-dp-omop:dataplane_omop"
  "mvhd-identityhub:identityhub"
  "mvhd-issuerservice:issuerservice"
)
CFM_DB_APPS=(mvhd-tenant-mgr mvhd-provision-mgr)
EDC_POOL_MAX=3

phase_3b() {
  say "Phase 3b: move the EDC services and CFM managers to ${PG_FLEX_FQDN}"
  local pw entry app db
  pw="$(pg_admin_password)"
  [ -n "$pw" ] || die "no ${PG_SECRET_NAME} in ${KEY_VAULT_NAME}; run phase 1 first"

  # The old password is still the pg-password secret on mvhd-postgres until
  # phase 4, so the way back is not lost by this phase.
  say "rollback, per app, if one does not come back:"
  say "  az containerapp update -n <app> -g ${RG} --set-env-vars \\"
  say "    'EDC_DATASOURCE_DEFAULT_URL=jdbc:postgresql://${PG_APP}:5432/<db>' \\"
  say "    'EDC_DATASOURCE_DEFAULT_USER=mvhdadmin' 'EDC_DATASOURCE_DEFAULT_PASSWORD=<pg-password secret on mvhd-postgres>'"

  for entry in "${EDC_DB_APPS[@]}"; do
    app="${entry%%:*}"
    db="${entry##*:}"
    say "  ${app} -> ${db}"
    az containerapp secret set --name "$app" --resource-group "$RG" \
      --secrets "pg-flex-password=${pw}" -o none || die "could not set the secret on ${app}"
    az containerapp update --name "$app" --resource-group "$RG" \
      --set-env-vars \
        "EDC_DATASOURCE_DEFAULT_URL=jdbc:postgresql://${PG_FLEX_FQDN}:5432/${db}?sslmode=require" \
        "EDC_DATASOURCE_DEFAULT_USER=${PG_FLEX_ADMIN}" \
        "EDC_DATASOURCE_DEFAULT_PASSWORD=secretref:pg-flex-password" \
        "JAVA_TOOL_OPTIONS=-Dedc.datasource.default.pool.connections.max-total=${EDC_POOL_MAX}" \
      -o none || die "could not update ${app}"
  done

  unset pw

  # The CFM managers ignore DATABASE_URL. They read `dsn:` from the tm.env /
  # pm.env file that 05-cfm-configure.sh mounts as a secret volume, so that
  # script is the only way to move them. The first version of this phase set
  # DATABASE_URL instead, reported success, and left CFM on mvhd-postgres
  # (2026-10-02). Read the mounted file back to prove it names this server.
  "${SCRIPT_DIR}/05-cfm-configure.sh" || die "05-cfm-configure.sh failed"
  local secret_name file_secret
  for entry in "${CFM_DB_APPS[@]}"; do
    case "$entry" in
      "$TENANT_MGR_APP") secret_name=tm-env ;;
      *) secret_name=pm-env ;;
    esac
    file_secret=$(az containerapp secret show --name "$entry" --resource-group "$RG" \
      --secret-name "$secret_name" --query value -o tsv 2>/dev/null || echo "")
    case "$file_secret" in
      *"@${PG_FLEX_FQDN}:"*) say "  ${entry}: ${secret_name} names ${PG_FLEX_FQDN}" ;;
      *) die "${entry}: ${secret_name} does not name ${PG_FLEX_FQDN}" ;;
    esac
  done
  unset file_secret

  # The process, not the knob: read each app's newest revision health back.
  say "waiting 120s for the new revisions to start"
  sleep 120
  local bad="" health
  for entry in "${EDC_DB_APPS[@]}" "${CFM_DB_APPS[@]}"; do
    app="${entry%%:*}"
    health=$(az containerapp revision list --name "$app" --resource-group "$RG" \
      --query "sort_by([?properties.active], &properties.createdTime)[-1].properties.healthState" \
      -o tsv 2>/dev/null || echo "unknown")
    printf '  %-22s %s\n' "$app" "$health"
    [ "$health" = "Healthy" ] || bad="${bad} ${app}"
  done
  [ -z "$bad" ] || die "not healthy:${bad}. Read 'az containerapp logs show -n <app> -g ${RG} --tail 50'."

  local left
  left=$(pg_app_consumers)
  if [ -n "$left" ]; then
    echo "still pointing at ${PG_APP}:" >&2
    printf '%s' "$left" >&2
    die "some consumers were not moved"
  fi
  say "Phase 3b done. No app but ${PG_APP} itself names ${PG_APP} any more."
  say "Next: reseed CFM with 'gh workflow run cfm-seed.yml', then phase 4."
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
  say "The pg-data share and its storage definition are left in place; delete"
  say "them by hand once you are sure nothing else references them."
}

case "${1:-}" in
  check) require_az; phase_check ;;
  1) require_az; phase_1 ;;
  2) require_az; phase_2 ;;
  3) require_az; phase_3 ;;
  3b) require_az; phase_3b ;;
  4) require_az; phase_4 ;;
  *) sed -n '14,19p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac
