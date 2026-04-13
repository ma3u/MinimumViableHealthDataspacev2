#!/usr/bin/env bash
# ADR-015: Provision the single-VM dev deployment.
# Idempotent — safe to re-run. All state lives in Azure; no local artifacts.
#
# Usage:
#   cd scripts/azure-vm
#   ./deploy.sh                # full create/update
#   DRY_RUN=1 ./deploy.sh      # print az commands without running them
#
# Prereqs:
#   - az CLI logged in (`az login`)
#   - Active subscription is the personal VS sub (override with AZ_SUBSCRIPTION)
#   - SSH public key at ~/.ssh/id_rsa.pub (override with VM_SSH_KEY)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=env.sh
source "${SCRIPT_DIR}/env.sh"

az_cmd() {
  if [[ "${DRY_RUN:-0}" == "1" ]]; then
    echo "+ az $*"
  else
    az "$@"
  fi
}

log() { printf "\033[1;34m[deploy]\033[0m %s\n" "$*"; }

# ── 0. Validate inputs ───────────────────────────────────────────────────────
if [[ ! -f "${VM_SSH_KEY}" ]]; then
  echo "ERROR: SSH public key not found at ${VM_SSH_KEY}" >&2
  echo "Set VM_SSH_KEY or generate one with: ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519" >&2
  exit 1
fi

log "Selecting subscription: ${AZ_SUBSCRIPTION}"
az_cmd account set --subscription "${AZ_SUBSCRIPTION}"

SUB_ID="$(az account show --query id -o tsv)"
log "Subscription id: ${SUB_ID}"

# ── 1. Resolve SSH source IP ─────────────────────────────────────────────────
if [[ -z "${SSH_SOURCE_CIDR}" ]]; then
  log "Resolving current public IP for SSH lockdown"
  MY_IP="$(curl -fsSL https://api.ipify.org)"
  SSH_SOURCE_CIDR="${MY_IP}/32"
  log "SSH source CIDR: ${SSH_SOURCE_CIDR}"
fi

# ── 2. Resource group ────────────────────────────────────────────────────────
log "Ensuring resource group ${RG} in ${LOCATION}"
az_cmd group create --name "${RG}" --location "${LOCATION}" --output none

# ── 3. NSG with per-port rules (SSH restricted, stack ports open) ────────────
log "Ensuring NSG ${NSG_NAME}"
az_cmd network nsg create \
  --resource-group "${RG}" \
  --name "${NSG_NAME}" \
  --location "${LOCATION}" \
  --output none

priority=1000
for port in "${OPEN_PORTS[@]}"; do
  rule_name="allow-${port}"
  src="Internet"
  [[ "${port}" == "22" ]] && src="${SSH_SOURCE_CIDR}"
  log "  rule ${rule_name} (src=${src})"
  az_cmd network nsg rule create \
    --resource-group "${RG}" \
    --nsg-name "${NSG_NAME}" \
    --name "${rule_name}" \
    --priority "${priority}" \
    --source-address-prefixes "${src}" \
    --destination-port-ranges "${port}" \
    --access Allow --protocol Tcp --direction Inbound \
    --output none 2>/dev/null || \
  az_cmd network nsg rule update \
    --resource-group "${RG}" \
    --nsg-name "${NSG_NAME}" \
    --name "${rule_name}" \
    --source-address-prefixes "${src}" \
    --output none
  priority=$((priority + 10))
done

# ── 4. VM with cloud-init ────────────────────────────────────────────────────
if az vm show --resource-group "${RG}" --name "${VM_NAME}" --output none 2>/dev/null; then
  log "VM ${VM_NAME} already exists — skipping create (use teardown.sh to recreate)"
else
  log "Creating VM ${VM_NAME} (${VM_SIZE})"
  az_cmd vm create \
    --resource-group "${RG}" \
    --name "${VM_NAME}" \
    --image "${VM_IMAGE}" \
    --size "${VM_SIZE}" \
    --admin-username "${VM_ADMIN}" \
    --ssh-key-values "${VM_SSH_KEY}" \
    --nsg "${NSG_NAME}" \
    --public-ip-sku Standard \
    --os-disk-size-gb "${VM_DISK_SIZE_GB}" \
    --storage-sku "${VM_OS_DISK_SKU}" \
    --custom-data "${SCRIPT_DIR}/cloud-init.yaml" \
    --output none
fi

PUBLIC_IP="$(az vm show -d --resource-group "${RG}" --name "${VM_NAME}" --query publicIps -o tsv 2>/dev/null || echo '')"
log "VM public IP: ${PUBLIC_IP:-<pending>}"

# ── 5. Auto-shutdown at 20:00 Europe/Berlin (native DevTestLabs schedule) ────
log "Configuring daily auto-shutdown at ${SHUTDOWN_TIME} (${SHUTDOWN_TZ})"
az_cmd vm auto-shutdown \
  --resource-group "${RG}" \
  --name "${VM_NAME}" \
  --time "${SHUTDOWN_TIME}" \
  --output none

# Set time zone on the schedule resource (az vm auto-shutdown defaults to UTC)
SHUTDOWN_RESOURCE="shutdown-computevm-${VM_NAME}"
log "  setting schedule timeZone → ${SHUTDOWN_TZ}"
az_cmd resource update \
  --resource-group "${RG}" \
  --resource-type Microsoft.DevTestLab/schedules \
  --name "${SHUTDOWN_RESOURCE}" \
  --set properties.timeZoneId="${SHUTDOWN_TZ}" \
  --output none

# ── 6. Logic App for weekday 07:00 auto-start ────────────────────────────────
log "Deploying Logic App ${LOGIC_APP_NAME} (weekday ${STARTUP_HOUR}:00 ${SHUTDOWN_TZ})"
DEPLOY_OUT="$(az_cmd deployment group create \
  --resource-group "${RG}" \
  --name "la-mvhd-dev-$(date +%s)" \
  --template-file "${SCRIPT_DIR}/logic-app-start.json" \
  --parameters \
    logicAppName="${LOGIC_APP_NAME}" \
    location="${LOCATION}" \
    vmResourceGroup="${RG}" \
    vmName="${VM_NAME}" \
    startupHour="${STARTUP_HOUR}" \
    weekDays="${STARTUP_DAYS}" \
    timeZone="${SHUTDOWN_TZ}" \
  --query "properties.outputs.principalId.value" -o tsv)"

if [[ "${DRY_RUN:-0}" != "1" ]]; then
  PRINCIPAL_ID="${DEPLOY_OUT}"
  log "Logic App managed identity principalId: ${PRINCIPAL_ID}"

  # ── 7. Grant Logic App → VM start permission ─────────────────────────────
  VM_ID="$(az vm show --resource-group "${RG}" --name "${VM_NAME}" --query id -o tsv)"
  log "Granting Virtual Machine Contributor on VM to Logic App"
  # Retry: role assignment sometimes fails until managed identity fully propagates
  for i in 1 2 3 4 5; do
    if az role assignment create \
        --assignee-object-id "${PRINCIPAL_ID}" \
        --assignee-principal-type ServicePrincipal \
        --role "Virtual Machine Contributor" \
        --scope "${VM_ID}" \
        --output none 2>/dev/null; then
      log "  role assignment succeeded (attempt ${i})"
      break
    fi
    log "  waiting for managed identity propagation (attempt ${i}/5)"
    sleep 10
  done
fi

# ── 8. Summary ───────────────────────────────────────────────────────────────
cat <<EOF

┌────────────────────────────────────────────────────────────────────┐
│  ADR-015 single-VM dev deployment                                  │
├────────────────────────────────────────────────────────────────────┤
│  Resource group : ${RG}
│  VM             : ${VM_NAME} (${VM_SIZE})
│  Public IP      : ${PUBLIC_IP:-<pending, check 'az vm show -d'>}
│  SSH            : ssh ${VM_ADMIN}@${PUBLIC_IP:-<ip>}
│
│  Schedule:
│    stop  → daily   ${SHUTDOWN_TIME} ${SHUTDOWN_TZ}
│    start → Mon-Fri ${STARTUP_HOUR}:00 ${SHUTDOWN_TZ}   (via ${LOGIC_APP_NAME})
│
│  Access URLs (after ~5 min for cloud-init):
│    UI          : http://${PUBLIC_IP:-<ip>}:3000
│    Neo4j HTTP  : http://${PUBLIC_IP:-<ip>}:7474
│    Keycloak    : http://${PUBLIC_IP:-<ip>}:8080
│
│  Teardown      : ./teardown.sh
└────────────────────────────────────────────────────────────────────┘

First start: the VM is running now. Auto-start kicks in at the next
weekday 07:00 after the next 20:00 stop.
EOF
