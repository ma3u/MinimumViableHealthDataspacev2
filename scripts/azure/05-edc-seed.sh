#!/usr/bin/env bash
# =============================================================================
# Seed 5 EHDS ParticipantContexts into IdentityHub on Azure
# =============================================================================
# Mirrors `jad/seed-all.sh` phases 2-3 (participant + key-pair creation)
# against the ACA-internal IdentityHub. Idempotent: skips participants that
# already exist (POST returns 409, treated as OK).
#
# Auth: Keycloak realm `edcv` client_credentials grant against the `admin`
# client (same flow the neo4j-proxy uses for the TCK probe). IdentityHub
# validates the bearer token via EDC_IAM_OAUTH2_JWKS_URL.
#
# Usage (any environment with curl + python3 + jq):
#
#   IH=http://mvhd-identityhub:7082/api/identity              \
#   KC=https://auth.ehds.mabu.red                             \
#   KC_REALM=edcv                                             \
#   KC_CLIENT_ID=admin                                        \
#   KC_CLIENT_SECRET=edc-v-admin-secret                       \
#   bash scripts/azure/05-edc-seed.sh
#
# In CI: invoked from .github/workflows/edc-seed-participants.yml as a
# one-shot ACA Job (since IH is internal-only).
# =============================================================================
set -uo pipefail

IH="${IH:?IH must be set, e.g. http://mvhd-identityhub:7082/api/identity}"
KC="${KC:?KC must be set, e.g. https://auth.ehds.mabu.red}"
KC_REALM="${KC_REALM:-edcv}"
KC_CLIENT_ID="${KC_CLIENT_ID:-admin}"
KC_CLIENT_SECRET="${KC_CLIENT_SECRET:-edc-v-admin-secret}"

# Five participants, matching jad/seed-health-tenants.sh and the names the
# TCK probe iterates over in services/neo4j-proxy/src/index.ts.
PARTICIPANTS=(
  "alpha-klinik|did:web:alpha-klinik.de:participant"
  "pharmaco|did:web:pharmaco.de:research"
  "medreg|did:web:medreg.de:hdab"
  "lmc|did:web:lmc.nl:clinic"
  "irs|did:web:irs.fr:hdab"
)

log()  { printf '[seed] %s\n' "$*"; }
fail() { printf '[seed] ERROR: %s\n' "$*" >&2; exit 1; }

# ── 1. Wait for IH to answer ────────────────────────────────────────────────
log "Probing IH at $IH ..."
for i in $(seq 1 30); do
  CODE=$(curl -sS -o /dev/null -w '%{http_code}' "$IH/v1alpha/participants" || echo 000)
  if [ "$CODE" != "000" ]; then
    log "  IH responding (HTTP $CODE)"
    break
  fi
  log "  attempt $i: not yet, sleeping 5s"
  sleep 5
done
[ "$CODE" = "000" ] && fail "IH never responded at $IH"

# ── 2. Get an admin Bearer token ────────────────────────────────────────────
log "Requesting admin token from $KC/realms/$KC_REALM ..."
TOKEN=$(curl -sS -X POST \
  "$KC/realms/$KC_REALM/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&client_id=$KC_CLIENT_ID&client_secret=$KC_CLIENT_SECRET" \
  | python3 -c "import json,sys; t=json.load(sys.stdin); print(t.get('access_token',''))")

[ -z "$TOKEN" ] && fail "Could not obtain admin token from Keycloak"
log "  got token (${#TOKEN} chars)"

AUTHZ=(-H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json")

# ── 3. Seed each participant ────────────────────────────────────────────────
CREATED=0
SKIPPED=0
FAILED=0

for entry in "${PARTICIPANTS[@]}"; do
  PID="${entry%%|*}"
  DID="${entry##*|}"
  log "POST participant $PID  (did=$DID)"

  # KeyDescriptor schema (jad/openapi/identity-api.yaml): IH accepts EITHER
  # an explicit public key (publicKeyPem|publicKeyJwk) OR generator params
  # (keyGeneratorParams) — not the inline {type, curve} shape we sent first.
  # We let IH generate the keypair: simpler, no Vault pre-seed needed for
  # the TCK probe path (which only iterates the participant list).
  PAYLOAD=$(cat <<JSON
{
  "roles": [],
  "active": true,
  "did": "$DID",
  "participantContextId": "$PID",
  "key": {
    "keyId": "$PID-key-1",
    "privateKeyAlias": "$PID-private-key-alias",
    "active": true,
    "type": "JsonWebKey2020",
    "keyGeneratorParams": {
      "algorithm": "EC",
      "curve": "secp256r1"
    }
  }
}
JSON
)

  HTTP=$(curl -sS -o /tmp/ih.out -w '%{http_code}' \
    -X POST "$IH/v1alpha/participants" \
    "${AUTHZ[@]}" \
    --data-binary "$PAYLOAD")

  case "$HTTP" in
    200|201|204)
      log "  ✓ $PID created (HTTP $HTTP)"
      CREATED=$((CREATED + 1))
      ;;
    409)
      log "  · $PID already exists (HTTP 409)"
      SKIPPED=$((SKIPPED + 1))
      ;;
    *)
      log "  ✗ $PID failed (HTTP $HTTP)"
      head -c 500 /tmp/ih.out 2>/dev/null || true
      printf '\n'
      FAILED=$((FAILED + 1))
      ;;
  esac
done

# ── 4. Final state + summary ────────────────────────────────────────────────
log ""
log "Final IH participant list:"
curl -sS "${AUTHZ[@]}" "$IH/v1alpha/participants" \
  | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    if isinstance(data, list):
        for p in data:
            pid = p.get('participantContextId') or p.get('participantId') or '?'
            did = p.get('did') or '?'
            active = p.get('active') if 'active' in p else p.get('isActive', '?')
            print(f'  - {pid:<14} did={did:<40} active={active}')
        print(f'  total: {len(data)}')
    else:
        print(json.dumps(data, indent=2)[:500])
except Exception as e:
    print(f'(could not parse response: {e})', file=sys.stderr)
" || true

log ""
log "summary  created=$CREATED  skipped=$SKIPPED  failed=$FAILED"
[ "$FAILED" -gt 0 ] && fail "$FAILED participant(s) failed to create"
log "DONE"
