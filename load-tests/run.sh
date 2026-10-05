#!/usr/bin/env bash
# Runs one k6 scenario against the compose stack or the live hub (#519), with
# the metrics streamed to the local Grafana and the summary kept for the report.
#
#   load-tests/run.sh <scenario> [local|azure|<base url>]
#
#   scenario   smoke | load | stress | spike | soak | audited | proxy | signin
#   target     local  = http://localhost:3003 (default), proxy on :9090
#              azure  = https://ehds.mabu.red; needs NEXTAUTH_SECRET exported
#
# Needs k6 (brew install k6) and, for the dashboard, the observability stack:
#   docker compose -f docker-compose.observability.yml up -d
# Without it the run still works; only the Grafana panels stay empty.
#
# Variables: TESTID (default <date>-<scenario>-<target>), TIME_SCALE (0.05
# shortens every stage for a dry run), KC_USER/KC_PASSWORD (signin), YES=1
# (skip the confirmation for a stress, spike or soak run against azure).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HERE="$ROOT/load-tests"
SCENARIO="${1:-}"
TARGET="${2:-local}"
case "$SCENARIO" in
  smoke|load|stress|spike|soak|audited|proxy|signin) ;;
  *) sed -n '2,20p' "$0"; exit 2 ;;
esac
command -v k6 >/dev/null || { echo "k6 is not installed (brew install k6)" >&2; exit 1; }

case "$TARGET" in
  local)
    BASE_URL="${BASE_URL:-http://localhost:3003}"
    PROXY_URL="${PROXY_URL:-http://localhost:9090}"
    COOKIE_NAME="${COOKIE_NAME:-next-auth.session-token}"
    ;;
  azure)
    BASE_URL="${BASE_URL:-https://ehds.mabu.red}"
    PROXY_URL=""
    COOKIE_NAME="${COOKIE_NAME:-__Secure-next-auth.session-token}"
    [ -n "${NEXTAUTH_SECRET:-}" ] || { echo "azure needs NEXTAUTH_SECRET exported (the deployment's value)" >&2; exit 1; }
    case "$SCENARIO" in
      stress|spike|soak)
        if [ "${YES:-}" != 1 ]; then
          echo "$SCENARIO against $BASE_URL scales the live apps out and costs money (ADR-053: inside office hours, announced)."
          read -r -p "Continue? [y/N] " answer
          [ "$answer" = y ] || exit 1
        fi ;;
    esac
    ;;
  http*) BASE_URL="${TARGET%/}"; PROXY_URL="${PROXY_URL:-}"; COOKIE_NAME="${COOKIE_NAME:-__Secure-next-auth.session-token}" ;;
  *) echo "unknown target $TARGET" >&2; exit 2 ;;
esac

TESTID="${TESTID:-$(date +%Y%m%d-%H%M)-$SCENARIO-$(echo "$TARGET" | sed 's#https\?://##; s#[^A-Za-z0-9._-]#-#g')}"
RESULTS="$HERE/results"; mkdir -p "$RESULTS"
SESSIONS="$HERE/.sessions.json"

if [ "$SCENARIO" != signin ]; then
  SESSIONS="$SESSIONS" COOKIE_NAME="$COOKIE_NAME" "$HERE/forge-sessions.sh"
fi

# k6 → Prometheus remote write → the LGTM container's Prometheus, when it is up.
RW="${K6_PROMETHEUS_RW_SERVER_URL:-http://localhost:9091/api/v1/write}"
out=()
if curl -s -o /dev/null -m 2 "${RW%/api/v1/write}/-/ready"; then
  out=(-o experimental-prometheus-rw)
  export K6_PROMETHEUS_RW_SERVER_URL="$RW"
  export K6_PROMETHEUS_RW_TREND_AS_NATIVE_HISTOGRAM="${K6_PROMETHEUS_RW_TREND_AS_NATIVE_HISTOGRAM:-true}"
  echo "metrics → $RW (testid $TESTID)"
  echo "dashboard: http://localhost:3300/d/mvhd-load-test/load-and-stress-test?var-testid=$TESTID"
else
  echo "no Prometheus at $RW; metrics stay in the summary only"
fi

echo "k6 $SCENARIO against $BASE_URL, testid $TESTID"
k6 run "${out[@]}" --tag "testid=$TESTID" \
  -e "SCENARIO=$SCENARIO" -e "BASE_URL=$BASE_URL" -e "PROXY_URL=$PROXY_URL" \
  -e "TESTID=$TESTID" -e "SESSIONS=$SESSIONS" -e "TIME_SCALE=${TIME_SCALE:-1}" \
  -e "KC_USER=${KC_USER:-researcher}" -e "KC_PASSWORD=${KC_PASSWORD:-${KC_USER:-researcher}}" \
  -e "SUMMARY_PATH=$RESULTS/$TESTID.json" \
  "$HERE/platform.js"
echo "summary: $RESULTS/$TESTID.json"
