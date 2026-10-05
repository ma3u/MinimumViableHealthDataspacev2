#!/usr/bin/env bash
# =============================================================================
# The EHDS Integration Hub login theme on the live Keycloak.
# =============================================================================
#   wire-keycloak-theme.sh          build Keycloak with the theme, deploy it, set the realm
#   wire-keycloak-theme.sh --realm  set only the realm (theme and display name)
#   wire-keycloak-theme.sh --check  report, change nothing
#
# The realm file (jad/keycloak-realm.json) is imported only when the realm is
# created, so a running realm gets loginTheme and displayName from here.
# Deploying the image restarts Keycloak: sign-in is away for about a minute.
# The realm is set only after the new revision answers, because a realm that
# names a theme its Keycloak does not have falls back to the default.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
# shellcheck source=env.sh
source "${SCRIPT_DIR}/env.sh"

MODE="${1:-deploy}"
case "$MODE" in deploy | --realm | --check) ;; *) sed -n '5,7p' "$0"; exit 64 ;; esac

KEYCLOAK_URL="https://auth.${CUSTOM_DOMAIN}"
THEME="ehds-hub"
DISPLAY_NAME="EHDS Integration Hub"

admin_token() {
  local pw
  pw="$(kc_admin_password)"
  curl -sf -X POST "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" \
    -d client_id=admin-cli -d username=admin --data-urlencode "password=${pw}" \
    -d grant_type=password | jq -r '.access_token // empty'
}

check() {
  echo "image: $(az containerapp show --name "$KEYCLOAK_APP" --resource-group "$RG" \
    --query 'properties.template.containers[0].image' -o tsv)"
  local token
  token="$(admin_token)"
  curl -sf -H "Authorization: Bearer $token" "${KEYCLOAK_URL}/admin/realms/edcv" |
    jq '{displayName, loginTheme}'
  # The sign-in page itself (the account console only redirects in a browser;
  # the client wants PKCE, so a fixed challenge is enough to see the page).
  echo "login page title: $(curl -s -m 20 "${KEYCLOAK_URL}/realms/edcv/protocol/openid-connect/auth?client_id=account-console&response_type=code&scope=openid&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&code_challenge_method=S256&redirect_uri=${KEYCLOAK_URL}/realms/edcv/account/" |
    grep -o '<title>[^<]*</title>' | head -1)"
}

set_realm() {
  local token
  token="$(admin_token)"
  [[ -n "$token" ]] || { echo "Keycloak admin login failed" >&2; exit 1; }
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' -X PUT -H "Authorization: Bearer $token" \
    -H "Content-Type: application/json" "${KEYCLOAK_URL}/admin/realms/edcv" \
    -d "$(jq -nc --arg t "$THEME" --arg n "$DISPLAY_NAME" \
      '{loginTheme: $t, displayName: $n, displayNameHtml: $n}')")"
  [[ "$code" == "204" ]] || { echo "realm update failed: HTTP $code" >&2; exit 1; }
  ok "realm edcv: loginTheme $THEME, displayName \"$DISPLAY_NAME\""
}

case "$MODE" in
  --check) check; exit 0 ;;
  --realm) set_realm; check; exit 0 ;;
esac

TAG="$(git -C "$REPO_ROOT" rev-parse --short HEAD)"
IMAGE="${ACR_LOGIN_SERVER}/keycloak-ehds:${KEYCLOAK_VERSION}-${TAG}"
log "Building $IMAGE"
az acr build --registry "$ACR_NAME" --image "keycloak-ehds:${KEYCLOAK_VERSION}-${TAG}" \
  --build-arg "KEYCLOAK_VERSION=${KEYCLOAK_VERSION}" \
  --file "${REPO_ROOT}/jad/keycloak-theme/Dockerfile" "${REPO_ROOT}/jad/keycloak-theme" \
  --no-logs -o none
ok "image built"

log "Deploying it to $KEYCLOAK_APP (Keycloak restarts)"
az containerapp update --name "$KEYCLOAK_APP" --resource-group "$RG" --image "$IMAGE" -o none

log "Waiting for Keycloak"
for _ in $(seq 1 60); do
  [[ "$(curl -s -o /dev/null -w '%{http_code}' -m 10 \
    "${KEYCLOAK_URL}/realms/edcv/.well-known/openid-configuration")" == "200" ]] && break
  sleep 10
done
# Discovery answers from cache (CLAUDE.md gotcha 7); the authorize endpoint
# proves the realm and its database.
"${SCRIPT_DIR}/check-keycloak-health.sh" || { echo "Keycloak is not healthy after the update" >&2; exit 1; }
# Only now: retiring the old revision before the new one was ready left no
# revision serving, and sign-in was away for two minutes (2026-10-05).
"${SCRIPT_DIR}/retire-stale-revisions.sh" "$KEYCLOAK_APP" || warn "a stale $KEYCLOAK_APP revision is still active"

set_realm
check
