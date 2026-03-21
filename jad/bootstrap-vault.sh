#!/bin/sh
# =============================================================================
# Vault Bootstrap Script — Initializes JWT auth, secrets engine, policies
# =============================================================================
# This mirrors the K8s vault-bootstrap Job from k8s/base/vault.yaml.
# Runs once as a docker-compose service to configure Vault for EDC-V.
# =============================================================================

set -e

echo "=== Vault Bootstrap ==="

# Wait for Vault to be ready
echo "Waiting for Vault to be ready..."
until vault status > /dev/null 2>&1; do
    echo "Vault not ready yet, retrying in 2 seconds..."
    sleep 2
done
echo "Vault is ready!"

# Wait for Keycloak to be ready
echo "Waiting for Keycloak to be ready..."
until wget -q --spider http://keycloak:8080/realms/edcv/.well-known/openid-configuration > /dev/null 2>&1; do
    echo "Keycloak not ready yet, retrying in 2 seconds..."
    sleep 2
done
echo "Keycloak is ready!"

# Enable JWT auth method (idempotent — ignore "already in use")
vault auth enable jwt 2>/dev/null || echo "JWT auth already enabled, continuing..."

# Configure JWT auth (using Keycloak as JWT backend)
# NOTE: In docker-compose, services communicate via container names.
# The bound_issuer must match what Keycloak puts in the token "iss" claim.
# KC_HOSTNAME=http://keycloak:8080, so iss = http://keycloak:8080/realms/edcv
vault write auth/jwt/config \
    jwks_url="http://keycloak:8080/realms/edcv/protocol/openid-connect/certs" \
    default_role="participant" || { echo "Failed to configure JWT auth"; exit 1; }

# Create KV v2 secrets engine for participants (idempotent — ignore "already in use")
vault secrets enable -path=participants -version=2 kv 2>/dev/null || echo "Secrets engine already enabled, continuing..."

# Get accessor for entity aliases
ACCESSOR=$(vault auth list | grep 'jwt/' | awk '{print $3}')
if [ -z "$ACCESSOR" ]; then
    echo "Failed to get JWT accessor"
    exit 1
fi
echo "Using JWT accessor: $ACCESSOR"

# Participant policy — each participant can only access their own secrets
cat <<EOF | vault policy write participants-restricted - || { echo "Failed to write policy"; exit 1; }
path "participants/data/{{identity.entity.aliases.${ACCESSOR}.name}}/*" {
    capabilities = ["create", "read", "update", "delete", "list"]
}
path "participants/metadata/{{identity.entity.aliases.${ACCESSOR}.name}}/*" {
    capabilities = ["list"]
}
EOF

# Create participant JWT role
vault write auth/jwt/role/participant -<<EOF || { echo "Failed to create JWT role"; exit 1; }
{
    "role_type": "jwt",
    "user_claim": "participant_context_id",
    "bound_issuer": "http://keycloak:8080/realms/edcv",
    "bound_claims": {
        "role": "participant"
    },
    "token_policies": ["participants-restricted"],
    "clock_skew_leeway": 60
}
EOF

# Provisioner policy — full access for CFM provisioning
cat <<EOF | vault policy write provisioner-policy - || { echo "Failed to write policy"; exit 1; }
path "*" {
    capabilities = ["create", "read", "update", "delete", "list", "sudo"]
}
path "sys/*" {
    capabilities = ["create", "read", "update", "delete", "list", "sudo"]
}
EOF

# Create provisioner JWT role
vault write auth/jwt/role/provisioner -<<EOF || { echo "Failed to create provisioner JWT role"; exit 1; }
{
    "role_type": "jwt",
    "user_claim": "azp",
    "bound_issuer": "http://keycloak:8080/realms/edcv",
    "bound_claims": {
        "role": "provisioner"
    },
    "token_policies": ["provisioner-policy"],
    "clock_skew_leeway": 60
}
EOF

# Store AES encryption key for EDC-V
vault write secret/data/aes-key-alias -<<EOF || { echo "Failed to create AES key entry"; exit 1; }
{
    "data": {
        "content": "yHo9w6m2KOI3FE7vI+fcN6j86JDQ6V10lJPlv9lLWoE="
    }
}
EOF

# ---------------------------------------------------------------------------
# IssuerService EdDSA Signing Key (DCP Credential Issuance)
# ---------------------------------------------------------------------------
# The IssuerService runtime resolves private keys from the per-participant
# vault (participants/ mount) using its participant_context_id ("issuer")
# as the key path prefix. The EDC Vault client URL-encodes the key alias
# before making HTTP requests, so the alias
#   did:web:issuerservice%3A10016:issuer#key-1
# becomes the vault path:
#   participants/data/issuer/did%3Aweb%3Aissuerservice%253A10016%3Aissuer%23key-1
#
# The matching public key is published in the DID document
# at did:web:issuerservice%3A10016:issuer#key-1.
#
# See: ADR-7 (DID:web Resolution Architecture) in docs/planning-health-dataspace-v2.md
# ---------------------------------------------------------------------------

echo "=== Provisioning IssuerService signing key ==="

ISSUER_KEY_JWK='{"kty":"OKP","d":"6DBtzJz3DjNAiM2P2RlzOsAQs-ramVeAUVnocd6F__Y","crv":"Ed25519","kid":"did:web:issuerservice%3A10016:issuer#key-1","x":"I8dt08pwP4nQPv4MacRU5u5KsroVa3ESkWmyQEDn36A"}'

vault kv put 'participants/issuer/did%3Aweb%3Aissuerservice%253A10016%3Aissuer%23key-1' \
  content="$ISSUER_KEY_JWK" \
  || { echo "Failed to store issuer EdDSA key in participants/ mount"; exit 1; }

echo "✓ IssuerService EdDSA signing key stored in participants/ mount (path: issuer/<url-encoded-alias>)"

# ---------------------------------------------------------------------------
# Data Plane Token Signing Keys (ADR-2: Dual Data Planes)
# ---------------------------------------------------------------------------
# Each DCore data plane needs a key pair for signing/verifying data-plane
# access tokens (DPS protocol). The control plane uses these to issue
# short-lived tokens that the data plane verifies before streaming data.
# ---------------------------------------------------------------------------

echo "=== Provisioning data plane token keys ==="

# FHIR data plane key pair (PUSH transfers — clinical FHIR R4 bundles)
vault write secret/data/dataplane-fhir-public -<<EOF || { echo "Failed to create FHIR DP public key"; exit 1; }
{
    "data": {
        "content": "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAr5VwPLNLfGYX1pHBJVOCFjGvPLBhCxACPiWkz5XJRVXaPWrSRKLGS8MEcZfcL1EZ+EEnFTHYIOQdpM0OxEb7QaGmBQ9RLMF8VKwKeOkL8CkUxDfVBn9jWYE4GdVKl1LGyFfJYh8M0pXqVvAVjBRbKCfEIQc/qNm3BmGpGXpM2wFE6MJz2Uvm7vReK9W3Q1huEHW0U8TrVjSt6NbKvH5qLKD0wpbKF1dR7FPafQ1Bp+a1h0GkTHWU2pvNO+1F6nNS9G3OdWw0BH1aLqjbDGBZ5A1Z9PSqj5nDALqiHn5B+1u3dHi8F5GFj6t6W3PZ3Kv0TmmZP2HFHNvKCRjPHwwIDAQAB"
    }
}
EOF

vault write secret/data/dataplane-fhir-private -<<EOF || { echo "Failed to create FHIR DP private key"; exit 1; }
{
    "data": {
        "content": "MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCvlXA8s0t8ZhfWkcElU4IWMa88sGELEAI+JaTPlaLVFdpr+dK0ot5LwwRxl9wvURn4QScVMdgg5B2kzQ7ERvtBoaYFL1EswXxUrAp46QvwKRTEN9UGf2NZgTgZ1UqXUsLIV8liHwzSleptcBWMFFsoJ8QhBz+o2bcGYakZekzbAUTownPZS+bu9F4r1bdDWG4QdbRTxOtWNK3o1sq8fmosoNTClsoXV1HsZ9p9DUGn5rWHQaRMdZTam807UXqc1L0bc51bDQEfVouqNsMYFnkDVn09KqPmcMAuqIefkH7W7d0eLwXkYWPq3pbc9ncq/ROaZk/YcUc28oJGM8fDAgMBAAECggEAFSEQ7m9FMX6iC0p1JGnWPzDeF94YqD8MYcjKOIMnF0wR"
    }
}
EOF

# OMOP data plane key pair (PULL transfers — OMOP CDM analytics)
vault write secret/data/dataplane-omop-public -<<EOF || { echo "Failed to create OMOP DP public key"; exit 1; }
{
    "data": {
        "content": "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA0zFP3jTdGKf8bdhVv7+F43L8JBDxYQOnNv1Ql1JRHnDQkOS0a7GEPn3FZ1Ud0AQPVZ5X7i1J3n3x8d5QlKUzj7XEmhgmR7ey5TGm+FaWOr/pOj3gFJ2Y4WcQ2nL0tJr1z7sJ3HrJQHFfB0G7GqY1wZmQ2YAVW4pW1w6e39eZfNB2H7d+hxGRqIRStF3fcNlYh0FExavYJm5V0Q2RaNcipK7B8M1w5PyVY9fQ2f1GmM2jBC3VQM0v9e0jZX9cAEpH+tO3fR3Ht6a8xYWIQ0aMGPiJf1m9sUfKjWL76cXjj6Lg7SHKE7hBpfLN0PEmz5AYHYjj8P4Y1GrNJIxQIDAQAB"
    }
}
EOF

vault write secret/data/dataplane-omop-private -<<EOF || { echo "Failed to create OMOP DP private key"; exit 1; }
{
    "data": {
        "content": "MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDTMU/eNN0Yp/xt2FW/v4Xjcvwk0PFhA6c2/VCXU1EecNCQ5LRrsYQ+fcVnVR3QBA9Vnlfv7UneffHx3lCUpTOPtcSaGCZHt7LlMab4VpY6v+k6PeAUnZjhZxDacvS0mvXPuwnceslAcV8HQbsapjXBmZDZgBVbilbXDp7f15l80HYft36HEZGohFK0Xd9w2ViHQUTFq9gmblXRDZFo1yKkrsHwzXDk/JVj19DZ/UaYzaMELdVAzS/17SNlf1wASkf607d9Hce3przFhYhDRowY+Il/Wb2xR8qNYvvpxeOPouDtIcoTuEGl8s3Q8SbPkBgdiOPw/hjUas0kjFAgMBAAECggEAVyLPvBz1Xf8S2vRnfPdB"
    }
}
EOF

echo "=== Vault bootstrap completed successfully! ==="
