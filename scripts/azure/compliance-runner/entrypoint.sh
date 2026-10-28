#!/usr/bin/env bash
# Entrypoint for the mvhd-compliance-runner ACA Job. Runs the EHDS dataspace,
# identity and domain suites against the ACA-internal services
# (mvhd-controlplane, mvhd-identityhub, mvhd-issuerservice, mvhd-neo4j,
# mvhd-keycloak) using short service names.
#
# A suite with failing checks does not fail the job: those are verdicts, and
# each suite's summary is printed below so the workflow can read it from Log
# Analytics. A suite that produced no report at all does fail it, because then
# nothing was measured. Until 2026-10-28 this job exited 0 while every suite
# died on "No such file or directory" (the image still copied the names from
# before #342) or on a 401 for want of a client secret, and the workflow
# reported a green run that had measured nothing.
set -euo pipefail

log() { printf '[compliance-runner] %s\n' "$*"; }

log "DEMO_MODE=${DEMO_MODE} SUITES=${SUITES} REPORT_DIR=${REPORT_DIR}"
# Defaulted so that `set -u` does not kill the banner before the suites have
# a chance to say which target they could not reach.
log "targets:"
log "  mgmt:      ${EDC_MANAGEMENT_URL:-(unset)} (${EDC_MGMT_API_VERSION:-default version})"
log "  identity:  ${EDC_IDENTITY_URL:-(unset)}"
log "  issuer:    ${EDC_ISSUER_URL:-(unset)}"
log "  keycloak:  ${KEYCLOAK_URL:-(unset)}"
log "  neo4j:     ${NEO4J_BOLT_URI:-(unset)}"
if [ -n "${EDC_CLIENT_SECRET:-}" ]; then
  log "  client secret: set (${#EDC_CLIENT_SECRET} chars)"
else
  log "  client secret: NOT SET, the suites fall back to the public default"
fi

cd /work
missing=0

# run_suite <key> <label> <script> <report subdirectory>
run_suite() {
  local key="$1" label="$2" script="$3" dir="${REPORT_DIR}/$4" report
  [[ " ${SUITES} " == *" ${key} "* ]] || return 0
  log "→ ${label}"
  mkdir -p "$dir"
  REPORT_DIR="$dir" "./scripts/${script}" || log "  (${key} suite finished with failures)"
  report=$(find "$dir" -type f -name '*.json' 2>/dev/null | sort | tail -1)
  if [ -z "$report" ]; then
    log "SUITE ${key}: NO REPORT, nothing was measured"
    missing=$((missing + 1))
    return 0
  fi
  # One line per suite for the workflow, then one per check that did not pass.
  log "SUITE ${key}: $(jq -c '.summary' "$report")"
  jq -r '.tests[]? | select(.status != "passed") | "  \(.status) \(.id): \(.detail)"' \
    "$report" 2>/dev/null | head -40 || true
}

run_suite dsp "EHDS dataspace checks (DSP 2025-1)" run-ehds-dataspace-checks.sh dsp-tck
run_suite dcp "EHDS identity checks (DCP v1.0)" run-ehds-identity-checks.sh dcp
run_suite ehds "EHDS domain checks" run-ehds-tests.sh ehds

if [ "$missing" -gt 0 ]; then
  log "FAILED: ${missing} suite(s) produced no report"
  exit 1
fi
log "done"
