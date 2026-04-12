#!/usr/bin/env bash
# Shared environment variables for Azure deployment scripts.
# Source this file — do not execute directly.
#   source scripts/azure/env.sh

set -euo pipefail

# ── Azure resource names ─────────────────────────────────────────────────────
export RG="rg-mvhd-dev"
export LOCATION="westeurope"
export ACR_NAME="acrmvhddev"
export ACA_ENV="mvhd-env"
export LAW_NAME="law-mvhd-dev"

# ── PostgreSQL ───────────────────────────────────────────────────────────────
export PG_SERVER="pg-mvhd-dev"
export PG_LOCATION="northeurope"
export PG_ADMIN="mvhdadmin"
export PG_PASSWORD="H3althDataSp@ce2026!"
export PG_SKU="B_Standard_B1ms"
export PG_DATABASES=(keycloak controlplane dataplane dataplane_omop identityhub issuerservice cfm)

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
