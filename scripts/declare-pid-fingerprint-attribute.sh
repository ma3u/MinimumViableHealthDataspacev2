#!/usr/bin/env bash
set -euo pipefail
# =============================================================================
# Declare the user attribute pid_fingerprint in the realm's user profile.
# =============================================================================
# ADR-067: the secure hash that links a PID to an account is a Keycloak user
# attribute. Keycloak 26's declarative user profile drops an attribute it
# does not know, so the realm must declare it: admin-only to view and edit
# (the person never sees it, the account service writes it), single-valued,
# and shaped like the hash, k<n>:<64 hex>.
#
# Reads the current profile, adds the attribute when it is missing, writes it
# back; anything else in the profile is left as it is. Idempotent. Never
# prints the admin password or a token.
#
#   KC_HOST=http://localhost:8080 KC_ADMIN_PASSWORD=… scripts/declare-pid-fingerprint-attribute.sh
#   scripts/declare-pid-fingerprint-attribute.sh --azure   # admin password as env.sh reads it
# =============================================================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REALM="${KC_REALM:-edcv}"

if [ "${1:-}" = "--azure" ]; then
  # shellcheck source=scripts/azure/env.sh
  source "$SCRIPT_DIR/azure/env.sh"
  KC_HOST="${KC_HOST:-https://auth.${CUSTOM_DOMAIN}}"
  KC_ADMIN_PASSWORD="$(kc_admin_password)"
fi
: "${KC_HOST:?set KC_HOST or pass --azure}"
: "${KC_ADMIN_PASSWORD:?set KC_ADMIN_PASSWORD or pass --azure}"

TOKEN="$(curl -sf -X POST "${KC_HOST}/realms/master/protocol/openid-connect/token" \
  --data-urlencode "grant_type=password" --data-urlencode "client_id=admin-cli" \
  --data-urlencode "username=${KC_ADMIN_USER:-admin}" \
  --data-urlencode "password=${KC_ADMIN_PASSWORD}" |
  python3 -c "import sys, json; print(json.load(sys.stdin)['access_token'])")"
unset KC_ADMIN_PASSWORD

PROFILE_URL="${KC_HOST}/admin/realms/${REALM}/users/profile"
current="$(curl -sf -H "Authorization: Bearer ${TOKEN}" "$PROFILE_URL")"
updated="$(printf '%s' "$current" | python3 -c '
import json, sys
p = json.load(sys.stdin)
if any(a.get("name") == "pid_fingerprint" for a in p.get("attributes", [])):
    sys.exit(3)
p.setdefault("attributes", []).append({
    "name": "pid_fingerprint",
    "displayName": "PID link (secure hash, ADR-067)",
    "multivalued": False,
    "permissions": {"view": ["admin"], "edit": ["admin"]},
    "validations": {"pattern": {"pattern": "^k[0-9]+:[0-9a-f]{64}$",
                                "error-message": "not a PID secure hash"}},
})
print(json.dumps(p))
')" || status=$?
if [ "${status:-0}" = 3 ]; then
  echo " ✓  ${REALM}: pid_fingerprint already declared"
  exit 0
fi
[ "${status:-0}" = 0 ] || { echo " ✗  could not read the user profile of ${REALM}" >&2; exit 1; }

curl -sf -X PUT -H "Authorization: Bearer ${TOKEN}" -H "Content-Type: application/json" \
  --data "$updated" "$PROFILE_URL" -o /dev/null
curl -sf -H "Authorization: Bearer ${TOKEN}" "$PROFILE_URL" |
  python3 -c 'import json,sys; a=[x for x in json.load(sys.stdin)["attributes"] if x["name"]=="pid_fingerprint"]; print(" ✓  declared:", json.dumps(a[0]["permissions"])) if a else sys.exit(" ✗  not declared after the update")'
