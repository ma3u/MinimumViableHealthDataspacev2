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

# Service URLs. An EDC connector serves each web context on its own port, and
# ACA gives an app exactly one ingress FQDN: https://<app>.internal.<domain>
# reaches the ingress targetPort and nothing else. Every other port has to be
# an entry in additionalPortMappings and is addressed as
# http://<short-app-name>:<port> (04-edc-services.sh patches those in).
#
# That is what issue #307 was. The runner addressed the internal FQDN, which
# is the controlplane's targetPort 8080 (web.http, /api) and the identity
# hub's 7081 (web.http) — not 8081 (/api/mgmt) and 7082 (/api/identity). The
# Management API was never on the path being called, so all three suites died
# in discover_participants(). The fix is the same addressing
# .github/workflows/edc-probe-cp.yml has used since May 2026.
#
# Keycloak keeps its public FQDN: the token endpoint is on the main ingress
# and the issuer claim has to match what the connector validates against.
# The issuer service has no additional ports — its admin API is on 10013,
# which is its ingress targetPort — so the internal FQDN is right for it.
eval "$(get_aca_fqdns)"
MGMT_URL="http://${CONTROLPLANE_APP}:8081/api/mgmt"
IDENTITY_URL="http://${IDENTITYHUB_APP}:7082/api/identity"
ISSUER_URL="https://${ISSUER_APP}.internal.${ACA_DOMAIN}/api/admin"
KC_URL="https://${KEYCLOAK_APP}.${ACA_DOMAIN}"
# Management API version segment. Measured, not assumed: against the image
# deployed here (jad-controlplane:2026-04-14), with a Keycloak bearer token,
#
#   /api/mgmt/v5beta/participants   404
#   /api/mgmt/v5alpha/participants  404
#   /api/mgmt/v4alpha/participants  200  []
#
# so this environment is two version segments behind the 0.18 launchers in
# docker-compose.jad.yml that the suites default to (v5beta). The suites fall
# back across the candidates on a 404 (scripts/lib/edc-mgmt-api.sh), so this
# is not load-bearing — but it saves two wasted requests and records which
# version the deployed control plane is actually on.
MGMT_API_VERSION="${EDC_MGMT_API_VERSION:-v4alpha}"
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
  "EDC_MGMT_API_VERSION=${MGMT_API_VERSION}"
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
