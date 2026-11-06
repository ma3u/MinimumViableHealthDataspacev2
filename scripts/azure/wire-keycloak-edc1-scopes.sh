#!/usr/bin/env bash
# =============================================================================
# The Keycloak side of EDC 1.0 on a running realm (#881).
# =============================================================================
#   wire-keycloak-edc1-scopes.sh          apply what jad/keycloak-realm.json asks
#   wire-keycloak-edc1-scopes.sh --check  report, change nothing
#
# EDC 1.0 authorizes its management, identity and issuer admin APIs by OAuth
# scope, not by the `role` claim 0.18 read, and identifies a tenant by the
# token's `sub`. The realm file carries both since the 1.0 branch: the scopes
# management-api:admin, identity-api:admin and issuer-admin-api:admin on the
# operator clients admin and provisioner, and a `sub` = issuer mapper on the
# issuer client. A realm file is imported only when the realm is created
# (runbook keycloak-realm-drift.md), so a running realm, Azure's included, gets
# them from here. Every step is a no-op when already done.
#
# Azure by default (Keycloak at auth.<CUSTOM_DOMAIN>, the admin password from
# Key Vault). For a local Keycloak set KEYCLOAK_URL and KC_ADMIN_PASSWORD.
#
# 0.18 ignores all three additions (it reads `role` and participant_context_id),
# so they can go in before the cutover and stay through a rollback.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
MODE="${1:-apply}"
case "$MODE" in apply | --check) ;; *) sed -n '5,6p' "$0"; exit 64 ;; esac

if [[ -n "${KEYCLOAK_URL:-}" && -n "${KC_ADMIN_PASSWORD:-}" ]]; then
  log() { echo "[keycloak-edc1] $*"; }
  err() { echo "[keycloak-edc1] ERROR: $*" >&2; }
  kc_admin_password() { printf '%s' "$KC_ADMIN_PASSWORD"; }
else
  # shellcheck source=env.sh
  source "${SCRIPT_DIR}/env.sh"
  KEYCLOAK_URL="https://auth.${CUSTOM_DOMAIN}"
fi
REALM="${REALM:-edcv}"
REALM_FILE="${REPO_ROOT}/jad/keycloak-realm.json"
ADMIN_API="${KEYCLOAK_URL}/admin/realms/${REALM}"

admin_token() {
  curl -sf -X POST "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" \
    -d client_id=admin-cli -d username="${KC_ADMIN_USER:-admin}" \
    --data-urlencode "password=$(kc_admin_password)" -d grant_type=password |
    jq -r '.access_token // empty'
}
TOKEN="$(admin_token || true)"
[[ -n "$TOKEN" ]] || { err "Keycloak admin login failed at ${KEYCLOAK_URL}"; exit 1; }
api() { curl -sf -H "Authorization: Bearer $TOKEN" "$@"; }

# The wanted state, read from the realm file so the two cannot drift.
SCOPES="$(jq -c '[.clientScopes[] | select(.name | endswith(":admin"))]' "$REALM_FILE")"
[[ "$(jq length <<<"$SCOPES")" -eq 3 ]] || { err "$REALM_FILE does not define the three :admin scopes"; exit 1; }
MAPPER="$(jq -c '.clients[] | select(.clientId == "issuer") | .protocolMappers[] | select(.name == "sub-is-participant-context")' "$REALM_FILE")"
[[ -n "$MAPPER" ]] || { err "$REALM_FILE has no sub mapper on the issuer client"; exit 1; }

client_uuid() { api "${ADMIN_API}/clients?clientId=$1" | jq -r '.[0].id // empty'; }
scope_uuid() { api "${ADMIN_API}/client-scopes" | jq -r --arg n "$1" '.[] | select(.name == $n) | .id'; }

report() {
  local c
  for c in admin provisioner; do
    echo "  $c: $(api "${ADMIN_API}/clients/$(client_uuid "$c")/default-client-scopes" | jq -r '[.[].name | select(endswith(":admin"))] | sort | join(" ") | if . == "" then "no :admin scopes" else . end')"
  done
  echo "  issuer: sub mapper $(api "${ADMIN_API}/clients/$(client_uuid issuer)/protocol-mappers/models" | jq -r 'if any(.[]; .name == "sub-is-participant-context") then "present" else "missing" end')"
}

if [[ "$MODE" == --check ]]; then
  echo "realm ${REALM} at ${KEYCLOAK_URL}:"
  report
  exit 0
fi

while read -r scope; do
  name="$(jq -r .name <<<"$scope")"
  if [[ -z "$(scope_uuid "$name")" ]]; then
    api -X POST -H "Content-Type: application/json" -d "$scope" "${ADMIN_API}/client-scopes" >/dev/null
    log "client scope ${name} created"
  fi
done < <(jq -c '.[]' <<<"$SCOPES")

for c in admin provisioner; do
  cid="$(client_uuid "$c")"
  [[ -n "$cid" ]] || { err "no client ${c} in realm ${REALM}"; exit 1; }
  while read -r name; do
    api -X PUT "${ADMIN_API}/clients/${cid}/default-client-scopes/$(scope_uuid "$name")" >/dev/null
  done < <(jq -r '.[].name' <<<"$SCOPES")
done
log "admin and provisioner hold the three :admin scopes"

iid="$(client_uuid issuer)"
[[ -n "$iid" ]] || { err "no client issuer in realm ${REALM}"; exit 1; }
if ! api "${ADMIN_API}/clients/${iid}/protocol-mappers/models" | jq -e 'any(.[]; .name == "sub-is-participant-context")' >/dev/null; then
  api -X POST -H "Content-Type: application/json" -d "$MAPPER" "${ADMIN_API}/clients/${iid}/protocol-mappers/models" >/dev/null
  log "issuer: sub mapper created"
fi

echo "realm ${REALM} at ${KEYCLOAK_URL}:"
report
