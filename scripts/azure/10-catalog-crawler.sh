#!/usr/bin/env bash
# Phase 26b: build + deploy the mvhd-catalog-crawler ACA Job.
#
# Runs every 5 min (ADR-020), fetches each :Participant node's DSP
# catalog, publishes JSON-LD to NATS subject `dataspace.catalog.raw`
# for the enricher to consume. Schedule-trigger Job so Azure handles
# the cron; RUN_ONCE=true makes the container exit 0 after a cycle.
#
# Prefer running this via the GitHub Actions workflow rather than the
# personal az CLI — ACA job write permissions are PIM-gated for personal
# accounts (see memory project_aca_job_write_via_ci).
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
source "${SCRIPT_DIR}/env.sh"

log "Phase 26b: catalog crawler (ACA Job)"

SERVICE_DIR="${REPO_ROOT}/services/catalog-crawler"
if [[ ! -d "$SERVICE_DIR" ]]; then
  err "Service source not found at ${SERVICE_DIR}"
  exit 1
fi

az acr login --name "$ACR_NAME"
ACR_PASSWORD=$(az acr credential show --name "$ACR_NAME" --query "passwords[0].value" -o tsv)

# ── Build + push image ──────────────────────────────────────────────
log "Building catalog-crawler image..."
docker buildx build --platform linux/amd64 \
  -t "${ACR_LOGIN_SERVER}/${CATALOG_CRAWLER_JOB}:latest" --push "$SERVICE_DIR"
ok "Image pushed: ${ACR_LOGIN_SERVER}/${CATALOG_CRAWLER_JOB}:latest"

# ── Create / update the ACA Job ─────────────────────────────────────
log "Creating/updating ACA Job ${CATALOG_CRAWLER_JOB}..."
# Every 5 min; aligned with ADR-020 interval.
CRON_EXPRESSION='*/5 * * * *'

if az containerapp job show --name "$CATALOG_CRAWLER_JOB" --resource-group "$RG" -o none 2>/dev/null; then
  az containerapp job update \
    --name "$CATALOG_CRAWLER_JOB" --resource-group "$RG" \
    --image "${ACR_LOGIN_SERVER}/${CATALOG_CRAWLER_JOB}:latest" \
    --cpu 0.25 --memory 0.5Gi \
    --replica-timeout 600 \
    --cron-expression "$CRON_EXPRESSION" \
    --set-env-vars \
      "RUN_ONCE=true" \
      "NATS_URL=nats://${NATS_APP}:4222" \
      "NATS_SUBJECT=dataspace.catalog.raw" \
      "NEO4J_URI=bolt://${NEO4J_APP}:7687" \
      "NEO4J_USER=${NEO4J_USER}" \
      "NEO4J_PASSWORD=${NEO4J_PASSWORD}" \
      "CRAWLER_DID=did:web:${CUSTOM_DOMAIN}:crawler" \
    -o none
  ok "Job updated"
else
  az containerapp job create \
    --name "$CATALOG_CRAWLER_JOB" --resource-group "$RG" --environment "$ACA_ENV" \
    --image "${ACR_LOGIN_SERVER}/${CATALOG_CRAWLER_JOB}:latest" \
    --registry-server "$ACR_LOGIN_SERVER" \
    --registry-username "$ACR_NAME" \
    --registry-password "$ACR_PASSWORD" \
    --cpu 0.25 --memory 0.5Gi \
    --trigger-type Schedule --replica-timeout 600 \
    --cron-expression "$CRON_EXPRESSION" \
    --env-vars \
      "RUN_ONCE=true" \
      "NATS_URL=nats://${NATS_APP}:4222" \
      "NATS_SUBJECT=dataspace.catalog.raw" \
      "NEO4J_URI=bolt://${NEO4J_APP}:7687" \
      "NEO4J_USER=${NEO4J_USER}" \
      "NEO4J_PASSWORD=${NEO4J_PASSWORD}" \
      "CRAWLER_DID=did:web:${CUSTOM_DOMAIN}:crawler" \
    -o none
  ok "Job created"
fi

cat <<EOF

Crawler will run automatically every 5 minutes.

Manual one-shot (useful for local debug):
  az containerapp job start --name ${CATALOG_CRAWLER_JOB} --resource-group ${RG}

Monitor:
  az containerapp job execution list --name ${CATALOG_CRAWLER_JOB} --resource-group ${RG} \\
    --query "[0:5].{name:name, status:properties.status, start:properties.startTime}" -o table
EOF
