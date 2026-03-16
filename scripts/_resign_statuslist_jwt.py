#!/usr/bin/env python3
"""
Re-sign the issuer's status list JWT with the correct private key.

The stored status list JWT was signed with an old key that no longer matches
the issuer's DID document. This script:
1. Reads the existing JWT from the issuer DB
2. Extracts the payload (keeping it unchanged)
3. Re-signs with the issuer's current private key from vault
4. Updates the raw_vc in the issuer DB
"""

import base64
import json
import subprocess
import sys

def b64url_decode(s):
    s = s.replace('-', '+').replace('_', '/')
    pad = 4 - len(s) % 4
    if pad != 4:
        s += '=' * pad
    return base64.b64decode(s)

def b64url_encode(data):
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode('ascii')

def get_vault_key():
    """Get issuer's private key from vault."""
    result = subprocess.run(
        ["docker", "exec",
         "-e", "VAULT_ADDR=http://127.0.0.1:8200",
         "-e", "VAULT_TOKEN=root",
         "health-dataspace-vault",
         "vault", "kv", "get", "-format=json",
         "secret/did:web:issuerservice%3A10016:issuer#key-1"],
        capture_output=True, text=True
    )
    data = json.loads(result.stdout)
    content = json.loads(data["data"]["data"]["content"])
    return content

def get_status_list_jwt():
    """Get the stored status list JWT from the issuer DB."""
    result = subprocess.run(
        ["docker", "exec", "health-dataspace-postgres",
         "psql", "-U", "issuer", "-d", "issuerservice",
         "-t", "-A",  # tuple-only, no alignment
         "-c", "SELECT raw_vc FROM credential_resource WHERE usage = 'StatusList';"],
        capture_output=True, text=True
    )
    return result.stdout.strip()

def update_status_list_jwt(new_jwt):
    """Update the status list JWT in the issuer DB."""
    sql = f"UPDATE credential_resource SET raw_vc = '{new_jwt}' WHERE usage = 'StatusList';"
    result = subprocess.run(
        ["docker", "exec", "health-dataspace-postgres",
         "psql", "-U", "issuer", "-d", "issuerservice",
         "-c", sql],
        capture_output=True, text=True
    )
    print(f"  DB update: {result.stdout.strip()}")
    if result.returncode != 0:
        print(f"  Error: {result.stderr}")
    return result.returncode == 0

def main():
    print("=== Re-sign Issuer Status List JWT ===\n")

    # Step 1: Get the private key
    print("1. Getting issuer private key from vault...")
    jwk = get_vault_key()
    print(f"   kid: {jwk.get('kid')}")
    print(f"   x: {jwk.get('x')}")

    # Import the private key
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
    d_bytes = b64url_decode(jwk['d'])
    private_key = Ed25519PrivateKey.from_private_bytes(d_bytes)

    # Verify the public key matches
    pub_bytes = private_key.public_key().public_bytes(
        encoding=__import__('cryptography.hazmat.primitives.serialization', fromlist=['Encoding']).Encoding.Raw,
        format=__import__('cryptography.hazmat.primitives.serialization', fromlist=['PublicFormat']).PublicFormat.Raw
    )
    derived_x = b64url_encode(pub_bytes)
    print(f"   Derived x: {derived_x}")
    assert derived_x == jwk['x'], f"Key mismatch: {derived_x} != {jwk['x']}"
    print("   Key verified ✓")

    # Step 2: Get existing JWT
    print("\n2. Getting stored status list JWT from issuer DB...")
    old_jwt = get_status_list_jwt()
    if not old_jwt:
        print("   No status list JWT found!")
        sys.exit(1)
    parts = old_jwt.split('.')
    print(f"   JWT parts: {len(parts)}")

    old_header = json.loads(b64url_decode(parts[0]))
    old_payload = json.loads(b64url_decode(parts[1]))
    print(f"   Old header: {json.dumps(old_header)}")
    print(f"   Old payload iss: {old_payload.get('iss')}")
    print(f"   Old payload sub: {old_payload.get('sub')}")

    # Step 3: Create new JWT with EdDSA algorithm (standard)
    print("\n3. Creating new JWT with corrected algorithm...")
    # Use EdDSA (the standard JWS alg for Ed25519) instead of "Ed25519"
    new_header = {
        "kid": jwk['kid'],
        "alg": "EdDSA"
    }
    print(f"   New header: {json.dumps(new_header)}")

    # Encode header and payload
    header_b64 = b64url_encode(json.dumps(new_header, separators=(',', ':')).encode())
    payload_b64 = b64url_encode(json.dumps(old_payload, separators=(',', ':')).encode())

    # Sign
    signing_input = f"{header_b64}.{payload_b64}".encode('ascii')
    signature = private_key.sign(signing_input)
    sig_b64 = b64url_encode(signature)

    new_jwt = f"{header_b64}.{payload_b64}.{sig_b64}"
    print(f"   New JWT length: {len(new_jwt)}")

    # Step 4: Verify the new JWT
    print("\n4. Verifying new JWT signature...")
    try:
        private_key.public_key().verify(signature, signing_input)
        print("   Signature valid ✓")
    except Exception as e:
        print(f"   Signature INVALID: {e}")
        sys.exit(1)

    # Step 5: Update DB
    print("\n5. Updating issuer DB with new JWT...")
    if update_status_list_jwt(new_jwt):
        print("   Updated ✓")
    else:
        print("   Update failed!")
        sys.exit(1)

    # Step 6: Also update the verifiable_credential JSON if it exists
    print("\n6. Checking if verifiable_credential JSON needs updating...")
    result = subprocess.run(
        ["docker", "exec", "health-dataspace-postgres",
         "psql", "-U", "issuer", "-d", "issuerservice",
         "-t", "-A",
         "-c", "SELECT verifiable_credential::text FROM credential_resource WHERE usage = 'StatusList';"],
        capture_output=True, text=True
    )
    vc_json = result.stdout.strip()
    if vc_json and vc_json != 'null' and vc_json != '':
        print(f"   Has verifiable_credential JSON (length: {len(vc_json)})")
    else:
        print("   No verifiable_credential JSON, skipping")

    print("\n=== Done! Restart issuer service: ===")
    print("  docker restart health-dataspace-issuerservice")
    print("\nThen set credentials back to ISSUED and check the watchdog.")

if __name__ == "__main__":
    main()
