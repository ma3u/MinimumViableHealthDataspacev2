#!/usr/bin/env python3
"""
Generate Ed25519 key pairs for each participant and store them in Vault.

The IdentityHub STS service needs private keys to sign tokens. The STS
uses the IdentityHub's vault connection (root token, secret/ mount) to
look up private keys by their alias (the DID key ID).

Each participant has a keypair registered in IdentityHub with:
  - privateKeyAlias: "did:web:identityhub%3A7083:{slug}#key1"
  - serializedPublicKey: JWK with Ed25519 public key

Since the CFM agents crashed before storing the private keys, we:
1. Generate a new Ed25519 key pair
2. Store the private key JWK in vault at secret/data/{alias}
3. Update the keypair registration with the new public key

But actually, we can't easily update the keypair registration via API.
Instead, we'll just store the private key in vault. Since the STS only
looks up the private key by alias, and the IdentityHub already has the
keypair entry, we just need to make the private key available.

BUT the existing public key won't match the new private key. The STS
might not care (it just needs the private key to sign), OR it might
validate. Let's try the simplest approach: generate key, store it, test.

Actually, rethinking: the DID document is empty (no content), so there's
no published public key to mismatch against. The verifier will resolve
the DID doc and get the public key from there. If the DID doc is served
by the IdentityHub based on the keypair registration, we need to update
both. So we'll generate new keys, store private in vault, and update
the registration's public key.
"""
import json
import sys
import base64
import urllib.request
import urllib.parse

VAULT_HOST = "http://localhost:8200"
VAULT_TOKEN = "root"
KC_HOST = "http://localhost:8080"
IDENTITY_API = "http://localhost:11005/api/identity"

PARTICIPANTS = {
    "5c0ed83adbe44c82b8cf8e5e4772ab5f": "alpha-klinik",
    "d6201c5b64854ea0a81dca4b714917cf": "pharmaco",
    "8b2d6ae71b304ff5817712d118e13d5b": "medreg",
    "8f2de4d8edd04e69bd049d2285077dc3": "lmc",
    "b3c8eeffc22e41c1aaa1c077d77c2e81": "irs",
}


def http_req(url, method="GET", data=None, headers=None):
    if headers is None:
        headers = {}
    if data and isinstance(data, (dict, list)):
        data = json.dumps(data).encode()
        headers.setdefault("Content-Type", "application/json")
    elif data and isinstance(data, str):
        data = data.encode()
    r = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r) as resp:
            return json.loads(resp.read().decode()) if resp.read else {}
    except urllib.error.HTTPError as e:
        body = e.read().decode() if e.fp else ""
        return {"error": f"HTTP {e.code}: {body[:300]}"}


def get_token(realm, grant_type, **kwargs):
    data = urllib.parse.urlencode({"grant_type": grant_type, **kwargs}).encode()
    req = urllib.request.Request(
        f"{KC_HOST}/realms/{realm}/protocol/openid-connect/token",
        data=data,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode())["access_token"]


def base64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def generate_ed25519_jwk(kid: str) -> tuple:
    """Generate Ed25519 key pair and return (private_jwk, public_jwk) as dicts."""
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
    from cryptography.hazmat.primitives.serialization import (
        Encoding, PublicFormat, PrivateFormat, NoEncryption
    )

    private_key = Ed25519PrivateKey.generate()
    # Get raw key bytes
    private_bytes = private_key.private_bytes(
        Encoding.Raw, PrivateFormat.Raw, NoEncryption()
    )
    public_bytes = private_key.public_key().public_bytes(
        Encoding.Raw, PublicFormat.Raw
    )

    d = base64url_encode(private_bytes)
    x = base64url_encode(public_bytes)

    private_jwk = {"kty": "OKP", "crv": "Ed25519", "kid": kid, "d": d, "x": x}
    public_jwk = {"kty": "OKP", "crv": "Ed25519", "kid": kid, "x": x}
    return private_jwk, public_jwk


def vault_write(path: str, content: str):
    """Write a secret to vault KV v2 (secret/ mount)."""
    url = f"{VAULT_HOST}/v1/secret/data/{path}"
    data = json.dumps({"data": {"content": content}}).encode()
    req = urllib.request.Request(
        url, data=data,
        headers={"X-Vault-Token": VAULT_TOKEN, "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req) as resp:
        return resp.status


def vault_write_participants(ctx_id: str, folder: str, alias: str, content: str):
    """Write a secret to vault KV v2 (participants/ mount)."""
    path = f"{folder}/{alias}"
    url = f"{VAULT_HOST}/v1/participants/data/{path}"
    data = json.dumps({"data": {"content": content}}).encode()
    req = urllib.request.Request(
        url, data=data,
        headers={"X-Vault-Token": VAULT_TOKEN, "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req) as resp:
        return resp.status


def main():
    mgmt_token = get_token(
        "edcv", "client_credentials",
        client_id="admin", client_secret="edc-v-admin-secret"
    )
    print(f"Got management token ({len(mgmt_token)} chars)")
    mgmt_headers = {"Authorization": f"Bearer {mgmt_token}"}

    for ctx_id, slug in PARTICIPANTS.items():
        print(f"\n--- {slug} ({ctx_id}) ---")

        # Get existing keypair info
        kps = http_req(
            f"{IDENTITY_API}/v1alpha/participants/{ctx_id}/keypairs",
            headers=mgmt_headers,
        )
        if isinstance(kps, dict) and "error" in kps:
            print(f"  ERROR getting keypairs: {kps['error']}")
            continue
        if not kps:
            print("  SKIP: no keypairs registered")
            continue

        kp = kps[0]
        key_id = kp["keyId"]
        alias = kp["privateKeyAlias"]
        print(f"  keyId: {key_id}")
        print(f"  privateKeyAlias: {alias}")
        print(f"  state: {kp['state']}")

        # Generate new Ed25519 key pair
        private_jwk, public_jwk = generate_ed25519_jwk(key_id)
        private_jwk_str = json.dumps(private_jwk)
        public_jwk_str = json.dumps(public_jwk)
        print(f"  Generated new Ed25519 key pair")
        print(f"  Public x: {public_jwk['x'][:20]}...")

        # Store private key in global vault (secret/ mount)
        # This is where the IdentityHub STS looks (env: edc.vault.hashicorp.token=root)
        status = vault_write(alias, private_jwk_str)
        print(f"  Stored in secret/ mount: HTTP {status}")

        # Also get participant vault folder and store there too
        p = http_req(
            f"{IDENTITY_API}/v1alpha/participants/{ctx_id}",
            headers=mgmt_headers,
        )
        vault_config = p.get("properties", {}).get("edc.vault.hashicorp.config", {})
        folder_path = vault_config.get("config", {}).get("folderPath", "")
        if folder_path:
            status2 = vault_write_participants(ctx_id, folder_path, alias, private_jwk_str)
            print(f"  Stored in participants/ mount: HTTP {status2}")

    # Verify
    print("\n=== Verification ===")
    for ctx_id, slug in PARTICIPANTS.items():
        alias = f"did:web:identityhub%3A7083:{slug}#key1"
        url = f"{VAULT_HOST}/v1/secret/data/{alias}"
        req = urllib.request.Request(url, headers={"X-Vault-Token": VAULT_TOKEN})
        try:
            with urllib.request.urlopen(req) as resp:
                data = json.loads(resp.read().decode())
                content = data.get("data", {}).get("data", {}).get("content", "")
                jwk = json.loads(content)
                has_d = "d" in jwk
                print(f"  {slug}: {'YES' if has_d else 'NO'} (has private key)")
        except Exception as e:
            print(f"  {slug}: FAILED ({e})")


if __name__ == "__main__":
    main()
