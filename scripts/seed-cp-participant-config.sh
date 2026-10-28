#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Give each control-plane participant context the config CFM would write
# ---------------------------------------------------------------------------
# #710. A participant context is not enough for DSP. Before the control plane
# sends a DSP message for a participant it fetches that participant's
# self-issued token from the IdentityHub's STS, and the client id, token URL
# and secret alias for that come from the context's config
# (PUT <v>/participants/{id}/config). Locally the CFM EDC-V agent writes it;
# CI creates its contexts with scripts/azure/05-cp-participants.sh, which
# cannot, so every outbound DSP call there died at
#
#   500  EdcException: No configuration found for participant context <ctx>
#
# That is why CI never had a DSP path: CAT-1.1 failed for every participant,
# Bruno's "10 Connecting partner/16" answered 502 and TRUST-6.3 to 6.5 skipped.
#
# The secret itself needs no copying here. The IdentityHub, creating a
# participant without a per-participant Vault config, stores its STS client
# secret at secret/<ctx>-sts-client-secret on the shared Vault, which is the
# alias written below and the mount the control plane reads (measured on the
# local stack, 2026-10-28). When the Vault container is reachable this checks
# that the secret is there, because a config pointing at nothing fails later
# with a message about the vault rather than about the seed.
#
# Never overwrites: a context that already has a config (CFM's carries a
# private per-participant Vault config as well) is left alone. Run it after
# scripts/seed-identityhub-participants.sh, which creates the secret.
#
# Env:
#   KEYCLOAK_URL        default http://localhost:8080
#   EDC_MANAGEMENT_URL  default http://localhost:11003/api/mgmt
#   STS_TOKEN_URL       default http://identityhub:7084/api/sts/token, the
#                       IdentityHub's STS as the control plane reaches it
#   VAULT_CONTAINER     default health-dataspace-vault; the secret check is
#                       skipped when it is not running
# ---------------------------------------------------------------------------
set -euo pipefail

KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8080}"
EDC_MANAGEMENT_URL="${EDC_MANAGEMENT_URL:-http://localhost:11003/api/mgmt}"
MGMT_V="${EDC_MGMT_API_VERSION:-v5beta}"
STS_TOKEN_URL="${STS_TOKEN_URL:-http://identityhub:7084/api/sts/token}"
VAULT_CONTAINER="${VAULT_CONTAINER:-health-dataspace-vault}"
VAULT_TOKEN="${VAULT_TOKEN:-root}"
EDC_CTX="https://w3id.org/edc/connector/management/v2"

CYAN='\033[0;36m'; GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[0;33m'; NC='\033[0m'
log() { echo -e "${CYAN}[cp-config]${NC} $*"; }

# provisioner, as for creating the contexts: the control plane refuses
# participant-context writes from `admin` (05-cp-participants.sh, #316).
TOKEN=$(curl -sS --max-time 20 -X POST "${KEYCLOAK_URL}/realms/edcv/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&client_id=provisioner&client_secret=provisioner-secret" 2>/dev/null \
  | jq -r '.access_token // empty' 2>/dev/null || true)
if [ -z "$TOKEN" ]; then
  echo -e "${RED}ERROR${NC}: no provisioner token from ${KEYCLOAK_URL}" >&2
  exit 1
fi
MGMT="${EDC_MANAGEMENT_URL}/${MGMT_V}"

contexts=$(curl -sS --max-time 20 -H "Authorization: Bearer ${TOKEN}" "${MGMT}/participants" \
  | jq -r '.[] | select(.identity // "" | startswith("did:")) | "\(."@id") \(.identity)"') \
  || { echo -e "${RED}ERROR${NC}: could not list the participant contexts at ${MGMT}" >&2; exit 1; }

vault_up=0
if command -v docker >/dev/null 2>&1 \
  && [ "$(docker inspect -f '{{.State.Running}}' "$VAULT_CONTAINER" 2>/dev/null)" = "true" ]; then
  vault_up=1
fi

written=0; present=0; failed=0
while read -r ctx did; do
  [ -n "$ctx" ] || continue
  has=$(curl -sS --max-time 20 -H "Authorization: Bearer ${TOKEN}" "${MGMT}/participants/${ctx}/config" 2>/dev/null \
    | jq -r '.entries["edc.iam.sts.oauth.client.id"] // empty' 2>/dev/null || true)
  if [ -n "$has" ]; then
    echo -e "  ${YELLOW}=${NC} ${did} has a config"
    present=$((present + 1))
    continue
  fi

  alias="${ctx}-sts-client-secret"
  if [ "$vault_up" -eq 1 ] && ! docker exec -e "VAULT_TOKEN=${VAULT_TOKEN}" "$VAULT_CONTAINER" \
      vault kv get -field=content "secret/${alias}" >/dev/null 2>&1; then
    echo -e "  ${RED}x${NC} ${did}: no STS client secret at secret/${alias}; is it in the IdentityHub (seed-identityhub-participants.sh)?"
    failed=$((failed + 1))
    continue
  fi

  body=$(jq -n --arg c "$EDC_CTX" --arg did "$did" --arg url "$STS_TOKEN_URL" --arg alias "$alias" '{
    "@context": [$c], "@type": "ParticipantContextConfig",
    entries: {
      "edc.participant.id": $did,
      "edc.iam.issuer.id": $did,
      "edc.iam.sts.oauth.client.id": $did,
      "edc.iam.sts.oauth.token.url": $url,
      "edc.iam.sts.oauth.client.secret.alias": $alias
    },
    privateEntries: {}
  }')
  tmp=$(mktemp)
  code=$(curl -sS --max-time 20 -o "$tmp" -w '%{http_code}' -X PUT \
    -H "Authorization: Bearer ${TOKEN}" -H "Content-Type: application/json" \
    -d "$body" "${MGMT}/participants/${ctx}/config" 2>/dev/null) || code="000"
  detail=$(head -c 300 "$tmp" 2>/dev/null || true); rm -f "$tmp"
  if [[ "$code" == 2?? ]]; then
    echo -e "  ${GREEN}+${NC} ${did}"
    written=$((written + 1))
  else
    echo -e "  ${RED}x${NC} ${did}: HTTP ${code} ${detail}"
    failed=$((failed + 1))
  fi
done <<EOF
$contexts
EOF

log "written ${written}, already present ${present}, failed ${failed}"

# Read back (ADR-031): every context must now name its STS client.
missing=0
while read -r ctx did; do
  [ -n "$ctx" ] || continue
  has=$(curl -sS --max-time 20 -H "Authorization: Bearer ${TOKEN}" "${MGMT}/participants/${ctx}/config" 2>/dev/null \
    | jq -r '.entries["edc.iam.sts.oauth.client.id"] // empty' 2>/dev/null || true)
  [ -n "$has" ] || { echo -e "  ${RED}!${NC} ${did} still has no config"; missing=$((missing + 1)); }
done <<EOF
$contexts
EOF

if [ "$failed" -gt 0 ] || [ "$missing" -gt 0 ]; then
  echo -e "${RED}FAIL${NC}: ${missing} participant context(s) without a config; DSP calls for them answer 500." >&2
  exit 1
fi
echo -e "${GREEN}OK${NC}: every participant context can fetch its STS token"
