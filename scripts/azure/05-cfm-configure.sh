#!/usr/bin/env bash
# =============================================================================
# Give the CFM managers the config file they actually read.
# =============================================================================
# The Tenant Manager and Provision Manager are Go binaries that read a flat
# Viper file, `/etc/appname/tm.env` and `/etc/appname/pm.env`. The local stack
# mounts jad/tenant-manager-config.yaml and jad/provision-manager-config.yaml
# there. On Azure `05-cfm-ui.sh` passed only a DATABASE_URL environment
# variable, which those binaries never look at, so the Tenant Manager has been
# crash-looping since it was first deployed:
#
#   panic: error launching Tenant Manager: missing parameters:
#          tm.uri is empty, tm.bucket is empty, tm.stream is empty
#
# That is the root cause of "Failed to create participant" on /onboarding:
# every call to the manager hit an app whose container never got past its own
# launcher. Issue #203.
#
# The config is mounted as an ACA secret volume, the same shape the compose
# stack uses, with the values pointed at the Azure services: NATS at
# mvhd-nats:4222 and Postgres at mvhd-postgres:5432/cfm.
#
# Idempotent: re-running updates the secret and leaves the mount alone.
#
# Usage:  bash scripts/azure/05-cfm-configure.sh
# Needs:  az (logged in), python3 with PyYAML. No TTY required — pure ARM, no
#         `az containerapp exec`, which needs one and fails headless.
# =============================================================================
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/env.sh"

log "Configuring the CFM managers"

# ── Postgres credentials for the DSN ────────────────────────────────────────
# The password lives in the Postgres app's secret store; the env var on that app
# is a secretref, not a value.
PG_PASSWORD_LIVE=$(az containerapp secret show \
  --name "$PG_APP" --resource-group "$RG" \
  --secret-name pg-password --query value -o tsv 2>/dev/null || echo "")

if [ -z "$PG_PASSWORD_LIVE" ]; then
  err "could not read the pg-password secret from ${PG_APP}"
  exit 1
fi
log "read pg-password from ${PG_APP} (${#PG_PASSWORD_LIVE} chars)"

# ── NATS must exist: the managers refuse to launch without a JetStream uri ──
if ! az containerapp show --name "$NATS_APP" --resource-group "$RG" -o none 2>/dev/null; then
  err "${NATS_APP} does not exist. The CFM managers cannot launch without it."
  err "Run scripts/azure/04-edc-services.sh, which creates NATS."
  exit 1
fi
NATS_MIN=$(az containerapp show --name "$NATS_APP" --resource-group "$RG" \
  --query "properties.template.scale.minReplicas" -o tsv)
if [ "$NATS_MIN" != "1" ]; then
  log "scaling ${NATS_APP} to min=1 (was ${NATS_MIN}) — the managers hold a JetStream connection"
  az containerapp update --name "$NATS_APP" --resource-group "$RG" \
    --min-replicas 1 --max-replicas 1 -o none
fi

# ── Apply to both managers ──────────────────────────────────────────────────
# $1 app name, $2 secret name, $3 file name inside /etc/appname
configure_manager() {
  local app="$1" secret_name="$2" file_name="$3"

  log "configuring ${app} (${file_name})"

  # Same keys as the compose config, pointed at the Azure services. `postgres:
  # true` switches the manager from in-memory to Postgres persistence.
  local config
  config=$(cat <<CONFIG
uri: nats://${NATS_APP}:4222
bucket: cfm-bucket
stream: cfm-stream
httpport: 8080
postgres: true
dsn: postgres://${PG_ADMIN}:${PG_PASSWORD_LIVE}@${PG_APP}:5432/cfm?sslmode=disable
CONFIG
)

  az containerapp secret set --name "$app" --resource-group "$RG" \
    --secrets "${secret_name}=${config}" -o none
  log "  secret ${secret_name} set"

  local yaml
  yaml=$(mktemp)
  az containerapp show --name "$app" --resource-group "$RG" -o yaml > "$yaml"

  python3 - "$yaml" "$secret_name" "$file_name" <<'PY'
import sys, yaml

path, secret_name, file_name = sys.argv[1], sys.argv[2], sys.argv[3]
with open(path) as f:
    doc = yaml.safe_load(f)

tpl = doc['properties']['template']
volume_name = 'cfm-config'

vols = tpl.get('volumes') or []
# Replace any existing definition so a changed file name or secret name lands.
vols = [v for v in vols if (v or {}).get('name') != volume_name]
vols.append({
    'name': volume_name,
    'storageType': 'Secret',
    'secrets': [{'secretRef': secret_name, 'path': file_name}],
})
tpl['volumes'] = vols

for c in tpl['containers']:
    mounts = [m for m in (c.get('volumeMounts') or [])
              if (m or {}).get('volumeName') != volume_name]
    mounts.append({'volumeName': volume_name, 'mountPath': '/etc/appname'})
    c['volumeMounts'] = mounts

with open(path, 'w') as f:
    yaml.safe_dump(doc, f)
PY

  az containerapp update --name "$app" --resource-group "$RG" --yaml "$yaml" -o none
  rm -f "$yaml"
  ok "  ${app}: ${file_name} mounted at /etc/appname"

  # The managers are only useful warm: onboarding calls the TenantManager on
  # every request, and a cold start would repeat the whole discovery.
  local min
  min=$(az containerapp show --name "$app" --resource-group "$RG" \
    --query "properties.template.scale.minReplicas" -o tsv)
  if [ "$min" != "1" ]; then
    log "  scaling ${app} to min=1 (was ${min})"
    az containerapp update --name "$app" --resource-group "$RG" \
      --min-replicas 1 --max-replicas 1 -o none
  fi
}

configure_manager "$TENANT_MGR_APP"    tm-env tm.env
configure_manager "$PROVISION_MGR_APP" pm-env pm.env

ok "CFM managers configured"
log ""
log "Next: .github/workflows/cfm-seed.yml seeds the cell and the dataspace"
log "profile. Until the four CFM agents are also deployed, a new participant's"
log "VPAs stay pending: no image of those agents is in ACR yet. Issue #203."
