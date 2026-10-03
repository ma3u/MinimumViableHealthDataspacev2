#!/usr/bin/env bash
# Creates or updates the `klarbefund-app` Keycloak client in a running realm.
#
# The realm file (jad/keycloak-realm.json) is only imported when the realm is
# created, so a client added to the file later never reaches a Keycloak that
# already has the realm. This copies that one client from the file into the
# live realm, and changes nothing else (#473, ADR-049).
#
#   ./scripts/azure/wire-klarbefund-client.sh            # Azure: auth.<custom domain>
#   ./scripts/azure/wire-klarbefund-client.sh --local    # the compose stack, localhost:8080
#   ./scripts/azure/wire-klarbefund-client.sh --check    # report, change nothing
#
# Idempotent: run it again and it updates the client in place.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

LOCAL=false
CHECK_ONLY=false
for arg in "$@"; do
  case "$arg" in
    --local) LOCAL=true ;;
    --check) CHECK_ONLY=true ;;
    *) echo "unknown argument: $arg" >&2; exit 64 ;;
  esac
done

REALM_FILE="$(cd ../.. && pwd)/jad/keycloak-realm.json"
CLIENT_JSON="$(jq -c '.clients[] | select(.clientId == "klarbefund-app")' "$REALM_FILE")"
[[ -n "$CLIENT_JSON" ]] || { echo "klarbefund-app is not in $REALM_FILE" >&2; exit 1; }

if [[ "$LOCAL" == "true" ]]; then
  KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8080}"
  KC_ADMIN_USER="${KC_ADMIN_USER:-admin}"
  # The compose stack's bootstrap admin, from docker-compose.jad.yml. Local only.
  KC_PASSWORD="${KC_ADMIN_PASSWORD:-admin}"
else
  # shellcheck source=env.sh
  source ./env.sh
  eval "$(get_aca_fqdns)"
  KEYCLOAK_URL="https://auth.${CUSTOM_DOMAIN}"
  echo "==> Reading the admin password from Key Vault"
  KC_PASSWORD="$(kc_admin_password)"
  [[ -n "$KC_PASSWORD" ]] || { echo "could not read keycloak-admin-password" >&2; exit 1; }
fi

echo "==> Keycloak at $KEYCLOAK_URL"
KC_TOKEN="$(curl -sf -X POST "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" \
  -d "client_id=admin-cli" -d "username=${KC_ADMIN_USER}" \
  --data-urlencode "password=${KC_PASSWORD}" -d "grant_type=password" | jq -r '.access_token // empty')"
[[ -n "$KC_TOKEN" ]] || { echo "admin login failed" >&2; exit 1; }

EXISTING="$(curl -sf -H "Authorization: Bearer $KC_TOKEN" \
  "${KEYCLOAK_URL}/admin/realms/edcv/clients?clientId=klarbefund-app" | jq -r '.[0].id // empty')"

if [[ "$CHECK_ONLY" == "true" ]]; then
  if [[ -n "$EXISTING" ]]; then
    echo "klarbefund-app exists (id $EXISTING)"
  else
    echo "klarbefund-app is missing"
    exit 1
  fi
  exit 0
fi

if [[ -z "$EXISTING" ]]; then
  echo "==> Creating klarbefund-app"
  CODE="$(curl -s -o /dev/null -w '%{http_code}' -X POST \
    -H "Authorization: Bearer $KC_TOKEN" -H "Content-Type: application/json" \
    "${KEYCLOAK_URL}/admin/realms/edcv/clients" -d "$CLIENT_JSON")"
  [[ "$CODE" == "201" ]] || { echo "create failed: HTTP $CODE" >&2; exit 1; }
else
  echo "==> Updating klarbefund-app (id $EXISTING)"
  CODE="$(curl -s -o /dev/null -w '%{http_code}' -X PUT \
    -H "Authorization: Bearer $KC_TOKEN" -H "Content-Type: application/json" \
    "${KEYCLOAK_URL}/admin/realms/edcv/clients/${EXISTING}" \
    -d "$(jq -c --arg id "$EXISTING" '. + {id: $id}' <<<"$CLIENT_JSON")")"
  [[ "$CODE" == "204" ]] || { echo "update failed: HTTP $CODE" >&2; exit 1; }
fi

# Prove it: the device endpoint must answer for this client. A 200 with a
# device_code is what the patient screen will ask for.
echo "==> Asking the device endpoint"
DEVICE="$(curl -s -X POST "${KEYCLOAK_URL}/realms/edcv/protocol/openid-connect/auth/device" \
  -d "client_id=klarbefund-app" -d "scope=openid profile")"
if jq -e '.device_code and .user_code' >/dev/null <<<"$DEVICE"; then
  echo "    ok: device authorization answers, code lives $(jq -r '.expires_in' <<<"$DEVICE") s"
else
  echo "    the device endpoint did not answer as expected:" >&2
  jq -c 'del(.device_code)' <<<"$DEVICE" >&2 || echo "$DEVICE" >&2
  exit 1
fi
