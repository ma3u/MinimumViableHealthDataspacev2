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

# Short-name service URLs (resolvable inside the ACA environment VNet).
MGMT_URL="http://${CONTROLPLANE_APP}:11003/api/mgmt"
IDENTITY_URL="http://${IDENTITYHUB_APP}:11005/api/identity"
ISSUER_URL="http://${ISSUER_APP}:10013/api/admin"
KC_URL="http://${KEYCLOAK_APP}:8080"
NEO4J_HTTP_URL="http://${NEO4J_APP}:7474"

ENV_VARS=(
  "DEMO_MODE=azure"
  "SUITES=${SUITES}"
  "REPORT_DIR=/work/test-results"
  "EDC_MANAGEMENT_URL=${MGMT_URL}"
  "EDC_IDENTITY_URL=${IDENTITY_URL}"
  "EDC_ISSUER_URL=${ISSUER_URL}"
  "KEYCLOAK_URL=${KC_URL}"
  "NEO4J_URL=${NEO4J_HTTP_URL}"
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
