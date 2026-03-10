#!/usr/bin/env bash
# =============================================================================
# seed-federated-catalog.sh — Phase 4c: Federated Catalog with HealthDCAT-AP
# =============================================================================
# Demonstrates cross-participant catalog discovery via DSP 2025-1.
# All three participants (CRO, HDAB, Clinic) discover each other's catalogs.
# HDAB negotiates a contract for the HealthDCAT-AP catalog metadata asset.
#
# Prerequisites:
#   - All 18 Docker services running (docker compose -f docker-compose.jad.yml up -d)
#   - seed-data-assets.sh completed (assets, policies, contracts registered)
#   - seed-contract-negotiation.sh completed (participants activated)
#
# Usage:
#   ./jad/seed-federated-catalog.sh
# =============================================================================

set -euo pipefail

# -- Config -------------------------------------------------------------------
KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8080}"
MGMT_URL="${MGMT_URL:-http://localhost:11003}"
REALM="edcv"
CLIENT_ID="admin"
CLIENT_SECRET="edc-v-admin-secret"

# Participant context IDs
CLINIC_CTX="d0b1e14e6faa47aca9c2932a5e22885b"
CRO_CTX="4e300dff7d62415e9c409351bb2fe17a"
HDAB_CTX="9ce6ec7ea12a4c6f957774c3783a988c"

# DIDs
CLINIC_DID="did:web:identityhub%3A7083:clinic-charite"
CRO_DID="did:web:identityhub%3A7083:cro-bayer"
HDAB_DID="did:web:identityhub%3A7083:hdab-bfarm"

# EDC-V Management API context
EDC_CTX='["https://w3id.org/edc/connector/management/v2"]'

# -- Helpers ------------------------------------------------------------------
get_token() {
  curl -sf -X POST "${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/token" \
    -d "grant_type=client_credentials&client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}" \
    | python3 -c "import json,sys; print(json.load(sys.stdin)['access_token'])"
}

catalog_request() {
  local consumer_ctx="$1"
  local provider_did="$2"
  local token
  token=$(get_token)
  curl -sf -X POST "${MGMT_URL}/api/mgmt/v1alpha/participants/${consumer_ctx}/catalog" \
    -H "Authorization: Bearer ${token}" \
    -H "Content-Type: application/json" \
    -d "{\"@context\":${EDC_CTX},\"counterPartyDid\":\"${provider_did}\"}"
}

negotiate_contract() {
  local consumer_ctx="$1"
  local provider_ctx="$2"
  local provider_did="$3"
  local offer_id="$4"
  local asset_id="$5"
  local token
  token=$(get_token)
  curl -sf -X POST "${MGMT_URL}/api/mgmt/v5alpha/participants/${consumer_ctx}/contractnegotiations" \
    -H "Authorization: Bearer ${token}" \
    -H "Content-Type: application/json" \
    -d "{
      \"@context\": ${EDC_CTX},
      \"@type\": \"ContractRequest\",
      \"counterPartyAddress\": \"http://controlplane:8082/api/dsp/${provider_ctx}/2025-1\",
      \"protocol\": \"dataspace-protocol-http:2025-1\",
      \"policy\": {
        \"@type\": \"Offer\",
        \"@id\": \"${offer_id}\",
        \"assigner\": \"${provider_did}\",
        \"target\": \"${asset_id}\",
        \"permission\": [{\"action\": \"use\"}]
      }
    }"
}

check_negotiation_state() {
  local consumer_ctx="$1"
  local negotiation_id="$2"
  local token
  token=$(get_token)
  curl -sf "${MGMT_URL}/api/mgmt/v5alpha/participants/${consumer_ctx}/contractnegotiations/${negotiation_id}" \
    -H "Authorization: Bearer ${token}" \
    -H "Content-Type: application/json"
}

# =============================================================================
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║   Phase 4c: Federated Catalog with HealthDCAT-AP           ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# -- Step 1: CRO discovers Clinic catalog ------------------------------------
echo "━━━ Step 1: CRO discovers Clinic catalog via DSP 2025-1 ━━━"
CRO_CATALOG=$(catalog_request "$CRO_CTX" "$CLINIC_DID")
CRO_DS_COUNT=$(echo "$CRO_CATALOG" | python3 -c "import json,sys; print(len(json.load(sys.stdin).get('dataset',[])))")
echo "  CRO discovered ${CRO_DS_COUNT} datasets from Clinic"
echo "$CRO_CATALOG" | python3 -c "
import json,sys
data=json.load(sys.stdin)
for d in data.get('dataset',[]):
    print(f'    - {d[\"@id\"]:30s} {d.get(\"edc:name\",\"?\")}')" || true
echo ""

# -- Step 2: HDAB discovers Clinic catalog ------------------------------------
echo "━━━ Step 2: HDAB discovers Clinic catalog via DSP 2025-1 ━━━"
HDAB_CATALOG=$(catalog_request "$HDAB_CTX" "$CLINIC_DID")
HDAB_DS_COUNT=$(echo "$HDAB_CATALOG" | python3 -c "import json,sys; print(len(json.load(sys.stdin).get('dataset',[])))")
echo "  HDAB discovered ${HDAB_DS_COUNT} datasets from Clinic"
echo "$HDAB_CATALOG" | python3 -c "
import json,sys
data=json.load(sys.stdin)
for d in data.get('dataset',[]):
    print(f'    - {d[\"@id\"]:30s} {d.get(\"edc:name\",\"?\")}')" || true
echo ""

# -- Step 3: Extract HealthDCAT-AP catalog offer ID ---------------------------
echo "━━━ Step 3: Extract HealthDCAT-AP catalog offer for HDAB ━━━"
CATALOG_OFFER_ID=$(echo "$HDAB_CATALOG" | python3 -c "
import json,sys
data=json.load(sys.stdin)
for d in data.get('dataset',[]):
    if d['@id']=='healthdcatap-catalog':
        policies=d.get('hasPolicy',[])
        if isinstance(policies,dict): policies=[policies]
        print(policies[0]['@id'])
        break
")
echo "  HealthDCAT-AP offer ID: ${CATALOG_OFFER_ID:0:40}..."
echo ""

# -- Step 4: HDAB negotiates contract for catalog metadata --------------------
echo "━━━ Step 4: HDAB negotiates catalog metadata contract ━━━"
NEG_RESULT=$(negotiate_contract "$HDAB_CTX" "$CLINIC_CTX" "$CLINIC_DID" "$CATALOG_OFFER_ID" "healthdcatap-catalog")
NEG_ID=$(echo "$NEG_RESULT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('@id','?'))")
echo "  Negotiation initiated: ${NEG_ID}"
echo ""

# -- Step 5: Wait for FINALIZED state ----------------------------------------
echo "━━━ Step 5: Waiting for contract negotiation to finalize ━━━"
MAX_WAIT=30
for i in $(seq 1 $MAX_WAIT); do
  sleep 2
  STATE_JSON=$(check_negotiation_state "$HDAB_CTX" "$NEG_ID" 2>/dev/null || echo '{"state":"ERROR"}')
  STATE=$(echo "$STATE_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin).get('state','UNKNOWN'))")
  echo "  [$i/${MAX_WAIT}] State: ${STATE}"
  if [ "$STATE" = "FINALIZED" ]; then
    AGREEMENT_ID=$(echo "$STATE_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin).get('contractAgreementId','?'))")
    echo ""
    echo "  ✅ Contract FINALIZED!"
    echo "  Agreement ID: ${AGREEMENT_ID}"
    break
  elif [ "$STATE" = "TERMINATED" ] || [ "$STATE" = "ERROR" ]; then
    ERROR=$(echo "$STATE_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin).get('errorDetail','unknown'))")
    echo "  ❌ Negotiation failed: ${ERROR}"
    break
  fi
done
echo ""

# -- Step 6: Initiate transfer process for catalog metadata -------------------
if [ "${STATE:-}" = "FINALIZED" ]; then
  echo "━━━ Step 6: HDAB initiates catalog metadata transfer ━━━"
  TOKEN=$(get_token)
  TRANSFER_RESULT=$(curl -sf -X POST "${MGMT_URL}/api/mgmt/v5alpha/participants/${HDAB_CTX}/transferprocesses" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{
      \"@context\": ${EDC_CTX},
      \"@type\": \"TransferRequest\",
      \"protocol\": \"dataspace-protocol-http:2025-1\",
      \"counterPartyAddress\": \"http://controlplane:8082/api/dsp/${CLINIC_CTX}/2025-1\",
      \"contractId\": \"${AGREEMENT_ID}\",
      \"assetId\": \"healthdcatap-catalog\",
      \"transferType\": \"HttpData-PULL\",
      \"dataDestination\": { \"@type\": \"DataAddress\", \"type\": \"HttpProxy\" }
    }")
  TRANSFER_ID=$(echo "$TRANSFER_RESULT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('@id','?'))")
  echo "  Transfer initiated: ${TRANSFER_ID}"
  echo ""

  # Wait for transfer to start
  echo "━━━ Step 7: Waiting for transfer to start ━━━"
  for i in $(seq 1 15); do
    sleep 2
    TOKEN=$(get_token)
    TP_JSON=$(curl -sf "${MGMT_URL}/api/mgmt/v5alpha/participants/${HDAB_CTX}/transferprocesses/${TRANSFER_ID}" \
      -H "Authorization: Bearer ${TOKEN}" 2>/dev/null || echo '{"state":"ERROR"}')
    TP_STATE=$(echo "$TP_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin).get('state','UNKNOWN'))")
    echo "  [$i/15] Transfer state: ${TP_STATE}"
    if [ "$TP_STATE" = "STARTED" ] || [ "$TP_STATE" = "COMPLETED" ]; then
      echo ""
      echo "  ✅ Transfer ${TP_STATE}!"
      break
    elif [ "$TP_STATE" = "TERMINATED" ] || [ "$TP_STATE" = "ERROR" ]; then
      echo "  ❌ Transfer failed"
      break
    fi
  done
fi

# -- Summary ------------------------------------------------------------------
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║   Federated Catalog Summary                                ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  CRO  → Clinic: ${CRO_DS_COUNT} datasets discovered via DSP             ║"
echo "║  HDAB → Clinic: ${HDAB_DS_COUNT} datasets discovered via DSP             ║"
echo "║                                                            ║"
echo "║  Discoverable Assets:                                      ║"
echo "║    1. fhir-patient-everything    (FHIR R4)                 ║"
echo "║    2. fhir-cohort-bundle         (FHIR R4)                 ║"
echo "║    3. omop-cohort-statistics     (OMOP CDM)                ║"
echo "║    4. healthdcatap-catalog       (JSON-LD)                 ║"
echo "║                                                            ║"
echo "║  HDAB Catalog Contract: ${STATE:-UNKNOWN}                        ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
