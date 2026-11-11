#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# A second data space on compose, which admits AlphaKasse DE. #934 step 2
# ---------------------------------------------------------------------------
# #934's use case crosses two data spaces: the hub's health data space and an
# "insurance and wellbeing" data space, where the fictional insurer AlphaKasse
# DE offers a bonus programme. That data space has its own Governance
# Authority, a third IssuerService on compose (wellbeing-ga-issuer, profile
# wellbeing), and the hub's control plane trusts it for MembershipCredential
# only, as it trusts the Simpl test authority (#710, ADR-064 decision 2). This
# prepares several access bodies as several authorities (#722).
#
# Here AlphaKasse is a participant context on the hub's connector, a stand-in
# until its own Simpl connector replaces it (#934 step 7). This creates it on
# the control plane and in the IdentityHub, gives it its STS config, gives the
# authority its identity, and has AlphaKasse request its MembershipCredential
# from the authority over DCP. AlphaKasse holds no credential from the hub's
# issuer, so whatever it is admitted to rests on the authority's credential.
# scripts/run-ehds-identity-checks.sh (TRUST-6.6 to 6.8) asserts that.
#
# Idempotent: every step leaves what exists alone. Membership credentials are
# valid for seven days, so an older stack needs this run again.
# ---------------------------------------------------------------------------
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
export KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8080}"
export EDC_MANAGEMENT_URL="${EDC_MANAGEMENT_URL:-http://localhost:11003/api/mgmt}"
export EDC_IDENTITY_URL="${EDC_IDENTITY_URL:-http://localhost:11005/api/identity}"

HOLDER="alphakasse"
GA_DID="did:web:wellbeing-ga-issuer%3A10016:wellbeing-ga"
CP_CONTAINER="${CP_CONTAINER:-health-dataspace-controlplane}"
CYAN='\033[0;36m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'; RED='\033[0;31m'; NC='\033[0m'
step() { echo; echo -e "${CYAN}══ $*${NC}"; }
fail() { echo -e "${RED}second data space NOT seeded${NC}: $*" >&2; exit 1; }

step "1/7 AlphaKasse DE on the control plane"
TOKEN=$(curl -sS --max-time 20 -X POST "${KEYCLOAK_URL}/realms/edcv/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&client_id=provisioner&client_secret=provisioner-secret" 2>/dev/null |
  jq -r '.access_token // empty' 2>/dev/null || true)
[ -n "$TOKEN" ] || fail "no provisioner token from ${KEYCLOAK_URL}"
PARTICIPANT_SLUGS="$HOLDER" CP="$EDC_MANAGEMENT_URL" TOKEN="$TOKEN" \
  bash "${REPO_DIR}/scripts/azure/05-cp-participants.sh" || fail "step 1"

step "2/7 the same context in the IdentityHub, and its STS config"
"${SCRIPT_DIR}/seed-identityhub-participants.sh" || fail "step 2"
"${SCRIPT_DIR}/seed-cp-participant-config.sh" || fail "step 2, STS config"

step "3/7 the insurance and wellbeing Governance Authority"
PROFILE=wellbeing SERVICE=wellbeing-ga-issuer CTX=wellbeing-ga DB="${WELLBEINGGA_DB:-wellbeingga_v1}" \
ADMIN_PORT=10053 HOLDERS="did:web:identityhub%3A7083:${HOLDER}" \
  "${SCRIPT_DIR}/seed-test-issuer.sh" || fail "step 3"

step "4/7 AlphaKasse requests its membership from the authority"
ISSUER_DID="$GA_DID" EDC_ISSUER_URL=http://localhost:10053/api/admin ISSUER_CTX=wellbeing-ga ONLY="$HOLDER" \
  "${SCRIPT_DIR}/request-participant-credentials.sh" || fail "step 4"

# The control plane reads its trust list at start. One started before this
# change does not trust the authority yet, and refuses AlphaKasse for that.
step "5/7 the control plane trusts the authority"
if docker inspect "$CP_CONTAINER" --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null |
  grep -qx "edc.iam.trustedissuer.wellbeing-ga.id=${GA_DID}"; then
  echo -e "${GREEN}OK${NC}: ${CP_CONTAINER} trusts ${GA_DID} (MembershipCredential)"
elif docker inspect "$CP_CONTAINER" >/dev/null 2>&1; then
  echo -e "${YELLOW}WARN${NC}: ${CP_CONTAINER} predates the trust entry; recreate it:"
  echo "  docker compose -f docker-compose.yml -f docker-compose.jad.yml up -d --no-deps controlplane"
else
  echo -e "${YELLOW}WARN${NC}: no ${CP_CONTAINER} to inspect (not a local stack); trust follows docker-compose.jad.yml"
fi

step "6/7 the authority attests AlphaKasse's purpose: the bonus payout (ADR-090)"
GA_ADMIN="http://localhost:10053/api/admin/v1/participants/wellbeing-ga"
ATOKEN=$(curl -sS --max-time 20 -X POST "${KEYCLOAK_URL}/realms/edcv/protocol/openid-connect/token" \
  -d "grant_type=client_credentials&client_id=admin&client_secret=edc-v-admin-secret" 2>/dev/null |
  jq -r '.access_token // empty' 2>/dev/null || true)
[ -n "$ATOKEN" ] || fail "no admin token from ${KEYCLOAK_URL}"
ga_post() {
  local status
  status=$(curl -sS --max-time 30 -o /dev/null -w '%{http_code}' -X POST "${GA_ADMIN}/$1" \
    -H "Authorization: Bearer ${ATOKEN}" -H "Content-Type: application/json" -d "$2" 2>/dev/null) || status="000"
  case "$status" in 2??|409) ;; *) fail "step 6, POST $1 on wellbeing-ga: HTTP ${status}" ;; esac
}
# One definition per purpose; the attestation carries the purpose
# (DemoAttestationsExtension, type "purpose").
LEGAL_BASIS="GDPR Art. 9(2)(a), the member's explicit consent to the programme"
ga_post attestations "$(jq -nc --arg b "$LEGAL_BASIS" \
  '{attestationType:"purpose",id:"bonus-payout-purpose-attestation",configuration:{purpose:"bonus-payout",legalBasis:$b}}')"
ga_post credentialdefinitions '{
  "attestations": ["bonus-payout-purpose-attestation"],
  "credentialType": "DataProcessingPurposeCredential",
  "id": "bonus-payout-purpose-credential-def",
  "jsonSchema": "{}",
  "jsonSchemaUrl": "https://w3id.org/ehds/schema/data-processing-purpose-credential.json",
  "mappings": [
    {"input":"purpose","output":"credentialSubject.purpose","required":true},
    {"input":"legalBasis","output":"credentialSubject.legalBasis","required":true},
    {"input":"since","output":"credentialSubject.since","required":true}
  ],
  "rules": [],
  "format": "VC1_0_JWT",
  "validity": "604800"
}'
AK_CTX=$(curl -sS --max-time 20 -H "Authorization: Bearer ${ATOKEN}" "${EDC_MANAGEMENT_URL}/v5/participants" 2>/dev/null |
  jq -r --arg s "$HOLDER" '[.[] | select((.identity // "") | endswith(":" + $s))] | .[0]["@id"] // empty')
[ -n "$AK_CTX" ] || fail "step 6: no participant context for ${HOLDER}"
held=$(curl -sS --max-time 20 -H "Authorization: Bearer ${ATOKEN}" "${EDC_IDENTITY_URL}/v1/participants/${AK_CTX}/credentials" 2>/dev/null |
  jq --arg ga "$GA_DID" '[.[]? | select(.state == 500)
    | select((.verifiableCredential.credential.type // []) | index("DataProcessingPurposeCredential"))
    | select(.issuerId == $ga)] | length' 2>/dev/null || echo 0)
if [ "${held:-0}" -ge 1 ]; then
  echo -e "${GREEN}OK${NC}: ${HOLDER} already holds its DataProcessingPurposeCredential from ${GA_DID}"
else
  ISSUER_DID="$GA_DID" EDC_ISSUER_URL=http://localhost:10053/api/admin ISSUER_CTX=wellbeing-ga ONLY="$HOLDER" \
  CREDENTIAL_TYPE=DataProcessingPurposeCredential CREDENTIAL_DEFINITION_ID=bonus-payout-purpose-credential-def \
    "${SCRIPT_DIR}/request-participant-credentials.sh" || fail "step 6, the purpose credential"
fi

step "7/7 AlphaKlinik offers the bonus programme's answer under mvhd-bonus-programme"
# The answer itself is delivered in #934 step 8; until then the asset's
# address is the proxy's health probe, which carries no member data.
PROVIDER_CTX=$(curl -sS --max-time 20 -H "Authorization: Bearer ${ATOKEN}" "${EDC_MANAGEMENT_URL}/v5/participants" 2>/dev/null |
  jq -r '[.[] | select((.identity // "") | endswith(":alpha-klinik"))] | .[0]["@id"] // empty')
[ -n "$PROVIDER_CTX" ] || fail "step 7: no participant context for alpha-klinik"
EDC_CTX="https://w3id.org/edc/connector/management/v2"
mgmt_put_or_post() {
  # POST, and on a conflict PUT, so a changed policy reaches a running connector.
  local path="$1" id="$2" body="$3" status
  status=$(curl -sS --max-time 30 -o /dev/null -w '%{http_code}' -X POST "${EDC_MANAGEMENT_URL}/v5/participants/${PROVIDER_CTX}/${path}" \
    -H "Authorization: Bearer ${ATOKEN}" -H "Content-Type: application/json" -d "$body" 2>/dev/null) || status="000"
  if [ "$status" = 409 ]; then
    # EDC updates a policy definition at its id, an asset or a contract
    # definition at the collection (jad/seed-data-assets.sh does the same).
    [ "$path" = policydefinitions ] && path="${path}/${id}"
    status=$(curl -sS --max-time 30 -o /dev/null -w '%{http_code}' -X PUT "${EDC_MANAGEMENT_URL}/v5/participants/${PROVIDER_CTX}/${path}" \
      -H "Authorization: Bearer ${ATOKEN}" -H "Content-Type: application/json" -d "$body" 2>/dev/null) || status="000"
  fi
  case "$status" in 2??) ;; *) fail "step 7, ${path} ${id}: HTTP ${status}" ;; esac
}
mgmt_put_or_post policydefinitions mvhd-bonus-programme "$(jq -c --arg c "$EDC_CTX" \
  '{"@context":[$c],"@type":"PolicyDefinition","@id":"mvhd-bonus-programme",policy:.}' "${REPO_DIR}/jad/policies/mvhd-bonus-programme.json")"
ASSET_TEXT="A member's goal met, yes or no, for one programme and year (#934, ADR-080)."
mgmt_put_or_post assets bonus-programme-answer "$(jq -nc --arg c "$EDC_CTX" --arg d "$ASSET_TEXT" \
  '{"@context":[$c],"@type":"Asset","@id":"bonus-programme-answer",
    properties:{name:"Bonus programme answer",description:$d,contenttype:"application/json"},
    dataAddress:{"@type":"DataAddress",type:"HttpData",baseUrl:"http://neo4j-proxy:9090/health"}}')"
# Anyone admitted to the data space sees the offer; who may agree to it is
# the contract policy's. Its own access policy, so this runs where
# jad/seed-data-assets.sh has not (the CI compliance job).
mgmt_put_or_post policydefinitions bonus-programme-access-policy "$(jq -nc --arg c "$EDC_CTX" \
  '{"@context":[$c],"@type":"PolicyDefinition","@id":"bonus-programme-access-policy",
    policy:{"@context":"http://www.w3.org/ns/odrl.jsonld","@type":"Set","permission":[{"action":"use","constraint":[]}]}}')"
mgmt_put_or_post contractdefinitions bonus-programme-contract "$(jq -nc --arg c "$EDC_CTX" '{"@context":[$c],"@type":"ContractDefinition",
  "@id":"bonus-programme-contract",accessPolicyId:"bonus-programme-access-policy",contractPolicyId:"mvhd-bonus-programme",
  assetsSelector:[{"@type":"Criterion",operandLeft:"https://w3id.org/edc/v0.0.1/ns/id",operator:"=",operandRight:"bonus-programme-answer"}]}')"
echo -e "${GREEN}OK${NC}: alpha-klinik offers bonus-programme-answer under mvhd-bonus-programme"

echo -e "\n${GREEN}second data space seeded${NC}: ${HOLDER} holds its MembershipCredential and its bonus payout purpose from ${GA_DID}"
