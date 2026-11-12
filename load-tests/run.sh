#!/usr/bin/env bash
# Runs one k6 scenario against the compose stack or the live hub (#519), with
# the metrics streamed to the local Grafana and the summary kept for the report.
#
#   load-tests/run.sh <scenario> [local|azure|<base url>]
#
#   scenario   smoke | load | stress | spike | soak | audited | contracts | proxy | signin
#   target     local  = http://localhost:3003 (default), proxy on :9090
#              azure  = https://ehds.mabu.red; needs NEXTAUTH_SECRET exported
#
# Needs k6 (brew install k6) and, for the dashboard, the observability stack:
#   docker compose -f docker-compose.observability.yml up -d
# Without it the run still works; only the Grafana panels stay empty.
#
# Variables: TESTID (default <date>-<scenario>-<target>), TIME_SCALE (0.05
# shortens every stage for a dry run), ABORT_ON=failures (stress, spike, soak:
# abort on failed requests only, not on latency), KC_USER/KC_PASSWORD (signin), YES=1
# (skip the confirmation for a stress, spike or soak run against azure),
# AGREEMENT_TIMEOUT_S (contracts: how long a negotiation may take to agree, 60).
# K6_JSON=1 also writes every sample to results/<testid>.ndjson, for the p95
# per endpoint without Prometheus (load-tests/README.md, "Per endpoint").
#
# A run against azure opens a deployment to the GitHub environment "load-test"
# for its duration, and deploy-azure.yml waits while it is open (#571, ADR-092;
# scripts/azure/hold-deploys.sh). It refuses to start while a deploy is past
# its hold step (DEPLOY_CHECK=skip starts anyway).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HERE="$ROOT/load-tests"
SCENARIO="${1:-}"
TARGET="${2:-local}"
case "$SCENARIO" in
  smoke|load|stress|spike|soak|audited|contracts|proxy|signin) ;;
  *) sed -n '2,20p' "$0"; exit 2 ;;
esac
command -v k6 >/dev/null || { echo "k6 is not installed (brew install k6)" >&2; exit 1; }

case "$TARGET" in
  local)
    BASE_URL="${BASE_URL:-http://localhost:3003}"
    PROXY_URL="${PROXY_URL:-http://localhost:9090}"
    COOKIE_NAME="${COOKIE_NAME:-next-auth.session-token}"
    DSP_ADDRESS="${DSP_ADDRESS:-http://controlplane:8082/api/dsp}"
    ;;
  azure)
    BASE_URL="${BASE_URL:-https://ehds.mabu.red}"
    PROXY_URL=""
    COOKIE_NAME="${COOKIE_NAME:-__Secure-next-auth.session-token}"
    DSP_ADDRESS="${DSP_ADDRESS:-http://mvhd-controlplane:8082/api/dsp}"
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
  http*)
    BASE_URL="${TARGET%/}"; PROXY_URL="${PROXY_URL:-}"; COOKIE_NAME="${COOKIE_NAME:-__Secure-next-auth.session-token}"
    if [ "$SCENARIO" = contracts ] && [ -z "${DSP_ADDRESS:-}" ]; then
      echo "contracts against $BASE_URL needs DSP_ADDRESS: the provider's DSP base as that hub's control plane reaches it" >&2
      exit 2
    fi ;;
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
if curl -s -o /dev/null -m 10 "${RW%/api/v1/write}/-/ready"; then
  out=(-o experimental-prometheus-rw)
  export K6_PROMETHEUS_RW_SERVER_URL="$RW"
  export K6_PROMETHEUS_RW_TREND_AS_NATIVE_HISTOGRAM="${K6_PROMETHEUS_RW_TREND_AS_NATIVE_HISTOGRAM:-true}"
  echo "metrics → $RW (testid $TESTID)"
  echo "dashboard: http://localhost:3300/d/mvhd-load-test/load-and-stress-test?var-testid=$TESTID"
else
  echo "no Prometheus at $RW; metrics stay in the summary only"
fi

if [ "${K6_JSON:-}" = 1 ]; then
  out+=(-o "json=$RESULTS/$TESTID.ndjson")
  echo "samples → $RESULTS/$TESTID.ndjson"
fi

if [ "$TARGET" = azure ]; then
  # Deploys wait while this deployment is open (deploy-azure.yml); closed when k6 exits.
  if HOLD_ID="$(cd "$ROOT" && scripts/azure/hold-deploys.sh start "$TESTID" 2>/dev/null)"; then
    trap '(cd "$ROOT" && scripts/azure/hold-deploys.sh end "$HOLD_ID" 2>/dev/null) || echo "release the deploys: scripts/azure/hold-deploys.sh end $HOLD_ID" >&2' EXIT
    echo "deploys wait: load-test deployment $HOLD_ID ($TESTID)"
    # The hold is open, so a deploy not yet past its hold step waits; one that
    # is past it replaces the UI and the proxy now (hold-deploys.sh deploying).
    if [ "${DEPLOY_CHECK:-on}" != skip ]; then
      rc=0; deploying="$(cd "$ROOT" && scripts/azure/hold-deploys.sh deploying)" || rc=$?
      if [ "$rc" -eq 3 ]; then
        echo "a deploy is replacing the UI and the proxy; start the run when it has finished:" >&2
        echo "$deploying" >&2
        exit 1
      elif [ "$rc" -ne 0 ]; then
        echo "could not check for a deploy in progress; DEPLOY_CHECK=skip starts anyway" >&2
        exit 1
      fi
    fi
  else
    echo "could not open the deploy hold (gh signed in?): a merge to main would redeploy during the run" >&2
  fi
fi

echo "k6 $SCENARIO against $BASE_URL, testid $TESTID"
k6 run ${out[@]+"${out[@]}"} --tag "testid=$TESTID" \
  -e "SCENARIO=$SCENARIO" -e "BASE_URL=$BASE_URL" -e "PROXY_URL=$PROXY_URL" \
  -e "TESTID=$TESTID" -e "SESSIONS=$SESSIONS" -e "TIME_SCALE=${TIME_SCALE:-1}" \
  -e "ABORT_ON=${ABORT_ON:-}" -e "DSP_ADDRESS=${DSP_ADDRESS:-}" \
  -e "AGREEMENT_TIMEOUT_S=${AGREEMENT_TIMEOUT_S:-60}" \
  -e "KC_USER=${KC_USER:-researcher}" -e "KC_PASSWORD=${KC_PASSWORD:-${KC_USER:-researcher}}" \
  -e "SUMMARY_PATH=$RESULTS/$TESTID.json" \
  "$HERE/platform.js"
echo "summary: $RESULTS/$TESTID.json"
