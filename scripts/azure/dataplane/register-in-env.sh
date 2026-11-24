#!/usr/bin/env bash
# Runs inside the Azure environment, as the one-shot job of
# scripts/azure/23-dataplane.sh register (the management API is internal).
# Registers the push data plane mvhd-dp-<context> for every participant
# context, as scripts/seed-dataplane.sh step 4 does on compose, through the
# same scripts/lib/push-dataplane.sh, unpacked beside this file.
#
# Needs: KC_TOKEN_URL, MGMT (the management API with its version),
# ADMIN_SECRET (the Keycloak client `admin`), and the PUSH_DATAPLANE_* values
# push-dataplane.sh reads (URL, token endpoint, client secret).
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../../lib/push-dataplane.sh
source "${SCRIPT_DIR}/push-dataplane.sh"

fail() {
  echo "FAIL $*"
  exit 1
}

token="$(curl -sS --max-time 30 -X POST "$KC_TOKEN_URL" \
  --data-urlencode grant_type=client_credentials --data-urlencode client_id=admin \
  --data-urlencode "client_secret=${ADMIN_SECRET}" | jq -r '.access_token // empty')" || token=""
[ -n "$token" ] || fail "no token for the client admin from ${KC_TOKEN_URL}"

# The secret the control plane will sign in to the data plane with must be the
# one Keycloak holds, or every signal is refused later with a 401 nobody sees
# here. A token for it proves that before anything is registered.
probe="$(curl -sS --max-time 30 -o /dev/null -w '%{http_code}' -X POST "$PUSH_DATAPLANE_TOKEN_ENDPOINT" \
  --data-urlencode grant_type=client_credentials \
  --data-urlencode "client_id=${PUSH_DATAPLANE_CLIENT_ID}" \
  --data-urlencode "client_secret=${PUSH_DATAPLANE_CLIENT_SECRET}")" || probe="000"
[ "$probe" = "200" ] || fail "Keycloak answered ${probe} for ${PUSH_DATAPLANE_CLIENT_ID}: run 23-dataplane.sh keycloak"

keys="$(curl -sS --max-time 30 "${PUSH_DATAPLANE_URL}/.well-known/jwks.json" | jq -r '.keys | length' 2>/dev/null)" || keys=""
[ "$keys" = "1" ] || fail "${PUSH_DATAPLANE_URL} serves no JWKS with one key (got '${keys}'): is the app healthy?"

contexts="$(curl -sS --max-time 30 -H "Authorization: Bearer ${token}" "${MGMT}/participants" |
  jq -r '.[] | select(.identity // "" | startswith("did:")) | ."@id"')" ||
  fail "could not list the participant contexts at ${MGMT}"

registered=0
failed=0
while read -r ctx; do
  [ -n "$ctx" ] || continue
  if register_push_dataplane "$MGMT" "$token" "$ctx"; then
    echo "registered $(push_dataplane_id "$ctx")"
    registered=$((registered + 1))
  else
    failed=$((failed + 1))
  fi
done <<<"$contexts"
echo "registered for ${registered} participant contexts, ${failed} failed"
[ "$failed" -eq 0 ] || fail "a registration failed"
[ "$registered" -gt 0 ] || fail "the control plane lists no participant context; seed the identity layer first"

# Read-back the way compose does it: a signal without the control plane's
# token must be refused.
first="$(head -1 <<<"$contexts")"
code="$(curl -s --max-time 30 -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
  -d '{}' "${PUSH_DATAPLANE_URL}/api/v1/${first}/dataflows/prepare")" || code="000"
[ "$code" = "401" ] || fail "a signal without a token answered ${code}, expected 401"
echo "OK: ${registered} registrations; a signal without the control plane's token is refused (401)"
