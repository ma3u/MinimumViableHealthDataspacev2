#!/usr/bin/env bash
# Phase 8: Build + deploy the mvhd-compliance-runner ACA Job and start it.
# Runs DSP/DCP/EHDS compliance suites from inside the ACA VNet so they can
# reach internal short-name services (mvhd-controlplane, mvhd-identityhub,
# mvhd-issuerservice, mvhd-neo4j, mvhd-keycloak) directly.
#
# Usage:
#   ./scripts/azure/08-compliance-runner.sh              # build, deploy, run all 3 suites
#   SUITES="dsp" ./scripts/azure/08-compliance-runner.sh # just DSP
#   NO_START=1 ./scripts/azure/08-compliance-runner.sh   # build+deploy only
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
source "${SCRIPT_DIR}/env.sh"

COMPLIANCE_JOB="mvhd-compliance-runner"
IMAGE="${ACR_LOGIN_SERVER}/mvhd-compliance-runner:latest"
SUITES="${SUITES:-dsp dcp ehds}"

log "Phase 8: Compliance runner (SUITES=${SUITES})"

az acr login --name "$ACR_NAME" >/dev/null
ACR_PASSWORD=$(az acr credential show --name "$ACR_NAME" --query "passwords[0].value" -o tsv)

log "Building compliance-runner image..."
docker buildx build --platform linux/amd64 \
  -f "${SCRIPT_DIR}/compliance-runner/Dockerfile" \
  -t "${IMAGE}" --push "${REPO_ROOT}"
ok "Image pushed: ${IMAGE}"

# Internal-FQDN service URLs, with no explicit port — the addressing mvhd-ui
# uses and which is known to work (05-cfm-ui.sh). These carried the local
# compose ports until now, and ACA does not serve them: mvhd-controlplane's
# HTTP ingress targets 8080 and mvhd-identityhub's 7081, not 11003 and 11005,
# and an HTTP ingress answers on 80/443 whatever the target is. The EHDS suite
# exits in discover_participants() when the Management API does not answer, so
# every run ended before its first Neo4j check with "Cannot fetch participant
# list from Management API". Same family as issue #205.
eval "$(get_aca_fqdns)"
MGMT_URL="https://${CONTROLPLANE_APP}.internal.${ACA_DOMAIN}/api/mgmt"
IDENTITY_URL="https://${IDENTITYHUB_APP}.internal.${ACA_DOMAIN}/api/identity"
ISSUER_URL="https://${ISSUER_APP}.internal.${ACA_DOMAIN}/api/admin"
KC_URL="https://${KEYCLOAK_APP}.${ACA_DOMAIN}"
# Bolt, not the transactional HTTP API: mvhd-neo4j has TCP ingress with
# targetPort and exposedPort 7687 and no additionalPortMappings, so
# http://mvhd-neo4j:7474 is not routable from inside the environment and every
# Neo4j check in the EHDS suite failed on it (issue #205). The short app name
# is required — the *.internal.<domain> FQDN is HTTP ingress and times out on
# TCP, the same rule the Neo4j seed job follows.
NEO4J_BOLT_URI="bolt://${NEO4J_APP}:7687"

ENV_VARS=(
  "DEMO_MODE=azure"
  "SUITES=${SUITES}"
  "REPORT_DIR=/work/test-results"
  "EDC_MANAGEMENT_URL=${MGMT_URL}"
  "EDC_IDENTITY_URL=${IDENTITY_URL}"
  "EDC_ISSUER_URL=${ISSUER_URL}"
  "KEYCLOAK_URL=${KC_URL}"
  "NEO4J_BOLT_URI=${NEO4J_BOLT_URI}"
  "NEO4J_USER=${NEO4J_USER}"
  "NEO4J_PASSWORD=${NEO4J_PASSWORD}"
)

if az containerapp job show --name "$COMPLIANCE_JOB" --resource-group "$RG" -o none 2>/dev/null; then
  log "Updating existing job ${COMPLIANCE_JOB}..."
  az containerapp job update \
    --name "$COMPLIANCE_JOB" --resource-group "$RG" \
    --image "$IMAGE" \
    --cpu 0.5 --memory 1Gi \
    --replica-timeout 1200 \
    --set-env-vars "${ENV_VARS[@]}" \
    -o none
  ok "Job updated"
else
  log "Creating job ${COMPLIANCE_JOB}..."
  az containerapp job create \
    --name "$COMPLIANCE_JOB" --resource-group "$RG" --environment "$ACA_ENV" \
    --image "$IMAGE" \
    --registry-server "$ACR_LOGIN_SERVER" \
    --registry-username "$ACR_NAME" \
    --registry-password "$ACR_PASSWORD" \
    --cpu 0.5 --memory 1Gi \
    --trigger-type Manual --replica-timeout 1200 \
    --replica-retry-limit 0 \
    --env-vars "${ENV_VARS[@]}" \
    -o none
  ok "Job created"
fi

if [[ -n "${NO_START:-}" ]]; then
  ok "NO_START=1 — skipping job start"
  exit 0
fi

log "Starting compliance-runner job..."
az containerapp job start --name "$COMPLIANCE_JOB" --resource-group "$RG" -o none
ok "Job started — monitor with:"
echo "  az containerapp job execution list --name ${COMPLIANCE_JOB} --resource-group ${RG} -o table"
echo "  az containerapp job logs show --name ${COMPLIANCE_JOB} --resource-group ${RG} --follow"
