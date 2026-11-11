#!/usr/bin/env bash
set -euo pipefail
# =============================================================================
# CFM from our fork on Container Apps (ADR-088, ADR-085 step 4, #973)
# =============================================================================
#   20-cfm-fork.sh                     same as --check
#   20-cfm-fork.sh --check             report images, database, secret, apps; change nothing
#   20-cfm-fork.sh render DIR          write the three app definitions and the CFM configs to
#                                      DIR for review, secrets as placeholders
#   20-cfm-fork.sh render DIR --offline  the same without az, every Azure value a placeholder
#   20-cfm-fork.sh images              build the eight images here (linux/amd64) and push to ACR
#   CFM_AZURE_GO="mvhd-cfm-tmanager mvhd-cfm-pmanager mvhd-cfm-agents" 20-cfm-fork.sh apps
#                                      create or update the apps CFM_AZURE_GO names
#   20-cfm-fork.sh seed                seed definitions, cell and profile from a one-shot job
#
# First deployed 2026-11-11. `images`, `apps` and `seed` change Azure:
# Matthias's go per app and an `az login` first (CLAUDE.md, gotcha 6 for
# image caching).
#
# What runs: the fork's tag in .github/upstream.json (fork.tag), as
# ${ACR_LOGIN_SERVER}/cfm/<name>:<version>, built with local Docker (buildx)
# from a clone of that tag. Not `az acr build`: ACR Tasks' dependency scanner
# cannot parse `FROM --platform=$BUILDPLATFORM`, and its git context takes a
# branch or commit, not a tag. Three apps, as in compose:
#   mvhd-cfm-tmanager, mvhd-cfm-pmanager   internal ingress on 8080
#   mvhd-cfm-agents                        six containers, no ingress
# The definitions are scripts/azure/cfm/*.yaml. The configs are
# jad/cfm/*.dotenv with this environment's addresses, taken from what the hub
# provisions with today (the UI's EDC_* settings, the control plane's issuer),
# mounted from one secret volume at /etc/appname; each container reads only
# its own <name>.env.
#
# Needed before `apps` (not done by this script):
#   - the Keycloak client cfm-agents and its scopes in the Azure realm, as
#     scripts/seed-cfm.sh creates them locally, its secret in Key Vault as
#     cfm-agents-client-secret;
#   - the database `cfm` on the Flexible Server, emptied of the 2026-03 CFM's
#     tables by .github/workflows/edc-retire-v018-azure.yml (#927 step 6).
#     Run that first: it refuses while any mvhd-cfm-* app exists;
#   - afterwards, `seed`: the CFM definitions, cell and dataspace profile, as
#     seed-cfm.sh seeds them, by scripts/azure/cfm/seed-in-env.py in a one-shot
#     job inside the environment (the managers have internal ingress only).
# NATS: the environment's mvhd-nats, without authentication as everywhere
# there (jad/nats.conf); CFM's streams there do not survive a NATS restart
# until the managers start again (docs/gotchas.md 2026-11-09, #1028).
# =============================================================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
# shellcheck source=scripts/azure/env.sh
source "$SCRIPT_DIR/env.sh"

MODE="${1:---check}"
APPS=(mvhd-cfm-tmanager mvhd-cfm-pmanager mvhd-cfm-agents)
IMAGES=(tmanager pmanager jwtletagent edcvagent ihagent regagent obagent sigletagent)
CFM_DB="${CFM_DB:-cfm}"
CLIENT_SECRET_NAME="cfm-agents-client-secret"

read -r FORK_REPO FORK_TAG < <(python3 - "$REPO_ROOT/.github/upstream.json" <<'PY'
import json, sys
fork = next(e["fork"] for e in json.load(open(sys.argv[1]))["repos"] if "fork" in e)
print(fork["repo"], fork["tag"])
PY
)
CFM_VERSION="${FORK_TAG#v}"
IMAGE_PREFIX="${ACR_LOGIN_SERVER}/cfm"

# The addresses the CFM configs need, from what runs in the environment now.
azure_values() {
  get_aca_fqdns
  local ui_env cp_env
  ui_env=$(az containerapp show --name "$UI_APP" --resource-group "$RG" \
    --query "properties.template.containers[0].env" -o json)
  cp_env=$(az containerapp show --name "$CONTROLPLANE_APP" --resource-group "$RG" \
    --query "properties.template.containers[0].env" -o json)
  UI_ENV_JSON="$ui_env" CP_ENV_JSON="$cp_env" python3 - <<'PY'
import json, os
ui = {e["name"]: e.get("value", "") for e in json.loads(os.environ["UI_ENV_JSON"])}
cp = {e["name"]: e.get("value", "") for e in json.loads(os.environ["CP_ENV_JSON"])}
want = {
    "MGMT_URL": ui.get("EDC_MANAGEMENT_URL"),
    "IDENTITY_URL": ui.get("EDC_IDENTITY_URL"),
    "ISSUER_URL": ui.get("EDC_ISSUER_URL"),
    "STS_URL": ui.get("EDC_STS_TOKEN_URL"),
    "CS_BASE": ui.get("EDC_CREDENTIAL_SERVICE_BASE"),
    "PROTOCOL_BASE": ui.get("EDC_PROTOCOL_BASE"),
    "OIDC_ISSUER": cp.get("EDC_IAM_OAUTH2_ISSUER") or cp.get("edc.iam.oauth2.issuer"),
}
missing = [k for k, v in want.items() if not v]
if missing:
    sys.exit("missing on the running apps: " + ", ".join(missing))
for k, v in want.items():
    print(f"export {k}='{v}'")
PY
}

offline_values() {
  export ACA_DOMAIN="<aca-domain>" NATS_URL="nats://${NATS_APP}.internal.<aca-domain>:4222"
  export KEYCLOAK_INTERNAL_URL="https://${KEYCLOAK_APP}.internal.<aca-domain>"
  export MGMT_URL="<EDC_MANAGEMENT_URL of ${UI_APP}>" IDENTITY_URL="<EDC_IDENTITY_URL of ${UI_APP}>"
  export ISSUER_URL="<EDC_ISSUER_URL of ${UI_APP}>" STS_URL="<EDC_STS_TOKEN_URL of ${UI_APP}>"
  export CS_BASE="<EDC_CREDENTIAL_SERVICE_BASE of ${UI_APP}>" PROTOCOL_BASE="<EDC_PROTOCOL_BASE of ${UI_APP}>"
  export OIDC_ISSUER="<EDC_IAM_OAUTH2_ISSUER of ${CONTROLPLANE_APP}>"
  export ENV_ID="<managed environment id>"
}

# render DIR SECRETS: the three definitions as JSON (valid --yaml input) and
# the CFM configs. SECRETS=real fills the Postgres password, the client secret
# and the registry password; anything else writes placeholders.
render() {
  local dir="$1" secrets="$2"
  mkdir -p "$dir"
  python3 - "$REPO_ROOT" "$dir" "$secrets" <<'PY'
import json, os, re, string, sys, urllib.parse
root, out, secrets = sys.argv[1:4]
real = secrets == "real"
e = os.environ
pg_pw = urllib.parse.quote(e["PG_PASSWORD"], safe="") if real else "<postgres-admin-password>"
client_secret = e["CFM_CLIENT_SECRET"] if real else "<" + "cfm-agents-client-secret>"
kc = e["KEYCLOAK_INTERNAL_URL"].rstrip("/") + "/realms/edcv/protocol/openid-connect"
values = {
    # By the app name, as the control plane does: NATS has TCP ingress, and
    # the .internal FQDN does not reach it.
    "uri": f"nats://{e['NATS_APP']}:4222",
    "dsn": f"postgres://{e['PG_ADMIN']}:{pg_pw}@{e['PG_HOST']}:{e['PG_PORT']}/{e['CFM_DB']}?sslmode=require",
    "auth.jwksUrl": kc + "/certs",
    "auth.expectedIssuer": e["OIDC_ISSUER"],
    "tokenexchange.url": kc,
    "tokenexchange.clientSecret": client_secret,
    "tokenexchange.issuer": e["OIDC_ISSUER"],
    "tokenexchange.jwksUri": kc + "/certs",
    "controlplane.url": e["MGMT_URL"],
    "controlplane.protocol.url": e["PROTOCOL_BASE"].rstrip("/") + "/%s/http-dsp-profile-2025-1",
    "controlplane.dataservice.url": e["PROTOCOL_BASE"].rstrip("/") + "/%s/.well-known/dspace-version",
    "identityhub.url": e["IDENTITY_URL"],
    "identityhub.cs.url": e["CS_BASE"].rstrip("/") + "/%s",
    "identityhub.sts.url": e["STS_URL"],
    "issuerservice.url": e["ISSUER_URL"],
    "siglet.management.url": f"http://{e['SIGLET_APP']}:8083",
    "siglet.signaling.url": f"http://{e['SIGLET_APP']}:8081",
}
drop = {"nats.auth.method", "nats.auth.token"}
AGENT_PORTS = {"jwtletagent": 8081, "edcvagent": 8082, "ihagent": 8083,
               "regagent": 8084, "obagent": 8085, "sigletagent": 8086}
configs = {}
for name in sorted(os.listdir(os.path.join(root, "jad/cfm"))):
    if not name.endswith(".dotenv"):
        continue
    lines = ["# Rendered for Container Apps by scripts/azure/20-cfm-fork.sh"]
    for line in open(os.path.join(root, "jad/cfm", name)).read().splitlines():
        m = re.match(r"^([A-Za-z0-9_.]+): (.*)$", line)
        if not m:
            if not re.search(r"NATS token|local dev only|seed-cfm\.sh creates", line):
                lines.append(line)
            continue
        key = m.group(1)
        if key in drop:
            continue
        value = values.get(key, m.group(2))
        # The six agents share one app, so one network namespace: each needs
        # its own HTTP port (in compose each had its own container network).
        if key == "httpport" and name[: -len(".dotenv")] in AGENT_PORTS:
            value = str(AGENT_PORTS[name[: -len(".dotenv")]])
        lines.append(f"{key}: {value}")
        if key == "uri":
            lines.append("# mvhd-nats has no authentication (internal ingress only)")
            lines.append("nats.auth.allowAnonymous: true")
    configs[name[: -len(".dotenv")]] = "\n".join(lines) + "\n"
    with open(os.path.join(out, name[: -len(".dotenv")] + ".env"), "w") as f:
        f.write(configs[name[: -len(".dotenv")]])

mounts = {"mvhd-cfm-tmanager": ["tm"], "mvhd-cfm-pmanager": ["pm"],
          "mvhd-cfm-agents": ["jwtletagent", "edcvagent", "ihagent", "regagent", "obagent", "sigletagent"]}
files = {"mvhd-cfm-tmanager": "tmanager.yaml", "mvhd-cfm-pmanager": "pmanager.yaml", "mvhd-cfm-agents": "agents.yaml"}
import yaml  # PyYAML
subst = {k: e.get(k, "") for k in ("LOCATION", "ENV_ID", "ACR_LOGIN_SERVER", "ACR_NAME", "IMAGE_PREFIX", "CFM_VERSION")}
for app, fname in files.items():
    text = string.Template(open(os.path.join(root, "scripts/azure/cfm", fname)).read()).substitute(subst)
    doc = yaml.safe_load(text)
    secret_list = [{"name": "acr-password", "value": e["ACR_PASSWORD"] if real else "<acr-password>"}]
    vol_secrets = []
    for cfg in mounts[app]:
        ref = "cfg-" + cfg.lower()
        secret_list.append({"name": ref, "value": configs[cfg]})
        vol_secrets.append({"secretRef": ref, "path": f"{cfg}.env"})
    doc["properties"]["configuration"]["secrets"] = secret_list
    doc["properties"]["template"]["volumes"][0]["secrets"] = vol_secrets
    with open(os.path.join(out, app + ".json"), "w") as f:
        json.dump(doc, f, indent=2)
print("rendered " + ", ".join(files) + " and " + str(len(configs)) + " configs to " + out)
PY
}

report() {
  local name
  for name in "${IMAGES[@]}"; do
    if az acr repository show-tags --name "$ACR_NAME" --repository "cfm/${name}" -o tsv 2>/dev/null | grep -qx "$CFM_VERSION"; then
      echo "  present  image cfm/${name}:${CFM_VERSION}"
    else
      echo "  MISSING  image cfm/${name}:${CFM_VERSION}"
    fi
  done
  if az postgres flexible-server db show --server-name "$PG_FLEX_NAME" --resource-group "$RG" --name "$CFM_DB" -o none 2>/dev/null; then
    echo "  present  database ${CFM_DB}"
  else
    echo "  MISSING  database ${CFM_DB}"
  fi
  if az keyvault secret show --vault-name "$KEY_VAULT_NAME" --name "$CLIENT_SECRET_NAME" --query id -o none 2>/dev/null; then
    echo "  present  Key Vault secret ${CLIENT_SECRET_NAME}"
  else
    echo "  MISSING  Key Vault secret ${CLIENT_SECRET_NAME} (the cfm-agents client is not set up)"
  fi
  for name in "${APPS[@]}"; do
    if az containerapp show --name "$name" --resource-group "$RG" -o none 2>/dev/null; then
      az containerapp revision list --name "$name" --resource-group "$RG" \
        --query "[?properties.active].{app:'${name}',revision:name,health:properties.healthState}" -o tsv
    else
      echo "  absent   app ${name}"
    fi
  done
  echo "  fork     ${FORK_REPO} ${FORK_TAG}"
}

# Every mode asks Azure. An expired login (AADSTS70043 after the conditional
# access hour) used to make --check report every item MISSING, which reads as
# "nothing is there"; stop and say so instead.
if [[ "$MODE" != render || "${3:-}" != --offline ]]; then
  az account get-access-token --query expiresOn -o none 2>/dev/null || {
    err "az is not signed in, or its token expired: az login first"
    exit 2
  }
fi

case "$MODE" in
  --check)
    report
    ;;
  render)
    dir="${2:?render needs a directory}"
    if [ "${3:-}" = "--offline" ]; then offline_values; else eval "$(azure_values)"; ENV_ID=$(az containerapp env show --name "$ACA_ENV" --resource-group "$RG" --query id -o tsv); export ENV_ID; fi
    export CFM_DB IMAGE_PREFIX CFM_VERSION
    render "$dir" placeholders
    ;;
  images)
    src=$(mktemp -d)
    trap 'rm -rf "$src"' EXIT
    git -c advice.detachedHead=false clone --quiet --depth 1 --branch "$FORK_TAG" \
      "https://github.com/${FORK_REPO}.git" "$src/cfm"
    commit=$(git -C "$src/cfm" rev-parse HEAD)
    az acr login --name "$ACR_NAME" >/dev/null
    for name in "${IMAGES[@]}"; do
      log "cfm/${name}:${CFM_VERSION} from ${FORK_REPO} ${FORK_TAG} (${commit:0:12})"
      docker buildx build --platform linux/amd64 --push --quiet \
        -f "$src/cfm/docker/Dockerfile.${name}.dockerfile" \
        --label "org.opencontainers.image.source=https://github.com/${FORK_REPO}.git" \
        --label "org.opencontainers.image.revision=${commit}" \
        --label "org.opencontainers.image.version=${CFM_VERSION}" \
        -t "${IMAGE_PREFIX}/${name}:${CFM_VERSION}" "$src/cfm" >/dev/null
      ok "cfm/${name}:${CFM_VERSION}"
    done
    ;;
  apps)
    [ -n "${CFM_AZURE_GO:-}" ] || { err "CFM_AZURE_GO names no app; nothing is created without a go per app"; exit 1; }
    eval "$(azure_values)"
    ENV_ID=$(az containerapp env show --name "$ACA_ENV" --resource-group "$RG" --query id -o tsv)
    PG_PASSWORD=$(az keyvault secret show --vault-name "$KEY_VAULT_NAME" --name postgres-admin-password --query value -o tsv)
    CFM_CLIENT_SECRET=$(az keyvault secret show --vault-name "$KEY_VAULT_NAME" --name "$CLIENT_SECRET_NAME" --query value -o tsv)
    ACR_PASSWORD=$(az acr credential show --name "$ACR_NAME" --query 'passwords[0].value' -o tsv)
    export ENV_ID PG_PASSWORD CFM_CLIENT_SECRET ACR_PASSWORD CFM_DB IMAGE_PREFIX CFM_VERSION
    work=$(umask 077 && mktemp -d)
    trap 'rm -rf "$work"' EXIT
    render "$work" real >/dev/null
    unset PG_PASSWORD CFM_CLIENT_SECRET ACR_PASSWORD
    for app in $CFM_AZURE_GO; do
      [[ " ${APPS[*]} " == *" ${app} "* ]] || { err "unknown app ${app}"; exit 1; }
      # The ARM body as rendered, by PUT: the containerapp extension's --yaml
      # (1.3.0b5) sends a body the API refuses with a 400 for an app.
      log "putting ${app}"
      az rest --method put --only-show-errors -o none \
        --url "https://management.azure.com${ENV_ID%/providers/*}/providers/Microsoft.App/containerApps/${app}?api-version=2024-03-01" \
        --body "@${work}/${app}.json"
      # A change to the configs alone starts no revision, and a running replica
      # keeps the secret volume it mounted (docs/gotchas.md 2026-11-06).
      rev=$(az containerapp show --name "$app" --resource-group "$RG" --query properties.latestRevisionName -o tsv)
      az containerapp revision restart --name "$app" --resource-group "$RG" --revision "$rev" -o none
      ok "${app}"
    done
    ;;
  seed)
    # Idempotent: what exists is kept. The client secret reaches the job as an
    # ACA secret, never a command line or a log; the job is deleted afterwards.
    job=mvhd-cfm-seed
    ENV_ID=$(az containerapp env show --name "$ACA_ENV" --resource-group "$RG" --query id -o tsv)
    domain=$(az containerapp env show --name "$ACA_ENV" --resource-group "$RG" --query properties.defaultDomain -o tsv)
    issuer_did=$(az containerapp show --name "$UI_APP" --resource-group "$RG" \
      --query "properties.template.containers[0].env[?name=='EDC_ISSUER_DID'].value | [0]" -o tsv)
    [ -n "$issuer_did" ] || { err "no EDC_ISSUER_DID on ${UI_APP}"; exit 1; }
    work=$(umask 077 && mktemp -d)
    trap 'rm -rf "$work"' EXIT
    CFM_CLIENT_SECRET=$(az keyvault secret show --vault-name "$KEY_VAULT_NAME" --name "$CLIENT_SECRET_NAME" --query value -o tsv)
    SEED_B64=$(base64 <"$SCRIPT_DIR/cfm/seed-in-env.py" | tr -d '\n')
    export ENV_ID CFM_CLIENT_SECRET SEED_B64
    LOCATION="$LOCATION" DOMAIN="$domain" ISSUER_DID="$issuer_did" KC_APP="$KEYCLOAK_APP" \
      python3 -I - "$work/job.json" <<'JOB'
import json, os, sys
e = os.environ
env = {"KC_TOKEN_URL": f"https://{e['KC_APP']}.internal.{e['DOMAIN']}/realms/edcv/protocol/openid-connect/token",
       "TM_URL": "http://mvhd-cfm-tmanager", "PM_URL": "http://mvhd-cfm-pmanager",
       "ISSUER_DID": e["ISSUER_DID"], "SEED_B64": e["SEED_B64"]}
doc = {"location": e["LOCATION"], "properties": {"environmentId": e["ENV_ID"],
  "configuration": {"triggerType": "Manual", "replicaTimeout": 600, "replicaRetryLimit": 0,
    "manualTriggerConfig": {"parallelism": 1, "replicaCompletionCount": 1},
    "secrets": [{"name": "client-secret", "value": e["CFM_CLIENT_SECRET"]}]},
  "template": {"containers": [{"name": "seed", "image": "docker.io/library/python:3.12-alpine",
    "command": ["python3", "-c", "import base64,os;exec(base64.b64decode(os.environ['SEED_B64']))"],
    "resources": {"cpu": 0.25, "memory": "0.5Gi"},
    "env": [{"name": k, "value": v} for k, v in env.items()]
           + [{"name": "CLIENT_SECRET", "secretRef": "client-secret"}]}]}}}
json.dump(doc, open(sys.argv[1], "w"))
JOB
    unset CFM_CLIENT_SECRET
    if az containerapp job show --name "$job" --resource-group "$RG" -o none 2>/dev/null; then
      az containerapp job delete --name "$job" --resource-group "$RG" --yes -o none
    fi
    az containerapp job create --name "$job" --resource-group "$RG" --yaml "$work/job.json" -o none
    exe=$(az containerapp job start --name "$job" --resource-group "$RG" --query name -o tsv)
    log "seed job ${exe}"
    status=Pending
    for _ in $(seq 1 50); do
      status=$(az containerapp job execution show --name "$job" --resource-group "$RG" \
        --job-execution-name "$exe" --query properties.status -o tsv 2>/dev/null || echo Pending)
      case "$status" in Succeeded | Failed | Stopped) break ;; esac
      sleep 12
    done
    ws=$(az containerapp env show --name "$ACA_ENV" --resource-group "$RG" \
      --query properties.appLogsConfiguration.logAnalyticsConfiguration.customerId -o tsv)
    sleep 75 # Log Analytics lags the job
    az monitor log-analytics query -w "$ws" --analytics-query \
      "ContainerAppConsoleLogs_CL | where ContainerGroupName_s startswith '${exe}' | order by TimeGenerated asc | project Log_s" \
      -o tsv 2>/dev/null | sed 's/\tPrimaryResult$//' || true
    az containerapp job delete --name "$job" --resource-group "$RG" --yes -o none 2>/dev/null || true
    [ "$status" = Succeeded ] || { err "seed job ${exe}: ${status}"; exit 1; }
    ok "CFM seeded"
    ;;
  *)
    err "unknown mode ${MODE}"
    exit 1
    ;;
esac
