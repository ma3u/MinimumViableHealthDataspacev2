#!/usr/bin/env bash
set -euo pipefail
# =============================================================================
# The Keycloak `admin` client secret on Azure: off the public default, into
# Key Vault, and from there into the apps that use it.
# =============================================================================
# Until 2026-10-07 the live `admin` client in realm edcv had the secret every
# compose file and seed script carries (`edc-v-admin-secret`), and mvhd-ui
# and mvhd-neo4j-proxy held it as a plain environment value. Anyone who can
# reach Keycloak's token endpoint could get a token for the EDC management
# API with it.
#
# Keycloak stays the source of truth: 05-cfm-agents.sh and the identity
# reseed (edc-reseed-identity-layer.yml) read the secret from Keycloak at
# run time. The apps cannot, so they get it the ADR-036 way, as in
# wire-dsp-catalog-token.sh: one copy in Key Vault, referenced through the
# managed identity, never printed.
#
#   Keycloak        realm edcv, client admin (regenerated with --rotate)
#   Key Vault       edc-admin-client-secret
#   mvhd-ui         EDC_SERVICE_CLIENT_SECRET=secretref:edc-admin-client-secret
#   mvhd-neo4j-proxy TCK_CLIENT_SECRET=secretref:edc-admin-client-secret
#   CFM agents      05-cfm-agents.sh (reads Keycloak, restarts on change)
#
# Usage:
#   rotate-edc-admin-client-secret.sh --rotate   # new secret in Keycloak, then wire
#   rotate-edc-admin-client-secret.sh            # wire Keycloak's current secret
#
# Rerun without --rotate after a realm re-import: --import-realm brings the
# public default back (docs/knowledge/runbooks/keycloak-realm-drift.md).
#
# Needs: Key Vault Secrets Officer (the PIM role), Container Apps Contributor.
# =============================================================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/azure/env.sh
source "$SCRIPT_DIR/env.sh"
ROTATE=false
[ "${1:-}" = "--rotate" ] && ROTATE=true
SECRET_NAME="edc-admin-client-secret"
IDENTITY_NAME="${ADMIN_SECRET_IDENTITY:-id-mvhd-claude-federation}"
KC="${KEYCLOAK_PUBLIC_URL:-https://auth.ehds.mabu.red}"
DEFAULT_SECRET="edc-v-admin-secret"

# ── 1. Keycloak ─────────────────────────────────────────────────────────────
KC_ADMIN_PASS=$(kc_admin_password)
[ -n "$KC_ADMIN_PASS" ] || { err "no Keycloak admin password"; exit 1; }
MASTER=$(curl -sS --max-time 30 -X POST "${KC}/realms/master/protocol/openid-connect/token" \
  --data-urlencode grant_type=password --data-urlencode client_id=admin-cli \
  --data-urlencode username=admin --data-urlencode "password=${KC_ADMIN_PASS}" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin).get("access_token",""))')
unset KC_ADMIN_PASS
[ -n "$MASTER" ] || { err "no Keycloak admin token"; exit 1; }
UUID=$(curl -sS --max-time 30 -H "Authorization: Bearer ${MASTER}" \
  "${KC}/admin/realms/edcv/clients?clientId=admin" \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d[0]["id"] if d else "")')
[ -n "$UUID" ] || { err "no client 'admin' in realm edcv"; exit 1; }
if [ "$ROTATE" = true ]; then
  curl -sS --max-time 30 -o /dev/null -X POST -H "Authorization: Bearer ${MASTER}" \
    "${KC}/admin/realms/edcv/clients/${UUID}/client-secret"
  ok "regenerated the admin client secret in Keycloak"
fi
SECRET=$(curl -sS --max-time 30 -H "Authorization: Bearer ${MASTER}" \
  "${KC}/admin/realms/edcv/clients/${UUID}/client-secret" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin).get("value",""))')
unset MASTER
[ -n "$SECRET" ] || { err "could not read the admin client secret"; exit 1; }
[ "$SECRET" != "$DEFAULT_SECRET" ] || warn "Keycloak still has the public default; run with --rotate"

# ── 2. Key Vault ────────────────────────────────────────────────────────────
az keyvault secret set --vault-name "$KEY_VAULT_NAME" --name "$SECRET_NAME" \
  --value "$SECRET" -o none
ok "${SECRET_NAME} in ${KEY_VAULT_NAME} (${#SECRET} chars, not displayed)"
KV_URI="$(az keyvault show --name "$KEY_VAULT_NAME" --query properties.vaultUri -o tsv)"
IDENTITY_ID="$(az identity show --name "$IDENTITY_NAME" --resource-group "$RG" --query id -o tsv)"
REF="keyvaultref:${KV_URI%/}/secrets/${SECRET_NAME},identityref:${IDENTITY_ID}"

# ── 3. The apps ─────────────────────────────────────────────────────────────
wire() {
  local app="$1" var="$2"
  az containerapp identity assign --name "$app" --resource-group "$RG" \
    --user-assigned "$IDENTITY_ID" -o none
  az containerapp secret set --name "$app" --resource-group "$RG" \
    --secrets "${SECRET_NAME}=${REF}" -o none
  az containerapp update --name "$app" --resource-group "$RG" \
    --set-env-vars "${var}=secretref:${SECRET_NAME}" -o none
  ok "${app} reads ${var} from Key Vault"
}
wire "$UI_APP" EDC_SERVICE_CLIENT_SECRET
wire "$NEO4J_PROXY_APP" TCK_CLIENT_SECRET

# ── 4. CFM agents ───────────────────────────────────────────────────────────
log "05-cfm-agents.sh: the agents read the secret from Keycloak and restart on change"
"$SCRIPT_DIR/05-cfm-agents.sh" >/dev/null
ok "CFM agents rewired"

# ── 5. Check ────────────────────────────────────────────────────────────────
token_status() {
  curl -sS --max-time 30 -o /dev/null -w '%{http_code}' -X POST \
    "${KC}/realms/edcv/protocol/openid-connect/token" \
    --data-urlencode grant_type=client_credentials --data-urlencode client_id=admin \
    --data-urlencode "client_secret=$1"
}
new=$(token_status "$SECRET"); old=$(token_status "$DEFAULT_SECRET")
unset SECRET
[ "$new" = 200 ] || { err "the secret in Key Vault gets HTTP ${new} from Keycloak"; exit 1; }
ok "the secret in Key Vault gets a token (HTTP ${new})"
if [ "$old" = 200 ]; then
  warn "the public default still gets a token; run with --rotate"
else
  ok "the public default is refused (HTTP ${old})"
fi
