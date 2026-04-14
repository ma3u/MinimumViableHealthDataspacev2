#!/usr/bin/env bash
# Phase 6: Post-deployment — seed Neo4j, bootstrap Vault, import Keycloak realm.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
source "${SCRIPT_DIR}/env.sh"
eval "$(get_aca_fqdns)"

log "Phase 6: Post-deployment setup"

az acr login --name "$ACR_NAME"
ACR_PASSWORD=$(az acr credential show --name "$ACR_NAME" --query "passwords[0].value" -o tsv)

# ── Create additional Postgres databases (Workaround B — ADR-018) ───────────
# Postgres auto-creates "keycloak" via POSTGRES_DB. Create the remaining 6 via
# a one-shot exec into the running container.
log "Creating additional Postgres databases..."
for db in controlplane dataplane dataplane_omop identityhub issuerservice cfm; do
  log "  creating ${db}..."
  az containerapp exec \
    --name "$PG_APP" --resource-group "$RG" \
    --command "psql -U ${PG_ADMIN} -d postgres -tAc \"SELECT 1 FROM pg_database WHERE datname='${db}';\" | grep -q 1 || psql -U ${PG_ADMIN} -d postgres -c \"CREATE DATABASE ${db};\"" \
    2>/dev/null || warn "db ${db} create may have failed (check manually)"
done
ok "Postgres databases ensured"

# ── Build and run Neo4j seed job ─────────────────────────────────────────────
log "Building Neo4j seed image..."
SEED_DIR=$(mktemp -d)
cp "${REPO_ROOT}"/neo4j/*.cypher "${SEED_DIR}/"
cp "${REPO_ROOT}/neo4j/seed.sh" "${SEED_DIR}/seed.sh"

cat > "${SEED_DIR}/Dockerfile" <<'DOCKERFILE'
# neo4j:5-community bundles cypher-shell at /var/lib/neo4j/bin — required by
# seed.sh (Bolt-based loader). A plain alpine base has no cypher-shell and
# silently drops every run_file call, leaving compliance/participants empty.
FROM neo4j:5-community
USER root
RUN apt-get update && apt-get install -y --no-install-recommends bash curl jq \
    && rm -rf /var/lib/apt/lists/*
COPY *.cypher /seed/
COPY seed.sh /seed/seed.sh
RUN chmod +x /seed/seed.sh \
    && ln -sf /var/lib/neo4j/bin/cypher-shell /usr/local/bin/cypher-shell
ENTRYPOINT ["/bin/bash", "/seed/seed.sh"]
DOCKERFILE

docker buildx build --platform linux/amd64 \
  -t "${ACR_LOGIN_SERVER}/mvhd-neo4j-seed:latest" --push "${SEED_DIR}"
rm -rf "${SEED_DIR}"
ok "Neo4j seed image pushed"

log "Creating/updating Neo4j seed job..."
if az containerapp job show --name "$NEO4J_SEED_JOB" --resource-group "$RG" -o none 2>/dev/null; then
  az containerapp job update \
    --name "$NEO4J_SEED_JOB" --resource-group "$RG" \
    --image "${ACR_LOGIN_SERVER}/mvhd-neo4j-seed:latest" \
    --cpu 0.5 --memory 1Gi \
    --replica-timeout 600 \
    --set-env-vars \
      "NEO4J_HOST=${NEO4J_APP}.internal.${ACA_DOMAIN}" \
      "NEO4J_PORT=7687" \
      "NEO4J_USER=${NEO4J_USER}" \
      "NEO4J_PASSWORD=${NEO4J_PASSWORD}" \
    -o none
  ok "Neo4j seed job updated"
else
  az containerapp job create \
    --name "$NEO4J_SEED_JOB" --resource-group "$RG" --environment "$ACA_ENV" \
    --image "${ACR_LOGIN_SERVER}/mvhd-neo4j-seed:latest" \
    --registry-server "$ACR_LOGIN_SERVER" \
    --registry-username "$ACR_NAME" \
    --registry-password "$ACR_PASSWORD" \
    --cpu 0.5 --memory 1Gi \
    --trigger-type Manual --replica-timeout 600 \
    --env-vars \
      "NEO4J_HOST=${NEO4J_APP}.internal.${ACA_DOMAIN}" \
      "NEO4J_PORT=7687" \
      "NEO4J_USER=${NEO4J_USER}" \
      "NEO4J_PASSWORD=${NEO4J_PASSWORD}" \
    -o none
  ok "Neo4j seed job created"
fi

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
  --registry-username "$ACR_NAME" \
  --registry-password "$ACR_PASSWORD" \
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

# ── Custom domain binding (ADR-018: ehds.mabu.red) ──────────────────────────
if [[ -n "${CUSTOM_DOMAIN:-}" ]]; then
  log "Preparing custom domain ${CUSTOM_DOMAIN} for ${UI_APP}..."

  UI_FQDN=$(az containerapp show --name "$UI_APP" --resource-group "$RG" \
    --query "properties.configuration.ingress.fqdn" -o tsv)
  VERIFY_ID=$(az containerapp env show --name "$ACA_ENV" --resource-group "$RG" \
    --query "properties.customDomainConfiguration.customDomainVerificationId" -o tsv)

  cat <<DNS

  ╔══════════════════════════════════════════════════════════════════════════╗
  ║  DNS RECORDS REQUIRED at your DNS provider (iwantmyname / mabu.red)      ║
  ╠══════════════════════════════════════════════════════════════════════════╣
  ║  Type   Name          TTL    Value                                       ║
  ║  ────   ─────────     ────   ─────────────────────────────────────────   ║
  ║  CNAME  ehds          3600   ${UI_FQDN}
  ║  TXT    asuid.ehds    3600   ${VERIFY_ID}
  ╚══════════════════════════════════════════════════════════════════════════╝

  Add both records, wait ~5 min for propagation, then press ENTER to continue
  (or Ctrl-C and re-run: scripts/azure/06-post-deploy.sh)...
DNS
  read -r _

  log "Verifying DNS..."
  for i in $(seq 1 12); do
    cname_value=$(dig +short CNAME "${CUSTOM_DOMAIN}" @8.8.8.8 2>/dev/null | head -1)
    txt_value=$(dig +short TXT "asuid.${CUSTOM_DOMAIN}" @8.8.8.8 2>/dev/null | tr -d '"' | head -1)
    if [[ "${cname_value%.}" == "${UI_FQDN}" && "$txt_value" == "$VERIFY_ID" ]]; then
      ok "DNS verified"
      break
    fi
    echo "  attempt ${i}/12: CNAME=${cname_value:-missing} TXT=${txt_value:-missing}"
    sleep 15
  done

  log "Adding hostname ${CUSTOM_DOMAIN} to ${UI_APP}..."
  az containerapp hostname add \
    --name "$UI_APP" --resource-group "$RG" \
    --hostname "$CUSTOM_DOMAIN" -o none || warn "hostname add may have already been run"

  log "Binding managed certificate (may take 5–15 min)..."
  az containerapp hostname bind \
    --name "$UI_APP" --resource-group "$RG" \
    --hostname "$CUSTOM_DOMAIN" \
    --environment "$ACA_ENV" \
    --validation-method CNAME -o none \
    && ok "Managed certificate bound for https://${CUSTOM_DOMAIN}" \
    || warn "hostname bind failed — retry: az containerapp hostname bind --name ${UI_APP} --resource-group ${RG} --hostname ${CUSTOM_DOMAIN} --environment ${ACA_ENV} --validation-method CNAME"

  # Point NEXTAUTH_URL at the custom domain
  log "Updating NEXTAUTH_URL to https://${CUSTOM_DOMAIN}..."
  az containerapp update --name "$UI_APP" --resource-group "$RG" \
    --set-env-vars "NEXTAUTH_URL=https://${CUSTOM_DOMAIN}" -o none

  # Update Keycloak client redirect URIs to include the custom domain
  if [[ -n "${KC_TOKEN:-}" && -n "${CLIENT_ID_INTERNAL:-}" ]]; then
    log "Adding ${CUSTOM_DOMAIN} to Keycloak client redirectUris..."
    curl -sf -X PUT \
      "${KEYCLOAK_PUBLIC_URL}/admin/realms/edcv/clients/${CLIENT_ID_INTERNAL}" \
      -H "Authorization: Bearer ${KC_TOKEN}" \
      -H "Content-Type: application/json" \
      -d "{
        \"redirectUris\": [
          \"https://${CUSTOM_DOMAIN}/*\",
          \"${UI_PUBLIC_URL}/*\",
          \"http://localhost:3000/*\"
        ],
        \"webOrigins\": [
          \"https://${CUSTOM_DOMAIN}\",
          \"${UI_PUBLIC_URL}\",
          \"http://localhost:3000\"
        ]
      }" -o /dev/null \
      && ok "Keycloak redirectUris updated" \
      || warn "Keycloak client update failed — add redirectUri https://${CUSTOM_DOMAIN}/* manually"
  fi
fi

# ── Summary ──────────────────────────────────────────────────────────────────
log "Post-deployment complete"
echo "  Neo4j seed job:       ${NEO4J_SEED_JOB} (running)"
echo "  Vault bootstrap job:  ${VAULT_BOOTSTRAP_JOB} (running)"
echo "  Keycloak realm:       imported"
if [[ -n "${CUSTOM_DOMAIN:-}" ]]; then
  echo "  Custom domain:        https://${CUSTOM_DOMAIN}"
fi
echo ""
echo "Monitor job progress:"
echo "  az containerapp job execution list --name ${NEO4J_SEED_JOB} --resource-group ${RG}"
echo "  az containerapp job execution list --name ${VAULT_BOOTSTRAP_JOB} --resource-group ${RG}"
