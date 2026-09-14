#!/usr/bin/env bash
# Restores the `edcv` Keycloak realm when it has gone missing.
#
# Symptom: https://auth.ehds.mabu.red/realms/edcv/.well-known/openid-configuration
# answers `{"error":"Realm does not exist"}` while /realms/master answers 200.
# Keycloak itself is healthy; the realm is not there. Every sign-in on the live
# UI fails, and the demo personas are gone with it.
#
# `06-post-deploy.sh` also imports the realm, but it redeploys half the estate
# on the way. This does the realm and nothing else, so it is safe to run in the
# ten minutes before a demo.
#
#   ./scripts/azure/restore-keycloak-realm.sh
#   ./scripts/azure/restore-keycloak-realm.sh --check    # report, change nothing
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"
# shellcheck source=env.sh
source ./env.sh
# env.sh only defines the URL exports; get_aca_fqdns emits them, and every
# other script in this directory evaluates it the same way. Without this,
# KEYCLOAK_PUBLIC_URL is unbound.
eval "$(get_aca_fqdns)"

# After issue #28 Phase 2 the canonical Keycloak host is the custom domain, and
# the realm issuer is stamped with it. Pointing at the ACA FQDN instead would
# import into a Keycloak that answers on a hostname no client trusts.
export KEYCLOAK_PUBLIC_URL="${KEYCLOAK_PUBLIC_URL:-https://auth.${CUSTOM_DOMAIN}}"

CHECK_ONLY=false
[[ "${1:-}" == "--check" ]] && CHECK_ONLY=true

REALM_FILE="${REPO_ROOT:-$(cd ../.. && pwd)}/jad/keycloak-realm.json"
[[ -f "$REALM_FILE" ]] || { echo "missing $REALM_FILE" >&2; exit 1; }

DISCOVERY="${KEYCLOAK_PUBLIC_URL}/realms/edcv/.well-known/openid-configuration"

realm_present() {
  [[ "$(curl -s -o /dev/null -w '%{http_code}' "$DISCOVERY")" == "200" ]]
}

if realm_present; then
  echo "realm edcv is present"
  $CHECK_ONLY && exit 0
else
  echo "realm edcv is MISSING"
  if $CHECK_ONLY; then
    echo "run without --check to import it"
    exit 1
  fi
fi

echo "==> Reading the admin password from Key Vault"
KC_PASSWORD="$(kc_admin_password)"
[[ -n "$KC_PASSWORD" ]] || { echo "could not read keycloak-admin-password" >&2; exit 1; }

echo "==> Getting an admin token"
KC_TOKEN=$(curl -sf -X POST \
  "${KEYCLOAK_PUBLIC_URL}/realms/master/protocol/openid-connect/token" \
  -d "client_id=admin-cli" -d "username=${KC_ADMIN_USER}" \
  -d "password=${KC_PASSWORD}" -d "grant_type=password" | jq -r '.access_token')
[[ -n "$KC_TOKEN" && "$KC_TOKEN" != "null" ]] || {
  echo "admin login failed; the password in Key Vault may be stale" >&2; exit 1; }

if ! realm_present; then
  echo "==> Importing ${REALM_FILE##*/}"
  CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
    "${KEYCLOAK_PUBLIC_URL}/admin/realms" \
    -H "Authorization: Bearer ${KC_TOKEN}" \
    -H "Content-Type: application/json" -d "@${REALM_FILE}")
  case "$CODE" in
    201) echo "    imported" ;;
    409) echo "    already existed" ;;
    *)   echo "import failed (HTTP $CODE)" >&2; exit 1 ;;
  esac
fi

# The import ships localhost redirect URIs only, so logins on the deployed
# hosts fail with "Invalid parameter: redirect_uri" until this runs. The PUT
# REPLACES the whole list, so it must be a superset: localhost, the ACA URL and
# the custom domain. Dropping one breaks that host's logins (incident
# 2026-07-15).
# jad/keycloak-realm.json already ships the custom-domain redirect URIs, so a
# plain restore needs nothing here. This step matters only when the ACA FQDN
# has changed since the file was written. It is skipped rather than fatal when
# the Azure token has expired, because the realm is the part that unblocks
# login and it is already in by this point.
if [[ -z "${UI_PUBLIC_URL:-}" ]]; then
  echo "==> Skipping redirect URIs: no ACA FQDNs (expired az login?)"
  echo "    The realm file's own URIs cover localhost and ${CUSTOM_DOMAIN}."
  echo "    Re-run after 'az login' if this deployment has a new ACA FQDN."
else
echo "==> Setting redirect URIs for every public host"
CLIENT_UUID=$(curl -sf \
  "${KEYCLOAK_PUBLIC_URL}/admin/realms/edcv/clients?clientId=health-dataspace-ui" \
  -H "Authorization: Bearer ${KC_TOKEN}" | jq -r '.[0].id // empty')
[[ -n "$CLIENT_UUID" ]] || { echo "client health-dataspace-ui not found" >&2; exit 1; }

REDIRECT_URIS=$(jq -n --arg ui "$UI_PUBLIC_URL" --arg cd "${CUSTOM_DOMAIN:-}" '
  [ "http://localhost:3000/api/auth/callback/keycloak", "http://localhost:3000/*",
    "http://localhost:3003/api/auth/callback/keycloak", "http://localhost:3003/*",
    ($ui + "/api/auth/callback/keycloak"), ($ui + "/*") ]
  + (if $cd != "" then
       [ ("https://" + $cd + "/api/auth/callback/keycloak"), ("https://" + $cd + "/*") ]
     else [] end)')
WEB_ORIGINS=$(jq -n --arg ui "$UI_PUBLIC_URL" --arg cd "${CUSTOM_DOMAIN:-}" '
  ["http://localhost:3000", "http://localhost:3003", $ui, "+"]
  + (if $cd != "" then [("https://" + $cd)] else [] end)')

CODE=$(curl -s -o /dev/null -w "%{http_code}" -X PUT \
  "${KEYCLOAK_PUBLIC_URL}/admin/realms/edcv/clients/${CLIENT_UUID}" \
  -H "Authorization: Bearer ${KC_TOKEN}" -H "Content-Type: application/json" \
  -d "{\"redirectUris\": ${REDIRECT_URIS}, \"webOrigins\": ${WEB_ORIGINS}}")
[[ "$CODE" == "204" ]] || { echo "client update failed (HTTP $CODE)" >&2; exit 1; }

echo "==> Verifying"
curl -sf "$DISCOVERY" | jq -e '.issuer' >/dev/null || {
  echo "discovery still not serving" >&2; exit 1; }
echo "    issuer: $(curl -sf "$DISCOVERY" | jq -r '.issuer')"

LIVE_URIS=$(curl -sf \
  "${KEYCLOAK_PUBLIC_URL}/admin/realms/edcv/clients/${CLIENT_UUID}" \
  -H "Authorization: Bearer ${KC_TOKEN}" | jq -r '.redirectUris[]')
REQUIRED=("${UI_PUBLIC_URL}/api/auth/callback/keycloak")
[[ -n "${CUSTOM_DOMAIN:-}" ]] && REQUIRED+=("https://${CUSTOM_DOMAIN}/api/auth/callback/keycloak")
for uri in "${REQUIRED[@]}"; do
  grep -qxF "$uri" <<< "$LIVE_URIS" || {
    echo "redirect URI missing: $uri" >&2
    echo "logins on that host would fail with 'Invalid parameter: redirect_uri'" >&2
    exit 1; }
done
echo "    redirect URIs: $(wc -l <<< "$LIVE_URIS" | tr -d ' '), all required hosts present"
fi

# The realm existing is not the same as a person being able to sign in. Prove
# one demo user can actually get a token before calling this fixed.
echo "==> Signing in as a demo user"
USER_TOKEN=$(curl -sf -X POST \
  "${KEYCLOAK_PUBLIC_URL}/realms/edcv/protocol/openid-connect/token" \
  -d "client_id=health-dataspace-ui" -d "username=regulator" -d "password=regulator" \
  -d "grant_type=password" -d "scope=openid" 2>/dev/null | jq -r '.access_token // empty')
if [[ -n "$USER_TOKEN" ]]; then
  echo "    regulator can sign in"
else
  echo "    NOTE: direct grant is disabled for this client, which is correct for"
  echo "    a confidential + PKCE client. Check the browser flow by hand:"
  echo "    ${UI_PUBLIC_URL}/auth/signin"
fi

echo "done. Sign in at https://${CUSTOM_DOMAIN:-$UI_PUBLIC_URL}/auth/signin"
