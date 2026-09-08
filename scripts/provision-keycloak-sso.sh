#!/bin/bash
# =============================================================================
# provision-keycloak-sso.sh — reconcile the 'edcv' realm with the realm file
# =============================================================================
# Creates/repairs the SSO realm roles, demo users, passwords and role mappings
# on an EXISTING 'edcv' realm, via the Keycloak Admin REST API.
#
# Everything is derived from jad/keycloak-realm.json. Nothing is hardcoded here.
#
# Why this exists: a realm import returns HTTP 409 on an existing realm and
# imports NOTHING, so users, roles and role mappings added to the realm file
# after the first import never reach a running instance. This script closes
# that gap. See docs/knowledge/runbooks/keycloak-realm-drift.md.
#
# This script previously hardcoded 3 roles and 3 users, with a single role per
# user. That is exactly how the drift it is meant to fix went unnoticed: on
# 2026-09-08 the local realm was missing the DATA_HOLDER, DATA_USER and PATIENT
# roles and the lmcuser, patient1 and patient2 users entirely, while clinicuser
# and researcher were each missing their second role.
#
# Idempotent: safe to run repeatedly. Passwords are always reset to the value in
# the realm file, so a drifted password self-heals.
#
# Usage:
#   ./scripts/provision-keycloak-sso.sh
#   KC_HOST=https://auth.example.com KC_ADMIN_PASSWORD=… ./scripts/provision-keycloak-sso.sh
#
# Exits non-zero if any account cannot obtain a token at the end, so drift is
# loud rather than silent.
# =============================================================================
set -euo pipefail

KC_HOST="${KC_HOST:-http://localhost:8080}"
REALM="${REALM:-edcv}"
KC_ADMIN_USER="${KC_ADMIN_USER:-admin}"
KC_ADMIN_PASSWORD="${KC_ADMIN_PASSWORD:-admin}"
UI_CLIENT_ID="${UI_CLIENT_ID:-health-dataspace-ui}"
UI_CLIENT_SECRET="${UI_CLIENT_SECRET:-health-dataspace-ui-secret}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REALM_FILE="${REALM_FILE:-${REPO_ROOT}/jad/keycloak-realm.json}"

[ -f "$REALM_FILE" ] || {
  echo "ERROR: realm file not found: $REALM_FILE" >&2
  exit 1
}

echo "=== Keycloak SSO reconciliation ==="
echo "Keycloak:   $KC_HOST"
echo "Realm:      $REALM"
echo "Realm file: ${REALM_FILE#"$REPO_ROOT"/}"

# --- Admin token ---
echo ""
echo "1) Getting admin token..."
KC_TOKEN=$(curl -sf -X POST "$KC_HOST/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "grant_type=password" \
  --data-urlencode "username=$KC_ADMIN_USER" \
  --data-urlencode "password=$KC_ADMIN_PASSWORD" \
  --data-urlencode "client_id=admin-cli" |
  python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

[ -n "$KC_TOKEN" ] || {
  echo "  ✗ Failed to get admin token" >&2
  exit 1
}
echo "  ✓ Got admin token"

AUTH="Authorization: Bearer $KC_TOKEN"
CT="Content-Type: application/json"

# --- Realm roles, from the realm file ---
echo ""
echo "2) Reconciling realm roles..."
while IFS=$'\t' read -r ROLE_NAME ROLE_JSON; do
  [ -n "$ROLE_NAME" ] || continue
  CODE=$(curl -so /dev/null -w "%{http_code}" -X POST "$KC_HOST/admin/realms/$REALM/roles" \
    -H "$AUTH" -H "$CT" -d "$ROLE_JSON")
  case "$CODE" in
    201) echo "  ✓ Created role: $ROLE_NAME" ;;
    409) echo "  · Role exists:   $ROLE_NAME" ;;
    *) echo "  ✗ Role $ROLE_NAME failed (HTTP $CODE)" ;;
  esac
done < <(python3 -c "
import json, sys
d = json.load(open(sys.argv[1]))
seen = set()
for r in d.get('roles', {}).get('realm', []):
    if r['name'] in seen:
        continue
    seen.add(r['name'])
    print(r['name'] + '\t' + json.dumps(dict(name=r['name'], description=r.get('description') or '')))
# Any role referenced by a user but not declared at realm level.
for u in d.get('users', []):
    for name in u.get('realmRoles', []):
        if name not in seen:
            seen.add(name)
            print(name + '\t' + json.dumps(dict(name=name)))
" "$REALM_FILE")

# --- Users, passwords and role mappings, from the realm file ---
echo ""
echo "3) Reconciling demo users..."
FAILED=0
USERNAMES=()

while IFS=$'\t' read -r USERNAME PASSWORD ROLES_CSV USER_JSON PW_JSON; do
  [ -n "$USERNAME" ] || continue
  USERNAMES+=("$USERNAME")

  CODE=$(curl -so /dev/null -w "%{http_code}" -X POST "$KC_HOST/admin/realms/$REALM/users" \
    -H "$AUTH" -H "$CT" -d "$USER_JSON")
  case "$CODE" in
    201) echo "  ✓ Created user:  $USERNAME" ;;
    409) echo "  · User exists:   $USERNAME" ;;
    *)
      echo "  ✗ User $USERNAME failed (HTTP $CODE)"
      FAILED=1
      continue
      ;;
  esac

  USER_ID=$(curl -sf "$KC_HOST/admin/realms/$REALM/users?username=$USERNAME&exact=true" \
    -H "$AUTH" | python3 -c "import sys,json; u=json.load(sys.stdin); print(u[0]['id'] if u else '')")
  [ -n "$USER_ID" ] || {
    echo "  ✗ No user id for $USERNAME"
    FAILED=1
    continue
  }

  # Always reset the password: a user that exists with a drifted or missing
  # credential is the failure mode this script is here to repair.
  if [ -n "$PASSWORD" ]; then
    CODE=$(curl -so /dev/null -w "%{http_code}" -X PUT \
      "$KC_HOST/admin/realms/$REALM/users/$USER_ID/reset-password" \
      -H "$AUTH" -H "$CT" -d "$PW_JSON")
    [ "$CODE" = "204" ] || {
      echo "  ✗ Password reset failed for $USERNAME (HTTP $CODE)"
      FAILED=1
    }
  fi

  # Assign every realm role the file gives the user, not just the first.
  IFS=',' read -r -a ROLES <<<"$ROLES_CSV"
  for ROLE in "${ROLES[@]}"; do
    [ -n "$ROLE" ] || continue
    ROLE_JSON=$(curl -sf "$KC_HOST/admin/realms/$REALM/roles/$ROLE" -H "$AUTH" || echo "")
    [ -n "$ROLE_JSON" ] || {
      echo "  ✗ Role $ROLE not found for $USERNAME"
      FAILED=1
      continue
    }
    MAPPING=$(printf '%s' "$ROLE_JSON" | python3 -c "
import json, sys
r = json.load(sys.stdin)
print(json.dumps([dict(id=r['id'], name=r['name'])]))
")
    CODE=$(curl -so /dev/null -w "%{http_code}" -X POST \
      "$KC_HOST/admin/realms/$REALM/users/$USER_ID/role-mappings/realm" \
      -H "$AUTH" -H "$CT" -d "$MAPPING")
    [ "$CODE" = "204" ] || {
      echo "  ✗ Role $ROLE failed for $USERNAME (HTTP $CODE)"
      FAILED=1
    }
  done
  echo "    roles: ${ROLES_CSV//,/, }"
done < <(python3 -c "
import json, sys
d = json.load(open(sys.argv[1]))
for u in d.get('users', []):
    pw = ''
    for c in u.get('credentials', []):
        if c.get('type') == 'password':
            pw = c.get('value', '')
    payload = {
        'username': u['username'],
        'enabled': u.get('enabled', True),
        'emailVerified': True,
    }
    for k in ('email', 'firstName', 'lastName'):
        if u.get(k):
            payload[k] = u[k]
    if pw:
        payload['credentials'] = [{'type': 'password', 'value': pw, 'temporary': False}]
    print('\t'.join([
        u['username'], pw, ','.join(u.get('realmRoles', [])), json.dumps(payload),
        json.dumps(dict(type='password', value=pw, temporary=False)),
    ]))
" "$REALM_FILE")

# --- Verify: every account must actually be able to log in ---
echo ""
echo "4) Verifying each account can obtain a token..."
for USERNAME in "${USERNAMES[@]}"; do
  PASSWORD=$(python3 -c "
import json, sys
d = json.load(open(sys.argv[1]))
for u in d.get('users', []):
    if u['username'] == sys.argv[2]:
        for c in u.get('credentials', []):
            if c.get('type') == 'password':
                print(c.get('value', ''))
" "$REALM_FILE" "$USERNAME")
  TOKEN_ROLES=$(curl -sf -X POST "$KC_HOST/realms/$REALM/protocol/openid-connect/token" \
    --data-urlencode "client_id=$UI_CLIENT_ID" \
    --data-urlencode "client_secret=$UI_CLIENT_SECRET" \
    --data-urlencode "grant_type=password" \
    --data-urlencode "username=$USERNAME" \
    --data-urlencode "password=$PASSWORD" 2>/dev/null |
    python3 -c "
import sys, json, base64
try:
    t = json.load(sys.stdin)['access_token']
except Exception:
    sys.exit(1)
p = t.split('.')[1]
p += '=' * (-len(p) % 4)
c = json.loads(base64.urlsafe_b64decode(p))
print(','.join(sorted(r for r in c.get('realm_access', {}).get('roles', []) if r.isupper())))
" 2>/dev/null) || {
    echo "  ✗ $USERNAME cannot log in"
    FAILED=1
    continue
  }
  echo "  ✓ $USERNAME → ${TOKEN_ROLES:-(no roles)}"
done

echo ""
if [ "$FAILED" -ne 0 ]; then
  echo "=== Reconciliation FAILED — see ✗ above ==="
  exit 1
fi
echo "=== Reconciliation complete — realm matches ${REALM_FILE##*/} ==="
echo ""
echo "Demo accounts (password = username):"
printf '  %s\n' "${USERNAMES[@]}"
echo ""
echo "Keycloak Admin:  $KC_HOST/admin/master/console/"
echo "OIDC Discovery:  $KC_HOST/realms/$REALM/.well-known/openid-configuration"
