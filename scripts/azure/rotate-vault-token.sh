#!/usr/bin/env bash
# =============================================================================
# Rotate the Vault token the EDC services use, and revoke "root" (#359).
# =============================================================================
#   rotate-vault-token.sh check         read only: where each app keeps its token
#   rotate-vault-token.sh apply         new token, as the ACA secret vault-token
#   rotate-vault-token.sh revoke-root   after apply: the sidecar stops recreating
#                                       "root", then "root" is revoked
#
# Until now the five EDC apps passed the literal token "root" as a plain env
# value, and the vault-unseal sidecar recreates a token with that id (policy
# root) on every start. The value is in this public repository and the Vault
# holds every participant's signing key.
#
# apply creates an orphan token with a random id and the root policy, the same
# rights the services have today (narrowing the policy is a follow-up: a wrong
# path breaks signing). The id is generated here, handed to a one-shot job
# inside the environment as an ACA secret (Vault is internal), and never
# printed. Each app then gets it as the secret vault-token and the env
# reference secretref:vault-token, one at a time, waiting for Healthy. "root"
# stays valid throughout, so a failed step leaves the old revision working.
#
# revoke-root removes VAULT_ENSURE_TOKEN_ID from the sidecar (new mvhd-vault
# revision, unsealed by the sidecar), points the mvhd-vault-bootstrap job at the
# secret, and revokes "root" with the new token. Run it after apply and a check
# (Demo Smoke, scripts/run-api-tests.sh Azure-Dev, a negotiation).
#
# Needs: az, logged in with write access to rg-mvhd-dev. Office hours: each
# app restarts once.
# =============================================================================
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=env.sh
source "${SCRIPT_DIR}/env.sh"

MODE="${1:-check}"
JOB="mvhd-vault-rotate"
EDC_APPS=("$CONTROLPLANE_APP" mvhd-identityhub mvhd-issuerservice mvhd-dp-fhir mvhd-dp-omop)
SIGLET="mvhd-siglet"
TOKEN_ENV="EDC_VAULT_HASHICORP_TOKEN"

token_kind() {
  az containerapp show --name "$1" --resource-group "$RG" -o json | python3 -c '
import json, sys
a = json.load(sys.stdin)
for c in a["properties"]["template"]["containers"]:
    for e in c.get("env") or []:
        if "VAULT" in e["name"] and "TOKEN" in e["name"]:
            kind = "secretref:" + e["secretRef"] if "secretRef" in e else "plain, %d chars" % len(e.get("value", ""))
            print("%s %s=%s" % (c["name"], e["name"], kind))'
}

check() {
  local app
  for app in "${EDC_APPS[@]}" "$SIGLET" "$VAULT_APP"; do
    printf '%-20s %s\n' "$app" "$(token_kind "$app" | tr '\n' ' ')"
  done
  printf '%-20s %s\n' "$JOB" "$(az containerapp job show -n "$JOB" -g "$RG" --query name -o tsv 2>/dev/null || echo "not created")"
}

latest_health() {
  local rev
  rev=$(az containerapp show --name "$1" --resource-group "$RG" --query properties.latestRevisionName -o tsv)
  az containerapp revision show --name "$1" --resource-group "$RG" --revision "$rev" \
    --query properties.healthState -o tsv
}

wait_healthy() {
  local state=""
  for _ in $(seq 1 40); do
    state=$(latest_health "$1")
    [ "$state" = Healthy ] && { ok "$1 Healthy"; return 0; }
    sleep 15
  done
  err "$1 is '${state}' after 10 minutes"
  return 1
}

# run_job <script>: one-shot alpine job inside the environment with OLD_TOKEN
# and NEW_TOKEN as ACA secrets; returns its exit status.
run_job() {
  local body="$1" yaml exec status=""
  umask 077
  yaml=$(mktemp)
  ENV_ID=$(az containerapp env show -n "$ACA_ENV" -g "$RG" --query id -o tsv) \
  LOCATION=$(az containerapp env show -n "$ACA_ENV" -g "$RG" --query location -o tsv) \
  VAULT_URL="$VAULT_URL" BODY="$body" OLD="$OLD_TOKEN" NEW="$NEW_TOKEN" \
    python3 - "$yaml" <<'PY'
import json, os, sys
e = os.environ
doc = {"location": e["LOCATION"], "properties": {"environmentId": e["ENV_ID"],
  "configuration": {"triggerType": "Manual", "replicaTimeout": 300, "replicaRetryLimit": 0,
    "manualTriggerConfig": {"parallelism": 1, "replicaCompletionCount": 1},
    "secrets": [{"name": "old-token", "value": e["OLD"]}, {"name": "new-token", "value": e["NEW"]}]},
  "template": {"containers": [{"name": "rotate", "image": "docker.io/library/alpine:3.19",
    "command": ["/bin/sh", "-c"],
    "args": ["apk add --no-cache curl >/dev/null 2>&1\n" + e["BODY"]],
    "resources": {"cpu": 0.25, "memory": "0.5Gi"},
    "env": [{"name": "VAULT_URL", "value": e["VAULT_URL"]},
            {"name": "OLD_TOKEN", "secretRef": "old-token"},
            {"name": "NEW_TOKEN", "secretRef": "new-token"}]}]}}}
json.dump(doc, open(sys.argv[1], "w"))
PY
  if az containerapp job show -n "$JOB" -g "$RG" -o none 2>/dev/null; then
    az containerapp job update -n "$JOB" -g "$RG" --yaml "$yaml" -o none
  else
    az containerapp job create -n "$JOB" -g "$RG" --yaml "$yaml" -o none
  fi
  rm -f "$yaml"
  exec=$(az containerapp job start -n "$JOB" -g "$RG" --query name -o tsv)
  for _ in $(seq 1 40); do
    status=$(az containerapp job execution show -n "$JOB" -g "$RG" --job-execution-name "$exec" \
      --query properties.status -o tsv 2>/dev/null || echo Running)
    case "$status" in Succeeded | Failed | Stopped) break ;; esac
    sleep 10
  done
  # The job holds both tokens; its secrets are emptied as soon as it ran.
  az containerapp job secret set -n "$JOB" -g "$RG" --secrets old-token=- new-token=- -o none
  echo "job ${exec}: ${status}"
  [ "$status" = Succeeded ]
}

apply() {
  local app
  if az containerapp secret show -n "$CONTROLPLANE_APP" -g "$RG" --secret-name vault-token -o none 2>/dev/null; then
    err "${CONTROLPLANE_APP} already has the secret vault-token: rotated before. Run check."
    exit 1
  fi
  OLD_TOKEN=$(vault_service_token)
  NEW_TOKEN="mvhd-$(openssl rand -hex 24)"  # Vault refuses a "." in a custom id
  VAULT_URL=$(az containerapp show -n "$CONTROLPLANE_APP" -g "$RG" \
    --query "properties.template.containers[0].env[?name=='EDC_VAULT_HASHICORP_URL'].value | [0]" -o tsv)
  [ -n "$OLD_TOKEN" ] && [ -n "$VAULT_URL" ] || { err "no current token or Vault URL on ${CONTROLPLANE_APP}"; exit 1; }

  log "Creating the services' token in Vault (job ${JOB})"
  # shellcheck disable=SC2016  # expanded inside the job, not here
  run_job '
code=$(curl -s -o /tmp/r -w "%{http_code}" -X POST -H "X-Vault-Token: $OLD_TOKEN" \
  -d "{\"id\":\"$NEW_TOKEN\",\"policies\":[\"root\"],\"no_default_policy\":true,\"display_name\":\"edc-services\"}" \
  "$VAULT_URL/v1/auth/token/create-orphan")
echo "create-orphan: HTTP $code"; [ "$code" = 200 ] || { head -c 300 /tmp/r; exit 1; }
code=$(curl -s -o /dev/null -w "%{http_code}" -H "X-Vault-Token: $NEW_TOKEN" "$VAULT_URL/v1/auth/token/lookup-self")
echo "lookup-self with the new token: HTTP $code"; [ "$code" = 200 ]' ||
    { err "token not created; nothing else changed"; exit 1; }
  ok "token created and verified"

  for app in "${EDC_APPS[@]}"; do
    log "$app"
    az containerapp secret set -n "$app" -g "$RG" --secrets "vault-token=${NEW_TOKEN}" -o none
    az containerapp update -n "$app" -g "$RG" --set-env-vars "${TOKEN_ENV}=secretref:vault-token" -o none
    wait_healthy "$app" || { err "stopped at $app; the apps before it use the new token, \"root\" still works"; exit 1; }
  done

  log "$SIGLET (secret only; it already reads secretref:vault-token)"
  az containerapp secret set -n "$SIGLET" -g "$RG" --secrets "vault-token=${NEW_TOKEN}" -o none
  az containerapp revision restart -n "$SIGLET" -g "$RG" \
    --revision "$(az containerapp show -n "$SIGLET" -g "$RG" --query properties.latestRevisionName -o tsv)" -o none
  wait_healthy "$SIGLET"
  unset OLD_TOKEN NEW_TOKEN
  echo
  ok "All services use the new token. Check the platform, then: $0 revoke-root"
}

revoke_root() {
  az containerapp secret show -n "$CONTROLPLANE_APP" -g "$RG" --secret-name vault-token -o none 2>/dev/null ||
    { err "run apply first: ${CONTROLPLANE_APP} has no secret vault-token"; exit 1; }
  local app
  for app in "${EDC_APPS[@]}"; do
    token_kind "$app" | grep -q "${TOKEN_ENV}=secretref:vault-token" ||
      { err "$app does not use secretref:vault-token yet"; exit 1; }
  done
  NEW_TOKEN=$(vault_service_token)
  OLD_TOKEN="$VAULT_ROOT_TOKEN"
  VAULT_URL=$(az containerapp show -n "$CONTROLPLANE_APP" -g "$RG" \
    --query "properties.template.containers[0].env[?name=='EDC_VAULT_HASHICORP_URL'].value | [0]" -o tsv)

  log "${VAULT_APP}: the sidecar stops recreating \"${VAULT_ROOT_TOKEN}\""
  python3 - "$VAULT_APP" "$RG" <<'PY'
import json, subprocess, sys, tempfile
app, rg = sys.argv[1:3]
doc = json.loads(subprocess.check_output(["az", "containerapp", "show", "-n", app, "-g", rg, "-o", "json"]))
changed = False
for c in doc["properties"]["template"]["containers"]:
    env = [e for e in c.get("env") or [] if e["name"] != "VAULT_ENSURE_TOKEN_ID"]
    changed |= len(env) != len(c.get("env") or [])
    c["env"] = env
if not changed:
    print("VAULT_ENSURE_TOKEN_ID already gone")
    sys.exit(0)
# `show` returns secrets without values; sent back empty they would be wiped.
doc["properties"]["configuration"].pop("secrets", None)
for k in ("latestRevisionName", "latestReadyRevisionName", "latestRevisionFqdn",
          "outboundIpAddresses", "eventStreamEndpoint", "runningStatus", "provisioningState"):
    doc["properties"].pop(k, None)
with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
    json.dump(doc, f)
subprocess.check_call(["az", "containerapp", "update", "-n", app, "-g", rg, "--yaml", f.name, "-o", "none"])
PY
  wait_healthy "$VAULT_APP"

  if az containerapp job show -n mvhd-vault-bootstrap -g "$RG" -o none 2>/dev/null; then
    log "mvhd-vault-bootstrap: its token from the secret"
    az containerapp job secret set -n mvhd-vault-bootstrap -g "$RG" --secrets "vault-token=${NEW_TOKEN}" -o none
    az containerapp job update -n mvhd-vault-bootstrap -g "$RG" \
      --set-env-vars "VAULT_DEV_ROOT_TOKEN_ID=secretref:vault-token" -o none
  fi

  log "Revoking \"${VAULT_ROOT_TOKEN}\""
  # shellcheck disable=SC2016  # expanded inside the job, not here
  run_job '
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "X-Vault-Token: $NEW_TOKEN" \
  -d "{\"token\":\"$OLD_TOKEN\"}" "$VAULT_URL/v1/auth/token/revoke")
echo "revoke: HTTP $code"; [ "$code" = 204 ] || exit 1
code=$(curl -s -o /dev/null -w "%{http_code}" -H "X-Vault-Token: $OLD_TOKEN" "$VAULT_URL/v1/auth/token/lookup-self")
echo "lookup-self with the old token: HTTP $code (403 expected)"; [ "$code" = 403 ]' ||
    { err "revocation not confirmed"; exit 1; }
  unset OLD_TOKEN NEW_TOKEN
  ok "\"${VAULT_ROOT_TOKEN}\" is revoked; the services keep working on vault-token"
}

case "$MODE" in
  check) check ;;
  apply) apply ;;
  revoke-root) revoke_root ;;
  *) sed -n '5,9p' "$0"; exit 64 ;;
esac
