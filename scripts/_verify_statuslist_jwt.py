#!/usr/bin/env python3
"""Verify the issuer's status list JWT signature manually."""
import json, base64, subprocess

# Get the status list JWT from the issuer
jwt_text = subprocess.check_output([
    "docker", "exec", "health-dataspace-identityhub",
    "curl", "-s", "http://issuerservice:9999/statuslist/60e23b51-235b-4830-abe6-6a9f35ceac2c"
]).decode().strip()

# Get issuer DID doc
did_doc_text = subprocess.check_output([
    "docker", "exec", "health-dataspace-identityhub",
    "curl", "-s", "http://issuerservice:10016/issuer/did.json"
]).decode().strip()

did_doc = json.loads(did_doc_text)
pub_jwk = did_doc['verificationMethod'][0]['publicKeyJwk']
print(f"Issuer pub key x: {pub_jwk['x']}")

header = json.loads(base64.urlsafe_b64decode(jwt_text.split('.')[0] + '=='))
print(f"JWT header: {json.dumps(header)}")

payload = json.loads(base64.urlsafe_b64decode(jwt_text.split('.')[1] + '=='))
print(f"JWT issuer: {payload.get('iss')}")

# Try signature verification
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
x_bytes = base64.urlsafe_b64decode(pub_jwk['x'] + '==')
print(f"Public key bytes len: {len(x_bytes)}")

pub_key = Ed25519PublicKey.from_public_bytes(x_bytes)

parts = jwt_text.split('.')
signing_input = (parts[0] + '.' + parts[1]).encode('ascii')
signature = base64.urlsafe_b64decode(parts[2] + '==')
print(f"Signature len: {len(signature)}")

try:
    pub_key.verify(signature, signing_input)
    print("JWT signature: VALID!")
except Exception as e:
    print(f"JWT signature: INVALID - {e}")
