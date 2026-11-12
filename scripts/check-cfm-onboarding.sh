#!/usr/bin/env bash
set -euo pipefail
#
# Onboards one participant through CFM 0.0.8 and disposes it again (ADR-085
# step 1, #973). Checks what the agents created on the EDC 1.0 stack, the
# same things ui/src/lib/edc/provision.ts creates, and that dispose removes
# them. Exit 0 when both directions pass.
#
# Needs the `cfm` profile up and scripts/seed-cfm.sh run. The EDC checks run
# from a throwaway curl container on the stack network, so remapped host
# ports do not matter. For a stack in another Docker context, export
# DOCKER_CONTEXT (e.g. orbstack).

KC_URL="${KC_URL:-http://localhost:8080}"
CFM_CLIENT_SECRET="${CFM_AGENTS_CLIENT_SECRET:-cfm-agents-local-dev}"
TM_URL="${CFM_TM_URL:-http://localhost:18181}"
NETWORK="${EDC_NETWORK:-health-dataspace-edcv}"
CURL_IMAGE="${CURL_IMAGE:-curlimages/curl:8.17.0}"
TIMEOUT="${CFM_CHECK_TIMEOUT:-180}"
SLUG="cfm-check-$(openssl rand -hex 3)"
DID="did:web:identityhub%3A7083:${SLUG}"

pass=0
fail=0
check() { # name, expected, actual
  if [[ "$2" == "$3" ]]; then
    printf '  ok    %-52s %s\n' "$1" "$3"
    pass=$((pass + 1))
  else
    printf '  FAIL  %-52s got %s, want %s\n' "$1" "$3" "$2"
    fail=$((fail + 1))
  fi
}

token() {
  curl -sf -X POST "$KC_URL/realms/edcv/protocol/openid-connect/token" \
    -u "cfm-agents:$CFM_CLIENT_SECRET" -d grant_type=client_credentials |
    python3 -I -c 'import json,sys; print(json.load(sys.stdin)["access_token"])'
}
TOKEN="$(token)"
tm() { curl -s -w '\n%{http_code}' -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' "$@"; }
status_of() { tail -1 <<<"$1"; }
body_of() { sed '$d' <<<"$1"; }
json() { python3 -I -c "import json,sys; d=json.load(sys.stdin); print($1)"; }

# HTTP status of a GET inside the stack network, with the same token.
edc_status() {
  docker run --rm --network "$NETWORK" "$CURL_IMAGE" -s -o /dev/null -w '%{http_code}' \
    -H "Authorization: Bearer $TOKEN" "$1"
}
edc_body() {
  docker run --rm --network "$NETWORK" "$CURL_IMAGE" -s -H "Authorization: Bearer $TOKEN" "$1"
}

DS_ID="$(body_of "$(tm "$TM_URL/api/v1alpha1/dataspace-profiles")" | json 'd[0]["id"]')"

echo "Onboarding $DID through the Tenant Manager"
r="$(tm -X POST "$TM_URL/api/v1alpha1/tenants" -d "{\"properties\":{\"name\":\"$SLUG\"}}")"
[[ "$(status_of "$r")" -lt 300 ]] || {
  echo "tenant: HTTP $(status_of "$r") $(body_of "$r")"
  exit 1
}
TENANT="$(body_of "$r" | json 'd["id"]')"
r="$(tm -X POST "$TM_URL/api/v1alpha1/tenants/$TENANT/participant-profiles" -d "{
  \"identifier\": \"$DID\",
  \"dataspaceProfileIds\": [\"$DS_ID\"],
  \"participantRoles\": {\"$DS_ID\": [\"participant\"]},
  \"vpaProperties\": {
    \"cfm.connector\": {\"dataspaceProfiles\": [\"http-dsp-profile-2025-1\"]},
    \"cfm.issuer\": {\"id\": \"$DID\"},
    \"cfm.dataplane\": {\"transferTypeMappings\": {\"HttpData-PULL\": {\"transferType\": \"HttpData-PULL\",
      \"endpointType\": \"HTTP\", \"tokenSource\": \"provider\", \"endpoint\": \"http://neo4j-proxy:9090/dataspace/data\"}}}
  },
  \"properties\": {}
}")"
[[ "$(status_of "$r")" -lt 300 ]] || {
  echo "participant profile: HTTP $(status_of "$r") $(body_of "$r")"
  exit 1
}
PROFILE="$(body_of "$r" | json 'd["id"]')"
PROFILE_URL="$TM_URL/api/v1alpha1/tenants/$TENANT/participant-profiles/$PROFILE"

states() { body_of "$(tm "$PROFILE_URL")" | json '" ".join(sorted(set(v["state"] for v in d.get("vpas",[])))) + ("  error: " + d.get("errorDetail","") if d.get("error") else "")'; }
start=$(date +%s)
while :; do
  s="$(states)"
  [[ "$s" == "active" || "$s" == *error* ]] && break
  (($(date +%s) - start > TIMEOUT)) && break
  sleep 3
done
echo "  deploy took $(($(date +%s) - start))s, VPA states: $s"
check "participant profile deployed" "active" "$s"

# The participant context id: the jwtlet agent derives it; the control plane
# lists the context under the participant's DID.
TOKEN="$(token)"
CTX="$(edc_body "http://controlplane:8081/api/mgmt/v5/participants" | python3 -I -c "
import json, sys
for p in json.load(sys.stdin):
    if p.get('identity') == sys.argv[1]:
        print(p.get('@id') or p.get('participantContextId') or p.get('id')); break
" "$DID" || true)"
echo "  participant context: ${CTX:-none}"
check "control plane context for the DID" "yes" "$([[ -n "$CTX" ]] && echo yes || echo no)"
if [[ -n "$CTX" ]]; then
  check "control plane context config" "200" "$(edc_status "http://controlplane:8081/api/mgmt/v5/participants/$CTX/config")"
  check "IdentityHub participant" "200" "$(edc_status "http://identityhub:7081/api/identity/v1/participants/$CTX")"
  check "DID document served" "200" "$(edc_status "http://identityhub:7083/$SLUG/did.json")"
  check "issuer holder" "200" "$(edc_status "http://issuerservice:10013/api/admin/v1/participants/issuer/holders/$CTX")"
  creds=""
  for _ in $(seq 1 20); do
    creds="$(edc_body "http://identityhub:7081/api/identity/v1/participants/$CTX/credentials" |
      python3 -I -c 'import json,sys
try: d=json.load(sys.stdin)
except Exception: d=[]
print(" ".join(sorted(t for c in d if isinstance(c, dict) for t in c.get("verifiableCredential",{}).get("credential",{}).get("type",[]) if t!="VerifiableCredential")))')"
    [[ "$creds" == *MembershipCredential* ]] && break
    sleep 3
  done
  check "MembershipCredential in the IdentityHub" "MembershipCredential" "$(grep -o MembershipCredential <<<"$creds" | head -1 || true)"
  # The test that needs all of it: STS client, keys, credential, DSP profile.
  read -r PCTX PDID <<<"$(edc_body "http://controlplane:8081/api/mgmt/v5/participants" | python3 -I -c '
import json, sys
for p in json.load(sys.stdin):
    if p.get("identity", "").endswith(":alpha-klinik"):
        print(p["@id"], p["identity"]); break')"
  if [[ -n "${PCTX:-}" ]]; then
    catalog="$(docker run --rm --network "$NETWORK" "$CURL_IMAGE" -s -m 60 -o /dev/null -w '%{http_code}' \
      -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -X POST \
      -d "{\"@context\":[\"https://w3id.org/edc/connector/management/v2\"],\"@type\":\"CatalogRequest\",\"counterPartyAddress\":\"http://controlplane:8082/api/dsp/$PCTX/http-dsp-profile-2025-1\",\"counterPartyId\":\"$PDID\",\"protocol\":\"http-dsp-profile-2025-1\"}" \
      "http://controlplane:8081/api/mgmt/v5/participants/$CTX/catalog/request")"
    check "DSP catalogue from AlphaKlinik Berlin" "200" "$catalog"
  fi
fi

echo "Disposing"
r="$(tm -X DELETE "$PROFILE_URL")"
echo "  DELETE participant profile: HTTP $(status_of "$r")"
start=$(date +%s)
while :; do
  code="$(status_of "$(tm "$PROFILE_URL")")"
  [[ "$code" == "404" ]] && break
  # The Tenant Manager may keep the profile with every agent disposed.
  if [[ "$(states)" == "disposed" ]]; then
    code="disposed"
    break
  fi
  (($(date +%s) - start > TIMEOUT)) && break
  sleep 3
done
echo "  dispose took $(($(date +%s) - start))s, profile: HTTP $code (state $(states 2>/dev/null || echo -))"
check "participant profile disposed" "yes" "$([[ "$code" == "404" || "$code" == "disposed" ]] && echo yes || echo "no ($code)")"
if [[ -n "$CTX" ]]; then
  TOKEN="$(token)"
  check "control plane context removed" "404" "$(edc_status "http://controlplane:8081/api/mgmt/v5/participants/$CTX")"
  check "issuer holder removed" "404" "$(edc_status "http://issuerservice:10013/api/admin/v1/participants/issuer/holders/$CTX")"
  check "IdentityHub participant removed" "404" "$(edc_status "http://identityhub:7081/api/identity/v1/participants/$CTX")"
fi
tm -X DELETE "$TM_URL/api/v1alpha1/tenants/$TENANT" >/dev/null || true

echo
echo "$pass passed, $fail failed"
[[ "$fail" -eq 0 ]]
