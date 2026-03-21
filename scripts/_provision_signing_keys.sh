#!/usr/bin/env bash
set -euo pipefail
# Store Ed25519 signing keys for all participants using vault CLI
# (bypasses URL encoding issues with HTTP API)

echo "=== Generating and storing Ed25519 signing keys for participants ==="

# Generate keys using Python
KEYS_JSON=$(python3 -c '
import json, base64
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat, PrivateFormat, NoEncryption

def b64url(data):
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()

participants = {
    "5c0ed83adbe44c82b8cf8e5e4772ab5f": "alpha-klinik",
    "d6201c5b64854ea0a81dca4b714917cf": "pharmaco",
    "8b2d6ae71b304ff5817712d118e13d5b": "medreg",
    "8f2de4d8edd04e69bd049d2285077dc3": "lmc",
    "b3c8eeffc22e41c1aaa1c077d77c2e81": "irs",
}

result = {}
for ctx_id, slug in participants.items():
    kid = f"did:web:identityhub%3A7083:{slug}#key1"
    pk = Ed25519PrivateKey.generate()
    d = b64url(pk.private_bytes(Encoding.Raw, PrivateFormat.Raw, NoEncryption()))
    x = b64url(pk.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw))
    jwk = {"kty":"OKP","crv":"Ed25519","kid":kid,"d":d,"x":x}
    result[slug] = {"ctx_id": ctx_id, "kid": kid, "jwk": json.dumps(jwk)}

print(json.dumps(result))
')

echo "Keys generated"

# Store each key via vault CLI inside the vault container
for SLUG in alpha-klinik pharmaco medreg lmc irs; do
    CTX_ID=$(echo "$KEYS_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['$SLUG']['ctx_id'])")
    KID=$(echo "$KEYS_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['$SLUG']['kid'])")
    JWK=$(echo "$KEYS_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['$SLUG']['jwk'])")

    echo ""
    echo "--- $SLUG ($CTX_ID) ---"
    echo "  keyId: $KID"

    # Store in secret/ mount (global - used by IdentityHub STS)
    docker exec -e VAULT_ADDR=http://127.0.0.1:8200 -e VAULT_TOKEN=root \
        health-dataspace-vault vault kv put -mount=secret "$KID" "content=$JWK"
    echo "  ✓ Stored in secret/ mount"

    # Also store in participants/ mount (per-participant path)
    FOLDER="${CTX_ID}/identityhub"
    docker exec -e VAULT_ADDR=http://127.0.0.1:8200 -e VAULT_TOKEN=root \
        health-dataspace-vault vault kv put -mount=participants "${FOLDER}/${KID}" "content=$JWK"
    echo "  ✓ Stored in participants/ mount"
done

echo ""
echo "=== Verification ==="
for SLUG in alpha-klinik pharmaco medreg lmc irs; do
    KID=$(echo "$KEYS_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['$SLUG']['kid'])")
    RESULT=$(docker exec -e VAULT_ADDR=http://127.0.0.1:8200 -e VAULT_TOKEN=root \
        health-dataspace-vault vault kv get -mount=secret -field=content "$KID" 2>/dev/null || echo "NOT_FOUND")
    if [ "$RESULT" != "NOT_FOUND" ]; then
        echo "  $SLUG: YES (in secret/ mount)"
    else
        echo "  $SLUG: NOT FOUND"
    fi
done
