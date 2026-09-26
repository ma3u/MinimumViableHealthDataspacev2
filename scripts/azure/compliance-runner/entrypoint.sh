#!/usr/bin/env bash
# Entrypoint for the mvhd-compliance-runner ACA Job. Runs DSP / DCP / EHDS
# compliance suites against the ACA-internal services (mvhd-controlplane,
# mvhd-identityhub, mvhd-issuerservice, mvhd-neo4j, mvhd-keycloak) using short
# service names. Exits 0 even on test failures so the job execution is marked
# Succeeded — per-suite results live in ${REPORT_DIR}.
set -euo pipefail

log() { printf '[compliance-runner] %s\n' "$*"; }

log "DEMO_MODE=${DEMO_MODE} SUITES=${SUITES} REPORT_DIR=${REPORT_DIR}"
# Defaulted so that `set -u` does not kill the banner before the suites have
# a chance to say which target they could not reach.
log "targets:"
log "  mgmt:      ${EDC_MANAGEMENT_URL:-(unset)}"
log "  identity:  ${EDC_IDENTITY_URL:-(unset)}"
log "  issuer:    ${EDC_ISSUER_URL:-(unset)}"
log "  keycloak:  ${KEYCLOAK_URL:-(unset)}"
log "  neo4j:     ${NEO4J_BOLT_URI:-(unset)}"

mkdir -p "${REPORT_DIR}"
cd /work

if [[ "${SUITES}" == *"dsp"* ]]; then
  log "→ DSP 2025-1 TCK"
  ./scripts/run-ehds-dataspace-checks.sh || log "  (dsp suite finished with failures)"
fi
if [[ "${SUITES}" == *"dcp"* ]]; then
  log "→ DCP v1.0 Compliance"
  ./scripts/run-ehds-identity-checks.sh || log "  (dcp suite finished with failures)"
fi
if [[ "${SUITES}" == *"ehds"* ]]; then
  log "→ EHDS Domain Compliance"
  ./scripts/run-ehds-tests.sh || log "  (ehds suite finished with failures)"
fi

log "results under ${REPORT_DIR}:"
find "${REPORT_DIR}" -type f -name '*.json' | sort || true
log "done"
