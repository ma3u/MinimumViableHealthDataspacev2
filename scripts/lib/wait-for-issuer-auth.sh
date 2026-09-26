#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Wait until the IssuerService ACCEPTS a Keycloak token, then say why if not.
# ---------------------------------------------------------------------------
# #345. In CI the first issuer seed after the realm fix got a token from
# Keycloak and then 401 on every write, while the identical token shape works
# on a long-running stack. The realm file was exonerated by importing it into
# a throwaway Keycloak: claims identical. What differs in CI is timing: the
# IssuerService resolves JWKS from a Keycloak that is importing a fresh realm
# with fresh signing keys at the same moment, and a key set cached before the
# realm existed rejects every token afterwards.
#
# A health endpoint cannot see that. This asserts the property the seeds need,
# "a token this client can obtain is accepted by the issuer admin API", and
# on timeout prints the one comparison that diagnoses it: the token's kid
# against the kids Keycloak currently publishes.
#
# Usage: KC_HOST=... ISSUER_API=... [CLIENT_ID=issuer CLIENT_SECRET=...] \
#          [TIMEOUT=120] bash scripts/lib/wait-for-issuer-auth.sh
# ---------------------------------------------------------------------------
set -euo pipefail
KC_HOST="${KC_HOST:-http://localhost:8080}"
REALM="${KEYCLOAK_REALM:-edcv}"
ISSUER_API="${ISSUER_API:-http://localhost:10013}"
ISSUER_CTX="${ISSUER_CTX:-issuer}"
CLIENT_ID="${CLIENT_ID:-issuer}"
CLIENT_SECRET="${CLIENT_SECRET:-issuer-secret}"
# Both scopes: the probe below is a read, the seeds that follow are writes,
# and one token proving both is the point. First local run of this gate asked
# for write only and the issuer answered 403 "Required scope
# 'issuer-admin-api:read' missing", which is also a useful reminder that a
# wrong scope is a 403 here; CI's failure was a 401, a different layer.
SCOPE="${SCOPE:-issuer-admin-api:read%20issuer-admin-api:write}"
TIMEOUT="${TIMEOUT:-120}"

token() {
  curl -sS --max-time 15 -X POST "${KC_HOST}/realms/${REALM}/protocol/openid-connect/token" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "grant_type=client_credentials&client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&scope=${SCOPE}" \
    2>/dev/null | python3 -c "import json,sys; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null || true
}
kid_of() { python3 -c "import base64,json,sys; h=sys.argv[1].split('.')[0]; h+='='*(-len(h)%4); print(json.loads(base64.urlsafe_b64decode(h)).get('kid',''))" "$1" 2>/dev/null || true; }

deadline=$(( $(date +%s) + TIMEOUT ))
attempt=0; status="000"; body=""; tok=""
while [ "$(date +%s)" -lt "$deadline" ]; do
  attempt=$((attempt + 1))
  tok=$(token)
  if [ -n "$tok" ]; then
    tmp=$(mktemp)
    status=$(curl -sS --max-time 15 -o "$tmp" -w '%{http_code}' -X POST \
      -H "Authorization: Bearer ${tok}" -H "Content-Type: application/json" -d '{}' \
      "${ISSUER_API}/api/admin/v1alpha/participants/${ISSUER_CTX}/holders/query" 2>/dev/null) || status="000"
    body=$(head -c 300 "$tmp" 2>/dev/null || true); rm -f "$tmp"
    if [ "$status" = "200" ]; then
      echo "issuer accepts ${CLIENT_ID} tokens (attempt ${attempt})"
      exit 0
    fi
  fi
  sleep 5
done

echo "FAIL: the issuer never accepted a ${CLIENT_ID} token within ${TIMEOUT}s (${attempt} attempts)" >&2
if [ -z "$tok" ]; then
  echo "  Keycloak issued no token at all from ${KC_HOST}/realms/${REALM} for client ${CLIENT_ID}" >&2
  exit 1
fi
echo "  last answer from ${ISSUER_API}: HTTP ${status} ${body}" >&2
echo "  token kid:      $(kid_of "$tok")" >&2
echo "  keycloak kids:  $(curl -sS --max-time 15 "${KC_HOST}/realms/${REALM}/protocol/openid-connect/certs" 2>/dev/null | python3 -c "import json,sys; print(', '.join(k.get('kid','') for k in json.load(sys.stdin).get('keys',[])))" 2>/dev/null || echo '<unreadable>')" >&2
echo "  If the kid is absent from the set, Keycloak rotated or re-imported after the issuer cached JWKS." >&2
echo "  If the kid is present, the issuer is rejecting for another reason and the body above is the answer." >&2
exit 1
