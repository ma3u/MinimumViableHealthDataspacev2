#!/usr/bin/env bash
# Connect to EHDS (#473, ADR-049), end to end against the compose stack:
# the patient screen asks for a pairing, the patient approves in Keycloak, the
# "phone" polls for its token, registers, reads its record, and is disconnected.
#
#   NEXTAUTH_SECRET=<the UI's secret> ./scripts/check-klarbefund-connect.sh [UI base URL]
#
# It signs in as the seeded test patient from jad/keycloak-realm.json and talks
# to Keycloak on localhost:8080. The klarbefund-app client must exist
# (scripts/azure/wire-klarbefund-client.sh --local). Against the live hub:
#
#   KEYCLOAK_URL=https://auth.ehds.mabu.red NEXTAUTH_SECRET=<mvhd-ui secret> \
#     ./scripts/check-klarbefund-connect.sh https://ehds.mabu.red
#
# Run it more than once there: the UI has several replicas, and a pairing kept
# in one of them passed one run in three (2026-10-04).
set -euo pipefail
UI="${1:-http://localhost:3000}"
KC="${KEYCLOAK_URL:-http://localhost:8080}/realms/edcv"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REALM="$ROOT/jad/keycloak-realm.json"
: "${NEXTAUTH_SECRET:?set NEXTAUTH_SECRET to the secret of the UI under test}"

# NextAuth prefixes the cookie on https.
COOKIE_NAME=next-auth.session-token
[[ "$UI" == https://* ]] && COOKIE_NAME="__Secure-$COOKIE_NAME"
COOKIE="$COOKIE_NAME=$(cd "$ROOT/ui" && COOKIE_NAME=$COOKIE_NAME node scripts/forge-bruno-session.mjs patient1 | awk -F= '/^COOKIE_VALUE=/{print substr($0,14)}')"
PW="$(jq -r '.users[] | select(.username=="patient1") | .credentials[] | select(.type=="password") | .value' "$REALM")"
JAR="$(mktemp)"; trap 'rm -f "$JAR"' EXIT
fail() { echo "FAIL: $*" >&2; exit 1; }

echo "1. the patient screen asks for a QR code"
P="$(curl -s -X POST -H "Cookie: $COOKIE" "$UI/api/patient/app-pairing")"
jq -e .appLink >/dev/null <<<"$P" || fail "no pairing: $P"
PAIRING="$(jq -r .pairingId <<<"$P")"
DEVICE_CODE="$(python3 -c "import sys,urllib.parse as u; print(u.parse_qs(u.urlparse(sys.argv[1]).query)['device_code'][0])" "$(jq -r .appLink <<<"$P")")"
echo "   code $(jq -r .userCode <<<"$P"), approval at $(jq -r .verificationUri <<<"$P" | cut -d'?' -f1)"

echo "2. the patient approves in the browser"
action() {
  local a; a="$(grep -o '<form[^>]*action="[^"]*"' <<<"$1" | head -1 | sed -E 's/.*action="([^"]*)"/\1/; s/&amp;/\&/g')"
  [[ "$a" == /* ]] && a="${KC%/realms/edcv}$a"; echo "$a"
}
hidden() { grep -o '<input type="hidden"[^>]*>' <<<"$1" | sed -E 's/.*name="([^"]*)".*value="([^"]*)".*/-d \1=\2/' | tr '\n' ' '; }
page="$(curl -s -L -c "$JAR" -b "$JAR" "$(jq -r .verificationUri <<<"$P")")"
page="$(curl -s -L -c "$JAR" -b "$JAR" "$(action "$page")" --data-urlencode username=patient1 --data-urlencode "password=$PW" -d credentialId=)"
if grep -q 'name="accept"' <<<"$page"; then
  # shellcheck disable=SC2046
  page="$(curl -s -L -c "$JAR" -b "$JAR" "$(action "$page")" $(hidden "$page") -d accept=Yes)"
fi
grep -q "Device Login Successful" <<<"$page" || fail "Keycloak did not confirm the approval"

echo "3. the phone polls Keycloak"
TOKEN=""
for _ in 1 2 3 4 5 6; do
  T="$(curl -s -X POST "$KC/protocol/openid-connect/token" -d "grant_type=urn:ietf:params:oauth:grant-type:device_code" -d client_id=klarbefund-app -d "device_code=$DEVICE_CODE")"
  TOKEN="$(jq -r '.access_token // empty' <<<"$T")"; [[ -n "$TOKEN" ]] && break; sleep 5
done
[[ -n "$TOKEN" ]] || fail "no token: $T"
DEVICE="$(python3 -c 'import uuid; print(uuid.uuid4())')"

echo "4. the phone registers"
CODE="$(curl -s -o /dev/null -w '%{http_code}' -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  "$UI/api/patient/app-devices" -d "{\"pairingId\":\"$PAIRING\",\"deviceId\":\"$DEVICE\",\"deviceName\":\"check-klarbefund-connect\"}")"
[[ "$CODE" == 201 ]] || fail "register answered $CODE"
STATUS="$(curl -s -H "Cookie: $COOKIE" "$UI/api/patient/app-pairing/$PAIRING" | jq -r .status)"
[[ "$STATUS" == connected ]] || fail "the patient screen says $STATUS"

echo "5. the phone reads its record"
TOTAL="$(curl -s -H "Authorization: Bearer $TOKEN" -H "X-Klarbefund-Device: $DEVICE" "$UI/api/patient/app/record" | jq -r '.total // empty')"
[[ -n "$TOTAL" ]] || fail "no record"
echo "   $TOTAL observations"

echo "6. the patient disconnects it, and the phone is refused"
curl -s -o /dev/null -X DELETE -H "Cookie: $COOKIE" "$UI/api/patient/app-devices/$DEVICE"
CODE="$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TOKEN" -H "X-Klarbefund-Device: $DEVICE" "$UI/api/patient/app/record")"
[[ "$CODE" == 401 ]] || fail "a disconnected phone got $CODE"
echo "OK: pairing, approval, token, registration, record and disconnect all work"
