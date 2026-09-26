#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Seed the whole identity layer, in order, idempotently. #345
# ---------------------------------------------------------------------------
# The same sequence compliance.yml runs, as one command, so a stack whose
# identity layer is empty or half there can be recovered without reading the
# workflow. Every step is safe to re-run: existing objects answer 409 and are
# counted as present.
#
#   1. participant contexts on the control plane      scripts/azure/05-cp-participants.sh
#   2. the same participants in IdentityHub            scripts/seed-identityhub-participants.sh
#   3. the IssuerService's own identity                scripts/seed-issuer-identity.sh
#   4. the issuer accepts tokens                       scripts/lib/wait-for-issuer-auth.sh
#   5. participants registered as holders              scripts/seed-issuer-holders.sh
#   6. attestation and credential definitions          jad/seed-issuer-defs.sh
#   7. a MembershipCredential for each, over DCP       scripts/request-participant-credentials.sh
#
# Step 7 is the one that proves the layer works: it needs every participant's
# signing key to be in Vault. On a stack whose Vault lost them (gotchas,
# 2026-09-26) it fails there and says so; the six steps before it still leave
# the stores consistent. SKIP_CREDENTIALS=1 stops after step 6.
#
# Defaults are the local compose stack. Override the URLs for anything else.
# ---------------------------------------------------------------------------
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

export KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8080}"
export EDC_MANAGEMENT_URL="${EDC_MANAGEMENT_URL:-http://localhost:11003/api/mgmt}"
export EDC_IDENTITY_URL="${EDC_IDENTITY_URL:-http://localhost:11005/api/identity}"
export EDC_ISSUER_URL="${EDC_ISSUER_URL:-http://localhost:10013/api/admin}"
SKIP_CREDENTIALS="${SKIP_CREDENTIALS:-0}"

CYAN='\033[0;36m'; GREEN='\033[0;32m'; RED='\033[0;31m'; NC='\033[0m'
step() { echo; echo -e "${CYAN}══ $*${NC}"; }
fail() { echo -e "${RED}identity layer NOT recovered${NC}: $*" >&2; exit 1; }

step "1/7 participant contexts on the control plane"
TOKEN=$(curl -sS --max-time 20 -X POST "${KEYCLOAK_URL}/realms/edcv/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&client_id=provisioner&client_secret=provisioner-secret" 2>/dev/null \
  | python3 -c "import json,sys; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null || true)
[ -n "$TOKEN" ] || fail "no provisioner token from ${KEYCLOAK_URL}"
CP="$EDC_MANAGEMENT_URL" TOKEN="$TOKEN" bash "${REPO_DIR}/scripts/azure/05-cp-participants.sh" || fail "step 1"

step "2/7 the same participants in IdentityHub"
"${SCRIPT_DIR}/seed-identityhub-participants.sh" || fail "step 2"

step "3/7 the IssuerService's own identity"
"${SCRIPT_DIR}/seed-issuer-identity.sh" || fail "step 3"

step "4/7 the issuer accepts tokens"
KC_HOST="$KEYCLOAK_URL" ISSUER_API="${EDC_ISSUER_URL%/api/admin}" TIMEOUT=120 \
  bash "${SCRIPT_DIR}/lib/wait-for-issuer-auth.sh" || fail "step 4"

step "5/7 participants registered as holders"
"${SCRIPT_DIR}/seed-issuer-holders.sh" || fail "step 5"

step "6/7 attestation and credential definitions"
KC_HOST="$KEYCLOAK_URL" ISSUER_API="${EDC_ISSUER_URL%/api/admin}" bash "${REPO_DIR}/jad/seed-issuer-defs.sh" || fail "step 6"

if [ "$SKIP_CREDENTIALS" = "1" ]; then
  echo -e "${GREEN}identity layer seeded${NC} (credentials skipped on request)"; exit 0
fi
step "7/7 a MembershipCredential for each participant, over DCP"
"${SCRIPT_DIR}/request-participant-credentials.sh" || fail "step 7: the stores are consistent, but no credential could be issued; see the reason above"
echo; echo -e "${GREEN}identity layer recovered${NC}: every participant holds a DCP-issued credential"
