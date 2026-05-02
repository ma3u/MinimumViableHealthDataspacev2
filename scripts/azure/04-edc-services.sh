#!/usr/bin/env bash
# Phase 4: EDC-V core services — controlplane, dataplanes, identity hub, issuer.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/env.sh"
eval "$(get_aca_fqdns)"

log "Phase 4: EDC-V core services"

# Workaround B (ADR-018): PG_HOST exported by env.sh (mvhd-postgres short name)
az acr login --name "$ACR_NAME"
ACR_PASSWORD=$(az acr credential show --name "$ACR_NAME" --query "passwords[0].value" -o tsv)

# ── Push NATS image ─────────────────────────────────────────────────────────
log "Pulling and pushing NATS image..."
docker pull --platform linux/amd64 nats:alpine
docker tag nats:alpine "${NATS_IMAGE}"
docker push "${NATS_IMAGE}"
ok "NATS image in ACR"

# ── NATS container app ──────────────────────────────────────────────────────
log "Creating NATS container app..."
az containerapp create \
  --name "$NATS_APP" --resource-group "$RG" --environment "$ACA_ENV" \
  --image "$NATS_IMAGE" \
  --registry-server "$ACR_LOGIN_SERVER" \
  --registry-username "$ACR_NAME" \
  --registry-password "$ACR_PASSWORD" \
  --cpu 0.25 --memory 0.5Gi \
  --min-replicas 1 --max-replicas 1 \
  --ingress internal --target-port 4222 --exposed-port 4222 --transport tcp \
  -o none
ok "NATS container app"

# ── Control Plane (multi-port — issue #25 resolved 2026-05-02) ──────────────
# EDC's control plane needs four distinct Jetty web ports — collapsing them
# all onto one port triggers `IllegalArgumentException: A binding for port X
# already exists` from Jetty's PortMappingRegistry. ACA exposes additional
# ports via `additionalPortMappings` on the ingress; we set the main
# targetPort to 8080 (web/health endpoints, matches local docker-compose) and
# add 8081 (mgmt) / 8082 (protocol-DSP) / 8083 (control-API) as additional
# port mappings via a YAML patch right after create.
log "Creating Control Plane container app..."
az containerapp create \
  --name "$CONTROLPLANE_APP" --resource-group "$RG" --environment "$ACA_ENV" \
  --image "$CONTROLPLANE_IMAGE" \
  --registry-server "$ACR_LOGIN_SERVER" \
  --registry-username "$ACR_NAME" \
  --registry-password "$ACR_PASSWORD" \
  --cpu 1 --memory 2Gi \
  --min-replicas 1 --max-replicas 1 \
  --ingress internal --target-port 8080 \
  --env-vars \
    "EDC_DATASOURCE_DEFAULT_URL=jdbc:postgresql://${PG_HOST}:${PG_PORT}/controlplane" \
    "EDC_DATASOURCE_DEFAULT_USER=${PG_ADMIN}" \
    "EDC_DATASOURCE_DEFAULT_PASSWORD=${PG_PASSWORD}" \
    "EDC_SQL_SCHEMA_AUTOCREATE=true" \
    "EDC_DSP_CALLBACK_ADDRESS=http://${CONTROLPLANE_APP}:8082/api/dsp" \
    "EDC_VAULT_HASHICORP_URL=${VAULT_URL:-}" \
    "EDC_VAULT_HASHICORP_TOKEN=${VAULT_ROOT_TOKEN}" \
    "EDC_NATS_CN_SUBSCRIBER_URL=nats://${NATS_APP}:4222" \
    "EDC_NATS_CN_SUBSCRIBER_AUTOCREATE=true" \
    "EDC_NATS_CN_PUBLISHER_URL=nats://${NATS_APP}:4222" \
    "EDC_NATS_TP_SUBSCRIBER_URL=nats://${NATS_APP}:4222" \
    "EDC_NATS_TP_SUBSCRIBER_AUTOCREATE=true" \
    "EDC_NATS_TP_PUBLISHER_URL=nats://${NATS_APP}:4222" \
    "EDC_IAM_OAUTH2_JWKS_URL=${KEYCLOAK_PUBLIC_URL:-}/realms/edcv/protocol/openid-connect/certs" \
    "WEB_HTTP_PORT=8080" \
    "WEB_HTTP_PATH=/api" \
    "WEB_HTTP_MANAGEMENT_PORT=8081" \
    "WEB_HTTP_MANAGEMENT_PATH=/api/mgmt" \
    "WEB_HTTP_PROTOCOL_PORT=8082" \
    "WEB_HTTP_PROTOCOL_PATH=/api/dsp" \
    "WEB_HTTP_CONTROL_PORT=8083" \
    "WEB_HTTP_CONTROL_PATH=/api/control" \
  -o none

log "Patching Control Plane with additionalPortMappings (8081 mgmt, 8082 dsp, 8083 control)..."
CP_YAML=$(mktemp)
az containerapp show --name "$CONTROLPLANE_APP" --resource-group "$RG" -o yaml > "$CP_YAML"
python3 - "$CP_YAML" <<'PY'
import sys, yaml
path = sys.argv[1]
with open(path) as f: d = yaml.safe_load(f)
d['properties']['configuration']['ingress']['additionalPortMappings'] = [
    {'targetPort': 8081, 'exposedPort': 8081, 'external': False},
    {'targetPort': 8082, 'exposedPort': 8082, 'external': False},
    {'targetPort': 8083, 'exposedPort': 8083, 'external': False},
]
with open(path, 'w') as f: yaml.safe_dump(d, f, sort_keys=False)
PY
az containerapp update --name "$CONTROLPLANE_APP" --resource-group "$RG" --yaml "$CP_YAML" -o none
rm -f "$CP_YAML"
ok "Control Plane (multi-port)"

# NATS needs JetStream enabled — controlplane's NatsContractNegotiationSubscriber
# refuses to start without it ("Timeout waiting for NATS JetStream server").
log "Enabling JetStream on NATS (-js -m 8222)..."
NATS_YAML=$(mktemp)
az containerapp show --name "$NATS_APP" --resource-group "$RG" -o yaml > "$NATS_YAML"
python3 - "$NATS_YAML" <<'PY'
import sys, yaml
path = sys.argv[1]
with open(path) as f: d = yaml.safe_load(f)
d['properties']['template']['containers'][0]['args'] = ['-js', '-m', '8222']
with open(path, 'w') as f: yaml.safe_dump(d, f, sort_keys=False)
PY
az containerapp update --name "$NATS_APP" --resource-group "$RG" --yaml "$NATS_YAML" -o none
rm -f "$NATS_YAML"
ok "NATS (JetStream enabled)"

# ── Data Plane FHIR ─────────────────────────────────────────────────────────
log "Creating Data Plane FHIR container app..."
az containerapp create \
  --name "$DP_FHIR_APP" --resource-group "$RG" --environment "$ACA_ENV" \
  --image "$DP_FHIR_IMAGE" \
  --registry-server "$ACR_LOGIN_SERVER" \
  --registry-username "$ACR_NAME" \
  --registry-password "$ACR_PASSWORD" \
  --cpu 0.5 --memory 1Gi \
  --min-replicas 1 --max-replicas 1 \
  --ingress internal --target-port 11002 \
  --env-vars \
    "EDC_DATASOURCE_DEFAULT_URL=jdbc:postgresql://${PG_HOST}:${PG_PORT}/dataplane" \
    "EDC_DATASOURCE_DEFAULT_USER=${PG_ADMIN}" \
    "EDC_DATASOURCE_DEFAULT_PASSWORD=${PG_PASSWORD}" \
    "EDC_VAULT_HASHICORP_URL=${VAULT_URL:-}" \
    "EDC_VAULT_HASHICORP_TOKEN=${VAULT_ROOT_TOKEN}" \
    "WEB_HTTP_PORT=11002" \
    "WEB_HTTP_PUBLIC_PORT=11002" \
    "WEB_HTTP_PUBLIC_PATH=/api/public" \
    "WEB_HTTP_CONTROL_PORT=11002" \
    "WEB_HTTP_CONTROL_PATH=/api/control" \
  -o none
ok "Data Plane FHIR"

# ── Data Plane OMOP ─────────────────────────────────────────────────────────
log "Creating Data Plane OMOP container app..."
az containerapp create \
  --name "$DP_OMOP_APP" --resource-group "$RG" --environment "$ACA_ENV" \
  --image "$DP_OMOP_IMAGE" \
  --registry-server "$ACR_LOGIN_SERVER" \
  --registry-username "$ACR_NAME" \
  --registry-password "$ACR_PASSWORD" \
  --cpu 0.5 --memory 1Gi \
  --min-replicas 1 --max-replicas 1 \
  --ingress internal --target-port 11012 \
  --env-vars \
    "EDC_DATASOURCE_DEFAULT_URL=jdbc:postgresql://${PG_HOST}:${PG_PORT}/dataplane_omop" \
    "EDC_DATASOURCE_DEFAULT_USER=${PG_ADMIN}" \
    "EDC_DATASOURCE_DEFAULT_PASSWORD=${PG_PASSWORD}" \
    "EDC_VAULT_HASHICORP_URL=${VAULT_URL:-}" \
    "EDC_VAULT_HASHICORP_TOKEN=${VAULT_ROOT_TOKEN}" \
    "WEB_HTTP_PORT=11012" \
    "WEB_HTTP_PUBLIC_PORT=11012" \
    "WEB_HTTP_PUBLIC_PATH=/api/public" \
    "WEB_HTTP_CONTROL_PORT=11012" \
    "WEB_HTTP_CONTROL_PATH=/api/control" \
  -o none
ok "Data Plane OMOP"

# ── Identity Hub ─────────────────────────────────────────────────────────────
log "Creating Identity Hub container app..."
az containerapp create \
  --name "$IDENTITYHUB_APP" --resource-group "$RG" --environment "$ACA_ENV" \
  --image "$IDENTITYHUB_IMAGE" \
  --registry-server "$ACR_LOGIN_SERVER" \
  --registry-username "$ACR_NAME" \
  --registry-password "$ACR_PASSWORD" \
  --cpu 0.5 --memory 1Gi \
  --min-replicas 1 --max-replicas 1 \
  --ingress internal --target-port 7081 \
  --env-vars \
    "EDC_DATASOURCE_DEFAULT_URL=jdbc:postgresql://${PG_HOST}:${PG_PORT}/identityhub" \
    "EDC_DATASOURCE_DEFAULT_USER=${PG_ADMIN}" \
    "EDC_DATASOURCE_DEFAULT_PASSWORD=${PG_PASSWORD}" \
    "EDC_VAULT_HASHICORP_URL=${VAULT_URL:-}" \
    "EDC_VAULT_HASHICORP_TOKEN=${VAULT_ROOT_TOKEN}" \
    "EDC_IAM_OAUTH2_JWKS_URL=${KEYCLOAK_PUBLIC_URL:-}/realms/edcv/protocol/openid-connect/certs" \
    "WEB_HTTP_PORT=7081" \
    "WEB_HTTP_IDENTITY_PORT=7082" \
  -o none
ok "Identity Hub"

# ── Issuer Service ───────────────────────────────────────────────────────────
log "Creating Issuer Service container app..."
az containerapp create \
  --name "$ISSUER_APP" --resource-group "$RG" --environment "$ACA_ENV" \
  --image "$ISSUER_IMAGE" \
  --registry-server "$ACR_LOGIN_SERVER" \
  --registry-username "$ACR_NAME" \
  --registry-password "$ACR_PASSWORD" \
  --cpu 0.5 --memory 1Gi \
  --min-replicas 1 --max-replicas 1 \
  --ingress internal --target-port 10013 \
  --env-vars \
    "EDC_DATASOURCE_DEFAULT_URL=jdbc:postgresql://${PG_HOST}:${PG_PORT}/issuerservice" \
    "EDC_DATASOURCE_DEFAULT_USER=${PG_ADMIN}" \
    "EDC_DATASOURCE_DEFAULT_PASSWORD=${PG_PASSWORD}" \
    "EDC_VAULT_HASHICORP_URL=${VAULT_URL:-}" \
    "EDC_VAULT_HASHICORP_TOKEN=${VAULT_ROOT_TOKEN}" \
    "EDC_IAM_OAUTH2_JWKS_URL=${KEYCLOAK_PUBLIC_URL:-}/realms/edcv/protocol/openid-connect/certs" \
    "WEB_HTTP_PORT=10013" \
  -o none
ok "Issuer Service"

# ── Neo4j Proxy ──────────────────────────────────────────────────────────────
# TCK_* vars point the /tck endpoint at ACA-internal FQDNs. Without them the
# proxy falls back to Docker hostnames (controlplane, identityhub, …) that
# don't resolve in ACA, and every DSP/DCP test fails with "unreachable".
# TCK_CONTROLPLANE_MGMT_URL overrides the default /api/mgmt path because the
# controlplane on ACA is started with WEB_HTTP_MANAGEMENT_PATH=/management.
log "Creating Neo4j Proxy container app..."
az containerapp create \
  --name "$NEO4J_PROXY_APP" --resource-group "$RG" --environment "$ACA_ENV" \
  --image "$NEO4J_PROXY_IMAGE" \
  --registry-server "$ACR_LOGIN_SERVER" \
  --registry-username "$ACR_NAME" \
  --registry-password "$ACR_PASSWORD" \
  --cpu 0.25 --memory 0.5Gi \
  --min-replicas 1 --max-replicas 1 \
  --ingress internal --target-port 9090 \
  --env-vars \
    "NEO4J_URI=bolt://${NEO4J_APP}:7687" \
    "NEO4J_ENCRYPTED=false" \
    "NEO4J_USER=${NEO4J_USER}" \
    "NEO4J_PASSWORD=${NEO4J_PASSWORD}" \
    "PORT=9090" \
    "TCK_KEYCLOAK_URL=${KEYCLOAK_PUBLIC_URL:-}" \
    "TCK_KEYCLOAK_REALM=edcv" \
    "TCK_CLIENT_ID=admin" \
    "TCK_CLIENT_SECRET=edc-v-admin-secret" \
    "TCK_CONTROLPLANE_DEFAULT_URL=https://${CONTROLPLANE_APP}.internal.${ACA_DOMAIN}" \
    "TCK_CONTROLPLANE_MGMT_URL=https://${CONTROLPLANE_APP}.internal.${ACA_DOMAIN}/management" \
    "TCK_IDENTITY_URL=https://${IDENTITYHUB_APP}.internal.${ACA_DOMAIN}/api/identity" \
    "TCK_ISSUER_URL=https://${ISSUER_APP}.internal.${ACA_DOMAIN}/api/admin" \
    "TCK_INFRA_OPTIONAL=true" \
  -o none
ok "Neo4j Proxy"

# ── Summary ──────────────────────────────────────────────────────────────────
log "EDC-V services complete"
echo "  NATS:         ${NATS_APP}"
echo "  Control Plane:${CONTROLPLANE_APP}"
echo "  DP FHIR:      ${DP_FHIR_APP}"
echo "  DP OMOP:      ${DP_OMOP_APP}"
echo "  Identity Hub: ${IDENTITYHUB_APP}"
echo "  Issuer:       ${ISSUER_APP}"
echo "  Neo4j Proxy:  ${NEO4J_PROXY_APP}"
