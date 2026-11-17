#!/usr/bin/env bash
# =============================================================================
# The two EDC seeds of a build, from this laptop (rebuild rehearsal, #927)
# =============================================================================
#   run-seed-job.sh reseed       plan|apply   the five demo participants
#   run-seed-job.sh data-assets  plan|apply   policies, assets, contract
#                                             definitions, siglet data planes
#
# The same one-shot jobs as edc-reseed-identity-layer.yml and
# edc-seed-data-assets.yml (the EDC APIs are internal to the environment), for
# when those cannot run: a resource group other than rg-mvhd-dev, which they
# name, or no Azure OIDC (it works from main only). The job bodies are
# scripts/azure/reseed-identity-layer.sh and seed-data-assets-job.sh, as there;
# keep the environment below equal to the workflows'.
#
# Secrets (the Keycloak admin password, the admin and provisioner client
# secrets, the Vault token) are read here, never printed, and reach the job as
# job secrets. The job's console log is streamed while it runs.
#
# Needs: az (logged in) with the PIM role that covers Container Apps jobs,
# python3 with PyYAML, jq.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
# shellcheck source=env.sh
source "${SCRIPT_DIR}/env.sh"

WHAT="${1:-}"; MODE="${2:-plan}"
case "$WHAT" in reseed | data-assets) ;; *) sed -n '5,7p' "$0"; exit 2 ;; esac
case "$MODE" in plan | apply) ;; *) err "mode is plan or apply"; exit 2 ;; esac

if [ "$RG" = "$HUB_RG" ]; then
  KC="${KEYCLOAK_PUBLIC_URL:-https://auth.ehds.mabu.red}"
else
  KC="${KEYCLOAK_PUBLIC_URL:?no Keycloak address for ${RG}}"
fi

# ── Secrets, never printed ──────────────────────────────────────────────────
KC_ADMIN_PW=$(kc_admin_password)
[ -n "$KC_ADMIN_PW" ] || { err "no Keycloak admin password"; exit 1; }
MASTER=$(curl -sS --max-time 30 -X POST "${KC}/realms/master/protocol/openid-connect/token" \
  --data-urlencode grant_type=password --data-urlencode client_id=admin-cli \
  --data-urlencode "username=${KC_ADMIN_USER}" --data-urlencode "password=${KC_ADMIN_PW}" |
  jq -r '.access_token // empty') || MASTER=""
unset KC_ADMIN_PW
[ -n "$MASTER" ] || { err "no Keycloak admin token from ${KC}"; exit 1; }
secret_of() {
  local uuid
  uuid=$(curl -sS --max-time 30 -H "Authorization: Bearer $MASTER" \
    "${KC}/admin/realms/edcv/clients?clientId=$1" | jq -r '.[0].id // empty')
  [ -n "$uuid" ] || return 0
  curl -sS --max-time 30 -H "Authorization: Bearer $MASTER" \
    "${KC}/admin/realms/edcv/clients/${uuid}/client-secret" | jq -r '.value // empty'
}
ADMIN_SECRET=$(secret_of admin)
[ -n "$ADMIN_SECRET" ] || { err "could not read the admin client secret"; exit 1; }
if [ "$WHAT" = reseed ]; then
  PROVISIONER_SECRET=$(secret_of provisioner)
  [ -n "$PROVISIONER_SECRET" ] || { err "could not read the provisioner client secret"; exit 1; }
  VAULT_URL=$(az containerapp show -n "$CONTROLPLANE_APP" -g "$RG" \
    --query "properties.template.containers[0].env[?name=='EDC_VAULT_HASHICORP_URL'].value | [0]" -o tsv)
  VAULT_TOKEN=$(vault_service_token)
fi
unset MASTER
log "secrets read (admin ${#ADMIN_SECRET}${PROVISIONER_SECRET:+, provisioner ${#PROVISIONER_SECRET}}${VAULT_TOKEN:+, vault ${#VAULT_TOKEN}} chars)"

# ── The job definition, secrets in a 0600 file removed on exit ──────────────
umask 077
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
ENV_ID=$(az containerapp env show -n "$ACA_ENV" -g "$RG" --query id -o tsv)

if [ "$WHAT" = reseed ]; then
  JOB="mvhd-reseed-identity"
  (cd "$REPO_DIR" && tar -czf "${work}/scripts.tgz" scripts/azure/05-cp-participants.sh \
    scripts/seed-identityhub-participants.sh scripts/repair-cp-sts-secrets.sh \
    scripts/seed-cp-participant-config.sh scripts/seed-issuer-holders.sh \
    scripts/request-participant-credentials.sh scripts/lib/cp-participant-pairs.py \
    scripts/lib/dsp-protocol.sh)
else
  JOB="mvhd-seed-data-assets"
  (cd "$REPO_DIR" && tar -czf "${work}/scripts.tgz" -C scripts/azure seed-data-assets-job.sh \
    -C ../../jad seed-data-assets.sh policies)
fi

WHAT="$WHAT" MODE="$MODE" KC="$KC" ENV_ID="$ENV_ID" LOCATION="$LOCATION" \
  ADMIN_SECRET="$ADMIN_SECRET" PROVISIONER_SECRET="${PROVISIONER_SECRET:-}" \
  VAULT_URL="${VAULT_URL:-}" VAULT_TOKEN="${VAULT_TOKEN:-}" \
  CP_APP="$CONTROLPLANE_APP" IH_APP="$IDENTITYHUB_APP" ISSUER="$ISSUER_APP" \
  PROXY_APP="$NEO4J_PROXY_APP" SIGLET="$SIGLET_APP" \
  python3 - "${work}/job.yaml" "${work}/scripts.tgz" "${SCRIPT_DIR}/reseed-identity-layer.sh" <<'PY'
import base64, os, sys, yaml
out, tgz, reseed = sys.argv[1:4]
e = os.environ
b64 = base64.b64encode(open(tgz, "rb").read()).decode()
if e["WHAT"] == "reseed":
    script = open(reseed).read()
    env = {"MODE": e["MODE"], "KC": e["KC"],
           "CP": f"http://{e['CP_APP']}:8081/api/mgmt",
           "IH": f"http://{e['IH_APP']}:7082/api/identity",
           "ISSUER": f"http://{e['ISSUER']}/api/admin",
           "DID_HOST": f"{e['IH_APP']}%3A7083",
           "CREDENTIALS_BASE": f"http://{e['IH_APP']}:7085/api/credentials/v1/participants",
           "PROTOCOL_BASE": f"http://{e['CP_APP']}:8082/api/dsp",
           "VAULT_ADDR": e["VAULT_URL"], "SCRIPTS_TGZ_B64": b64}
    secrets = {"admin-secret": e["ADMIN_SECRET"], "provisioner-secret": e["PROVISIONER_SECRET"],
               "vault-token": e["VAULT_TOKEN"]}
    refs = {"ADMIN_SECRET": "admin-secret", "PROVISIONER_SECRET": "provisioner-secret",
            "VAULT_TOKEN": "vault-token"}
    body = ("set -u\napk add --no-cache bash curl jq python3 >/dev/null 2>&1\n"
            "cat > /tmp/reseed.sh <<'RESEED_EOF'\n" + script + "\nRESEED_EOF\n"
            "bash /tmp/reseed.sh; rc=$?\necho \"=== reseed exited with $rc ===\"\nsleep 30\nexit $rc\n")
else:
    env = {"MODE": e["MODE"], "KC_HOST": e["KC"],
           "CP_HOST": f"http://{e['CP_APP']}:8081",
           "NEO4J_PROXY_URL": f"http://{e['PROXY_APP']}",
           "SIGLET_SIGNALING_URL": f"http://{e['SIGLET']}:8081/api/v1",
           "SCRIPTS_TGZ_B64": b64}
    secrets = {"admin-secret": e["ADMIN_SECRET"]}
    refs = {"KC_CLIENT_SECRET": "admin-secret"}
    body = ("set -u\napk add --no-cache bash curl jq python3 >/dev/null 2>&1\n"
            "mkdir -p /tmp/s && echo \"$SCRIPTS_TGZ_B64\" | base64 -d | tar -xz -C /tmp/s\n"
            "bash /tmp/s/seed-data-assets-job.sh; rc=$?\necho \"=== seed exited with $rc ===\"\nsleep 30\nexit $rc\n")
doc = {"location": e["LOCATION"], "properties": {"environmentId": e["ENV_ID"],
  "configuration": {"triggerType": "Manual", "replicaTimeout": 1500, "replicaRetryLimit": 0,
    "manualTriggerConfig": {"parallelism": 1, "replicaCompletionCount": 1},
    "secrets": [{"name": k, "value": v} for k, v in secrets.items()]},
  "template": {"containers": [{"name": "seed", "image": "docker.io/library/alpine:3.19",
    "command": ["/bin/sh", "-c"], "args": [body], "resources": {"cpu": 0.5, "memory": "1Gi"},
    "env": [{"name": k, "value": v} for k, v in env.items()]
           + [{"name": k, "secretRef": v} for k, v in refs.items()]}]}}}
yaml.safe_dump(doc, open(out, "w"), sort_keys=False)
PY
unset ADMIN_SECRET PROVISIONER_SECRET VAULT_TOKEN

if az containerapp job show -n "$JOB" -g "$RG" -o none 2>/dev/null; then
  az containerapp job update -n "$JOB" -g "$RG" --yaml "${work}/job.yaml" -o none
else
  az containerapp job create -n "$JOB" -g "$RG" --yaml "${work}/job.yaml" -o none
fi
rm -f "${work}/job.yaml"

EXEC=$(az containerapp job start -n "$JOB" -g "$RG" --query name -o tsv)
log "started ${JOB} execution ${EXEC} (${WHAT} ${MODE})"
STATUS=Pending
for _ in $(seq 1 100); do
  STATUS=$(az containerapp job execution show -n "$JOB" -g "$RG" \
    --job-execution-name "$EXEC" --query properties.status -o tsv 2>/dev/null || echo Pending)
  case "$STATUS" in Succeeded | Failed | Stopped) break ;; esac
  sleep 15
done

# The log, from Log Analytics (it arrives a minute or two after the job ends).
WS=$(az containerapp env show -n "$ACA_ENV" -g "$RG" \
  --query properties.appLogsConfiguration.logAnalyticsConfiguration.customerId -o tsv 2>/dev/null || true)
if [ -n "$WS" ]; then
  sleep 90
  az monitor log-analytics query -w "$WS" --analytics-query \
    "ContainerAppConsoleLogs_CL | where ContainerGroupName_s startswith '${EXEC}' | order by TimeGenerated asc | project Log_s" \
    -o tsv 2>&1 | sed 's/\tPrimaryResult$//' | head -300
fi

echo "execution ${EXEC}: ${STATUS}"
[ "$STATUS" = Succeeded ] || { err "the ${WHAT} job did not succeed (${STATUS})"; exit 1; }
ok "${WHAT} ${MODE} succeeded"
