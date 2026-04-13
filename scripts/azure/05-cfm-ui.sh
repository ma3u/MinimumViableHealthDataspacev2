#!/usr/bin/env bash
# Phase 5: CFM + UI — tenant/provision managers, Next.js UI.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/env.sh"
eval "$(get_aca_fqdns)"

log "Phase 5: CFM + UI"

PG_HOST="${PG_SERVER}.postgres.database.azure.com"
az acr login --name "$ACR_NAME"

# ── Tenant Manager ──────────────────────────────────────────────────────────
log "Creating Tenant Manager container app..."
az containerapp create \
  --name "$TENANT_MGR_APP" --resource-group "$RG" --environment "$ACA_ENV" \
  --image "$TENANT_MGR_IMAGE" \
  --registry-server "$ACR_LOGIN_SERVER" \
  --cpu 0.25 --memory 0.5Gi \
  --min-replicas 1 --max-replicas 1 \
  --ingress internal --target-port 8080 \
  --env-vars \
    "DATABASE_URL=postgresql://${PG_ADMIN}:${PG_PASSWORD}@${PG_HOST}:5432/cfm?sslmode=require" \
  -o none
ok "Tenant Manager"

# ── Provision Manager ───────────────────────────────────────────────────────
log "Creating Provision Manager container app..."
az containerapp create \
  --name "$PROVISION_MGR_APP" --resource-group "$RG" --environment "$ACA_ENV" \
  --image "$PROVISION_MGR_IMAGE" \
  --registry-server "$ACR_LOGIN_SERVER" \
  --cpu 0.25 --memory 0.5Gi \
  --min-replicas 1 --max-replicas 1 \
  --ingress internal --target-port 8080 \
  --env-vars \
    "DATABASE_URL=postgresql://${PG_ADMIN}:${PG_PASSWORD}@${PG_HOST}:5432/cfm?sslmode=require" \
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
  --cpu 0.5 --memory 1Gi \
  --min-replicas 1 --max-replicas 1 \
  --ingress external --target-port 3000 \
  --env-vars \
    "NEXT_PUBLIC_STATIC_EXPORT=false" \
    "NEXTAUTH_URL=${UI_PUBLIC_URL:-https://placeholder.azurecontainerapps.io}" \
    "NEXTAUTH_SECRET=mvhd-azure-secret-change-me" \
    "KEYCLOAK_ID=health-dataspace-ui" \
    "KEYCLOAK_SECRET=health-dataspace-ui-secret" \
    "KEYCLOAK_ISSUER=${KEYCLOAK_INTERNAL_URL:-}/realms/edcv" \
    "KEYCLOAK_PUBLIC_URL=${KEYCLOAK_PUBLIC_URL:-}" \
    "NEO4J_PROXY_URL=${NEO4J_PROXY_URL:-}:9090" \
    "NEO4J_HTTP_URL=${NEO4J_HTTP_URL:-}" \
    "NEO4J_URI=bolt://${NEO4J_APP}.internal.${ACA_DOMAIN}:7687" \
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

# ── Summary ──────────────────────────────────────────────────────────────────
log "CFM + UI complete"
echo "  Tenant Manager:    ${TENANT_MGR_APP}"
echo "  Provision Manager: ${PROVISION_MGR_APP}"
echo "  UI:                ${UI_PUBLIC_URL}"
