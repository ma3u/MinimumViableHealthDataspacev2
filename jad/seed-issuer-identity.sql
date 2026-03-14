-- =============================================================================
-- IssuerService Identity Fixup — keypair_resource, did_resources, activation
-- =============================================================================
-- The participant creation API (POST /api/identity/v1alpha/participants) creates
-- the participant_context record but does not always complete the full activation
-- lifecycle (keypair_resource, did_resources, state 300). This script ensures
-- the IssuerService's issuer participant is fully configured for DCP credential
-- issuance.
--
-- Run after seed-jad.sh:
--   docker exec health-dataspace-postgres psql -U issuer -d issuerservice \
--     -f /docker-entrypoint-initdb.d/seed-issuer-identity.sql
--
-- Or inline:
--   cat jad/seed-issuer-identity.sql | docker exec -i health-dataspace-postgres \
--     psql -U issuer -d issuerservice
--
-- This script is IDEMPOTENT — safe to run multiple times.
-- =============================================================================

-- Static EdDSA public key (matches the private key in Vault secret/ mount)
-- Private key stored at: secret/data/did:web:issuerservice%3A10016:issuer#key-1

-- 1. Insert keypair_resource (links the DID key ID to the vault alias)
INSERT INTO keypair_resource (
    id,
    participant_context_id,
    timestamp,
    key_id,
    serialized_public_key,
    private_key_alias,
    is_default_pair,
    use_duration,
    rotation_duration,
    state,
    key_context,
    group_name,
    usage
) VALUES (
    'issuer-keypair-1',
    'issuer',
    (EXTRACT(EPOCH FROM NOW()) * 1000)::bigint,
    'did:web:issuerservice%3A10016:issuer#key-1',
    '{"kty":"OKP","crv":"Ed25519","kid":"did:web:issuerservice%3A10016:issuer#key-1","x":"I8dt08pwP4nQPv4MacRU5u5KsroVa3ESkWmyQEDn36A"}',
    'did:web:issuerservice%3A10016:issuer#key-1',
    true,
    0,
    0,
    200,  -- ACTIVE
    'JsonWebKey2020',
    NULL,
    '["sign_token","sign_credentials","sign_presentation"]'
) ON CONFLICT (id) DO UPDATE SET
    serialized_public_key = EXCLUDED.serialized_public_key,
    private_key_alias = EXCLUDED.private_key_alias,
    state = EXCLUDED.state;

-- 2. Insert DID resource (publishes the DID document at did:web endpoint)
INSERT INTO did_resources (
    did,
    state,
    create_timestamp,
    state_timestamp,
    did_document,
    participant_context_id
) VALUES (
    'did:web:issuerservice%3A10016:issuer',
    300,  -- PUBLISHED
    (EXTRACT(EPOCH FROM NOW()) * 1000)::bigint,
    (EXTRACT(EPOCH FROM NOW()) * 1000)::bigint,
    '{
      "@context": [
        "https://www.w3.org/ns/did/v1",
        "https://w3id.org/security/suites/jws-2020/v1"
      ],
      "id": "did:web:issuerservice%3A10016:issuer",
      "verificationMethod": [
        {
          "id": "did:web:issuerservice%3A10016:issuer#key-1",
          "type": "JsonWebKey2020",
          "controller": "did:web:issuerservice%3A10016:issuer",
          "publicKeyJwk": {
            "kty": "OKP",
            "crv": "Ed25519",
            "kid": "did:web:issuerservice%3A10016:issuer#key-1",
            "x": "I8dt08pwP4nQPv4MacRU5u5KsroVa3ESkWmyQEDn36A"
          }
        }
      ],
      "authentication": [
        "did:web:issuerservice%3A10016:issuer#key-1"
      ],
      "service": [
        {
          "id": "issuer-service-1",
          "type": "IssuerService",
          "serviceEndpoint": "http://issuerservice:10012/api/issuance/v1alpha/participants/issuer"
        }
      ]
    }',
    'issuer'
) ON CONFLICT (did) DO UPDATE SET
    did_document = EXCLUDED.did_document,
    state = EXCLUDED.state,
    state_timestamp = (EXTRACT(EPOCH FROM NOW()) * 1000)::bigint;

-- 3. Activate the participant context (state 300 = ACTIVATED)
UPDATE participant_context
SET state = 300,
    last_modified_date = (EXTRACT(EPOCH FROM NOW()) * 1000)::bigint
WHERE participant_context_id = 'issuer'
  AND state < 300;

-- Verify
SELECT 'participant_context' AS table_name, participant_context_id, state
FROM participant_context
WHERE participant_context_id = 'issuer'
UNION ALL
SELECT 'keypair_resource', participant_context_id, state
FROM keypair_resource
WHERE participant_context_id = 'issuer'
UNION ALL
SELECT 'did_resources', participant_context_id, state
FROM did_resources
WHERE participant_context_id = 'issuer';
