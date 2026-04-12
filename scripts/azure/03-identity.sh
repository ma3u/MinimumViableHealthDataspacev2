#!/usr/bin/env bash
# Phase 3: Identity — Keycloak + Vault container apps.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/env.sh"

log "Phase 3: Identity services"

PG_HOST="${PG_SERVER}.postgres.database.azure.com"
PG_JDBC="jdbc:postgresql://${PG_HOST}:5432/${KC_DB_NAME}"

# ── Push Keycloak image ─────────────────────────────────────────────────────
log "Pulling and pushing Keycloak image..."
az acr login --name "$ACR_NAME"
docker pull --platform linux/amd64 quay.io/keycloak/keycloak:latest
docker tag quay.io/keycloak/keycloak:latest "${KEYCLOAK_IMAGE}"
docker push "${KEYCLOAK_IMAGE}"
ok "Keycloak image in ACR"

# ── Keycloak container app ──────────────────────────────────────────────────
log "Creating Keycloak container app..."
az containerapp create \
  --name "$KEYCLOAK_APP" --resource-group "$RG" --environment "$ACA_ENV" \
  --image "$KEYCLOAK_IMAGE" \
  --registry-server "$ACR_LOGIN_SERVER" \
  --cpu 1 --memory 2Gi \
  --min-replicas 1 --max-replicas 1 \
  --ingress external --target-port 8080 \
  --command "/opt/keycloak/bin/kc.sh" --args "start-dev" \
  --env-vars \
    "KC_DB=postgres" \
    "KC_DB_URL=${PG_JDBC}" \
    "KC_DB_USERNAME=${PG_ADMIN}" \
    "KC_DB_PASSWORD=${PG_PASSWORD}" \
    "KC_HOSTNAME_STRICT=false" \
    "KC_PROXY=edge" \
    "KEYCLOAK_ADMIN=${KC_ADMIN_USER}" \
    "KEYCLOAK_ADMIN_PASSWORD=${KC_ADMIN_PASSWORD}" \
  -o none
ok "Keycloak container app ${KEYCLOAK_APP}"

# ── Push Vault image ────────────────────────────────────────────────────────
log "Pulling and pushing Vault image..."
docker pull --platform linux/amd64 hashicorp/vault:latest
docker tag hashicorp/vault:latest "${VAULT_IMAGE}"
docker push "${VAULT_IMAGE}"
ok "Vault image in ACR"

# ── Vault container app ─────────────────────────────────────────────────────
log "Creating Vault container app..."
az containerapp create \
  --name "$VAULT_APP" --resource-group "$RG" --environment "$ACA_ENV" \
  --image "$VAULT_IMAGE" \
  --registry-server "$ACR_LOGIN_SERVER" \
  --cpu 0.5 --memory 1Gi \
  --min-replicas 1 --max-replicas 1 \
  --ingress internal --target-port 8200 \
  --env-vars \
    "VAULT_DEV_ROOT_TOKEN_ID=${VAULT_ROOT_TOKEN}" \
    "VAULT_DEV_LISTEN_ADDRESS=0.0.0.0:8200" \
  -o none
ok "Vault container app ${VAULT_APP}"

# ── Summary ──────────────────────────────────────────────────────────────────
eval "$(get_aca_fqdns)"
log "Identity services complete"
echo "  Keycloak: ${KEYCLOAK_PUBLIC_URL:-pending}"
echo "  Vault:    ${VAULT_URL:-pending} (internal)"
