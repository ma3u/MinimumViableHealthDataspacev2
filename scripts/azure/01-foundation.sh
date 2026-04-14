#!/usr/bin/env bash
# Phase 1: Foundation — resource group, ACR, Storage Account + shares, ACA env.
#
# Workaround B (ADR-018): this subscription cannot register Microsoft.OperationalInsights,
# so Log Analytics is skipped and the ACA environment is created with
# --logs-destination none. Azure Files shares for Neo4j, Vault, and Postgres
# persistent data are provisioned here and attached to the ACA environment.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/env.sh"

log "Phase 1: Foundation"

# ── Resource group ───────────────────────────────────────────────────────────
log "Creating resource group ${RG} in ${LOCATION}..."
az group create --name "$RG" --location "$LOCATION" -o none
ok "Resource group ${RG}"

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
create_share "$SHARE_PG_DATA"    "$QUOTA_PG_DATA"

# ── ACA environment (no Log Analytics — Workaround B) ──────────────────────
log "Creating ACA environment ${ACA_ENV} (logs-destination=none)..."
az containerapp env create \
  --name "$ACA_ENV" --resource-group "$RG" --location "$LOCATION" \
  --logs-destination none \
  -o none
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
attach_share "pg-data"    "$SHARE_PG_DATA"

# ── Summary ──────────────────────────────────────────────────────────────────
ACA_DOMAIN=$(az containerapp env show --name "$ACA_ENV" --resource-group "$RG" \
  --query "properties.defaultDomain" -o tsv)
log "Foundation complete"
echo "  Resource group:  ${RG}"
echo "  ACR:             ${ACR_LOGIN_SERVER}"
echo "  Storage account: ${STORAGE_ACCOUNT}"
echo "  ACA environment: ${ACA_ENV}"
echo "  ACA domain:      ${ACA_DOMAIN}"
echo "  Log Analytics:   DISABLED (Workaround B — ADR-018)"
