#!/usr/bin/env bash
set -euo pipefail
# =============================================================================
# The participants' signing keys for token renewal, on Azure (#888)
# =============================================================================
# Runs INSIDE the Azure environment, as the job of
# .github/workflows/edc-seed-siglet-key-mappings.yml: Vault, IdentityHub's
# identity API and siglet's management API (8083) are internal.
#
#   MODE=plan   read back, per participant context: the transit key, its kid
#               in the DID document, siglet's mapping. Changes nothing.
#   MODE=apply  scripts/seed-siglet-key-mappings.sh, then the same read back
#
# Unlike compose, siglet keeps the mappings in Postgres here (postgres-vault,
# 17-siglet.sh), so this runs once per participant and not after every
# restart. A participant the hub onboards later gets its key from the hub
# (ui/src/lib/edc/provision.ts) when mvhd-ui has VAULT_URL and VAULT_TOKEN;
# without them, run this again.
#
# Needs KC_HOST, KC_CLIENT_SECRET, IH (the identity API's whole address),
# VAULT_ADDR, VAULT_TOKEN, SIGLET_MANAGEMENT_URL and
# seed-siglet-key-mappings.sh beside it.
# =============================================================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

export KEYCLOAK_URL="$KC_HOST"
export EDC_CLIENT_SECRET="$KC_CLIENT_SECRET"
export EDC_IDENTITY_URL="$IH"
export VAULT_ADDR VAULT_TOKEN SIGLET_MANAGEMENT_URL
# Already inside the network: no container to go through.
export NET_CONTAINER=""
# The DIDs are did:web:mvhd-identityhub%3A7083:<slug>, plain http inside the
# environment, which is why 17-siglet.sh sets SIGLET__VAULT__USE_HTTP_RESOLUTION.
export DID_WEB_SCHEME="${DID_WEB_SCHEME:-http}"

case "${MODE:-plan}" in
  plan) bash "${SCRIPT_DIR}/seed-siglet-key-mappings.sh" --check ;;
  apply) bash "${SCRIPT_DIR}/seed-siglet-key-mappings.sh" ;;
  *) echo "MODE must be plan or apply" >&2; exit 2 ;;
esac
