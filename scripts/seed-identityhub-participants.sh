#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Seed participant contexts directly into IdentityHub. #345
# ---------------------------------------------------------------------------
# The CI ephemeral stack's IdentityHub holds zero participants, so every DCP
# check that needs a DID, a key pair or a credential fails. Locally these are
# created by jad/seed-health-tenants.sh, which drives the CFM TenantManager;
# CFM wants 8 GB of Docker and does not fit a standard runner, so CI has never
# had them.
#
# This talks to the IdentityHub Identity API instead, which needs no CFM.
# Note that POST /v1alpha/participants is NOT in jad/openapi/identity-api.yaml
# even though ParticipantManifest is: the vendored spec is missing the
# operation. Verified against the running service (#345).
#
# Idempotent: an existing DID answers 409 ObjectConflict and is treated as
# success, so this is safe to re-run.
#
# Usage:
#   ./scripts/seed-identityhub-participants.sh
#   IDENTITY_API=http://localhost:11005/api/identity ./scripts/seed-identityhub-participants.sh
# ---------------------------------------------------------------------------
set -euo pipefail

IDENTITY_API="${EDC_IDENTITY_URL:-http://localhost:11005/api/identity}"
KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8080}"
REALM="${KEYCLOAK_REALM:-edcv}"
CLIENT_ID="${EDC_CLIENT_ID:-admin}"
CLIENT_SECRET="${EDC_CLIENT_SECRET:-edc-v-admin-secret}"
# The DID must match what the connector resolves, which is the container-
# internal address, not the published one.
DID_HOST="${DID_HOST:-identityhub%3A7083}"

CYAN='\033[0;36m'; GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[0;33m'; NC='\033[0m'
log() { echo -e "${CYAN}[ih-seed]${NC} $*"; }

# Fictional organisations only, per .claude/rules/code-style.md. The first
# three are what the suites look for; lmc and irs take the count past the
# four DID-1.2 expects.
SLUGS=(alpha-klinik pharmaco medreg lmc irs)

token() {
  curl -sS --max-time 20 -X POST \
    "${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/token" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "grant_type=client_credentials&client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}" \
    2>/dev/null | python3 -c "import json,sys; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null || true
}

TOKEN=$(token)
if [ -z "$TOKEN" ]; then
  echo -e "${RED}ERROR${NC}: no Keycloak token from ${KEYCLOAK_URL}/realms/${REALM}." >&2
  echo "  Without it the Identity API refuses every call and nothing can be seeded." >&2
  exit 1
fi

created=0; existed=0; failed=0

for slug in "${SLUGS[@]}"; do
  did="did:web:${DID_HOST}:${slug}"
  # Deterministic context id, so a re-run addresses the same record rather
  # than trying to mint a second one.
  ctx=$(printf '%s' "$slug" | md5sum 2>/dev/null | cut -c1-32) \
    || ctx=$(printf '%s' "$slug" | md5 | cut -c1-32)

  body=$(python3 - "$ctx" "$did" <<'PY'
import json, sys
ctx, did = sys.argv[1], sys.argv[2]
print(json.dumps({
    "participantContextId": ctx,
    "did": did,
    "active": True,
    "roles": ["participant"],
    "keys": [{
        "keyId": f"{did}#key1",
        "privateKeyAlias": f"{did}#key1",
        "active": True,
        "keyGeneratorParams": {"algorithm": "EdDSA"},
        "usage": ["sign_token", "sign_presentation", "sign_credentials"],
    }],
}))
PY
)

  tmp=$(mktemp)
  status=$(curl -sS --max-time 30 -o "$tmp" -w '%{http_code}' \
    -X POST "${IDENTITY_API}/v1alpha/participants" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$body" 2>/dev/null) || status="000"
  detail=$(head -c 300 "$tmp" 2>/dev/null || true); rm -f "$tmp"

  case "$status" in
    2??)
      echo -e "  ${GREEN}+${NC} ${slug} -> ${did}"
      created=$((created + 1)) ;;
    409)
      echo -e "  ${YELLOW}=${NC} ${slug} already present"
      existed=$((existed + 1)) ;;
    *)
      echo -e "  ${RED}x${NC} ${slug}: HTTP ${status} ${detail}"
      failed=$((failed + 1)) ;;
  esac
done

log "created ${created}, already present ${existed}, failed ${failed}"

# Assert the outcome rather than the mechanism (ADR-031). Creating without
# reading back is how #325 claimed an activation that never happened.
total=$(curl -sS --max-time 20 -H "Authorization: Bearer ${TOKEN}" \
  "${IDENTITY_API}/v1alpha/participants" 2>/dev/null \
  | python3 -c "import json,sys; print(len(json.load(sys.stdin)))" 2>/dev/null || echo 0)
log "IdentityHub now reports ${total} participant context(s)"

if [ "$failed" -gt 0 ]; then
  echo -e "${RED}FAIL${NC}: ${failed} participant(s) could not be created." >&2
  exit 1
fi
# DID-1.2 expects at least four; below that the DCP suite cannot do its job
# and saying so here is clearer than eight downstream failures.
if [ "${total:-0}" -lt 4 ]; then
  echo -e "${RED}FAIL${NC}: only ${total} participant context(s); the DCP suite expects at least 4." >&2
  exit 1
fi
echo -e "${GREEN}OK${NC}: IdentityHub holds ${total} participant contexts"
