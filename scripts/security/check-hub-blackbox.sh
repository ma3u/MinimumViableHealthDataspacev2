#!/bin/bash
# Black-box checks of the demo hub from the outside, with no credential: what
# an anonymous caller gets. Every API route must refuse (401), the sign-in
# pages must redirect, the dotfiles a scanner tries must not exist, TLS 1.0
# and 1.1 must be refused, the security headers must be present, and the
# Keycloak admin console must not be reachable from the internet.
#
#   scripts/security/check-hub-blackbox.sh [https://ehds.mabu.red]
#
# Outside office hours the hub answers 503 on every API route (ADR-053), which
# proves nothing about the gates; the script then says so and exits 3 rather
# than passing silently. Exit 1 on any unexpected answer, 0 when all pass.
set -uo pipefail

H="${1:-https://ehds.mabu.red}"
HOST="${H#https://}"
AUTH="${AUTH_HOST:-auth.ehds.mabu.red}"
fail=0; n=0

code() { curl -s -o /dev/null -m 20 -w '%{http_code}' "$@"; }
expect() {  # expect <wanted codes, comma-separated> <label> <curl args...>
  local want="$1" label="$2"; shift 2
  local got; got="$(code "$@")"; n=$((n+1))
  if [[ ",$want," == *",$got,"* ]]; then printf 'ok    %-52s %s\n' "$label" "$got"
  else printf 'FAIL  %-52s %s (wanted %s)\n' "$label" "$got" "$want"; fail=1; fi
}

echo "== $(date -u +%FT%TZ) $H, anonymous"
health="$(code "$H/api/health")"
[ "$health" = 200 ] || { echo "health: $health, the hub is not up"; exit 3; }
probe="$(code "$H/api/patient")"
if [ "$probe" = 503 ] && curl -s -m 20 "$H/api/patient" | grep -q 'offline outside office hours'; then
  echo "SKIP: the hub is in off-hours mode (ADR-053); every API route answers 503, so the gates cannot be checked now. Run Mon-Fri 05:17 to 18:13 UTC."
  exit 3
fi

echo "-- every API route refuses an anonymous caller (ADR-044)"
for p in /api/patient /api/patient/profile /api/patient/observations?patientId=P1 /api/patient/research /api/patient/insights \
         /api/graph /api/catalog /api/compliance /api/credentials /api/trust-center /api/analytics /api/nlq/backend; do
  expect 401 "GET $p" "$H$p"
done
expect 401 "POST /api/patient/app/wearables (no token)" -X POST -H 'Content-Type: application/json' -d '{"resourceType":"Bundle"}' "$H/api/patient/app/wearables"
expect 401 "POST /api/patient/app/wearables (bad bearer)" -X POST -H 'Authorization: Bearer not-a-token' -H 'Content-Type: application/json' -d '{}' "$H/api/patient/app/wearables"
expect 401 "DELETE /api/patient/app/account (no token)" -X DELETE "$H/api/patient/app/account"
expect "400,401,403" "POST /api/app-accounts (no attestation)" -X POST -H 'Content-Type: application/json' -d '{}' "$H/api/app-accounts"
expect "200,405" "POST /api/app-accounts/challenge" -X POST "$H/api/app-accounts/challenge"

echo "-- protected pages send a visitor to sign in"
for p in /patient/profile /graph /catalog /analytics /admin; do
  expect "302,307,308" "GET $p" "$H$p"
done

echo "-- nothing a scanner looks for"
for p in /.env /.git/HEAD /.git/config /server-status /phpinfo.php /wp-login.php /actuator/env /api/debug; do
  expect "404,401,302,307,308" "GET $p" "$H$p"
done
expect "404,405,500,501" "TRACE /" -X TRACE "$H/"

echo "-- CORS: no origin is reflected"
acao="$(curl -s -D - -o /dev/null -m 20 -H 'Origin: https://evil.example' "$H/api/health" | grep -i '^access-control-allow-origin' || true)"
n=$((n+1)); if [ -z "$acao" ]; then echo "ok    no Access-Control-Allow-Origin for a foreign origin"; else echo "FAIL  $acao"; fail=1; fi

echo "-- security headers on the landing page"
hdr="$(curl -s -D - -o /dev/null -m 20 "$H/")"
for want in strict-transport-security x-content-type-options x-frame-options referrer-policy permissions-policy; do
  n=$((n+1)); if echo "$hdr" | grep -qi "^$want:"; then echo "ok    $want present"; else echo "FAIL  $want missing"; fail=1; fi
done
n=$((n+1)); if echo "$hdr" | grep -qiE '^(server|x-powered-by):'; then echo "FAIL  server or x-powered-by header reveals the stack"; fail=1; else echo "ok    no server or x-powered-by header"; fi

echo "-- TLS: 1.0 and 1.1 refused, 1.2 and 1.3 offered"
for v in tls1 tls1_1; do
  n=$((n+1)); if echo | timeout 15 openssl s_client -connect "$HOST:443" -servername "$HOST" "-$v" 2>/dev/null | grep -q 'Cipher    : [A-Z]'; then echo "FAIL  $v accepted"; fail=1; else echo "ok    $v refused"; fi
done
for v in tls1_2 tls1_3; do
  n=$((n+1)); if echo | timeout 15 openssl s_client -connect "$HOST:443" -servername "$HOST" "-$v" 2>/dev/null | grep -q 'Cipher    : [A-Z]'; then echo "ok    $v offered"; else echo "FAIL  $v not offered"; fail=1; fi
done
echo | openssl s_client -connect "$HOST:443" -servername "$HOST" 2>/dev/null | openssl x509 -noout -issuer -enddate | sed 's/^/      /'

echo "-- Keycloak: discovery public, admin console and metrics not"
expect 200 "GET /realms/edcv/.well-known/openid-configuration" "https://$AUTH/realms/edcv/.well-known/openid-configuration"
expect "404,403" "GET /admin/master/console/" "https://$AUTH/admin/master/console/"
expect "404,403" "GET /admin/edcv/console/" "https://$AUTH/admin/edcv/console/"
expect 401 "GET /admin/realms/edcv (REST, no token)" "https://$AUTH/admin/realms/edcv"
expect "404,403" "GET /metrics" "https://$AUTH/metrics"

echo "== $n checks, $([ "$fail" = 0 ] && echo all passed || echo 'some FAILED')"
exit "$fail"
