#!/usr/bin/env bash
# =============================================================================
# A k6 run against the live hub from inside the Azure environment (#519).
# =============================================================================
#   run-load-test.sh <scenario> [testid]     smoke | load | stress | spike | soak | audited | contracts | proxy | signin
#
# The run is the Container Apps job mvhd-load-test (load-tests/azure): its
# metrics go to mvhd-observability's Prometheus, so the whole run, k6 rows and
# server-side rows, shows on https://grafana.ehds.mabu.red. load-tests/run.sh
# remains the way to run k6 from the laptop.
#
# Variables: TIME_SCALE, ABORT_ON=failures, KC_USER/KC_PASSWORD (signin), YES=1
# (no question for stress, spike or soak), WAIT=0 (do not wait for the end).
#
# Sessions are forged here (8 hours valid) and handed to the job as a secret;
# nothing is printed. Jobs need the PIM role rol-ssg-prd-project_owner active:
# Container Apps Contributor has no Microsoft.App/jobs action.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
# shellcheck source=env.sh
source "${SCRIPT_DIR}/env.sh"

SCENARIO="${1:-}"
case "$SCENARIO" in
  smoke | load | stress | spike | soak | audited | contracts | proxy | signin) ;;
  *) sed -n '5,13p' "$0"; exit 64 ;;
esac
TESTID="${2:-$(date -u +%Y%m%d-%H%M)-${SCENARIO}-aca}"
JOB="mvhd-load-test"
BASE_URL="https://${CUSTOM_DOMAIN}"
GRAFANA_URL="https://grafana.${CUSTOM_DOMAIN}"

case "$SCENARIO" in
  stress | spike | soak)
    if [[ "${YES:-}" != 1 ]]; then
      echo "$SCENARIO scales the live apps out and costs money (ADR-053: inside office hours, announced)."
      read -r -p "Continue? [y/N] " answer
      [[ "$answer" == y ]] || exit 1
    fi ;;
esac

TAG="$(git -C "$REPO_ROOT" log -1 --format=%h -- load-tests)"
IMAGE="${ACR_LOGIN_SERVER}/mvhd-k6:${TAG}"
if ! az acr repository show-tags --name "$ACR_NAME" --repository mvhd-k6 -o tsv 2>/dev/null | grep -qx "$TAG"; then
  log "Building $IMAGE"
  az acr build --registry "$ACR_NAME" --image "mvhd-k6:${TAG}" \
    --file "${REPO_ROOT}/load-tests/azure/Dockerfile" "${REPO_ROOT}/load-tests" --no-logs -o none
fi

SESSIONS_FILE="$(mktemp)"
SPEC="$(mktemp)"
trap 'rm -f "$SESSIONS_FILE" "$SPEC"' EXIT
if [[ "$SCENARIO" != signin ]]; then
  log "Forging sessions"
  NEXTAUTH_SECRET="$(az containerapp secret show --name "$UI_APP" --resource-group "$RG" \
    --secret-name nextauth-secret --query value -o tsv)"
  NEXTAUTH_SECRET="$NEXTAUTH_SECRET" COOKIE_NAME="__Secure-next-auth.session-token" \
    SESSIONS="$SESSIONS_FILE" "${REPO_ROOT}/load-tests/forge-sessions.sh" >/dev/null
  unset NEXTAUTH_SECRET
else
  echo '{}' > "$SESSIONS_FILE"
fi

ENV_ID="$(az containerapp env show --name "$ACA_ENV" --resource-group "$RG" --query id -o tsv)"
ACR_PASSWORD="$(az acr credential show --name "$ACR_NAME" --query 'passwords[0].value' -o tsv)"
# The job, as YAML (flags cannot express every field). Secrets are written to
# the temporary file only, which the trap removes.
export SCENARIO TESTID BASE_URL ENV_ID IMAGE ACR_PASSWORD ACR_NAME ACR_LOGIN_SERVER LOCATION NEO4J_PROXY_APP
export TIME_SCALE="${TIME_SCALE:-1}" ABORT_ON="${ABORT_ON:-}" KC_USER="${KC_USER:-researcher}"
export KC_PASSWORD="${KC_PASSWORD:-${KC_USER}}"
python3 - "$SPEC" "$SESSIONS_FILE" <<'PY'
import json, os, sys
spec_path, sessions_path = sys.argv[1], sys.argv[2]
e = os.environ
env = {
    "SCENARIO": e["SCENARIO"], "TESTID": e["TESTID"], "BASE_URL": e["BASE_URL"],
    "PROXY_URL": "http://" + e["NEO4J_PROXY_APP"], "TIME_SCALE": e["TIME_SCALE"],
    "ABORT_ON": e["ABORT_ON"], "KC_USER": e["KC_USER"],
    "K6_PROMETHEUS_RW_SERVER_URL": "http://mvhd-observability:9090/api/v1/write",
}
spec = {
    "location": e["LOCATION"],
    "properties": {
        "environmentId": e["ENV_ID"],
        "configuration": {
            "triggerType": "Manual",
            "replicaTimeout": 10800,
            "replicaRetryLimit": 0,
            "manualTriggerConfig": {"parallelism": 1, "replicaCompletionCount": 1},
            "registries": [{"server": e["ACR_LOGIN_SERVER"], "username": e["ACR_NAME"],
                            "passwordSecretRef": "acr-password"}],
            "secrets": [
                {"name": "acr-password", "value": e["ACR_PASSWORD"]},
                {"name": "sessions-json", "value": open(sessions_path).read()},
                {"name": "kc-password", "value": e["KC_PASSWORD"]},
            ],
        },
        "template": {"containers": [{
            "name": "k6", "image": e["IMAGE"],
            "resources": {"cpu": 2.0, "memory": "4Gi"},
            "env": [{"name": k, "value": v} for k, v in env.items()]
                   + [{"name": "SESSIONS_JSON", "secretRef": "sessions-json"},
                      {"name": "KC_PASSWORD", "secretRef": "kc-password"}],
        }]},
    },
}
json.dump(spec, open(spec_path, "w"))
PY
unset ACR_PASSWORD KC_PASSWORD
if az containerapp job show --name "$JOB" --resource-group "$RG" --query name -o tsv >/dev/null 2>&1; then
  log "Updating job $JOB"
  az containerapp job update --name "$JOB" --resource-group "$RG" --yaml "$SPEC" -o none
else
  log "Creating job $JOB"
  az containerapp job create --name "$JOB" --resource-group "$RG" --yaml "$SPEC" -o none
fi
rm -f "$SPEC" "$SESSIONS_FILE"

log "Starting $SCENARIO, testid $TESTID"
EXECUTION="$(az containerapp job start --name "$JOB" --resource-group "$RG" --query name -o tsv)"
ok "execution $EXECUTION"
echo "Watch: ${GRAFANA_URL}/d/mvhd-load-test/load-and-stress-test?var-testid=${TESTID}&from=now-30m&to=now&refresh=10s"
[[ "${WAIT:-1}" == 1 ]] || exit 0

while true; do
  state="$(az containerapp job execution show --name "$JOB" --resource-group "$RG" \
    --job-execution-name "$EXECUTION" --query properties.status -o tsv)"
  case "$state" in
    Succeeded) ok "$EXECUTION succeeded (k6 thresholds held)"; exit 0 ;;
    Failed) warn "$EXECUTION failed: k6 exits non-zero when a threshold is crossed; read the run on Grafana"; exit 1 ;;
    Stopped | Degraded) warn "$EXECUTION $state"; exit 1 ;;
  esac
  sleep 30
done
