#!/bin/sh
# Runs one scenario with what run.sh would pass, from the job's environment.
# The forged sessions arrive as the secret SESSIONS_JSON and stay in /tmp.
set -eu
umask 077
printf '%s' "${SESSIONS_JSON:-{\}}" > /tmp/sessions.json
export K6_PROMETHEUS_RW_TREND_AS_NATIVE_HISTOGRAM="${K6_PROMETHEUS_RW_TREND_AS_NATIVE_HISTOGRAM:-true}"
echo "k6 ${SCENARIO} against ${BASE_URL}, testid ${TESTID}, metrics to ${K6_PROMETHEUS_RW_SERVER_URL}"
exec k6 run -o experimental-prometheus-rw --tag "testid=${TESTID}" \
  -e "SCENARIO=${SCENARIO}" -e "BASE_URL=${BASE_URL}" -e "PROXY_URL=${PROXY_URL:-}" \
  -e "TESTID=${TESTID}" -e "SESSIONS=/tmp/sessions.json" -e "TIME_SCALE=${TIME_SCALE:-1}" \
  -e "ABORT_ON=${ABORT_ON:-}" \
  -e "KC_USER=${KC_USER:-researcher}" -e "KC_PASSWORD=${KC_PASSWORD:-${KC_USER:-researcher}}" \
  /scripts/platform.js
