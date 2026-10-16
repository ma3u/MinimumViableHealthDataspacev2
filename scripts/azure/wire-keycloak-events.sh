#!/usr/bin/env bash
# =============================================================================
# Login events on the live Keycloak realm (#571).
# =============================================================================
#   wire-keycloak-events.sh          set the realm's event settings from jad/keycloak-realm.json
#   wire-keycloak-events.sh --check  report, change nothing
#
# The realm file is imported only when the realm is created (runbook
# keycloak-realm-drift.md), so a running realm gets its event settings from
# here: login events on, kept seven days, admin events off. Before, a failed
# sign-in showed only as a WARN line of the jboss-logging listener in Log
# Analytics and nowhere in the admin console (2026-10-06, a Klarbefund
# account that could not sign in on the web). The types are the sign-in ones;
# CLIENT_LOGIN, one row per service-account token, is left out so the
# Flexible Server does not write a row for every agent poll.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
# shellcheck source=env.sh
source "${SCRIPT_DIR}/env.sh"

MODE="${1:-apply}"
case "$MODE" in apply | --check) ;; *) sed -n '5,6p' "$0"; exit 64 ;; esac

KEYCLOAK_URL="https://auth.${CUSTOM_DOMAIN}"
REALM_FILE="${REPO_ROOT}/jad/keycloak-realm.json"

admin_token() {
  local pw
  pw="$(kc_admin_password)"
  curl -sf -X POST "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" \
    -d client_id=admin-cli -d username=admin --data-urlencode "password=${pw}" \
    -d grant_type=password | jq -r '.access_token // empty'
}

# `|| true`: with pipefail a refused login would end the script here, before
# the message below; the guard did exactly that for a day (2026-10-16).
TOKEN="$(admin_token || true)"
[[ -n "$TOKEN" ]] || { err "Keycloak admin login failed"; exit 1; }

show() {
  echo "realm edcv, events:"
  curl -sf -H "Authorization: Bearer $TOKEN" "${KEYCLOAK_URL}/admin/realms/edcv/events/config" |
    jq '{eventsEnabled, eventsExpiration, types: (.enabledEventTypes | length), eventsListeners, adminEventsEnabled}'
  echo "newest failed sign-ins:"
  curl -sf -H "Authorization: Bearer $TOKEN" "${KEYCLOAK_URL}/admin/realms/edcv/events?type=LOGIN_ERROR&max=5" |
    jq -c '[.[] | {at: (.time / 1000 | todate), username: .details.username, error, clientId}]'
}

if [[ "$MODE" == --check ]]; then
  show
  exit 0
fi

BODY="$(jq -c '{eventsEnabled, eventsExpiration, enabledEventTypes, eventsListeners, adminEventsEnabled, adminEventsDetailsEnabled}' "$REALM_FILE")"
[[ "$(jq -r .eventsEnabled <<<"$BODY")" == true ]] || { err "$REALM_FILE does not enable events"; exit 1; }
log "Setting the realm's event settings from $(basename "$REALM_FILE")"
code="$(curl -s -o /dev/null -w '%{http_code}' -X PUT -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" "${KEYCLOAK_URL}/admin/realms/edcv" -d "$BODY")"
[[ "$code" == 204 ]] || { err "realm update failed: HTTP $code"; exit 1; }
ok "login events on, kept $(jq -r '.eventsExpiration / 86400' <<<"$BODY") days, admin events off"
show
