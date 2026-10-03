#!/bin/sh
# Sidecar of mvhd-vault on Azure (ADR-046). Runs in the same replica as Vault,
# so it reaches it on 127.0.0.1.
#
#   1. makes sure Vault's table exists on the Flexible Server
#   2. initialises Vault on first start, unseals it on every start, and makes
#      sure the fixed-id service token exists (scripts/vault-init-or-unseal.sh,
#      the script the compose vault-unseal sidecar runs)
#   3. keeps watching: if the Vault container restarts inside this replica it
#      comes back sealed, and nothing else would open it
#
# A scale from zero starts both containers fresh, so step 2 runs again then.
set -eu

: "${VAULT_ADDR:=http://127.0.0.1:8200}"
: "${VAULT_PG_CONNECTION_URL:?the Flexible Server connection URL is not set}"
export VAULT_ADDR

until psql "$VAULT_PG_CONNECTION_URL" -v ON_ERROR_STOP=1 -q \
        -f /app/vault-pg-schema.sql; do
  echo "[vault-unseal] Flexible Server not reachable yet, retrying in 5s" >&2
  sleep 5
done
echo "[vault-unseal] vault_kv_store present"

sh /app/vault-init-or-unseal.sh

# `vault status` exits 0 when unsealed, 2 when sealed, 1 when unreachable.
while sleep 10; do
  rc=0
  vault status >/dev/null 2>&1 || rc=$?
  if [ "$rc" -eq 2 ]; then
    echo "[vault-unseal] Vault is sealed again, unsealing"
    sh /app/vault-init-or-unseal.sh
  fi
done
