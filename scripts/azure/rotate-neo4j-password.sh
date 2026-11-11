#!/usr/bin/env bash
set -euo pipefail
# =============================================================================
# Rotate the hub Neo4j password off the public default (#359).
# =============================================================================
#   rotate-neo4j-password.sh check   read only: every app and job that holds the
#                                    password, and how; never the value
#   rotate-neo4j-password.sh apply   new password in Key Vault, in Neo4j and in
#                                    every holder
#
# Until 2026-11-11 the graph's password was "healthdataspace", the compose
# default in this public repository, as a plain env value on mvhd-neo4j
# (NEO4J_AUTH), the proxy, the UI, the enricher and five jobs. Bolt is internal
# to the environment, so it was one step from any foothold there to every
# patient record in the graph.
#
# apply, in this order, each step safe to repeat:
#   1. The new password goes into Key Vault as neo4j-password. A run that
#      stopped part way finds it there and carries on with it.
#   2. A one-shot job inside the environment (Bolt is internal) changes it in
#      Neo4j: ALTER CURRENT USER ... FROM old TO new on the system database.
#      It skips the change when the new password already opens the graph.
#      Connections the apps hold stay open; new ones need the new password.
#   3. Every holder gets it: the apps (a new revision each, waiting for
#      Healthy), then the jobs, as the ACA secret neo4j-password with
#      NEO4J_PASSWORD=secretref:neo4j-password (wire_neo4j_password in env.sh).
#      A holder that already reads a secret gets the new value in that secret.
#   4. mvhd-neo4j last: NEO4J_AUTH becomes secretref:neo4j-auth. It only seeds
#      an empty store, so it changes nothing in the graph, but the change is a
#      new revision, and a new Neo4j revision cannot take the store lock while
#      the old one runs (docs/gotchas.md, 2026-10-04), so the old one is
#      retired: about a minute without the graph.
#
# ACA secrets by value, not Key Vault references: five of the holders have no
# managed identity, the CI identity cannot read the vault (env.sh,
# neo4j_password), and the vault-token rotation (rotate-vault-token.sh) set the
# same precedent. Key Vault keeps the one copy a person reads.
#
# Office hours, with an az login right before. Afterwards: Demo Smoke and the
# compliance run on Azure.
# =============================================================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/azure/env.sh
source "${SCRIPT_DIR}/env.sh"

MODE="${1:-check}"
JOB="mvhd-neo4j-rotate"
DEFAULT_PASSWORD="healthdataspace"  # the compose default, the one to retire

# Every app and job that holds the hub password, one line each, never a value:
#   <app|job> <name> <variable> <plain-default|plain-other|secretref:<secret>>
# Variables: NEO4J_PASSWORD, HUB_NEO4J_PASSWORD (trustee-admin), NEO4J_AUTH
# (mvhd-neo4j). The SPE workspaces' passwords are other graphs and stay out.
holders() {
  local f
  f=$(mktemp)
  {
    az containerapp list --resource-group "$RG" -o json | python3 -c 'import json,sys; [print(json.dumps(["app", a])) for a in json.load(sys.stdin)]'
    az containerapp job list --resource-group "$RG" -o json | python3 -c 'import json,sys; [print(json.dumps(["job", a])) for a in json.load(sys.stdin)]'
  } >"$f"
  DEFAULT="$DEFAULT_PASSWORD" python3 - "$f" <<'PY'
import json, os, sys
default = os.environ["DEFAULT"]
for line in open(sys.argv[1]):
    kind, it = json.loads(line)
    t = it["properties"]["template"]
    for c in (t.get("containers") or []) + (t.get("initContainers") or []):
        for e in c.get("env") or []:
            n = e["name"]
            if n not in ("NEO4J_PASSWORD", "HUB_NEO4J_PASSWORD", "NEO4J_AUTH"):
                continue
            if "secretRef" in e:
                how = "secretref:" + e["secretRef"]
            else:
                v = e.get("value") or ""
                how = "plain-default" if v in (default, "neo4j/" + default) else "plain-other"
            print(kind, it["name"], n, how)
PY
  rm -f "$f"
}

check() {
  local list
  list=$(holders)
  if [ -z "$list" ]; then
    warn "no app or job holds a Neo4j password"
    return 0
  fi
  echo "Holders of the hub Neo4j password (names only):"
  sed 's/^/  /' <<<"$list"
  if grep -q ' plain-' <<<"$list"; then
    warn "plain values remain; apply moves them into ACA secrets"
  else
    ok "no app or job holds the Neo4j password as a plain value"
  fi
  if [ -n "$(kv_secret "$NEO4J_PASSWORD_SECRET" quiet)" ]; then
    ok "${NEO4J_PASSWORD_SECRET} is in ${KEY_VAULT_NAME}"
  else
    warn "${NEO4J_PASSWORD_SECRET} is not in ${KEY_VAULT_NAME} yet"
  fi
}

# The password the proxy uses now: its plain value, or the value of the secret
# it reads. Not the vault, which may already hold the next one.
current_password() {
  local how secret
  how=$(az containerapp show -n "$NEO4J_PROXY_APP" -g "$RG" -o json | python3 -c '
import json, sys
for c in json.load(sys.stdin)["properties"]["template"]["containers"]:
    for e in c.get("env") or []:
        if e["name"] == "NEO4J_PASSWORD":
            print("secretref " + e["secretRef"] if "secretRef" in e else "plain " + e.get("value", ""))
            raise SystemExit')
  case "$how" in
    "plain "*) printf '%s' "${how#plain }" ;;
    "secretref "*)
      secret="${how#secretref }"
      az containerapp secret show -n "$NEO4J_PROXY_APP" -g "$RG" --secret-name "$secret" \
        --query value -o tsv 2>/dev/null ;;
  esac
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

# The change inside Neo4j, from a one-shot job in the environment: Bolt is not
# reachable from a workstation. Both passwords reach it as ACA secrets and are
# hex or the old default, so neither needs quoting. Returns the job's status.
run_alter_job() {
  local yaml exec status="" acr_password
  umask 077
  yaml=$(mktemp)
  acr_password=$(az acr credential show --name "$ACR_NAME" --query "passwords[0].value" -o tsv)
  ENV_ID=$(az containerapp env show -n "$ACA_ENV" -g "$RG" --query id -o tsv) \
  LOCATION=$(az containerapp env show -n "$ACA_ENV" -g "$RG" --query location -o tsv) \
  IMAGE="$NEO4J_IMAGE" REGISTRY="$ACR_LOGIN_SERVER" REGISTRY_USER="$ACR_NAME" \
  REGISTRY_PASSWORD="$acr_password" BOLT="$NEO4J_BOLT_URI" USER_NAME="$NEO4J_USER" \
  OLD="$OLD_PASSWORD" NEW="$NEW_PASSWORD" python3 - "$yaml" <<'PY'
import json, os, sys
e = os.environ
body = r'''
set -u
export NEO4J_USERNAME="$USER_NAME"
q() { NEO4J_PASSWORD="$1" cypher-shell -a "$BOLT" -d system --non-interactive --format plain "$2"; }
if q "$NEW_PW" "SHOW CURRENT USER YIELD user" >/dev/null 2>&1; then
  echo "the new password already opens the graph; nothing to change"; exit 0
fi
q "$OLD_PW" "ALTER CURRENT USER SET PASSWORD FROM '$OLD_PW' TO '$NEW_PW'" >/dev/null || {
  echo "ALTER CURRENT USER failed"; exit 1; }
q "$NEW_PW" "SHOW CURRENT USER YIELD user" >/dev/null || { echo "the new password does not open the graph"; exit 1; }
echo "password changed and verified"
'''
doc = {"location": e["LOCATION"], "properties": {"environmentId": e["ENV_ID"],
  "configuration": {"triggerType": "Manual", "replicaTimeout": 300, "replicaRetryLimit": 0,
    "manualTriggerConfig": {"parallelism": 1, "replicaCompletionCount": 1},
    "registries": [{"server": e["REGISTRY"], "username": e["REGISTRY_USER"], "passwordSecretRef": "acr-password"}],
    "secrets": [{"name": "acr-password", "value": e["REGISTRY_PASSWORD"]},
                {"name": "old-pw", "value": e["OLD"]}, {"name": "new-pw", "value": e["NEW"]}]},
  "template": {"containers": [{"name": "rotate", "image": e["IMAGE"],
    "command": ["/bin/bash", "-c"], "args": [body],
    "resources": {"cpu": 0.5, "memory": "1Gi"},
    "env": [{"name": "BOLT", "value": e["BOLT"]}, {"name": "USER_NAME", "value": e["USER_NAME"]},
            {"name": "OLD_PW", "secretRef": "old-pw"}, {"name": "NEW_PW", "secretRef": "new-pw"}]}]}}}
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
  # The job held both passwords; it goes as soon as it ran.
  az containerapp job delete -n "$JOB" -g "$RG" --yes -o none
  echo "job ${exec}: ${status}"
  [ "$status" = Succeeded ]
}

# give <app|job> <name> <variable> <how>: the new password to one holder.
give() {
  local kind="$1" name="$2" var="$3" how="$4" secret rev
  if [ "$var" = NEO4J_AUTH ]; then
    return 0  # mvhd-neo4j goes last, see apply
  fi
  case "$how" in
    plain-*)
      wire_neo4j_password "$kind" "$name" "$var"
      ;;
    secretref:*)
      secret="${how#secretref:}"
      if [ "$kind" = job ]; then
        az containerapp job secret set -n "$name" -g "$RG" --secrets "${secret}=${NEW_PASSWORD}" -o none
      else
        az containerapp secret set -n "$name" -g "$RG" --secrets "${secret}=${NEW_PASSWORD}" -o none
        rev=$(az containerapp show -n "$name" -g "$RG" --query properties.latestRevisionName -o tsv)
        az containerapp revision restart -n "$name" -g "$RG" --revision "$rev" -o none
      fi
      ;;
  esac
  if [ "$kind" = app ]; then
    wait_healthy "$name" || { err "stopped at ${name}; the holders before it have the new password"; exit 1; }
  else
    ok "$name (job) reads ${var} from its secret"
  fi
}

apply() {
  local list line kind name var how
  list=$(holders)
  [ -n "$list" ] || { err "no holder of the Neo4j password found in ${RG}"; exit 1; }

  OLD_PASSWORD=$(current_password)
  [ -n "$OLD_PASSWORD" ] || { err "could not read the password ${NEO4J_PROXY_APP} uses"; exit 1; }
  NEW_PASSWORD=$(kv_secret "$NEO4J_PASSWORD_SECRET" quiet)
  if [ -n "$NEW_PASSWORD" ] && [ "$NEW_PASSWORD" != "$OLD_PASSWORD" ]; then
    log "Key Vault already holds a password the proxy does not use yet: carrying on with it"
  else
    NEW_PASSWORD=$(openssl rand -hex 24)
    az keyvault secret set --vault-name "$KEY_VAULT_NAME" --name "$NEO4J_PASSWORD_SECRET" \
      --value "$NEW_PASSWORD" -o none
    ok "${NEO4J_PASSWORD_SECRET} in ${KEY_VAULT_NAME} (${#NEW_PASSWORD} chars, not displayed)"
  fi

  log "Changing the password in Neo4j (job ${JOB})"
  run_alter_job || { err "the password in Neo4j is unchanged; no holder was touched"; exit 1; }
  ok "Neo4j takes the new password"

  # Apps before jobs: the apps serve requests, the jobs run on demand.
  for kind in app job; do
    while read -r line; do
      [ -n "$line" ] || continue
      read -r _ name var how <<<"$line"
      log "${name}: ${var} (${how})"
      give "$kind" "$name" "$var" "$how" </dev/null
    done < <(grep "^${kind} " <<<"$list")
  done

  line=$(grep ' NEO4J_AUTH ' <<<"$list" || true)
  if [ -n "$line" ]; then
    read -r kind name var how <<<"$line"
    log "${name}: NEO4J_AUTH (${how})"
    az containerapp secret set -n "$name" -g "$RG" \
      --secrets "neo4j-auth=${NEO4J_USER}/${NEW_PASSWORD}" -o none
    if [ "$how" != "secretref:neo4j-auth" ]; then
      az containerapp update -n "$name" -g "$RG" --set-env-vars "NEO4J_AUTH=secretref:neo4j-auth" -o none
      # The new revision waits for the store lock the old one holds.
      RESOURCE_GROUP="$RG" "${SCRIPT_DIR}/retire-stale-revisions.sh" "$name"
      wait_healthy "$name"
    else
      ok "${name}: secret updated, no restart needed (NEO4J_AUTH only seeds an empty store)"
    fi
  fi
  unset OLD_PASSWORD NEW_PASSWORD
  echo
  check
  echo
  ok "Done. Check the platform: Demo Smoke, and the compliance run on Azure."
}

case "$MODE" in
  check) check ;;
  apply) apply ;;
  *) echo "usage: $0 check|apply" >&2; exit 64 ;;
esac
