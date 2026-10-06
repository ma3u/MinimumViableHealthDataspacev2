#!/bin/sh
# =============================================================================
# Runs INSIDE the ACA environment, as the job seed-issuer-identity-azure.sh
# creates. Gives the 0.18 IssuerService its identity (ADR-055, #503).
# =============================================================================
# The Azure port of what compose and CI do in jad/bootstrap-vault.sh,
# jad/seed-jad.sh steps 2 to 4 and scripts/seed-issuer-identity.sh, with the
# DID and endpoints on mvhd-issuerservice and a key generated here rather than
# the compose key, which is in the repository.
#
#   1. the signing key, in Vault under participants/issuer/ and secret/
#      (generated once; a later run reads it back);
#   2. the participant context, through the identity API on 10015;
#   3. the activation records (keypair, DID document, state 300), the SQL of
#      jad/seed-issuer-identity.sql with the key's x substituted;
#   4. the attestation and credential definitions of jad/seed-jad.sh;
#   5. MODE=verify only: the DID document must resolve with a key. It does so
#      only after the IssuerService restarted and loaded steps 2 and 3, which
#      the wrapper does between the two runs.
#
# Runs on public alpine:3.19 (the maintainer account cannot read the ACR
# admin password a private image would need) and installs its tools first.
# Every step is idempotent: 409 and "present" count as done.
# Environment (from the job definition): MODE, ISSUER_HOST, VAULT_URL,
# VAULT_TOKEN (secret), KC_URL, PROVISIONER_SECRET (secret), ISSUER_SECRET
# (secret), PG_HOST, PG_USER, PG_PASSWORD (secret), PG_DB, SQL_B64.
set -eu
apk add --no-cache curl jq openssl postgresql-client >/dev/null 2>&1 || { echo "FAIL could not install curl, jq, openssl, psql"; sleep 60; exit 1; }

FAILED=0
step() { echo ""; echo "=== $1 ==="; }
fail() { echo "  FAIL  $*"; FAILED=$((FAILED + 1)); }
finish() {
  rc=$?
  echo ""
  if [ "$rc" -eq 0 ] && [ "$FAILED" -eq 0 ]; then
    echo "=== issuer identity: OK (${MODE}) ==="
  else
    echo "=== issuer identity: FAILED (${FAILED} step(s), exit ${rc}) ==="
    rc=1
  fi
  sleep 60   # az containerapp job logs show only streams while the replica runs
  exit "$rc"
}
trap finish EXIT

DID="did:web:${ISSUER_HOST}%3A10016:issuer"
KID="${DID}#key-1"
ENC=$(jq -rn --arg s "$KID" '$s|@uri')
# The name EDC reads is the URL-encoded alias itself: its Vault client encodes
# the alias, and its HTTP client then encodes the '%' again, so Vault stores
# and looks up the literal "did%3Aweb%3A...%23key-1" (jad/bootstrap-vault.sh
# writes it with the CLI, which does the same). Over curl the path has to be
# encoded twice to arrive as that name; once was the first version of this job,
# which stored the plain alias, and the IssuerService could not find its key
# to sign with ("Private key ... not found", #503, 2026-10-06).
ENC2=$(jq -rn --arg s "$ENC" '$s|@uri')
ISS="http://${ISSUER_HOST}"

vault() {  # vault <METHOD> <path> [body-file]
  if [ -n "${3:-}" ]; then
    curl -s -o /tmp/v.json -w '%{http_code}' -X "$1" "${VAULT_URL}/v1$2" \
      -H "X-Vault-Token: ${VAULT_TOKEN}" -H "Content-Type: application/json" --data @"$3"
  else
    curl -s -o /tmp/v.json -w '%{http_code}' -X "$1" "${VAULT_URL}/v1$2" -H "X-Vault-Token: ${VAULT_TOKEN}"
  fi
}
b64url() { base64 | tr -d '\n=' | tr '+/' '-_'; }

# --- 1. Signing key ----------------------------------------------------------
step "Signing key ${KID}"
# The key the issuer already has is kept: its public half is in the DID
# document and the activation records. Looked up under the right name first,
# then under the plain alias the first version of this job wrote.
if [ "$(vault GET "/participants/data/issuer/${ENC2}")" = 200 ]; then
  JWK=$(jq -r '.data.data.content' /tmp/v.json)
  echo "  kept  participants/issuer/<kid> (present)"
elif [ "$(vault GET "/participants/data/issuer/${ENC}")" = 200 ]; then
  JWK=$(jq -r '.data.data.content' /tmp/v.json)
  echo "  kept  the key stored under the plain alias; writing it under the name EDC reads"
else
  openssl genpkey -algorithm ed25519 -out /tmp/k.pem 2>/dev/null
  D=$(openssl pkey -in /tmp/k.pem -outform DER | tail -c 32 | b64url)
  X=$(openssl pkey -in /tmp/k.pem -pubout -outform DER | tail -c 32 | b64url)
  rm -f /tmp/k.pem
  JWK=$(jq -cn --arg kid "$KID" --arg d "$D" --arg x "$X" '{kty:"OKP",crv:"Ed25519",kid:$kid,d:$d,x:$x}')
  echo "  new   Ed25519 key generated in this job"
fi
X=$(printf '%s' "$JWK" | jq -r .x)
jq -n --arg c "$JWK" '{data:{content:$c}}' > /tmp/body.json
for mount in participants/data/issuer secret/data; do
  code=$(vault POST "/${mount}/${ENC2}" /tmp/body.json) || code=000
  case "$code" in 2??) echo "  ok    ${mount}/<kid>" ;; *) fail "${mount}/<kid> (HTTP ${code}) $(head -c 200 /tmp/v.json)" ;; esac
done
rm -f /tmp/body.json
echo "  public x: ${X}"

# --- Tokens --------------------------------------------------------------------
token() {  # token <client> <secret> [scope]
  curl -s -m 20 -X POST "${KC_URL}/realms/edcv/protocol/openid-connect/token" \
    --data-urlencode grant_type=client_credentials --data-urlencode "client_id=$1" \
    --data-urlencode "client_secret=$2" ${3:+--data-urlencode "scope=$3"} | jq -r '.access_token // empty'
}
PROV=$(token provisioner "$PROVISIONER_SECRET")
ISSUER_TOKEN=$(token issuer "$ISSUER_SECRET" issuer-admin-api:write)
[ -n "$PROV" ] || fail "no provisioner token from ${KC_URL}"
[ -n "$ISSUER_TOKEN" ] || fail "no issuer token from ${KC_URL}"

# --- 2. Participant context ----------------------------------------------------
step "Participant context 'issuer'"
jq -n --arg did "$DID" --arg kid "$KID" --arg x "$X" --arg iss "$ISS" \
  --arg secret "$ISSUER_SECRET" --arg kc "$KC_URL" --arg vault "$VAULT_URL" '{
  roles: ["admin"],
  serviceEndpoints: [{type: "IssuerService", id: "issuer-service-1",
    serviceEndpoint: ($iss + ":10012/api/issuance/v1alpha/participants/issuer")}],
  active: true, participantContextId: "issuer", did: $did,
  key: {keyId: $kid, privateKeyAlias: $kid, type: "JsonWebKey2020",
    publicKeyJwk: {kty: "OKP", crv: "Ed25519", kid: $kid, x: $x},
    usage: ["sign_credentials", "sign_token", "sign_presentation"]},
  additionalProperties: {"edc.vault.hashicorp.config": {
    credentials: {clientId: "issuer", clientSecret: $secret,
      tokenUrl: ($kc + "/realms/edcv/protocol/openid-connect/token")},
    config: {secretPath: "v1/participants", folderPath: "issuer", vaultUrl: $vault}}}
}' > /tmp/manifest.json
code=$(curl -s -m 30 -o /tmp/r.json -w '%{http_code}' -X POST "${ISS}:10015/api/identity/v1alpha/participants" \
  -H "Authorization: Bearer ${PROV}" -H "Content-Type: application/json" --data @/tmp/manifest.json) || code=000
rm -f /tmp/manifest.json
case "$code" in
  2??) echo "  ok    created" ;;
  409) echo "  kept  already present" ;;
  *) fail "HTTP ${code} $(head -c 300 /tmp/r.json)" ;;
esac

# --- 3. Activation records -----------------------------------------------------
step "Activation records in ${PG_DB}"
if printf '%s' "$SQL_B64" | base64 -d | sed "s/__X__/${X}/g" |
   PGPASSWORD="$PG_PASSWORD" psql -v ON_ERROR_STOP=1 -q \
     "host=${PG_HOST} port=5432 dbname=${PG_DB} user=${PG_USER} sslmode=require" > /tmp/sql.out 2>&1; then
  sed 's/^/  /' /tmp/sql.out | tail -5
else
  fail "SQL: $(tail -5 /tmp/sql.out)"
fi

# --- 4. Attestation and credential definitions ---------------------------------
step "Attestation and credential definitions"
admin_post() {  # admin_post <resource> <json>
  code=$(curl -s -m 20 -o /tmp/r.json -w '%{http_code}' -X POST \
    "${ISS}/api/admin/v1alpha/participants/issuer/$1" \
    -H "Authorization: Bearer ${ISSUER_TOKEN}" -H "Content-Type: application/json" -d "$2") || code=000
  case "$code" in
    2??) echo "  ok    $1 $(printf '%s' "$2" | jq -r .id)" ;;
    409) echo "  kept  $1 $(printf '%s' "$2" | jq -r .id)" ;;
    *) fail "$1 (HTTP ${code}) $(head -c 200 /tmp/r.json)" ;;
  esac
}
admin_post attestations '{"attestationType":"membership","configuration":{},"id":"membership-attestation-def-1"}'
admin_post attestations '{"attestationType":"manufacturer","configuration":{},"id":"manufacturer-attestation-def-1"}'
admin_post credentialdefinitions '{"attestations":["membership-attestation-def-1"],"credentialType":"MembershipCredential","id":"membership-credential-def","jsonSchema":"{}","jsonSchemaUrl":"https://example.com/schema/membership-credential.json","mappings":[{"input":"membership","output":"credentialSubject.membership","required":true},{"input":"membershipType","output":"credentialSubject.membershipType","required":"true"},{"input":"membershipStartDate","output":"credentialSubject.membershipStartDate","required":true}],"rules":[],"format":"VC1_0_JWT","validity":"604800"}'
admin_post credentialdefinitions '{"attestations":["manufacturer-attestation-def-1"],"credentialType":"ManufacturerCredential","id":"manufacturer-credential-def","jsonSchema":"{}","jsonSchemaUrl":"https://example.com/schema/manufacturer-credential.json","mappings":[{"input":"contractVersion","output":"credentialSubject.contractVersion","required":true},{"input":"component_types","output":"credentialSubject.part_types","required":"true"},{"input":"since","output":"credentialSubject.since","required":true}],"rules":[],"format":"VC1_0_JWT","validity":"604800"}'

# --- 5. Read-back --------------------------------------------------------------
if [ "$MODE" = verify ]; then
  step "DID document ${ISS}:10016/issuer/did.json"
  vm=$(curl -s -m 15 "${ISS}:10016/issuer/did.json" | jq --arg did "$DID" \
    'if .id == $did then (.verificationMethod | length) else 0 end' 2>/dev/null || echo 0)
  if [ "${vm:-0}" -ge 1 ]; then echo "  ok    resolves with ${vm} verification method(s)"; else fail "does not resolve with a key (got ${vm:-0})"; fi
fi
