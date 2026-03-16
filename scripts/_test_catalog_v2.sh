#!/usr/bin/env bash
# Test catalog request: pharmaco requesting alpha-klinik's catalog

set -euo pipefail

KC_URL="http://localhost:8080"
KC_REALM="edcv"
MGMT_URL="http://localhost:11003/api/mgmt"
PHARMACO_CTX="d6201c5b64854ea0a81dca4b714917cf"
ALPHA_CTX="5c0ed83adbe44c82b8cf8e5e4772ab5f"
DSP_ADDR="http://controlplane:8082/api/dsp/${ALPHA_CTX}/2025-1"

echo "=== Catalog Request Test ==="
echo "Consumer: pharmaco ($PHARMACO_CTX)"
echo "Provider DSP: $DSP_ADDR"
echo ""

# Get token
TOKEN=$(curl -sf -X POST "${KC_URL}/realms/${KC_REALM}/protocol/openid-connect/token" \
  -d "grant_type=client_credentials" \
  -d "client_id=admin" \
  -d "client_secret=edc-v-admin-secret" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

echo "Token acquired: ${TOKEN:0:20}..."
echo ""

# Catalog request
echo "Sending catalog request..."
RESPONSE=$(curl -s --max-time 60 -w "\n__HTTP_CODE__%{http_code}" \
  -X POST "${MGMT_URL}/v5alpha/participants/${PHARMACO_CTX}/catalog/request" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d "{
    \"@context\": [\"https://w3id.org/edc/connector/management/v2\"],
    \"@type\": \"CatalogRequest\",
    \"counterPartyAddress\": \"${DSP_ADDR}\",
    \"counterPartyId\": \"did:web:identityhub%3A7083:alpha-klinik\",
    \"protocol\": \"dataspace-protocol-http:2025-1\"
  }")

HTTP_CODE=$(echo "$RESPONSE" | grep "__HTTP_CODE__" | sed 's/__HTTP_CODE__//')
BODY=$(echo "$RESPONSE" | grep -v "__HTTP_CODE__")

echo "HTTP Code: $HTTP_CODE"
echo ""
echo "Response (first 2000 chars):"
echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d, indent=2)[:2000])" 2>/dev/null || echo "$BODY" | head -40
