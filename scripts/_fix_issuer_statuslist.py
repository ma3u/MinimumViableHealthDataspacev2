#!/usr/bin/env python3
"""
Fix the issuer service's statuslist signing key.

The issuer is configured with:
  edc.issuer.statuslist.signing.key.alias=statuslist-signing-key
But this key doesn't exist in vault.

We provision the same Ed25519 key (from the DID key) as the statuslist-signing-key.
After running this, restart the issuer service to regenerate status list JWTs.
"""

import json
import requests
import sys

VAULT_ADDR = "http://localhost:8200"
VAULT_TOKEN = "root"

def vault_get(path):
    """Get a KV2 secret."""
    r = requests.get(
        f"{VAULT_ADDR}/v1/secret/data/{path}",
        headers={"X-Vault-Token": VAULT_TOKEN}
    )
    if r.status_code == 200:
        return r.json()["data"]["data"]
    return None

def vault_put(path, data):
    """Store a KV2 secret."""
    r = requests.post(
        f"{VAULT_ADDR}/v1/secret/data/{path}",
        headers={"X-Vault-Token": VAULT_TOKEN},
        json={"data": data}
    )
    if r.status_code in (200, 204):
        print(f"  ✓ Stored secret at: {path}")
        return True
    else:
        print(f"  ✗ Failed to store at {path}: {r.status_code} {r.text}")
        return False

def main():
    print("=== Fix Issuer Statuslist Signing Key ===\n")

    # Step 1: Get the issuer's DID key from vault
    did_key_alias = "did:web:issuerservice%3A10016:issuer#key-1"
    print(f"1. Getting issuer DID key from vault: {did_key_alias}")
    existing = vault_get(did_key_alias)
    if not existing:
        print("  ✗ Issuer DID key not found in vault!")
        sys.exit(1)

    content = existing.get("content")
    if not content:
        print("  ✗ No 'content' field in vault secret")
        sys.exit(1)

    jwk = json.loads(content)
    print(f"  x: {jwk.get('x')}")
    print(f"  Has private key (d): {'d' in jwk}")

    # Step 2: Store as statuslist-signing-key
    print(f"\n2. Provisioning statuslist-signing-key in vault")
    success = vault_put("statuslist-signing-key", {"content": content})
    if not success:
        sys.exit(1)

    # Step 3: Verify
    print(f"\n3. Verifying statuslist-signing-key")
    verify = vault_get("statuslist-signing-key")
    if verify and verify.get("content"):
        vjwk = json.loads(verify["content"])
        print(f"  x: {vjwk.get('x')}")
        print(f"  Matches DID key: {vjwk.get('x') == jwk.get('x')}")
    else:
        print("  ✗ Verification failed")
        sys.exit(1)

    print(f"\n=== Done! Now restart the issuer service: ===")
    print(f"  docker restart health-dataspace-issuerservice")

if __name__ == "__main__":
    main()
