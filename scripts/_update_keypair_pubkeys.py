#!/usr/bin/env python3
"""
Update keypair public keys to match the private keys stored in vault.
Run AFTER _provision_signing_keys_v4.py stores private keys.
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

def get_participants(token):
    r = subprocess.run(["curl", "-sf",
        f"{IH_URL}/v1alpha/participants",
        "-H", f"Authorization: Bearer {token}"], capture_output=True, text=True)
    return json.loads(r.stdout)

def get_keypairs(token, ctx_id):
    r = subprocess.run(["curl", "-sf",
        f"{IH_URL}/v1alpha/participants/{ctx_id}/keypairs",
        "-H", f"Authorization: Bearer {token}"], capture_output=True, text=True)
    return json.loads(r.stdout)

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
    except Exception as e:
        print(f"  ERROR reading vault: {e}")
        return None

def update_keypair(token, ctx_id, kp, new_pub_jwk):
    payload = {
        "keyId": kp["keyId"],
        "serializedPublicKey": json.dumps(new_pub_jwk),
        "privateKeyAlias": kp["privateKeyAlias"],
        "keyContext": kp["keyContext"],
        "defaultPair": kp["defaultPair"],
        "useDuration": kp["useDuration"],
        "rotationDuration": kp.get("rotationDuration", 0),
        "usage": kp["usage"],
    }
    r = subprocess.run(["curl", "-s", "-w", "\n%{http_code}", "-X", "PUT",
        f"{IH_URL}/v1alpha/participants/{ctx_id}/keypairs",
        "-H", f"Authorization: Bearer {token}",
        "-H", "Content-Type: application/json",
        "-d", json.dumps(payload)], capture_output=True, text=True)
    lines = r.stdout.strip().split("\n")
    http_code = lines[-1] if lines else "?"
    body = "\n".join(lines[:-1])
    return http_code, body

def main():
    print("=== Update Keypair Public Keys ===\n")
    token = get_mgmt_token()
    participants = get_participants(token)

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
        keypairs = get_keypairs(token, ctx_id)
        if not keypairs:
            print("  No keypairs found")
            continue

        kp = keypairs[0]
        alias = kp["privateKeyAlias"]
        old_pub = json.loads(kp["serializedPublicKey"])
        print(f"  Old public key x: {old_pub.get('x', '?')[:24]}...")

        # Read private key from vault
        priv_jwk = read_vault_key(ctx_id, alias)
        if not priv_jwk:
            print("  SKIP: no private key in vault")
            continue

        print(f"  Vault private key x: {priv_jwk.get('x', '?')[:24]}...")

        if old_pub.get("x") == priv_jwk.get("x"):
            print("  MATCH: public key already matches vault key")
            continue

        # Build new public JWK
        new_pub = {
            "kty": priv_jwk["kty"],
            "crv": priv_jwk["crv"],
            "kid": alias,
            "x": priv_jwk["x"],
        }

        code, body = update_keypair(token, ctx_id, kp, new_pub)
        print(f"  PUT response: HTTP {code}")
        if body:
            print(f"  Body: {body[:200]}")

        # Verify
        token = get_mgmt_token()  # refresh in case expired
        keypairs2 = get_keypairs(token, ctx_id)
        if keypairs2:
            new_stored = json.loads(keypairs2[0]["serializedPublicKey"])
            match = "YES" if new_stored.get("x") == priv_jwk["x"] else "NO"
            print(f"  Verified: x matches = {match}")
        print()

if __name__ == "__main__":
    main()
