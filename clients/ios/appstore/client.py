"""Minimal App Store Connect API client.

Credentials come from the environment, never from this file. The .p8 is the
secret and is downloadable exactly once; the key id and issuer id are just
identifiers, but they differ per account so they are not hard-coded either.

  export ASC_KEY_ID=XXXXXXXXXX
  export ASC_ISSUER_ID=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee
  export ASC_KEY_PATH=~/.appstoreconnect/private_keys/AuthKey_XXXXXXXXXX.p8
"""
import base64, json, os, time, urllib.error, urllib.request

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec, utils

BASE = "https://api.appstoreconnect.apple.com"


def _require(name):
    value = os.environ.get(name)
    if not value:
        raise SystemExit(f"{name} is not set; see the docstring in {__file__}")
    return value


def token():
    key_id, issuer = _require("ASC_KEY_ID"), _require("ASC_ISSUER_ID")
    path = os.path.expanduser(
        os.environ.get("ASC_KEY_PATH",
                       f"~/.appstoreconnect/private_keys/AuthKey_{key_id}.p8"))
    with open(path) as f:
        p8 = f.read()

    def b64(raw):
        return base64.urlsafe_b64encode(raw).rstrip(b"=")

    now = int(time.time())
    header = b64(json.dumps({"alg": "ES256", "kid": key_id, "typ": "JWT"}).encode())
    payload = b64(json.dumps({"iss": issuer, "iat": now, "exp": now + 900,
                              "aud": "appstoreconnect-v1"}).encode())
    signing_input = header + b"." + payload
    key = serialization.load_pem_private_key(p8.encode(), password=None)
    r, s = utils.decode_dss_signature(key.sign(signing_input, ec.ECDSA(hashes.SHA256())))
    signature = b64(r.to_bytes(32, "big") + s.to_bytes(32, "big"))
    return (signing_input + b"." + signature).decode()


def call(method, path, body=None):
    request = urllib.request.Request(
        BASE + path, method=method,
        headers={"Authorization": f"Bearer {token()}",
                 "Content-Type": "application/json"},
        data=json.dumps(body).encode() if body else None)
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            # DELETE answers 204 with no body, and json.load on that raises a
            # decode error that reads like the request failed when it worked.
            raw = response.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raise SystemExit(f"HTTP {e.code} on {method} {path}\n{e.read().decode()[:1200]}")
