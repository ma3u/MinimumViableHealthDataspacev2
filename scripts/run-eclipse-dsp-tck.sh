#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# The official DSP 2025-1 TCK against the hub's control plane (#338, #711)
# ---------------------------------------------------------------------------
# Unlike scripts/run-ehds-dataspace-checks.sh, which is our own reading of DSP
# driven through the Management API, this runs the Eclipse Dataspace TCK
# (https://github.com/eclipse-dataspacetck/dsp-tck) as a protocol peer against
# controlplane-tck, the hub's control plane with EDC's connector-under-test
# pieces (runtimes/edc/controlplane-tck). See docker-compose.tck.yml.
#
# With --simpl it runs the same TCK against Simpl-Open's connector, simpl-edc
# (compose profile simpl), after seeding the TCK's offers through its
# Management API. simpl-edc has no TCK hook, so the consumer-side tests and the
# transfer tests that need a seeded agreement cannot pass there; the summary
# counts them apart.
#
# Usage:
#   ./scripts/run-eclipse-dsp-tck.sh                      # report to test-results/dsp-tck-official
#   ./scripts/run-eclipse-dsp-tck.sh --simpl              # report to test-results/dsp-tck-simpl
#   REPORT_DIR=./reports ./scripts/run-eclipse-dsp-tck.sh
#   DSP_TCK_VERSION=1.0.0-RC6 ./scripts/run-eclipse-dsp-tck.sh
#   KEEP=1 ./scripts/run-eclipse-dsp-tck.sh               # leave the stack up to look at it
#
# Exit code: 0 when every test passed, 1 when any failed, 2 when the TCK never
# finished (the log has no "Test run complete").
# ---------------------------------------------------------------------------
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# the Management API key of the throwaway simpl-edc container, nothing else
export SIMPL_MGMT_KEY="${SIMPL_MGMT_KEY:-tck-only}"
MODE="hub"
[ "${1:-}" = "--simpl" ] && MODE="simpl"

if [ "$MODE" = "simpl" ]; then
  REPORT_DIR="${REPORT_DIR:-$ROOT/test-results/dsp-tck-simpl}"
  COMPOSE=(docker compose -f "$ROOT/docker-compose.tck.yml" --profile simpl)
  CUT="simpl-edc"
  TCK="dsp-tck-simpl"
else
  REPORT_DIR="${REPORT_DIR:-$ROOT/test-results/dsp-tck-official}"
  COMPOSE=(docker compose -f "$ROOT/docker-compose.tck.yml")
  CUT="controlplane-tck"
  TCK="dsp-tck"
fi

mkdir -p "$REPORT_DIR"
LOG="$REPORT_DIR/tck.log"

cleanup() {
  if [ "${KEEP:-0}" != "1" ]; then
    "${COMPOSE[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

# The TCK's offers on simpl-edc, the assets EDC seeds for its own TCK run
# (DataSeed.ASSET_IDS in system-tests/tck/tasks-tck-extension at v1.0.0-RC5):
# CAT0103 is left out on purpose, CAT:01-03 checks that it is not found. An
# open policy and one contract definition, CD123, over all of them. EDC 0.10.1
# Management API v3, x-api-key $SIMPL_MGMT_KEY, which docker-compose.tck.yml
# passes to the container.
#
# post_simpl URL -d BODY: one Management API call that says what failed. The
# DSP port can answer before the Management API does, so a 404 or a refused
# connection is retried for a minute; any other error stops the run.
post_simpl() {
  local url="$1" body="$3" code="" i
  for i in $(seq 1 30); do
    code="$(curl -s -o "$REPORT_DIR/seed-response.json" -w '%{http_code}' -X POST \
      -H "x-api-key: $SIMPL_MGMT_KEY" -H "Content-Type: application/json" "$url" -d "$body" || echo 000)"
    case "$code" in
      2??) return 0 ;;
      000 | 404) sleep 2 ;;
      *) break ;;
    esac
  done
  echo "Seeding simpl-edc failed: POST $url answered HTTP $code after $i attempts:" >&2
  cat "$REPORT_DIR/seed-response.json" >&2 || true
  exit 2
}

seed_simpl() {
  local mgmt="http://127.0.0.1:19193/management/v3" ctx='{"@vocab":"https://w3id.org/edc/v0.0.1/ns/"}'
  local id n=0
  for id in ACN0101 ACN0102 ACN0103 ACN0104 ACN0201 ACN0202 ACN0203 ACN0204 ACN0205 \
    ACN0206 ACN0207 ACN0301 ACN0302 ACN0303 ACN0304 CAT0101 CAT0102; do
    post_simpl "$mgmt/assets" -d "{\"@context\":$ctx,\"@id\":\"$id\",\"properties\":{\"name\":\"$id\"},\"dataAddress\":{\"type\":\"HttpData\",\"baseUrl\":\"http://example.org/$id\"}}"
    n=$((n + 1))
  done
  post_simpl "$mgmt/policydefinitions" -d "{\"@context\":$ctx,\"@id\":\"tck-open\",\"policy\":{\"@context\":\"http://www.w3.org/ns/odrl.jsonld\",\"@type\":\"Set\",\"permission\":[],\"prohibition\":[],\"obligation\":[]}}"
  post_simpl "$mgmt/contractdefinitions" -d "{\"@context\":$ctx,\"@id\":\"CD123\",\"accessPolicyId\":\"tck-open\",\"contractPolicyId\":\"tck-open\",\"assetsSelector\":[]}"
  echo "Seeded $n assets, one policy and contract definition CD123 on simpl-edc"
}

if [ "$MODE" = "hub" ]; then
  "${COMPOSE[@]}" build controlplane-tck
fi
"${COMPOSE[@]}" up -d --wait "$CUT"
[ "$MODE" = "simpl" ] && seed_simpl

# The TCK runs its whole plan once and exits. `up`, not `run`: a `run`
# container is not reachable by its service name, and the connector calls the
# TCK back at http://<service>:8083 (the properties file).
"${COMPOSE[@]}" up --no-color --exit-code-from "$TCK" "$TCK" >/dev/null 2>&1 || true
"${COMPOSE[@]}" logs --no-color --no-log-prefix "$TCK" >"$LOG" 2>&1 || true
"${COMPOSE[@]}" logs --no-color "$CUT" >"$REPORT_DIR/$CUT.log" 2>&1 || true

if ! grep -q "Test run complete" "$LOG"; then
  echo "The TCK did not finish; see $LOG and $REPORT_DIR/$CUT.log" >&2
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
{
  printf 'DSP TCK %s against %s: %s passed, %s failed\n' "${DSP_TCK_VERSION:-1.0.2}" "$CUT" "$passed" "$failed"
  if [ "$MODE" = "simpl" ]; then
    # tests that need a TCK hook simpl-edc does not have: the connector as
    # consumer (CN_C, TP_C), and transfers on a seeded agreement (TP)
    hook="$(grep -c -E '^(CN_C|TP_C|TP):' "$REPORT_DIR/failures.txt" || true)"
    printf '  of the failures, %s need a TCK hook simpl-edc lacks (CN_C, TP_C, TP); %s do not\n' "$hook" "$((failed - hook))"
  fi
} | tee "$REPORT_DIR/summary.txt"
echo "Report: $REPORT_DIR"
[ "$failed" -eq 0 ]
