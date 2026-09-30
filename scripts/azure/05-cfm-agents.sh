#!/usr/bin/env bash
# =============================================================================
# Deploy the CFM provisioning agents, and the shim they need, onto ACA.
# =============================================================================
# Issue #318. `cfm-keycloak-agent`, `cfm-edcv-agent`, `cfm-registration-agent`
# and `cfm-onboarding-agent` existed only in docker-compose.jad.yml, so a
# participant created through /onboarding kept all three of its activities
# pending for ever: cfm.connector, cfm.credentialservice, cfm.dataplane. Two
# live tenants sat like that for nine days before anyone read the state.
#
# Prerequisites, in order, because each one was a separate discovery:
#
# 1. IMAGES. The agents are amd64 now. The digests docker-compose.jad.yml used
#    to pin are linux/arm64 only and ACA is amd64 only, so importing those
#    would have produced apps that report Started and never run (#380).
#    scripts/build-cfm-images.sh builds them from source; env.sh points here.
#
# 2. THE SHIM. The agents have `v5alpha` compiled in. This control plane serves
#    v4alpha. jad/cfm-cp-shim-azure.conf rewrites between them, and this script
#    deploys it as mvhd-cfm-cp-shim. See that file for the measurement.
#
# 3. CONFIG AS A FILE. These are Go binaries reading a flat Viper file at
#    /etc/appname/<name>.env. They do not read environment variables. Passing
#    env vars instead is what crash-looped the Tenant Manager for months
#    (#203), so the config goes in as an ACA secret volume, exactly the way
#    scripts/azure/05-cfm-configure.sh does it for the two managers.
#
# 4. MIN=1. The agents are NATS consumers with no HTTP ingress, so nothing can
#    wake them from zero: no request arrives to trigger a scaler. They must be
#    warm to consume. That is four always-on apps against ADR-027, bounded by
#    the aca-schedule off-hours scale-down. A KEDA JetStream scaler would be
#    the cheaper answer and is not attempted here.
#
# Idempotent: re-running updates the secret and the image and leaves everything
# else alone. When ACA provisions no new revision, the running one is restarted
# so the mounted file matches the secret.
#
# Usage:  bash scripts/azure/05-cfm-agents.sh
# Needs:  az (logged in), python3 with PyYAML, and a reachable Keycloak for the
#         provisioner client secret. No TTY required.
# =============================================================================
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
source "${SCRIPT_DIR}/env.sh"

log "Deploying the CFM provisioning agents (#318)"

# ── Things that must already exist ──────────────────────────────────────────
for app in "$NATS_APP" "$PG_APP" "$KEYCLOAK_APP" "$VAULT_APP" \
           "$CONTROLPLANE_APP" "$IDENTITYHUB_APP" "$ISSUER_APP" \
           "$TENANT_MGR_APP" "$PROVISION_MGR_APP"; do
  if ! az containerapp show --name "$app" --resource-group "$RG" -o none 2>/dev/null; then
    err "${app} does not exist. Run the earlier phases first (04-edc-services.sh, 05-cfm-configure.sh)."
    exit 1
  fi
done
ok "every upstream service exists"

# The registry password is not in env.sh; 04-edc-services.sh reads it at deploy
# time and so does this. Fails loudly rather than creating apps that cannot
# pull, which presents as an app stuck in Activating with no useful message.
ACR_PASSWORD=$(az acr credential show --name "$ACR_NAME" --query "passwords[0].value" -o tsv 2>/dev/null || echo "")
if [ -z "$ACR_PASSWORD" ]; then
  err "could not read the ACR admin password for ${ACR_NAME}."
  err "Check the admin user is enabled: az acr update -n ${ACR_NAME} --admin-enabled true"
  exit 1
fi
log "read the ACR admin password (${#ACR_PASSWORD} chars)"

# NATS must be warm: the agents hold a JetStream connection and will not
# reconnect politely to an app that is scaled to zero.
NATS_MIN=$(az containerapp show --name "$NATS_APP" --resource-group "$RG" \
  --query "properties.template.scale.minReplicas" -o tsv)
if [ "$NATS_MIN" != "1" ]; then
  log "scaling ${NATS_APP} to min=1 (was ${NATS_MIN})"
  az containerapp update --name "$NATS_APP" --resource-group "$RG" \
    --min-replicas 1 --max-replicas 1 -o none
fi

# ── Secrets: Postgres password, and the provisioner client secret ───────────
PG_PASSWORD_LIVE=$(az containerapp secret show \
  --name "$PG_APP" --resource-group "$RG" \
  --secret-name pg-password --query value -o tsv 2>/dev/null || echo "")
[ -n "$PG_PASSWORD_LIVE" ] || { err "could not read pg-password from ${PG_APP}"; exit 1; }
log "read pg-password from ${PG_APP} (${#PG_PASSWORD_LIVE} chars)"

PG_PASSWORD_ENC=$(python3 -c '
import sys
from urllib.parse import quote
print(quote(sys.argv[1], safe=""))
' "$PG_PASSWORD_LIVE")

# The provisioner secret is not in Key Vault; Keycloak is the source of truth.
# Read it through the admin API rather than hardcoding the compose default,
# which is what #359 is about.
KC_ADMIN_PW=$(kv_secret keycloak-admin-password)
[ -n "$KC_ADMIN_PW" ] || { err "could not read keycloak-admin-password from ${KEY_VAULT_NAME}"; exit 1; }

KC_URL="${KEYCLOAK_PUBLIC_URL:-https://auth.ehds.mabu.red}"
ADMIN_TOKEN=$(curl -sS -m 30 -X POST \
  "${KC_URL}/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password&client_id=admin-cli&username=${KC_ADMIN_USER}&password=${KC_ADMIN_PW}" \
  | python3 -c "import json,sys; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null || echo "")
[ -n "$ADMIN_TOKEN" ] || { err "could not get a Keycloak admin token from ${KC_URL}"; exit 1; }

PROV_UUID=$(curl -sS -m 30 -H "Authorization: Bearer $ADMIN_TOKEN" \
  "${KC_URL}/admin/realms/edcv/clients?clientId=provisioner" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print(d[0]['id'] if d else '')" 2>/dev/null || echo "")
[ -n "$PROV_UUID" ] || { err "the 'provisioner' client does not exist in realm edcv"; exit 1; }

PROV_SECRET=$(curl -sS -m 30 -H "Authorization: Bearer $ADMIN_TOKEN" \
  "${KC_URL}/admin/realms/edcv/clients/${PROV_UUID}/client-secret" \
  | python3 -c "import json,sys; print(json.load(sys.stdin).get('value',''))" 2>/dev/null || echo "")
[ -n "$PROV_SECRET" ] || { err "could not read the provisioner client secret"; exit 1; }
log "read the provisioner client secret from Keycloak (${#PROV_SECRET} chars)"

NATS_URI="nats://${NATS_APP}:4222"
DSN="postgres://${PG_ADMIN}:${PG_PASSWORD_ENC}@${PG_APP}:5432/cfm?sslmode=disable"
KC_TOKEN_URL="${KC_URL}/realms/edcv/protocol/openid-connect/token"

# ── The shim ────────────────────────────────────────────────────────────────
# nginx with the rewrite mounted as a secret volume. Internal ingress on 8081
# so the agents reach it by app name, exactly as they would the control plane.
deploy_shim() {
  local conf
  conf=$(cat "${REPO_ROOT}/jad/cfm-cp-shim-azure.conf")

  if az containerapp show --name "$CFM_CP_SHIM_APP" --resource-group "$RG" -o none 2>/dev/null; then
    log "updating ${CFM_CP_SHIM_APP}"
    az containerapp secret set --name "$CFM_CP_SHIM_APP" --resource-group "$RG" \
      --secrets "shim-conf=${conf}" -o none
  else
    log "creating ${CFM_CP_SHIM_APP}"
    az containerapp create \
      --name "$CFM_CP_SHIM_APP" --resource-group "$RG" --environment "$ACA_ENV" \
      --image "$CFM_CP_SHIM_IMAGE" \
      --registry-server "$ACR_LOGIN_SERVER" \
      --registry-username "$ACR_NAME" \
      --registry-password "$ACR_PASSWORD" \
      --cpu 0.25 --memory 0.5Gi \
      --min-replicas 1 --max-replicas 1 \
      --ingress internal --target-port 8081 \
      --secrets "shim-conf=${conf}" \
      -o none
  fi

  mount_config "$CFM_CP_SHIM_APP" shim-conf default.conf /etc/nginx/conf.d
}

# ── One agent ───────────────────────────────────────────────────────────────
# $1 app, $2 image, $3 config file name, $4 the config body
deploy_agent() {
  local app="$1" image="$2" file_name="$3" config="$4"
  local secret_name="agent-env"

  if az containerapp show --name "$app" --resource-group "$RG" -o none 2>/dev/null; then
    log "updating ${app}"
    az containerapp secret set --name "$app" --resource-group "$RG" \
      --secrets "${secret_name}=${config}" -o none
    az containerapp update --name "$app" --resource-group "$RG" \
      --image "$image" -o none
  else
    log "creating ${app}"
    # No ingress: these consume from NATS and serve nothing.
    az containerapp create \
      --name "$app" --resource-group "$RG" --environment "$ACA_ENV" \
      --image "$image" \
      --registry-server "$ACR_LOGIN_SERVER" \
      --registry-username "$ACR_NAME" \
      --registry-password "$ACR_PASSWORD" \
      --cpu 0.25 --memory 0.5Gi \
      --min-replicas 1 --max-replicas 1 \
      --secrets "${secret_name}=${config}" \
      -o none
  fi

  mount_config "$app" "$secret_name" "$file_name" /etc/appname
}

# ── Mount a secret as a file, and prove it landed ───────────────────────────
# Lifted from 05-cfm-configure.sh, which is the version that has been proven
# against these binaries. `containerapp show` returns secrets without values,
# so the block is dropped before the update rather than fed back empty.
mount_config() {
  local app="$1" secret_name="$2" file_name="$3" mount_path="$4"
  local yaml rev_before rev_after mounted
  yaml=$(mktemp)
  az containerapp show --name "$app" --resource-group "$RG" -o yaml > "$yaml"

  python3 - "$yaml" "$secret_name" "$file_name" "$mount_path" <<'PY'
import sys, yaml
path, secret_name, file_name, mount_path = sys.argv[1:5]
with open(path) as f:
    doc = yaml.safe_load(f)
tpl = doc['properties']['template']
volume_name = 'cfm-config'
vols = [v for v in (tpl.get('volumes') or []) if (v or {}).get('name') != volume_name]
vols.append({'name': volume_name, 'storageType': 'Secret',
             'secrets': [{'secretRef': secret_name, 'path': file_name}]})
tpl['volumes'] = vols
for c in tpl['containers']:
    mounts = [m for m in (c.get('volumeMounts') or [])
              if (m or {}).get('volumeName') != volume_name]
    mounts.append({'volumeName': volume_name, 'mountPath': mount_path})
    c['volumeMounts'] = mounts
doc['properties']['configuration'].pop('secrets', None)
with open(path, 'w') as f:
    yaml.safe_dump(doc, f)
PY

  rev_before=$(az containerapp show --name "$app" --resource-group "$RG" \
    --query "properties.latestRevisionName" -o tsv)
  az containerapp update --name "$app" --resource-group "$RG" --yaml "$yaml" -o none
  rm -f "$yaml"
  rev_after=$(az containerapp show --name "$app" --resource-group "$RG" \
    --query "properties.latestRevisionName" -o tsv)
  if [ "$rev_before" = "$rev_after" ]; then
    log "  no new revision; restarting ${rev_after} so the mount picks up the secret"
    az containerapp revision restart --name "$app" --resource-group "$RG" \
      --revision "$rev_after" -o none
  else
    log "  new revision ${rev_after}"
  fi

  mounted=$(az containerapp show --name "$app" --resource-group "$RG" \
    --query "properties.template.containers[0].volumeMounts[?volumeName=='cfm-config'].mountPath | [0]" \
    -o tsv 2>/dev/null || echo "")
  if [ "$mounted" = "$mount_path" ]; then
    ok "  ${app}: ${file_name} mounted at ${mount_path}"
  else
    err "  ${app}: the cfm-config volume is not mounted (got '${mounted}')"
    exit 1
  fi

  # Re-assert min=1. Measured on 2026-09-30: every one of the five apps this
  # script creates was sitting at minReplicas=0 the morning after the first
  # deployment, although the create path passes `--min-replicas 1` and nothing
  # in .github/workflows/aca-schedule.yml touched them at the time. Point 4 of
  # the header explains why zero is not survivable here: these are NATS
  # consumers with no ingress, so no request exists that could scale them up,
  # and a participant onboarded while they are at zero keeps all three
  # activities pending for ever.
  #
  # I have not proven what resets it. The likeliest candidate is the
  # `containerapp update --yaml` round-trip just above, but I did not get to
  # measure that, so this asserts the invariant rather than claiming a cause.
  # If it reports a correction on a run where nothing else changed, the
  # round-trip is the culprit and belongs fixed at the source.
  local min_now
  min_now=$(az containerapp show --name "$app" --resource-group "$RG" \
    --query "properties.template.scale.minReplicas" -o tsv 2>/dev/null || echo "")
  if [ "$min_now" != "1" ]; then
    log "  ${app}: minReplicas is ${min_now}, setting it back to 1"
    az containerapp update --name "$app" --resource-group "$RG" \
      --min-replicas 1 --max-replicas 1 -o none
    min_now=$(az containerapp show --name "$app" --resource-group "$RG" \
      --query "properties.template.scale.minReplicas" -o tsv 2>/dev/null || echo "")
    [ "$min_now" = "1" ] || { err "  ${app}: minReplicas is still ${min_now}"; exit 1; }
  fi
  ok "  ${app}: minReplicas=1"
}

deploy_shim

# ── The four agents ─────────────────────────────────────────────────────────
# Keys mirror jad/*-agent-config.yaml with the hostnames pointed at ACA.
#
# identityhub.url uses port 7082, not the 7081 the local config uses. This
# deployment passes WEB_HTTP_PORT=7081 and WEB_HTTP_IDENTITY_PORT=7082, so the
# identity API is on 7082 here. Confirmed on 2026-09-29 with a provisioner
# token: 7082/api/identity/v1alpha/participants answers 200 with a list, and
# 08-compliance-runner.sh and 05-cfm-ui.sh already call that port.
#
# UNRESOLVED, and the EDC-V agent is the one that needs them: nothing answered
# on 7084 (STS) or on 7082/api/credentials during the same probe. The
# deployment never sets WEB_HTTP_STS_PORT at all, and the credentials context
# has no port of its own here. If cfm.credentialservice activities stall, that
# is where to look first, not at this script.
# ── ACA internal addressing, learned the hard way ───────────────────────────
# An app is reachable inside the environment on **port 80** unless the port is
# declared in ingress.additionalPortMappings. An explicit port that is not an
# exposedPort does not refuse, it hangs until the caller times out, which is
# indistinguishable from a service being down. Measured 2026-09-29:
#
#   http://mvhd-vault/v1/sys/health        200 in 0.018s
#   http://mvhd-vault:8200/v1/sys/health   no answer, 20s timeout
#
#   app                exposedPorts        address it as
#   mvhd-identityhub   7082                :7082 or port 80
#   mvhd-controlplane  8081, 8082, 8083    :8081 etc
#   mvhd-issuerservice none                port 80
#   mvhd-vault         none                port 80
#   mvhd-cfm-cp-shim   none                port 80
#
# That is why the first deployment of the two Vault-using agents panicked with
# `unable to authenticate with JWT: context deadline exceeded`: not a sealed
# Vault and not a credential problem, just an unreachable port.
COMMON="uri: ${NATS_URI}
bucket: cfm-bucket
stream: cfm-stream
httpport: 8080
postgres: true
dsn: ${DSN}"

deploy_agent "$CFM_KC_AGENT_APP" "$CFM_KC_AGENT_IMAGE" kcagent.env "${COMMON}
vault.url: http://${VAULT_APP}
vault.path: secret
vault.clientId: provisioner
vault.clientSecret: ${PROV_SECRET}
vault.tokenUrl: ${KC_TOKEN_URL}
keycloak.url: ${KC_URL}
keycloak.realm: edcv
keycloak.username: ${KC_ADMIN_USER}
keycloak.password: ${KC_ADMIN_PW}
keycloak.clientId: admin-cli"

deploy_agent "$CFM_EDCV_AGENT_APP" "$CFM_EDCV_AGENT_IMAGE" edcvagent.env "${COMMON}
vault.url: http://${VAULT_APP}
vault.path: secret
vault.clientId: provisioner
vault.clientSecret: ${PROV_SECRET}
vault.tokenUrl: ${KC_TOKEN_URL}
vault.softDelete: true
keycloak.clientID: provisioner
keycloak.clientSecret: ${PROV_SECRET}
keycloak.tokenUrl: ${KC_TOKEN_URL}
identityhub.url: http://${IDENTITYHUB_APP}:7082/api/identity
identityhub.sts.url: http://${IDENTITYHUB_APP}:7084/api/sts/token
identityhub.cs.url: http://${IDENTITYHUB_APP}:7082/api/credentials/v1/participants/%s
controlplane.url: http://${CFM_CP_SHIM_APP}/api/mgmt
controlplane.protocol.url: http://${CONTROLPLANE_APP}:8082/api/dsp/%s/2025-1"

deploy_agent "$CFM_REG_AGENT_APP" "$CFM_REG_AGENT_IMAGE" regagent.env "${COMMON}
keycloak.tokenUrl: ${KC_TOKEN_URL}
keycloak.clientId: provisioner
keycloak.clientSecret: ${PROV_SECRET}
issuerservice.url: http://${ISSUER_APP}/api/admin
issuer.id: issuer"

deploy_agent "$CFM_OB_AGENT_APP" "$CFM_OB_AGENT_IMAGE" obagent.env "${COMMON}
keycloak.tokenUrl: ${KC_TOKEN_URL}
keycloak.clientId: provisioner
keycloak.clientSecret: ${PROV_SECRET}
identityhub.url: http://${IDENTITYHUB_APP}:7082/api/identity
issuerservice.url: http://${ISSUER_APP}/api/admin
issuer.id: issuer"

ok "CFM agents deployed"
log ""
log "Verify, do not assume. The apps being Running is not the same as the"
log "agents consuming; that is exactly how #380 stayed hidden for months."
log ""
log "  1. Each agent's log should show a NATS connection and no panic:"
for a in "$CFM_KC_AGENT_APP" "$CFM_EDCV_AGENT_APP" "$CFM_REG_AGENT_APP" "$CFM_OB_AGENT_APP"; do
  log "       az containerapp logs show -n ${a} -g ${RG} --tail 40"
done
log "     A panic naming its own parameters (kcagent.uri is empty) means the"
log "     config file did not mount. A panic naming cfm-agent.tmanager_url"
log "     means the image is the 2026-04-11 Fulcrum build, not ours."
log ""
log "  2. Register a participant with a FICTIONAL name at"
log "     https://ehds.mabu.red/onboarding as EDC Admin, and watch the three"
log "     activities leave pending within a minute or two."
log ""
log "  3. Confirm a DID resolves and a MembershipCredential exists for it."
log ""
log "The two live tenants Carite and Madrid Hospital do not follow the"
log "Fictional Organisation Policy and will start provisioning the moment these"
log "agents consume. Delete them via the Tenant Manager first if that is not"
log "wanted."
