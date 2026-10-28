#!/usr/bin/env bash
set -euo pipefail
# =============================================================================
# Give the hub the key of the secure hash that links a PID to an account.
# =============================================================================
# ADR-067: the hub stores HMAC-SHA256(key, given | family | birth date) on a
# Keycloak account, never the name or the birth date. The key is what makes
# the hash useless to anyone who reads Keycloak's data, so it lives in Key
# Vault only, apart from Keycloak, and mvhd-ui reads it through a Key Vault
# reference (ADR-036), the way it reads DSP_CATALOG_TOKEN.
#
#   Key Vault secret   pid-fingerprint-key  (256 bit, base64; created with
#                      --create only, never printed)
#   identity           id-mvhd-claude-federation (Key Vault Secrets User)
#   mvhd-ui            secret keyvaultref, env PID_FINGERPRINT_KEY and
#                      PID_FINGERPRINT_KEY_ID (k1)
#
# Usage:
#   scripts/azure/wire-pid-fingerprint-key.sh --create   # operator, once
#   scripts/azure/wire-pid-fingerprint-key.sh            # wire the reference
#
# Rotating the key breaks every link until the person links again (ADR-067);
# a new key gets a new PID_FINGERPRINT_KEY_ID so the change is visible.
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/azure/env.sh
source "$SCRIPT_DIR/env.sh"

CREATE=false
[ "${1:-}" = "--create" ] && CREATE=true

SECRET_NAME="pid-fingerprint-key"
KEY_ID="${PID_FINGERPRINT_KEY_ID:-k1}"
IDENTITY_NAME="${PID_KEY_IDENTITY:-id-mvhd-claude-federation}"

KV_URI="$(az keyvault show --name "$KEY_VAULT_NAME" --query properties.vaultUri -o tsv 2>/dev/null || true)"
KV_URI="${KV_URI:-https://${KEY_VAULT_NAME}.vault.azure.net/}"
SECRET_URL="${KV_URI%/}/secrets/${SECRET_NAME}"
IDENTITY_ID="$(az identity show --name "$IDENTITY_NAME" --resource-group "$RG" --query id -o tsv)"
REF="keyvaultref:${SECRET_URL},identityref:${IDENTITY_ID}"

if [ "$CREATE" = true ]; then
  if az keyvault secret show --vault-name "$KEY_VAULT_NAME" --name "$SECRET_NAME" \
       --query id -o none 2>/dev/null; then
    ok "Key Vault already holds ${SECRET_NAME}; kept as it is"
  else
    # Generated here, held in a variable that never reaches the terminal or
    # the log, and dropped right after.
    key="$(openssl rand -base64 32)"
    az keyvault secret set --vault-name "$KEY_VAULT_NAME" --name "$SECRET_NAME" \
      --value "$key" --tags "key-id=${KEY_ID}" adr=067 -o none
    unset key
    ok "created ${SECRET_NAME} in ${KEY_VAULT_NAME} (256 bit, key id ${KEY_ID}, not displayed)"
  fi
fi

log "mvhd-ui: identity, secret reference, env"
az containerapp identity assign --name "$UI_APP" --resource-group "$RG" \
  --user-assigned "$IDENTITY_ID" -o none
az containerapp secret set --name "$UI_APP" --resource-group "$RG" \
  --secrets "${SECRET_NAME}=${REF}" -o none
az containerapp update --name "$UI_APP" --resource-group "$RG" \
  --set-env-vars "PID_FINGERPRINT_KEY=secretref:${SECRET_NAME}" \
                 "PID_FINGERPRINT_KEY_ID=${KEY_ID}" -o none
ok "mvhd-ui reads PID_FINGERPRINT_KEY from Key Vault (key id ${KEY_ID})"
