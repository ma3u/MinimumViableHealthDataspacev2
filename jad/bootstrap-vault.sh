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

# Enable JWT auth method
vault auth enable jwt || true

# Configure JWT auth (using Keycloak as JWT backend)
# NOTE: In docker-compose, services communicate via container names, but
# the bound_issuer must match what Keycloak puts in the token "iss" claim.
# Keycloak uses KC_HOSTNAME for the iss claim, which is http://keycloak.localhost
vault write auth/jwt/config \
    jwks_url="http://keycloak:8080/realms/edcv/protocol/openid-connect/certs" \
    default_role="participant" || { echo "Failed to configure JWT auth"; exit 1; }

# Create KV v2 secrets engine for participants
vault secrets enable -path=participants -version=2 kv || { echo "Failed to enable secrets engine"; exit 1; }

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
    "bound_issuer": "http://keycloak.localhost/realms/edcv",
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
    "bound_issuer": "http://keycloak.localhost/realms/edcv",
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

echo "=== Vault bootstrap completed successfully! ==="
