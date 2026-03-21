#!/usr/bin/env python3
"""
Direct DB update: set keypair public keys to match vault private keys,
and activate participant contexts (state 300 -> 200).

Run AFTER _provision_signing_keys_v4.py.
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

def psql(sql):
    r = subprocess.run([
        "docker", "exec", "health-dataspace-postgres",
        "psql", "-U", "ih", "-d", "identityhub", "-t", "-A", "-c", sql
    ], capture_output=True, text=True)
    return r.stdout.strip()

def main():
    print("=== Direct DB Update: Keypairs + Participant States ===\n")
    token = get_mgmt_token()

    # Get participant mapping from Identity API
    r = subprocess.run(["curl", "-sf",
        f"{IH_URL}/v1alpha/participants",
        "-H", f"Authorization: Bearer {token}"], capture_output=True, text=True)
    participants = json.loads(r.stdout)

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

        # Get keypair from DB
        row = psql(f"SELECT id, key_id, private_key_alias, serialized_public_key FROM keypair_resource WHERE participant_context_id = '{ctx_id}' LIMIT 1")
        if not row:
            print("  No keypair in DB")
            continue

        parts = row.split("|")
        kp_id = parts[0]
        key_id = parts[1]
        alias = parts[2]
        old_pub_str = parts[3]
        old_pub = json.loads(old_pub_str)

        print(f"  Key alias: {alias}")
        print(f"  Old pub x: {old_pub.get('x', '?')[:20]}...")

        # Read private key from vault
        priv_jwk = read_vault_key(ctx_id, alias)
        if not priv_jwk:
            print("  SKIP: no vault private key")
            continue

        new_x = priv_jwk["x"]
        print(f"  New pub x: {new_x[:20]}...")

        if old_pub.get("x") == new_x:
            print("  MATCH: already synced")
        else:
            # Build new public JWK matching the vault private key
            new_pub = {
                "kty": priv_jwk["kty"],
                "crv": priv_jwk["crv"],
                "kid": alias,
                "x": new_x,
            }
            new_pub_str = json.dumps(new_pub).replace("'", "''")

            # Update keypair public key in DB
            sql = f"UPDATE keypair_resource SET serialized_public_key = '{new_pub_str}' WHERE id = '{kp_id}'"
            psql(sql)

            # Verify
            verify = psql(f"SELECT serialized_public_key FROM keypair_resource WHERE id = '{kp_id}'")
            verify_pub = json.loads(verify)
            if verify_pub.get("x") == new_x:
                print("  DB update: OK")
            else:
                print("  DB update: FAILED")

        # Activate participant context (300 -> 200)
        current_state = psql(f"SELECT state FROM participant_context WHERE participant_context_id = '{ctx_id}'")
        if current_state != "200":
            psql(f"UPDATE participant_context SET state = 200 WHERE participant_context_id = '{ctx_id}'")
            new_state = psql(f"SELECT state FROM participant_context WHERE participant_context_id = '{ctx_id}'")
            print(f"  State: {current_state} -> {new_state}")
        else:
            print(f"  State: already ACTIVATED (200)")

        # Also activate keypair (ensure state 200)
        kp_state = psql(f"SELECT state FROM keypair_resource WHERE id = '{kp_id}'")
        if kp_state != "200":
            psql(f"UPDATE keypair_resource SET state = 200 WHERE id = '{kp_id}'")
            print(f"  Keypair state: {kp_state} -> 200")
        print()

    # Verify DID documents after update
    print("=== Verifying DID Documents ===")
    for slug in SLUGS:
        r = subprocess.run([
            "docker", "exec", "health-dataspace-controlplane",
            "curl", "-sf", f"http://identityhub:7083/{slug}/.well-known/did.json"
        ], capture_output=True, text=True)
        try:
            did_doc = json.loads(r.stdout)
            vm = did_doc.get("verificationMethod", [])
            if vm:
                x = vm[0].get("publicKeyJwk", {}).get("x", "?")
                print(f"  {slug}: DID doc x={x[:24]}...")
            else:
                print(f"  {slug}: no verification methods")
        except:
            print(f"  {slug}: DID resolution failed")

if __name__ == "__main__":
    main()
