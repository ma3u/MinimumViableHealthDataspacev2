#!/usr/bin/env python3
"""Test reading vault key using participant JWT auth (same as EDC does)."""
import json, sys, urllib.request, urllib.parse

KC_HOST = "http://localhost:8080"
VAULT_HOST = "http://localhost:8200"
IDENTITY_API = "http://localhost:11005/api/identity"

# Get management token
data = urllib.parse.urlencode({
    "grant_type": "client_credentials",
    "client_id": "admin",
    "client_secret": "edc-v-admin-secret",
}).encode()
req = urllib.request.Request(
    f"{KC_HOST}/realms/edcv/protocol/openid-connect/token",
    data=data,
    headers={"Content-Type": "application/x-www-form-urlencoded"},
    method="POST",
)
with urllib.request.urlopen(req) as resp:
    mgmt_token = json.loads(resp.read().decode())["access_token"]

# Get pharmaco participant vault config
ctx_id = "d6201c5b64854ea0a81dca4b714917cf"
req = urllib.request.Request(
    f"{IDENTITY_API}/v1alpha/participants/{ctx_id}",
    headers={"Authorization": f"Bearer {mgmt_token}"},
)
with urllib.request.urlopen(req) as resp:
    participant = json.loads(resp.read().decode())

vault_config = participant["properties"]["edc.vault.hashicorp.config"]
config = vault_config["config"]
creds = vault_config["credentials"]
print(f"Vault folder: {config['folderPath']}")
print(f"Vault secretPath: {config['secretPath']}")
print(f"Vault client: {creds['clientId']}")

# Get Keycloak token for vault client
data = urllib.parse.urlencode({
    "grant_type": "client_credentials",
    "client_id": creds["clientId"],
    "client_secret": creds["clientSecret"],
}).encode()
req = urllib.request.Request(
    creds["tokenUrl"].replace("keycloak:8080", "localhost:8080"),
    data=data,
    headers={"Content-Type": "application/x-www-form-urlencoded"},
    method="POST",
)
with urllib.request.urlopen(req) as resp:
    kc_token = json.loads(resp.read().decode())["access_token"]
print(f"KC token: {len(kc_token)} chars")

# Exchange KC token for Vault token via JWT auth
data = json.dumps({"jwt": kc_token, "role": "participant"}).encode()
req = urllib.request.Request(
    f"{VAULT_HOST}/v1/auth/jwt/login",
    data=data,
    headers={"Content-Type": "application/json"},
    method="POST",
)
try:
    with urllib.request.urlopen(req) as resp:
        vault_resp = json.loads(resp.read().decode())
        vault_token = vault_resp["auth"]["client_token"]
        print(f"Vault token: {vault_token[:20]}...")
        print(f"Policies: {vault_resp['auth']['policies']}")
except urllib.error.HTTPError as e:
    body = e.read().decode() if e.fp else ""
    print(f"Vault JWT auth failed: HTTP {e.code}: {body[:300]}")
    sys.exit(1)

# Now try reading the key
alias = "did:web:identityhub%3A7083:pharmaco#key1"
folder = config["folderPath"]

# Method 1: Use urllib (Python will URL-encode the path)
import subprocess

# Method 1: curl --path-as-is with URL-encoded path (as EDC does)
encoded_alias = alias.replace(":", "%3A").replace("%", "%25").replace("#", "%23")
# Fix: %25 was applied to : first, need to undo
# Actually: the alias has %3A which should be double-encoded to %253A
# and : should be encoded to %3A, and # to %23
# Let me do it manually:
# Original: did:web:identityhub%3A7083:pharmaco#key1
# Encode : -> %3A: did%3Aweb%3Aidentityhub%3A7083%3Apharmaco#key1  WRONG, the existing %3A needs special handling
#
# Actually: URL encode each char:
# d -> d, i -> i, d -> d, : -> %3A, w -> w, ... % -> %25 (for the existing %3A)
# So did:web:identityhub%3A7083:pharmaco#key1 becomes:
# did%3Aweb%3Aidentityhub%253A7083%3Apharmaco%23key1
parts = []
i = 0
s = alias
while i < len(s):
    c = s[i]
    if c == ':':
        parts.append('%3A')
        i += 1
    elif c == '#':
        parts.append('%23')
        i += 1
    elif c == '%':
        # percent-encode the percent itself
        parts.append('%25')
        i += 1
    else:
        parts.append(c)
        i += 1
encoded_alias = ''.join(parts)

print(f"\nAlias: {alias}")
print(f"URL-encoded: {encoded_alias}")

# Read with vault root token (should work)
url1 = f"{VAULT_HOST}/v1/participants/data/{folder}/{encoded_alias}"
print(f"\n--- Root token read ---")
result = subprocess.run(
    ["curl", "-s", "--path-as-is", url1,
     "-H", f"X-Vault-Token: root"],
    capture_output=True, text=True,
)
try:
    d = json.loads(result.stdout)
    data = d.get("data", {}).get("data", {})
    print(f"  Data keys: {list(data.keys())}")
except:
    print(f"  Raw: {result.stdout[:200]}")

# Read with participant vault token
print(f"\n--- Participant JWT token read ---")
result = subprocess.run(
    ["curl", "-s", "--path-as-is", url1,
     "-H", f"X-Vault-Token: {vault_token}"],
    capture_output=True, text=True,
)
try:
    d = json.loads(result.stdout)
    data = d.get("data", {}).get("data", {})
    errors = d.get("errors", [])
    if data:
        print(f"  Data keys: {list(data.keys())}")
    elif errors:
        print(f"  Errors: {errors}")
    else:
        print(f"  Empty response: {json.dumps(d)[:200]}")
except:
    print(f"  Raw: {result.stdout[:200]}")

# Also try without URL encoding (literal path)
url2 = f"{VAULT_HOST}/v1/participants/data/{folder}/{alias}"
print(f"\n--- Root token read (literal path) ---")
result = subprocess.run(
    ["curl", "-s", url2.replace("#", "%23"),  # at minimum encode #
     "-H", f"X-Vault-Token: root"],
    capture_output=True, text=True,
)
try:
    d = json.loads(result.stdout)
    data = d.get("data", {}).get("data", {})
    print(f"  Data keys: {list(data.keys())}")
except:
    print(f"  Raw: {result.stdout[:200]}")
