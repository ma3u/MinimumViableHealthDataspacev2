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
  --ingress internal --target-port 4222 \
  -o none
ok "NATS container app"

# ── Control Plane ────────────────────────────────────────────────────────────
log "Creating Control Plane container app..."
az containerapp create \
  --name "$CONTROLPLANE_APP" --resource-group "$RG" --environment "$ACA_ENV" \
  --image "$CONTROLPLANE_IMAGE" \
  --registry-server "$ACR_LOGIN_SERVER" \
  --registry-username "$ACR_NAME" \
  --registry-password "$ACR_PASSWORD" \
  --cpu 1 --memory 2Gi \
  --min-replicas 1 --max-replicas 1 \
  --ingress internal --target-port 8081 \
  --env-vars \
    "EDC_DATASOURCE_DEFAULT_URL=jdbc:postgresql://${PG_HOST}:${PG_PORT}/controlplane" \
    "EDC_DATASOURCE_DEFAULT_USER=${PG_ADMIN}" \
    "EDC_DATASOURCE_DEFAULT_PASSWORD=${PG_PASSWORD}" \
    "EDC_DSP_CALLBACK_ADDRESS=${CONTROLPLANE_URL:-}" \
    "EDC_VAULT_HASHICORP_URL=${VAULT_URL:-}" \
    "EDC_VAULT_HASHICORP_TOKEN=${VAULT_ROOT_TOKEN}" \
    "EDC_EVENTS_NATS_URL=${NATS_URL:-}" \
    "WEB_HTTP_PORT=8081" \
    "WEB_HTTP_PATH=/api" \
    "WEB_HTTP_MANAGEMENT_PORT=8081" \
    "WEB_HTTP_MANAGEMENT_PATH=/management" \
    "WEB_HTTP_DSP_PORT=8081" \
    "WEB_HTTP_DSP_PATH=/api/dsp" \
  -o none
ok "Control Plane"

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
    "WEB_HTTP_PORT=10013" \
  -o none
ok "Issuer Service"

# ── Neo4j Proxy ──────────────────────────────────────────────────────────────
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
