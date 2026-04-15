#!/usr/bin/env bash
# Entrypoint for the mvhd-compliance-runner ACA Job. Runs DSP / DCP / EHDS
# compliance suites against the ACA-internal services (mvhd-controlplane,
# mvhd-identityhub, mvhd-issuerservice, mvhd-neo4j, mvhd-keycloak) using short
# service names. Exits 0 even on test failures so the job execution is marked
# Succeeded — per-suite results live in ${REPORT_DIR}.
set -euo pipefail

log() { printf '[compliance-runner] %s\n' "$*"; }

log "DEMO_MODE=${DEMO_MODE} SUITES=${SUITES} REPORT_DIR=${REPORT_DIR}"
log "targets:"
log "  mgmt:      ${EDC_MANAGEMENT_URL}"
log "  identity:  ${EDC_IDENTITY_URL}"
log "  issuer:    ${EDC_ISSUER_URL}"
log "  keycloak:  ${KEYCLOAK_URL}"
log "  neo4j:     ${NEO4J_URL}"

mkdir -p "${REPORT_DIR}"
cd /work

if [[ "${SUITES}" == *"dsp"* ]]; then
  log "→ DSP 2025-1 TCK"
  ./scripts/run-dsp-tck.sh || log "  (dsp suite finished with failures)"
fi
if [[ "${SUITES}" == *"dcp"* ]]; then
  log "→ DCP v1.0 Compliance"
  ./scripts/run-dcp-tests.sh || log "  (dcp suite finished with failures)"
fi
if [[ "${SUITES}" == *"ehds"* ]]; then
  log "→ EHDS Domain Compliance"
  ./scripts/run-ehds-tests.sh || log "  (ehds suite finished with failures)"
fi

log "results under ${REPORT_DIR}:"
find "${REPORT_DIR}" -type f -name '*.json' | sort || true
log "done"
