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
# Derived at source time so 05-cfm-ui.sh can inject it into the UI container.
export SUBSCRIPTION_ID="${SUBSCRIPTION_ID:-$(az account show --query id -o tsv 2>/dev/null || echo "")}"
export ACR_NAME="acrmvhdehds"
export ACA_ENV="mvhd-env"
# Log Analytics workspace (disabled under Workaround B, kept for reference)
export LAW_NAME="law-mvhd-dev"

# ── Persistent storage (Azure Files — ADR-017 + Workaround B) ───────────────
# Storage account name must be 3–24 lowercase alphanumerics, globally unique.
export STORAGE_ACCOUNT="stmvhddev$(printf '%s' "$RG$LOCATION" | shasum | cut -c1-6)"
export STORAGE_SKU="Standard_LRS"
export SHARE_NEO4J_DATA="neo4j-data"
export SHARE_NEO4J_LOGS="neo4j-logs"
export SHARE_VAULT_DATA="vault-data"
export SHARE_PG_DATA="pg-data"
export QUOTA_NEO4J_DATA=10
export QUOTA_NEO4J_LOGS=5
export QUOTA_VAULT_DATA=2
export QUOTA_PG_DATA=20

# ── PostgreSQL (Container App — Workaround B) ───────────────────────────────
# PG_SERVER retained as logical name; PG_HOST resolves via ACA internal DNS.
export PG_APP="mvhd-postgres"
export PG_SERVER="$PG_APP"
export PG_HOST="$PG_APP"
export PG_PORT=5432
export PG_ADMIN="mvhdadmin"
export PG_PASSWORD="H3althDataSp@ce2026!"
export PG_IMAGE="${ACR_NAME}.azurecr.io/postgres:16"
export PG_DATABASES=(keycloak controlplane dataplane dataplane_omop identityhub issuerservice cfm)

# ── Custom domain (24/7 public demo) ────────────────────────────────────────
export CUSTOM_DOMAIN="ehds.mabu.red"

# ── Container Apps ───────────────────────────────────────────────────────────
export NEO4J_APP="mvhd-neo4j"
export NEO4J_PROXY_APP="mvhd-neo4j-proxy"
export UI_APP="mvhd-ui"
export KEYCLOAK_APP="mvhd-keycloak"
export VAULT_APP="mvhd-vault"
export NATS_APP="mvhd-nats"
export CONTROLPLANE_APP="mvhd-controlplane"
export DP_FHIR_APP="mvhd-dp-fhir"
export DP_OMOP_APP="mvhd-dp-omop"
export IDENTITYHUB_APP="mvhd-identityhub"
export ISSUER_APP="mvhd-issuerservice"
export TENANT_MGR_APP="mvhd-tenant-mgr"
export PROVISION_MGR_APP="mvhd-provision-mgr"

# ── ACA Jobs ─────────────────────────────────────────────────────────────────
export NEO4J_SEED_JOB="mvhd-neo4j-seed"
export VAULT_BOOTSTRAP_JOB="mvhd-vault-bootstrap"
export FHIR_LOADER_JOB="mvhd-fhir-loader"
export CATALOG_CRAWLER_JOB="mvhd-catalog-crawler"
export CATALOG_ENRICHER_APP="mvhd-catalog-enricher"

# ── Container images ─────────────────────────────────────────────────────────
export ACR_LOGIN_SERVER="${ACR_NAME}.azurecr.io"
export UI_IMAGE="${ACR_LOGIN_SERVER}/mvhd-ui:latest"
export NEO4J_PROXY_IMAGE="${ACR_LOGIN_SERVER}/mvhd-neo4j-proxy:latest"
export NEO4J_IMAGE="${ACR_LOGIN_SERVER}/neo4j:5-community"
export KEYCLOAK_IMAGE="${ACR_LOGIN_SERVER}/keycloak:latest"
export VAULT_IMAGE="${ACR_LOGIN_SERVER}/vault:latest"
export NATS_IMAGE="${ACR_LOGIN_SERVER}/nats:alpine"
export CONTROLPLANE_IMAGE="${ACR_LOGIN_SERVER}/jad-controlplane:latest"
export DP_FHIR_IMAGE="${ACR_LOGIN_SERVER}/jad-dataplane:latest"
export DP_OMOP_IMAGE="${ACR_LOGIN_SERVER}/jad-dataplane:latest"
export IDENTITYHUB_IMAGE="${ACR_LOGIN_SERVER}/jad-identity-hub:latest"
export ISSUER_IMAGE="${ACR_LOGIN_SERVER}/jad-issuerservice:latest"
export TENANT_MGR_IMAGE="${ACR_LOGIN_SERVER}/cfm-tmanager:latest"
export PROVISION_MGR_IMAGE="${ACR_LOGIN_SERVER}/cfm-pmanager:latest"

# ── Neo4j ────────────────────────────────────────────────────────────────────
export NEO4J_USER="neo4j"
export NEO4J_PASSWORD="healthdataspace"

# ── Keycloak ─────────────────────────────────────────────────────────────────
export KC_ADMIN_USER="admin"
export KC_ADMIN_PASSWORD="admin"
export KC_DB_NAME="keycloak"

# ── Vault ────────────────────────────────────────────────────────────────────
export VAULT_ROOT_TOKEN="root"

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
export NEO4J_INTERNAL_URL="https://${NEO4J_APP}.internal.${domain}"
export NEO4J_HTTP_URL="https://${NEO4J_APP}.internal.${domain}"
export NEO4J_PROXY_URL="https://${NEO4J_PROXY_APP}.internal.${domain}"
export VAULT_URL="https://${VAULT_APP}.internal.${domain}"
export KEYCLOAK_INTERNAL_URL="https://${KEYCLOAK_APP}.internal.${domain}"
export KEYCLOAK_PUBLIC_URL="https://${KEYCLOAK_APP}.${domain}"
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
