#!/usr/bin/env bash
# Phase 3: Identity — Keycloak + Vault container apps.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/env.sh"

log "Phase 3: Identity services"

# Workaround B (ADR-018): Postgres is an ACA container app, reached via
# the short service name within the ACA environment. sslmode=disable because
# the container Postgres image does not enable TLS by default.
PG_JDBC="jdbc:postgresql://${PG_HOST}:${PG_PORT}/${KC_DB_NAME}?sslmode=disable"

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

# ── Vault container app (Azure Files file backend — ADR-017) ───────────────
# Two-step: create with CLI flags, then patch YAML to attach Azure Files volume
# (same pattern as Phase 2; containerapp extension 1.3.0b4 `create --yaml` is buggy).
log "Creating Vault container app (no volume yet)..."
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
  --env-vars \
    "VAULT_DEV_ROOT_TOKEN_ID=${VAULT_ROOT_TOKEN}" \
    "VAULT_DEV_LISTEN_ADDRESS=0.0.0.0:8200" \
    "SKIP_SETCAP=true" \
  -o none
ok "Vault container app created"

log "Patching Vault to mount vault-data Azure Files share..."
VAULT_YAML=$(mktemp)
az containerapp show --name "$VAULT_APP" --resource-group "$RG" -o yaml > "$VAULT_YAML"

python3 - "$VAULT_YAML" <<'PY'
import sys, yaml
path = sys.argv[1]
with open(path) as f:
    doc = yaml.safe_load(f)
tpl = doc['properties']['template']
vols = tpl.get('volumes') or []
if not any((v or {}).get('name') == 'vault-data' for v in vols):
    vols.append({'name': 'vault-data', 'storageType': 'AzureFile', 'storageName': 'vault-data'})
tpl['volumes'] = vols
for c in tpl['containers']:
    mounts = c.get('volumeMounts') or []
    if not any((m or {}).get('volumeName') == 'vault-data' for m in mounts):
        mounts.append({'volumeName': 'vault-data', 'mountPath': '/vault/data'})
    c['volumeMounts'] = mounts
with open(path, 'w') as f:
    yaml.safe_dump(doc, f)
PY

az containerapp update --name "$VAULT_APP" --resource-group "$RG" --yaml "$VAULT_YAML" -o none
rm -f "$VAULT_YAML"
ok "Vault container app ${VAULT_APP} (Azure Files /vault/data)"

# ── Summary ──────────────────────────────────────────────────────────────────
eval "$(get_aca_fqdns)"
log "Identity services complete"
echo "  Keycloak: ${KEYCLOAK_PUBLIC_URL:-pending}"
echo "  Vault:    ${VAULT_URL:-pending} (internal)"
