#!/usr/bin/env bash
# =============================================================================
# Move the EDC apps on Azure to the build compose and CI run (ADR-054, #503)
# =============================================================================
#   migrate-edc-to-v018.sh check              read-only: what each app runs
#   migrate-edc-to-v018.sh backup             save every app's YAML first
#   migrate-edc-to-v018.sh app <name>         move one app
#   migrate-edc-to-v018.sh ui                 the UI asks for v5beta
#   migrate-edc-to-v018.sh rollback <name>    put one app back from its backup
#
#   <name>: controlplane | identityhub | issuerservice | dp-fhir | dp-omop
#
# Order and checks: docs/knowledge/runbooks/edc-v018-on-azure.md. In short:
# backup, then controlplane, identityhub, issuerservice, dp-fhir, dp-omop, each
# healthy before the next; then the issuer identity and the shim.
#
# Each `app` step writes one new revision with:
#   - the image jad-<x>:${JAD_VERSION} (import-jad-images.sh put it in ACR);
#   - the database <db>_v018, created beside the April one
#     (create-edc-v018-databases.sh, run as the CI identity);
#   - the settings docker-compose.jad.yml gives the service and Azure lacked.
#     Keys with a hyphen in them (ehds-participant, prefix-mapping,
#     trusted-issuer) cannot be spelled as environment variables, so they go
#     into JAVA_TOOL_OPTIONS as -D, the way the pool cap already does;
#   - for IdentityHub and IssuerService, the ports of the web contexts 0.18
#     serves and Azure never exposed (DID, STS, credentials, issuance, identity).
#
# Azure's own addressing stays: IdentityHub identity API on 7082, issuer admin
# API on the ingress port 10013. IdentityHub's credentials API, on 7082 in
# compose, therefore goes to 7085 here; 05-cfm-agents.sh points the EDC-V
# agent at it.
#
# The image's start command is kept as set-edc-log-level.sh left it (INFO, no
# colour, no OpenTelemetry agent until #418 gives Azure a collector).
#
# Needs: az (logged in, Container Apps Contributor), python3 with PyYAML.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/env.sh"

BACKUP_DIR="${MVHD_ROLLBACK_DIR:-${HOME}/.mvhd/edc-v018-rollback}"
KC_ISSUER="${KEYCLOAK_PUBLIC_URL:-https://auth.ehds.mabu.red}/realms/edcv"
ISSUER_DID="did:web:${ISSUER_APP}%3A10016:issuer"
NATS_URL="nats://${NATS_APP}:4222"

app_name() {
  case "$1" in
    controlplane) echo "$CONTROLPLANE_APP" ;;
    identityhub) echo "$IDENTITYHUB_APP" ;;
    issuerservice) echo "$ISSUER_APP" ;;
    dp-fhir) echo "$DP_FHIR_APP" ;;
    dp-omop) echo "$DP_OMOP_APP" ;;
    *) err "unknown app '$1' (controlplane, identityhub, issuerservice, dp-fhir, dp-omop)"; exit 2 ;;
  esac
}

# The settings per service, as KEY=VALUE lines. A line starting with -D goes
# into JAVA_TOOL_OPTIONS. Values from docker-compose.jad.yml, jad/identityhub.env
# and jad/issuerservice.env, hosts rewritten to the Container App names.
settings() {
  case "$1" in
    controlplane) cat <<EOF
IMAGE=${ACR_LOGIN_SERVER}/jad-controlplane:${JAD_VERSION}
DB=controlplane_v018
EDC_HOSTNAME=${CONTROLPLANE_APP}
EDC_PARTICIPANT_ID=did:web:connector
EDC_IAM_DID_WEB_USE_HTTPS=false
EDC_IAM_CREDENTIAL_REVOCATION_MIMETYPE=application/json
EDC_ENCRYPTION_AES_KEY_ALIAS=aes-key-alias
EDC_EVENTS_NATS_URL=${NATS_URL}
EDC_EVENTS_NATS_STREAM=edc-events
EDC_EVENTS_NATS_STREAM_CREATE=true
EDC_IAM_DCP_SCOPES_MEMBERSHIP_ID=membership-scope
EDC_IAM_DCP_SCOPES_MEMBERSHIP_TYPE=DEFAULT
EDC_IAM_DCP_SCOPES_MEMBERSHIP_VALUE=org.eclipse.edc.vc.type:MembershipCredential:read
EDC_IAM_DCP_SCOPES_MANUFACTURER_ID=manufacturer-scope
EDC_IAM_DCP_SCOPES_MANUFACTURER_TYPE=POLICY
EDC_IAM_DCP_SCOPES_MANUFACTURER_VALUE=org.eclipse.edc.vc.type:ManufacturerCredential:read
-Dedc.iam.dcp.scopes.manufacturer.prefix-mapping=ManufacturerCredential
-Dedc.iam.dcp.scopes.ehds-participant.id=ehds-participant-scope
-Dedc.iam.dcp.scopes.ehds-participant.type=POLICY
-Dedc.iam.dcp.scopes.ehds-participant.value=org.eclipse.edc.vc.type:EHDSParticipantCredential:read
-Dedc.iam.dcp.scopes.ehds-participant.prefix-mapping=EHDSParticipantCredential
-Dedc.iam.dcp.scopes.data-processing-purpose.id=data-processing-purpose-scope
-Dedc.iam.dcp.scopes.data-processing-purpose.type=POLICY
-Dedc.iam.dcp.scopes.data-processing-purpose.value=org.eclipse.edc.vc.type:DataProcessingPurposeCredential:read
-Dedc.iam.dcp.scopes.data-processing-purpose.prefix-mapping=DataProcessingPurposeCredential
-Dedc.iam.dcp.scopes.data-quality-label.id=data-quality-label-scope
-Dedc.iam.dcp.scopes.data-quality-label.type=POLICY
-Dedc.iam.dcp.scopes.data-quality-label.value=org.eclipse.edc.vc.type:DataQualityLabelCredential:read
-Dedc.iam.dcp.scopes.data-quality-label.prefix-mapping=DataQualityLabelCredential
-Dedc.iam.trusted-issuer.issuer.id=${ISSUER_DID}
EOF
      ;;
    identityhub) cat <<EOF
IMAGE=${ACR_LOGIN_SERVER}/jad-identity-hub:${JAD_VERSION}
DB=identityhub_v018
PORTS=7082 7083 7084 7085
EDC_HOSTNAME=${IDENTITYHUB_APP}
EDC_IAM_DID_WEB_USE_HTTPS=false
EDC_IH_IAM_PUBLICKEY_ALIAS=publickey-alias
EDC_IAM_ACCESSTOKEN_JTI_VALIDATION=true
EDC_IAM_CREDENTIAL_RENEWAL_GRACEPERIOD=86400
EDC_IAM_OAUTH2_ISSUER=${KC_ISSUER}
WEB_HTTP_PATH=/api
WEB_HTTP_IDENTITY_PATH=/api/identity
WEB_HTTP_DID_PORT=7083
WEB_HTTP_DID_PATH=/
WEB_HTTP_STS_PORT=7084
WEB_HTTP_STS_PATH=/api/sts
WEB_HTTP_CREDENTIALS_PORT=7085
WEB_HTTP_CREDENTIALS_PATH=/api/credentials
EDC_EVENTS_NATS_URL=${NATS_URL}
EDC_EVENTS_NATS_STREAM=edc-events
EDC_EVENTS_NATS_CREATE=true
EDC_EVENTS_NATS_CREATE_FORCE=false
EOF
      ;;
    issuerservice) cat <<EOF
IMAGE=${ACR_LOGIN_SERVER}/jad-issuerservice:${JAD_VERSION}
DB=issuerservice_v018
PORTS=9999 10011 10012 10015 10016
EDC_HOSTNAME=${ISSUER_APP}
EDC_IAM_DID_WEB_USE_HTTPS=false
EDC_ISSUER_STATUSLIST_SIGNING_KEY_ALIAS=statuslist-signing-key
EDC_IAM_ACCESSTOKEN_JTI_VALIDATION=true
EDC_IAM_OAUTH2_ISSUER=${KC_ISSUER}
WEB_HTTP_STS_PORT=10011
WEB_HTTP_STS_PATH=/api/sts
WEB_HTTP_ISSUANCE_PORT=10012
WEB_HTTP_ISSUANCE_PATH=/api/issuance
WEB_HTTP_IDENTITY_PORT=10015
WEB_HTTP_IDENTITY_PATH=/api/identity
WEB_HTTP_DID_PORT=10016
WEB_HTTP_DID_PATH=/
WEB_HTTP_STATUSLIST_PORT=9999
WEB_HTTP_STATUSLIST_PATH=/statuslist
MEMBERSHIP_DB=issuerservice_v018
EDC_EVENTS_NATS_URL=${NATS_URL}
EDC_EVENTS_NATS_STREAM=edc-events
EDC_EVENTS_NATS_CREATE=true
EDC_EVENTS_NATS_CREATE_FORCE=false
EOF
      ;;
    dp-fhir) cat <<EOF
IMAGE=${ACR_LOGIN_SERVER}/jad-dataplane:${JAD_VERSION}
DB=dataplane_v018
EOF
      ;;
    dp-omop) cat <<EOF
IMAGE=${ACR_LOGIN_SERVER}/jad-dataplane:${JAD_VERSION}
DB=dataplane_omop_v018
EOF
      ;;
  esac
}

show_yaml() { az containerapp show --name "$1" --resource-group "$RG" -o yaml; }
latest_rev() { az containerapp show --name "$1" --resource-group "$RG" --query properties.latestRevisionName -o tsv; }

# Apply the settings of service $2 to the saved YAML $1, in place. The
# settings go in as a file: `python3 -` reads its program from stdin, so
# piping them in would hand python the settings instead of the heredoc.
patch_yaml() {
  local spec
  spec=$(mktemp)
  settings "$2" > "$spec"
  python3 - "$1" "$PG_HOST" "$PG_PORT" "$PG_SSLMODE" "$PG_ADMIN" "$spec" <<'PY'
import sys, yaml
path, pg_host, pg_port, pg_ssl, pg_admin, spec_path = sys.argv[1:7]
spec = [l.rstrip("\n") for l in open(spec_path) if l.strip()]
with open(path) as f: doc = yaml.safe_load(f)
c = doc['properties']['template']['containers'][0]
env = {e['name']: e for e in c.get('env') or []}
props, ports = [], []
def jdbc(db): return f"jdbc:postgresql://{pg_host}:{pg_port}/{db}?sslmode={pg_ssl}"
for line in spec:
    if line.startswith('-D'):
        props.append(line); continue
    k, v = line.split('=', 1)
    if k == 'IMAGE': c['image'] = v
    elif k == 'DB': env['EDC_DATASOURCE_DEFAULT_URL'] = {'name': 'EDC_DATASOURCE_DEFAULT_URL', 'value': jdbc(v)}
    elif k == 'MEMBERSHIP_DB':
        env['EDC_DATASOURCE_MEMBERSHIP_URL'] = {'name': 'EDC_DATASOURCE_MEMBERSHIP_URL', 'value': jdbc(v)}
        env['EDC_DATASOURCE_MEMBERSHIP_USER'] = {'name': 'EDC_DATASOURCE_MEMBERSHIP_USER', 'value': pg_admin}
        env['EDC_DATASOURCE_MEMBERSHIP_PASSWORD'] = {'name': 'EDC_DATASOURCE_MEMBERSHIP_PASSWORD', 'secretRef': 'pg-flex-password'}
    elif k == 'PORTS': ports = [int(p) for p in v.split()]
    else: env[k] = {'name': k, 'value': v}
# JAVA_TOOL_OPTIONS: keep what is there (the pool cap), replace our -D keys.
jto = env.get('JAVA_TOOL_OPTIONS', {}).get('value', '')
keys = {p.split('=', 1)[0] for p in props}
kept = [t for t in jto.split() if t.split('=', 1)[0] not in keys]
env['JAVA_TOOL_OPTIONS'] = {'name': 'JAVA_TOOL_OPTIONS', 'value': ' '.join(kept + props)}
c['env'] = list(env.values())
if ports:
    ing = doc['properties']['configuration']['ingress']
    have = {m['targetPort']: m for m in ing.get('additionalPortMappings') or []}
    for p in ports:
        have.setdefault(p, {'targetPort': p, 'exposedPort': p, 'external': False})
    ing['additionalPortMappings'] = sorted(have.values(), key=lambda m: m['targetPort'])
# `show` returns secrets without values; sent back empty they would be wiped.
doc['properties']['configuration'].pop('secrets', None)
for k in ('latestRevisionName', 'latestReadyRevisionName', 'latestRevisionFqdn',
          'outboundIpAddresses', 'eventStreamEndpoint', 'runningStatus', 'provisioningState'):
    doc['properties'].pop(k, None)
with open(path, 'w') as f: yaml.safe_dump(doc, f, sort_keys=False)
PY
  rm -f "$spec"
}

wait_healthy() {
  local app="$1" rev="$2" state=""
  for _ in $(seq 1 40); do
    state=$(az containerapp revision show --name "$app" --resource-group "$RG" --revision "$rev" \
      --query "properties.healthState" -o tsv 2>/dev/null || echo "")
    [ "$state" = "Healthy" ] && { ok "${rev} Healthy"; return 0; }
    [ "$state" = "Unhealthy" ] && break
    sleep 15
  done
  err "${rev} is '${state:-unknown}' after waiting. Look at its log, then roll back:"
  err "  az containerapp logs show -n ${app} -g ${RG} --revision ${rev} --tail 80 --follow false"
  err "  $0 rollback <name>"
  return 1
}

cmd_check() {
  local short app
  for short in controlplane identityhub issuerservice dp-fhir dp-omop; do
    app=$(app_name "$short")
    az containerapp show --name "$app" --resource-group "$RG" -o json | python3 -c "
import json,sys
a=json.load(sys.stdin); c=a['properties']['template']['containers'][0]
env={e['name']:e.get('value','') for e in c.get('env') or []}
db=env.get('EDC_DATASOURCE_DEFAULT_URL','').split('/')[-1].split('?')[0]
ports=[m['targetPort'] for m in (a['properties']['configuration'].get('ingress') or {}).get('additionalPortMappings') or []]
print(f\"{a['name']:22} {c['image'].split('/')[-1]:34} db={db:22} events={'yes' if 'EDC_EVENTS_NATS_URL' in env else 'no '} ports={ports}\")"
  done
}

cmd_backup() {
  local ts dir short app
  ts=$(date -u +%Y%m%dT%H%M%SZ); dir="${BACKUP_DIR}/${ts}"
  mkdir -p "$dir"; chmod 700 "$BACKUP_DIR" "$dir"
  for short in controlplane identityhub issuerservice dp-fhir dp-omop; do
    app=$(app_name "$short")
    show_yaml "$app" > "${dir}/${short}.yaml"
  done
  show_yaml "$UI_APP" > "${dir}/ui.yaml"
  ln -sfn "$dir" "${BACKUP_DIR}/latest"
  ok "saved 6 app definitions to ${dir} (secrets are not in them; the apps keep theirs)"
}

cmd_app() {
  local short="$1" app yaml rev_before rev_after
  app=$(app_name "$short")
  [ -f "${BACKUP_DIR}/latest/${short}.yaml" ] || { err "no backup of ${short}; run '$0 backup' first"; exit 1; }
  log "Moving ${app} to ${JAD_VERSION}"
  yaml=$(mktemp); show_yaml "$app" > "$yaml"
  patch_yaml "$yaml" "$short"
  rev_before=$(latest_rev "$app")
  az containerapp update --name "$app" --resource-group "$RG" --yaml "$yaml" -o none
  rm -f "$yaml"
  rev_after=$(latest_rev "$app")
  [ "$rev_before" != "$rev_after" ] || { err "no new revision for ${app}"; exit 1; }
  wait_healthy "$app" "$rev_after"
}

cmd_ui() {
  log "UI: EDC_MGMT_API_VERSION=v5beta"
  az containerapp update --name "$UI_APP" --resource-group "$RG" \
    --set-env-vars "EDC_MGMT_API_VERSION=v5beta" -o none
  wait_healthy "$UI_APP" "$(latest_rev "$UI_APP")"
}

cmd_rollback() {
  local short="$1" app yaml
  if [ "$short" = ui ]; then app="$UI_APP"; else app=$(app_name "$short"); fi
  [ -f "${BACKUP_DIR}/latest/${short}.yaml" ] || { err "no backup of ${short} in ${BACKUP_DIR}/latest"; exit 1; }
  yaml=$(mktemp); cp "${BACKUP_DIR}/latest/${short}.yaml" "$yaml"
  python3 - "$yaml" <<'PY'
import sys, yaml
p = sys.argv[1]; doc = yaml.safe_load(open(p))
doc['properties']['configuration'].pop('secrets', None)
for k in ('latestRevisionName', 'latestReadyRevisionName', 'latestRevisionFqdn',
          'outboundIpAddresses', 'eventStreamEndpoint', 'runningStatus', 'provisioningState'):
    doc['properties'].pop(k, None)
yaml.safe_dump(doc, open(p, 'w'), sort_keys=False)
PY
  log "Rolling ${app} back to its saved definition"
  az containerapp update --name "$app" --resource-group "$RG" --yaml "$yaml" -o none
  rm -f "$yaml"
  wait_healthy "$app" "$(latest_rev "$app")"
}

case "${1:-}" in
  check) cmd_check ;;
  backup) cmd_backup ;;
  app) cmd_app "${2:?name}" ;;
  ui) cmd_ui ;;
  rollback) cmd_rollback "${2:?name}" ;;
  *) sed -n '2,12p' "$0"; exit 2 ;;
esac
