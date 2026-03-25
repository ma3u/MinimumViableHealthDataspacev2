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
INIT_FILE="/vault/init.json"

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
  vault operator init \
    -address="$VAULT_ADDR" \
    -key-shares=1 \
    -key-threshold=1 \
    -format=json > "$INIT_FILE"
  echo "[vault-init] Vault initialised. Keys written to $INIT_FILE"
  echo "[vault-init] IMPORTANT: Back up $INIT_FILE securely."
fi

UNSEAL_KEY=$(grep -o '"unseal_keys_b64":\["[^"]*"' "$INIT_FILE" | grep -o '"[^"]*"$' | tr -d '"')
ROOT_TOKEN=$(grep -o '"root_token":"[^"]*"' "$INIT_FILE" | grep -o '"[^"]*"$' | tr -d '"')

SEALED=$(vault status -address="$VAULT_ADDR" -format=json 2>/dev/null | grep -c '"sealed": true' || true)

if [ "$SEALED" != "0" ]; then
  echo "[vault-init] Vault is sealed — unsealing..."
  vault operator unseal -address="$VAULT_ADDR" "$UNSEAL_KEY"
  echo "[vault-init] Vault unsealed."
fi

export VAULT_TOKEN="$ROOT_TOKEN"
echo "[vault-init] VAULT_TOKEN set from init file."
