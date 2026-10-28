#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Give a test IssuerService an identity and let it issue MembershipCredential.
# #710, ADR-064.
# ---------------------------------------------------------------------------
# The hub trusts each issuer for the credential types it may issue
# (edc.iam.trustedissuer.<alias>.supportedtypes on the control plane). Two
# test issuers exercise that, each a second IssuerService from the same image
# (docker-compose.jad.yml), because one IssuerService allows each credential
# type only once:
#
#   simpl-ga-issuer  a fictional Simpl Governance Authority ("Simpl test data
#                    space"), trusted for MembershipCredential
#   rogue-issuer     an issuer on no trust list (compose profile trust-check)
#
# This script, for one of them: creates its database if the Postgres volume
# predates it, starts the container, creates the participant context with a
# generated Ed25519 key (no SQL activation needed, unlike the hub's issuer,
# whose key is fixed), defines the membership attestation and credential, and
# registers the holders. Then the holder requests the credential over DCP with
# scripts/request-participant-credentials.sh.
#
# The key goes to Vault under the hub issuer's folder (participants/issuer/,
# alias <did>#key-1): the Vault policy gives each Keycloak client its own
# folder, and a test authority does not get a client of its own in the realm.
#
#   SERVICE=simpl-ga-issuer CTX=simpl-ga DB=simplga ADMIN_PORT=10023 \
#     HOLDERS="did:web:identityhub%3A7083:irs" scripts/seed-test-issuer.sh
#
# COMPOSE_FILES lists the compose files the stack was started from (default
# "docker-compose.yml docker-compose.jad.yml"; CI uses the second only).
#
# Read-back (ADR-031): the DID document resolves with a key, and the issuer
# lists every holder and a MembershipCredential definition.
# ---------------------------------------------------------------------------
set -euo pipefail

SERVICE="${SERVICE:?SERVICE, e.g. simpl-ga-issuer}"
CTX="${CTX:?CTX, e.g. simpl-ga}"
DB="${DB:?DB, e.g. simplga}"
ADMIN_PORT="${ADMIN_PORT:?ADMIN_PORT, e.g. 10023}"
HOLDERS="${HOLDERS:-}"
PROFILE="${PROFILE:-}"
KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8080}"
REALM="${KEYCLOAK_REALM:-edcv}"
NET="${COMPOSE_NETWORK:-health-dataspace-edcv}"
PG_CONTAINER="${PG_CONTAINER:-health-dataspace-postgres}"
PG_SUPERUSER="${PG_SUPERUSER:-cp}"
CURL_IMAGE="${CURL_IMAGE:-curlimages/curl:latest}"
WAIT_SECONDS="${WAIT_SECONDS:-300}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
# The project the running stack was started under, so `up` joins it rather
# than starting a second stack beside it.
COMPOSE_PROJECT="${COMPOSE_PROJECT:-$(docker inspect "$PG_CONTAINER" \
  --format '{{index .Config.Labels "com.docker.compose.project"}}' 2>/dev/null || true)}"

HOST="$SERVICE"
DID="did:web:${HOST}%3A10016:${CTX}"
CONTAINER="health-dataspace-${SERVICE}"
ADMIN="http://localhost:${ADMIN_PORT}/api/admin/v1alpha/participants/${CTX}"

CYAN='\033[0;36m'; GREEN='\033[0;32m'; RED='\033[0;31m'; NC='\033[0m'
log() { echo -e "${CYAN}[test-issuer ${CTX}]${NC} $*"; }
die() { echo -e "${RED}FAIL${NC}: $*" >&2; exit 1; }
incurl() { docker run --rm -i --network "$NET" "$CURL_IMAGE" "$@"; }
token() {
  curl -sS --max-time 20 -X POST "${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/token" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "grant_type=client_credentials&client_id=$1&client_secret=$2" 2>/dev/null \
    | python3 -c "import json,sys; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null || true
}

# --- 1. The database, for a volume initialised before jad/init-postgres.sql had it
if docker exec "$PG_CONTAINER" psql -U "$PG_SUPERUSER" -d controlplane -tAc \
     "select 1 from pg_database where datname='${DB}'" | grep -q 1; then
  log "database ${DB} present"
else
  docker exec "$PG_CONTAINER" psql -U "$PG_SUPERUSER" -d controlplane -v ON_ERROR_STOP=1 -q \
    -c "CREATE DATABASE ${DB}" -c "CREATE USER ${DB} WITH PASSWORD '${DB}'" \
    -c "GRANT ALL PRIVILEGES ON DATABASE ${DB} TO ${DB}" >/dev/null \
    && docker exec "$PG_CONTAINER" psql -U "$PG_SUPERUSER" -d "$DB" -v ON_ERROR_STOP=1 -q \
      -c "GRANT ALL ON SCHEMA public TO ${DB}" >/dev/null \
    || die "could not create database ${DB}"
  log "database ${DB} created"
fi

# --- 2. The container ---------------------------------------------------------
# CI starts the stack from docker-compose.jad.yml alone; locally it is both.
compose=(docker compose)
for f in ${COMPOSE_FILES:-docker-compose.yml docker-compose.jad.yml}; do compose+=(-f "${REPO_DIR}/${f}"); done
[ -n "$COMPOSE_PROJECT" ] && compose+=(-p "$COMPOSE_PROJECT")
[ -n "$PROFILE" ] && compose+=(--profile "$PROFILE")
"${compose[@]}" up -d --no-deps "$SERVICE" >/dev/null 2>&1 || die "docker compose could not start ${SERVICE}"
deadline=$(( $(date +%s) + WAIT_SECONDS ))
until [ "$(docker inspect "$CONTAINER" --format '{{.State.Health.Status}}' 2>/dev/null)" = "healthy" ]; do
  [ "$(date +%s)" -lt "$deadline" ] || {
    docker logs --tail 30 "$CONTAINER" 2>&1 | sed 's/^/    /' >&2
    die "${CONTAINER} not healthy within ${WAIT_SECONDS}s"
  }
  sleep 5
done
log "${CONTAINER} healthy"

# --- 3. The participant context, with a key the service generates -------------
PTOKEN=$(token provisioner provisioner-secret)
[ -n "$PTOKEN" ] || die "no provisioner token from ${KEYCLOAK_URL}/realms/${REALM}"
manifest=$(python3 - "$DID" "$HOST" "$CTX" <<'PY'
import json, sys
did, host, ctx = sys.argv[1:4]
print(json.dumps({
    "roles": ["admin"],
    "serviceEndpoints": [{
        "type": "IssuerService",
        "serviceEndpoint": f"http://{host}:10012/api/issuance/v1alpha/participants/{ctx}",
        "id": "issuer-service-1",
    }],
    "active": True,
    "participantContextId": ctx,
    "did": did,
    "key": {
        "keyId": f"{did}#key-1",
        "privateKeyAlias": f"{did}#key-1",
        "keyGeneratorParams": {"algorithm": "EdDSA", "curve": "Ed25519"},
        "type": "JsonWebKey2020",
        "usage": ["sign_credentials", "sign_token", "sign_presentation"],
    },
    "additionalProperties": {"edc.vault.hashicorp.config": {
        "credentials": {
            "clientId": "issuer", "clientSecret": "issuer-secret",
            "tokenUrl": "http://keycloak:8080/realms/edcv/protocol/openid-connect/token",
        },
        "config": {"secretPath": "v1/participants", "folderPath": "issuer",
                   "vaultUrl": "http://vault:8200"},
    }},
}))
PY
)
status=$(printf '%s' "$manifest" | incurl -sS --max-time 30 -o /dev/null -w '%{http_code}' \
  -X POST "http://${HOST}:10015/api/identity/v1alpha/participants" \
  -H "Authorization: Bearer ${PTOKEN}" -H "Content-Type: application/json" -d @- 2>/dev/null) || status="000"
case "$status" in
  2??) log "participant context ${CTX} created" ;;
  409) log "participant context ${CTX} already present" ;;
  *)   die "creating the participant context ${CTX}: HTTP ${status}" ;;
esac

# --- 4. The membership attestation and credential definition -----------------
ATOKEN=$(token admin edc-v-admin-secret)
[ -n "$ATOKEN" ] || die "no admin token"
post() {
  local what="$1" body="$2" status
  status=$(curl -sS --max-time 30 -o /dev/null -w '%{http_code}' -X POST "${ADMIN}/${what}" \
    -H "Authorization: Bearer ${ATOKEN}" -H "Content-Type: application/json" -d "$body" 2>/dev/null) || status="000"
  case "$status" in
    2??|409) ;;
    *) die "POST ${what} on ${CTX}: HTTP ${status}" ;;
  esac
}
post attestations '{"attestationType":"membership","configuration":{},"id":"membership-attestation-def-1"}'
post credentialdefinitions '{
  "attestations": ["membership-attestation-def-1"],
  "credentialType": "MembershipCredential",
  "id": "membership-credential-def",
  "jsonSchema": "{}",
  "jsonSchemaUrl": "https://example.com/schema/membership-credential.json",
  "mappings": [
    {"input":"membership","output":"credentialSubject.membership","required":true},
    {"input":"membershipType","output":"credentialSubject.membershipType","required":"true"},
    {"input":"membershipStartDate","output":"credentialSubject.membershipStartDate","required":true}
  ],
  "rules": [],
  "format": "VC1_0_JWT",
  "validity": "604800"
}'
for holder in $HOLDERS; do
  post holders "$(python3 -c 'import json,sys; print(json.dumps({"holderId": sys.argv[1], "did": sys.argv[1], "name": sys.argv[1].rsplit(":",1)[-1]}))' "$holder")"
done

# --- Read-back ----------------------------------------------------------------
keys=$(incurl -sS --max-time 15 "http://${HOST}:10016/${CTX}/did.json" 2>/dev/null \
  | python3 -c "import json,sys
try: d=json.load(sys.stdin); print(len(d.get('verificationMethod',[])) if d.get('id')==sys.argv[1] else 0)
except Exception: print(0)" "$DID" 2>/dev/null || echo 0)
[ "${keys:-0}" -ge 1 ] || die "${DID} does not resolve with a verification method"
defs=$(curl -sS --max-time 20 -X POST "${ADMIN}/credentialdefinitions/query" -H "Authorization: Bearer ${ATOKEN}" \
  -H "Content-Type: application/json" -d '{}' 2>/dev/null \
  | python3 -c "import json,sys; print(sum(1 for d in json.load(sys.stdin) if d.get('credentialType')=='MembershipCredential'))" 2>/dev/null || echo 0)
[ "${defs:-0}" -ge 1 ] || die "${CTX} has no MembershipCredential definition"
known=$(curl -sS --max-time 20 -X POST "${ADMIN}/holders/query" -H "Authorization: Bearer ${ATOKEN}" \
  -H "Content-Type: application/json" -d '{}' 2>/dev/null \
  | python3 -c "import json,sys; print(' '.join(h.get('did','') for h in json.load(sys.stdin)))" 2>/dev/null || true)
for holder in $HOLDERS; do
  case " $known " in *" $holder "*) ;; *) die "${CTX} does not list holder ${holder}" ;; esac
done
echo -e "${GREEN}OK${NC}: ${DID} resolves with ${keys} key(s), issues MembershipCredential, holders: ${HOLDERS:-none}"
