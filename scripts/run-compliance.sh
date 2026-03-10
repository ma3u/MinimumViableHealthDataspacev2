#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Run All Compliance Suites — Health Dataspace v2
# ---------------------------------------------------------------------------
# Orchestrator script that runs all three compliance test suites:
#   1. DSP 2025-1 TCK (Protocol conformance)
#   2. DCP v1.0 Compliance (Decentralized identity)
#   3. EHDS Health-Domain (Health-specific requirements)
#
# Usage:
#   ./scripts/run-compliance.sh           # Run all suites
#   SUITES="dsp dcp" ./scripts/run-compliance.sh   # Run specific suites
# ---------------------------------------------------------------------------
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPORT_DIR="${REPORT_DIR:-test-results}"
SUITES="${SUITES:-dsp dcp ehds}"

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

OVERALL_EXIT=0

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║  Health Dataspace v2 — Compliance Verification Pipeline     ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "  Timestamp:  $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "  Suites:     ${SUITES}"
echo "  Report dir: ${REPORT_DIR}"
echo ""

run_suite() {
  local name="$1" script="$2" report_subdir="$3"
  echo -e "${CYAN}━━━ Running: ${name} ━━━${NC}"
  export REPORT_DIR="${REPORT_DIR}/${report_subdir}"
  if "${SCRIPT_DIR}/${script}"; then
    echo -e "${GREEN}  ✓ ${name} — PASSED${NC}"
  else
    echo -e "${RED}  ✗ ${name} — FAILED${NC}"
    OVERALL_EXIT=1
  fi
  echo ""
}

for suite in $SUITES; do
  case "$suite" in
    dsp)  run_suite "DSP 2025-1 TCK"           "run-dsp-tck.sh"   "dsp-tck" ;;
    dcp)  run_suite "DCP v1.0 Compliance"       "run-dcp-tests.sh" "dcp"     ;;
    ehds) run_suite "EHDS Health-Domain"         "run-ehds-tests.sh" "ehds"   ;;
    *)    echo "Unknown suite: $suite (valid: dsp, dcp, ehds)" ;;
  esac
done

# Generate summary report
SUMMARY_FILE="${REPORT_DIR}/compliance-summary-$(date +%Y%m%dT%H%M%S).json"
mkdir -p "$(dirname "$SUMMARY_FILE")"

# Aggregate results from all suite reports
{
  echo "{"
  echo "  \"pipeline\": \"Health Dataspace Compliance Verification\","
  echo "  \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\","
  echo "  \"suites\": [\"${SUITES// /\", \"}\"],"
  echo "  \"overallResult\": \"$([ $OVERALL_EXIT -eq 0 ] && echo "PASSED" || echo "FAILED")\","
  echo "  \"reports\": {"

  local first_report=true
  for dir in dsp-tck dcp ehds; do
    local latest
    latest=$(ls -t "${REPORT_DIR}/${dir}/"*.json 2>/dev/null | head -1) || latest=""
    if [ -n "$latest" ]; then
      if [ "$first_report" = true ]; then first_report=false; else echo ","; fi
      echo -n "    \"${dir}\": $(cat "$latest")"
    fi
  done

  echo ""
  echo "  }"
  echo "}"
} > "$SUMMARY_FILE" 2>/dev/null || true

echo -e "${BOLD}═══════════════════════════════════════════════════════════════${NC}"
if [ $OVERALL_EXIT -eq 0 ]; then
  echo -e "  ${GREEN}Overall: ALL SUITES PASSED${NC}"
else
  echo -e "  ${RED}Overall: SOME SUITES FAILED${NC}"
fi
echo -e "${BOLD}═══════════════════════════════════════════════════════════════${NC}"
echo ""

exit $OVERALL_EXIT
