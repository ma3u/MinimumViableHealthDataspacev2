#!/usr/bin/env bash
# Shared environment variables for Azure deployment scripts.
# Source this file — do not execute directly.
#   source scripts/azure/env.sh
#
# Workaround B (ADR-018): this subscription (INF-STG-EU_EHDS) cannot register
# Microsoft.DBforPostgreSQL or Microsoft.OperationalInsights. Postgres runs as
# an ACA container app on Azure Files; Log Analytics is skipped.

set -euo pipefail

# ── Azure resource names ─────────────────────────────────────────────────────
export RG="rg-mvhd-dev"
export LOCATION="westeurope"
# Derived at source time for the scripts that pass it on (it once went into the UI container).
export SUBSCRIPTION_ID="${SUBSCRIPTION_ID:-$(az account show --query id -o tsv 2>/dev/null || echo "")}"
export ACR_NAME="acrmvhdehds"
export ACA_ENV="mvhd-env"
# Log Analytics workspace. The ACA environment logs to mvhd-logs; law-mvhd-dev no longer exists, and
# 07-observability.sh failed on its first call while this still named it.
export LAW_NAME="mvhd-logs"

# ── Persistent storage (Azure Files — ADR-017 + Workaround B) ───────────────
# Storage account name must be 3–24 lowercase alphanumerics, globally unique.
export STORAGE_ACCOUNT="stmvhddev$(printf '%s' "$RG$LOCATION" | shasum | cut -c1-6)"
export STORAGE_SKU="Standard_LRS"
export SHARE_NEO4J_DATA="neo4j-data"
export SHARE_NEO4J_LOGS="neo4j-logs"
export SHARE_VAULT_DATA="vault-data"
export QUOTA_NEO4J_DATA=10
export QUOTA_NEO4J_LOGS=5
export QUOTA_VAULT_DATA=2

# ── PostgreSQL (Flexible Server, ADR-041) ───────────────────────────────────
# Every consumer reaches Azure Database for PostgreSQL Flexible Server over TLS.
# The mvhd-postgres container app (Workaround B, ADR-018) cannot keep its data
# on SMB and wiped every database on each restart; it stays named here only so
# 13-postgres-flexible-server.sh phase 4 can find and retire it.
#
# There is no password in this file any more. The one that was here was
# committed to a public repository and was what all eight consumers used.
# pg_admin_password (below, after kv_secret) reads it when a caller needs it.
export PG_APP="mvhd-postgres"
export PG_FLEX_NAME="${PG_FLEX_NAME:-mvhd-pg-b53a0449}"
export PG_SERVER="$PG_FLEX_NAME"
export PG_HOST="${PG_FLEX_NAME}.postgres.database.azure.com"
export PG_PORT=5432
export PG_ADMIN="mvhdadmin"
export PG_SSLMODE="require"
# Pinned per ADR-029 (issue #97 Phase A): major 16 on Azure until a
# pg_upgrade/dump-restore migration exists — local dev runs 17.x.
export POSTGRES_VERSION="16.14"
export PG_IMAGE="${ACR_NAME}.azurecr.io/postgres:${POSTGRES_VERSION}"
export PG_DATABASES=(keycloak controlplane dataplane dataplane_omop identityhub issuerservice cfm)

# ── Custom domain (24/7 public demo) ────────────────────────────────────────
export CUSTOM_DOMAIN="ehds.mabu.red"

# ── Container Apps ───────────────────────────────────────────────────────────
export NEO4J_APP="mvhd-neo4j"
export NEO4J_PROXY_APP="mvhd-neo4j-proxy"
export SIGLET_APP="mvhd-siglet"
export UI_APP="mvhd-ui"
export KEYCLOAK_APP="mvhd-keycloak"
export VAULT_APP="mvhd-vault"
export NATS_APP="mvhd-nats"
export CONTROLPLANE_APP="mvhd-controlplane"
export IDENTITYHUB_APP="mvhd-identityhub"
export ISSUER_APP="mvhd-issuerservice"
# EDC 0.18's two data planes and the seven apps of the 2026-03 CFM were
# deleted on 2026-11-09 (#927). CFM 0.0.7's apps (ADR-085) are named in
# 20-cfm-fork.sh.

# ── ACA Jobs ─────────────────────────────────────────────────────────────────
export NEO4J_SEED_JOB="mvhd-neo4j-seed"
export VAULT_BOOTSTRAP_JOB="mvhd-vault-bootstrap"
export FHIR_LOADER_JOB="mvhd-fhir-loader"
export CATALOG_CRAWLER_JOB="mvhd-catalog-crawler"
export CATALOG_ENRICHER_APP="mvhd-catalog-enricher"

# ── Pinned upstream versions (ADR-029; issue #97 Phase A, inventoried 2026-07-15)
# Third-party images are pinned to what the floating tags resolved to at pin
# time (Docker Hub/Quay digests verified). Bumps are deliberate PRs, not pulls.
# POSTGRES_VERSION is pinned above next to PG_IMAGE.
export NEO4J_VERSION="5.26.28-community"
# Neo4j's size (ADR-056). Community has no cluster, so up is the only way.
# Heap + page cache + direct memory + the JVM's rest must fit the container:
# 1.5 + 1 + 0.5 + about 0.3 GiB of 4. At 1 vCPU / 2 GiB (heap 1 GiB, page
# cache 384 MiB) it ran at 2.0 to 2.09 GB idle and was killed for memory
# (exit 137) under stress (#571). size-neo4j.sh applies these to the live app.
export NEO4J_CPU="2.0"
export NEO4J_MEMORY="4Gi"
export NEO4J_HEAP="1536m"
export NEO4J_PAGECACHE="1g"
export NEO4J_DIRECT_MEMORY="512m"
# The UI's size (ADR-061). One Node process per replica, so a whole core each
# and more replicas on an HTTP concurrency rule, instead of three halves on
# ACA's default rule of 10 concurrent requests: the stress runs of 2026-10-06
# pinned 3 x 0.5 vCPU from 200 users on (#571). size-ui.sh applies these;
# offhours.sh restores the replica range on the morning start (keep its
# UI_MAX_REPLICAS equal to this one, it does not source this file).
export UI_CPU="1.0"
export UI_MEMORY="2Gi"
export UI_MIN_REPLICAS="1"
export UI_MAX_REPLICAS="6"
export UI_SCALE_CONCURRENCY="15"
export KEYCLOAK_VERSION="26.8.0" # minor bump from 26.6.4 (#556, ADR-029 cadence)
export VAULT_VERSION="2.0"
export NATS_VERSION="2.14.3-alpine"

# ── Container images ─────────────────────────────────────────────────────────
export ACR_LOGIN_SERVER="${ACR_NAME}.azurecr.io"
# mvhd-ui / mvhd-neo4j-proxy stay :latest on purpose — they are OUR images,
# rebuilt and rolled by deploy-azure.yml on every merge to main (ADR-029).
export UI_IMAGE="${ACR_LOGIN_SERVER}/mvhd-ui:latest"
export NEO4J_PROXY_IMAGE="${ACR_LOGIN_SERVER}/mvhd-neo4j-proxy:latest"
export NEO4J_IMAGE="${ACR_LOGIN_SERVER}/neo4j:${NEO4J_VERSION}"
export KEYCLOAK_IMAGE="${ACR_LOGIN_SERVER}/keycloak:${KEYCLOAK_VERSION}"
export VAULT_IMAGE="${ACR_LOGIN_SERVER}/vault:${VAULT_VERSION}"
export NATS_IMAGE="${ACR_LOGIN_SERVER}/nats:${NATS_VERSION}"
# JAD / CFM images (issue #116). Unlike mvhd-ui these are NOT ours and are NOT
# rebuilt on merge, so `:latest` bought nothing and cost a lot: ACA caches
# `:latest` and will not re-pull on restart (gotcha #6), freezing each app on
# whatever digest its revision was created with, with nothing to roll back to.
#
# Pinned to the BUILD DATE, not a git SHA. #116 suggested tagging these with the
# upstream commit `4a7e5bd…` that docker-compose.jad.yml uses, and an earlier
# revision of this comment repeated that. It is wrong: the ACR images are a
# different build. Measured 2026-09-09 —
#
#   ACR jad-controlplane:latest        sha256:2516cbeb…  (built 2026-04-14)
#   ghcr …/controlplane:4a7e5bd…       sha256:37b7840b…  (linux/amd64)
#
# Issue #97 Phase A already recorded that these images carry no OCI labels and
# their source commits are unrecoverable, so a SHA tag would assert a provenance
# the image does not have — worse than `:latest`, because it looks authoritative.
# The build date is what we can actually verify.
#
# The tags were created by aliasing the digest already running, so pinning is a
# content-free change:
#   az acr import -n acrmvhdehds \
#     --source acrmvhdehds.azurecr.io/<repo>@<digest> --image <repo>:2026-04-14
#
# scripts/check-deployed-image-pins.sh fails if any deployed app resolves to
# `:latest`, which is the check that was missing when #116 went unnoticed.
#
# The EDC 1.0 launchers, built here (runtimes/edc, ADR-076) and pushed by
# push-edc1-images.sh as mvhd-edc-<x>:<EDC1_TAG>. 04-edc-services.sh creates
# the apps from them; migrate-edc-to-v1.sh gives each its full settings. The
# jad-* images of EDC 0.18 and the April build, and the 2026-03 CFM's, were
# deleted from ACR on 2026-11-10 (#927).
export EDC1_TAG="${EDC1_TAG:-}"
export CONTROLPLANE_IMAGE="${ACR_LOGIN_SERVER}/mvhd-edc-controlplane:${EDC1_TAG}"
export IDENTITYHUB_IMAGE="${ACR_LOGIN_SERVER}/mvhd-edc-identity-hub:${EDC1_TAG}"
export ISSUER_IMAGE="${ACR_LOGIN_SERVER}/mvhd-edc-issuerservice:${EDC1_TAG}"

# ── Neo4j ────────────────────────────────────────────────────────────────────
export NEO4J_USER="neo4j"
export NEO4J_PASSWORD="healthdataspace"
# Bolt is the only way in. mvhd-neo4j has TCP ingress with targetPort and
# exposedPort 7687 and no additionalPortMappings, and ACA routes environment-
# local TCP by short app name only — the internal FQDN is HTTP ingress and
# times out on TCP. NEO4J_INTERNAL_URL and NEO4J_HTTP_URL used to be derived
# below as that FQDN and served neither Bolt nor HTTP; issue #205 is what they
# cost. Reachable from inside the ACA environment only, not from a workstation.
export NEO4J_BOLT_URI="bolt://${NEO4J_APP}:7687"

# ── The two SPE workspaces and the access body's Trustee (ADR-068, ADR-069) ─
# 21-aci-confidential-spe.sh creates all of this. SPE-1 (AlphaKlinik Berlin)
# and SPE-2 (Limburg Medical Centre) are ACI confidential container groups
# (sku Confidential, AMD SEV-SNP), each Neo4j loaded per permit from a sealed
# extract whose key only Trustee releases. AKS is not possible in this tenant
# (pol-ssg-prd-restriction_sku_kubernetes, ADR-069). Bolt with TLS on each
# group's public DNS name; the CA is ours and the proxy pins it.
export SPE_ACI_GROUPS=(mvhd-spe-1 mvhd-spe-2)
export SPE_DNS_SUFFIX="b53a0449"   # ACI DNS labels are unique per region
export SPE_PERMIT_ID="hdab-medreg-spe-2026-001"
export SPE_PULL_IDENTITY="id-mvhd-spe-pull"           # AcrPull for the groups
export SPE_LOADER_REPO="mvhd-spe-loader"               # in ACR_NAME
export KBS_CLIENT_ACI_REPO="kbs-client-aci"
export TRUSTEE_VERSION="v0.22.0"
export TRUSTEE_COMMIT="512fed65642015b849f38fb13bfdec7806639987"
# Trustee, operated as if by MedReg DE (the access body; ADR-068 "Not decided
# here"): its own app, identity, shares and admin job, none of them shared
# with the hub. Its admin token, token signing key and the extract keys live on
# its own shares, never in the hub's Key Vault.
export TRUSTEE_APP="mvhd-trustee"
export TRUSTEE_IDENTITY="id-mvhd-trustee"
export TRUSTEE_ADMIN_JOB="mvhd-trustee-admin"
export SHARE_TRUSTEE_KEYS="trustee-keys"
export SHARE_TRUSTEE_DATA="trustee-data"
export SHARE_SPE_EXTRACTS="spe-extracts"
export TRUSTEE_KBS_SOURCE="ghcr.io/confidential-containers/key-broker-service:built-in-as-v0.22.0@sha256:c1960cb4df0b1bdc0e4309f97dc65b0a1a777a92dabb2211acb45542f906c625"
export TRUSTEE_KBS_IMAGE="${ACR_LOGIN_SERVER}/key-broker-service:built-in-as-${TRUSTEE_VERSION}"
# Outside the repository: the CA that signs the workspaces' Bolt certificates.
export SPE_CA_DIR="${SPE_CA_DIR:-${HOME}/.mvhd/spe-ca}"
# Hub Key Vault (ADR-036): the workspaces' Neo4j passwords, which the proxy
# reads by keyvaultref. Not in the key path: the extract keys are Trustee's.
export KV_SPE1_NEO4J_PASSWORD="spe-1-neo4j-password"
export KV_SPE2_NEO4J_PASSWORD="spe-2-neo4j-password"

# ── Azure Key Vault (ADR-036) ────────────────────────────────────────────────
# Operator secrets live here and are referenced, never copied into this file.
export KEY_VAULT_NAME="${KEY_VAULT_NAME:-kv-mvhd-b53a0449}"

# Reads a secret from the vault. Returns empty and warns rather than failing, so
# sourcing this file still works for the many scripts that need no secret at all.
# A non-empty second argument suppresses the warning, for callers that have a
# fallback of their own and would otherwise print a scare line before succeeding.
kv_secret() {
  local name="$1" quiet="${2:-}" value
  value=$(az keyvault secret show --vault-name "$KEY_VAULT_NAME" --name "$name" \
    --query value -o tsv 2>/dev/null) || true
  if [ -z "$value" ] && [ -z "$quiet" ]; then
    echo "[env] WARNING: could not read '$name' from $KEY_VAULT_NAME." >&2
    echo "[env] Run 'az login' and check the Key Vault Secrets User role." >&2
  fi
  printf '%s' "$value"
}

# The Flexible Server admin password. Key Vault first, then the ACA secret
# 13-postgres-flexible-server.sh phase 3b put on the control plane, for the same
# reason kc_admin_password falls back: the CI service principal cannot read the
# vault. Empty on a first deploy, before phase 1 has generated it.
pg_admin_password() {
  local value
  value=$(kv_secret postgres-admin-password quiet)
  if [ -z "$value" ]; then
    value=$(az containerapp secret show --name "$CONTROLPLANE_APP" --resource-group "$RG" \
      --secret-name pg-flex-password --query value -o tsv 2>/dev/null) || true
  fi
  if [ -z "$value" ]; then
    echo "[env] WARNING: no postgres-admin-password from $KEY_VAULT_NAME or from" >&2
    echo "[env] the pg-flex-password secret on $CONTROLPLANE_APP. Run 'az login', or" >&2
    echo "[env] run 13-postgres-flexible-server.sh 1 if the server does not exist yet." >&2
  fi
  printf '%s' "$value"
}

# ── Keycloak ─────────────────────────────────────────────────────────────────
export KC_ADMIN_USER="admin"
# Was literally "admin" in this file until 2026-09-13. That was tolerable while
# Keycloak guarded a demo realm; it stopped being tolerable when the same realm
# began gating access to paid inference (ADR-034, ADR-036). Resolved lazily so
# sourcing env.sh does not require a vault round trip for scripts that never
# touch Keycloak.
# Key Vault first, the container app's own secret second. Both hold the same
# value: 03-identity.sh writes the ACA secret from the vault at deploy time.
#
# The fallback exists because the CI service principal cannot read the vault.
# mvhd-github-actions is Contributor on the resource group, which carries
# Microsoft.App/containerApps/listSecrets, but it is not Key Vault Secrets User
# and kv-mvhd-b53a0449 has enableRbacAuthorization=true, so Contributor grants
# nothing on the data plane. aca-schedule.yml's realm-restore step had been
# failing on every run behind continue-on-error, printing "could not read
# keycloak-admin-password", which means a realm that went missing would not
# have been restored by the thing added to restore it.
#
# On a first deploy the app does not exist yet and both reads come back empty.
# That is the same answer the vault-only version gave, and 03-identity.sh is
# the caller that then creates the secret.
kc_admin_password() {
  local value
  value=$(kv_secret keycloak-admin-password quiet)
  if [ -z "$value" ]; then
    value=$(az containerapp secret show --name "$KEYCLOAK_APP" --resource-group "$RG" \
      --secret-name keycloak-admin-password --query value -o tsv 2>/dev/null) || true
  fi
  if [ -z "$value" ]; then
    echo "[env] WARNING: no keycloak-admin-password from $KEY_VAULT_NAME or from" >&2
    echo "[env] the ACA secret on $KEYCLOAK_APP. Run 'az login'. The caller needs" >&2
    echo "[env] 'Key Vault Secrets User' on the vault, or Contributor on $RG." >&2
  fi
  printf '%s' "$value"
}
export KC_DB_NAME="keycloak"

# ── Vault ────────────────────────────────────────────────────────────────────
# The fixed-id token a fresh environment starts with (the vault-unseal sidecar
# creates it, VAULT_ENSURE_TOKEN_ID). rotate-vault-token.sh replaces it on the
# services and revokes it (#359); read the live one with vault_service_token.
export VAULT_ROOT_TOKEN="root"

# The token the EDC services use against Vault: the ACA secret vault-token on
# the control plane once rotate-vault-token.sh has run, before that the plain
# env value the apps were created with, then the fresh-environment default.
# Prints the token for a variable; never echo it.
vault_service_token() {
  local t
  t=$(az containerapp secret show --name "$CONTROLPLANE_APP" --resource-group "$RG" \
    --secret-name vault-token --query value -o tsv 2>/dev/null || true)
  [ -n "$t" ] || t=$(az containerapp show --name "$CONTROLPLANE_APP" --resource-group "$RG" \
    --query "properties.template.containers[0].env[?name=='EDC_VAULT_HASHICORP_TOKEN'].value | [0]" \
    -o tsv 2>/dev/null || true)
  printf '%s' "${t:-$VAULT_ROOT_TOKEN}"
}

# The issuer Keycloak puts in the "iss" claim of an edcv token, read from the
# realm's discovery document rather than built from a URL. Vault's provisioner
# JWT role binds to it, and the bootstrap used to bind to the internal ACA URL
# it talks to Keycloak on, so every agent token was refused (#455). Keycloak
# answers with KC_HOSTNAME (auth.ehds.mabu.red) whichever URL it was asked on.
# Prints nothing when Keycloak does not answer; callers must check.
keycloak_issuer() {
  curl -sf -m 20 "${KEYCLOAK_PUBLIC_URL:-https://auth.ehds.mabu.red}/realms/edcv/.well-known/openid-configuration" \
    | python3 -c 'import json, sys; print(json.load(sys.stdin).get("issuer", ""))' 2>/dev/null || true
}

# ── Derived FQDNs (populated after ACA environment is created) ───────────────
# These are set by running: eval "$(get_aca_fqdns)"
get_aca_fqdns() {
  local domain
  domain=$(az containerapp env show --name "$ACA_ENV" --resource-group "$RG" \
    --query "properties.defaultDomain" -o tsv 2>/dev/null || echo "")
  if [[ -z "$domain" ]]; then
    echo "# ACA environment not yet created — FQDNs unavailable"
    return
  fi
  cat <<EOF
export ACA_DOMAIN="${domain}"
export NEO4J_PROXY_URL="https://${NEO4J_PROXY_APP}.internal.${domain}"
export VAULT_URL="https://${VAULT_APP}.internal.${domain}"
export KEYCLOAK_INTERNAL_URL="https://${KEYCLOAK_APP}.internal.${domain}"
# KEYCLOAK_PUBLIC_URL: external-facing Keycloak URL. After issue #28 Phase 2,
# the canonical value is https://auth.ehds.mabu.red — set
# KEYCLOAK_PUBLIC_HOSTNAME=auth.ehds.mabu.red in your shell before sourcing
# env.sh to pick it up. Default falls back to the long ACA FQDN so fresh
# deploys work even when DNS hasn't been bound yet (run the
# keycloak-custom-domain workflow afterwards to flip to the custom domain).
export KEYCLOAK_PUBLIC_HOSTNAME="\${KEYCLOAK_PUBLIC_HOSTNAME:-${KEYCLOAK_APP}.${domain}}"
export KEYCLOAK_PUBLIC_URL="https://\${KEYCLOAK_PUBLIC_HOSTNAME}"
export UI_PUBLIC_URL="https://${UI_APP}.${domain}"
export CONTROLPLANE_URL="https://${CONTROLPLANE_APP}.internal.${domain}"
export NATS_URL="nats://${NATS_APP}.internal.${domain}:4222"
EOF
}

# ── Helper functions ─────────────────────────────────────────────────────────
log()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m ✓\033[0m  %s\n' "$*"; }
err()  { printf '\033[1;31m ✗\033[0m  %s\n' "$*" >&2; }
warn() { printf '\033[1;33m ⚠\033[0m  %s\n' "$*"; }

wait_for_app() {
  local name="$1" max="${2:-60}" i=0
  log "Waiting for ${name} to be running..."
  while [[ $i -lt $max ]]; do
    local status
    status=$(az containerapp show --name "$name" --resource-group "$RG" \
      --query "properties.runningStatus" -o tsv 2>/dev/null || echo "")
    if [[ "$status" == "Running" ]]; then
      ok "${name} is running"
      return 0
    fi
    sleep 5
    i=$((i + 1))
  done
  err "${name} did not reach Running state within $((max * 5))s"
  return 1
}

# ADR-084: a new mvhd-nats revision or replica takes the control plane's task
# streams with it (cn-stream and tp-stream live in memory, and the control
# plane creates them at startup only), and every negotiation answers 500 until
# it restarts. A script that changes NATS calls this once it has; the control
# plane's liveness probe catches every other case within about two minutes.
restart_controlplane_after_nats_change() {
  local cp_status nats_rev state="" cp_rev
  cp_status=$(az containerapp show --name "$CONTROLPLANE_APP" --resource-group "$RG" \
    --query "properties.runningStatus" -o tsv 2>/dev/null || echo "")
  if [[ "$cp_status" != "Running" ]]; then
    log "${CONTROLPLANE_APP} is ${cp_status:-absent}: its next start creates the NATS task streams"
    return 0
  fi
  nats_rev=$(az containerapp show --name "$NATS_APP" --resource-group "$RG" \
    --query "properties.latestRevisionName" -o tsv)
  for _ in $(seq 1 24); do
    state=$(az containerapp revision show --name "$NATS_APP" --resource-group "$RG" \
      --revision "$nats_rev" --query "properties.runningState" -o tsv 2>/dev/null || echo "")
    [[ "$state" == Running || "$state" == RunningAtMaxScale ]] && break
    sleep 5
  done
  if [[ "$state" != Running && "$state" != RunningAtMaxScale ]]; then
    warn "${nats_rev} is ${state:-unknown}; restart ${CONTROLPLANE_APP} once NATS runs (ADR-084)"
    return 0
  fi
  sleep 10 # JetStream answers a few seconds after the replica runs
  cp_rev=$(az containerapp show --name "$CONTROLPLANE_APP" --resource-group "$RG" \
    --query "properties.latestRevisionName" -o tsv)
  log "Restarting ${cp_rev}: NATS changed, and the task streams went with it (ADR-084)"
  az containerapp revision restart --name "$CONTROLPLANE_APP" --resource-group "$RG" \
    --revision "$cp_rev" -o none
  ok "${CONTROLPLANE_APP} restarted; its startup creates cn-stream and tp-stream"
}
