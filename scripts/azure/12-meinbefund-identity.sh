#!/usr/bin/env bash
# =============================================================================
# Phase 12: the user-facing half of MeinBefund's OIDC (ADR-034, issue #186)
# =============================================================================
# ADR-034 describes two independent OIDC relationships. Phase 11 set up the
# second: the Container App proving to Anthropic which workload it is. This sets
# up the first: the iPhone proving to that Container App which person it is.
#
# Keycloak is already deployed on Azure but holds only the `master` realm; the
# `edcv` realm exists in jad/keycloak-realm.json and was never imported there,
# so `/realms/edcv/.well-known/openid-configuration` returns "Realm does not
# exist". That is the gap.
#
# Idempotent: re-running updates rather than duplicating.
#
#   ./scripts/azure/12-meinbefund-identity.sh setup    # realm + public client
#   ./scripts/azure/12-meinbefund-identity.sh user     # create/reset a person
#   ./scripts/azure/12-meinbefund-identity.sh apply    # point the service at it
#   ./scripts/azure/12-meinbefund-identity.sh subject  # print a user's sub
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/azure/env.sh
source "$SCRIPT_DIR/env.sh"

REALM="${MB_REALM:-edcv}"
CLIENT_ID="${MB_CLIENT_ID:-meinbefund-ios}"
REDIRECT_SCHEME="${MB_REDIRECT_SCHEME:-meinbefund}"
FED_APP="mvhd-claude-federation"

log()   { echo -e "\033[0;34m[MB-ID]\033[0m $*"; }
ok()    { echo -e "\033[0;32m[MB-ID]\033[0m $*"; }
error() { echo -e "\033[0;31m[MB-ID]\033[0m $*" >&2; }

kc_base() {
  local fqdn
  fqdn=$(az containerapp show -n "$KEYCLOAK_APP" -g "$RG" \
    --query properties.configuration.ingress.fqdn -o tsv)
  [ -n "$fqdn" ] || { error "Keycloak has no public ingress"; exit 1; }
  echo "https://${fqdn}"
}

# Admin API token from the master realm.
# The issuer as the realm itself declares it, not as we reached it.
#
# Keycloak stamps `iss` from KC_HOSTNAME, which here is the ADR-025 custom
# domain auth.ehds.mabu.red, while the Container App answers on its own FQDN.
# Constructing the issuer from the URL we happened to fetch produced tokens the
# service rejected with `unexpected "iss" claim value`, because the two strings
# differ even though both hosts serve the same realm.
#
# The discovery document is authoritative about its own issuer. Reading it is
# correct for custom domains, reverse proxies and path prefixes alike, and it is
# the value both the app and the verifier must be given.
kc_issuer() {
  local base="$1"
  curl -sS --max-time 30 "${base}/realms/${REALM}/.well-known/openid-configuration" \
    | python3 -c "import json,sys; print(json.load(sys.stdin)['issuer'])"
}

kc_token() {
  local base="$1" token
  token=$(curl -sS --max-time 30 -X POST \
    "${base}/realms/master/protocol/openid-connect/token" \
    -d "grant_type=password" -d "client_id=admin-cli" \
    -d "username=${KC_ADMIN_USER}" -d "password=$(kc_admin_password)" \
    | python3 -c "import json,sys; print(json.load(sys.stdin).get('access_token',''))")
  [ -n "$token" ] || { error "could not obtain a Keycloak admin token"; exit 1; }
  echo "$token"
}

setup() {
  local base token
  base=$(kc_base); token=$(kc_token "$base")
  log "Keycloak: $base"

  # --- realm -----------------------------------------------------------------
  if curl -sS -o /dev/null -w '%{http_code}' --max-time 30 \
      -H "Authorization: Bearer $token" "${base}/admin/realms/${REALM}" | grep -q 200; then
    log "realm '${REALM}' exists"
  else
    log "creating realm '${REALM}'"
    curl -sS --max-time 30 -X POST "${base}/admin/realms" \
      -H "Authorization: Bearer $token" -H "Content-Type: application/json" \
      -d "{\"realm\":\"${REALM}\",\"enabled\":true,\"displayName\":\"EHDS Dataspace\"}" \
      -o /dev/null
    ok "realm created"
  fi

  # --- public client ---------------------------------------------------------
  # publicClient + PKCE S256 is the whole security model for a mobile app: it
  # cannot keep a secret, so an intercepted authorization code has to be useless
  # without the verifier. `standardFlowEnabled` only; no implicit, no direct
  # grants, because neither is needed and both widen the attack surface.
  local payload
  payload=$(python3 - "$CLIENT_ID" "$REDIRECT_SCHEME" <<'PYEOF'
import json, sys
client, scheme = sys.argv[1], sys.argv[2]
print(json.dumps({
    "clientId": client,
    "name": "MeinBefund iOS",
    "enabled": True,
    "publicClient": True,
    "standardFlowEnabled": True,
    "implicitFlowEnabled": False,
    "directAccessGrantsEnabled": False,
    "serviceAccountsEnabled": False,
    "redirectUris": [f"{scheme}://oidc-callback"],
    "webOrigins": [],
    "attributes": {
        "pkce.code.challenge.method": "S256",
        # The app keeps no refresh token: a long-lived credential on a device we
        # have already decided cannot hold one. Short access tokens instead.
        "access.token.lifespan": "600",
    },
}))
PYEOF
)

  local existing
  existing=$(curl -sS --max-time 30 -H "Authorization: Bearer $token" \
    "${base}/admin/realms/${REALM}/clients?clientId=${CLIENT_ID}" \
    | python3 -c "import json,sys; c=json.load(sys.stdin); print(c[0]['id'] if c else '')")

  if [ -n "$existing" ]; then
    log "updating client '${CLIENT_ID}'"
    curl -sS --max-time 30 -X PUT "${base}/admin/realms/${REALM}/clients/${existing}" \
      -H "Authorization: Bearer $token" -H "Content-Type: application/json" \
      -d "$payload" -o /dev/null
  else
    log "creating client '${CLIENT_ID}'"
    curl -sS --max-time 30 -X POST "${base}/admin/realms/${REALM}/clients" \
      -H "Authorization: Bearer $token" -H "Content-Type: application/json" \
      -d "$payload" -o /dev/null
  fi
  ok "client '${CLIENT_ID}' configured, redirect ${REDIRECT_SCHEME}://oidc-callback"

  # Assert rather than assume: a realm that exists but serves no discovery
  # document is the exact failure this script is here to fix, and reporting
  # success without checking would reproduce it one layer up (ADR-031).
  log "verifying the discovery document ..."
  local code
  code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 30 \
    "${base}/realms/${REALM}/.well-known/openid-configuration")
  [ "$code" = "200" ] || { error "discovery returned HTTP ${code}"; exit 1; }

  local issuer
  issuer=$(kc_issuer "$base")
  ok "issuer: ${issuer}"
  if [ "$issuer" != "${base}/realms/${REALM}" ]; then
    log "note: the realm declares a different issuer than the URL used to reach"
    log "it. The declared one is what appears in tokens and is what must be"
    log "configured on both sides."
  fi
  echo ""
  echo "Build the app with:"
  echo "  MB_OIDC_ISSUER=${issuer}"
  echo "  MB_OIDC_CLIENT_ID=${CLIENT_ID}"
  echo "  MB_OIDC_REDIRECT_SCHEME=${REDIRECT_SCHEME}"
}

user() {
  local username="${1:-${MB_USERNAME:-}}"
  local password="${2:-${MB_PASSWORD:-}}"
  [ -n "$username" ] && [ -n "$password" ] || {
    error "usage: $0 user <username> <password>"; exit 1; }

  local base token
  base=$(kc_base); token=$(kc_token "$base")

  local existing
  existing=$(curl -sS --max-time 30 -H "Authorization: Bearer $token" \
    "${base}/admin/realms/${REALM}/users?username=${username}&exact=true" \
    | python3 -c "import json,sys; u=json.load(sys.stdin); print(u[0]['id'] if u else '')")

  if [ -z "$existing" ]; then
    log "creating user '${username}'"
    # requiredActions must be empty and the profile fields present, or Keycloak
    # refuses every token with "Account is not fully set up" and the user hits a
    # wall in the browser with no way to clear it from the phone. Creating an
    # account that cannot authenticate is worse than not creating one.
    curl -sS --max-time 30 -X POST "${base}/admin/realms/${REALM}/users" \
      -H "Authorization: Bearer $token" -H "Content-Type: application/json" \
      -d "{\"username\":\"${username}\",\"enabled\":true,\"emailVerified\":true,\"requiredActions\":[],\"firstName\":\"${username}\",\"lastName\":\"MeinBefund\",\"email\":\"${username}@meinbefund.local\"}" -o /dev/null
    existing=$(curl -sS --max-time 30 -H "Authorization: Bearer $token" \
      "${base}/admin/realms/${REALM}/users?username=${username}&exact=true" \
      | python3 -c "import json,sys; u=json.load(sys.stdin); print(u[0]['id'] if u else '')")
  fi

  # Clear required actions on an existing user too: an account created before
  # this fix, or one an admin flagged, is otherwise permanently unable to sign in.
  curl -sS --max-time 30 -X PUT "${base}/admin/realms/${REALM}/users/${existing}" \
    -H "Authorization: Bearer $token" -H "Content-Type: application/json" \
    -d "{\"enabled\":true,\"emailVerified\":true,\"requiredActions\":[],\"firstName\":\"${username}\",\"lastName\":\"MeinBefund\",\"email\":\"${username}@meinbefund.local\"}" -o /dev/null

  curl -sS --max-time 30 -X PUT \
    "${base}/admin/realms/${REALM}/users/${existing}/reset-password" \
    -H "Authorization: Bearer $token" -H "Content-Type: application/json" \
    -d "{\"type\":\"password\",\"value\":\"${password}\",\"temporary\":false}" -o /dev/null

  ok "user '${username}' ready"
  echo "subject (sub): ${existing}"
  echo ""
  echo "This is the value for USER_OIDC_ALLOWED_SUBJECTS. Without it, any user"
  echo "this realm authenticates can call the endpoint and bill your org."
}

subject() {
  local username="${1:-${MB_USERNAME:-}}"
  [ -n "$username" ] || { error "usage: $0 subject <username>"; exit 1; }
  local base token
  base=$(kc_base); token=$(kc_token "$base")
  curl -sS --max-time 30 -H "Authorization: Bearer $token" \
    "${base}/admin/realms/${REALM}/users?username=${username}&exact=true" \
    | python3 -c "import json,sys; u=json.load(sys.stdin); print(u[0]['id'] if u else 'NOT FOUND')"
}

apply() {
  local base
  base=$(kc_base)
  : "${USER_OIDC_ALLOWED_SUBJECTS:?set USER_OIDC_ALLOWED_SUBJECTS (see: $0 subject <username>)}"

  local issuer
  issuer=$(kc_issuer "$base")
  log "pointing ${FED_APP} at ${issuer}"
  az containerapp update -n "$FED_APP" -g "$RG" \
    --set-env-vars \
      "USER_OIDC_ISSUER=${issuer}" \
      "USER_OIDC_AUDIENCE=${CLIENT_ID}" \
      "USER_OIDC_ALLOWED_SUBJECTS=${USER_OIDC_ALLOWED_SUBJECTS}" \
    --output none

  local fqdn
  fqdn=$(az containerapp show -n "$FED_APP" -g "$RG" \
    --query properties.configuration.ingress.fqdn -o tsv)
  log "waiting for the revision to report userAuthConfigured ..."
  for _ in $(seq 1 30); do
    if curl -sS --max-time 10 "https://${fqdn}/health" 2>/dev/null \
        | grep -q '"userAuthConfigured":true'; then
      ok "user authentication configured"
      curl -sS --max-time 10 "https://${fqdn}/health" | python3 -m json.tool
      return 0
    fi
    sleep 6
  done
  error "the app never reported userAuthConfigured"
  curl -sS --max-time 10 "https://${fqdn}/health" | python3 -m json.tool || true
  exit 1
}

case "${1:-}" in
  setup)   setup ;;
  user)    shift; user "$@" ;;
  subject) shift; subject "$@" ;;
  apply)   apply ;;
  *)
    echo "Usage: $0 {setup|user <name> <pass>|subject <name>|apply}"
    exit 1
    ;;
esac
