#!/usr/bin/env bash
# =============================================================================
# The Keycloak client cfm-agents on Azure (ADR-088, #973)
# =============================================================================
#   wire-cfm-agents-client.sh
#
# What 20-cfm-fork.sh `apps` needs and does not make: the client scopes CFM
# asks for and the confidential client cfm-agents in realm edcv, with its
# secret in Key Vault as cfm-agents-client-secret. scripts/seed-cfm.sh step 2
# makes the same locally; this runs that step (SEED_CFM_ONLY=keycloak) against
# this resource group's Keycloak, with a secret generated into Key Vault on the
# first run and kept after (rebuild rehearsal, #927).
#
# Idempotent. The secret is never printed. Needs: az (logged in) with Key
# Vault Secrets Officer on KEY_VAULT_NAME, python3.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
# shellcheck source=env.sh
source "${SCRIPT_DIR}/env.sh"

SECRET_NAME="cfm-agents-client-secret"

secret="$(kv_secret "$SECRET_NAME" quiet)"
if [ -z "$secret" ]; then
  secret="$(openssl rand -hex 32)"
  az keyvault secret set --vault-name "$KEY_VAULT_NAME" --name "$SECRET_NAME" \
    --value "$secret" -o none
  ok "generated ${SECRET_NAME} in ${KEY_VAULT_NAME} (not displayed)"
fi
admin_pw="$(kc_admin_password)"
[ -n "$admin_pw" ] || { err "no Keycloak admin password"; exit 1; }

SEED_CFM_ONLY=keycloak KC_URL="$KEYCLOAK_BASE_URL" KC_ADMIN_USER="$KC_ADMIN_USER" \
  KC_ADMIN_PASSWORD="$admin_pw" CFM_AGENTS_CLIENT_SECRET="$secret" \
  bash "${REPO_ROOT}/scripts/seed-cfm.sh"
unset secret admin_pw
ok "cfm-agents in realm edcv at ${KEYCLOAK_BASE_URL}, its secret in ${KEY_VAULT_NAME}"
