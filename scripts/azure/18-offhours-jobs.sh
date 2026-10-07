#!/usr/bin/env bash
set -euo pipefail
# =============================================================================
# The off-hours stop and start on Azure's own cron, as a managed identity (ADR-058, #595)
# =============================================================================
#   18-offhours-jobs.sh             identity, roles and both jobs (idempotent)
#   18-offhours-jobs.sh --ref <sha> only point the jobs at another commit
#                                   (deploy-azure.yml does this on every deploy)
#   18-offhours-jobs.sh --check     report, change nothing
#   18-offhours-jobs.sh --dry-run   one execution of mvhd-offhours-check, which signs
#                                   in and decides both, changing nothing
#
# GitHub's scheduler dropped every scheduled run on 2026-10-06, so the stack
# neither started nor stopped (#595). These two Container Apps jobs run
# scripts/azure/offhours.sh on Azure's cron instead:
#
#   mvhd-offhours-stop    18:13 UTC daily       (20:13 Berlin in summer time)
#   mvhd-offhours-start   05:17 UTC Mon to Fri  (07:17 Berlin in summer time)
#   mvhd-offhours-check   manual only: signs in and decides both, changes nothing
#
# They sign in as the user-assigned identity id-mvhd-offhours, so nobody logs
# in anywhere and no GitHub token exists. Its roles, each as narrow as the
# work allows:
#   Container Apps Contributor  rg-mvhd-dev                stop, start, scale, jobs
#   Reader                      rg-mvhd-dev                the hold tag, the environment
#   Contributor                 the Flexible Server only   stop and start Postgres
#   Key Vault Secrets User      kv-mvhd-b53a0449           the realm restore's Keycloak password
#
# Each execution downloads the seven files it runs from this public repository
# at REPO_REF, the commit deploy-azure.yml last deployed, so the jobs run the
# code main runs. The image is pinned (ADR-029).
#
# The first run needs the PIM role (role assignments, job creation). After
# that the CI identity keeps REPO_REF current (Contributor covers the job update).
# =============================================================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
# shellcheck source=scripts/azure/env.sh
source "$SCRIPT_DIR/env.sh"

IDENTITY="id-mvhd-offhours"
IMAGE="mcr.microsoft.com/azure-cli:2.91.0"
REPO="ma3u/MinimumViableHealthDataspacev2"
JOBS=("mvhd-offhours-stop|13 18 * * *|stop" "mvhd-offhours-start|17 5 * * 1-5|start" "mvhd-offhours-check|manual|decide-all")
FILES="scripts/azure/offhours.sh scripts/azure/set-app-power.sh scripts/azure/retire-stale-revisions.sh scripts/azure/restore-keycloak-realm.sh scripts/azure/check-keycloak-health.sh scripts/azure/env.sh jad/keycloak-realm.json"

MODE="apply"; REF=""
while [ $# -gt 0 ]; do
  case "$1" in
    --ref) MODE="ref"; REF="$2"; shift 2 ;;
    --check) MODE="check"; shift ;;
    --dry-run) MODE="dry-run"; shift ;;
    *) sed -n '5,10p' "$0"; exit 64 ;;
  esac
done
[ -n "$REF" ] || REF="$(git -C "$REPO_ROOT" rev-parse origin/main 2>/dev/null || git -C "$REPO_ROOT" rev-parse HEAD)"
[[ "$REF" =~ ^[0-9a-f]{40}$ ]] || { err "REPO_REF must be a full commit sha, got '${REF}'"; exit 1; }

report() {
  local entry name
  for entry in "${JOBS[@]}"; do
    name="${entry%%|*}"
    if az containerapp job show -n "$name" -g "$RG" -o none 2>/dev/null; then
      az containerapp job show -n "$name" -g "$RG" --query "{job:name, cron:properties.configuration.scheduleTriggerConfig.cronExpression, ref:properties.template.containers[0].env[?name=='REPO_REF'].value | [0], identity:keys(identity.userAssignedIdentities)[0]}" -o json
      az containerapp job execution list -n "$name" -g "$RG" --query "[0:3].{execution:name, status:properties.status, start:properties.startTime}" -o table
    else
      echo "  MISSING  ${name}"
    fi
  done
}

if [ "$MODE" = check ]; then report; exit 0; fi

if [ "$MODE" = ref ]; then
  for entry in "${JOBS[@]}"; do
    name="${entry%%|*}"
    az containerapp job update -n "$name" -g "$RG" --set-env-vars "REPO_REF=${REF}" -o none
    ok "${name} runs ${REF:0:7}"
  done
  exit 0
fi

if [ "$MODE" = dry-run ]; then
  exec_name=$(az containerapp job start -n mvhd-offhours-check -g "$RG" --query name -o tsv)
  log "started ${exec_name}"
  for _ in $(seq 1 40); do
    st=$(az containerapp job execution show -n mvhd-offhours-check -g "$RG" --job-execution-name "$exec_name" --query properties.status -o tsv 2>/dev/null || true)
    case "$st" in Succeeded|Failed|Stopped) break ;; esac; sleep 10
  done
  [ "$st" = Succeeded ] || { err "${exec_name}: ${st:-unknown}"; exit 1; }
  ok "${exec_name}: Succeeded (signed in as ${IDENTITY}; both decisions in its log)"
  exit 0
fi

# ── identity and roles ──────────────────────────────────────────────────────
az identity show -n "$IDENTITY" -g "$RG" -o none 2>/dev/null ||
  az identity create -n "$IDENTITY" -g "$RG" -o none
ID_ID=$(az identity show -n "$IDENTITY" -g "$RG" --query id -o tsv)
ID_CLIENT=$(az identity show -n "$IDENTITY" -g "$RG" --query clientId -o tsv)
ID_PRINCIPAL=$(az identity show -n "$IDENTITY" -g "$RG" --query principalId -o tsv)
ok "identity ${IDENTITY} (${ID_CLIENT})"

RG_ID=$(az group show -n "$RG" --query id -o tsv)
PG_ID=$(az postgres flexible-server show -n "$PG_FLEX_NAME" -g "$RG" --query id -o tsv)
KV_ID=$(az keyvault show -n "$KEY_VAULT_NAME" --query id -o tsv)
grant() {  # grant <role> <scope>
  if [ -n "$(az role assignment list --assignee "$ID_PRINCIPAL" --role "$1" --scope "$2" --query '[0].id' -o tsv 2>/dev/null)" ]; then
    ok "  ${1} on ${2##*/}: present"
  else
    # A new identity takes a while to reach the directory; retry for a minute.
    for _ in 1 2 3 4 5 6; do
      az role assignment create --assignee-object-id "$ID_PRINCIPAL" --assignee-principal-type ServicePrincipal \
        --role "$1" --scope "$2" -o none 2>/dev/null && break
      sleep 10
    done
    [ -n "$(az role assignment list --assignee "$ID_PRINCIPAL" --role "$1" --scope "$2" --query '[0].id' -o tsv)" ] ||
      { err "could not grant ${1} on ${2}"; exit 1; }
    ok "  ${1} on ${2##*/}: granted"
  fi
}
grant "Container Apps Contributor" "$RG_ID"
grant "Reader" "$RG_ID"
grant "Contributor" "$PG_ID"
grant "Key Vault Secrets User" "$KV_ID"

# ── the jobs ────────────────────────────────────────────────────────────────
ENV_ID=$(az containerapp env show -n "$ACA_ENV" -g "$RG" --query id -o tsv)
LOCATION=$(az containerapp env show -n "$ACA_ENV" -g "$RG" --query location -o tsv)
SUB_ID=$(az account show --query id -o tsv)
for entry in "${JOBS[@]}"; do
  name="${entry%%|*}"; rest="${entry#*|}"; cron="${rest%%|*}"; action="${rest#*|}"
  yaml=$(mktemp)
  python3 - "$yaml" <<PY
import sys, yaml
body = r'''set -euo pipefail
mkdir -p /w && cd /w
for f in ${FILES}; do
  mkdir -p "\$(dirname "\$f")"
  curl -fsSL --retry 3 -o "\$f" "https://raw.githubusercontent.com/${REPO}/\${REPO_REF}/\$f"
done
chmod +x scripts/azure/*.sh
command -v jq >/dev/null || tdnf install -y jq >/dev/null
# The start skips Berlin public holidays with python's holidays package; the
# image has python3 but no pip.
if [ "\$ACTION" = start ] || [ "\$ACTION" = decide-all ]; then
  python3 -m pip --version >/dev/null 2>&1 || tdnf install -y python3-pip >/dev/null 2>&1 || true
fi
az login --identity --client-id "\$AZURE_CLIENT_ID" -o none
az account set --subscription "\$SUBSCRIPTION_ID"
echo "[offhours] \${ACTION} at \${REPO_REF:0:7} as id-mvhd-offhours"
case "\$ACTION" in
  # decide-all before decide-*, which would match it and run "decide all".
  decide-all) for a in stop start; do echo "[offhours] decide \$a: \$(bash scripts/azure/offhours.sh decide \$a)"; done ;;
  decide-*) bash scripts/azure/offhours.sh decide "\${ACTION#decide-}" ;;
  *) bash scripts/azure/offhours.sh "auto-\${ACTION}" ;;
esac
'''
doc = {"location": "${LOCATION}",
  "identity": {"type": "UserAssigned", "userAssignedIdentities": {"${ID_ID}": {}}},
  "properties": {"environmentId": "${ENV_ID}",
    "configuration": dict({"replicaTimeout": 3600, "replicaRetryLimit": 0},
      **({"triggerType": "Manual", "manualTriggerConfig": {"parallelism": 1, "replicaCompletionCount": 1}}
         if "${cron}" == "manual" else
         {"triggerType": "Schedule", "scheduleTriggerConfig": {"cronExpression": "${cron}", "parallelism": 1, "replicaCompletionCount": 1}})),
    "template": {"containers": [{"name": "offhours", "image": "${IMAGE}",
      "command": ["/bin/bash", "-c"], "args": [body],
      "resources": {"cpu": 0.5, "memory": "1Gi"},
      "env": [{"name": "ACTION", "value": "${action}"}, {"name": "REPO_REF", "value": "${REF}"},
              {"name": "AZURE_CLIENT_ID", "value": "${ID_CLIENT}"}, {"name": "SUBSCRIPTION_ID", "value": "${SUB_ID}"},
              {"name": "RESOURCE_GROUP", "value": "${RG}"}, {"name": "PG_FLEX_NAME", "value": "${PG_FLEX_NAME}"}]}]}}}
yaml.safe_dump(doc, open(sys.argv[1], "w"), sort_keys=False)
PY
  if az containerapp job show -n "$name" -g "$RG" -o none 2>/dev/null; then
    az containerapp job update -n "$name" -g "$RG" --yaml "$yaml" -o none
  else
    az containerapp job create -n "$name" -g "$RG" --yaml "$yaml" -o none
  fi
  rm -f "$yaml"
  ok "${name}: ${cron}${cron:+ }, ${action}, at ${REF:0:7}"
done
report
log "Prove sign-in and roles without changing anything: $0 --dry-run"
