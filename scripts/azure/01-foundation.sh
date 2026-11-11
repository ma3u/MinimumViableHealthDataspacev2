#!/usr/bin/env bash
# Phase 1: Foundation: resource group, ACR, Key Vault and the identity that
# reads it, Log Analytics, storage account + shares, ACA environment.
#
# Workaround B (ADR-018) is over: the environment logs to Log Analytics (the
# seed workflows and 07-observability.sh read mvhd-logs), and Postgres is the
# Flexible Server (02). Azure Files shares for Neo4j and Vault are provisioned
# here and attached to the ACA environment.
#
# Needs the PIM role rol-ssg-prd-project_owner: role assignments and the Key
# Vault are outside Container Apps Contributor.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/env.sh"

log "Phase 1: Foundation"

# ── Resource group ───────────────────────────────────────────────────────────
log "Creating resource group ${RG} in ${LOCATION}..."
az group create --name "$RG" --location "$LOCATION" -o none
ok "Resource group ${RG}"

# ── Key Vault (ADR-036) ─────────────────────────────────────────────────────
# Every generated secret goes here first (02 the Neo4j password, 03 the
# Keycloak admin password, 13 the Flexible Server password), and the apps read
# it by keyvaultref. RBAC mode; whoever runs this gets Key Vault Secrets
# Officer, because creating a vault grants no access to its secrets.
if az keyvault show --name "$KEY_VAULT_NAME" -o none 2>/dev/null; then
  ok "Key Vault ${KEY_VAULT_NAME} exists"
else
  log "Creating Key Vault ${KEY_VAULT_NAME}..."
  az keyvault create --name "$KEY_VAULT_NAME" --resource-group "$RG" --location "$LOCATION" \
    --enable-rbac-authorization true --retention-days 7 -o none
  ok "Key Vault ${KEY_VAULT_NAME}"
fi
KV_ID=$(az keyvault show --name "$KEY_VAULT_NAME" --query id -o tsv)
ME=$(az ad signed-in-user show --query id -o tsv)
az role assignment create --assignee-object-id "$ME" --assignee-principal-type User \
  --role "Key Vault Secrets Officer" --scope "$KV_ID" -o none
# The identity of every keyvaultref (17-siglet.sh, rotate-*-client-secret.sh,
# wire-*.sh). Created here, before any app needs it; 11-claude-federation.sh
# finds it and goes on.
az identity create --name "$KV_READER_IDENTITY" --resource-group "$RG" --location "$LOCATION" -o none
KV_READER_PRINCIPAL=$(az identity show --name "$KV_READER_IDENTITY" --resource-group "$RG" \
  --query principalId -o tsv)
az role assignment create --assignee-object-id "$KV_READER_PRINCIPAL" \
  --assignee-principal-type ServicePrincipal \
  --role "Key Vault Secrets User" --scope "$KV_ID" -o none
# A role assignment takes a while to reach the data plane; 02 writes first.
for i in $(seq 1 30); do
  az keyvault secret list --vault-name "$KEY_VAULT_NAME" -o none 2>/dev/null && break
  [ "$i" -eq 30 ] && { err "no access to ${KEY_VAULT_NAME}'s secrets after 5 min"; exit 1; }
  sleep 10
done
ok "Key Vault Secrets Officer for you, Secrets User for ${KV_READER_IDENTITY}"

# ── Log Analytics ────────────────────────────────────────────────────────────
log "Creating Log Analytics workspace ${LAW_NAME}..."
az monitor log-analytics workspace create --resource-group "$RG" \
  --workspace-name "$LAW_NAME" --location "$LOCATION" --retention-time 30 -o none
LAW_CUSTOMER_ID=$(az monitor log-analytics workspace show --resource-group "$RG" \
  --workspace-name "$LAW_NAME" --query customerId -o tsv)
# The environment takes the workspace key only as --logs-workspace-key, so it
# is on that one command line and in no file or output.
LAW_KEY=$(az monitor log-analytics workspace get-shared-keys --resource-group "$RG" \
  --workspace-name "$LAW_NAME" --query primarySharedKey -o tsv)
ok "Log Analytics ${LAW_NAME}"

# ── Container registry ───────────────────────────────────────────────────────
log "Creating container registry ${ACR_NAME}..."
az acr create --resource-group "$RG" --name "$ACR_NAME" --sku Basic \
  --admin-enabled true -o none
ok "ACR ${ACR_NAME}"

# ── Storage Account + Azure Files shares ────────────────────────────────────
# ADR-017 requires public network access Allow (Sopra Steria DEP policy
# ass-ssg-prd-cloud-per_msd-restrictions blocks private-only storage on per subs).
log "Creating storage account ${STORAGE_ACCOUNT} (${STORAGE_SKU})..."
az storage account create \
  --name "$STORAGE_ACCOUNT" --resource-group "$RG" --location "$LOCATION" \
  --sku "$STORAGE_SKU" --kind StorageV2 \
  --min-tls-version TLS1_2 \
  --allow-blob-public-access false \
  --public-network-access Enabled \
  --default-action Allow \
  -o none
ok "Storage account ${STORAGE_ACCOUNT}"

STORAGE_KEY=$(az storage account keys list \
  --resource-group "$RG" --account-name "$STORAGE_ACCOUNT" \
  --query "[0].value" -o tsv)

create_share() {
  local name="$1" quota="$2"
  log "Creating file share ${name} (${quota} GiB)..."
  az storage share-rm create \
    --resource-group "$RG" --storage-account "$STORAGE_ACCOUNT" \
    --name "$name" --quota "$quota" --enabled-protocols SMB \
    -o none
  ok "Share ${name}"
}

create_share "$SHARE_NEO4J_DATA" "$QUOTA_NEO4J_DATA"
create_share "$SHARE_NEO4J_LOGS" "$QUOTA_NEO4J_LOGS"
create_share "$SHARE_VAULT_DATA" "$QUOTA_VAULT_DATA"

# ── ACA environment (logs to Log Analytics) ────────────────────────────────
log "Creating ACA environment ${ACA_ENV} (logs to ${LAW_NAME})..."
az containerapp env create \
  --name "$ACA_ENV" --resource-group "$RG" --location "$LOCATION" \
  --logs-destination log-analytics \
  --logs-workspace-id "$LAW_CUSTOMER_ID" --logs-workspace-key "$LAW_KEY" \
  -o none
unset LAW_KEY
ok "ACA environment ${ACA_ENV}"

# ── Attach shares to the ACA environment ────────────────────────────────────
attach_share() {
  local storage_name="$1" share="$2" access="${3:-ReadWrite}"
  log "Attaching share ${share} to ACA env as storage ${storage_name}..."
  az containerapp env storage set \
    --name "$ACA_ENV" --resource-group "$RG" \
    --storage-name "$storage_name" \
    --azure-file-account-name "$STORAGE_ACCOUNT" \
    --azure-file-account-key "$STORAGE_KEY" \
    --azure-file-share-name "$share" \
    --access-mode "$access" \
    -o none
  ok "ACA storage ${storage_name}"
}

attach_share "neo4j-data" "$SHARE_NEO4J_DATA"
attach_share "neo4j-logs" "$SHARE_NEO4J_LOGS"
attach_share "vault-data" "$SHARE_VAULT_DATA"
# No pg-data share: Postgres is the Flexible Server (ADR-041), and the
# share was only ever for the mvhd-postgres container, retired 2026-10-04.

# ── Summary ──────────────────────────────────────────────────────────────────
ACA_DOMAIN=$(az containerapp env show --name "$ACA_ENV" --resource-group "$RG" \
  --query "properties.defaultDomain" -o tsv)
log "Foundation complete"
echo "  Resource group:  ${RG}"
echo "  ACR:             ${ACR_LOGIN_SERVER}"
echo "  Key Vault:       ${KEY_VAULT_NAME} (reader identity ${KV_READER_IDENTITY})"
echo "  Storage account: ${STORAGE_ACCOUNT}"
echo "  ACA environment: ${ACA_ENV}"
echo "  ACA domain:      ${ACA_DOMAIN}"
echo "  Log Analytics:   ${LAW_NAME}"
