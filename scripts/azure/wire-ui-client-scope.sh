#!/usr/bin/env bash
# =============================================================================
# The UI's Keycloak client carries the seven EHDS roles and nothing else (#571).
# =============================================================================
#   wire-ui-client-scope.sh          full scope off, the roles of jad/keycloak-realm.json's scopeMappings
#   wire-ui-client-scope.sh --check  report, change nothing
#
# Keycloak 26.8 warns about "Full scope allowed" on health-dataspace-ui
# (#558): with it, a token for the UI carries every realm role its user
# holds, the CFM roles admin, provisioner and participant among them. The UI
# reads only the roles of its role model (ui/src/lib/auth.ts), so the client's
# scope is those seven. The realm file is imported only when the realm is
# created (runbook keycloak-realm-drift.md), hence this script for the live
# realm. Checked on compose: every demo persona's access token and userinfo
# keep exactly its own roles after the change.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
# shellcheck source=env.sh
source "${SCRIPT_DIR}/env.sh"

MODE="${1:-apply}"
case "$MODE" in apply | --check) ;; *) sed -n '5,6p' "$0"; exit 64 ;; esac

KEYCLOAK_URL="https://auth.${CUSTOM_DOMAIN}"
REALM_FILE="${REPO_ROOT}/jad/keycloak-realm.json"
CLIENT_ID="health-dataspace-ui"
ADMIN="${KEYCLOAK_URL}/admin/realms/edcv"

admin_token() {
  local pw
  pw="$(kc_admin_password)"
  curl -sf -X POST "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" \
    -d client_id=admin-cli -d username=admin --data-urlencode "password=${pw}" \
    -d grant_type=password | jq -r '.access_token // empty'
}

TOKEN="$(admin_token)"
[[ -n "$TOKEN" ]] || { err "Keycloak admin login failed"; exit 1; }
auth=(-H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json")

UUID="$(curl -sf "${auth[@]}" "${ADMIN}/clients?clientId=${CLIENT_ID}" | jq -r '.[0].id // empty')"
[[ -n "$UUID" ]] || { err "client $CLIENT_ID not found in realm edcv"; exit 1; }

WANTED="$(jq -c --arg c "$CLIENT_ID" '[.scopeMappings[] | select(.client == $c) | .roles[]] | sort' "$REALM_FILE")"
[[ "$(jq length <<<"$WANTED")" -gt 0 ]] || { err "$REALM_FILE has no scopeMappings for $CLIENT_ID"; exit 1; }

show() {
  echo "client $CLIENT_ID:"
  curl -sf "${auth[@]}" "${ADMIN}/clients/${UUID}" | jq '{fullScopeAllowed}'
  local mapped
  mapped="$(curl -sf "${auth[@]}" "${ADMIN}/clients/${UUID}/scope-mappings/realm" | jq -c '[.[].name] | sort')"
  echo "realm roles in scope: $mapped"
  echo "wanted:               $WANTED"
  [[ "$mapped" == "$WANTED" ]] && ok "the scope is the role model" || warn "the scope differs from the realm file"
}

if [[ "$MODE" == --check ]]; then
  show
  exit 0
fi

log "Turning full scope off on $CLIENT_ID"
# PUT wants the whole representation; a partial body resets what it leaves out.
CLIENT="$(curl -sf "${auth[@]}" "${ADMIN}/clients/${UUID}")"
code="$(curl -s -o /dev/null -w '%{http_code}' -X PUT "${auth[@]}" "${ADMIN}/clients/${UUID}" \
  -d "$(jq -c '.fullScopeAllowed = false' <<<"$CLIENT")")"
[[ "$code" == 204 ]] || { err "client update failed: HTTP $code"; exit 1; }

log "Mapping the realm roles $WANTED"
ROLES="$(curl -sf "${auth[@]}" "${ADMIN}/roles" |
  jq -c --argjson want "$WANTED" '[.[] | select(.name | IN($want[])) | {id, name}]')"
[[ "$(jq length <<<"$ROLES")" == "$(jq length <<<"$WANTED")" ]] ||
  { err "not every wanted role exists in the realm: $(jq -c '[.[].name]' <<<"$ROLES")"; exit 1; }
code="$(curl -s -o /dev/null -w '%{http_code}' -X POST "${auth[@]}" \
  "${ADMIN}/clients/${UUID}/scope-mappings/realm" -d "$ROLES")"
[[ "$code" == 204 ]] || { err "scope mapping failed: HTTP $code"; exit 1; }
# Roles mapped earlier that the realm file does not name are taken out again.
EXTRA="$(curl -sf "${auth[@]}" "${ADMIN}/clients/${UUID}/scope-mappings/realm" |
  jq -c --argjson want "$WANTED" '[.[] | select(.name | IN($want[]) | not) | {id, name}]')"
if [[ "$(jq length <<<"$EXTRA")" -gt 0 ]]; then
  log "Removing $(jq -c '[.[].name]' <<<"$EXTRA") from the scope"
  curl -sf -o /dev/null -X DELETE "${auth[@]}" "${ADMIN}/clients/${UUID}/scope-mappings/realm" -d "$EXTRA"
fi
show
echo "Prove it: sign in as each persona on https://${CUSTOM_DOMAIN}; the nav groups of the role model must show."
