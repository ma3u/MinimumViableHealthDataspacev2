#!/usr/bin/env bash
set -euo pipefail
# =============================================================================
# Phase 23: mvhd-dataplane, the hub's push data plane, on Container Apps
# (ADR-095), with Event Hubs as its Kafka broker (ADR-096)
# =============================================================================
#   23-dataplane.sh                    same as --check
#   23-dataplane.sh --check            report every part below; change nothing
#   23-dataplane.sh render DIR         write the app definition to DIR for review,
#                                      the registry password as a placeholder
#   23-dataplane.sh render DIR --offline  the same without az, every Azure value a placeholder
#   23-dataplane.sh images             build the image here (linux/amd64) and push it to ACR
#   23-dataplane.sh secrets            generate what is missing in Key Vault: the database
#                                      role's password and the signing key (an RSA JWK)
#   23-dataplane.sh eventhubs          the three shared access policies on the namespace,
#                                      their connection strings into Key Vault
#   23-dataplane.sh keycloak           the client dataplane-signaling in realm edcv, its
#                                      secret generated into Key Vault
#   DATAPLANE_AZURE_GO=mvhd-dataplane 23-dataplane.sh app
#                                      create or update the Container App
#   DATAPLANE_WIRE_GO="controlplane proxy ui" 23-dataplane.sh wire
#                                      the control plane's signaling port, the proxy's and
#                                      the UI's settings; only the ones DATAPLANE_WIRE_GO names
#   DATAPLANE_WIRE_GO="proxy ui" 23-dataplane.sh unwire
#                                      take the proxy's and the UI's settings off again
#   23-dataplane.sh register           mvhd-dp-<context> for every participant context,
#                                      from a one-shot job inside the environment
#   23-dataplane.sh check-streaming    one Kafka-PUSH of ecg-holter-hour into SPE-1, from a
#                                      one-shot job inside the environment
#
# Nothing here has run against Azure yet (written 2026-11-24). Every mode but
# --check and render changes Azure: Matthias's go per step and a fresh
# `az login` first (the session lasts an hour). Order, gates and the rollback:
# docs/knowledge/runbooks/dataplane-on-azure.md.
#
# What runs: mvhd-edc-dataplane:<tag>, built by runtimes/edc/Dockerfile with
# RUNTIME=dataplane and pushed by push-edc1-images.sh, the script that builds
# the three EDC launchers from the same Dockerfile; <tag> is its tag, so one
# tag names one source for all four. One app, one replica: SPE inboxes and
# Kafka flows are held in memory (docs/knowledge/services/dataplane.md).
# The definition is scripts/azure/dataplane/dataplane.yaml.
#
# Needed before `app`, each reported by --check:
#   - the image (`images`);
#   - Key Vault: dataplane-db-password and dataplane-signing-key-jwk (`secrets`),
#     eventhubs-dataplane-manage-connection (`eventhubs`);
#   - the role `dataplane` and the database `dataplane_v1` it owns: workflow
#     dataplane-database.yml (create-dataplane-database.sh), as the CI identity.
# Needed before `register`: the Keycloak client (`keycloak`), the app healthy,
# and the control plane's port 8182 (`wire`, controlplane).
#
# The Event Hubs login, and the gap against ADR-096 decision 3
# ------------------------------------------------------------
# ADR-096 decides a Send policy for providers and a Listen policy for
# consumers. The data plane cannot run on those two today, for two reasons in
# its code, not in this script:
#   1. it creates and deletes one topic per transfer through the Kafka admin
#      API (KafkaTransport.createTopic, deleteTopic). On Event Hubs a topic is
#      an event hub, and creating or deleting one needs the Manage claim on
#      the namespace. The consumer's side creates the topic of a Kafka-PUSH,
#      the provider's side that of a Kafka-PULL, and the provider deletes
#      both, so each side needs Manage, whichever policy it holds;
#   2. Config.java has one DATAPLANE_KAFKA_SASL_USERNAME and one password,
#      and one process serves every participant context, providers and
#      consumers alike.
# So `eventhubs` creates three policies: mvhd-dataplane-send (Send) and
# mvhd-dataplane-listen (Listen), as ADR-096 decides, which nothing uses yet,
# and mvhd-dataplane-manage (Manage, Send, Listen), which is the one login the
# app runs with. That login can read and write every topic in the namespace
# and delete any of them: there is no separation between participants at the
# broker. It is acceptable only while one operator runs one data plane for
# all the demo participants, and it must not be handed to a second
# organisation's data plane. The smallest change that closes it is described
# in the runbook (three logins in Config.java: admin, send, listen); it is
# not made here.
#
# Off hours (ADR-053): offhours.sh stops and starts mvhd-dataplane with the
# stack once it exists. The Event Hubs namespace cannot be stopped: it bills
# about 20 EUR a month until it is deleted (ADR-096).
#
# Needs: az (logged in), python3 with PyYAML, openssl, curl, jq; docker with
# buildx for `images`. The PIM role for `secrets`, `eventhubs`, `keycloak`
# (Key Vault Secrets Officer; the namespace's authorization rules) and `app`
# (registry credentials). Never prints a secret.
# =============================================================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
# shellcheck source=scripts/azure/env.sh
source "$SCRIPT_DIR/env.sh"
# shellcheck source=scripts/azure/dataplane/job-lib.sh
source "$SCRIPT_DIR/dataplane/job-lib.sh"

MODE="${1:---check}"
APP="$DATAPLANE_APP"
DB="${DATAPLANE_DB:-dataplane_v1}"
DB_USER="${DATAPLANE_DB_USER:-dataplane}"
CLIENT_ID="dataplane-signaling"
# Decided by the maintainer: on Azure a push goes only into a workspace whose
# attestation covers the workload (ADR-068 decision 5).
ATTESTATION_FLOOR="workload"
KAFKA_BOOTSTRAP="${EVENTHUBS_NAMESPACE}.servicebus.windows.net:9093"
# As compose: the Kafka client logs every group join at info.
JAVA_OPTS_VALUE="-Xmx256m -Dorg.slf4j.simpleLogger.defaultLogLevel=warn"
# The heap is 256 MiB; the rest is the JVM's own and the Kafka clients' buffers.
DATAPLANE_CPU="${DATAPLANE_CPU:-0.5}"
DATAPLANE_MEMORY="${DATAPLANE_MEMORY:-1Gi}"

# Key Vault secret names (ADR-036: one copy, referenced, never copied).
KV_DB_PASSWORD="dataplane-db-password"
KV_SIGNING_KEY="dataplane-signing-key-jwk"
KV_CLIENT_SECRET="dataplane-signaling-client-secret"
KV_PSEUDONYM_KEY="patient-pseudonym-key"
KV_KAFKA_MANAGE="eventhubs-dataplane-manage-connection"
KV_KAFKA_SEND="eventhubs-dataplane-send-connection"
KV_KAFKA_LISTEN="eventhubs-dataplane-listen-connection"
# policy|rights|Key Vault secret. The app logs in with the first (see the header).
RULES=(
  "mvhd-dataplane-manage|Manage Send Listen|${KV_KAFKA_MANAGE}"
  "mvhd-dataplane-send|Send|${KV_KAFKA_SEND}"
  "mvhd-dataplane-listen|Listen|${KV_KAFKA_LISTEN}"
)

# The tag push-edc1-images.sh gives the source: one rule, in one place.
# DATAPLANE_TAG pins another, for an app that must stay on an older build.
TAG="${DATAPLANE_TAG:-$("$SCRIPT_DIR/push-edc1-images.sh" tag)}"
IMAGE="${ACR_LOGIN_SERVER}/mvhd-edc-dataplane:${TAG}"

# How the control plane and the proxy reach the data plane: the short app
# name, HTTP, port 80 to 8090 (the ingress allows plain HTTP for it).
PUBLIC_URL="http://${APP}"

# ── values ──────────────────────────────────────────────────────────────────
# The addresses the definition needs, from what runs in the environment now.
azure_values() {
  eval "$(get_aca_fqdns)"
  [ -n "${ACA_DOMAIN:-}" ] || { err "no Container Apps environment ${ACA_ENV} in ${RG}"; exit 1; }
  ENV_ID="$(az containerapp env show --name "$ACA_ENV" --resource-group "$RG" --query id -o tsv)"
  KV_URI="$(dp_kv_uri)"
  KV_READER_ID="$(az identity show --name "$KV_READER_IDENTITY" --resource-group "$RG" --query id -o tsv)"
  # The signaling API's port and path are the launcher's defaults unless the
  # control plane was told otherwise; read, not assumed.
  local cp_env signaling
  cp_env="$(az containerapp show --name "$CONTROLPLANE_APP" --resource-group "$RG" \
    --query "properties.template.containers[0].env" -o json)"
  signaling="$(CP_ENV_JSON="$cp_env" python3 -I -c '
import json, os
env = {e["name"]: e.get("value", "") for e in json.loads(os.environ["CP_ENV_JSON"]) or []}
print((env.get("WEB_HTTP_SIGNALING_PORT") or "8182") + (env.get("WEB_HTTP_SIGNALING_PATH") or "/api/signaling"))')"
  CP_SIGNALING_PORT="${signaling%%/*}"
  CP_SIGNALING_URL="http://${CONTROLPLANE_APP}:${signaling}"
  KC_REALM_URL="${KEYCLOAK_INTERNAL_URL%/}/realms/edcv/protocol/openid-connect"
  PROXY_URL="$NEO4J_PROXY_URL"
}

offline_values() {
  ENV_ID="<managed environment id>"
  KV_URI="https://${KEY_VAULT_NAME}.vault.azure.net"
  KV_READER_ID="<resource id of ${KV_READER_IDENTITY}>"
  CP_SIGNALING_PORT="8182"
  CP_SIGNALING_URL="http://${CONTROLPLANE_APP}:8182/api/signaling"
  KC_REALM_URL="https://${KEYCLOAK_APP}.internal.<aca-domain>/realms/edcv/protocol/openid-connect"
  PROXY_URL="https://${NEO4J_PROXY_APP}.internal.<aca-domain>"
}

# render DIR SECRETS: the definition as JSON (the ARM body `app` puts).
# SECRETS=real fills the registry password from ACR_PASSWORD; anything else
# leaves the placeholder. Every other secret is a Key Vault reference already.
render() {
  local dir="$1" secrets="$2"
  mkdir -p "$dir"
  LOCATION="$LOCATION" ENV_ID="$ENV_ID" ACR_LOGIN_SERVER="$ACR_LOGIN_SERVER" ACR_NAME="$ACR_NAME" \
    IMAGE="$IMAGE" KV_URI="$KV_URI" KV_READER_ID="$KV_READER_ID" \
    KV_DB_PASSWORD="$KV_DB_PASSWORD" KV_KAFKA_CONNECTION="$KV_KAFKA_MANAGE" KV_SIGNING_KEY="$KV_SIGNING_KEY" \
    CPU="$DATAPLANE_CPU" MEMORY="$DATAPLANE_MEMORY" PUBLIC_URL="$PUBLIC_URL" \
    CP_SIGNALING_URL="$CP_SIGNALING_URL" KC_JWKS_URL="${KC_REALM_URL}/certs" \
    SIGNALING_CLIENT_ID="$CLIENT_ID" PROXY_URL="$PROXY_URL" ATTESTATION_FLOOR="$ATTESTATION_FLOOR" \
    KAFKA_BOOTSTRAP="$KAFKA_BOOTSTRAP" \
    DB_URL="jdbc:postgresql://${PG_HOST}:${PG_PORT}/${DB}?sslmode=${PG_SSLMODE}" DB_USER="$DB_USER" \
    JAVA_OPTS="$JAVA_OPTS_VALUE" \
    python3 - "$SCRIPT_DIR/dataplane/dataplane.yaml" "$dir/${APP}.json" "$secrets" <<'PY'
import json, os, string, sys
import yaml  # PyYAML
template, out, secrets = sys.argv[1:4]
doc = yaml.safe_load(string.Template(open(template).read()).substitute(os.environ))
env = {e["name"]: e for e in doc["properties"]["template"]["containers"][0]["env"]}
# The one value a shell or a renderer could have eaten: Event Hubs' SASL user
# is this text, dollar sign included.
if env["DATAPLANE_KAFKA_SASL_USERNAME"].get("value") != "$ConnectionString":
    sys.exit("DATAPLANE_KAFKA_SASL_USERNAME is not the literal $ConnectionString after rendering")
if secrets == "real":
    for s in doc["properties"]["configuration"]["secrets"]:
        if s["name"] == "acr-password":
            s["value"] = os.environ["ACR_PASSWORD"]
with open(out, "w") as f:
    json.dump(doc, f, indent=2)
print(f"rendered {out}: {len(env)} settings, "
      f"{sum(1 for e in env.values() if 'secretRef' in e)} of them secret references")
PY
}

# ── checks ──────────────────────────────────────────────────────────────────
kv_has() { az keyvault secret show --vault-name "$KEY_VAULT_NAME" --name "$1" --query id -o none 2>/dev/null; }
app_exists() { az containerapp show --name "$1" --resource-group "$RG" --query name -o tsv >/dev/null 2>&1; }
image_in_acr() {
  az acr repository show-tags --name "$ACR_NAME" --repository mvhd-edc-dataplane -o tsv 2>/dev/null | grep -qx "$TAG"
}
line() { printf '  %-8s %s\n' "$1" "$2"; }

# settings_of <app> <name>...: for each name whether the app has it, and how.
# A value is shown only for an address; anything else set in plain text is
# named, not shown.
settings_of() {
  local app="$1"
  shift
  az containerapp show --name "$app" --resource-group "$RG" \
    --query "properties.template.containers[0].env" -o json 2>/dev/null |
    python3 -I -c '
import json, sys
env = {e["name"]: e for e in json.load(sys.stdin) or []}
for name in sys.argv[1:]:
    e = env.get(name)
    ref, value = (e or {}).get("secretRef"), (e or {}).get("value", "")
    if e is None:
        print(f"  MISSING  {name}")
    elif ref:
        print(f"  present  {name} (secret {ref})")
    elif name.endswith(("_URL", "_ENDPOINT")):
        print(f"  present  {name}={value}")
    else:
        print(f"  PLAIN    {name} is set in plain text, not as a secret reference")
' "$@" || line "?" "could not read the settings of ${app}"
}

# The Key Vault secret an app's secret refers to; empty for a plain secret.
secret_kv_url() {
  az containerapp secret list --name "$1" --resource-group "$RG" \
    --query "[?name=='$2'].keyVaultUrl | [0]" -o tsv 2>/dev/null || true
}

report() {
  local entry name rights kv got ports count a b ref

  echo "Image"
  if image_in_acr; then line present "$IMAGE"; else line MISSING "${IMAGE} (23-dataplane.sh images)"; fi

  echo "Database (${PG_FLEX_NAME})"
  if az postgres flexible-server db show --server-name "$PG_FLEX_NAME" --resource-group "$RG" \
       --name "$DB" -o none 2>/dev/null; then
    line present "database ${DB}"
  else
    line MISSING "database ${DB} (workflow dataplane-database.yml; also reported missing while the server is stopped)"
  fi
  line "?" "role ${DB_USER}: a role is not an ARM resource; the workflow's last line (\"OK: ${DB_USER} logs in ...\") is its proof"

  echo "Key Vault (${KEY_VAULT_NAME}), names only"
  for name in "$KV_DB_PASSWORD" "$KV_SIGNING_KEY" "$KV_CLIENT_SECRET" "$KV_PSEUDONYM_KEY" \
    "$KV_KAFKA_MANAGE" "$KV_KAFKA_SEND" "$KV_KAFKA_LISTEN"; do
    if kv_has "$name"; then line present "$name"; else line MISSING "$name"; fi
  done

  echo "Keycloak client ${CLIENT_ID}"
  keycloak_login_check || true

  echo "Event Hubs namespace ${EVENTHUBS_NAMESPACE}"
  if got="$(az eventhubs namespace show --name "$EVENTHUBS_NAMESPACE" --resource-group "$RG" \
       --query "[sku.name, to_string(kafkaEnabled), minimumTlsVersion, status] | join(' ', @)" -o tsv 2>/dev/null)"; then
    line present "${EVENTHUBS_NAMESPACE} (sku, Kafka, TLS, status: ${got})"
    for entry in "${RULES[@]}"; do
      name="${entry%%|*}"; rights="${entry#*|}"; rights="${rights%%|*}"
      got="$(az eventhubs namespace authorization-rule show --namespace-name "$EVENTHUBS_NAMESPACE" \
        --resource-group "$RG" --name "$name" --query "join(' ', sort(rights))" -o tsv 2>/dev/null || true)"
      if [ -z "$got" ]; then
        line MISSING "policy ${name} (${rights})"
      elif [ "$got" = "$(tr ' ' '\n' <<<"$rights" | sort | tr '\n' ' ' | sed 's/ $//')" ]; then
        line present "policy ${name}: ${got}"
      else
        line DIFFERS "policy ${name}: ${got}, expected ${rights}"
      fi
    done
    # ADR-096: at most 10 event hubs on Standard, and the data plane opens one
    # per transfer. One left behind by a transfer that never ended counts.
    count="$(az eventhubs eventhub list --namespace-name "$EVENTHUBS_NAMESPACE" --resource-group "$RG" \
      --query "length(@)" -o tsv 2>/dev/null || echo "?")"
    line topics "${count} of 10 event hubs in use"
  else
    line MISSING "${EVENTHUBS_NAMESPACE} (ADR-096 created it on 2026-11-20)"
  fi

  echo "App ${APP}"
  if app_exists "$APP"; then
    az containerapp revision list --name "$APP" --resource-group "$RG" \
      --query "[?properties.active].{revision:name,health:properties.healthState,state:properties.runningState,image:properties.template.containers[0].image}" \
      -o tsv | sed 's/^/  /'
    got="$(az containerapp show --name "$APP" --resource-group "$RG" \
      --query "[to_string(properties.configuration.ingress.external), to_string(properties.configuration.ingress.targetPort), to_string(properties.template.scale.minReplicas), to_string(properties.template.scale.maxReplicas)] | join(' ', @)" -o tsv)"
    line ingress "external, port, min, max replicas: ${got} (want false 8090 1 1)"
  else
    line absent "app ${APP}"
  fi

  echo "Control plane's signaling API, as the data plane reaches it"
  # From the app's definition, not from a probe: a port of a Container App is
  # reachable inside the environment by the app's name exactly when it is the
  # ingress's target port or one of its additional port mappings. Nothing is
  # executed in a container to find out.
  got="$(az containerapp show --name "$CONTROLPLANE_APP" --resource-group "$RG" \
    --query "properties.template.containers[0].env[?name=='WEB_HTTP_SIGNALING_PORT'].value | [0]" -o tsv 2>/dev/null || true)"
  got="${got:-8182}"
  ports="$(az containerapp show --name "$CONTROLPLANE_APP" --resource-group "$RG" \
    --query "properties.configuration.ingress.additionalPortMappings[].exposedPort" -o tsv 2>/dev/null | tr '\n' ' ')" || true
  if grep -qw "$got" <<<"$ports"; then
    line present "http://${CONTROLPLANE_APP}:${got}/api/signaling (port mappings: ${ports})"
  else
    line MISSING "port ${got} is not among the port mappings (${ports:-none}); callbacks cannot arrive (wire, controlplane)"
  fi

  echo "Proxy ${NEO4J_PROXY_APP}"
  settings_of "$NEO4J_PROXY_APP" DATAPLANE_JWKS_URL SPE_INBOX_PUBLIC_URL PATIENT_PSEUDONYM_KEY
  count="$(az containerapp show --name "$NEO4J_PROXY_APP" --resource-group "$RG" \
    --query properties.template.scale.maxReplicas -o tsv 2>/dev/null || echo "?")"
  if [ "$count" = 1 ]; then
    line replicas "at most 1"
  else
    line MISSING "at most ${count} replicas, ADR-099 says 1: an SPE inbox lives in one replica's memory (wire, proxy)"
  fi

  echo "UI ${UI_APP}"
  settings_of "$UI_APP" PUSH_DATAPLANE_URL PUSH_DATAPLANE_CLIENT_SECRET PUSH_DATAPLANE_TOKEN_ENDPOINT PATIENT_PSEUDONYM_KEY
  # One pseudonym for one patient on a pull and on a push needs the same key
  # on both. Compared by the Key Vault secret each side refers to, never by value.
  ref="$(az containerapp show --name "$UI_APP" --resource-group "$RG" \
    --query "properties.template.containers[0].env[?name=='PATIENT_PSEUDONYM_KEY'].secretRef | [0]" -o tsv 2>/dev/null || true)"
  a=""; [ -z "$ref" ] || a="$(secret_kv_url "$UI_APP" "$ref")"
  ref="$(az containerapp show --name "$NEO4J_PROXY_APP" --resource-group "$RG" \
    --query "properties.template.containers[0].env[?name=='PATIENT_PSEUDONYM_KEY'].secretRef | [0]" -o tsv 2>/dev/null || true)"
  b=""; [ -z "$ref" ] || b="$(secret_kv_url "$NEO4J_PROXY_APP" "$ref")"
  if [ -n "$a" ] && [ "$a" = "$b" ]; then
    line present "the UI and the proxy read the pseudonym key from the same Key Vault secret"
  else
    line MISSING "the UI and the proxy do not both read ${KV_PSEUDONYM_KEY} from Key Vault (wire)"
  fi

  echo "Off hours (ADR-053)"
  if grep -q 'DATAPLANE_APP' "$SCRIPT_DIR/offhours.sh"; then
    line present "this checkout's offhours.sh stops and starts ${APP}"
  else
    line MISSING "this checkout's offhours.sh does not name ${APP}"
  fi
  # The jobs run offhours.sh from the commit deploy-azure.yml last deployed.
  ref="$(az containerapp job show --name mvhd-offhours-stop --resource-group "$RG" \
    --query "properties.template.containers[0].env[?name=='REPO_REF'].value | [0]" -o tsv 2>/dev/null || true)"
  if [ -z "$ref" ]; then
    line "?" "no REPO_REF on the job mvhd-offhours-stop"
  elif curl -fsS --max-time 20 "https://raw.githubusercontent.com/ma3u/MinimumViableHealthDataspacev2/${ref}/scripts/azure/offhours.sh" 2>/dev/null |
    grep -q 'DATAPLANE_APP'; then
    line present "the off-hours jobs run ${ref:0:12}, whose offhours.sh names ${APP}"
  else
    line MISSING "the off-hours jobs run ${ref:0:12}, whose offhours.sh does not name ${APP}: merge to main first"
  fi
  line note "the Event Hubs namespace is never stopped; it bills until it is deleted (ADR-096)"
}

# A token for the client proves both that it exists and that Keycloak holds
# the secret Key Vault holds, which a lookup of the client alone would not.
# Uses no admin credential. Returns 1 when the check could not pass.
keycloak_login_check() {
  local secret code
  secret="$(kv_secret "$KV_CLIENT_SECRET" quiet)"
  if [ -z "$secret" ]; then
    line MISSING "${KV_CLIENT_SECRET} is not in Key Vault, so the client cannot be checked (keycloak)"
    return 1
  fi
  code="$(curl -sS --max-time 20 -o /dev/null -w '%{http_code}' -X POST \
    "${KEYCLOAK_BASE_URL}/realms/edcv/protocol/openid-connect/token" \
    --data-urlencode grant_type=client_credentials --data-urlencode "client_id=${CLIENT_ID}" \
    --data-urlencode "client_secret=${secret}" 2>/dev/null)" || code="000"
  unset secret
  case "$code" in
    200) line present "Keycloak issues a token for ${CLIENT_ID} with Key Vault's secret" ;;
    000) line "?" "${KEYCLOAK_BASE_URL} did not answer (stopped off hours?)"; return 1 ;;
    *) line MISSING "Keycloak answered ${code} for ${CLIENT_ID}: no such client, or another secret (keycloak)"; return 1 ;;
  esac
}

# ── secrets ─────────────────────────────────────────────────────────────────
# kv_put <name>: stdin into Key Vault, through a file only this user can read,
# so the value is on no command line (a JWK or a connection string would be in
# the process list otherwise).
kv_put() {
  local name="$1" dir
  dir="$(umask 077 && mktemp -d)"
  cat >"${dir}/value"
  az keyvault secret set --vault-name "$KEY_VAULT_NAME" --name "$name" \
    --file "${dir}/value" --encoding utf-8 -o none
  rm -rf "$dir"
}

# An RSA private key as a JWK with a kid, on stdout. openssl makes the key;
# python only reads its DER and re-encodes the nine integers, so no library
# beyond the standard one is needed. Never written to disk.
rsa_jwk() {
  openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -outform DER 2>/dev/null |
    python3 -I -c '
import base64, json, sys, uuid
def tlv(buf, at):
    tag = buf[at]; n = buf[at + 1]; at += 2
    if n & 0x80:
        k = n & 0x7F; n = int.from_bytes(buf[at:at + k], "big"); at += k
    return tag, buf[at:at + n], at + n
def ints(body):
    out, at = [], 0
    while at < len(body):
        tag, value, at = tlv(body, at)
        out.append((tag, value))
    return out
der = sys.stdin.buffer.read()
_, body, _ = tlv(der, 0)
parts = ints(body)
# PKCS#8 wraps the RSAPrivateKey in an octet string after the algorithm.
if parts[1][0] == 0x30:
    _, inner, _ = tlv(parts[2][1], 0)
    parts = ints(inner)
names = ["n", "e", "d", "p", "q", "dp", "dq", "qi"]
if len(parts) < 9 or any(tag != 0x02 for tag, _ in parts[:9]):
    sys.exit("openssl did not produce an RSA private key")
def b64(value):
    return base64.urlsafe_b64encode(value.lstrip(b"\x00")).rstrip(b"=").decode()
jwk = {"kty": "RSA", "kid": str(uuid.uuid4()), "use": "sig", "alg": "RS256"}
jwk.update({name: b64(value) for name, (_, value) in zip(names, parts[1:9])})
if int.from_bytes(parts[1][1], "big").bit_length() < 2048:
    sys.exit("the key is shorter than 2048 bits")
print(json.dumps(jwk))'
}

cmd_secrets() {
  if kv_has "$KV_DB_PASSWORD"; then
    ok "Key Vault already holds ${KV_DB_PASSWORD}; kept as it is"
  else
    # hex: nothing in it needs quoting in a JDBC login or in SQL
    openssl rand -hex 32 | tr -d '\n' | kv_put "$KV_DB_PASSWORD"
    ok "generated ${KV_DB_PASSWORD} in ${KEY_VAULT_NAME} (256 bit, not displayed)"
  fi
  if kv_has "$KV_SIGNING_KEY"; then
    # A new key would stop every callback signed with the old one from
    # verifying; replacing it is a rotation with its own steps (runbook).
    ok "Key Vault already holds ${KV_SIGNING_KEY}; kept as it is"
  else
    local jwk
    jwk="$(rsa_jwk)"
    [ -n "$jwk" ] || { err "no signing key was generated"; exit 1; }
    printf '%s' "$jwk" | kv_put "$KV_SIGNING_KEY"
    unset jwk
    ok "generated ${KV_SIGNING_KEY} in ${KEY_VAULT_NAME} (RSA 2048 with a kid, not displayed)"
  fi
}

cmd_eventhubs() {
  if [ "$RG" != "$HUB_RG" ] && [ "$EVENTHUBS_NAMESPACE" = "evhns-mvhd-b53a0449" ]; then
    err "RG=${RG} is not the hub, but EVENTHUBS_NAMESPACE still names the hub's namespace"
    exit 1
  fi
  az eventhubs namespace show --name "$EVENTHUBS_NAMESPACE" --resource-group "$RG" -o none 2>/dev/null ||
    { err "no Event Hubs namespace ${EVENTHUBS_NAMESPACE} in ${RG} (ADR-096)"; exit 1; }
  local entry name rights kv conn
  for entry in "${RULES[@]}"; do
    name="${entry%%|*}"; rights="${entry#*|}"; kv="${rights#*|}"; rights="${rights%%|*}"
    if az eventhubs namespace authorization-rule show --namespace-name "$EVENTHUBS_NAMESPACE" \
         --resource-group "$RG" --name "$name" -o none 2>/dev/null; then
      ok "policy ${name} exists"
    else
      # Unquoted on purpose: --rights takes one word per right.
      # shellcheck disable=SC2086
      az eventhubs namespace authorization-rule create --namespace-name "$EVENTHUBS_NAMESPACE" \
        --resource-group "$RG" --name "$name" --rights $rights -o none
      ok "policy ${name} created (${rights})"
    fi
    # Written again on every run, so a key regenerated on the namespace
    # reaches Key Vault by running this mode; the app then needs a restart.
    conn="$(az eventhubs namespace authorization-rule keys list --namespace-name "$EVENTHUBS_NAMESPACE" \
      --resource-group "$RG" --name "$name" --query primaryConnectionString -o tsv)"
    [ -n "$conn" ] || { err "no connection string for ${name}"; exit 1; }
    printf '%s' "$conn" | kv_put "$kv"
    unset conn
    ok "${kv} in ${KEY_VAULT_NAME} (not displayed)"
  done
  warn "the app logs in with mvhd-dataplane-manage: every topic of the namespace, for every participant (see the header)"
}

cmd_keycloak() {
  local secret admin_pw admin_token realm uuid body
  secret="$(kv_secret "$KV_CLIENT_SECRET" quiet)"
  if [ -z "$secret" ]; then
    openssl rand -hex 32 | tr -d '\n' | kv_put "$KV_CLIENT_SECRET"
    secret="$(kv_secret "$KV_CLIENT_SECRET")"
    [ -n "$secret" ] || { err "could not read ${KV_CLIENT_SECRET} back"; exit 1; }
    ok "generated ${KV_CLIENT_SECRET} in ${KEY_VAULT_NAME} (not displayed)"
  fi
  admin_pw="$(kc_admin_password)"
  [ -n "$admin_pw" ] || { err "no Keycloak admin password"; exit 1; }
  admin_token="$(curl -sS --max-time 30 -X POST "${KEYCLOAK_BASE_URL}/realms/master/protocol/openid-connect/token" \
    --data-urlencode grant_type=password --data-urlencode client_id=admin-cli \
    --data-urlencode "username=${KC_ADMIN_USER}" --data-urlencode "password=${admin_pw}" |
    jq -r '.access_token // empty')" || admin_token=""
  unset admin_pw
  [ -n "$admin_token" ] || { err "no Keycloak admin token from ${KEYCLOAK_BASE_URL}"; exit 1; }
  realm="${KEYCLOAK_BASE_URL}/admin/realms/edcv"
  uuid="$(curl -sS --max-time 30 -H "Authorization: Bearer ${admin_token}" \
    "${realm}/clients?clientId=${CLIENT_ID}" | jq -r '.[0].id // empty')"
  # The client scripts/seed-dataplane.sh makes on compose, with this
  # environment's secret. Sent on stdin: a secret in -d would be an argument.
  body="$(jq -nc --arg id "$CLIENT_ID" --arg secret "$secret" \
    '{clientId: $id, name: "Data Plane Signaling", enabled: true, protocol: "openid-connect",
      publicClient: false, serviceAccountsEnabled: true, secret: $secret,
      standardFlowEnabled: false, directAccessGrantsEnabled: false, fullScopeAllowed: false}')"
  unset secret
  if [ -z "$uuid" ]; then
    printf '%s' "$body" | curl -sS --fail --max-time 30 -o /dev/null -X POST "${realm}/clients" \
      -H "Authorization: Bearer ${admin_token}" -H 'Content-Type: application/json' --data-binary @- ||
      { err "Keycloak refused the client ${CLIENT_ID}"; exit 1; }
    ok "Keycloak client ${CLIENT_ID} created"
  else
    # An existing client gets Key Vault's secret, so the two cannot differ.
    printf '%s' "$body" | curl -sS --fail --max-time 30 -o /dev/null -X PUT "${realm}/clients/${uuid}" \
      -H "Authorization: Bearer ${admin_token}" -H 'Content-Type: application/json' --data-binary @- ||
      { err "Keycloak refused the update of ${CLIENT_ID}"; exit 1; }
    ok "Keycloak client ${CLIENT_ID} exists; its secret is Key Vault's"
  fi
  unset body admin_token
  keycloak_login_check || { err "the read-back failed"; exit 1; }
}

# ── the app ─────────────────────────────────────────────────────────────────
wait_healthy() {
  local app="$1" rev state=""
  rev="$(az containerapp show --name "$app" --resource-group "$RG" --query properties.latestRevisionName -o tsv)"
  for _ in $(seq 1 40); do
    state="$(az containerapp revision show --name "$app" --resource-group "$RG" --revision "$rev" \
      --query properties.healthState -o tsv 2>/dev/null || echo "")"
    [ "$state" = Healthy ] && { ok "${rev} Healthy"; return 0; }
    [ "$state" = Unhealthy ] && break
    sleep 15
  done
  err "${rev} is '${state:-unknown}'. Its log:"
  err "  az containerapp logs show -n ${app} -g ${RG} --revision ${rev} --tail 80 --follow false"
  return 1
}

cmd_app() {
  [ "${DATAPLANE_AZURE_GO:-}" = "$APP" ] ||
    { err "DATAPLANE_AZURE_GO does not name ${APP}; nothing is created without a go"; exit 1; }
  local missing=0 name existed rev
  image_in_acr || { err "${IMAGE} is not in ${ACR_NAME} (23-dataplane.sh images)"; missing=1; }
  for name in "$KV_DB_PASSWORD" "$KV_SIGNING_KEY" "$KV_KAFKA_MANAGE"; do
    kv_has "$name" || { err "Key Vault has no ${name}"; missing=1; }
  done
  az postgres flexible-server db show --server-name "$PG_FLEX_NAME" --resource-group "$RG" \
    --name "$DB" -o none 2>/dev/null ||
    { err "no database ${DB} on ${PG_FLEX_NAME} (workflow dataplane-database.yml)"; missing=1; }
  [ "$missing" -eq 0 ] || { err "the app would start and fail; nothing was changed"; exit 1; }

  azure_values
  ACR_PASSWORD="$(az acr credential show --name "$ACR_NAME" --query 'passwords[0].value' -o tsv)"
  export ACR_PASSWORD
  # Not a local: the trap runs after this function has returned.
  WORK="$(umask 077 && mktemp -d)"
  trap 'rm -rf "$WORK"' EXIT
  render "$WORK" real >/dev/null
  unset ACR_PASSWORD
  existed=false
  app_exists "$APP" && existed=true
  log "putting ${APP} (${IMAGE})"
  # The ARM body by PUT, as 20-cfm-fork.sh: the containerapp extension's
  # --yaml sends a body the API refuses for an app.
  az rest --method put --only-show-errors -o none \
    --url "https://management.azure.com${ENV_ID%/providers/*}/providers/Microsoft.App/containerApps/${APP}?api-version=2024-03-01" \
    --body "@${WORK}/${APP}.json"
  # A changed Key Vault secret alone starts no revision, and a running replica
  # keeps the value it resolved at its start; a new app reads them as it
  # starts, and restarting one that is still provisioning answers 405
  # (20-cfm-fork.sh), so only an app that was there before is restarted.
  if $existed; then
    rev="$(az containerapp show --name "$APP" --resource-group "$RG" --query properties.latestRevisionName -o tsv)"
    az containerapp revision restart --name "$APP" --resource-group "$RG" --revision "$rev" -o none
  fi
  wait_healthy "$APP"
  ok "${APP} runs ${IMAGE}; next: wire, then register"
}

wire_names() {
  local what
  [ -n "${DATAPLANE_WIRE_GO:-}" ] ||
    { err "DATAPLANE_WIRE_GO names nothing (controlplane, proxy, ui); nothing is changed without a go"; exit 1; }
  for what in $DATAPLANE_WIRE_GO; do
    case "$what" in controlplane | proxy | ui) ;; *) err "unknown wire target ${what}"; exit 1 ;; esac
  done
}

# The pseudonym key as one Key Vault secret both the UI and the proxy read.
# Its first value is the key the UI uses today (its PATIENT_PSEUDONYM_KEY, or
# the NEXTAUTH_SECRET it falls back to, ui/src/lib/patient-identity.ts), so no
# pseudonym a researcher has seen changes. From then on the key no longer
# follows a rotation of NEXTAUTH_SECRET, which used to change every pseudonym.
ensure_pseudonym_key() {
  kv_has "$KV_PSEUDONYM_KEY" && return 0
  local ui_env source value
  ui_env="$(az containerapp show --name "$UI_APP" --resource-group "$RG" \
    --query "properties.template.containers[0].env" -o json)"
  source="$(UI_ENV_JSON="$ui_env" python3 -I -c '
import json, os
env = {e["name"]: e for e in json.loads(os.environ["UI_ENV_JSON"]) or []}
for name in ("PATIENT_PSEUDONYM_KEY", "NEXTAUTH_SECRET"):
    e = env.get(name)
    if e and (e.get("secretRef") or e.get("value")):
        print(name, "secret" if e.get("secretRef") else "plain", e.get("secretRef") or "")
        break')"
  [ -n "$source" ] || { err "${UI_APP} has neither PATIENT_PSEUDONYM_KEY nor NEXTAUTH_SECRET"; exit 1; }
  # shellcheck disable=SC2086
  set -- $source
  if [ "$2" = secret ]; then
    value="$(az containerapp secret show --name "$UI_APP" --resource-group "$RG" \
      --secret-name "$3" --query value -o tsv)"
  else
    value="$(az containerapp show --name "$UI_APP" --resource-group "$RG" \
      --query "properties.template.containers[0].env[?name=='$1'].value | [0]" -o tsv)"
  fi
  [ -n "$value" ] || { err "could not read ${UI_APP}'s $1"; exit 1; }
  printf '%s' "$value" | kv_put "$KV_PSEUDONYM_KEY"
  unset value
  ok "${KV_PSEUDONYM_KEY} in ${KEY_VAULT_NAME}, from ${UI_APP}'s $1 (not displayed)"
}

kv_ref() { printf 'keyvaultref:%s/secrets/%s,identityref:%s' "$KV_URI" "$1" "$KV_READER_ID"; }

cmd_wire() {
  wire_names
  azure_values
  local what
  for what in $DATAPLANE_WIRE_GO; do
    case "$what" in
      controlplane)
        # The data plane's callbacks go to the signaling API on 8182, which
        # 04-edc-services.sh never exposed: siglet answers in the response and
        # calls nothing back. Ingress is app configuration, so this starts no
        # revision and the control plane keeps running. Through --yaml, as
        # 17-siglet.sh found out (`az containerapp update` has no --set).
        log "${CONTROLPLANE_APP}: port ${CP_SIGNALING_PORT} inside the environment"
        python3 -I - "$CONTROLPLANE_APP" "$RG" "$CP_SIGNALING_PORT" <<'PY'
import json, subprocess, sys, tempfile
app, rg, port = sys.argv[1], sys.argv[2], int(sys.argv[3])
doc = json.loads(subprocess.check_output(["az", "containerapp", "show", "-n", app, "-g", rg, "-o", "json"]))
ing = doc["properties"]["configuration"]["ingress"]
maps = ing.get("additionalPortMappings") or []
if any(m.get("exposedPort") == port for m in maps):
    print(f"port {port} is already mapped")
    sys.exit(0)
ing["additionalPortMappings"] = sorted(
    maps + [{"targetPort": port, "exposedPort": port, "external": False}], key=lambda m: m["targetPort"])
# `show` returns secrets without values; sent back empty they would be wiped.
doc["properties"]["configuration"].pop("secrets", None)
for k in ("latestRevisionName", "latestReadyRevisionName", "latestRevisionFqdn",
          "outboundIpAddresses", "eventStreamEndpoint", "runningStatus", "provisioningState"):
    doc["properties"].pop(k, None)
with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
    json.dump(doc, f)
subprocess.check_call(["az", "containerapp", "update", "-n", app, "-g", rg, "--yaml", f.name, "-o", "none"])
got = json.loads(subprocess.check_output(["az", "containerapp", "show", "-n", app, "-g", rg,
    "--query", "properties.configuration.ingress.additionalPortMappings[].exposedPort", "-o", "json"]))
if port not in (got or []):
    sys.exit(f"port {port} is not mapped after the update: {got}")
print(f"ports mapped: {sorted(got)}")
PY
        ok "${CONTROLPLANE_APP}: ${CP_SIGNALING_URL}"
        ;;
      proxy)
        ensure_pseudonym_key
        # One replica (ADR-099): an SPE inbox lives in the memory of the
        # replica that opened it, and a push whose calls reach another one
        # fails. Set first, so the data plane never meets two.
        log "${NEO4J_PROXY_APP}: at most one replica (ADR-099)"
        az containerapp update --name "$NEO4J_PROXY_APP" --resource-group "$RG" \
          --max-replicas 1 -o none
        log "${NEO4J_PROXY_APP}: identity, the pseudonym key, the data plane's keys, the inbox address"
        az containerapp identity assign --name "$NEO4J_PROXY_APP" --resource-group "$RG" \
          --user-assigned "$KV_READER_ID" -o none
        az containerapp secret set --name "$NEO4J_PROXY_APP" --resource-group "$RG" \
          --secrets "${KV_PSEUDONYM_KEY}=$(kv_ref "$KV_PSEUDONYM_KEY")" -o none
        # --set-env-vars merges, so the proxy's other settings stay.
        # SPE_INBOX_PUBLIC_URL is the address the proxy writes into an inbox's
        # data address; the provider's data plane posts there, so it is the
        # address the data plane reaches the proxy on.
        az containerapp update --name "$NEO4J_PROXY_APP" --resource-group "$RG" \
          --set-env-vars "DATAPLANE_JWKS_URL=${PUBLIC_URL}/.well-known/jwks.json" \
          "SPE_INBOX_PUBLIC_URL=${PROXY_URL}" \
          "PATIENT_PSEUDONYM_KEY=secretref:${KV_PSEUDONYM_KEY}" -o none
        "${SCRIPT_DIR}/retire-stale-revisions.sh" --when-healthy "$NEO4J_PROXY_APP" ||
          warn "a stale ${NEO4J_PROXY_APP} revision is still active"
        wait_healthy "$NEO4J_PROXY_APP"
        ;;
      ui)
        ensure_pseudonym_key
        kv_has "$KV_CLIENT_SECRET" || { err "Key Vault has no ${KV_CLIENT_SECRET} (23-dataplane.sh keycloak)"; exit 1; }
        log "${UI_APP}: identity, the signaling client's secret, the pseudonym key, the data plane's address"
        az containerapp identity assign --name "$UI_APP" --resource-group "$RG" \
          --user-assigned "$KV_READER_ID" -o none
        az containerapp secret set --name "$UI_APP" --resource-group "$RG" \
          --secrets "${KV_CLIENT_SECRET}=$(kv_ref "$KV_CLIENT_SECRET")" \
          "${KV_PSEUDONYM_KEY}=$(kv_ref "$KV_PSEUDONYM_KEY")" -o none
        # What ui/src/lib/edc/provision.ts reads when the hub onboards a
        # participant; with the first two unset it registers no push data plane.
        az containerapp update --name "$UI_APP" --resource-group "$RG" \
          --set-env-vars "PUSH_DATAPLANE_URL=${PUBLIC_URL}" \
          "PUSH_DATAPLANE_CLIENT_SECRET=secretref:${KV_CLIENT_SECRET}" \
          "PUSH_DATAPLANE_TOKEN_ENDPOINT=${KC_REALM_URL}/token" \
          "PATIENT_PSEUDONYM_KEY=secretref:${KV_PSEUDONYM_KEY}" -o none
        wait_healthy "$UI_APP"
        ;;
    esac
  done
}

# The rollback of `wire` for the two apps that got settings. The pseudonym
# key stays on both: it is the value the UI used before, and taking it off the
# UI alone would be harmless, off the proxy it only matters to a push. The
# control plane's port mapping stays as well; nothing listens to it from
# outside the environment.
cmd_unwire() {
  wire_names
  local what
  for what in $DATAPLANE_WIRE_GO; do
    case "$what" in
      proxy)
        az containerapp update --name "$NEO4J_PROXY_APP" --resource-group "$RG" \
          --remove-env-vars DATAPLANE_JWKS_URL SPE_INBOX_PUBLIC_URL -o none
        ok "${NEO4J_PROXY_APP}: no DATAPLANE_JWKS_URL; the push routes answer 503"
        ;;
      ui)
        az containerapp update --name "$UI_APP" --resource-group "$RG" \
          --remove-env-vars PUSH_DATAPLANE_URL PUSH_DATAPLANE_CLIENT_SECRET PUSH_DATAPLANE_TOKEN_ENDPOINT -o none
        ok "${UI_APP}: onboarding registers no push data plane"
        ;;
      controlplane) warn "the control plane's port mapping is left as it is" ;;
    esac
  done
}

# The Management API's version, as the UI is told it (migrate-edc-to-v1.sh ui).
mgmt_version() {
  local v
  v="$(az containerapp show --name "$UI_APP" --resource-group "$RG" \
    --query "properties.template.containers[0].env[?name=='EDC_MGMT_API_VERSION'].value | [0]" -o tsv 2>/dev/null || true)"
  printf '%s' "${v:-v5}"
}

cmd_register() {
  azure_values
  app_exists "$APP" || { err "no app ${APP}; run app first"; exit 1; }
  # Both secrets reach the job as Key Vault references: the admin client's
  # (rotate-edc-admin-client-secret.sh keeps it there) and the signaling
  # client's, which goes into every registration.
  DP_JOB_ENV="KC_TOKEN_URL=${KC_REALM_URL}/token
MGMT=http://${CONTROLPLANE_APP}:8081/api/mgmt/$(mgmt_version)
PUSH_DATAPLANE_URL=${PUBLIC_URL}
PUSH_DATAPLANE_TOKEN_ENDPOINT=${KC_REALM_URL}/token
PUSH_DATAPLANE_CLIENT_ID=${CLIENT_ID}"
  DP_JOB_KV_SECRETS="ADMIN_SECRET=edc-admin-client-secret
PUSH_DATAPLANE_CLIENT_SECRET=${KV_CLIENT_SECRET}"
  dp_run_job mvhd-dataplane-register "docker.io/library/alpine:3.19" 600 \
    "apk add --no-cache bash curl jq >/dev/null 2>&1" register-in-env.sh \
    "$SCRIPT_DIR/dataplane/register-in-env.sh" "$REPO_ROOT/scripts/lib/push-dataplane.sh"
}

cmd_check_streaming() {
  azure_values
  # scripts/check-streaming-transfer.sh as on compose, with this environment's
  # addresses: PharmaCo Research AG negotiates AlphaKlinik Berlin's one-hour
  # recording and has it pushed over Event Hubs into SPE-1. With the floor at
  # `workload` SPE-1 must be running and attested first (ADR-072: it starts on
  # demand), or the transfer ends TERMINATED and says so.
  # KAFKA_CONTAINER=none: there is no broker container to inspect here.
  DP_JOB_ENV="KEYCLOAK_URL=${KEYCLOAK_INTERNAL_URL%/}
EDC_MANAGEMENT_URL=http://${CONTROLPLANE_APP}:8081/api/mgmt
EDC_MGMT_API_VERSION=$(mgmt_version)
DSP_INTERNAL_URL=http://${CONTROLPLANE_APP}:8082/api/dsp
SPE_PROXY_URL=${PROXY_URL}
KAFKA_CONTAINER=none
TOKEN_CLIENT_ID=admin
ASSET=${ASSET:-ecg-holter-hour}
PROFILES=${PROFILES:-Kafka-PUSH}
SPE_ID=${SPE_ID:-SPE-1}
TIMEOUT_SECONDS=${TIMEOUT_SECONDS:-600}"
  DP_JOB_KV_SECRETS="TOKEN_CLIENT_SECRET=edc-admin-client-secret"
  dp_run_job mvhd-dataplane-check "docker.io/library/alpine:3.19" 1500 \
    "apk add --no-cache bash curl jq python3 >/dev/null 2>&1" check-streaming-transfer.sh \
    "$REPO_ROOT/scripts/check-streaming-transfer.sh"
  # A transfer that ended badly may have left its topic: ten is the limit.
  log "event hubs in use: $(az eventhubs eventhub list --namespace-name "$EVENTHUBS_NAMESPACE" \
    --resource-group "$RG" --query "length(@)" -o tsv 2>/dev/null || echo "?") of 10"
}

# Every mode but an offline render asks Azure. An expired login (AADSTS70043
# after the conditional access hour) would make --check report every item
# MISSING, which reads as "nothing is there"; stop and say so instead.
if [[ "$MODE" != render || "${3:-}" != --offline ]]; then
  az account get-access-token --query expiresOn -o none 2>/dev/null || {
    err "az is not signed in, or its token expired: az login first"
    exit 2
  }
fi

case "$MODE" in
  --check) report ;;
  render)
    dir="${2:?render needs a directory}"
    if [ "${3:-}" = "--offline" ]; then offline_values; else azure_values; fi
    render "$dir" placeholders
    ;;
  images)
    # push-edc1-images.sh refuses a tree with uncommitted changes under
    # runtimes/edc, so the tag names the source.
    DOCKER_CONTEXT="${DOCKER_CONTEXT:-orbstack}" "$SCRIPT_DIR/push-edc1-images.sh" build dataplane
    DOCKER_CONTEXT="${DOCKER_CONTEXT:-orbstack}" "$SCRIPT_DIR/push-edc1-images.sh" push dataplane
    image_in_acr || { err "${IMAGE} is not in ${ACR_NAME} after the push"; exit 1; }
    ok "${IMAGE} in ACR"
    ;;
  secrets) cmd_secrets ;;
  eventhubs) cmd_eventhubs ;;
  keycloak) cmd_keycloak ;;
  app) cmd_app ;;
  wire) cmd_wire ;;
  unwire) cmd_unwire ;;
  register) cmd_register ;;
  check-streaming) cmd_check_streaming ;;
  *)
    err "unknown mode ${MODE}"
    sed -n '6,29p' "${BASH_SOURCE[0]}"
    exit 1
    ;;
esac
