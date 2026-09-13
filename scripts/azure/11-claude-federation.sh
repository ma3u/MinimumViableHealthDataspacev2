#!/usr/bin/env bash
# =============================================================================
# Phase 11: claude-federation — workload identity for the Claude API (ADR-034)
# =============================================================================
# Creates the one thing in this system that holds a credential, and gives it an
# identity rather than a secret: a Container App with a managed identity, which
# exchanges an Entra JWT for a short-lived Anthropic token at runtime.
#
# No `sk-ant-...` key is created, stored or passed anywhere by this script.
#
# Order matters. Steps 1 to 3 must run before the Claude Console can be
# configured at all, because registering a federation issuer needs the exact
# `iss` and `aud` of a real token. Step 5 is therefore a separate invocation,
# after you have the rule id.
#
#   ./scripts/azure/11-claude-federation.sh provision   # identity + app
#   ./scripts/azure/11-claude-federation.sh claims      # print iss/aud for the Console
#   ./scripts/azure/11-claude-federation.sh configure   # apply the rule ids
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/azure/env.sh
source "$SCRIPT_DIR/env.sh"

APP="mvhd-claude-federation"
IDENTITY="id-${APP}"
IMAGE="${ACR_LOGIN_SERVER:-$ACR_NAME.azurecr.io}/claude-federation:latest"
# The audience the federation rule matches on. An App ID URI in the tenant.
WIF_AUDIENCE="${ANTHROPIC_WIF_AUDIENCE:-api://meinbefund-claude}"

log()   { echo -e "\033[0;34m[WIF]\033[0m $*"; }
ok()    { echo -e "\033[0;32m[WIF]\033[0m $*"; }
error() { echo -e "\033[0;31m[WIF]\033[0m $*" >&2; }

require_login() {
  if ! az account show >/dev/null 2>&1; then
    error "Azure CLI is not authenticated, or the token has expired."
    error "This subscription enforces sign-in frequency, so run: az login"
    exit 1
  fi
}

provision() {
  require_login
  log "=== Building and pushing the image ==="
  az acr build --registry "$ACR_NAME" --image "claude-federation:latest" \
    --file services/claude-federation/Dockerfile services/claude-federation

  log "=== Creating the user-assigned managed identity ==="
  # User-assigned rather than system-assigned on purpose: the identity outlives
  # the app, so a redeploy does not change the `sub` that the federation rule
  # matches on and silently stop authenticating.
  az identity create --name "$IDENTITY" --resource-group "$RG" --location "$LOCATION" \
    --output none 2>/dev/null || log "identity already exists"

  local client_id principal_id
  client_id=$(az identity show --name "$IDENTITY" --resource-group "$RG" --query clientId -o tsv)
  principal_id=$(az identity show --name "$IDENTITY" --resource-group "$RG" --query principalId -o tsv)
  local identity_id
  identity_id=$(az identity show --name "$IDENTITY" --resource-group "$RG" --query id -o tsv)
  ok "identity clientId=$client_id principalId=$principal_id"

  log "=== Creating the Container App ==="
  # Ingress is external because the phone calls it directly. It is the only
  # externally reachable component that touches health data, so it authenticates
  # every request against the user's OIDC issuer before doing anything.
  az containerapp create \
    --name "$APP" --resource-group "$RG" --environment "$ACA_ENV" \
    --image "$IMAGE" \
    --registry-server "${ACR_LOGIN_SERVER:-$ACR_NAME.azurecr.io}" \
    --user-assigned "$identity_id" \
    --cpu 0.5 --memory 1Gi \
    --min-replicas 1 --max-replicas 3 \
    --ingress external --target-port 8080 \
    --env-vars \
      "AZURE_CLIENT_ID=${client_id}" \
      "ANTHROPIC_WIF_AUDIENCE=${WIF_AUDIENCE}" \
      "USER_OIDC_ISSUER=${USER_OIDC_ISSUER:-}" \
      "USER_OIDC_AUDIENCE=${USER_OIDC_AUDIENCE:-red.mabu.meinbefund}" \
      "USER_OIDC_ALLOWED_SUBJECTS=${USER_OIDC_ALLOWED_SUBJECTS:-}" \
    --output none 2>/dev/null || {
      log "app exists, updating instead"
      az containerapp update --name "$APP" --resource-group "$RG" --image "$IMAGE" --output none
    }

  local fqdn
  fqdn=$(az containerapp show --name "$APP" --resource-group "$RG" \
    --query properties.configuration.ingress.fqdn -o tsv)
  ok "deployed: https://${fqdn}"
  echo ""
  echo "Set MB_FEDERATION_BASE_URL=https://${fqdn} when building the iOS app."
  echo "Next: ./scripts/azure/11-claude-federation.sh claims"
}

claims() {
  require_login
  local fqdn
  fqdn=$(az containerapp show --name "$APP" --resource-group "$RG" \
    --query properties.configuration.ingress.fqdn -o tsv)

  # Read the claims from the app's own /setup/claims rather than by exec'ing
  # into it. `az containerapp exec` needs a TTY and fails headless with
  # "Operation not supported by device", which is a poor thing to discover
  # mid-setup. The endpoint answers only while federation is unconfigured and
  # disappears the moment `configure` runs, so it cannot be left open.
  log "Reading the issuer and audience off a real token ..."
  local body
  body=$(curl -sS --max-time 30 "https://${fqdn}/setup/claims")

  if ! grep -q issuerUrl <<<"$body"; then
    error "could not read claims: $body"
    error "If this says 'not found', federation is already configured."
    exit 1
  fi

  echo ""
  echo "$body" | python3 -m json.tool
  echo ""
  echo "Register the issuer above in the Claude Console, then match on the"
  echo "audience AND the managed identity, whose ids are:"
  az identity show --name "$IDENTITY" --resource-group "$RG" \
    --query "{appid_claim:clientId, sub_oid_claim:principalId}" -o json
}

configure() {
  require_login
  : "${ANTHROPIC_FEDERATION_RULE_ID:?set ANTHROPIC_FEDERATION_RULE_ID (fdrl_...)}"
  : "${ANTHROPIC_ORGANIZATION_ID:?set ANTHROPIC_ORGANIZATION_ID}"
  : "${ANTHROPIC_SERVICE_ACCOUNT_ID:?set ANTHROPIC_SERVICE_ACCOUNT_ID (svac_...)}"

  log "=== Applying the federation rule to the app ==="
  az containerapp update --name "$APP" --resource-group "$RG" \
    --set-env-vars \
      "ANTHROPIC_FEDERATION_RULE_ID=${ANTHROPIC_FEDERATION_RULE_ID}" \
      "ANTHROPIC_ORGANIZATION_ID=${ANTHROPIC_ORGANIZATION_ID}" \
      "ANTHROPIC_SERVICE_ACCOUNT_ID=${ANTHROPIC_SERVICE_ACCOUNT_ID}" \
      "ANTHROPIC_WORKSPACE_ID=${ANTHROPIC_WORKSPACE_ID:-}" \
    --output none

  # ANTHROPIC_API_KEY sits above federation in the SDK credential precedence, so
  # a leftover key would silently shadow the whole mechanism. Assert it is not
  # there rather than assuming nobody set it.
  if az containerapp show --name "$APP" --resource-group "$RG" \
      --query "properties.template.containers[0].env[?name=='ANTHROPIC_API_KEY']" -o tsv | grep -q .; then
    error "ANTHROPIC_API_KEY is set on this app and would shadow federation entirely."
    error "Remove it: az containerapp update -n $APP -g $RG --remove-env-vars ANTHROPIC_API_KEY"
    exit 1
  fi

  ok "federation configured"
  log "Verifying the app can mint a token ..."
  local fqdn
  fqdn=$(az containerapp show --name "$APP" --resource-group "$RG" \
    --query properties.configuration.ingress.fqdn -o tsv)
  curl -sS --max-time 20 "https://${fqdn}/health" | tee /dev/stderr | grep -q '"status":"ok"' \
    && ok "health check passed" \
    || { error "health check failed"; exit 1; }
}

case "${1:-}" in
  provision) provision ;;
  claims)    claims ;;
  configure) configure ;;
  *)
    echo "Usage: $0 {provision|claims|configure}"
    echo ""
    echo "  provision   build the image, create the managed identity and the Container App"
    echo "  claims      print the exact iss/aud to register in the Claude Console"
    echo "  configure   apply the rule ids the Console gave you, then health check"
    exit 1
    ;;
esac
