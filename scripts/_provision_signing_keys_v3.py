#!/usr/bin/env python3
"""
Store Ed25519 signing keys at the EXACT vault paths the EDC Java client uses.

The EDC vault client URL-encodes the key alias before sending to vault.
For alias: did:web:identityhub%3A7083:pharmaco#key1
EDC sends: did%3Aweb%3Aidentityhub%253A7083%3Apharmaco%23key1

This script stores keys at BOTH:
1. The URL-encoded path (for EDC vault client)
2. The literal path (for vault CLI lookups)
"""
import json
import sys
import base64
import urllib.request
import urllib.parse
import subprocess

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


def http_json(url, method="GET", data=None, headers=None):
    if headers is None:
        headers = {}
    if data and isinstance(data, (dict, list)):
        data = json.dumps(data).encode()
        headers.setdefault("Content-Type", "application/json")
    r = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r) as resp:
            raw = resp.read().decode()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        body = e.read().decode() if e.fp else ""
        return {"error": f"HTTP {e.code}: {body[:300]}"}


def base64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def generate_ed25519_jwk(kid: str) -> tuple:
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
    from cryptography.hazmat.primitives.serialization import (
        Encoding, PublicFormat, PrivateFormat, NoEncryption
    )
    private_key = Ed25519PrivateKey.generate()
    private_bytes = private_key.private_bytes(Encoding.Raw, PrivateFormat.Raw, NoEncryption())
    public_bytes = private_key.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)
    d = base64url_encode(private_bytes)
    x = base64url_encode(public_bytes)
    return (
        {"kty": "OKP", "crv": "Ed25519", "kid": kid, "d": d, "x": x},
        {"kty": "OKP", "crv": "Ed25519", "kid": kid, "x": x},
    )


def url_encode_alias(alias: str) -> str:
    """URL-encode exactly like Java's URI encoder does for path segments."""
    # Java URLEncoder.encode encodes: space->+, all special chars
    # But EDC uses URI path encoding: : -> %3A, % -> %25, # -> %23
    result = []
    for ch in alias:
        if ch == ':':
            result.append('%3A')
        elif ch == '%':
            result.append('%25')
        elif ch == '#':
            result.append('%23')
        elif ch == ' ':
            result.append('%20')
        else:
            result.append(ch)
    return ''.join(result)


def vault_write_curl(mount: str, path: str, content: str) -> int:
    """Write to vault using curl --path-as-is to preserve exact URL encoding."""
    url = f"{VAULT_HOST}/v1/{mount}/data/{path}"
    payload = json.dumps({"data": {"content": content}})
    result = subprocess.run(
        ["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}",
         "--path-as-is",
         "-X", "POST", url,
         "-H", f"X-Vault-Token: {VAULT_TOKEN}",
         "-H", "Content-Type: application/json",
         "-d", payload],
        capture_output=True, text=True
    )
    return int(result.stdout.strip())


def main():
    mgmt_token = get_token(
        "edcv", "client_credentials",
        client_id="admin", client_secret="edc-v-admin-secret"
    )
    print(f"Management token: {len(mgmt_token)} chars")
    mgmt_headers = {"Authorization": f"Bearer {mgmt_token}"}

    for ctx_id, slug in PARTICIPANTS.items():
        print(f"\n--- {slug} ({ctx_id}) ---")

        # Get existing keypair
        kps = http_json(
            f"{IDENTITY_API}/v1alpha/participants/{ctx_id}/keypairs",
            headers=mgmt_headers,
        )
        if isinstance(kps, dict) and "error" in kps:
            print(f"  ERROR: {kps['error']}")
            continue
        if not kps:
            print("  SKIP: no keypairs")
            continue

        kp = kps[0]
        key_id = kp["keyId"]
        alias = kp["privateKeyAlias"]

        # Generate new key pair
        private_jwk, public_jwk = generate_ed25519_jwk(key_id)
        jwk_str = json.dumps(private_jwk)

        # URL-encode the alias the same way EDC Java does
        encoded_alias = url_encode_alias(alias)
        print(f"  alias:         {alias}")
        print(f"  encoded alias: {encoded_alias}")

        # Get participant vault folder
        p = http_json(
            f"{IDENTITY_API}/v1alpha/participants/{ctx_id}",
            headers=mgmt_headers,
        )
        folder = p.get("properties", {}).get(
            "edc.vault.hashicorp.config", {}
        ).get("config", {}).get("folderPath", "")

        # Store with URL-encoded alias in participants/ mount
        # This matches what EDC sends: participants/data/{folder}/{encoded_alias}
        encoded_path = f"{folder}/{encoded_alias}"
        status = vault_write_curl("participants", encoded_path, jwk_str)
        print(f"  participants/ (encoded): HTTP {status}")

        # Also store with literal alias for vault CLI compatibility
        literal_path = f"{folder}/{alias}"
        status2 = vault_write_curl("participants", literal_path, jwk_str)
        print(f"  participants/ (literal): HTTP {status2}")

        # Also store in secret/ mount (both forms)
        status3 = vault_write_curl("secret", encoded_alias, jwk_str)
        print(f"  secret/ (encoded): HTTP {status3}")
        status4 = vault_write_curl("secret", alias, jwk_str)
        print(f"  secret/ (literal): HTTP {status4}")

    # Verify by reading via curl with --path-as-is
    print("\n=== Verification (EDC path format) ===")
    for ctx_id, slug in PARTICIPANTS.items():
        alias = f"did:web:identityhub%3A7083:{slug}#key1"
        encoded = url_encode_alias(alias)
        p = http_json(
            f"{IDENTITY_API}/v1alpha/participants/{ctx_id}",
            headers=mgmt_headers,
        )
        folder = p.get("properties", {}).get(
            "edc.vault.hashicorp.config", {}
        ).get("config", {}).get("folderPath", "")
        url = f"{VAULT_HOST}/v1/participants/data/{folder}/{encoded}"
        result = subprocess.run(
            ["curl", "-s", "--path-as-is", url,
             "-H", f"X-Vault-Token: {VAULT_TOKEN}"],
            capture_output=True, text=True,
        )
        try:
            data = json.loads(result.stdout)
            content = data.get("data", {}).get("data", {}).get("content", "")
            if content:
                jwk = json.loads(content)
                print(f"  {slug}: {'YES' if 'd' in jwk else 'NO'}")
            else:
                print(f"  {slug}: EMPTY")
        except Exception as e:
            print(f"  {slug}: FAILED ({e})")


if __name__ == "__main__":
    main()
