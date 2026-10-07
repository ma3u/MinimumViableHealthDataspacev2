#!/usr/bin/env bash
# Phase 3: Identity — Keycloak + Vault container apps.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/env.sh"

log "Phase 3: Identity services"

# Flexible Server (ADR-041), over TLS. The password reaches Keycloak as the
# kc-db-password ACA secret, never as a plaintext env var. Pool capped at 10:
# B1ms gives users 35 connections and Keycloak's default pool is 100.
PG_JDBC="jdbc:postgresql://${PG_HOST}:${PG_PORT}/${KC_DB_NAME}?sslmode=${PG_SSLMODE}"
KC_DB_PW="$(pg_admin_password)"
[ -n "$KC_DB_PW" ] || { err "no Flexible Server password; run 13-postgres-flexible-server.sh 1 and 2 first"; exit 1; }

# ── Push Keycloak image ─────────────────────────────────────────────────────
log "Pulling and pushing Keycloak image..."
az acr login --name "$ACR_NAME"
docker pull --platform linux/amd64 "quay.io/keycloak/keycloak:${KEYCLOAK_VERSION}"
docker tag "quay.io/keycloak/keycloak:${KEYCLOAK_VERSION}" "${KEYCLOAK_IMAGE}"
docker push "${KEYCLOAK_IMAGE}"
ok "Keycloak image in ACR"

# ── Keycloak container app ──────────────────────────────────────────────────
# Prod profile, not start-dev (#577). TLS ends at the ACA ingress, so HTTP is
# on behind it; one replica, so the cache is local. `start` on the plain image
# builds at startup; wire-keycloak-theme.sh then swaps in the image built
# ahead and `start --optimized`.
log "Creating Keycloak container app..."
az containerapp create \
  --name "$KEYCLOAK_APP" --resource-group "$RG" --environment "$ACA_ENV" \
  --image "$KEYCLOAK_IMAGE" \
  --registry-server "$ACR_LOGIN_SERVER" \
  --cpu 1 --memory 2Gi \
  --min-replicas 1 --max-replicas 1 \
  --ingress external --target-port 8080 \
  --command "/opt/keycloak/bin/kc.sh" --args "start" \
  --secrets "kc-db-password=${KC_DB_PW}" \
  --env-vars \
    "KC_DB=postgres" \
    "KC_DB_URL=${PG_JDBC}" \
    "KC_DB_USERNAME=${PG_ADMIN}" \
    "KC_DB_PASSWORD=secretref:kc-db-password" \
    "KC_DB_POOL_MAX_SIZE=10" \
    "KC_HOSTNAME=${KEYCLOAK_PUBLIC_HOSTNAME}" \
    "KC_HOSTNAME_STRICT=false" \
    "KC_HOSTNAME_STRICT_BACKCHANNEL=false" \
    "KC_PROXY_HEADERS=xforwarded" \
    "KC_HTTP_ENABLED=true" \
    "KC_CACHE=local" \
    "KEYCLOAK_ADMIN=${KC_ADMIN_USER}" \
    "KEYCLOAK_ADMIN_PASSWORD=$(kc_admin_password)" \
  -o none
unset KC_DB_PW
ok "Keycloak container app ${KEYCLOAK_APP}"

# ── Push Vault image ────────────────────────────────────────────────────────
log "Pulling and pushing Vault image..."
docker pull --platform linux/amd64 "hashicorp/vault:${VAULT_VERSION}"
docker tag "hashicorp/vault:${VAULT_VERSION}" "${VAULT_IMAGE}"
docker push "${VAULT_IMAGE}"
ok "Vault image in ACR"

# ── Vault container app (Flexible Server storage + unseal sidecar, ADR-046) ─
# Created with CLI flags first (containerapp extension 1.3.0b4 `create --yaml`
# is buggy), then 14-vault-on-postgres.sh gives it its storage, the sidecar and
# the vault-data share. Until that runs the image's default `server -dev`
# starts, which is why the call below is not optional.
log "Creating Vault container app..."
ACR_PASSWORD=$(az acr credential show --name "$ACR_NAME" --query "passwords[0].value" -o tsv)
az containerapp create \
  --name "$VAULT_APP" --resource-group "$RG" --environment "$ACA_ENV" \
  --image "$VAULT_IMAGE" \
  --registry-server "$ACR_LOGIN_SERVER" \
  --registry-username "$ACR_NAME" \
  --registry-password "$ACR_PASSWORD" \
  --cpu 0.5 --memory 1Gi \
  --min-replicas 1 --max-replicas 1 \
  --ingress internal --target-port 8200 \
  --env-vars "SKIP_SETCAP=true" \
  -o none
ok "Vault container app created"

"${SCRIPT_DIR}/14-vault-on-postgres.sh" all
ok "Vault container app ${VAULT_APP} (storage on ${PG_FLEX_NAME}, ADR-046)"

# ── Summary ──────────────────────────────────────────────────────────────────
eval "$(get_aca_fqdns)"
log "Identity services complete"
echo "  Keycloak: ${KEYCLOAK_PUBLIC_URL:-pending}"
echo "  Vault:    ${VAULT_URL:-pending} (internal)"
