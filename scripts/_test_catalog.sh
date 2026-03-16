#!/usr/bin/env bash
set -euo pipefail

# Get master admin token
MASTER_TOKEN=$(curl -sf -X POST "http://localhost:8080/realms/master/protocol/openid-connect/token" \
  -d "grant_type=password&client_id=admin-cli&username=admin&password=admin" \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')
echo "Master token: ${#MASTER_TOKEN} chars"

# Get management token using the admin client (not admin-cli)
TOKEN=$(curl -sf -X POST "http://localhost:8080/realms/edcv/protocol/openid-connect/token" \
  -d "grant_type=client_credentials&client_id=admin&client_secret=edc-v-admin-secret" \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')
echo "Management token: ${#TOKEN} chars"

# Test catalog: pharmaco (d6201c5b...) requesting alpha-klinik's catalog
PHARMACO_CTX="d6201c5b64854ea0a81dca4b714917cf"
echo ""
echo "=== Catalog Request: pharmaco -> alpha-klinik ==="
RESULT=$(curl -s -w "\n%{http_code}" -X POST \
  "http://localhost:11003/api/mgmt/v1alpha/participants/${PHARMACO_CTX}/catalog" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"counterPartyDid":"did:web:identityhub%3A7083:alpha-klinik"}')

HTTP_CODE=$(echo "$RESULT" | tail -1)
BODY=$(echo "$RESULT" | sed '$d')
echo "HTTP: $HTTP_CODE"
echo "$BODY" | python3 -m json.tool 2>/dev/null || echo "$BODY"

# Also test alpha-klinik -> pharmaco
ALPHA_CTX="5c0ed83adbe44c82b8cf8e5e4772ab5f"
echo ""
echo "=== Catalog Request: alpha-klinik -> pharmaco ==="
RESULT2=$(curl -s -w "\n%{http_code}" -X POST \
  "http://localhost:11003/api/mgmt/v1alpha/participants/${ALPHA_CTX}/catalog" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"counterPartyDid":"did:web:identityhub%3A7083:pharmaco"}')

HTTP_CODE2=$(echo "$RESULT2" | tail -1)
BODY2=$(echo "$RESULT2" | sed '$d')
echo "HTTP: $HTTP_CODE2"
echo "$BODY2" | python3 -m json.tool 2>/dev/null || echo "$BODY2"
