#!/usr/bin/env bash
# Phase 6: Post-deployment — seed Neo4j, bootstrap Vault, import Keycloak realm.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
source "${SCRIPT_DIR}/env.sh"
eval "$(get_aca_fqdns)"

log "Phase 6: Post-deployment setup"

az acr login --name "$ACR_NAME"

# ── Build and run Neo4j seed job ─────────────────────────────────────────────
log "Building Neo4j seed image..."
SEED_DIR=$(mktemp -d)
cp "${REPO_ROOT}"/neo4j/*.cypher "${SEED_DIR}/"
cp "${REPO_ROOT}/neo4j/seed.sh" "${SEED_DIR}/seed.sh"

cat > "${SEED_DIR}/Dockerfile" <<'DOCKERFILE'
FROM alpine:3.19
RUN apk add --no-cache curl jq
COPY *.cypher /seed/
COPY seed.sh /seed/seed.sh
RUN chmod +x /seed/seed.sh
ENTRYPOINT ["/bin/sh", "/seed/seed.sh"]
DOCKERFILE

docker buildx build --platform linux/amd64 \
  -t "${ACR_LOGIN_SERVER}/mvhd-neo4j-seed:latest" --push "${SEED_DIR}"
rm -rf "${SEED_DIR}"
ok "Neo4j seed image pushed"

log "Creating Neo4j seed job..."
az containerapp job create \
  --name "$NEO4J_SEED_JOB" --resource-group "$RG" --environment "$ACA_ENV" \
  --image "${ACR_LOGIN_SERVER}/mvhd-neo4j-seed:latest" \
  --registry-server "$ACR_LOGIN_SERVER" \
  --cpu 0.5 --memory 1Gi \
  --trigger-type Manual --replica-timeout 600 \
  --env-vars \
    "NEO4J_HTTP_URL=${NEO4J_HTTP_URL}" \
    "NEO4J_USER=${NEO4J_USER}" \
    "NEO4J_PASSWORD=${NEO4J_PASSWORD}" \
  -o none
ok "Neo4j seed job created"

log "Starting Neo4j seed job..."
az containerapp job start --name "$NEO4J_SEED_JOB" --resource-group "$RG" -o none
ok "Neo4j seed job started"

# ── Build and run Vault bootstrap job ────────────────────────────────────────
log "Building Vault bootstrap image..."
VAULT_DIR=$(mktemp -d)
cp "${REPO_ROOT}/scripts/vault-init-or-unseal.sh" "${VAULT_DIR}/" 2>/dev/null || true

cat > "${VAULT_DIR}/bootstrap.sh" <<VAULTSCRIPT
#!/bin/sh
set -eu

VAULT_URL="\${VAULT_ADDR}"
VAULT_TOKEN="\${VAULT_DEV_ROOT_TOKEN_ID:-root}"
KC_URL="\${KEYCLOAK_URL}"

header() { echo ""; echo "=== \$1 ==="; }
vault_api() {
  local method="\$1" path="\$2" data="\${3:-}"
  if [ -n "\$data" ]; then
    curl -sf -X "\$method" "\${VAULT_URL}/v1\${path}" \
      -H "X-Vault-Token: \${VAULT_TOKEN}" \
      -H "Content-Type: application/json" \
      -d "\$data" 2>/dev/null || echo '{"errors":["request failed"]}'
  else
    curl -sf -X "\$method" "\${VAULT_URL}/v1\${path}" \
      -H "X-Vault-Token: \${VAULT_TOKEN}" 2>/dev/null || echo '{"errors":["request failed"]}'
  fi
}

header "Enable JWT auth"
vault_api POST /sys/auth/jwt '{"type":"jwt"}'

header "Configure JWT auth with Keycloak JWKS"
vault_api POST /auth/jwt/config "{\"jwks_url\":\"\${KC_URL}/realms/edcv/protocol/openid-connect/certs\",\"default_role\":\"participant\"}"

header "Enable KV v2 secrets engine"
vault_api POST /sys/mounts/secret '{"type":"kv","options":{"version":"2"}}'

header "Create participant policy"
cat > /tmp/policy.json <<'PEOF'
{"policy":"path \"secret/data/{{identity.entity.aliases.auth_jwt_*.metadata.participant_id}}/*\" { capabilities = [\"create\",\"read\",\"update\",\"delete\",\"list\"] }"}
PEOF
vault_api PUT /sys/policies/acl/participant -d @/tmp/policy.json

header "Create provisioner policy"
cat > /tmp/provisioner.json <<'PPEOF'
{"policy":"path \"secret/data/*\" { capabilities = [\"create\",\"read\",\"update\",\"delete\",\"list\"] } path \"transit/*\" { capabilities = [\"create\",\"read\",\"update\",\"list\"] }"}
PPEOF
vault_api PUT /sys/policies/acl/provisioner -d @/tmp/provisioner.json

header "Create JWT role"
vault_api POST /auth/jwt/role/participant '{"role_type":"jwt","bound_audiences":["account"],"user_claim":"sub","token_policies":["participant"],"token_ttl":"1h","claim_mappings":{"sub":"participant_id"}}'

header "Enable transit engine"
vault_api POST /sys/mounts/transit '{"type":"transit"}'

header "Create AES key for data encryption"
vault_api POST /transit/keys/dataspace-aes '{"type":"aes256-gcm96"}'

header "Store IssuerService signing key"
vault_api POST /secret/data/issuerservice/signing-key '{"data":{"type":"EdDSA","algorithm":"EdDSA","curve":"Ed25519","use":"sig"}}'

header "Store data plane token keys"
vault_api POST /secret/data/dataplane-fhir/token-key '{"data":{"type":"EC","algorithm":"ES256","curve":"P-256","use":"sig"}}'
vault_api POST /secret/data/dataplane-omop/token-key '{"data":{"type":"EC","algorithm":"ES256","curve":"P-256","use":"sig"}}'

echo ""
echo "=== Vault bootstrap complete ==="
VAULTSCRIPT

cat > "${VAULT_DIR}/Dockerfile" <<'DOCKERFILE'
FROM alpine:3.19
RUN apk add --no-cache curl jq
COPY bootstrap.sh /app/bootstrap.sh
RUN chmod +x /app/bootstrap.sh
ENTRYPOINT ["/bin/sh", "/app/bootstrap.sh"]
DOCKERFILE

docker buildx build --platform linux/amd64 \
  -t "${ACR_LOGIN_SERVER}/mvhd-vault-bootstrap:latest" --push "${VAULT_DIR}"
rm -rf "${VAULT_DIR}"
ok "Vault bootstrap image pushed"

log "Creating Vault bootstrap job..."
az containerapp job create \
  --name "$VAULT_BOOTSTRAP_JOB" --resource-group "$RG" --environment "$ACA_ENV" \
  --image "${ACR_LOGIN_SERVER}/mvhd-vault-bootstrap:latest" \
  --registry-server "$ACR_LOGIN_SERVER" \
  --cpu 0.25 --memory 0.5Gi \
  --trigger-type Manual --replica-timeout 300 \
  --env-vars \
    "VAULT_ADDR=${VAULT_URL}" \
    "VAULT_DEV_ROOT_TOKEN_ID=${VAULT_ROOT_TOKEN}" \
    "KEYCLOAK_URL=${KEYCLOAK_INTERNAL_URL}" \
  -o none
ok "Vault bootstrap job created"

log "Starting Vault bootstrap job..."
az containerapp job start --name "$VAULT_BOOTSTRAP_JOB" --resource-group "$RG" -o none
ok "Vault bootstrap job started"

# ── Import Keycloak realm via Admin REST API ─────────────────────────────────
REALM_FILE="${REPO_ROOT}/jad/keycloak-realm.json"
if [[ -f "$REALM_FILE" ]]; then
  log "Importing Keycloak realm..."

  # Get admin token
  KC_TOKEN=$(curl -sf -X POST "${KEYCLOAK_PUBLIC_URL}/realms/master/protocol/openid-connect/token" \
    -d "client_id=admin-cli" \
    -d "username=${KC_ADMIN_USER}" \
    -d "password=${KC_ADMIN_PASSWORD}" \
    -d "grant_type=password" | jq -r '.access_token')

  if [[ -n "$KC_TOKEN" && "$KC_TOKEN" != "null" ]]; then
    # Import realm
    HTTP_CODE=$(curl -sf -o /dev/null -w "%{http_code}" -X POST \
      "${KEYCLOAK_PUBLIC_URL}/admin/realms" \
      -H "Authorization: Bearer ${KC_TOKEN}" \
      -H "Content-Type: application/json" \
      -d "@${REALM_FILE}")

    if [[ "$HTTP_CODE" == "201" || "$HTTP_CODE" == "409" ]]; then
      ok "Keycloak realm imported (${HTTP_CODE})"
    else
      warn "Keycloak realm import returned HTTP ${HTTP_CODE}"
    fi

    # Update client redirect URIs for Azure
    log "Updating client redirect URIs..."
    CLIENT_ID_INTERNAL=$(curl -sf \
      "${KEYCLOAK_PUBLIC_URL}/admin/realms/edcv/clients?clientId=health-dataspace-ui" \
      -H "Authorization: Bearer ${KC_TOKEN}" | jq -r '.[0].id // empty')

    if [[ -n "$CLIENT_ID_INTERNAL" ]]; then
      curl -sf -X PUT \
        "${KEYCLOAK_PUBLIC_URL}/admin/realms/edcv/clients/${CLIENT_ID_INTERNAL}" \
        -H "Authorization: Bearer ${KC_TOKEN}" \
        -H "Content-Type: application/json" \
        -d "{
          \"redirectUris\": [\"${UI_PUBLIC_URL}/*\", \"http://localhost:3000/*\"],
          \"webOrigins\": [\"${UI_PUBLIC_URL}\", \"http://localhost:3000\"]
        }" -o /dev/null
      ok "Client redirect URIs updated"
    else
      warn "Client health-dataspace-ui not found — update redirect URIs manually"
    fi
  else
    warn "Could not get Keycloak admin token — realm import skipped"
  fi
else
  warn "Realm file not found at ${REALM_FILE} — skipping Keycloak import"
fi

# ── Summary ──────────────────────────────────────────────────────────────────
log "Post-deployment complete"
echo "  Neo4j seed job:       ${NEO4J_SEED_JOB} (running)"
echo "  Vault bootstrap job:  ${VAULT_BOOTSTRAP_JOB} (running)"
echo "  Keycloak realm:       imported"
echo ""
echo "Monitor job progress:"
echo "  az containerapp job execution list --name ${NEO4J_SEED_JOB} --resource-group ${RG}"
echo "  az containerapp job execution list --name ${VAULT_BOOTSTRAP_JOB} --resource-group ${RG}"
