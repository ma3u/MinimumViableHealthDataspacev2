#!/usr/bin/env bash
set -euo pipefail
# ---------------------------------------------------------------------------
# Does the hub accept a credential from Simpl-Open's own issuer? #934 step 0a
# ---------------------------------------------------------------------------
# #710 proved the trust model with a stand-in Governance Authority on EDC's
# IssuerService. This runs Simpl's actual issuer, issuer-service-be 1.6.0 from
# code.europa.eu (compose profile simpl), has it sign a MembershipCredential
# for a hub participant, and checks whether the hub accepts that participant
# on it over DSP (ADR-064, decision 6).
#
# The issuer signs with Simpl's published test identity: the Ed25519 PKCS#12
# and did:key its repository ships for its own tests (vault-mock), fetched at
# a pinned commit and checked by SHA-256. No private key lives in this
# repository, and the DID is fixed, so a trust list can name it.
#
# Steps, each written to test-results/simpl-issuer/summary.txt:
#   1. Simpl's issuer issues a MembershipCredential to the holder (default irs)
#   2. Simpl's own verify endpoint accepts it
#   3. the holder gets the provider's catalogue without it (baseline)
#   4. the holder's IdentityHub stores it (Identity API)
#   5. the catalogue request again, now presenting it: the verdict
#   6. clean-up, and the holder is accepted again
#
# Exit codes: 0 accepted, 3 refused (the reason is in the summary), 1 the run
# itself failed. --diagnose recreates the IdentityHub and the control plane
# with https contexts and DEBUG logging (jad/simpl-issuer/diagnose.yml) for the
# run, so a refusal past the first one names itself, and restores them after.
#
# Usage: ./scripts/run-simpl-issuer-interop.sh [--diagnose]
# Needs the JAD stack (docker-compose.jad.yml) up and seeded.
# ---------------------------------------------------------------------------
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib/dsp-protocol.sh
source "${REPO_DIR}/scripts/lib/dsp-protocol.sh"

DIAGNOSE=0
[ "${1:-}" = "--diagnose" ] && DIAGNOSE=1

SIMPL_COMMIT="ca134912e7d8c6beb6e24a6a6d0b68872bae341e" # tag v1.6.0
SIMPL_RAW="https://code.europa.eu/simpl/simpl-open/security/credential-management/vc-issuance-verification/issuer-service/issuer-service-be/-/raw/${SIMPL_COMMIT}/src/test/resources/vault-mock"
P12_SHA256="d8f5831e52a54e5f3bd22ff75e8b385876dc376855c5a9df8c7449bea4594264"
MOCK_SHA256="3372f9e43c6d8a3451a47d44142f0d6347dfe51dc16eb930e9ae3a170a45f5e2"
# Derived from the certificate's public key (multicodec ed25519-pub, base58btc)
# and equal to the DID Simpl's mock serves; checked again below.
SIMPL_DID="did:key:z6MkmaekaMKDpZKMAvtYJM774iXLCfXxXBbpRJekeKmv9vpe"
ACTOR="simpl-ga"

HOLDER="${HOLDER:-irs}"
PROVIDER="${PROVIDER:-alpha-klinik}"
# The credential's own context. Simpl's issuer takes one URI per request and
# needs it resolvable over https; this one defines any term (@vocab).
CONTEXT_URI="${SIMPL_CONTEXT_URI:-https://www.w3.org/ns/credentials/examples/v2}"

SIMPL_URL="${SIMPL_ISSUER_URL:-http://localhost:10043/vcIssuerService/v1}"
SIMPL_API_KEY="${SIMPL_API_KEY:-simpl-local-key}"
MGMT_API="${EDC_MANAGEMENT_URL:-http://localhost:11003/api/mgmt}"
IDENTITY_API="${EDC_IDENTITY_URL:-http://localhost:11005/api/identity}"
DSP_INTERNAL_URL="${DSP_INTERNAL_URL:-http://controlplane:8082/api/dsp}"
KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8080}"
REALM="${KEYCLOAK_REALM:-edcv}"
CLIENT_ID="${EDC_CLIENT_ID:-admin}"
CLIENT_SECRET="${EDC_CLIENT_SECRET:-edc-v-admin-secret}"
IH_DB="${IH_DB:-identityhub_v1}"

DATA_DIR="${REPO_DIR}/jad/simpl-issuer/data"
OUT_DIR="${REPO_DIR}/test-results/simpl-issuer"
SUMMARY="${OUT_DIR}/summary.txt"
mkdir -p "$DATA_DIR" "$OUT_DIR"
: >"$SUMMARY"

compose=(docker compose)
for f in ${COMPOSE_FILES:-docker-compose.yml docker-compose.jad.yml}; do compose+=(-f "${REPO_DIR}/${f}"); done
[ -n "${COMPOSE_PROJECT:-}" ] && compose+=(-p "$COMPOSE_PROJECT")

say() { echo "$*" | tee -a "$SUMMARY"; }
die() { say "ERROR: $*"; exit 1; }
step() { say "$(printf '%-9s %s' "$1" "$2")"; }

token() {
  curl -sf --max-time 20 -X POST "${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/token" \
    -d grant_type=client_credentials -d "client_id=${CLIENT_ID}" -d "client_secret=${CLIENT_SECRET}" |
    jq -r '.access_token // empty'
}

wait_healthy() {
  local c deadline=$(( $(date +%s) + ${2:-240} ))
  for c in $1; do
    until [ "$(docker inspect "$c" --format '{{.State.Health.Status}}' 2>/dev/null)" = "healthy" ]; do
      [ "$(date +%s)" -lt "$deadline" ] || die "${c} not healthy in time"
      sleep 5
    done
  done
}

# The participant context id of a slug, from the control plane.
ctx_of() {
  printf '%s' "$PARTICIPANTS" | jq -r --arg s "$1" \
    '[.[] | select((.identity // "") | endswith(":" + $s))] | .[0]["@id"] // empty'
}

# A DSP catalogue request from the holder to the provider: "<status> <@type>".
catalog() {
  local body out code
  body=$(jq -nc --arg addr "${DSP_INTERNAL_URL}/${PROVIDER_CTX}/${DSP_PROTOCOL}" \
    --arg id "did:web:identityhub%3A7083:${PROVIDER}" --arg p "$DSP_PROTOCOL" \
    '{"@context":["https://w3id.org/edc/connector/management/v2"],"@type":"CatalogRequest",counterPartyAddress:$addr,counterPartyId:$id,protocol:$p}')
  out=$(mktemp)
  code=$(curl -s --max-time 60 -o "$out" -w '%{http_code}' -X POST -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" -d "$body" \
    "${MGMT_API}/v5/participants/${HOLDER_CTX}/catalog/request" 2>/dev/null) || code="000"
  printf '%s %s' "$code" "$(jq -r 'if type=="object" then (."@type" // "none") else "error" end' "$out" 2>/dev/null || echo unreadable)"
  rm -f "$out"
}

remove_simpl_credentials() {
  local cred
  for cred in $(docker exec health-dataspace-postgres psql -U ih -d "$IH_DB" -At -c \
      "select id from credential_resource where participant_context_id='${HOLDER_CTX}' and issuer_id='${SIMPL_DID}'" 2>/dev/null); do
    curl -s -o /dev/null --max-time 20 -X DELETE -H "Authorization: Bearer ${TOKEN}" \
      "${IDENTITY_API}/v1/participants/${HOLDER_CTX}/credentials/${cred}" || true
  done
}

restore_services() {
  [ "$DIAGNOSE" -eq 1 ] || return 0
  "${compose[@]}" up -d --no-deps identityhub controlplane >/dev/null 2>&1 || true
  wait_healthy "health-dataspace-identityhub health-dataspace-controlplane"
}

cleanup() {
  [ -n "${HOLDER_CTX:-}" ] && [ -n "${TOKEN:-}" ] && remove_simpl_credentials
  restore_services
}
trap cleanup EXIT

say "Simpl issuer interop (#934 step 0a), $(date -u +%Y-%m-%dT%H:%M:%SZ)"
say "issuer-service-be 1.6.0 (${SIMPL_COMMIT:0:8}), holder ${HOLDER}, provider ${PROVIDER}, context ${CONTEXT_URI}"
say ""

# --- Simpl's published test identity -----------------------------------------
src=$(mktemp -d)
curl -sf --max-time 60 -o "${src}/cert.p12" "${SIMPL_RAW}/ed25519-certificate.p12" || die "cannot fetch Simpl's test certificate"
curl -sf --max-time 60 -o "${src}/mini-vault.ps1" "${SIMPL_RAW}/mini-vault.ps1" || die "cannot fetch Simpl's vault mock"
check_sha() { [ "$(shasum -a 256 "$1" | cut -d' ' -f1)" = "$2" ] || die "$1 does not match its pinned SHA-256"; }
check_sha "${src}/cert.p12" "$P12_SHA256"
check_sha "${src}/mini-vault.ps1" "$MOCK_SHA256"
python3 -I - "$src" "$DATA_DIR" "$ACTOR" "$SIMPL_DID" <<'PY' || die "Simpl's vault mock does not hold the expected DID"
import base64, json, pathlib, re, sys
src, out, actor, want = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2]), sys.argv[3], sys.argv[4]
mock = (src / "mini-vault.ps1").read_text()
def actor_1(name):
    # actor_1 = "value", or actor_1 = $variable with $variable = "value" above it
    block = mock.split(f"/v1/kv/data/vc-issuer-service/{name}", 1)[1]
    value = re.search(r'actor_1\s*=\s*("([^"]*)"|\$\w+)', block)
    if value.group(2) is not None:
        return value.group(2)
    return re.search(re.escape(value.group(1)) + r'\s*=\s*"([^"]*)"', block).group(1)
did = actor_1("dids")
if did != want:
    sys.exit(1)
maps = {"certificates": base64.b64encode((src / "cert.p12").read_bytes()).decode(),
        "passwords": actor_1("passwords"), "dids": did}
for name, value in maps.items():
    (out / f"{name}.json").write_text(json.dumps({actor: value}))
PY
chmod 644 "$DATA_DIR"/*.json
rm -rf "$src"

"${compose[@]}" --profile simpl up -d simpl-vault simpl-issuer >/dev/null 2>&1 || die "docker compose could not start simpl-issuer"
wait_healthy "health-dataspace-simpl-vault health-dataspace-simpl-issuer"

TOKEN=$(token)
[ -n "$TOKEN" ] || die "no token from ${KEYCLOAK_URL}/realms/${REALM}"
PARTICIPANTS=$(curl -sf --max-time 20 -H "Authorization: Bearer ${TOKEN}" "${MGMT_API}/v5/participants") ||
  die "cannot list participants at ${MGMT_API}/v5/participants"
HOLDER_CTX=$(ctx_of "$HOLDER")
PROVIDER_CTX=$(ctx_of "$PROVIDER")
[ -n "$HOLDER_CTX" ] && [ -n "$PROVIDER_CTX" ] || die "no participant context for ${HOLDER} or ${PROVIDER}"

# --- 1. Issue ------------------------------------------------------------------
now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
request=$(jq -nc --arg actor "$ACTOR" --arg sub "did:web:identityhub%3A7083:${HOLDER}" --arg now "$now" \
  --arg exp "$(date -u -v+7d +%Y-%m-%dT%H:%M:%S 2>/dev/null || date -u -d '+7 days' +%Y-%m-%dT%H:%M:%S)" \
  --arg ctx "$CONTEXT_URI" \
  '{clientId:$actor,type:["VerifiableCredential","MembershipCredential"],
    credentialSubject:{id:$sub,membershipType:"full-member",membershipStartDate:$now,membership:{since:$now}},
    expirationDate:$exp,contextURI:$ctx}')
code=$(curl -s --max-time 60 -o "${OUT_DIR}/credential.json" -w '%{http_code}' -X POST \
  -H "Content-Type: application/json" -H "X-API-KEY: ${SIMPL_API_KEY}" -d "$request" "${SIMPL_URL}/credentials/issue") || code="000"
[ "$code" = "200" ] || die "Simpl's issuer answered ${code} to the issue request"
proof=$(jq -r '.proof.type' "${OUT_DIR}/credential.json")
issuer=$(jq -r '.issuer' "${OUT_DIR}/credential.json")
step "ISSUE" "pass: ${proof} proof, issuer ${issuer}, type $(jq -c .type "${OUT_DIR}/credential.json")"
[ "$issuer" = "$SIMPL_DID" ] || die "issuer is ${issuer}, expected ${SIMPL_DID}"

# --- 2. Simpl verifies its own credential ------------------------------------------
verdict=$(curl -s --max-time 90 -X POST -H "Content-Type: application/json" -H "X-API-KEY: ${SIMPL_API_KEY}" \
  -d @"${OUT_DIR}/credential.json" "${SIMPL_URL}/credentials/verify" | jq -c '{isValid, checks}')
if [ "$(printf '%s' "$verdict" | jq -r .isValid)" = "true" ]; then
  step "SIMPL" "pass: Simpl's verify endpoint accepts it ${verdict}"
else
  step "SIMPL" "fail: Simpl's verify endpoint rejects it ${verdict}"
fi

# --- Optional: let the next refusal name itself ------------------------------------
if [ "$DIAGNOSE" -eq 1 ]; then
  "${compose[@]}" -f "${REPO_DIR}/jad/simpl-issuer/diagnose.yml" up -d --no-deps identityhub controlplane >/dev/null 2>&1 ||
    die "could not recreate identityhub and controlplane with jad/simpl-issuer/diagnose.yml"
  wait_healthy "health-dataspace-identityhub health-dataspace-controlplane"
  TOKEN=$(token)
  step "DIAGNOSE" "identityhub and controlplane: https contexts allowed, DEBUG logging"
fi

# --- 3. Baseline -------------------------------------------------------------------
res=$(catalog)
[ "${res#* }" = "Catalog" ] || die "baseline: ${HOLDER} is refused even without Simpl's credential (${res}); the DSP path does not work here"
step "BASELINE" "pass: ${HOLDER} gets ${PROVIDER}'s catalogue on its current credentials"

# --- 4. Store it in the holder's IdentityHub ------------------------------------------
manifest=$(python3 -I - "${OUT_DIR}/credential.json" "$HOLDER_CTX" <<'PY'
import json, sys, uuid
vc = json.load(open(sys.argv[1]))
credential = {"id": vc["id"], "type": vc["type"], "issuer": {"id": vc["issuer"], "additionalProperties": {}},
              "issuanceDate": vc["issuanceDate"], "expirationDate": vc["expirationDate"],
              "credentialSubject": [vc["credentialSubject"]], "credentialStatus": [], "credentialSchema": [],
              "dataModelVersion": "V_1_1"}
print(json.dumps({"id": "simpl-" + str(uuid.uuid4()), "participantContextId": sys.argv[2],
                  "verifiableCredentialContainer": {"rawVc": json.dumps(vc), "format": "VC1_0_LD",
                                                    "credential": credential}}))
PY
)
code=$(curl -s --max-time 30 -o /dev/null -w '%{http_code}' -X POST -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" -d "$manifest" "${IDENTITY_API}/v1/participants/${HOLDER_CTX}/credentials") || code="000"
case "$code" in 2??) step "STORE" "pass: the IdentityHub stored it (HTTP ${code}; it does not verify on import)" ;;
  *) die "the IdentityHub answered ${code} to storing it" ;; esac

# --- 5. The verdict ----------------------------------------------------------------
since=$(date -u +%Y-%m-%dT%H:%M:%SZ)
res=$(catalog)
ih_log=$(docker logs --since "$since" health-dataspace-identityhub 2>&1 || true)
cp_log=$(docker logs --since "$since" health-dataspace-controlplane 2>&1 || true)
accepted=0
if [ "${res#* }" = "Catalog" ]; then
  accepted=1
  step "VERDICT" "ACCEPTED: ${HOLDER} gets the catalogue presenting Simpl's credential"
else
  reason="refused (${res%% *}); the reason is not logged, rerun with --diagnose"
  if [[ "$ih_log" == *"problem encountered loading a remote context"* ]]; then
    reason="the IdentityHub cannot load the credential's JSON-LD context ${CONTEXT_URI}: EDC's document loader refuses the https scheme (edc.jsonld.https.enabled is false), so no presentation is built"
  elif [[ "$cp_log" == *"No SignatureSuite found"* ]]; then
    reason="the control plane has no signature suite for ${proof}: DcpCoreExtension registers JsonWebSignature2020 only"
  elif [[ "$cp_log" == *"not supported for issuer '${SIMPL_DID}'"* ]]; then
    reason="the issuer ${SIMPL_DID} is not trusted for MembershipCredential"
  elif [[ "$cp_log" == *"did:key"* ]]; then
    reason="the control plane cannot resolve did:key: EDC's DID registry resolves did:web only"
  fi
  step "VERDICT" "REFUSED: ${reason}"
fi

# --- 6. Clean up -------------------------------------------------------------------
remove_simpl_credentials
restore_services
DIAGNOSE=0 # restored; the exit trap need not do it again
TOKEN=$(token)
res=$(catalog)
if [ "${res#* }" = "Catalog" ]; then
  step "AFTER" "pass: without Simpl's credential ${HOLDER} is accepted again"
else
  step "AFTER" "fail: after the clean-up the request still answered ${res}"
fi

say ""
say "summary: ${SUMMARY}; credential: ${OUT_DIR}/credential.json"
[ "$accepted" -eq 1 ] && exit 0
exit 3
