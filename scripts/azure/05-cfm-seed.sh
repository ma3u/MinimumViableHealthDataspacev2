#!/usr/bin/env bash
# =============================================================================
# Seed the CFM control objects onto Azure: cell, dataspace profile, provisioning
# activities and the deploy/dispose orchestration.
# =============================================================================
# ADR-024 Phase 3, the half that `05-edc-seed.sh` does not cover. That script
# seeds IdentityHub participants; this one seeds what the CFM managers need
# before a participant can be onboarded at all.
#
# Why it exists: `POST /api/participants` (the /onboarding form) reads a cell and
# a dataspace profile from the TenantManager before it can create anything. Both
# objects were only ever created by `jad/seed-jad.sh` against the local Docker
# stack, so on Azure those two reads returned empty and onboarding died on a bare
# "Failed to create participant". Issue #203.
#
# Idempotent: every object is created only when absent, so a re-run is a no-op
# and a partial previous run is completed rather than duplicated.
#
# Ceiling, stated plainly: this seeds the control objects, not the workers. The
# four CFM agents (keycloak, registration, edcv, onboarding) exist only in
# `docker-compose.jad.yml` and are in neither `env.sh` nor `build-images.sh`, so
# no image of them is in ACR. Until they are deployed, a new participant's VPAs
# stay `pending`: the tenant and the participant profile are real, the DID and
# the credential are not. The UI labels exactly that state as "Not provisioned".
#
# Usage (needs curl + python3; both managers are internal-ingress only, so in
# practice this runs as a one-shot ACA Job inside the environment):
#
#   TM=http://mvhd-tenant-mgr/api      \
#   PM=http://mvhd-provision-mgr/api   \
#   bash scripts/azure/05-cfm-seed.sh
#
# In CI: .github/workflows/cfm-seed.yml inlines this file, which stays the
# canonical source. Keep the two in sync.
# =============================================================================
set -euo pipefail

TM="${TM:?TM must be set, e.g. http://mvhd-tenant-mgr/api}"
PM="${PM:?PM must be set, e.g. http://mvhd-provision-mgr/api}"
CELL_ENVIRONMENT="${CELL_ENVIRONMENT:-health-dataspace-azure}"

# The credential specs a participant is expected to hold. Same shape as
# jad/seed-jad.sh so a participant seeded here matches one seeded locally.
ISSUER_DID="${ISSUER_DID:-did:web:issuerservice%3A10016:issuer}"

# Provisioning activity types, and the agent that claims each one. The agents are
# not on Azure yet (see the ceiling note above); the definitions still have to
# exist for the orchestration to reference them.
ACTIVITY_TYPES=(
  network-activity
  edcv-activity
  registration-activity
  keycloak-activity
  onboarding-activity
)

log()  { printf '[cfm-seed] %s\n' "$*"; }
fail() { printf '[cfm-seed] ERROR: %s\n' "$*" >&2; exit 1; }

# GET a collection, printing nothing on failure. Answers "[]" when the service is
# unreachable so callers can tell empty from broken by probing first.
get_json() {
  curl -sS --max-time 30 -H 'Accept: application/json' "$1" 2>/dev/null || echo '[]'
}

# First id in a JSON array, empty when the array is empty or not an array. Go
# services marshal an empty slice as `null`, so that case is handled too.
first_id() {
  python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
except Exception:
    data = None
if isinstance(data, list) and data and isinstance(data[0], dict):
    print(data[0].get('id', ''))
"
}

# ── 1. Wait for both managers ───────────────────────────────────────────────
for pair in "TenantManager|$TM/v1alpha1/cells" "ProvisionManager|$PM/v1alpha1/activity-definitions"; do
  NAME="${pair%%|*}"
  URL="${pair#*|}"
  log "Probing $NAME at $URL ..."
  CODE=000
  for i in $(seq 1 30); do
    CODE=$(curl -sS --max-time 15 -o /dev/null -w '%{http_code}' "$URL" || echo 000)
    if [ "$CODE" != "000" ]; then
      log "  $NAME responding (HTTP $CODE)"
      break
    fi
    log "  attempt $i: not yet, sleeping 5s"
    sleep 5
  done
  [ "$CODE" = "000" ] && fail "$NAME never responded at $URL"
done

# ── 2. Cell ─────────────────────────────────────────────────────────────────
CELL_ID=$(get_json "$TM/v1alpha1/cells" | first_id)

if [ -n "$CELL_ID" ]; then
  log "cell already present: $CELL_ID"
else
  log "creating cell (environment=$CELL_ENVIRONMENT) ..."
  CELL_ID=$(curl -sS --max-time 30 -X POST "$TM/v1alpha1/cells" \
    -H 'Content-Type: application/json' \
    -d "{
      \"properties\": { \"environment\": \"${CELL_ENVIRONMENT}\" },
      \"state\": \"active\",
      \"stateTimestamp\": \"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\"
    }" | python3 -c "import json,sys; print(json.load(sys.stdin).get('id',''))")
  [ -z "$CELL_ID" ] && fail "cell creation returned no id"
  log "  cell created: $CELL_ID"
fi

# ── 3. Dataspace profile ────────────────────────────────────────────────────
PROFILE_ID=$(get_json "$TM/v1alpha1/dataspace-profiles" | first_id)

if [ -n "$PROFILE_ID" ]; then
  log "dataspace profile already present: $PROFILE_ID"
else
  log "creating dataspace profile (dsp-2025-1 + dcp-2025-1) ..."
  PROFILE_ID=$(curl -sS --max-time 30 -X POST "$TM/v1alpha1/dataspace-profiles" \
    -H 'Content-Type: application/json' \
    -d "{
      \"artifacts\": [],
      \"properties\": {},
      \"dataspaceSpec\": {
        \"protocolStack\": [\"dsp-2025-1\", \"dcp-2025-1\"],
        \"credentialSpecs\": [
          {
            \"type\": \"MembershipCredential\",
            \"issuer\": \"${ISSUER_DID}\",
            \"format\": \"VC1_0_JWT\",
            \"id\": \"membership-credential-def\"
          },
          {
            \"type\": \"ManufacturerCredential\",
            \"issuer\": \"${ISSUER_DID}\",
            \"format\": \"VC1_0_JWT\",
            \"id\": \"manufacturer-credential-def\",
            \"role\": \"manufacturer\"
          }
        ]
      }
    }" | python3 -c "import json,sys; print(json.load(sys.stdin).get('id',''))")
  [ -z "$PROFILE_ID" ] && fail "dataspace profile creation returned no id"
  log "  profile created: $PROFILE_ID"
fi

# ── 4. Deploy the profile onto the cell ─────────────────────────────────────
# A profile with no deployment is inert: the TenantManager accepts a tenant
# against it but nothing binds the tenant to a cell.
DEPLOYED=$(get_json "$TM/v1alpha1/dataspace-profiles" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
except Exception:
    data = []
count = 0
if isinstance(data, list):
    for profile in data:
        if isinstance(profile, dict):
            count += len(profile.get('deployments') or [])
print(count)
")

if [ "$DEPLOYED" -gt 0 ]; then
  log "profile already deployed ($DEPLOYED deployment(s))"
else
  log "deploying profile $PROFILE_ID onto cell $CELL_ID ..."
  HTTP=$(curl -sS --max-time 30 -o /tmp/cfm-deploy.out -w '%{http_code}' \
    -X POST "$TM/v1alpha1/dataspace-profiles/$PROFILE_ID/deployments" \
    -H 'Content-Type: application/json' \
    -d "{ \"profileId\": \"${PROFILE_ID}\", \"cellId\": \"${CELL_ID}\" }" || echo 000)
  case "$HTTP" in
    2*) log "  deployed (HTTP $HTTP)" ;;
    *)
      head -c 500 /tmp/cfm-deploy.out 2>/dev/null || true
      printf '\n'
      fail "profile deployment failed (HTTP $HTTP)"
      ;;
  esac
fi

# ── 5. Provisioning activity definitions ────────────────────────────────────
EXISTING_ACTIVITIES=$(get_json "$PM/v1alpha1/activity-definitions" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
except Exception:
    data = []
if isinstance(data, list):
    for definition in data:
        if isinstance(definition, dict) and definition.get('type'):
            print(definition['type'])
")

CREATED=0
SKIPPED=0
for TYPE in "${ACTIVITY_TYPES[@]}"; do
  if printf '%s\n' "$EXISTING_ACTIVITIES" | grep -qx "$TYPE"; then
    log "activity $TYPE already defined"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi
  log "creating activity definition $TYPE ..."
  HTTP=$(curl -sS --max-time 30 -o /tmp/cfm-activity.out -w '%{http_code}' \
    -X POST "$PM/v1alpha1/activity-definitions" \
    -H 'Content-Type: application/json' \
    -d "{
      \"description\": \"Provisions ${TYPE} entries\",
      \"inputSchema\": {},
      \"outputSchema\": {},
      \"type\": \"${TYPE}\"
    }" || echo 000)
  case "$HTTP" in
    2*) CREATED=$((CREATED + 1)); log "  created (HTTP $HTTP)" ;;
    409) SKIPPED=$((SKIPPED + 1)); log "  already exists (HTTP 409)" ;;
    *)
      head -c 500 /tmp/cfm-activity.out 2>/dev/null || true
      printf '\n'
      fail "activity $TYPE failed (HTTP $HTTP)"
      ;;
  esac
done

# ── 6. Deploy / dispose orchestration ──────────────────────────────────────
# The ProvisionManager returns these keyed by `templateRef`, not `id`, and splits
# one definition into one entry per activity key, so the id-based lookup used
# above finds nothing here and a re-run would keep adding duplicates.
ORCH_ID=$(get_json "$PM/v1alpha1/orchestration-definitions" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
except Exception:
    data = []
if isinstance(data, list):
    for definition in data:
        if isinstance(definition, dict) and definition.get('templateRef'):
            print(definition['templateRef'])
            break
")

if [ -n "$ORCH_ID" ]; then
  log "orchestration definition already present: $ORCH_ID"
else
  ORCH_ID=$(python3 -c "import uuid; print(uuid.uuid4())")
  log "creating orchestration definition $ORCH_ID ..."
  # Dependency graph copied from jad/seed-jad.sh: the Keycloak client comes
  # first, connector and registration follow it in parallel, onboarding waits
  # for both. Dispose runs the same graph in reverse.
  HTTP=$(curl -sS --max-time 30 -o /tmp/cfm-orch.out -w '%{http_code}' \
    -X POST "$PM/v1alpha1/orchestration-definitions" \
    -H 'Content-Type: application/json' \
    -d "{
      \"activities\": {
        \"cfm.orchestration.vpa.dispose\": [
          { \"id\": \"offboarding-agent\", \"type\": \"onboarding-activity\", \"dependsOn\": [] },
          { \"id\": \"kc-client-remover\", \"type\": \"keycloak-activity\", \"dependsOn\": [\"offboarding-agent\", \"connector-rollback\", \"registration-rollback\"] },
          { \"id\": \"registration-rollback\", \"type\": \"registration-activity\", \"dependsOn\": [] },
          { \"id\": \"connector-rollback\", \"type\": \"edcv-activity\", \"dependsOn\": [] }
        ],
        \"cfm.orchestration.vpa.deploy\": [
          { \"id\": \"kc-client-provisioner\", \"type\": \"keycloak-activity\", \"dependsOn\": [] },
          { \"id\": \"registration-agent\", \"type\": \"registration-activity\", \"dependsOn\": [\"kc-client-provisioner\"] },
          { \"id\": \"connector-provisioner\", \"type\": \"edcv-activity\", \"dependsOn\": [\"kc-client-provisioner\"] },
          { \"id\": \"onboarding-agent\", \"type\": \"onboarding-activity\", \"dependsOn\": [\"connector-provisioner\", \"registration-agent\"] }
        ]
      },
      \"description\": \"Orchestrates the deployment of a new dataspace member\",
      \"schema\": {},
      \"id\": \"${ORCH_ID}\"
    }" || echo 000)
  case "$HTTP" in
    2*) log "  created (HTTP $HTTP)" ;;
    *)
      head -c 500 /tmp/cfm-orch.out 2>/dev/null || true
      printf '\n'
      fail "orchestration definition failed (HTTP $HTTP)"
      ;;
  esac
fi

# ── 7. Summary ──────────────────────────────────────────────────────────────
log ""
log "cell               $CELL_ID"
log "dataspace profile  $PROFILE_ID"
log "orchestration      $ORCH_ID"
log "activities         created=$CREATED skipped=$SKIPPED"
log ""
log "Onboarding can now create a tenant and a participant profile. The VPAs stay"
log "pending until the four CFM agents are deployed on Azure, which is separate"
log "work: no image of them is in ACR yet. Issue #203."
log "DONE"
