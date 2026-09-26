#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Give the IssuerService the identity it has locally and never had in CI. #345
# ---------------------------------------------------------------------------
# CI's IssuerService answered every admin write with 401 for the `issuer`
# client and 404 "IdentityHubParticipantContext with ID=issuer was not found"
# for `admin`. Same fresh stack, one token accepted and one rejected, so not a
# key race: the `issuer` token's participant_context_id pointed at a context
# that did not exist. ISS-4.1 "readiness passed" had been a liveness pass on a
# service with no identity for as long as the workflow has existed.
#
# Locally scripts/bootstrap-jad.sh provides that identity in three pieces:
#
#   1. the signing key      jad/bootstrap-vault.sh, via the vault-bootstrap
#                           sidecar, at participants/issuer/<url-encoded alias>
#   2. the participant      jad/seed-jad.sh Step 2, POST to the issuer's own
#      context              identity API on 10015 from inside the network
#   3. activation           jad/seed-issuer-identity.sql, then a restart, because
#                           the API create "does not always complete the full
#                           activation lifecycle" (the SQL's own words)
#
# jad-seed cannot simply run here: it is `set -e` and waits for the CFM
# TenantManager and ProvisionManager, which a standard runner does not have.
# So this reproduces Step 2 and Phase 8. The manifest below is a copy of the
# one in jad/seed-jad.sh; keep the two in sync, the way 05-cp-participants.sh
# and edc-seed-cp-participants.yml do.
#
# Read-back (ADR-031): the issuer's DID document must resolve from inside the
# network with a verification method. Token acceptance is checked by the step
# that follows in compliance.yml, scripts/lib/wait-for-issuer-auth.sh.
#
# SKIP_RESTART=1 skips piece 3's restart, for validating against a live local
# stack without interrupting it.
# ---------------------------------------------------------------------------
set -euo pipefail

KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8080}"
REALM="${KEYCLOAK_REALM:-edcv}"
NET="${COMPOSE_NETWORK:-health-dataspace-edcv}"
PG_CONTAINER="${PG_CONTAINER:-health-dataspace-postgres}"
ISSUER_CONTAINER="${ISSUER_CONTAINER:-health-dataspace-issuerservice}"
VAULT_BOOTSTRAP_CONTAINER="${VAULT_BOOTSTRAP_CONTAINER:-health-dataspace-vault-bootstrap}"
ISSUER_READY_URL="${ISSUER_READY_URL:-http://localhost:10013/api/check/readiness}"
ISSUER_CLIENT_ID="${ISSUER_CLIENT_ID:-issuer}"
ISSUER_CLIENT_SECRET="${ISSUER_CLIENT_SECRET:-issuer-secret}"
CURL_IMAGE="${CURL_IMAGE:-curlimages/curl:latest}"
SKIP_RESTART="${SKIP_RESTART:-0}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

CYAN='\033[0;36m'; GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[0;33m'; NC='\033[0m'
log()  { echo -e "${CYAN}[issuer-identity]${NC} $*"; }
die()  { echo -e "${RED}FAIL${NC}: $*" >&2; exit 1; }
incurl() { docker run --rm -i --network "$NET" "$CURL_IMAGE" "$@"; }

# --- 1. The signing key: wait for the sidecar that writes it -----------------
log "waiting for ${VAULT_BOOTSTRAP_CONTAINER} to report success"
# Not `docker logs | grep -q`: under pipefail, grep -q closing the pipe early
# gives docker logs a SIGPIPE and the pipeline a non-zero status, so the very
# line we are looking for makes the check fail. Capture, then match.
deadline=$(( $(date +%s) + 120 )); ok=0
while [ "$(date +%s)" -lt "$deadline" ]; do
  logs=$(docker logs "$VAULT_BOOTSTRAP_CONTAINER" 2>&1 || true)
  case "$logs" in *"Vault bootstrap completed successfully"*) ok=1; break ;; esac
  sleep 5
done
if [ "$ok" -ne 1 ]; then
  docker logs "$VAULT_BOOTSTRAP_CONTAINER" --tail 15 2>&1 | sed 's/^/    /' >&2 || true
  die "the Vault bootstrap sidecar never reported success, so the issuer has no signing key"
fi
log "issuer signing key provisioned by ${VAULT_BOOTSTRAP_CONTAINER}"

# --- 2. The participant context, from inside the network ---------------------
TOKEN=$(curl -sS --max-time 20 -X POST "${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&client_id=provisioner&client_secret=provisioner-secret" \
  2>/dev/null | python3 -c "import json,sys; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null || true)
[ -n "$TOKEN" ] || die "no provisioner token from ${KEYCLOAK_URL}/realms/${REALM}"

# Copy of jad/seed-jad.sh Step 2. The public key x matches the private JWK
# bootstrap-vault.sh stores under the same alias.
MANIFEST=$(cat <<JSON
{
  "roles": ["admin"],
  "serviceEndpoints": [{
    "type": "IssuerService",
    "serviceEndpoint": "http://issuerservice:10012/api/issuance/v1alpha/participants/issuer",
    "id": "issuer-service-1"
  }],
  "active": true,
  "participantContextId": "issuer",
  "did": "did:web:issuerservice%3A10016:issuer",
  "key": {
    "keyId": "did:web:issuerservice%3A10016:issuer#key-1",
    "privateKeyAlias": "did:web:issuerservice%3A10016:issuer#key-1",
    "publicKeyJwk": {
      "kty": "OKP", "crv": "Ed25519",
      "kid": "did:web:issuerservice%3A10016:issuer#key-1",
      "x": "I8dt08pwP4nQPv4MacRU5u5KsroVa3ESkWmyQEDn36A"
    },
    "type": "JsonWebKey2020",
    "usage": ["sign_credentials", "sign_token", "sign_presentation"]
  },
  "additionalProperties": {
    "edc.vault.hashicorp.config": {
      "credentials": {
        "clientId": "${ISSUER_CLIENT_ID}",
        "clientSecret": "${ISSUER_CLIENT_SECRET}",
        "tokenUrl": "http://keycloak:8080/realms/edcv/protocol/openid-connect/token"
      },
      "config": {
        "secretPath": "v1/participants",
        "folderPath": "${ISSUER_CLIENT_ID}",
        "vaultUrl": "http://vault:8200"
      }
    }
  }
}
JSON
)
out=$(printf '%s' "$MANIFEST" | incurl -sS --max-time 30 -o /dev/stderr -w '%{http_code}' \
  -X POST "http://issuerservice:10015/api/identity/v1alpha/participants" \
  -H "Authorization: Bearer ${TOKEN}" -H "Content-Type: application/json" -d @- 2>/tmp/issuer-identity.body) || out="000"
body=$(head -c 300 /tmp/issuer-identity.body 2>/dev/null || true); rm -f /tmp/issuer-identity.body
case "$out" in
  2??) log "issuer participant context created" ;;
  409) log "issuer participant context already present" ;;
  *)   die "creating the issuer participant context: HTTP ${out} ${body}" ;;
esac

# --- 3. Activation records, then a restart to load them ----------------------
log "applying jad/seed-issuer-identity.sql"
docker exec -i "$PG_CONTAINER" psql -v ON_ERROR_STOP=1 -q -U issuer -d issuerservice \
  < "${REPO_DIR}/jad/seed-issuer-identity.sql" \
  || die "seed-issuer-identity.sql did not apply cleanly"
if [ "$SKIP_RESTART" = "1" ]; then
  echo -e "  ${YELLOW}~${NC} SKIP_RESTART=1: not restarting ${ISSUER_CONTAINER}"
else
  log "restarting ${ISSUER_CONTAINER} to load the identity"
  docker restart "$ISSUER_CONTAINER" >/dev/null
  deadline=$(( $(date +%s) + 120 )); ok=0
  while [ "$(date +%s)" -lt "$deadline" ]; do
    curl -sf --max-time 5 "$ISSUER_READY_URL" >/dev/null 2>&1 && { ok=1; break; }
    sleep 5
  done
  [ "$ok" -eq 1 ] || die "${ISSUER_CONTAINER} did not become ready at ${ISSUER_READY_URL} after restart"
fi

# --- Read-back: the DID document must resolve, with a key in it --------------
vm=$(incurl -sS --max-time 15 "http://issuerservice:10016/issuer/did.json" 2>/dev/null \
  | python3 -c "import json,sys
try: d=json.load(sys.stdin); print(len(d.get('verificationMethod',[])) if d.get('id')=='did:web:issuerservice%3A10016:issuer' else 0)
except Exception: print(0)" 2>/dev/null || echo 0)
[ "${vm:-0}" -ge 1 ] || die "did:web:issuerservice%3A10016:issuer does not resolve with a verification method (got ${vm})"
echo -e "${GREEN}OK${NC}: the issuer has an identity; its DID document resolves with ${vm} verification method(s)"
