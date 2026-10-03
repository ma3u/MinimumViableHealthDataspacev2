#!/usr/bin/env sh
# scripts/vault-init-or-unseal.sh
# Initialises Vault on first start, or unseals it on subsequent starts.
# Writes unseal key + root token to /vault/init.json (mount a persistent volume).
#
# IMPORTANT: Back up /vault/init.json securely. Anyone with the unseal key
# can access all secrets. In production, use auto-unseal (AWS KMS / Azure Key
# Vault / StackIT HSM) instead.

set -eu

VAULT_ADDR="${VAULT_ADDR:-http://vault:8200}"
# The Azure sidecar keeps it on the vault-data share instead (ADR-046).
INIT_FILE="${VAULT_INIT_FILE:-/vault/init.json}"

wait_for_vault() {
  echo "[vault-init] Waiting for Vault to start..."
  for i in $(seq 1 30); do
    if vault status -address="$VAULT_ADDR" 2>/dev/null | grep -q "Initialized"; then
      echo "[vault-init] Vault is up."
      return 0
    fi
    sleep 2
  done
  echo "[vault-init] ERROR: Vault did not start within 60s"
  exit 1
}

wait_for_vault

INITIALIZED=$(vault status -address="$VAULT_ADDR" -format=json 2>/dev/null | grep -c '"initialized": true' || true)

if [ "$INITIALIZED" = "0" ]; then
  echo "[vault-init] First start — initialising Vault..."
  # Written locally first and copied once complete, so a write that fails
  # half way on a network share cannot leave an initialised Vault whose only
  # copy of the unseal key is a truncated file.
  vault operator init \
    -address="$VAULT_ADDR" \
    -key-shares=1 \
    -key-threshold=1 \
    -format=json > /tmp/vault-init.json
  cp /tmp/vault-init.json "$INIT_FILE"
  cmp -s /tmp/vault-init.json "$INIT_FILE" || {
    echo "[vault-init] ERROR: $INIT_FILE does not match what init returned" >&2
    exit 1
  }
  rm -f /tmp/vault-init.json
  echo "[vault-init] Vault initialised. Keys written to $INIT_FILE"
  echo "[vault-init] IMPORTANT: Back up $INIT_FILE securely."
elif [ ! -s "$INIT_FILE" ]; then
  # Initialised storage with no key file can never be unsealed again. Say what
  # to do rather than die on the read below.
  echo "[vault-init] ERROR: Vault storage is initialised but $INIT_FILE is missing." >&2
  echo "[vault-init] The unseal key is gone, so this storage cannot be opened." >&2
  echo "[vault-init] Recovery: empty the storage (Azure: TRUNCATE vault_kv_store," >&2
  echo "[vault-init] local: remove the vault_data volume), restart, then re-run" >&2
  echo "[vault-init] the Vault bootstrap and reseed the participants." >&2
  exit 1
fi

# `vault operator init -format=json` pretty-prints, so the compact-JSON greps
# this used to run found nothing, UNSEAL_KEY came out empty, and `vault
# operator unseal` fell back to prompting for a key on a terminal that is not
# there ("file descriptor 0 is not a terminal"). Flatten the whitespace first
# so both compact and pretty output parse (#345, found while giving the local
# compose Vault a file backend).
FLAT=$(tr -d ' \n\t\r' < "$INIT_FILE")
UNSEAL_KEY=$(printf '%s' "$FLAT" | grep -o '"unseal_keys_b64":\["[^"]*"' | grep -o '"[^"]*"$' | tr -d '"')
ROOT_TOKEN=$(printf '%s' "$FLAT" | grep -o '"root_token":"[^"]*"' | grep -o '"[^"]*"$' | tr -d '"')
if [ -z "$UNSEAL_KEY" ] || [ -z "$ROOT_TOKEN" ]; then
  echo "[vault-init] ERROR: could not read the unseal key or root token from $INIT_FILE" >&2
  exit 1
fi

SEALED=$(vault status -address="$VAULT_ADDR" -format=json 2>/dev/null | grep -c '"sealed": true' || true)

if [ "$SEALED" != "0" ]; then
  echo "[vault-init] Vault is sealed — unsealing..."
  vault operator unseal -address="$VAULT_ADDR" "$UNSEAL_KEY"
  echo "[vault-init] Vault unsealed."
fi

export VAULT_TOKEN="$ROOT_TOKEN"
echo "[vault-init] VAULT_TOKEN set from init file."

# Optional: make sure a token with a fixed id exists (the compose stack's
# services are configured with the literal token "root"). Set
# VAULT_ENSURE_TOKEN_ID to enable; unset on deployments that pass the real
# root token to the services instead.
if [ -n "${VAULT_ENSURE_TOKEN_ID:-}" ]; then
  if VAULT_TOKEN="$ROOT_TOKEN" vault token lookup -address="$VAULT_ADDR" "$VAULT_ENSURE_TOKEN_ID" >/dev/null 2>&1; then
    echo "[vault-init] token '$VAULT_ENSURE_TOKEN_ID' present"
  else
    VAULT_TOKEN="$ROOT_TOKEN" vault token create -address="$VAULT_ADDR" -id="$VAULT_ENSURE_TOKEN_ID" -policy=root -no-default-policy >/dev/null
    echo "[vault-init] token '$VAULT_ENSURE_TOKEN_ID' created"
  fi
fi
echo "[vault-init] ready"
