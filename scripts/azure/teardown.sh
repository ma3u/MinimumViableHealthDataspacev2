#!/usr/bin/env bash
# Teardown — delete the entire resource group and all resources.
# WARNING: This is irreversible!
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/env.sh"

echo ""
echo "  !!  WARNING: This will DELETE the entire resource group '${RG}'"
echo "  !!  and ALL resources inside it (container apps, PostgreSQL, ACR,"
echo "  !!  Log Analytics, alerts, dashboard)."
echo ""
echo "  !!  This action is IRREVERSIBLE."
echo ""

read -rp "  Type '${RG}' to confirm deletion: " confirm
if [[ "$confirm" != "$RG" ]]; then
  echo "Aborted."
  exit 1
fi

log "Deleting resource group ${RG}..."
az group delete --name "$RG" --yes --no-wait
ok "Resource group deletion initiated (runs in background)"
echo ""
echo "  Monitor progress: az group show --name ${RG} --query 'properties.provisioningState'"
echo "  Full deletion takes ~5 minutes."
