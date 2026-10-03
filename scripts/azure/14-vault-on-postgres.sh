#!/usr/bin/env bash
# =============================================================================
# Phase 14: Vault keeps its data on the Flexible Server (ADR-046, #455)
# =============================================================================
# mvhd-vault ran `vault server -dev`: in memory, so every new revision and
# every scale from zero started an empty Vault. The evening stop creates a new
# revision on every weekday, so participant signing keys, STS client secrets
# and the JWT auth the CFM agents log in with were gone every night, and only
# the morning bootstrap put the configuration (never the keys) back.
#
# After this phase mvhd-vault is two containers in one replica:
#   vault         `vault server`, storage "postgresql" on the vault database
#   vault-unseal  creates Vault's table, initialises once, unseals on every
#                 start, keeps the fixed-id service token, re-unseals if the
#                 vault container restarts (scripts/azure/vault-unseal/)
# The unseal key and root token live in init.json on the vault-data share,
# dev-grade and the same as the compose stack's vault_keys volume.
#
#   ./scripts/azure/14-vault-on-postgres.sh check   # read-only
#   ./scripts/azure/14-vault-on-postgres.sh 1       # create the vault database
#   ./scripts/azure/14-vault-on-postgres.sh 2       # build + push the sidecar
#   ./scripts/azure/14-vault-on-postgres.sh 3       # switch mvhd-vault over
#   ./scripts/azure/14-vault-on-postgres.sh all     # 1, 2, 3
#
# Phase 3 replaces an in-memory Vault with an empty persistent one, so run
# `repair-live-stack.sh 5` (the bootstrap) right after it, then reseed.
#
# Needs: az (logged in, PIM rol-ssg-prd-project_owner active for the database
# and the revision), docker with buildx, Key Vault Secrets User or better.
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
# shellcheck source=env.sh
source "${SCRIPT_DIR}/env.sh"

VAULT_DB="vault"
VAULT_PG_SECRET="vault-pg-url"
UNSEAL_REPO="mvhd-vault-unseal"
INIT_FILE="/vault/data/init.json"

say() { echo "[$(date -u +%H:%M:%S)] $*"; }
die() { echo "FAIL: $*" >&2; exit 1; }

require_az() {
  # get-access-token, not account show: the latter returns 0 on a dead token
  # (repair-live-stack.sh:require_az has the measurement).
  az account get-access-token -o none >/dev/null 2>&1 || die "$(cat <<'MSG'
the Azure CLI is not logged in, or its token has expired. Re-authenticate:
  az login --tenant 8b87af7d-8647-4dc7-8df4-5f69a2011bb5
MSG
)"
}

unseal_tag() { git -C "$REPO_ROOT" rev-parse --short HEAD; }

# ── check ───────────────────────────────────────────────────────────────────
phase_check() {
  say "mvhd-vault containers and mode"
  az containerapp show --name "$VAULT_APP" --resource-group "$RG" -o json |
    python3 -c "
import json, sys
a = json.load(sys.stdin); t = a['properties']['template']
for c in t['containers']:
    env = {e['name'] for e in c.get('env') or []}
    mode = 'DEV, in memory' if 'VAULT_DEV_ROOT_TOKEN_ID' in env else 'persistent' if 'VAULT_PG_CONNECTION_URL' in env else '-'
    print(f\"  {c['name']:<14} {c['image'].rsplit('/', 1)[-1]:<28} {mode}\")
print('  scale:', t['scale'].get('minReplicas'), '/', t['scale'].get('maxReplicas'))
"
  az containerapp revision list --name "$VAULT_APP" --resource-group "$RG" \
    --query "[?properties.active].{rev:name,created:properties.createdTime,health:properties.healthState,state:properties.runningState}" \
    -o table

  echo ""
  say "database ${VAULT_DB} on ${PG_FLEX_NAME}"
  if az postgres flexible-server db show --server-name "$PG_FLEX_NAME" \
       --resource-group "$RG" --name "$VAULT_DB" -o none 2>/dev/null; then
    echo "  present"
  else
    echo "  absent (phase 1)"
  fi

  echo ""
  say "sidecar log (last 10, empty before phase 3)"
  az containerapp logs show --name "$VAULT_APP" --resource-group "$RG" \
    --container vault-unseal --tail 10 --format text 2>/dev/null || echo "  (no vault-unseal container)"
}

# ── 1: the database ─────────────────────────────────────────────────────────
phase_1() {
  say "Phase 1: database ${VAULT_DB} on ${PG_FLEX_NAME}"
  # Through ARM, like 13-postgres-flexible-server.sh phase 2: the server only
  # admits Azure addresses, so no psql from here. The table is created by the
  # sidecar, which runs inside the environment.
  if az postgres flexible-server db show --server-name "$PG_FLEX_NAME" \
       --resource-group "$RG" --name "$VAULT_DB" -o none 2>/dev/null; then
    say "  already there"
  else
    az postgres flexible-server db create --server-name "$PG_FLEX_NAME" \
      --resource-group "$RG" --name "$VAULT_DB" -o none
  fi
  az postgres flexible-server db show --server-name "$PG_FLEX_NAME" \
    --resource-group "$RG" --name "$VAULT_DB" -o none ||
    die "${VAULT_DB} does not read back"
  say "  ${VAULT_DB} present"
}

# ── 2: the sidecar image ────────────────────────────────────────────────────
phase_2() {
  local tag img
  tag="$(unseal_tag)"
  img="${ACR_LOGIN_SERVER}/${UNSEAL_REPO}:${tag}"
  if ! git -C "$REPO_ROOT" diff --quiet HEAD -- scripts/vault-init-or-unseal.sh scripts/azure/vault-unseal; then
    die "the sidecar sources differ from ${tag}; commit them so the tag names what is in the image"
  fi
  say "Phase 2: build and push ${img}"
  az acr login --name "$ACR_NAME" >/dev/null
  # Context is the repository root: the image carries the same
  # vault-init-or-unseal.sh as the compose vault-unseal sidecar.
  docker buildx build --platform linux/amd64 \
    --build-arg "VAULT_VERSION=${VAULT_VERSION}" \
    -f "${SCRIPT_DIR}/vault-unseal/Dockerfile" \
    -t "$img" --push "$REPO_ROOT"
  az acr repository show-tags --name "$ACR_NAME" --repository "$UNSEAL_REPO" -o tsv |
    grep -qx "$tag" || die "${img} is not in ${ACR_NAME} after the push"
  say "  pushed"
}

# ── 3: switch the app ───────────────────────────────────────────────────────
phase_3() {
  local tag img pw url backup yaml prev
  tag="$(unseal_tag)"
  img="${ACR_LOGIN_SERVER}/${UNSEAL_REPO}:${tag}"
  az acr repository show-tags --name "$ACR_NAME" --repository "$UNSEAL_REPO" -o tsv 2>/dev/null |
    grep -qx "$tag" || die "${img} is not in ${ACR_NAME}; run phase 2"
  az postgres flexible-server db show --server-name "$PG_FLEX_NAME" \
    --resource-group "$RG" --name "$VAULT_DB" -o none 2>/dev/null ||
    die "no ${VAULT_DB} database; run phase 1"

  say "Phase 3: ${VAULT_APP} to storage \"postgresql\" with the unseal sidecar"
  pw="$(pg_admin_password)"
  [ -n "$pw" ] || die "no Flexible Server password"
  # Percent-encoded: the URL is parsed by both pgx (Vault) and libpq (psql).
  url="$(PW="$pw" python3 -c "
import os, urllib.parse
print('postgres://${PG_ADMIN}:' + urllib.parse.quote(os.environ['PW'], safe='')
      + '@${PG_HOST}:${PG_PORT}/${VAULT_DB}?sslmode=${PG_SSLMODE}')")"
  unset pw
  az containerapp secret set --name "$VAULT_APP" --resource-group "$RG" \
    --secrets "${VAULT_PG_SECRET}=${url}" -o none || die "could not set ${VAULT_PG_SECRET}"
  unset url

  # The current definition, kept for the way back. No secret values in it.
  backup="$(mktemp -t mvhd-vault-before.XXXXXX).yaml"
  az containerapp show --name "$VAULT_APP" --resource-group "$RG" -o yaml > "$backup"
  prev=$(az containerapp show --name "$VAULT_APP" --resource-group "$RG" \
    --query properties.latestRevisionName -o tsv)
  say "  rollback: az containerapp update -n ${VAULT_APP} -g ${RG} --yaml ${backup}"
  say "  (that is ${prev}, in-memory dev mode)"

  yaml="$(mktemp -t mvhd-vault-after.XXXXXX).yaml"
  cp "$backup" "$yaml"
  python3 - "$yaml" "$img" "$VAULT_PG_SECRET" "$VAULT_ROOT_TOKEN" "$INIT_FILE" <<'PY'
import json, sys, yaml
path, img, secret, token_id, init_file = sys.argv[1:]
with open(path) as f:
    doc = yaml.safe_load(f)
tpl = doc['properties']['template']
vault = next(c for c in tpl['containers'] if c['name'] != 'vault-unseal')

config = {
    'storage': {'postgresql': {'ha_enabled': 'false'}},
    'listener': {'tcp': {'address': '0.0.0.0:8200', 'tls_disable': 'true'}},
    'api_addr': 'http://127.0.0.1:8200',
    'disable_mlock': True,
    'ui': False,
}
# The image's entrypoint writes VAULT_LOCAL_CONFIG to /vault/config/local.json.
# `vault` as the first word skips the entrypoint's -dev-* flags.
vault['command'] = ['vault', 'server', '-config=/vault/config']
vault.pop('args', None)
vault['env'] = [
    {'name': 'SKIP_SETCAP', 'value': 'true'},
    {'name': 'VAULT_LOCAL_CONFIG', 'value': json.dumps(config, separators=(',', ':'))},
    {'name': 'VAULT_PG_CONNECTION_URL', 'secretRef': secret},
]
vault['volumeMounts'] = None
vault['resources'] = {'cpu': 0.5, 'memory': '1Gi'}

unseal = {
    'name': 'vault-unseal',
    'image': img,
    'resources': {'cpu': 0.25, 'memory': '0.5Gi'},
    'env': [
        {'name': 'VAULT_ADDR', 'value': 'http://127.0.0.1:8200'},
        {'name': 'VAULT_ENSURE_TOKEN_ID', 'value': token_id},
        {'name': 'VAULT_INIT_FILE', 'value': init_file},
        {'name': 'VAULT_PG_CONNECTION_URL', 'secretRef': secret},
    ],
    'volumeMounts': [{'volumeName': 'vault-data', 'mountPath': '/vault/data'}],
}
tpl['containers'] = [vault, unseal]
vols = tpl.get('volumes') or []
if not any((v or {}).get('name') == 'vault-data' for v in vols):
    vols.append({'name': 'vault-data', 'storageType': 'AzureFile', 'storageName': 'vault-data'})
tpl['volumes'] = vols
with open(path, 'w') as f:
    yaml.safe_dump(doc, f)
PY
  az containerapp update --name "$VAULT_APP" --resource-group "$RG" --yaml "$yaml" -o none
  rm -f "$yaml"

  # Min 1 while it is verified; the evening stop sets 0 again, which is now
  # harmless because the next start unseals the same storage.
  az containerapp update --name "$VAULT_APP" --resource-group "$RG" \
    --min-replicas 1 --max-replicas 1 -o none

  say "  waiting for the sidecar to report ready (up to 5 min)"
  local i log=""
  for i in $(seq 1 30); do
    sleep 10
    log=$(az containerapp logs show --name "$VAULT_APP" --resource-group "$RG" \
      --container vault-unseal --tail 40 --format text 2>/dev/null || true)
    if printf '%s' "$log" | grep -q '\[vault-init\] ready'; then
      printf '%s\n' "$log" | grep -E 'vault-init|vault-unseal' | tail -8
      say "Phase 3 done: Vault is persistent and unsealed."
      say "Next: repair-live-stack.sh 5 (bootstrap), then 05-cfm-agents.sh."
      return 0
    fi
    if printf '%s' "$log" | grep -q 'ERROR'; then
      printf '%s\n' "$log" | tail -12
      die "the sidecar reported an error; rollback is above"
    fi
    echo "    ${i}/30"
  done
  printf '%s\n' "$log" | tail -12
  die "no 'ready' from vault-unseal after 5 min; rollback is above"
}

case "${1:-}" in
  check) require_az; phase_check ;;
  1) require_az; phase_1 ;;
  2) require_az; phase_2 ;;
  3) require_az; phase_3 ;;
  all) require_az; phase_1; phase_2; phase_3 ;;
  *) sed -n '19,25p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac
