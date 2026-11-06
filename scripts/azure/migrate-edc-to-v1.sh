#!/usr/bin/env bash
# =============================================================================
# Move the EDC apps on Azure from 0.18 to the 1.0 launchers (#881, ADR-078)
# =============================================================================
#   migrate-edc-to-v1.sh check              read-only: what each app runs
#   migrate-edc-to-v1.sh backup             save every app's YAML first
#   migrate-edc-to-v1.sh app <name>         move one EDC app to 1.0
#   migrate-edc-to-v1.sh siglet             siglet 0.1.6, serving through the proxy
#   migrate-edc-to-v1.sh proxy              /dataspace/data checks siglet's tokens
#   migrate-edc-to-v1.sh ui                 the hub provisions and pulls on 1.0
#   migrate-edc-to-v1.sh rollback <name>    put one app back from its backup
#
#   <name>: controlplane | identityhub | issuerservice
#           (rollback: also siglet, proxy, ui, dp-fhir, dp-omop)
#
# Order, gates and the rollback: docs/knowledge/runbooks/edc-1-on-azure.md.
# In short: backup; Keycloak scopes; the _v1 databases (workflow
# edc-v1-databases.yml, as the CI identity); controlplane, identityhub,
# issuerservice, each healthy before the next; siglet; the UI and the proxy
# from the 1.0 branch; then the seeds.
#
# Each `app` step writes one new revision of the app as it runs on 0.18
# (migrate-edc-to-v018.sh gave it its settings) with:
#   - the launcher image mvhd-edc-<x>:${EDC1_TAG} (push-edc1-images.sh);
#   - the database <db>_v1; the 0.18 database stays untouched for a rollback;
#   - what 1.0 reads differently: `prefix.mapping` where 0.18 read
#     `prefix-mapping`, and policy validation on (the launcher's
#     EhdsPolicyVocabularyExtension declares the EHDS terms, ADR-078).
# The 0.18 NATS settings stay; the launchers carry no NATS extension and
# ignore them.
#
# Needs: az (logged in, Container Apps Contributor), python3 with PyYAML,
# EDC1_TAG (push-edc1-images.sh prints it).
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=env.sh
source "${SCRIPT_DIR}/env.sh"

BACKUP_DIR="${MVHD_ROLLBACK_DIR:-${HOME}/.mvhd/edc-v1-rollback}"
EDC1_TAG="${EDC1_TAG:-}"
ISSUER_DID="did:web:${ISSUER_APP}%3A10016:issuer"

# The proxy's internal address, from the environment's domain (env.sh).
proxy_url() {
  eval "$(get_aca_fqdns)"
  [ -n "${NEO4J_PROXY_URL:-}" ] || { err "no ACA domain, so no proxy address"; exit 1; }
}

app_name() {
  case "$1" in
    controlplane) echo "$CONTROLPLANE_APP" ;;
    identityhub) echo "$IDENTITYHUB_APP" ;;
    issuerservice) echo "$ISSUER_APP" ;;
    siglet) echo "$SIGLET_APP" ;;
    ui) echo "$UI_APP" ;;
    proxy) echo "$NEO4J_PROXY_APP" ;;
    dp-fhir) echo "$DP_FHIR_APP" ;;
    dp-omop) echo "$DP_OMOP_APP" ;;
    *) err "unknown app '$1' (controlplane, identityhub, issuerservice, siglet, ui)"; exit 2 ;;
  esac
}
BACKED_UP=(controlplane identityhub issuerservice siglet ui proxy dp-fhir dp-omop)

need_tag() {
  [ -n "$EDC1_TAG" ] || { err "set EDC1_TAG to the tag push-edc1-images.sh pushed"; exit 2; }
}

# The settings per service, as KEY=VALUE lines. A line starting with -D goes
# into JAVA_TOOL_OPTIONS; UNSET=<name> removes that variable. Values from
# docker-compose.jad.yml and docker-compose.edc1.yml, the stack the suites
# passed on locally (#881).
settings() {
  case "$1" in
    controlplane) cat <<EOF
IMAGE=${ACR_LOGIN_SERVER}/mvhd-edc-controlplane:${EDC1_TAG}
DB=controlplane_v1
EDC_POLICY_VALIDATION_ENABLED=true
-Dedc.iam.dcp.scopes.manufacturer.prefix.mapping=ManufacturerCredential
-Dedc.iam.dcp.scopes.ehds-participant.prefix.mapping=EHDSParticipantCredential
-Dedc.iam.dcp.scopes.data-processing-purpose.prefix.mapping=DataProcessingPurposeCredential
-Dedc.iam.dcp.scopes.data-quality-label.prefix.mapping=DataQualityLabelCredential
EOF
      ;;
    identityhub) cat <<EOF
IMAGE=${ACR_LOGIN_SERVER}/mvhd-edc-identity-hub:${EDC1_TAG}
DB=identityhub_v1
EOF
      ;;
    issuerservice) cat <<EOF
IMAGE=${ACR_LOGIN_SERVER}/mvhd-edc-issuerservice:${EDC1_TAG}
DB=issuerservice_v1
MEMBERSHIP_DB=issuerservice_v1
EOF
      ;;
  esac
}

show_yaml() { az containerapp show --name "$1" --resource-group "$RG" -o yaml; }
latest_rev() { az containerapp show --name "$1" --resource-group "$RG" --query properties.latestRevisionName -o tsv; }

# Apply the settings of service $2 to the saved YAML $1, in place. The
# settings go in as a file: `python3 -` reads its program from stdin.
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
props = []
def jdbc(db): return f"jdbc:postgresql://{pg_host}:{pg_port}/{db}?sslmode={pg_ssl}"
for line in spec:
    if line.startswith('-D'):
        props.append(line); continue
    k, v = line.split('=', 1)
    if k == 'IMAGE':
        c['image'] = v
        # The 0.18 apps start JAD's jar by name in `args` or `command`
        # (edc-controlplane.jar, ...), which the 1.0 launcher does not have:
        # "Unable to access jarfile" (2026-11-06). Both are set, so an update
        # cannot keep the old one; the line is the image's own CMD.
        c['command'] = ['sh', '-c']
        c['args'] = ['exec java -Djava.security.egd=file:/dev/urandom ${JAVA_OPTS:-} -jar edc-runtime.jar']
    elif k == 'DB': env['EDC_DATASOURCE_DEFAULT_URL'] = {'name': 'EDC_DATASOURCE_DEFAULT_URL', 'value': jdbc(v)}
    elif k == 'MEMBERSHIP_DB':
        env['EDC_DATASOURCE_MEMBERSHIP_URL'] = {'name': 'EDC_DATASOURCE_MEMBERSHIP_URL', 'value': jdbc(v)}
        env['EDC_DATASOURCE_MEMBERSHIP_USER'] = {'name': 'EDC_DATASOURCE_MEMBERSHIP_USER', 'value': pg_admin}
        env['EDC_DATASOURCE_MEMBERSHIP_PASSWORD'] = {'name': 'EDC_DATASOURCE_MEMBERSHIP_PASSWORD', 'secretRef': 'pg-flex-password'}
    elif k == 'UNSET': env.pop(v, None)
    else: env[k] = {'name': k, 'value': v}
# JAVA_TOOL_OPTIONS: keep what is there (the pool cap, the scopes, the trusted
# issuer), drop the 0.18 spelling `prefix-mapping`, replace our -D keys.
# The trusted issuer moves to `edc.iam.trustedissuer`: 0.18 still read the
# deprecated `trusted-issuer`, which Azure kept (#754 changed only the
# script), and 1.0 does not, so it trusted no issuer and every DSP request
# between participants answered 401 (2026-11-06).
jto = env.get('JAVA_TOOL_OPTIONS', {}).get('value', '')
jto = jto.replace('-Dedc.iam.trusted-issuer.', '-Dedc.iam.trustedissuer.')
keys = {p.split('=', 1)[0] for p in props}
kept = [t for t in jto.split()
        if t.split('=', 1)[0] not in keys and '.prefix-mapping=' not in t]
env['JAVA_TOOL_OPTIONS'] = {'name': 'JAVA_TOOL_OPTIONS', 'value': ' '.join(kept + props)}
c['env'] = list(env.values())
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
  for short in controlplane identityhub issuerservice siglet ui proxy; do
    app=$(app_name "$short")
    az containerapp show --name "$app" --resource-group "$RG" -o json | python3 -c "
import json,sys
a=json.load(sys.stdin); c=a['properties']['template']['containers'][0]
env={e['name']:e.get('value','') for e in c.get('env') or []}
db=env.get('EDC_DATASOURCE_DEFAULT_URL','').split('/')[-1].split('?')[0] or '-'
extra=' '.join(f'{k}={env[k]}' for k in ('EDC_MGMT_API_VERSION','EDR_DATA_URL') if k in env)
print(f\"{a['name']:20} {c['image'].split('/')[-1]:44} db={db:18} {extra}\")"
  done
}

cmd_backup() {
  local ts dir short
  ts=$(date -u +%Y%m%dT%H%M%SZ); dir="${BACKUP_DIR}/${ts}"
  mkdir -p "$dir"; chmod 700 "$BACKUP_DIR" "$dir"
  for short in "${BACKED_UP[@]}"; do
    show_yaml "$(app_name "$short")" > "${dir}/${short}.yaml"
  done
  ln -sfn "$dir" "${BACKUP_DIR}/latest"
  ok "saved ${#BACKED_UP[@]} app definitions to ${dir} (secrets are not in them; the apps keep theirs)"
}

cmd_app() {
  local short="$1" app yaml rev_before rev_after
  case "$short" in controlplane | identityhub | issuerservice) ;; *) err "app takes controlplane, identityhub or issuerservice"; exit 2 ;; esac
  need_tag
  app=$(app_name "$short")
  [ -f "${BACKUP_DIR}/latest/${short}.yaml" ] || { err "no backup of ${short}; run '$0 backup' first"; exit 1; }
  log "Moving ${app} to ${EDC1_TAG}"
  yaml=$(mktemp); show_yaml "$app" > "$yaml"
  patch_yaml "$yaml" "$short"
  rev_before=$(latest_rev "$app")
  az containerapp update --name "$app" --resource-group "$RG" --yaml "$yaml" -o none
  rm -f "$yaml"
  rev_after=$(latest_rev "$app")
  [ "$rev_before" != "$rev_after" ] || { err "no new revision for ${app}"; exit 1; }
  wait_healthy "$app" "$rev_after"
}

cmd_siglet() {
  # 17-siglet.sh with the 1.0 pin, the 1.0 transfer types and a fresh
  # database: a siglet refuses a database a newer build migrated, so the
  # 0.18 one stays as it was for the rollback. The pull endpoint is the
  # proxy's /dataspace/data, which checks siglet's token (ADR-078 decision 5).
  [ -f "${BACKUP_DIR}/latest/siglet.yaml" ] || { err "no backup of siglet; run '$0 backup' first"; exit 1; }
  proxy_url
  SIGLET_COMPOSE=docker-compose.edc1.yml SIGLET_TOML=jad/siglet-edc1.toml \
    SIGLET_DB=siglet_v1 SIGLET_PULL_ENDPOINT="${NEO4J_PROXY_URL}/dataspace/data" \
    "${SCRIPT_DIR}/17-siglet.sh"
}

cmd_proxy() {
  # The proxy's /dataspace/data verifies the consumer's token against
  # siglet's JWKS (services/neo4j-proxy/src/dataspace-token.ts). The route
  # comes with the 1.0 branch's proxy image (deploy-azure.yml on merge).
  [ -f "${BACKUP_DIR}/latest/proxy.yaml" ] || { err "no backup of proxy; run '$0 backup' first"; exit 1; }
  log "proxy: siglet's JWKS and issuer"
  az containerapp update --name "$NEO4J_PROXY_APP" --resource-group "$RG" \
    --set-env-vars "SIGLET_JWKS_URL=http://${SIGLET_APP}/keys" "SIGLET_ISSUER=siglet-issuer" -o none
  wait_healthy "$NEO4J_PROXY_APP" "$(latest_rev "$NEO4J_PROXY_APP")"
}

cmd_ui() {
  # Where lib/edc/provision.ts and lib/transfer-data.ts find the 1.0 services
  # on Azure. The UI image itself is the 1.0 branch's, deployed by merging it
  # into main (deploy-azure.yml); these settings are what that image reads.
  [ -f "${BACKUP_DIR}/latest/ui.yaml" ] || { err "no backup of ui; run '$0 backup' first"; exit 1; }
  proxy_url
  log "UI: Management API v5, 1.0 provisioning addresses, data through the proxy"
  az containerapp update --name "$UI_APP" --resource-group "$RG" \
    --set-env-vars "EDC_MGMT_API_VERSION=v5" \
    "EDC_DID_BASE=did:web:${IDENTITYHUB_APP}%3A7083" \
    "EDC_CREDENTIAL_SERVICE_BASE=http://${IDENTITYHUB_APP}:7085/api/credentials/v1/participants" \
    "EDC_PROTOCOL_BASE=http://${CONTROLPLANE_APP}:8082/api/dsp" \
    "EDC_STS_TOKEN_URL=http://${IDENTITYHUB_APP}:7084/api/sts/token" \
    "EDC_ISSUER_DID=${ISSUER_DID}" \
    "SIGLET_SIGNALING_URL=http://${SIGLET_APP}:8081/api/v1" \
    "SIGLET_TOKEN_URL=http://${SIGLET_APP}" \
    "EDR_DATA_URL=${NEO4J_PROXY_URL}/dataspace/data" \
    "EDR_DATA_HOSTS=${NEO4J_PROXY_URL#https://}" -o none
  wait_healthy "$UI_APP" "$(latest_rev "$UI_APP")"
}

cmd_rollback() {
  local short="$1" app yaml
  app=$(app_name "$short")
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
  siglet) cmd_siglet ;;
  proxy) cmd_proxy ;;
  ui) cmd_ui ;;
  rollback) cmd_rollback "${2:?name}" ;;
  *) sed -n '5,14p' "$0"; exit 2 ;;
esac
