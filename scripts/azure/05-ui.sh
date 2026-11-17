#!/usr/bin/env bash
# Phase 5: the Next.js UI, mvhd-ui.
#
# deploy-azure.yml only updates mvhd-ui (image and some settings) on every
# merge to main; it cannot create it. 05-cfm-ui.sh did, together with the
# 2026-03 CFM managers, and left with them (#927), so a build from nothing had
# no step that made the UI at all (rebuild rehearsal, #927). This is that
# step, with what the app needs on EDC 1.0 and nothing CFM's.
#
# Needs: the UI image in ACR (build-images.sh, or deploy-azure.yml on the
# hub), 04-edc-services.sh run, KV_READER_IDENTITY (01-foundation.sh). After
# it, in this order: rotate-keycloak-ui-client-secret.sh and
# rotate-edc-admin-client-secret.sh (the two client secrets, by keyvaultref),
# then migrate-edc-to-v1.sh ui (the 1.0 addresses).
#
# NEXTAUTH_SECRET signs the session cookie, so whoever has it can forge any
# session (#349). Pass the one GitHub holds (secrets.NEXTAUTH_SECRET) to keep
# the two equal on the hub; otherwise a fresh one is generated. It is never
# printed.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/env.sh"
eval "$(get_aca_fqdns)"

log "Phase 5: UI"
[ -n "${ACA_DOMAIN:-}" ] || { err "no ACA environment in ${RG}; run 01-foundation.sh first"; exit 1; }
az containerapp show --name "$NEO4J_PROXY_APP" --resource-group "$RG" -o none 2>/dev/null ||
  { err "${NEO4J_PROXY_APP} does not exist; run 04-edc-services.sh first"; exit 1; }

az acr login --name "$ACR_NAME" >/dev/null
ACR_PASSWORD=$(az acr credential show --name "$ACR_NAME" --query "passwords[0].value" -o tsv)
IDENTITY_ID=$(az identity show --name "$KV_READER_IDENTITY" --resource-group "$RG" --query id -o tsv)

# Where the UI is reached: the custom domain on the hub, the app's own address
# in a resource group without one.
if [ -n "${CUSTOM_DOMAIN:-}" ]; then
  PUBLIC_URL="https://${CUSTOM_DOMAIN}"
else
  PUBLIC_URL="$UI_PUBLIC_URL"
fi
KC_REALM_URL="${KEYCLOAK_PUBLIC_URL}/realms/edcv"

if [ -z "${NEXTAUTH_SECRET:-}" ]; then
  NEXTAUTH_SECRET="$(openssl rand -hex 32)"
  log "NEXTAUTH_SECRET not set; generated a fresh 256-bit one (not displayed)"
fi

# The internal ports of the control plane and IdentityHub are
# additionalPortMappings, reached by short app name (#317); the issuer's admin
# API is its ingress port.
if az containerapp show --name "$UI_APP" --resource-group "$RG" -o none 2>/dev/null; then
  ok "${UI_APP} exists; deploy-azure.yml and the scripts below keep it current"
else
  log "Creating ${UI_APP}..."
  az containerapp create \
    --name "$UI_APP" --resource-group "$RG" --environment "$ACA_ENV" \
    --image "$UI_IMAGE" \
    --registry-server "$ACR_LOGIN_SERVER" \
    --registry-username "$ACR_NAME" \
    --registry-password "$ACR_PASSWORD" \
    --user-assigned "$IDENTITY_ID" \
    --secrets "nextauth-secret=${NEXTAUTH_SECRET}" \
    --cpu "$UI_CPU" --memory "$UI_MEMORY" \
    --min-replicas "$UI_MIN_REPLICAS" --max-replicas "$UI_MAX_REPLICAS" \
    --scale-rule-name http-concurrency --scale-rule-type http \
    --scale-rule-http-concurrency "$UI_SCALE_CONCURRENCY" \
    --ingress external --target-port 3000 \
    --env-vars \
      "NEXT_PUBLIC_STATIC_EXPORT=false" \
      "DEPLOYMENT_TARGET=azure" \
      "AZURE_SUBSCRIPTION_ID=${SUBSCRIPTION_ID}" \
      "AZURE_RESOURCE_GROUP=${RG}" \
      "NEXTAUTH_URL=${PUBLIC_URL}" \
      "NEXTAUTH_SECRET=secretref:nextauth-secret" \
      "KEYCLOAK_ID=health-dataspace-ui" \
      "KEYCLOAK_ISSUER=${KC_REALM_URL}" \
      "KEYCLOAK_PUBLIC_URL=${KC_REALM_URL}" \
      "KEYCLOAK_INTERNAL_URL=https://${KEYCLOAK_APP}.${ACA_DOMAIN}" \
      "NEXT_PUBLIC_KEYCLOAK_URL=${KEYCLOAK_PUBLIC_URL}" \
      "NEXT_PUBLIC_KEYCLOAK_REALM=edcv" \
      "NEO4J_PROXY_URL=http://${NEO4J_PROXY_APP}" \
      "AUDIT_CALLBACK_URL=http://${NEO4J_PROXY_APP}/audit/dsp" \
      "NEO4J_URI=${NEO4J_BOLT_URI}" \
      "NEO4J_ENCRYPTED=false" \
      "NEO4J_USER=${NEO4J_USER}" \
      "EDC_MANAGEMENT_URL=http://${CONTROLPLANE_APP}:8081/api/mgmt" \
      "EDC_IDENTITY_URL=http://${IDENTITYHUB_APP}:7082/api/identity" \
      "EDC_PROTOCOL_URL=http://${CONTROLPLANE_APP}:8082/api/dsp" \
      "EDC_ISSUER_URL=https://${ISSUER_APP}.internal.${ACA_DOMAIN}/api/admin" \
      "EDC_MGMT_API_VERSION=v5" \
      "EDC_SERVICE_CLIENT_ID=admin" \
      "CFM_DID_BASE=did:web:${IDENTITYHUB_APP}%3A7083" \
      "LIVE_DEMO_OFFLINE=false" \
    -o none
  unset NEXTAUTH_SECRET
  ok "${UI_APP} created"
fi

# The graph password as an ACA secret, never a plain value (#359).
wire_neo4j_password app "$UI_APP"

# An EUDI sign-in lives in one replica's memory; see size-ui.sh (#708).
az containerapp ingress sticky-sessions set --name "$UI_APP" --resource-group "$RG" \
  --affinity sticky -o none

# /api/admin/components reads the apps' metrics through ARM with the app's own
# system-assigned identity: Reader and Monitoring Reader on the resource group.
UI_PRINCIPAL_ID=$(az containerapp identity assign --name "$UI_APP" --resource-group "$RG" \
  --system-assigned --query principalId -o tsv)
RG_SCOPE="/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}"
for role in "Reader" "Monitoring Reader"; do
  az role assignment create --assignee-object-id "$UI_PRINCIPAL_ID" \
    --assignee-principal-type ServicePrincipal --role "$role" --scope "$RG_SCOPE" -o none
done
ok "${UI_APP}: sticky sessions, Reader and Monitoring Reader on ${RG}"

log "UI complete"
echo "  UI:        ${PUBLIC_URL}"
echo "  Next:      rotate-keycloak-ui-client-secret.sh --rotate"
echo "             rotate-edc-admin-client-secret.sh --rotate"
echo "             migrate-edc-to-v1.sh ui"
