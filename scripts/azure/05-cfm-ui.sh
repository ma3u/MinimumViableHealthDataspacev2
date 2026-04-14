#!/usr/bin/env bash
# Phase 5: CFM + UI — tenant/provision managers, Next.js UI.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/env.sh"
eval "$(get_aca_fqdns)"

log "Phase 5: CFM + UI"

# Workaround B (ADR-018): PG_HOST exported by env.sh (mvhd-postgres short name)
az acr login --name "$ACR_NAME"
ACR_PASSWORD=$(az acr credential show --name "$ACR_NAME" --query "passwords[0].value" -o tsv)

# ── Tenant Manager ──────────────────────────────────────────────────────────
log "Creating Tenant Manager container app..."
az containerapp create \
  --name "$TENANT_MGR_APP" --resource-group "$RG" --environment "$ACA_ENV" \
  --image "$TENANT_MGR_IMAGE" \
  --registry-server "$ACR_LOGIN_SERVER" \
  --registry-username "$ACR_NAME" \
  --registry-password "$ACR_PASSWORD" \
  --cpu 0.25 --memory 0.5Gi \
  --min-replicas 1 --max-replicas 1 \
  --ingress internal --target-port 8080 \
  --env-vars \
    "DATABASE_URL=postgresql://${PG_ADMIN}:${PG_PASSWORD}@${PG_HOST}:${PG_PORT}/cfm?sslmode=disable" \
  -o none
ok "Tenant Manager"

# ── Provision Manager ───────────────────────────────────────────────────────
log "Creating Provision Manager container app..."
az containerapp create \
  --name "$PROVISION_MGR_APP" --resource-group "$RG" --environment "$ACA_ENV" \
  --image "$PROVISION_MGR_IMAGE" \
  --registry-server "$ACR_LOGIN_SERVER" \
  --registry-username "$ACR_NAME" \
  --registry-password "$ACR_PASSWORD" \
  --cpu 0.25 --memory 0.5Gi \
  --min-replicas 1 --max-replicas 1 \
  --ingress internal --target-port 8080 \
  --env-vars \
    "DATABASE_URL=postgresql://${PG_ADMIN}:${PG_PASSWORD}@${PG_HOST}:${PG_PORT}/cfm?sslmode=disable" \
    "VAULT_URL=${VAULT_URL:-}" \
    "VAULT_TOKEN=${VAULT_ROOT_TOKEN}" \
  -o none
ok "Provision Manager"

# ── Next.js UI ──────────────────────────────────────────────────────────────
log "Creating UI container app..."
az containerapp create \
  --name "$UI_APP" --resource-group "$RG" --environment "$ACA_ENV" \
  --image "$UI_IMAGE" \
  --registry-server "$ACR_LOGIN_SERVER" \
  --registry-username "$ACR_NAME" \
  --registry-password "$ACR_PASSWORD" \
  --cpu 0.5 --memory 1Gi \
  --min-replicas 1 --max-replicas 1 \
  --ingress external --target-port 3000 \
  --env-vars \
    "NEXT_PUBLIC_STATIC_EXPORT=false" \
    "NEXT_PUBLIC_DEPLOYMENT_TARGET=azure" \
    "DEPLOYMENT_TARGET=azure" \
    "AZURE_SUBSCRIPTION_ID=${SUBSCRIPTION_ID}" \
    "AZURE_RESOURCE_GROUP=${RG}" \
    "NEXTAUTH_URL=${UI_PUBLIC_URL:-https://placeholder.azurecontainerapps.io}" \
    "NEXTAUTH_SECRET=mvhd-azure-secret-change-me" \
    "KEYCLOAK_ID=health-dataspace-ui" \
    "KEYCLOAK_SECRET=health-dataspace-ui-secret" \
    "KEYCLOAK_ISSUER=${KEYCLOAK_PUBLIC_URL:-}/realms/edcv" \
    "KEYCLOAK_PUBLIC_URL=${KEYCLOAK_PUBLIC_URL:-}/realms/edcv" \
    "NEO4J_PROXY_URL=${NEO4J_PROXY_URL:-}:9090" \
    "NEO4J_HTTP_URL=${NEO4J_HTTP_URL:-}" \
    "NEO4J_URI=neo4j://${NEO4J_APP}.internal.${ACA_DOMAIN}:7687" \
    "NEO4J_ENCRYPTED=false" \
    "NEO4J_USER=${NEO4J_USER}" \
    "NEO4J_PASSWORD=${NEO4J_PASSWORD}" \
  -o none
ok "UI container app"

# ── Update NEXTAUTH_URL with actual FQDN ────────────────────────────────────
eval "$(get_aca_fqdns)"
log "Updating NEXTAUTH_URL with actual UI FQDN..."
az containerapp update \
  --name "$UI_APP" --resource-group "$RG" \
  --set-env-vars "NEXTAUTH_URL=${UI_PUBLIC_URL}" \
  -o none
ok "NEXTAUTH_URL updated to ${UI_PUBLIC_URL}"

# ── Enable system-assigned managed identity for Azure Monitor metrics ───────
# (ADR-018 Workaround B: no Log Analytics Workspace — UI queries platform
# metrics directly via ARM REST using its own identity.)
log "Enabling system-assigned managed identity on UI..."
UI_PRINCIPAL_ID=$(az containerapp identity assign \
  --name "$UI_APP" --resource-group "$RG" \
  --system-assigned \
  --query "principalId" -o tsv)
ok "UI managed identity: ${UI_PRINCIPAL_ID}"

# Grant Reader (list container apps) + Monitoring Reader (read metrics) on RG
log "Granting RG-scoped Reader + Monitoring Reader to UI identity..."
RG_SCOPE="/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}"
for role in "Reader" "Monitoring Reader"; do
  az role assignment create \
    --assignee-object-id "$UI_PRINCIPAL_ID" \
    --assignee-principal-type ServicePrincipal \
    --role "$role" \
    --scope "$RG_SCOPE" \
    -o none 2>/dev/null || true
done
ok "RBAC roles granted"

# ── Summary ──────────────────────────────────────────────────────────────────
log "CFM + UI complete"
echo "  Tenant Manager:    ${TENANT_MGR_APP}"
echo "  Provision Manager: ${PROVISION_MGR_APP}"
echo "  UI:                ${UI_PUBLIC_URL}"
