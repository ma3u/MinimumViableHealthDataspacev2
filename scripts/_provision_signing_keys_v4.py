#!/usr/bin/env python3
"""
Provision Ed25519 signing keys for all participants in Vault.

KEY INSIGHT: EDC's okhttp client DOUBLE-encodes the key alias:
  1. EDC Java code URL-encodes: did:web:identityhub%3A7083:pharmaco#key1
     → did%3Aweb%3Aidentityhub%253A7083%3Apharmaco%23key1
  2. okhttp URL-encodes path segment AGAIN:
     → did%253Aweb%253Aidentityhub%25253A7083%253Apharmaco%2523key1

Vault's Go HTTP server decodes once, giving internal path:
  did%3Aweb%3Aidentityhub%253A7083%3Apharmaco%23key1

So we must store keys at THAT path (with literal % chars).
Using curl --path-as-is with double-encoded alias achieves this.
"""

import subprocess, json, sys, base64
from urllib.parse import quote

VAULT_ADDR = "http://localhost:8200"
VAULT_TOKEN = "root"

KC_URL = "http://localhost:8080"
KC_ADMIN_USER = "admin"
KC_ADMIN_PASS = "admin"
KC_REALM = "edcv"
MGMT_URL = "http://localhost:11005/api/identity"

PARTICIPANTS = [
    {"slug": "alpha-klinik"},
    {"slug": "pharmaco"},
    {"slug": "medreg"},
    {"slug": "lmc"},
    {"slug": "irs"},
]

def get_kc_admin_token():
    r = subprocess.run([
        "curl", "-sf", "-X", "POST",
        f"{KC_URL}/realms/master/protocol/openid-connect/token",
        "-d", "grant_type=password",
        "-d", f"username={KC_ADMIN_USER}",
        "-d", f"password={KC_ADMIN_PASS}",
        "-d", "client_id=admin-cli",
    ], capture_output=True, text=True)
    return json.loads(r.stdout)["access_token"]

def get_mgmt_token():
    r = subprocess.run([
        "curl", "-sf", "-X", "POST",
        f"{KC_URL}/realms/{KC_REALM}/protocol/openid-connect/token",
        "-d", "grant_type=client_credentials",
        "-d", "client_id=admin",
        "-d", "client_secret=edc-v-admin-secret",
    ], capture_output=True, text=True)
    return json.loads(r.stdout)["access_token"]

def get_participants(mgmt_token):
    r = subprocess.run([
        "curl", "-sf",
        f"{MGMT_URL}/v1alpha/participants",
        "-H", f"Authorization: Bearer {mgmt_token}",
    ], capture_output=True, text=True)
    return json.loads(r.stdout)

def get_participant_detail(mgmt_token, ctx_id):
    r = subprocess.run([
        "curl", "-sf",
        f"{MGMT_URL}/v1alpha/participants/{ctx_id}",
        "-H", f"Authorization: Bearer {mgmt_token}",
    ], capture_output=True, text=True)
    return json.loads(r.stdout)

def get_participant_keypairs(mgmt_token, ctx_id):
    r = subprocess.run([
        "curl", "-sf",
        f"{MGMT_URL}/v1alpha/participants/{ctx_id}/keypairs",
        "-H", f"Authorization: Bearer {mgmt_token}",
    ], capture_output=True, text=True)
    try:
        return json.loads(r.stdout)
    except:
        return []

def get_kc_client_secret(kc_token, client_id):
    # Find client UUID
    r = subprocess.run([
        "curl", "-sf",
        f"{KC_URL}/admin/realms/{KC_REALM}/clients?clientId={client_id}",
        "-H", f"Authorization: Bearer {kc_token}",
    ], capture_output=True, text=True)
    clients = json.loads(r.stdout)
    if not clients:
        return None
    uuid = clients[0]["id"]
    # Get secret
    r = subprocess.run([
        "curl", "-sf",
        f"{KC_URL}/admin/realms/{KC_REALM}/clients/{uuid}/client-secret",
        "-H", f"Authorization: Bearer {kc_token}",
    ], capture_output=True, text=True)
    return json.loads(r.stdout).get("value")

def get_vault_token_for_participant(ctx_id, kc_token):
    """Get a Vault token using the participant's -vault KC client."""
    vault_client_id = f"{ctx_id}-vault"
    secret = get_kc_client_secret(kc_token, vault_client_id)
    if not secret:
        print(f"  WARNING: No KC client secret for {vault_client_id}")
        return None

    # Get KC token for vault client
    r = subprocess.run([
        "curl", "-sf", "-X", "POST",
        f"{KC_URL}/realms/{KC_REALM}/protocol/openid-connect/token",
        "-d", "grant_type=client_credentials",
        "-d", f"client_id={vault_client_id}",
        "-d", f"client_secret={secret}",
    ], capture_output=True, text=True)
    kc_jwt = json.loads(r.stdout).get("access_token")
    if not kc_jwt:
        print(f"  WARNING: Could not get KC token for {vault_client_id}")
        return None

    # Login to Vault with JWT
    r = subprocess.run([
        "curl", "-sf", "-X", "POST",
        f"{VAULT_ADDR}/v1/auth/jwt/login",
        "-d", json.dumps({"role": "participant", "jwt": kc_jwt}),
    ], capture_output=True, text=True)
    result = json.loads(r.stdout)
    vault_token = result.get("auth", {}).get("client_token")
    return vault_token

def generate_ed25519_jwk():
    """Generate Ed25519 key pair as JWK using openssl."""
    # Generate private key
    r = subprocess.run(
        ["openssl", "genpkey", "-algorithm", "Ed25519", "-outform", "DER"],
        capture_output=True
    )
    private_der = r.stdout

    # Extract public key
    r = subprocess.run(
        ["openssl", "pkey", "-inform", "DER", "-pubout", "-outform", "DER"],
        input=private_der, capture_output=True
    )
    public_der = r.stdout

    # Ed25519 public key is last 32 bytes of DER
    pub_bytes = public_der[-32:]
    # Ed25519 private key: the seed is at specific offset in DER
    # PKCS8 DER for Ed25519: 48 bytes total, seed at offset 16
    priv_seed = private_der[16:48]

    x = base64.urlsafe_b64encode(pub_bytes).rstrip(b'=').decode()
    d = base64.urlsafe_b64encode(priv_seed).rstrip(b'=').decode()

    private_jwk = {
        "kty": "OKP",
        "crv": "Ed25519",
        "x": x,
        "d": d,
    }
    public_jwk = {
        "kty": "OKP",
        "crv": "Ed25519",
        "x": x,
    }
    return private_jwk, public_jwk

def store_in_vault_double_encoded(ctx_id, alias, private_jwk, vault_token=None):
    """Store private key at the double-encoded path that EDC will look up.

    EDC okhttp double-encodes: alias → URLEncode(alias) → URLEncode(URLEncode(alias))
    Vault Go server decodes once → stored path = URLEncode(alias)
    So we need to send double-encoded path via curl --path-as-is.
    """
    token = vault_token or VAULT_TOKEN

    # Double-encode: first encode the alias, then encode the result
    single_encoded = quote(alias, safe='')
    double_encoded = quote(single_encoded, safe='')

    vault_path = f"participants/data/{ctx_id}/identityhub/{double_encoded}"
    url = f"{VAULT_ADDR}/v1/{vault_path}"

    payload = json.dumps({"data": {"content": json.dumps(private_jwk)}})

    r = subprocess.run([
        "curl", "--path-as-is", "-sf", "-X", "POST", url,
        "-H", f"X-Vault-Token: {token}",
        "-H", "Content-Type: application/json",
        "-d", payload,
    ], capture_output=True, text=True)

    return r.returncode == 0, r.stdout, r.stderr

def verify_read_double_encoded(ctx_id, alias, vault_token=None):
    """Verify key readable at double-encoded path (same as EDC lookup)."""
    token = vault_token or VAULT_TOKEN

    single_encoded = quote(alias, safe='')
    double_encoded = quote(single_encoded, safe='')

    vault_path = f"participants/data/{ctx_id}/identityhub/{double_encoded}"
    url = f"{VAULT_ADDR}/v1/{vault_path}"

    r = subprocess.run([
        "curl", "--path-as-is", "-sf", url,
        "-H", f"X-Vault-Token: {token}",
    ], capture_output=True, text=True)

    try:
        data = json.loads(r.stdout)
        content = data.get("data", {}).get("data", {})
        return list(content.keys())
    except:
        return []

def main():
    print("=== Provisioning Signing Keys (v4 - Double Encoded) ===\n")

    kc_token = get_kc_admin_token()
    mgmt_token = get_mgmt_token()
    participants = get_participants(mgmt_token)

    # Build ctx_id → slug mapping
    ctx_map = {}
    for p in participants:
        ctx_id = p["participantContextId"]
        did = p.get("did", "")
        # Match against known slugs
        for slug_info in PARTICIPANTS:
            if slug_info["slug"] in did:
                # Get keypairs for this participant
                keypairs = get_participant_keypairs(mgmt_token, ctx_id)
                if isinstance(keypairs, list) and keypairs:
                    kp = keypairs[0]
                    ctx_map[ctx_id] = {
                        "slug": slug_info["slug"],
                        "alias": kp.get("privateKeyAlias", kp.get("keyId", "")),
                        "keyId": kp.get("keyId", ""),
                    }
                break

    print(f"Found {len(ctx_map)} participants with keypairs\n")

    results = []
    for ctx_id, info in ctx_map.items():
        slug = info["slug"]
        alias = info["alias"]
        print(f"--- {slug} (ctx={ctx_id[:8]}...) ---")
        print(f"  Alias: {alias}")

        # Get participant vault token
        vault_token = get_vault_token_for_participant(ctx_id, kc_token)
        if vault_token:
            print(f"  Vault JWT token: obtained")
        else:
            print(f"  WARNING: No vault token, using root")
            vault_token = VAULT_TOKEN

        # Generate key
        private_jwk, public_jwk = generate_ed25519_jwk()
        print(f"  Generated Ed25519 key (x={private_jwk['x'][:16]}...)")

        # Store at double-encoded path with ROOT token
        # (root can write anywhere, participant token may have restrictions)
        ok, stdout, stderr = store_in_vault_double_encoded(ctx_id, alias, private_jwk, VAULT_TOKEN)
        print(f"  Store (root, double-encoded): {'OK' if ok else 'FAIL'}")

        # Also store with participant token for good measure
        ok2, _, _ = store_in_vault_double_encoded(ctx_id, alias, private_jwk, vault_token)
        print(f"  Store (jwt, double-encoded): {'OK' if ok2 else 'FAIL'}")

        # Verify with root token
        keys = verify_read_double_encoded(ctx_id, alias, VAULT_TOKEN)
        print(f"  Verify (root, double-encoded): keys={keys}")

        # Verify with participant JWT token
        keys2 = verify_read_double_encoded(ctx_id, alias, vault_token)
        print(f"  Verify (jwt, double-encoded): keys={keys2}")

        results.append({
            "slug": slug,
            "stored": ok,
            "verified_root": len(keys) > 0,
            "verified_jwt": len(keys2) > 0,
        })
        print()

    print("=== Summary ===")
    for r in results:
        root_ok = "YES" if r["verified_root"] else "NO"
        jwt_ok = "YES" if r["verified_jwt"] else "NO"
        print(f"  {r['slug']}: stored={r['stored']} root_read={root_ok} jwt_read={jwt_ok}")

if __name__ == "__main__":
    main()
