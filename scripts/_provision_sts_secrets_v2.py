#!/usr/bin/env python3
"""
Store STS client secrets in the per-participant vault paths.

Each participant has its own vault folder in the participants/ mount:
  participants/data/{ctx_id}/identityhub/{alias}

The control plane resolves these per edc.vault.hashicorp.config in participant properties.
"""
import json
import sys
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
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode() if e.fp else ""
        return {"error": f"HTTP {e.code}: {body[:200]}"}


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


def main():
    # Get tokens
    mgmt_token = get_token(
        "edcv", "client_credentials",
        client_id="admin", client_secret="edc-v-admin-secret"
    )
    kc_admin_token = get_token(
        "master", "password",
        client_id="admin-cli", username="admin", password="admin"
    )
    print(f"Got management token ({len(mgmt_token)} chars)")
    print(f"Got KC admin token ({len(kc_admin_token)} chars)")

    vault_headers = {"X-Vault-Token": VAULT_TOKEN, "Content-Type": "application/json"}
    kc_headers = {"Authorization": f"Bearer {kc_admin_token}"}
    mgmt_headers = {"Authorization": f"Bearer {mgmt_token}"}

    for ctx_id, name in PARTICIPANTS.items():
        print(f"\n--- {name} ({ctx_id}) ---")

        # 1. Get participant vault config from identity API
        p = http_req(
            f"{IDENTITY_API}/v1alpha/participants/{ctx_id}",
            headers=mgmt_headers,
        )
        vault_config = p.get("properties", {}).get("edc.vault.hashicorp.config", {})
        config = vault_config.get("config", {})
        folder_path = config.get("folderPath", "")
        secret_path = config.get("secretPath", "")
        print(f"  vault folder: {folder_path}")
        print(f"  secret path: {secret_path}")

        if not folder_path:
            print("  SKIP: no vault folder path configured")
            continue

        # 2. Get KC client secret for the STS client
        clients = http_req(
            f"{KC_HOST}/admin/realms/edcv/clients?clientId={ctx_id}",
            headers=kc_headers,
        )
        if not isinstance(clients, list) or not clients:
            print(f"  SKIP: no KC client found")
            continue

        kc_internal_id = clients[0]["id"]
        secret_resp = http_req(
            f"{KC_HOST}/admin/realms/edcv/clients/{kc_internal_id}/client-secret",
            headers=kc_headers,
        )
        client_secret = secret_resp.get("value", "")
        if not client_secret:
            print(f"  SKIP: no client secret")
            continue
        print(f"  client secret: {client_secret[:8]}...")

        # 3. Determine vault mount from secretPath
        # secretPath is "v1/participants" — extract mount name "participants"
        mount = secret_path.replace("v1/", "") if secret_path.startswith("v1/") else secret_path
        if not mount:
            mount = "participants"

        # 4. Store STS client secret
        alias = f"{ctx_id}-sts-client-secret"
        vault_path = f"{mount}/data/{folder_path}/{alias}"
        result = http_req(
            f"{VAULT_HOST}/v1/{vault_path}",
            method="POST",
            data={"data": {"content": client_secret}},
            headers=vault_headers,
        )
        if result and result.get("data"):
            print(f"  STORED at {vault_path}")
        else:
            print(f"  FAILED: {result}")

        # 5. Also store STS token URL
        url_alias = f"{ctx_id}-sts-token-url"
        url_path = f"{mount}/data/{folder_path}/{url_alias}"
        http_req(
            f"{VAULT_HOST}/v1/{url_path}",
            method="POST",
            data={"data": {"content": "http://keycloak:8080/realms/edcv/protocol/openid-connect/token"}},
            headers=vault_headers,
        )

        # 6. Also store STS client ID
        id_alias = f"{ctx_id}-sts-client-id"
        id_path = f"{mount}/data/{folder_path}/{id_alias}"
        http_req(
            f"{VAULT_HOST}/v1/{id_path}",
            method="POST",
            data={"data": {"content": ctx_id}},
            headers=vault_headers,
        )

    # Verification
    print("\n=== Verification ===")
    for ctx_id, name in PARTICIPANTS.items():
        p = http_req(
            f"{IDENTITY_API}/v1alpha/participants/{ctx_id}",
            headers=mgmt_headers,
        )
        folder_path = (
            p.get("properties", {})
            .get("edc.vault.hashicorp.config", {})
            .get("config", {})
            .get("folderPath", "")
        )
        secret_path = (
            p.get("properties", {})
            .get("edc.vault.hashicorp.config", {})
            .get("config", {})
            .get("secretPath", "")
        )
        mount = secret_path.replace("v1/", "") if secret_path.startswith("v1/") else (secret_path or "participants")
        alias = f"{ctx_id}-sts-client-secret"
        vault_path = f"{mount}/data/{folder_path}/{alias}"
        result = http_req(f"{VAULT_HOST}/v1/{vault_path}", headers=vault_headers)
        exists = "YES" if result and result.get("data") else "NO"
        print(f"  {name}: {exists} ({vault_path})")


if __name__ == "__main__":
    main()
