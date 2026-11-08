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

step "1/5 AlphaKasse DE on the control plane"
TOKEN=$(curl -sS --max-time 20 -X POST "${KEYCLOAK_URL}/realms/edcv/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&client_id=provisioner&client_secret=provisioner-secret" 2>/dev/null |
  jq -r '.access_token // empty' 2>/dev/null || true)
[ -n "$TOKEN" ] || fail "no provisioner token from ${KEYCLOAK_URL}"
PARTICIPANT_SLUGS="$HOLDER" CP="$EDC_MANAGEMENT_URL" TOKEN="$TOKEN" \
  bash "${REPO_DIR}/scripts/azure/05-cp-participants.sh" || fail "step 1"

step "2/5 the same context in the IdentityHub, and its STS config"
"${SCRIPT_DIR}/seed-identityhub-participants.sh" || fail "step 2"
"${SCRIPT_DIR}/seed-cp-participant-config.sh" || fail "step 2, STS config"

step "3/5 the insurance and wellbeing Governance Authority"
PROFILE=wellbeing SERVICE=wellbeing-ga-issuer CTX=wellbeing-ga DB="${WELLBEINGGA_DB:-wellbeingga_v1}" \
ADMIN_PORT=10053 HOLDERS="did:web:identityhub%3A7083:${HOLDER}" \
  "${SCRIPT_DIR}/seed-test-issuer.sh" || fail "step 3"

step "4/5 AlphaKasse requests its membership from the authority"
ISSUER_DID="$GA_DID" EDC_ISSUER_URL=http://localhost:10053/api/admin ISSUER_CTX=wellbeing-ga ONLY="$HOLDER" \
  "${SCRIPT_DIR}/request-participant-credentials.sh" || fail "step 4"

# The control plane reads its trust list at start. One started before this
# change does not trust the authority yet, and refuses AlphaKasse for that.
step "5/5 the control plane trusts the authority"
if docker inspect "$CP_CONTAINER" --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null |
  grep -qx "edc.iam.trustedissuer.wellbeing-ga.id=${GA_DID}"; then
  echo -e "${GREEN}OK${NC}: ${CP_CONTAINER} trusts ${GA_DID} (MembershipCredential)"
elif docker inspect "$CP_CONTAINER" >/dev/null 2>&1; then
  echo -e "${YELLOW}WARN${NC}: ${CP_CONTAINER} predates the trust entry; recreate it:"
  echo "  docker compose -f docker-compose.yml -f docker-compose.jad.yml up -d --no-deps controlplane"
else
  echo -e "${YELLOW}WARN${NC}: no ${CP_CONTAINER} to inspect (not a local stack); trust follows docker-compose.jad.yml"
fi

echo -e "\n${GREEN}second data space seeded${NC}: ${HOLDER} holds its MembershipCredential from ${GA_DID}"
