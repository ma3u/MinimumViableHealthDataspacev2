#!/usr/bin/env bash
# Phase 9: Load Synthea FHIR bundles into the Azure Neo4j instance via an
# ACA Job (mvhd-fhir-loader). Mirrors the mvhd-neo4j-seed pattern in phase 6
# but runs scripts/load_fhir_neo4j.py against all bundles under
# neo4j/import/fhir/ (baked into the image). Internal Bolt only — reuses the
# short-name constraint (NEO4J_URI=bolt://mvhd-neo4j:7687) from ADR-018.
#
# Usage:
#   ./scripts/azure/09-fhir-loader.sh
#
# Requires: scripts/generate-synthea.sh already produced bundles under
# neo4j/import/fhir/*.json.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
source "${SCRIPT_DIR}/env.sh"

BUNDLE_DIR="${REPO_ROOT}/neo4j/import/fhir"
LOADER_SCRIPT="${REPO_ROOT}/scripts/load_fhir_neo4j.py"

log "Phase 9: Synthea FHIR loader (ACA Job)"

# ── Pre-flight ───────────────────────────────────────────────────────────────
if [[ ! -d "$BUNDLE_DIR" ]]; then
  err "No bundles at ${BUNDLE_DIR} — run scripts/generate-synthea.sh first"
  exit 1
fi
BUNDLE_COUNT=$(find "$BUNDLE_DIR" -maxdepth 1 -name '*.json' | wc -l | tr -d ' ')
if [[ "$BUNDLE_COUNT" -eq 0 ]]; then
  err "No *.json files in ${BUNDLE_DIR}"
  exit 1
fi
BUNDLE_SIZE=$(du -sh "$BUNDLE_DIR" | awk '{print $1}')
log "Found ${BUNDLE_COUNT} bundles (${BUNDLE_SIZE}) at ${BUNDLE_DIR}"

if [[ ! -f "$LOADER_SCRIPT" ]]; then
  err "Loader script not found at ${LOADER_SCRIPT}"
  exit 1
fi

az acr login --name "$ACR_NAME"
ACR_PASSWORD=$(az acr credential show --name "$ACR_NAME" --query "passwords[0].value" -o tsv)

# ── Build FHIR loader image ──────────────────────────────────────────────────
log "Building FHIR loader image..."
BUILD_DIR=$(mktemp -d)
# Stage only what the image needs — avoid pulling the whole repo.
mkdir -p "${BUILD_DIR}/bundles"
cp "$LOADER_SCRIPT" "${BUILD_DIR}/load_fhir_neo4j.py"
# Copy bundles with rsync to preserve symlinks-as-files and speed up large copies.
rsync -a --include='*.json' --exclude='*' "${BUNDLE_DIR}/" "${BUILD_DIR}/bundles/"

cat > "${BUILD_DIR}/Dockerfile" <<'DOCKERFILE'
# Python + neo4j driver — minimal footprint for a one-shot loader job.
FROM python:3.12-slim
RUN pip install --no-cache-dir neo4j==5.23.0
WORKDIR /app
COPY load_fhir_neo4j.py /app/load_fhir_neo4j.py
COPY bundles /app/bundles
ENV PYTHONUNBUFFERED=1
# NEO4J_URI / NEO4J_USER / NEO4J_PASSWORD provided as ACA job env vars.
ENTRYPOINT ["python3", "/app/load_fhir_neo4j.py", "--dir", "/app/bundles"]
DOCKERFILE

docker buildx build --platform linux/amd64 \
  -t "${ACR_LOGIN_SERVER}/${FHIR_LOADER_JOB}:latest" --push "${BUILD_DIR}"
rm -rf "${BUILD_DIR}"
ok "FHIR loader image pushed: ${ACR_LOGIN_SERVER}/${FHIR_LOADER_JOB}:latest"

# ── Create/update ACA Job ────────────────────────────────────────────────────
# NEO4J_URI must use the short app name — ACA TCP ingress silently times out
# on the *.internal.<domain> FQDN used for HTTP ingress (see ADR-018).
NEO4J_URI="bolt://${NEO4J_APP}:7687"

log "Creating/updating FHIR loader job ${FHIR_LOADER_JOB}..."
if az containerapp job show --name "$FHIR_LOADER_JOB" --resource-group "$RG" -o none 2>/dev/null; then
  az containerapp job update \
    --name "$FHIR_LOADER_JOB" --resource-group "$RG" \
    --image "${ACR_LOGIN_SERVER}/${FHIR_LOADER_JOB}:latest" \
    --cpu 1.0 --memory 2Gi \
    --replica-timeout 10800 \
    --set-env-vars \
      "NEO4J_URI=${NEO4J_URI}" \
      "NEO4J_USER=${NEO4J_USER}" \
      "NEO4J_PASSWORD=${NEO4J_PASSWORD}" \
    -o none
  ok "FHIR loader job updated"
else
  az containerapp job create \
    --name "$FHIR_LOADER_JOB" --resource-group "$RG" --environment "$ACA_ENV" \
    --image "${ACR_LOGIN_SERVER}/${FHIR_LOADER_JOB}:latest" \
    --registry-server "$ACR_LOGIN_SERVER" \
    --registry-username "$ACR_NAME" \
    --registry-password "$ACR_PASSWORD" \
    --cpu 1.0 --memory 2Gi \
    --trigger-type Manual --replica-timeout 10800 \
    --env-vars \
      "NEO4J_URI=${NEO4J_URI}" \
      "NEO4J_USER=${NEO4J_USER}" \
      "NEO4J_PASSWORD=${NEO4J_PASSWORD}" \
    -o none
  ok "FHIR loader job created"
fi

# ── Start the job ────────────────────────────────────────────────────────────
log "Starting FHIR loader job..."
az containerapp job start --name "$FHIR_LOADER_JOB" --resource-group "$RG" -o none
ok "FHIR loader job started"

cat <<EOF

Monitor progress:
  az containerapp job execution list --name ${FHIR_LOADER_JOB} --resource-group ${RG} \\
    --query "[-1:].{status:properties.status, start:properties.startTime, end:properties.endTime}" -o table

Stream logs (once the replica is running):
  EXEC=\$(az containerapp job execution list --name ${FHIR_LOADER_JOB} --resource-group ${RG} \\
    --query "[-1:].name" -o tsv)
  az containerapp job logs show --name ${FHIR_LOADER_JOB} --resource-group ${RG} \\
    --container ${FHIR_LOADER_JOB} --job-execution-name "\$EXEC" --follow

Verify after completion:
  curl -s https://${CUSTOM_DOMAIN}/api/patient | python3 -c "import json,sys; d=json.load(sys.stdin); print('patients=', len(d['patients']), 'stats=', d['stats'])"
EOF
