#!/usr/bin/env bash
# =============================================================================
# Strong passwords for the accounts that are not demo logins, kept in Key Vault.
# =============================================================================
#   secure-accounts.sh --check                 list the realm's users, their roles,
#                                              and whether Key Vault holds a password
#   secure-accounts.sh <user> [<user> ...]     set a generated password on each user
#                                              and store it as keycloak-user-<user>-password
#   secure-accounts.sh --all-non-demo          the same for every user that is not a demo
#                                              login of jad/keycloak-realm.json, plus edcadmin
#
# The demo logins (jad/keycloak-realm.json, DemoPasswordBanner) keep their
# published passwords: they are the demo. Everything else, and edcadmin, whose
# EDC_ADMIN role reads a patient's record without a contract negotiation, gets
# 32 random characters that live only in Key Vault (secret name
# keycloak-user-<user>-password, tags url and username), where the two
# operator accounts already are. Nothing is printed but the secret's name.
#
# Needs: az signed in with Key Vault Secrets Officer on the vault (or a role
# that can set secrets), and the Keycloak admin password (env.sh reads it).
# The master realm must answer through the console guard: run
# guard-keycloak-console.sh --check first; its last line must be 401.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
# shellcheck source=env.sh
source "${SCRIPT_DIR}/env.sh"

KEYCLOAK_URL="https://auth.${CUSTOM_DOMAIN}"
SIGNIN_URL="https://${CUSTOM_DOMAIN}/auth/signin"
ADMIN="${KEYCLOAK_URL}/admin/realms/edcv"
REALM_FILE="${REPO_ROOT}/jad/keycloak-realm.json"

usage() { sed -n '5,10p' "$0"; exit 64; }
[[ $# -ge 1 ]] || usage

admin_token() {
  local pw
  pw="$(kc_admin_password)"
  curl -sf -X POST "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" \
    -d client_id=admin-cli -d username=admin --data-urlencode "password=${pw}" \
    -d grant_type=password | jq -r '.access_token // empty'
}
TOKEN="$(admin_token || true)"
[[ -n "$TOKEN" ]] || { err "Keycloak admin login failed (is the master realm reachable? guard-keycloak-console.sh --check)"; exit 1; }
auth=(-H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json")

# username<TAB>id<TAB>roles, every enabled user that is not a service account
users() {
  curl -sf "${auth[@]}" "${ADMIN}/users?max=500&briefRepresentation=true" |
    jq -r '.[] | select(.username | startswith("service-account-") | not) | [.username, .id, (.enabled|tostring)] | @tsv' |
    while IFS=$'\t' read -r name id enabled; do
      roles="$(curl -sf "${auth[@]}" "${ADMIN}/users/${id}/role-mappings/realm" | jq -r '[.[].name] | map(select(. != "default-roles-edcv" and . != "offline_access" and . != "uma_authorization")) | join(",")')"
      printf '%s\t%s\t%s\t%s\n' "$name" "$id" "$enabled" "$roles"
    done
}

DEMO="$(jq -r '.users[] | select(.serviceAccountClientId == null) | .username' "$REALM_FILE" | grep -v '^edcadmin$' | sort)"
is_demo() { grep -qx "$1" <<<"$DEMO"; }
kv_has() { az keyvault secret show --vault-name "$KEY_VAULT_NAME" --name "keycloak-user-$1-password" --query name -o tsv >/dev/null 2>&1; }

if [[ "$1" == "--check" ]]; then
  printf '%-28s %-8s %-10s %-10s %s\n' USER ENABLED KIND KEYVAULT ROLES
  users | while IFS=$'\t' read -r name _ enabled roles; do
    kind=operator; is_demo "$name" && kind=demo
    kv=no; kv_has "$name" && kv=yes
    printf '%-28s %-8s %-10s %-10s %s\n' "$name" "$enabled" "$kind" "$kv" "$roles"
  done
  echo "demo logins keep their published passwords; operator accounts and edcadmin get one in $KEY_VAULT_NAME"
  exit 0
fi

if [[ "$1" == "--all-non-demo" ]]; then
  mapfile -t TARGETS < <(users | cut -f1 | while read -r n; do is_demo "$n" || echo "$n"; done)
else
  TARGETS=("$@")
fi
[[ ${#TARGETS[@]} -gt 0 ]] || { warn "no account to secure"; exit 0; }

for name in "${TARGETS[@]}"; do
  id="$(curl -sf "${auth[@]}" "${ADMIN}/users?username=${name}&exact=true" | jq -r '.[0].id // empty')"
  [[ -n "$id" ]] || { err "no user $name in realm edcv"; exit 1; }
  pw="$(openssl rand -base64 36 | tr -d '/+=' | cut -c1-32)"
  log "Storing keycloak-user-${name}-password in $KEY_VAULT_NAME"
  az keyvault secret set --vault-name "$KEY_VAULT_NAME" --name "keycloak-user-${name}-password" \
    --value "$pw" --tags "url=${SIGNIN_URL}" "username=${name}" "realm=edcv" "set=$(date -u +%Y-%m-%d)" \
    --query name -o tsv >/dev/null
  # Key Vault first: a password that is set but not stored is a locked account.
  code="$(curl -s -o /dev/null -w '%{http_code}' -X PUT "${auth[@]}" "${ADMIN}/users/${id}/reset-password" \
    -d "$(jq -cn --arg v "$pw" '{type:"password", value:$v, temporary:false}')")"
  [[ "$code" == 204 ]] || { err "password reset for $name failed: HTTP $code (the Key Vault secret holds the new value)"; exit 1; }
  # Every other device signs in again.
  curl -s -o /dev/null -X POST "${auth[@]}" "${ADMIN}/users/${id}/logout"
  ok "$name: new password set and stored; sessions ended"
done
echo "Read one back: az keyvault secret show --vault-name $KEY_VAULT_NAME --name keycloak-user-<user>-password --query value -o tsv"
