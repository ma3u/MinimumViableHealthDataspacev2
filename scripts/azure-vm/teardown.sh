#!/usr/bin/env bash
# ADR-015: Teardown the single-VM dev deployment. Deletes the entire RG.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=env.sh
source "${SCRIPT_DIR}/env.sh"

az account set --subscription "${AZ_SUBSCRIPTION}"

cat <<EOF
About to DELETE resource group: ${RG}
Subscription                  : ${AZ_SUBSCRIPTION}
This will destroy the VM, disk, NSG, public IP, and Logic App.
EOF

read -r -p "Type the RG name to confirm: " confirm
if [[ "${confirm}" != "${RG}" ]]; then
  echo "Aborted."
  exit 1
fi

az group delete --name "${RG}" --yes --no-wait
echo "Deletion started in the background. Check with: az group show --name ${RG}"
