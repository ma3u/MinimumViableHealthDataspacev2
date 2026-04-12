#!/usr/bin/env bash
# Phase 1: Foundation — resource group, ACR, Log Analytics, ACA environment.
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

# ── Log Analytics workspace ──────────────────────────────────────────────────
log "Creating Log Analytics workspace ${LAW_NAME}..."
az monitor log-analytics workspace create \
  --resource-group "$RG" --workspace-name "$LAW_NAME" \
  --retention-in-days 30 -o none
LAW_ID=$(az monitor log-analytics workspace show \
  --resource-group "$RG" --workspace-name "$LAW_NAME" \
  --query "customerId" -o tsv)
ok "Log Analytics ${LAW_NAME} (${LAW_ID})"

# ── ACA environment ─────────────────────────────────────────────────────────
log "Creating ACA environment ${ACA_ENV}..."
az containerapp env create \
  --name "$ACA_ENV" --resource-group "$RG" --location "$LOCATION" \
  --logs-workspace-id "$LAW_ID" \
  --logs-workspace-key "$(az monitor log-analytics workspace get-shared-keys \
    --resource-group "$RG" --workspace-name "$LAW_NAME" \
    --query "primarySharedKey" -o tsv)" \
  -o none
ok "ACA environment ${ACA_ENV}"

# ── Summary ──────────────────────────────────────────────────────────────────
ACA_DOMAIN=$(az containerapp env show --name "$ACA_ENV" --resource-group "$RG" \
  --query "properties.defaultDomain" -o tsv)
log "Foundation complete"
echo "  Resource group:  ${RG}"
echo "  ACR:             ${ACR_LOGIN_SERVER}"
echo "  ACA environment: ${ACA_ENV}"
echo "  ACA domain:      ${ACA_DOMAIN}"
echo "  Log Analytics:   ${LAW_NAME}"
