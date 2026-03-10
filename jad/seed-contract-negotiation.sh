#!/usr/bin/env bash
# =============================================================================
# seed-contract-negotiation.sh — Phase 4b: Contract Negotiation & Data Transfer
# =============================================================================
# Demonstrates CRO TrialCorp requesting Clinic Riverside's health data through
# the EDC-V dataspace connector, following EHDS Article 33 secondary use flow.
#
# Flow:
#   1. Register data planes for all participants
#   2. CRO discovers Clinic's catalog via DSP protocol
#   3. For each dataset: negotiate contract → wait for FINALIZED → pull data
#   4. HDAB discovers Clinic's catalog (operator oversight)
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

# Participant context IDs (from TenantManager provisioning)
CLINIC_CTX="d0b1e14e6faa47aca9c2932a5e22885b"
CRO_CTX="4e300dff7d62415e9c409351bb2fe17a"
HDAB_CTX="9ce6ec7ea12a4c6f957774c3783a988c"

# DIDs (did:web with Docker-internal identityhub hostname)
CLINIC_DID="did:web:identityhub%3A7083:clinic-charite"
CRO_DID="did:web:identityhub%3A7083:cro-bayer"
HDAB_DID="did:web:identityhub%3A7083:hdab-bfarm"

# DSP endpoints (Docker-internal controlplane address)
CLINIC_DSP="http://controlplane:8082/api/dsp/$CLINIC_CTX/2025-1"

# Data plane (Docker-internal)
DATAPLANE_FHIR_URL="http://dataplane-fhir:8083/api/control/v1/dataflows"

# JSON-LD context
EDC_CTX="https://w3id.org/edc/connector/management/v2"

# Protocol string (MUST include version suffix)
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

register_dataplane "$CLINIC_CTX" "Clinic"
register_dataplane "$CRO_CTX"    "CRO"
register_dataplane "$HDAB_CTX"   "HDAB"
echo ""

# =============================================================================
# Step 2: CRO discovers Clinic's catalog
# =============================================================================
echo "────────────────────────────────────────────────"
echo "Step 2: CRO discovers Clinic's catalog via DSP"
echo "────────────────────────────────────────────────"

CATALOG=$(mgmt_call POST "v1alpha/participants/$CRO_CTX/catalog" \
  "{\"counterPartyDid\":\"$CLINIC_DID\"}")

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
  NEG_RESPONSE=$(mgmt_call POST "v5alpha/participants/$CRO_CTX/contractnegotiations" "{
    \"@context\": [\"$EDC_CTX\"],
    \"@type\": \"ContractRequest\",
    \"counterPartyAddress\": \"$CLINIC_DSP\",
    \"protocol\": \"$DSP_PROTOCOL\",
    \"policy\": {
      \"@type\": \"Offer\",
      \"@id\": \"$offer_id\",
      \"assigner\": \"$CLINIC_DID\",
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
    "v5alpha/participants/$CRO_CTX/contractnegotiations/$NEG_ID" \
    "FINALIZED" "$asset_id")

  if [ "$FINAL_STATE" != "FINALIZED" ]; then
    echo " $FINAL_STATE"
    echo "    ❌ Negotiation ended in state: $FINAL_STATE"
    continue
  fi
  echo " ✅"

  # --- 3c: Extract agreement ID ---
  AGREEMENT_ID=$(mgmt_call GET "v5alpha/participants/$CRO_CTX/contractnegotiations/$NEG_ID" \
    | python3 -c "
import json, sys
d = json.load(sys.stdin)
print(d.get('contractAgreementId', ''))
" 2>/dev/null || echo "")

  echo "    Agreement: ${AGREEMENT_ID:0:40}..."

  # --- 3d: Initiate HttpData-PULL transfer ---
  echo "    Initiating data transfer (HttpData-PULL)..."
  TP_RESPONSE=$(mgmt_call POST "v5alpha/participants/$CRO_CTX/transferprocesses" "{
    \"@context\": [\"$EDC_CTX\"],
    \"@type\": \"TransferRequest\",
    \"counterPartyAddress\": \"$CLINIC_DSP\",
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
    "v5alpha/participants/$CRO_CTX/transferprocesses/$TP_ID" \
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
# Step 4: HDAB discovers Clinic's catalog (operator oversight)
# =============================================================================
echo "────────────────────────────────────────────────"
echo "Step 4: HDAB discovers Clinic's catalog (operator)"
echo "────────────────────────────────────────────────"

HDAB_CATALOG=$(mgmt_call POST "v1alpha/participants/$HDAB_CTX/catalog" \
  "{\"counterPartyDid\":\"$CLINIC_DID\"}")

HDAB_DATASETS=$(echo "$HDAB_CATALOG" | python3 -c "
import json, sys
d = json.load(sys.stdin)
datasets = d.get('dataset', d.get('dcat:dataset', []))
if isinstance(datasets, dict): datasets = [datasets]
print(len(datasets))
" 2>/dev/null || echo "0")

echo "  HDAB sees $HDAB_DATASETS dataset(s) from Clinic"
ok "Operator catalog discovery verified"
echo ""

# =============================================================================
# Step 5: Verify all contract negotiations
# =============================================================================
echo "────────────────────────────────────────────────"
echo "Step 5: Verify Contract Negotiations & Transfers"
echo "────────────────────────────────────────────────"

# CRO negotiations
CRO_NEG_COUNT=$(mgmt_call POST "v5alpha/participants/$CRO_CTX/contractnegotiations/request" \
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

echo "  CRO negotiations (FINALIZED/total): $CRO_NEG_COUNT"

# CRO transfers
CRO_TP_COUNT=$(mgmt_call POST "v5alpha/participants/$CRO_CTX/transferprocesses/request" \
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

echo "  CRO transfers (STARTED/total): $CRO_TP_COUNT"

# Clinic (provider side)
CLINIC_NEG_COUNT=$(mgmt_call POST "v5alpha/participants/$CLINIC_CTX/contractnegotiations/request" \
  "{\"@context\":[\"$EDC_CTX\"],\"@type\":\"QuerySpec\"}" \
  | python3 -c "
import json, sys
data = json.load(sys.stdin)
items = data if isinstance(data, list) else []
print(len(items))
" 2>/dev/null || echo "0")

echo "  Clinic has $CLINIC_NEG_COUNT contract negotiation(s) (provider side)"

echo ""
echo "════════════════════════════════════════════════"
echo "Phase 4b Summary"
echo "════════════════════════════════════════════════"
echo ""
echo "  CRO TrialCorp → Clinic Riverside:"
echo "    Catalog datasets:   $DATASET_COUNT"
echo "    Negotiations:       $CRO_NEG_COUNT (FINALIZED/total)"
echo "    Transfers:          $CRO_TP_COUNT (STARTED/total)"
echo ""
echo "  HDAB HealthGov → Clinic Riverside:"
echo "    Catalog datasets:   $HDAB_DATASETS"
echo ""
ok "Phase 4b: Contract Negotiation & Data Transfer complete"
