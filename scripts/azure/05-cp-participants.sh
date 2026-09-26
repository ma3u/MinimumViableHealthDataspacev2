#!/usr/bin/env bash
# =============================================================================
# Seed participant contexts onto the EDC control plane
# =============================================================================
# Issue #316. `05-edc-seed.sh` seeds the IdentityHub; nothing seeded the control
# plane, so `GET /api/mgmt/<v>/participants` returned `[]` and every
# participant-scoped check in the DSP 2025-1 and DCP v1.0 suites ended at
#
#   ERROR: Missing required participant contexts.
#     PROVIDER  (alpha-klinik): NOT FOUND
#
# Neither suite has ever produced a verdict on Azure for that reason. Nothing in
# this repository created a control-plane participant context: locally they are
# a side effect of the CFM agents provisioning a `cfm.connector` activity, and
# those agents are not on Azure at all (#318). The Management API does expose a
# direct create, `POST <v>/participants` taking a ParticipantContext, so this
# does not have to wait for them.
#
# Idempotent: a context whose identity already matches a slug is left alone, so
# a re-run is a no-op and a partial previous run is completed, not duplicated.
#
# The Management API is on the control plane's 8081, which ACA exposes only as
# an additionalPortMapping, so this has to run from inside the environment as a
# one-shot ACA Job. `https://mvhd-controlplane.internal.<domain>` is targetPort
# 8080 and does not serve /api/mgmt at all (#307).
#
# Usage (needs curl + python3):
#
#   CP=http://mvhd-controlplane:8081/api/mgmt \
#   TOKEN=<keycloak bearer> \
#   bash scripts/azure/05-cp-participants.sh
#
# In CI: .github/workflows/edc-seed-cp-participants.yml inlines this file, which
# stays the canonical source. Keep the two in sync, the way cfm-seed.yml does.
# =============================================================================
set -euo pipefail

CP="${CP:-http://mvhd-controlplane:8081/api/mgmt}"
TOKEN="${TOKEN:?TOKEN must be set to a Keycloak bearer token for client 'admin'}"

# JSON-LD context. The management context IRI the 0.18 launchers expand against;
# the same one jad/seed-data-assets.sh uses for every other management call.
EDC_CTX="${EDC_CTX:-https://w3id.org/edc/connector/management/v2}"

# The same five, with the same DIDs, as scripts/azure/05-edc-seed.sh. The three
# the compliance suites require are alpha-klinik (provider), pharmaco (consumer)
# and medreg (operator); lmc and irs are seeded too so the control plane and the
# identity hub agree on who exists.
PARTICIPANTS=(
  "alpha-klinik|did:web:alpha-klinik.de:participant"
  "pharmaco|did:web:pharmaco.de:research"
  "medreg|did:web:medreg.de:hdab"
  "lmc|did:web:lmc.nl:clinic"
  "irs|did:web:irs.fr:hdab"
)

log()  { printf '[cp-seed] %s\n' "$*"; }
fail() { printf '[cp-seed] ERROR: %s\n' "$*" >&2; exit 1; }

# The version segment is a path segment and it differs per environment: the
# image deployed on Azure serves v4alpha, the 0.18 launchers in
# docker-compose.jad.yml serve v5beta, and the checked-in OpenAPI spec documents
# v5alpha (#307). Ask rather than assume.
# Sets MGMT_V rather than echoing it. log() writes to stdout, so a
# `MGMT_V=$(detect_version)` would capture the probe lines into the variable
# along with the answer — the same trap that made the compliance suites
# swallow their own diagnosis (#307).
MGMT_V=""
detect_version() {
  local v code
  # Deliberate word splitting: the candidate list is space separated.
  # shellcheck disable=SC2086
  for v in ${MGMT_V_CANDIDATES:-v4alpha v5beta v5alpha v3}; do
    code=$(curl -sS --max-time 20 -o /dev/null -w '%{http_code}' \
      -H "Authorization: Bearer $TOKEN" "$CP/$v/participants" || echo 000)
    if [ "$code" = "200" ]; then
      MGMT_V="$v"
      return 0
    fi
    log "  $CP/$v/participants -> HTTP $code"
  done
  return 1
}

# Which role the token carries, for the 403 diagnosis below. The control
# plane refuses participant-context creation with "Required user role not
# satisfied" and does not say which role it wanted, so say which one we have.
TOKEN_ROLE=$(printf '%s' "$TOKEN" | python3 -c "
import sys, json, base64
try:
    payload = sys.stdin.read().split('.')[1]
    payload += '=' * (-len(payload) % 4)
    print(json.loads(base64.urlsafe_b64decode(payload)).get('role') or '')
except Exception:
    print('')
" 2>/dev/null || true)
log "Token role claim: ${TOKEN_ROLE:-(none)}"

log "Detecting the Management API version at $CP ..."
detect_version || fail "no candidate version answered 200; the control plane is unreachable or the token is not accepted"
log "Management API is $MGMT_V"

EXISTING=$(curl -sS --max-time 30 -H "Authorization: Bearer $TOKEN" \
  "$CP/$MGMT_V/participants") || fail "could not read the existing participant list"
log "Existing contexts: $(printf '%s' "$EXISTING" | python3 -c 'import json,sys
try: d=json.load(sys.stdin)
except Exception: print("(unparseable)"); raise SystemExit
print(len(d) if isinstance(d,list) else "?")' 2>/dev/null || echo '?')"

CREATED=0
SKIPPED=0
FAILED=0

for entry in "${PARTICIPANTS[@]}"; do
  SLUG="${entry%%|*}"
  DID="${entry##*|}"

  if printf '%s' "$EXISTING" | python3 -c "
import json,sys
slug = sys.argv[1]
try: d = json.load(sys.stdin)
except Exception: sys.exit(1)
if not isinstance(d, list): sys.exit(1)
sys.exit(0 if any(slug in (p.get('identity') or '') for p in d) else 1)
" "$SLUG" 2>/dev/null; then
    log "skip   $SLUG (a context with that identity already exists)"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  # state ACTIVATED because the UI filters the list on exactly that
  # (ui/src/app/api/participants/route.ts) and a CREATED context would be
  # seeded and then hidden, which is the most confusing of the outcomes.
  BODY=$(python3 -c "
import json, sys
print(json.dumps({
  '@context': [sys.argv[1]],
  '@type': 'ParticipantContext',
  'identity': sys.argv[2],
  'state': 'ACTIVATED',
  'properties': {},
}))" "$EDC_CTX" "$DID")

  RESP=$(mktemp)
  CODE=$(curl -sS --max-time 30 -o "$RESP" -w '%{http_code}' \
    -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
    -d "$BODY" "$CP/$MGMT_V/participants" || echo 000)

  case "$CODE" in
    2??)
      log "create $SLUG -> HTTP $CODE  ($DID)"
      CREATED=$((CREATED + 1))
      ;;
    409)
      # Someone else got there first, or the identity matched on a field this
      # script does not read back. Not a failure.
      log "skip   $SLUG -> HTTP 409, already present"
      SKIPPED=$((SKIPPED + 1))
      ;;
    403)
      log "FAILED $SLUG -> HTTP 403"
      log "       $(head -c 300 "$RESP" | tr '\n' ' ')"
      log "       the token's role claim is '${TOKEN_ROLE:-none}'. Creating a"
      log "       participant context needs the 'provisioner' role, not 'admin':"
      log "       the two Keycloak clients differ only in that claim, and the"
      log "       CFM edcv-agent, which creates these contexts locally, uses"
      log "       'provisioner' (jad/edcv-agent-config.yaml). Set"
      log "       KC_CLIENT_ID=provisioner."
      FAILED=$((FAILED + 1))
      ;;
    *)
      log "FAILED $SLUG -> HTTP $CODE"
      log "       $(head -c 300 "$RESP" | tr '\n' ' ')"
      FAILED=$((FAILED + 1))
      ;;
  esac
  rm -f "$RESP"
done

# The control plane ignores the state on create: every context comes back
# CREATED whatever the payload asked for, measured on the live control plane
# on 2026-09-26. That matters twice over — the UI lists only ACTIVATED
# contexts (ui/src/app/api/participants/route.ts), and a context that was
# never activated is not a participant anyone can negotiate with. There is no
# activate endpoint; PUT <v>/participants/{id} is the way.
log "Activating any context that is not ACTIVATED ..."
AFTER=$(curl -sS --max-time 30 -H "Authorization: Bearer $TOKEN" \
  "$CP/$MGMT_V/participants" || echo '[]')

ACTIVATED=0
ACTIVATE_FAILED=0
while IFS='|' read -r CTX_ID CTX_IDENTITY CTX_STATE; do
  [ -n "$CTX_ID" ] || continue
  [ "$CTX_STATE" = "ACTIVATED" ] && continue

  PUT_BODY=$(python3 -c "
import json, sys
print(json.dumps({
  '@context': [sys.argv[1]],
  '@type': 'ParticipantContext',
  '@id': sys.argv[2],
  'identity': sys.argv[3],
  'state': 'ACTIVATED',
}))" "$EDC_CTX" "$CTX_ID" "$CTX_IDENTITY")

  RESP=$(mktemp)
  CODE=$(curl -sS --max-time 30 -o "$RESP" -w '%{http_code}' \
    -X PUT -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
    -d "$PUT_BODY" "$CP/$MGMT_V/participants/$CTX_ID" || echo 000)
  case "$CODE" in
    2??|204)
      log "activate $CTX_IDENTITY -> HTTP $CODE"
      ACTIVATED=$((ACTIVATED + 1))
      ;;
    *)
      log "activate $CTX_IDENTITY -> HTTP $CODE (was $CTX_STATE)"
      log "         $(head -c 200 "$RESP" | tr '\n' ' ')"
      ACTIVATE_FAILED=$((ACTIVATE_FAILED + 1))
      ;;
  esac
  rm -f "$RESP"
done <<EOF
$(printf '%s' "$AFTER" | python3 -c "
import json, sys
try: d = json.load(sys.stdin)
except Exception: raise SystemExit
for p in d if isinstance(d, list) else []:
    print('%s|%s|%s' % (p.get('@id') or '', p.get('identity') or '', p.get('state') or ''))
" 2>/dev/null)
EOF
log "activate requests accepted: $ACTIVATED, refused: $ACTIVATE_FAILED"

# Do not trust the status code. Measured on the live control plane on
# 2026-09-26: every PUT returned 204 and not one context changed state. A
# 204 means the request was accepted, not that the field was applied, and
# reporting "activated=5" off the back of it would be exactly the kind of
# claim-without-evidence this script exists to stop making.
STILL_CREATED=$(curl -sS --max-time 30 -H "Authorization: Bearer $TOKEN" \
  "$CP/$MGMT_V/participants" 2>/dev/null | python3 -c "
import json, sys
try: d = json.load(sys.stdin)
except Exception: print(-1); raise SystemExit
print(sum(1 for p in (d if isinstance(d, list) else []) if p.get('state') != 'ACTIVATED'))
" 2>/dev/null || echo -1)

if [ "${STILL_CREATED:-0}" -gt 0 ] 2>/dev/null; then
  log "WARNING: ${STILL_CREATED} context(s) are still not ACTIVATED after a 204."
  log "         The control plane accepts the PUT and ignores the state. This"
  log "         is a known gap: the compliance suites do not care, because"
  log "         discovery matches on identity, but the UI lists only ACTIVATED"
  log "         contexts (ui/src/app/api/participants/route.ts) so they will"
  log "         not appear there. Tracked separately; do not read the 204s"
  log "         above as activation."
fi

log "Final participant list:"
curl -sS --max-time 30 -H "Authorization: Bearer $TOKEN" "$CP/$MGMT_V/participants" \
  | python3 -c "
import json, sys
try: d = json.load(sys.stdin)
except Exception:
    print('  (unparseable response)'); raise SystemExit
for p in d if isinstance(d, list) else []:
    print('  %-40s %-10s %s' % (p.get('identity') or '?', p.get('state') or '?', p.get('@id') or ''))
print('  %d context(s)' % (len(d) if isinstance(d, list) else 0))
" || log "  (could not read the list back)"

log "created=$CREATED skipped=$SKIPPED failed=$FAILED"
[ "$FAILED" -gt 0 ] && fail "$FAILED participant context(s) could not be created"
log "done"
