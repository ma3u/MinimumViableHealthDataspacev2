#!/usr/bin/env python3
"""
Rotate keypairs to use new public keys that match the vault private keys.
For each participant: rotate old key (retire it) and add new key with matching public key.
"""

import subprocess, json
from urllib.parse import quote

VAULT_ADDR = "http://localhost:8200"
KC_URL = "http://localhost:8080"
IH_URL = "http://localhost:11005/api/identity"
KC_REALM = "edcv"

SLUGS = ["alpha-klinik", "pharmaco", "medreg", "lmc", "irs"]

def get_mgmt_token():
    r = subprocess.run(["curl", "-sf", "-X", "POST",
        f"{KC_URL}/realms/{KC_REALM}/protocol/openid-connect/token",
        "-d", "grant_type=client_credentials", "-d", "client_id=admin",
        "-d", "client_secret=edc-v-admin-secret"], capture_output=True, text=True)
    return json.loads(r.stdout)["access_token"]

def api_call(method, path, token, data=None):
    cmd = ["curl", "-s", "-w", "\n%{http_code}", "-X", method,
        f"{IH_URL}{path}", "-H", f"Authorization: Bearer {token}",
        "-H", "Content-Type: application/json"]
    if data:
        cmd += ["-d", json.dumps(data)]
    r = subprocess.run(cmd, capture_output=True, text=True)
    lines = r.stdout.strip().split("\n")
    code = lines[-1] if lines else "?"
    body = "\n".join(lines[:-1])
    return code, body

def read_vault_key(ctx_id, alias):
    single_enc = quote(alias, safe='')
    double_enc = quote(single_enc, safe='')
    vault_path = f"participants/data/{ctx_id}/identityhub/{double_enc}"
    r = subprocess.run(["curl", "--path-as-is", "-sf",
        f"{VAULT_ADDR}/v1/{vault_path}",
        "-H", "X-Vault-Token: root"], capture_output=True, text=True)
    try:
        vault_data = json.loads(r.stdout)
        return json.loads(vault_data["data"]["data"]["content"])
    except:
        return None

def main():
    print("=== Rotate Keypairs to Match Vault Keys ===\n")
    token = get_mgmt_token()

    # Get all participants
    code, body = api_call("GET", "/v1alpha/participants", token)
    participants = json.loads(body)

    for p in participants:
        ctx_id = p["participantContextId"]
        did = p.get("did", "")
        slug = None
        for s in SLUGS:
            if s in did:
                slug = s
                break
        if not slug:
            continue

        print(f"--- {slug} (ctx={ctx_id[:8]}...) ---")
        token = get_mgmt_token()

        # Get current keypairs
        code, body = api_call("GET", f"/v1alpha/participants/{ctx_id}/keypairs", token)
        keypairs = json.loads(body)
        if not keypairs:
            print("  No keypairs found")
            continue

        kp = keypairs[0]
        kp_id = kp["id"]
        alias = kp["privateKeyAlias"]
        old_pub = json.loads(kp["serializedPublicKey"])

        # Read private key from vault
        priv_jwk = read_vault_key(ctx_id, alias)
        if not priv_jwk:
            print("  SKIP: no private key in vault")
            continue

        if old_pub.get("x") == priv_jwk.get("x"):
            print("  MATCH: already in sync")
            continue

        print(f"  Old x: {old_pub.get('x', '?')[:24]}...")
        print(f"  New x: {priv_jwk.get('x', '?')[:24]}...")

        # Build new key descriptor for rotation
        new_key_descriptor = {
            "keyId": alias,
            "privateKeyAlias": alias,
            "active": True,
            "type": kp["keyContext"],
            "publicKeyJwk": {
                "kty": priv_jwk["kty"],
                "crv": priv_jwk["crv"],
                "kid": alias,
                "x": priv_jwk["x"],
            },
            "usage": kp["usage"],
        }

        # Rotate: retire old key, create new successor
        print(f"  Rotating keypair {kp_id[:8]}...")
        code, body = api_call("POST",
            f"/v1alpha/participants/{ctx_id}/keypairs/{kp_id}/rotate?duration=0",
            token, new_key_descriptor)
        print(f"  Rotate response: HTTP {code}")
        if body:
            print(f"  Body: {body[:200]}")

        # Verify DID doc
        r = subprocess.run(["docker", "exec", "health-dataspace-controlplane",
            "curl", "-sf", f"http://identityhub:7083/{slug}/.well-known/did.json"],
            capture_output=True, text=True)
        try:
            did_doc = json.loads(r.stdout)
            vm = did_doc.get("verificationMethod", [])
            if vm:
                did_pub_x = vm[0].get("publicKeyJwk", {}).get("x", "?")
                match = "YES" if did_pub_x == priv_jwk["x"] else "NO"
                print(f"  DID doc x: {did_pub_x[:24]}... match={match}")
        except Exception as e:
            print(f"  DID doc check: {e}")
        print()

if __name__ == "__main__":
    main()
