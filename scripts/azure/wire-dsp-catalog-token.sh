#!/usr/bin/env bash
set -euo pipefail
# =============================================================================
# Give the catalog crawler a credential for the hub's demo DSP route.
# =============================================================================
# Since #404 (ADR-044) every API route needs a session. The catalog crawler
# is a machine: it POSTs to /api/mock-dsp/<participant>/catalog/request every
# five minutes and has no session. The route therefore also accepts
# `Authorization: Bearer <DSP_CATALOG_TOKEN>`, and this script wires that token
# into both sides the way ADR-036 keeps operator secrets: one copy, in Key
# Vault, referenced by the apps through a managed identity, never copied.
#
#   Key Vault secret   dsp-catalog-token        (created with --create only)
#   identity           id-mvhd-claude-federation (Key Vault Secrets User), the
#                      same one mvhd-keycloak reads its admin password through
#   mvhd-ui            secret keyvaultref, env DSP_CATALOG_TOKEN
#   crawler job        secret keyvaultref, env DSP_CATALOG_TOKEN and
#                      DSP_CATALOG_TOKEN_HOSTS (the crawler sends the token to
#                      these hosts only, never to another participant)
#
# Usage:
#   scripts/azure/wire-dsp-catalog-token.sh --create   # operator: also create
#                                                      # the secret if absent
#   scripts/azure/wire-dsp-catalog-token.sh            # CI: wire references
#
# Idempotent. Never prints the token. --create needs Key Vault Secrets
# Officer; wiring needs Container Apps Contributor and nothing on the vault,
# because the apps resolve the reference themselves.
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/azure/env.sh
source "$SCRIPT_DIR/env.sh"

CREATE=false
[ "${1:-}" = "--create" ] && CREATE=true

SECRET_NAME="dsp-catalog-token"
IDENTITY_NAME="${DSP_TOKEN_IDENTITY:-id-mvhd-claude-federation}"
CRAWLER_JOB="${CRAWLER_JOB:-mvhd-catalog-crawler}"
TOKEN_HOSTS="${DSP_CATALOG_TOKEN_HOSTS:-${CUSTOM_DOMAIN}}"

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
    token="$(openssl rand -hex 32)"
    az keyvault secret set --vault-name "$KEY_VAULT_NAME" --name "$SECRET_NAME" \
      --value "$token" -o none
    unset token
    ok "created ${SECRET_NAME} in ${KEY_VAULT_NAME} (256 bit, not displayed)"
  fi
fi

log "mvhd-ui: identity, secret reference, env"
az containerapp identity assign --name "$UI_APP" --resource-group "$RG" \
  --user-assigned "$IDENTITY_ID" -o none
az containerapp secret set --name "$UI_APP" --resource-group "$RG" \
  --secrets "${SECRET_NAME}=${REF}" -o none
az containerapp update --name "$UI_APP" --resource-group "$RG" \
  --set-env-vars "DSP_CATALOG_TOKEN=secretref:${SECRET_NAME}" -o none
ok "mvhd-ui reads DSP_CATALOG_TOKEN from Key Vault"

log "${CRAWLER_JOB}: identity, secret reference, env"
az containerapp job identity assign --name "$CRAWLER_JOB" --resource-group "$RG" \
  --user-assigned "$IDENTITY_ID" -o none
az containerapp job secret set --name "$CRAWLER_JOB" --resource-group "$RG" \
  --secrets "${SECRET_NAME}=${REF}" -o none
az containerapp job update --name "$CRAWLER_JOB" --resource-group "$RG" \
  --set-env-vars "DSP_CATALOG_TOKEN=secretref:${SECRET_NAME}" \
                 "DSP_CATALOG_TOKEN_HOSTS=${TOKEN_HOSTS}" -o none
ok "${CRAWLER_JOB} sends the token to: ${TOKEN_HOSTS}"
