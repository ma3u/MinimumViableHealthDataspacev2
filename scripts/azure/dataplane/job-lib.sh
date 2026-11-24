#!/usr/bin/env bash
# One-shot jobs inside the Container Apps environment, for the data plane's
# steps that need an address only the environment reaches (the management API,
# the Flexible Server, the proxy). Sourced by scripts/azure/23-dataplane.sh and
# scripts/azure/create-dataplane-database.sh, after env.sh.
#
#   dp_run_job <job> <image> <timeout seconds> <setup line> <entry> <file>...
#
# Packs the files flat, runs `bash <entry>` among them, prints the job's log
# and deletes the job. Returns 0 only when the execution succeeded.
#
# The caller sets two newline-separated lists:
#   DP_JOB_ENV          NAME=value          plain settings
#   DP_JOB_KV_SECRETS   NAME=key-vault-name secrets, each a Key Vault reference
#                                           read through KV_READER_IDENTITY
# No secret value passes through this shell: the job resolves the references
# itself (ADR-036), which is also why the CI identity, which cannot read the
# vault, can run these.

dp_kv_uri() {
  local uri
  uri="$(az keyvault show --name "$KEY_VAULT_NAME" --query properties.vaultUri -o tsv 2>/dev/null || true)"
  uri="${uri:-https://${KEY_VAULT_NAME}.vault.azure.net/}"
  printf '%s' "${uri%/}"
}

dp_run_job() {
  local job="$1" image="$2" timeout="$3" setup="$4" entry="$5"
  shift 5
  local work env_id identity_id kv_uri url exe status state ws f
  work="$(umask 077 && mktemp -d)"
  mkdir "${work}/pack"
  for f in "$@"; do cp "$f" "${work}/pack/"; done
  tar -czf "${work}/scripts.tgz" -C "${work}/pack" .
  env_id="$(az containerapp env show --name "$ACA_ENV" --resource-group "$RG" --query id -o tsv)"
  identity_id="$(az identity show --name "$KV_READER_IDENTITY" --resource-group "$RG" --query id -o tsv)"
  kv_uri="$(dp_kv_uri)"

  LOCATION="$LOCATION" ENV_ID="$env_id" IDENTITY_ID="$identity_id" KV_URI="$kv_uri" \
    IMAGE="$image" TIMEOUT="$timeout" SETUP="$setup" ENTRY="$entry" \
    DP_JOB_ENV="${DP_JOB_ENV:-}" DP_JOB_KV_SECRETS="${DP_JOB_KV_SECRETS:-}" \
    python3 -I - "${work}/scripts.tgz" "${work}/job.json" <<'PY'
import base64, json, os, sys
tgz, out = sys.argv[1:3]
e = os.environ
def pairs(text):
    return [line.split("=", 1) for line in text.splitlines() if "=" in line]
env = [{"name": k, "value": v} for k, v in pairs(e["DP_JOB_ENV"])]
env.append({"name": "SCRIPTS_TGZ_B64", "value": base64.b64encode(open(tgz, "rb").read()).decode()})
secrets = []
for name, kv_name in pairs(e["DP_JOB_KV_SECRETS"]):
    ref = name.lower().replace("_", "-")
    secrets.append({"name": ref, "keyVaultUrl": f"{e['KV_URI']}/secrets/{kv_name}", "identity": e["IDENTITY_ID"]})
    env.append({"name": name, "secretRef": ref})
body = ("set -u\n" + e["SETUP"] + "\n"
        'mkdir -p /tmp/s && echo "$SCRIPTS_TGZ_B64" | base64 -d | tar -xz -C /tmp/s\n'
        f"bash /tmp/s/{e['ENTRY']}; rc=$?\n"
        f'echo "=== {e["ENTRY"]} exited with $rc ==="\n'
        # Log Analytics drops the last lines of a container that exits at once.
        "sleep 30\nexit $rc\n")
doc = {"location": e["LOCATION"],
       "identity": {"type": "UserAssigned", "userAssignedIdentities": {e["IDENTITY_ID"]: {}}},
       "properties": {"environmentId": e["ENV_ID"],
         "configuration": {"triggerType": "Manual", "replicaTimeout": int(e["TIMEOUT"]), "replicaRetryLimit": 0,
           "manualTriggerConfig": {"parallelism": 1, "replicaCompletionCount": 1},
           "secrets": secrets},
         "template": {"containers": [{"name": "run", "image": e["IMAGE"],
           "command": ["/bin/sh", "-c"], "args": [body],
           "resources": {"cpu": 0.5, "memory": "1Gi"}, "env": env}]}}}
json.dump(doc, open(out, "w"))
PY

  if az containerapp job show --name "$job" --resource-group "$RG" -o none 2>/dev/null; then
    az containerapp job delete --name "$job" --resource-group "$RG" --yes -o none
  fi
  # The ARM body by PUT, as 20-cfm-fork.sh does for its apps: it carries the
  # identity and the Key Vault references as written.
  url="https://management.azure.com${env_id%/providers/*}/providers/Microsoft.App/jobs/${job}?api-version=2024-03-01"
  az rest --method put --only-show-errors -o none --url "$url" --body "@${work}/job.json"
  rm -rf "$work"
  state=""
  for _ in $(seq 1 30); do
    state="$(az containerapp job show --name "$job" --resource-group "$RG" \
      --query properties.provisioningState -o tsv 2>/dev/null || true)"
    case "$state" in Succeeded | Failed | Canceled) break ;; esac
    sleep 5
  done
  if [ "$state" != Succeeded ]; then
    err "job ${job} is '${state:-unknown}' after its creation; a Key Vault reference that names no secret ends here"
    az containerapp job delete --name "$job" --resource-group "$RG" --yes -o none 2>/dev/null || true
    return 1
  fi

  exe="$(az containerapp job start --name "$job" --resource-group "$RG" --query name -o tsv)"
  log "job ${job}, execution ${exe}"
  status=Pending
  for _ in $(seq 1 $((timeout / 12 + 10))); do
    status="$(az containerapp job execution show --name "$job" --resource-group "$RG" \
      --job-execution-name "$exe" --query properties.status -o tsv 2>/dev/null || echo Pending)"
    case "$status" in Succeeded | Failed | Stopped) break ;; esac
    sleep 12
  done
  ws="$(az containerapp env show --name "$ACA_ENV" --resource-group "$RG" \
    --query properties.appLogsConfiguration.logAnalyticsConfiguration.customerId -o tsv 2>/dev/null || true)"
  if [ -n "$ws" ]; then
    sleep 75 # Log Analytics lags the job
    az monitor log-analytics query -w "$ws" --analytics-query \
      "ContainerAppConsoleLogs_CL | where ContainerGroupName_s startswith '${exe}' | order by TimeGenerated asc | project Log_s" \
      -o tsv 2>/dev/null | sed 's/\tPrimaryResult$//' || true
  fi
  az containerapp job delete --name "$job" --resource-group "$RG" --yes -o none 2>/dev/null || true
  if [ "$status" != Succeeded ]; then
    err "job ${job}, execution ${exe}: ${status}"
    return 1
  fi
  ok "job ${job}: ${status}"
}
