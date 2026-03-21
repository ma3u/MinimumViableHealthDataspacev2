#!/usr/bin/env python3
"""
Provision STS client secrets in Vault for all activated participants.

The CFM keycloak-agent should do this but it's crash-looping due to vault
JWT auth issues. This script manually provisions the secrets by:
1. Getting a Keycloak master admin token
2. For each participant UUID, finding the KC client and its secret
3. Storing the secret in Vault at secret/data/{uuid}-sts-client-secret
"""
import json
import sys
import urllib.request
import urllib.parse

KC_HOST = "http://localhost:8080"
VAULT_HOST = "http://localhost:8200"
VAULT_TOKEN = "root"

PARTICIPANTS = {
    "5c0ed83adbe44c82b8cf8e5e4772ab5f": "alpha-klinik",
    "d6201c5b64854ea0a81dca4b714917cf": "pharmaco",
    "8b2d6ae71b304ff5817712d118e13d5b": "medreg",
    "8f2de4d8edd04e69bd049d2285077dc3": "lmc",
    "b3c8eeffc22e41c1aaa1c077d77c2e81": "irs",
}

def http_request(url, method="GET", data=None, headers=None):
    """Simple HTTP request helper."""
    if headers is None:
        headers = {}
    if data and isinstance(data, (dict, list)):
        data = json.dumps(data).encode()
        if "Content-Type" not in headers:
            headers["Content-Type"] = "application/json"
    elif data and isinstance(data, str):
        data = data.encode()

    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode() if e.fp else ""
        print(f"  HTTP {e.code}: {body[:200]}", file=sys.stderr)
        return None

def main():
    # 1. Get KC master admin token
    print("Getting Keycloak admin token...")
    token_data = urllib.parse.urlencode({
        "grant_type": "password",
        "client_id": "admin-cli",
        "username": "admin",
        "password": "admin",
    }).encode()

    req = urllib.request.Request(
        f"{KC_HOST}/realms/master/protocol/openid-connect/token",
        data=token_data,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    with urllib.request.urlopen(req) as resp:
        kc_token = json.loads(resp.read().decode())["access_token"]
    print(f"  Got token ({len(kc_token)} chars)")

    kc_headers = {"Authorization": f"Bearer {kc_token}"}
    vault_headers = {"X-Vault-Token": VAULT_TOKEN, "Content-Type": "application/json"}

    success = 0
    skipped = 0

    for ctx_id, name in PARTICIPANTS.items():
        print(f"\n--- {name} ({ctx_id}) ---")

        # 2. Find KC client by clientId
        clients = http_request(
            f"{KC_HOST}/admin/realms/edcv/clients?clientId={ctx_id}",
            headers=kc_headers,
        )
        if not clients or not isinstance(clients, list) or len(clients) == 0:
            print(f"  SKIP: No KC client found for {ctx_id}")
            skipped += 1
            continue

        kc_internal_id = clients[0]["id"]
        print(f"  KC client ID: {kc_internal_id}")

        # 3. Get client secret
        secret_resp = http_request(
            f"{KC_HOST}/admin/realms/edcv/clients/{kc_internal_id}/client-secret",
            headers=kc_headers,
        )
        if not secret_resp or not secret_resp.get("value"):
            print(f"  SKIP: No client secret available")
            skipped += 1
            continue

        client_secret = secret_resp["value"]
        print(f"  Client secret: {client_secret[:8]}...")

        # 4. Store in Vault
        vault_path = f"{ctx_id}-sts-client-secret"
        vault_resp = http_request(
            f"{VAULT_HOST}/v1/secret/data/{vault_path}",
            method="POST",
            data={"data": {"content": client_secret}},
            headers=vault_headers,
        )
        if vault_resp and vault_resp.get("data"):
            print(f"  STORED in vault at secret/data/{vault_path}")
            success += 1
        else:
            print(f"  FAILED to store in vault")
            skipped += 1

        # 5. Also store STS token URL for the participant
        sts_url_path = f"{ctx_id}-sts-token-url"
        http_request(
            f"{VAULT_HOST}/v1/secret/data/{sts_url_path}",
            method="POST",
            data={"data": {"content": f"http://keycloak:8080/realms/edcv/protocol/openid-connect/token"}},
            headers=vault_headers,
        )

    print(f"\n=== Done: {success} stored, {skipped} skipped ===")

    # Verify
    print("\nVerification:")
    for ctx_id, name in PARTICIPANTS.items():
        resp = http_request(
            f"{VAULT_HOST}/v1/secret/data/{ctx_id}-sts-client-secret",
            headers=vault_headers,
        )
        exists = "YES" if resp and resp.get("data") else "NO"
        print(f"  {name} ({ctx_id}): {exists}")

if __name__ == "__main__":
    main()
