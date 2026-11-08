#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# The official DSP 2025-1 TCK against the hub's control plane (#711)
# ---------------------------------------------------------------------------
# Unlike scripts/run-ehds-dataspace-checks.sh, which is our own reading of DSP
# driven through the Management API, this runs the Eclipse Dataspace TCK
# (https://github.com/eclipse-dataspacetck/dsp-tck) as a protocol peer against
# controlplane-tck, the hub's control plane with EDC's connector-under-test
# pieces (runtimes/edc/controlplane-tck). See docker-compose.tck.yml.
#
# Usage:
#   ./scripts/run-eclipse-dsp-tck.sh                      # report to test-results/dsp-tck-official
#   REPORT_DIR=./reports ./scripts/run-eclipse-dsp-tck.sh
#   DSP_TCK_VERSION=1.0.0-RC6 ./scripts/run-eclipse-dsp-tck.sh
#   KEEP=1 ./scripts/run-eclipse-dsp-tck.sh               # leave the stack up to look at it
#
# Exit code: 0 when every test passed, 1 when any failed, 2 when the TCK never
# finished (the log has no "Test run complete").
# ---------------------------------------------------------------------------
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPORT_DIR="${REPORT_DIR:-$ROOT/test-results/dsp-tck-official}"
COMPOSE=(docker compose -f "$ROOT/docker-compose.tck.yml")

mkdir -p "$REPORT_DIR"
LOG="$REPORT_DIR/tck.log"

cleanup() {
  if [ "${KEEP:-0}" != "1" ]; then
    "${COMPOSE[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

"${COMPOSE[@]}" build controlplane-tck
"${COMPOSE[@]}" up -d controlplane-tck
"${COMPOSE[@]}" logs controlplane-tck >"$REPORT_DIR/controlplane-tck.log" 2>&1 || true

# The TCK runs its whole plan once and exits. `up`, not `run`: a `run`
# container is not reachable by its service name, and the control plane calls
# the TCK back at http://dsp-tck:8083 (jad/dsp-tck/config.properties).
"${COMPOSE[@]}" up --no-color --exit-code-from dsp-tck dsp-tck >/dev/null 2>&1 || true
"${COMPOSE[@]}" logs --no-color --no-log-prefix dsp-tck >"$LOG" 2>&1 || true
"${COMPOSE[@]}" logs --no-color controlplane-tck >"$REPORT_DIR/controlplane-tck.log" 2>&1 || true

if ! grep -q "Test run complete" "$LOG"; then
  echo "The TCK did not finish; see $LOG and $REPORT_DIR/controlplane-tck.log" >&2
  exit 2
fi

# The runtime logs one "SUCCESSFUL: <id>" or "FAILED: <id>" line per test,
# then the reason for each failure.
passed="$(grep -c '] SUCCESSFUL: ' "$LOG" || true)"
failed="$(grep -c '] FAILED: ' "$LOG" || true)"
if [ "$((passed + failed))" -eq 0 ]; then
  echo "The TCK finished but reported no test; see $LOG" >&2
  exit 2
fi
grep '] FAILED: ' "$LOG" | sed 's/.*FAILED: //' >"$REPORT_DIR/failures.txt" || true
printf 'DSP TCK %s: %s passed, %s failed\n' "${DSP_TCK_VERSION:-1.0.2}" "$passed" "$failed" | tee "$REPORT_DIR/summary.txt"
echo "Report: $REPORT_DIR"
[ "$failed" -eq 0 ]
