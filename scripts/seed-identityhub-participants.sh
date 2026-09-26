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
# It MIRRORS THE CONTROL PLANE rather than inventing identifiers. On a stack
# built by CFM the two stores agree exactly: alpha-klinik is context
# 24be78bf... with did:web:identityhub%3A7083:alpha-klinik in both. The first
# version of this script minted its own ids and DIDs, the two diverged, and
# the suite could not match a control-plane context to an IdentityHub record,
# so DID-1.1 and KEY-2.2 went on failing against a hub that was no longer
# empty. Read the control plane and copy what it says.
#
# Idempotent: an existing DID answers 409 ObjectConflict and is treated as
# success, so this is safe to re-run.
#
# Usage:
#   ./scripts/seed-identityhub-participants.sh
#   IDENTITY_API=http://localhost:11005/api/identity ./scripts/seed-identityhub-participants.sh
# ---------------------------------------------------------------------------
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

IDENTITY_API="${EDC_IDENTITY_URL:-http://localhost:11005/api/identity}"
MGMT_API="${EDC_MANAGEMENT_URL:-http://localhost:11003/api/mgmt}"
MGMT_V_CANDIDATES="${EDC_MGMT_API_VERSION_CANDIDATES:-v5beta v5alpha v4alpha v3}"
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

# --- What does the control plane call these participants? -------------------
# Each line is "<contextId> <did>". Empty when the control plane is unseeded
# or unreachable, in which case fall back to deriving ids from the slugs.
PAIRS=""
for v in $MGMT_V_CANDIDATES; do
  cp_body=$(curl -sS --max-time 20 -H "Authorization: Bearer ${TOKEN}" \
    "${MGMT_API}/${v}/participants" 2>/dev/null) || continue
  PAIRS=$(printf '%s' "$cp_body" | python3 "${SCRIPT_DIR}/lib/cp-participant-pairs.py" 2>/dev/null) || PAIRS=""
  if [ -n "$PAIRS" ]; then
    log "mirroring $(printf '%s\n' "$PAIRS" | grep -c . ) participant(s) from the control plane (${v})"
    break
  fi
done

if [ -z "$PAIRS" ]; then
  log "control plane has nothing to mirror; deriving ids from the slugs"
  for slug in "${SLUGS[@]}"; do
    ctx=$(printf '%s' "$slug" | md5sum 2>/dev/null | cut -c1-32) \
      || ctx=$(printf '%s' "$slug" | md5 | cut -c1-32)
    PAIRS="${PAIRS}${ctx} did:web:${DID_HOST}:${slug}
"
  done
fi

created=0; existed=0; failed=0

while read -r ctx did; do
  [ -n "$ctx" ] && [ -n "$did" ] || continue

  # The service endpoints are what make the DID document usable: the issuer
  # delivers a credential to the CredentialService endpoint, and a counterparty
  # sends DSP messages to the ProtocolEndpoint. CFM writes both; the first
  # version of this seed wrote neither, and in CI the issuer approved every
  # request and then sat at APPROVED with nowhere to deliver (#345, run
  # 36266312446: "<no CredentialService in DID document>"). Shapes copied from
  # a CFM-made participant's did.json on the local stack.
  body=$(python3 - "$ctx" "$did" "${CREDENTIALS_BASE:-http://identityhub:7082/api/credentials/v1/participants}" "${PROTOCOL_BASE:-http://controlplane:8082/api/dsp}" <<'PY'
import json, sys
ctx, did, cred_base, proto_base = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
print(json.dumps({
    "participantContextId": ctx,
    "did": did,
    "active": True,
    "roles": ["participant"],
    "serviceEndpoints": [
        {"type": "CredentialService", "serviceEndpoint": f"{cred_base}/{ctx}", "id": f"{ctx}-credentialservice"},
        {"type": "ProtocolEndpoint",  "serviceEndpoint": f"{proto_base}/{ctx}/2025-1", "id": f"{ctx}-dsp"},
    ],
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
      echo -e "  ${GREEN}+${NC} ${did}"
      created=$((created + 1)) ;;
    409)
      echo -e "  ${YELLOW}=${NC} ${did} already present"
      existed=$((existed + 1)) ;;
    *)
      echo -e "  ${RED}x${NC} ${did}: HTTP ${status} ${detail}"
      failed=$((failed + 1)) ;;
  esac
done <<MIRROR_EOF
$PAIRS
MIRROR_EOF

log "created ${created}, already present ${existed}, failed ${failed}"

# Assert the outcome rather than the mechanism (ADR-031). Creating without
# reading back is how #325 claimed an activation that never happened.
total=$(curl -sS --max-time 20 -H "Authorization: Bearer ${TOKEN}" \
  "${IDENTITY_API}/v1alpha/participants" 2>/dev/null \
  | python3 -c "import json,sys; print(len(json.load(sys.stdin)))" 2>/dev/null || echo 0)
log "IdentityHub now reports ${total} participant context(s)"

# A participant the hub lists is not yet a participant anyone can talk to: the
# issuer resolves did:web:identityhub%3A7083:<slug> to
# http://identityhub:7083/<slug>/did.json before it will issue anything. That
# port is not published, so this probes from inside the network when Docker
# is available. PROBE_DID_DOCS=0 skips it.
if [ "${PROBE_DID_DOCS:-1}" = "1" ] && command -v docker >/dev/null 2>&1; then
  unresolved=0
  while read -r _ctx did; do
    [ -n "$did" ] || continue
    slug="${did##*:}"
    code=$(docker run --rm --network "${COMPOSE_NETWORK:-health-dataspace-edcv}" "${CURL_IMAGE:-curlimages/curl:latest}" \
      -s -o /dev/null -w '%{http_code}' "http://identityhub:7083/${slug}/did.json" 2>/dev/null || echo 000)
    if [ "$code" = "200" ]; then
      # The CredentialService endpoint is where the issuer delivers; print it
      # once so a stuck delivery can be checked against what the hub advertises.
      if [ -z "${_printed_cs:-}" ]; then
        cs=$(docker run --rm --network "${COMPOSE_NETWORK:-health-dataspace-edcv}" "${CURL_IMAGE:-curlimages/curl:latest}" \
          -s "http://identityhub:7083/${slug}/did.json" 2>/dev/null \
          | python3 -c "import json,sys; d=json.load(sys.stdin); print(next((x.get('serviceEndpoint') for x in d.get('service',[]) if x.get('type')=='CredentialService'),'<no CredentialService in DID document>'))" 2>/dev/null || echo '<unreadable>')
        echo "  CredentialService endpoint (from ${slug}'s DID document): ${cs}"; _printed_cs=1
      fi
      echo -e "  ${GREEN}✓${NC} ${did} resolves"
    else
      echo -e "  ${RED}!${NC} ${did} -> http://identityhub:7083/${slug}/did.json -> HTTP ${code}"
      unresolved=$((unresolved + 1))
    fi
  done <<EOF
$PAIRS
EOF
  if [ "$unresolved" -gt 0 ]; then
    echo -e "${RED}FAIL${NC}: ${unresolved} participant DID document(s) do not resolve; nothing can issue to them." >&2
    exit 1
  fi
fi

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
