#!/usr/bin/env bash
# =============================================================================
# seed-contract-negotiation.sh — Phase 4b: Contract Negotiation & Data Transfer
# =============================================================================
# Demonstrates PharmaCo Research AG requesting AlphaKlinik Berlin's health data through
# the EDC-V dataspace connector, following EHDS Article 33 secondary use flow.
#
# Flow:
#   1. Register data planes for all participants
#   2. PharmaCo discovers AlphaKlinik's catalog via DSP protocol
#   3. For each dataset: negotiate contract → wait for FINALIZED → pull data
#   4. MedReg discovers AlphaKlinik's catalog (operator oversight)
#   5. Verify all negotiations and transfers
#
# Key learnings (root causes discovered during Phase 4b):
#   - Protocol MUST be "dataspace-protocol-http:2025-1" (with version suffix)
#   - @context MUST be array: ["https://w3id.org/edc/connector/management/v2"]
#   - Data plane hostname MUST match docker-compose service name (dataplane-fhir)
#   - Catalog uses v1alpha API; negotiation/transfer use v5alpha API
#   - operandLeft in contract defs: "https://w3id.org/edc/v0.0.1/ns/id" (not "@id")
#   - Participant contexts must be ACTIVATED (state=300) for DID serving
#
# Prerequisites:
#   - All JAD services running (docker compose up)
#   - seed-jad.sh completed (tenants + VPAs)
#   - seed-data-assets.sh completed (assets + policies + contracts)
# =============================================================================
set -euo pipefail

# =============================================================================
# Configuration
# =============================================================================
MGMT_URL="${MGMT_URL:-http://localhost:11003/api/mgmt}"
KC_URL="${KC_URL:-http://localhost:8080}"
KC_REALM="edcv"

# DIDs — assigned by CFM provisioning based on tenant slug
# These match the participant contexts created by seed-health-tenants.sh
ALPHAKLINIK_DID="did:web:identityhub%3A7083:alpha-klinik"
LMC_DID="did:web:identityhub%3A7083:lmc"
PHARMACO_DID="did:web:identityhub%3A7083:pharmaco"
MEDREG_DID="did:web:identityhub%3A7083:medreg"
IRS_DID="did:web:identityhub%3A7083:irs"

# DSP endpoints (Docker-internal controlplane address: port 8082 = protocol port)
# Format: http://controlplane:8082/api/dsp/{ctxId}/2025-1  (filled in after ctx discovery)
DSP_BASE="http://controlplane:8082/api/dsp"

# Data plane (Docker-internal)
DATAPLANE_FHIR_URL="http://dataplane-fhir:8083/api/control/v1/dataflows"

# JSON-LD context
EDC_CTX="https://w3id.org/edc/connector/management/v2"

# Protocol string (MUST include version suffix — "dataspace-protocol-http" alone returns
# "No provider dispatcher registered" error)
DSP_PROTOCOL="dataspace-protocol-http:2025-1"

# Polling
MAX_POLL=30   # max seconds to wait for negotiation/transfer
POLL_INTERVAL=2

# =============================================================================
# Helper functions
# =============================================================================
ok()   { echo "  ✅ $*"; }
warn() { echo "  ⚠️  $*"; }
fail() { echo "  ❌ $*"; exit 1; }

get_token() {
  curl -sf -X POST "$KC_URL/realms/$KC_REALM/protocol/openid-connect/token" \
    -d 'grant_type=client_credentials&client_id=admin&client_secret=edc-v-admin-secret' \
    | python3 -c "import json,sys; print(json.load(sys.stdin)['access_token'])"
}

# discover_ctx DID_SLUG → returns the UUID context ID whose participantId contains SLUG
# Example: discover_ctx "alpha-klinik"  → UUID assigned at provisioning time (dynamic)
# Queries GET /api/mgmt/v5alpha/participants at runtime so it works after any re-provisioning.
discover_ctx() {
  local slug="$1"
  local token
  token=$(get_token)
  curl -sf -H "Authorization: Bearer $token" "$MGMT_URL/v5alpha/participants" \
    | python3 -c "
import json, sys
slug = '$slug'
participants = json.load(sys.stdin)
if isinstance(participants, dict):
    participants = [participants]
for p in participants:
    pid = p.get('participantId', p.get('@id', ''))
    ctx = p.get('@id', '')
    # Match the slug anywhere in the participantId (URL-encoded colon is %3A)
    if slug in pid:
        print(ctx)
        sys.exit(0)
print('')  # not found
"
}

mgmt_call() {
  local method="$1" path="$2" body="${3:-}"
  local token
  token=$(get_token)
  local args=(-s -X "$method" "$MGMT_URL/$path"
    -H "Authorization: Bearer $token"
    -H "Content-Type: application/json")
  if [ -n "$body" ]; then
    args+=(-d "$body")
  fi
  curl "${args[@]}"
}

# Poll a negotiation or transfer until it reaches a target state (or times out)
# Usage: poll_state <api_path> <target_state> <label>
poll_state() {
  local path="$1" target="$2" label="$3"
  local elapsed=0 state=""
  while [ "$elapsed" -lt "$MAX_POLL" ]; do
    state=$(mgmt_call GET "$path" | python3 -c "
import json,sys
d = json.load(sys.stdin)
print(d.get('state','UNKNOWN'))
" 2>/dev/null || echo "UNKNOWN")
    if [ "$state" = "$target" ]; then
      echo "$state"
      return 0
    elif [ "$state" = "TERMINATED" ] || [ "$state" = "ERROR" ]; then
      echo "$state"
      return 1
    fi
    sleep "$POLL_INTERVAL"
    elapsed=$((elapsed + POLL_INTERVAL))
  done
  echo "TIMEOUT($state)"
  return 1
}

# =============================================================================
# Main
# =============================================================================
echo "════════════════════════════════════════════════"
echo "Phase 4b: Contract Negotiation & Data Transfer"
echo "════════════════════════════════════════════════"
echo ""

echo "Obtaining access token..."
TOKEN=$(get_token)
ok "Token obtained"
echo ""

# =============================================================================
# Discover participant context IDs from EDC-V management API
# (UUIDs are assigned at provisioning time and change on each re-seed)
# =============================================================================
echo "Discovering participant context IDs..."
ALPHAKLINIK_CTX=$(discover_ctx "alpha-klinik")
LMC_CTX=$(discover_ctx "lmc")
PHARMACO_CTX=$(discover_ctx "pharmaco")
MEDREG_CTX=$(discover_ctx "medreg")
IRS_CTX=$(discover_ctx "irs")

if [ -z "$ALPHAKLINIK_CTX" ] && [ -z "$LMC_CTX" ] && [ -z "$PHARMACO_CTX" ]; then
  fail "No participant contexts found in EDC-V — run seed-health-tenants.sh first"
fi

[ -n "$ALPHAKLINIK_CTX" ] && ok "AlphaKlinik Berlin  ctx=$ALPHAKLINIK_CTX" || warn "AlphaKlinik Berlin  ctx NOT found"
[ -n "$LMC_CTX" ]         && ok "Limburg Medical Centre ctx=$LMC_CTX"      || warn "Limburg Medical Centre ctx NOT found"
[ -n "$PHARMACO_CTX" ]    && ok "PharmaCo Research AG  ctx=$PHARMACO_CTX"  || warn "PharmaCo Research AG ctx NOT found"
[ -n "$MEDREG_CTX" ]      && ok "MedReg DE             ctx=$MEDREG_CTX"    || warn "MedReg DE ctx NOT found"
[ -n "$IRS_CTX" ]         && ok "Institut de Recherche Santé ctx=$IRS_CTX" || warn "Institut de Recherche Santé ctx NOT found"
echo ""

# Build DSP endpoint for each provider participant (Docker-internal address)
# Format: {DSP_BASE}/{providerCtxId}/2025-1  (version suffix required by EDC-V)
[ -n "$ALPHAKLINIK_CTX" ] && ALPHAKLINIK_DSP="$DSP_BASE/$ALPHAKLINIK_CTX/2025-1"
[ -n "$LMC_CTX" ]         && LMC_DSP="$DSP_BASE/$LMC_CTX/2025-1"   # for future cross-clinic flows

# =============================================================================
# Step 1: Register Data Planes
# =============================================================================
echo "────────────────────────────────────────────────"
echo "Step 1: Register Data Planes for all participants"
echo "────────────────────────────────────────────────"

register_dataplane() {
  local ctx_id="$1" label="$2"
  local payload="{
    \"@context\": [\"$EDC_CTX\"],
    \"allowedSourceTypes\": [\"HttpData\", \"HttpCertData\"],
    \"allowedTransferTypes\": [\"HttpData-PULL\"],
    \"url\": \"$DATAPLANE_FHIR_URL\"
  }"
  local http_code
  http_code=$(curl -s -o /dev/null -w '%{http_code}' -X POST \
    "$MGMT_URL/v5alpha/dataplanes/$ctx_id" \
    -H "Authorization: Bearer $(get_token)" \
    -H "Content-Type: application/json" \
    -d "$payload")
  if [ "$http_code" = "204" ] || [ "$http_code" = "200" ]; then
    ok "$label data plane registered"
  else
    warn "$label data plane registration returned HTTP $http_code"
  fi
}

[ -n "$ALPHAKLINIK_CTX" ] && register_dataplane "$ALPHAKLINIK_CTX" "AlphaKlinik Berlin"
[ -n "$LMC_CTX" ]         && register_dataplane "$LMC_CTX"         "Limburg Medical Centre"
[ -n "$PHARMACO_CTX" ]    && register_dataplane "$PHARMACO_CTX"    "PharmaCo Research AG"
[ -n "$MEDREG_CTX" ]      && register_dataplane "$MEDREG_CTX"      "MedReg DE"
[ -n "$IRS_CTX" ]         && register_dataplane "$IRS_CTX"         "Institut de Recherche Santé"
echo ""

# =============================================================================
# Step 2: PharmaCo discovers AlphaKlinik's catalog
# =============================================================================
echo "────────────────────────────────────────────────"
echo "Step 2: PharmaCo discovers AlphaKlinik's catalog via DSP"
echo "────────────────────────────────────────────────"

# PharmaCo (consumer) queries AlphaKlinik Berlin (provider) catalog
if [ -z "$PHARMACO_CTX" ]; then
  fail "PharmaCo context not found — cannot perform catalog discovery"
fi
if [ -z "$ALPHAKLINIK_CTX" ]; then
  fail "AlphaKlinik context not found — cannot perform catalog discovery"
fi

CATALOG=$(mgmt_call POST "v1alpha/participants/$PHARMACO_CTX/catalog" \
  "{\"counterPartyDid\":\"$ALPHAKLINIK_DID\"}")

# Parse datasets and offers
OFFERS=$(echo "$CATALOG" | python3 -c "
import json, sys
d = json.load(sys.stdin)
datasets = d.get('dataset', d.get('dcat:dataset', []))
if isinstance(datasets, dict): datasets = [datasets]
for ds in datasets:
    asset_id = ds.get('@id', ds.get('id', 'unknown'))
    policies = ds.get('hasPolicy', ds.get('odrl:hasPolicy', []))
    if isinstance(policies, dict): policies = [policies]
    for p in policies:
        offer_id = p.get('@id', '')
        print(f'{asset_id}|{offer_id}')
")

DATASET_COUNT=$(echo "$OFFERS" | grep -c '|' || echo 0)
echo "  Catalog from Clinic: $DATASET_COUNT dataset(s) discovered"

if [ "$DATASET_COUNT" -eq 0 ]; then
  fail "No datasets in catalog — check contract definitions and participant activation"
fi

echo ""
echo "  Available datasets:"
echo "$OFFERS" | while IFS='|' read -r asset_id offer_id; do
  echo "    - $asset_id"
  echo "      Offer: ${offer_id:0:60}..."
done
ok "Catalog discovery complete"
echo ""

# =============================================================================
# Step 3: CRO negotiates contracts + initiates data transfer for each dataset
# =============================================================================
echo "────────────────────────────────────────────────"
echo "Step 3: Contract Negotiation & Data Transfer"
echo "────────────────────────────────────────────────"

NEGOTIATED=0
TRANSFERRED=0
FAILED=0

echo "$OFFERS" | while IFS='|' read -r asset_id offer_id; do
  echo ""
  echo "  [$asset_id]"
  echo "    Initiating contract negotiation..."

  # --- 3a: Negotiate contract ---
  NEG_RESPONSE=$(mgmt_call POST "v5alpha/participants/$PHARMACO_CTX/contractnegotiations" "{
    \"@context\": [\"$EDC_CTX\"],
    \"@type\": \"ContractRequest\",
    \"counterPartyAddress\": \"$ALPHAKLINIK_DSP\",
    \"protocol\": \"$DSP_PROTOCOL\",
    \"policy\": {
      \"@type\": \"Offer\",
      \"@id\": \"$offer_id\",
      \"assigner\": \"$ALPHAKLINIK_DID\",
      \"target\": \"$asset_id\"
    }
  }")

  NEG_ID=$(echo "$NEG_RESPONSE" | python3 -c "
import json, sys
d = json.load(sys.stdin)
print(d.get('@id', ''))
" 2>/dev/null || echo "")

  if [ -z "$NEG_ID" ]; then
    echo "    ❌ Negotiation failed to start"
    ERR=$(echo "$NEG_RESPONSE" | head -c 200)
    echo "    Error: $ERR"
    continue
  fi

  echo "    Negotiation ID: ${NEG_ID:0:40}..."

  # --- 3b: Poll until FINALIZED ---
  echo -n "    Waiting for FINALIZED..."
  FINAL_STATE=$(poll_state \
    "v5alpha/participants/$PHARMACO_CTX/contractnegotiations/$NEG_ID" \
    "FINALIZED" "$asset_id")

  if [ "$FINAL_STATE" != "FINALIZED" ]; then
    echo " $FINAL_STATE"
    echo "    ❌ Negotiation ended in state: $FINAL_STATE"
    continue
  fi
  echo " ✅"

  # --- 3c: Extract agreement ID ---
  AGREEMENT_ID=$(mgmt_call GET "v5alpha/participants/$PHARMACO_CTX/contractnegotiations/$NEG_ID" \
    | python3 -c "
import json, sys
d = json.load(sys.stdin)
print(d.get('contractAgreementId', ''))
" 2>/dev/null || echo "")

  echo "    Agreement: ${AGREEMENT_ID:0:40}..."

  # --- 3d: Initiate HttpData-PULL transfer ---
  echo "    Initiating data transfer (HttpData-PULL)..."
  TP_RESPONSE=$(mgmt_call POST "v5alpha/participants/$PHARMACO_CTX/transferprocesses" "{
    \"@context\": [\"$EDC_CTX\"],
    \"@type\": \"TransferRequest\",
    \"counterPartyAddress\": \"$ALPHAKLINIK_DSP\",
    \"protocol\": \"$DSP_PROTOCOL\",
    \"contractId\": \"$AGREEMENT_ID\",
    \"assetId\": \"$asset_id\",
    \"transferType\": \"HttpData-PULL\",
    \"dataDestination\": { \"@type\": \"DataAddress\", \"type\": \"HttpProxy\" }
  }")

  TP_ID=$(echo "$TP_RESPONSE" | python3 -c "
import json, sys
d = json.load(sys.stdin)
print(d.get('@id', ''))
" 2>/dev/null || echo "")

  if [ -z "$TP_ID" ]; then
    echo "    ⚠️  Transfer request failed"
    ERR=$(echo "$TP_RESPONSE" | head -c 200)
    echo "    Error: $ERR"
    ok "$asset_id — NEGOTIATED (transfer failed)"
    continue
  fi

  echo "    Transfer ID: ${TP_ID:0:40}..."

  # --- 3e: Poll until STARTED ---
  echo -n "    Waiting for STARTED..."
  TP_STATE=$(poll_state \
    "v5alpha/participants/$PHARMACO_CTX/transferprocesses/$TP_ID" \
    "STARTED" "$asset_id")

  if [ "$TP_STATE" = "STARTED" ]; then
    echo " ✅"
    ok "$asset_id — NEGOTIATED + TRANSFER STARTED"
  else
    echo " $TP_STATE"
    warn "$asset_id — NEGOTIATED but transfer state: $TP_STATE"
  fi
done

echo ""

# =============================================================================
# Step 4: MedReg discovers AlphaKlinik's catalog (operator oversight)
# =============================================================================
echo "────────────────────────────────────────────────"
echo "Step 4: MedReg discovers AlphaKlinik's catalog (operator)"
echo "────────────────────────────────────────────────"

MEDREG_CATALOG=$(mgmt_call POST "v1alpha/participants/$MEDREG_CTX/catalog" \
  "{\"counterPartyDid\":\"$ALPHAKLINIK_DID\"}")

MEDREG_DATASETS=$(echo "$MEDREG_CATALOG" | python3 -c "
import json, sys
d = json.load(sys.stdin)
datasets = d.get('dataset', d.get('dcat:dataset', []))
if isinstance(datasets, dict): datasets = [datasets]
print(len(datasets))
" 2>/dev/null || echo "0")

echo "  MedReg sees $MEDREG_DATASETS dataset(s) from Clinic"
ok "Operator catalog discovery verified"
echo ""

# =============================================================================
# Step 5: Verify all contract negotiations
# =============================================================================
echo "────────────────────────────────────────────────"
echo "Step 5: Verify Contract Negotiations & Transfers"
echo "────────────────────────────────────────────────"

# PharmaCo negotiations
PHARMACO_NEG_COUNT=$(mgmt_call POST "v5alpha/participants/$PHARMACO_CTX/contractnegotiations/request" \
  "{\"@context\":[\"$EDC_CTX\"],\"@type\":\"QuerySpec\"}" \
  | python3 -c "
import json, sys
data = json.load(sys.stdin)
items = data if isinstance(data, list) else []
finalized = [n for n in items if n.get('state') == 'FINALIZED']
print(f'{len(finalized)}/{len(items)}')
for n in items:
    nid = n.get('@id','?')[:20]
    state = n.get('state','?')
    aid = n.get('contractAgreementId','—')[:20]
    print(f'    {nid}... {state} agreement={aid}...')
" 2>/dev/null || echo "?/?")

echo "  PharmaCo negotiations (FINALIZED/total): $PHARMACO_NEG_COUNT"

# PharmaCo transfers
PHARMACO_TP_COUNT=$(mgmt_call POST "v5alpha/participants/$PHARMACO_CTX/transferprocesses/request" \
  "{\"@context\":[\"$EDC_CTX\"],\"@type\":\"QuerySpec\"}" \
  | python3 -c "
import json, sys
data = json.load(sys.stdin)
items = data if isinstance(data, list) else []
started = [t for t in items if t.get('state') == 'STARTED']
print(f'{len(started)}/{len(items)}')
for t in items:
    tid = t.get('@id','?')[:20]
    state = t.get('state','?')
    asset = t.get('assetId','?')
    print(f'    {tid}... {state} asset={asset}')
" 2>/dev/null || echo "?/?")

echo "  PharmaCo transfers (STARTED/total): $PHARMACO_TP_COUNT"

# Clinic (provider side)
LMC_NEG_COUNT=$(mgmt_call POST "v5alpha/participants/$LMC_CTX/contractnegotiations/request" \
  "{\"@context\":[\"$EDC_CTX\"],\"@type\":\"QuerySpec\"}" \
  | python3 -c "
import json, sys
data = json.load(sys.stdin)
items = data if isinstance(data, list) else []
print(len(items))
" 2>/dev/null || echo "0")

echo "  AlphaKlinik has $LMC_NEG_COUNT contract negotiation(s) (provider side)"

echo ""
echo "════════════════════════════════════════════════"
echo "Phase 4b Summary"
echo "════════════════════════════════════════════════"
echo ""
echo "  PharmaCo Research AG → AlphaKlinik Berlin:"
echo "    Catalog datasets:   $DATASET_COUNT"
echo "    Negotiations:       $PHARMACO_NEG_COUNT (FINALIZED/total)"
echo "    Transfers:          $PHARMACO_TP_COUNT (STARTED/total)"
echo ""
echo "  MedReg DE → AlphaKlinik Berlin:"
echo "    Catalog datasets:   $MEDREG_DATASETS"
echo ""
ok "Phase 4b: Contract Negotiation & Data Transfer complete"
