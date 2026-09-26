#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Register the participants as holders on the IssuerService. #345
# ---------------------------------------------------------------------------
# The IssuerService only issues to a DID it knows: its holders registry, keyed
# by DID. Locally CFM registers each participant during onboarding; CI has no
# CFM, so nothing ever registered them and no credential request could have
# been honoured. This mirrors the control plane's participants (same ids and
# DIDs the IdentityHub seed uses) into that registry.
#
# POST /v1alpha/participants/{ctx}/holders is NOT in
# jad/openapi/issuer-admin-api.yaml. The operation exists and validates a
# body: probed with {} and got 400 "Missing required creator property
# 'holderId'". Second vendored-spec operation found missing today, after
# POST /v1alpha/participants on the Identity API.
#
# Idempotent: an existing holder answers 409 and is treated as success.
# ---------------------------------------------------------------------------
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

ISSUER_API="${EDC_ISSUER_URL:-http://localhost:10013/api/admin}"
ISSUER_CTX="${ISSUER_CTX:-issuer}"
MGMT_API="${EDC_MANAGEMENT_URL:-http://localhost:11003/api/mgmt}"
MGMT_V_CANDIDATES="${EDC_MGMT_API_VERSION_CANDIDATES:-v5beta v5alpha v4alpha v3}"
KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8080}"
REALM="${KEYCLOAK_REALM:-edcv}"
CLIENT_ID="${EDC_CLIENT_ID:-admin}"
CLIENT_SECRET="${EDC_CLIENT_SECRET:-edc-v-admin-secret}"

CYAN='\033[0;36m'; GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[0;33m'; NC='\033[0m'
log() { echo -e "${CYAN}[holder-seed]${NC} $*"; }

TOKEN=$(curl -sS --max-time 20 -X POST \
  "${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}" \
  2>/dev/null | python3 -c "import json,sys; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null || true)
if [ -z "$TOKEN" ]; then
  echo -e "${RED}ERROR${NC}: no Keycloak token from ${KEYCLOAK_URL}/realms/${REALM}." >&2
  exit 1
fi

# Who does the control plane know? Same source the IdentityHub seed mirrors,
# so all three stores carry the same DIDs.
PAIRS=""
for v in $MGMT_V_CANDIDATES; do
  cp_body=$(curl -sS --max-time 20 -H "Authorization: Bearer ${TOKEN}" \
    "${MGMT_API}/${v}/participants" 2>/dev/null) || continue
  PAIRS=$(printf '%s' "$cp_body" | python3 "${SCRIPT_DIR}/lib/cp-participant-pairs.py" 2>/dev/null) || PAIRS=""
  [ -n "$PAIRS" ] && { log "mirroring $(printf '%s\n' "$PAIRS" | grep -c .) participant(s) from the control plane (${v})"; break; }
done
if [ -z "$PAIRS" ]; then
  echo -e "${RED}ERROR${NC}: the control plane lists no participants, so there is nothing to register." >&2
  echo "  Run scripts/azure/05-cp-participants.sh first." >&2
  exit 1
fi

created=0; existed=0; failed=0
while read -r ctx did; do
  [ -n "$ctx" ] && [ -n "$did" ] || continue
  name="${did##*:}"
  body=$(python3 -c 'import json,sys; print(json.dumps({"holderId": sys.argv[1], "did": sys.argv[1], "name": sys.argv[2]}))' "$did" "$name")
  tmp=$(mktemp)
  status=$(curl -sS --max-time 30 -o "$tmp" -w '%{http_code}' \
    -X POST "${ISSUER_API}/v1alpha/participants/${ISSUER_CTX}/holders" \
    -H "Authorization: Bearer ${TOKEN}" -H "Content-Type: application/json" \
    -d "$body" 2>/dev/null) || status="000"
  detail=$(head -c 300 "$tmp" 2>/dev/null || true); rm -f "$tmp"
  case "$status" in
    2??) echo -e "  ${GREEN}+${NC} ${did}"; created=$((created + 1)) ;;
    409) echo -e "  ${YELLOW}=${NC} ${did} already registered"; existed=$((existed + 1)) ;;
    *)   echo -e "  ${RED}x${NC} ${did}: HTTP ${status} ${detail}"; failed=$((failed + 1)) ;;
  esac
done <<EOF
$PAIRS
EOF
log "registered ${created}, already present ${existed}, failed ${failed}"

# Read back: every mirrored DID must now be a known holder (ADR-031).
known=$(curl -sS --max-time 20 -X POST -H "Authorization: Bearer ${TOKEN}" -H "Content-Type: application/json" -d '{}' \
  "${ISSUER_API}/v1alpha/participants/${ISSUER_CTX}/holders/query" 2>/dev/null \
  | python3 -c "import json,sys
try: print('\n'.join(h.get('did','') for h in json.load(sys.stdin)))
except Exception: pass" 2>/dev/null || true)
missing=0
while read -r _ctx did; do
  [ -n "$did" ] || continue
  printf '%s\n' "$known" | grep -qxF "$did" || { echo -e "  ${RED}!${NC} ${did} is not in the holders registry after seeding"; missing=$((missing + 1)); }
done <<EOF
$PAIRS
EOF

if [ "$failed" -gt 0 ] || [ "$missing" -gt 0 ]; then
  echo -e "${RED}FAIL${NC}: ${failed} create(s) failed, ${missing} holder(s) missing on read-back." >&2
  exit 1
fi
echo -e "${GREEN}OK${NC}: the issuer knows every control-plane participant as a holder"
