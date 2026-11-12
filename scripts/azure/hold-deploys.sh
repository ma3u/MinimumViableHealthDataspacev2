#!/usr/bin/env bash
# =============================================================================
# The deploy hold while a k6 run is on against the live hub (#571, ADR-092).
# =============================================================================
#   hold-deploys.sh start <testid>   laptop: open the GitHub marker, print its id
#   hold-deploys.sh end <id>         laptop: close it
#   hold-deploys.sh check            one look at both signals; exit 1 if unreadable
#   hold-deploys.sh wait             deploy-azure.yml: wait while either is on
#
# Two signals, each readable by the deploy job without a stored credential:
#
#   azure   an execution of the Container Apps job mvhd-load-test in Running or
#           Processing (scripts/azure/run-load-test.sh). Read with the job's
#           Azure OIDC login; it ends with the run, so nothing has to clear it.
#   github  a deployment to the GitHub environment "load-test" whose latest
#           status is in_progress, queued or pending (load-tests/run.sh azure,
#           k6 on the laptop). Read with the workflow token (deployments: read).
#
# The repository variable LOAD_TEST_RUNNING this replaces could not be read by
# the workflow token at all (HTTP 403), and the step deployed on that error,
# so the hold never held (docs/gotchas.md, 2026-11-12).
#
# wait polls once a minute for up to WAIT_MINUTES (180; soak is two hours) and
# then deploys with a warning. A signal older than four hours is a run that did
# not clean up: ignored, with a warning. Three failed reads in a row fail the
# step: an unreadable signal stops the deploy, visibly, and the next push or a
# dispatch with ignore_load_test_hold=true goes ahead.
#
# Variables: RESOURCE_GROUP (rg-mvhd-dev), LOAD_TEST_JOB (mvhd-load-test),
# HOLD_ENVIRONMENT (load-test), AZURE_SIGNAL=skip (check only, off main where
# there is no Azure login), WAIT_MINUTES, POLL_SECONDS (60).
set -euo pipefail

RG="${RESOURCE_GROUP:-rg-mvhd-dev}"
JOB="${LOAD_TEST_JOB:-mvhd-load-test}"
ENVIRONMENT="${HOLD_ENVIRONMENT:-load-test}"
WAIT_MINUTES="${WAIT_MINUTES:-180}"
POLL_SECONDS="${POLL_SECONDS:-60}"
STALE_SECONDS=14400
MAX_READ_FAILURES=3

repo() {
  if [[ -n "${GITHUB_REPOSITORY:-}" ]]; then
    echo "$GITHUB_REPOSITORY"
  else
    gh repo view --json nameWithOwner --jq .nameWithOwner
  fi
}

# Seconds since an ISO 8601 UTC time; both APIs answer in UTC. 0 when the time
# cannot be read, so an odd value holds rather than releases.
age_of() {
  local t="${1:0:19}" epoch
  epoch="$(date -u -d "${t}Z" +%s 2>/dev/null || date -j -u -f '%Y-%m-%dT%H:%M:%S' "$t" +%s 2>/dev/null || echo "")"
  if [[ -z "$epoch" ]]; then echo 0; else echo $(($(date -u +%s) - epoch)); fi
}

# Each signal prints "<source> <name> <start>" per active run, or fails.
github_signal() {
  local r deployments id created desc state
  r="$(repo)" || return 1
  deployments="$(gh api "repos/${r}/deployments?environment=${ENVIRONMENT}&per_page=10" \
    --jq '.[] | "\(.id) \(.created_at) \(.description // "-")"')" || return 1
  while read -r id created desc; do
    [[ -n "$id" ]] || continue
    state="$(gh api "repos/${r}/deployments/${id}/statuses?per_page=1" --jq '.[0].state // "pending"')" || return 1
    case "$state" in
      in_progress | queued | pending) echo "github ${desc:-$id} ${created}" ;;
    esac
  done <<<"$deployments"
  return 0
}

azure_signal() {
  local err out name start
  if [[ "${AZURE_SIGNAL:-read}" == skip ]]; then
    echo "::warning::the Container Apps job was not checked (AZURE_SIGNAL=skip)" >&2
    return 0
  fi
  err="$(mktemp)"
  if ! out="$(az containerapp job execution list --name "$JOB" --resource-group "$RG" \
    --query "[?properties.status=='Running' || properties.status=='Processing'].[name, properties.startTime]" \
    -o tsv 2>"$err")"; then
    # No job yet means no run, not an unreadable signal.
    if grep -qE "ResourceNotFound|was not found|could not be found" "$err"; then
      rm -f "$err"
      return 0
    fi
    cat "$err" >&2
    rm -f "$err"
    return 1
  fi
  rm -f "$err"
  while read -r name start; do
    if [[ -n "$name" ]]; then echo "azure ${name} ${start}"; fi
  done <<<"$out"
  return 0
}

# The active runs, stale ones dropped with a warning; fails if a signal is unreadable.
active_runs() {
  local gh_out az_out source name start age
  gh_out="$(github_signal)" || { echo "the GitHub environment ${ENVIRONMENT} could not be read" >&2; return 1; }
  az_out="$(azure_signal)" || { echo "the executions of ${JOB} could not be read" >&2; return 1; }
  while read -r source name start; do
    [[ -n "$source" ]] || continue
    age="$(age_of "$start")"
    if ((age > STALE_SECONDS)); then
      echo "::warning::${source} ${name} started ${start}, over four hours ago: a run that did not clean up; ignored" >&2
      [[ "$source" == github ]] && echo "  close it: scripts/azure/hold-deploys.sh end <id> (gh api repos/$(repo)/deployments?environment=${ENVIRONMENT})" >&2
      continue
    fi
    echo "${source} ${name} ${start}"
  done <<<"$(printf '%s\n%s\n' "$gh_out" "$az_out")"
  return 0
}

# A long wait outlives the Azure access token of the job's OIDC login; log in
# again with a fresh GitHub OIDC token. Only in a workflow with id-token: write.
azure_relogin() {
  [[ -n "${ACTIONS_ID_TOKEN_REQUEST_URL:-}" && -n "${AZURE_CLIENT_ID:-}" ]] || return 0
  [[ "${AZURE_SIGNAL:-read}" != skip ]] || return 0
  local token
  token="$(curl -sSf -H "Authorization: bearer ${ACTIONS_ID_TOKEN_REQUEST_TOKEN}" \
    "${ACTIONS_ID_TOKEN_REQUEST_URL}&audience=api://AzureADTokenExchange" | jq -r .value)" || {
    echo "::warning::could not fetch a GitHub OIDC token to renew the Azure login" >&2
    return 0
  }
  az login --service-principal --username "$AZURE_CLIENT_ID" --tenant "$AZURE_TENANT_ID" \
    --federated-token "$token" -o none >/dev/null 2>&1 &&
    az account set --subscription "$AZURE_SUBSCRIPTION_ID" ||
    echo "::warning::could not renew the Azure login" >&2
}

cmd_check() {
  local runs
  runs="$(active_runs)" || return 1
  if [[ -z "$runs" ]]; then
    echo "no load test runs (checked: GitHub environment ${ENVIRONMENT}, Container Apps job ${JOB})"
  else
    echo "load test running:"
    echo "$runs" | sed 's/^/  /'
  fi
}

cmd_wait() {
  local i runs failures=0 waited=0 last=""
  for ((i = 1; i <= WAIT_MINUTES; i++)); do
    if ((i % 30 == 0)); then azure_relogin; fi
    if ! runs="$(active_runs)"; then
      failures=$((failures + 1))
      if ((failures >= MAX_READ_FAILURES)); then
        echo "::error::the load test hold could not be read ${failures} times in a row, so this deploy stops rather than redeploy under a run. Fix the read, or deploy anyway: gh workflow run deploy-azure.yml --ref main -f ignore_load_test_hold=true"
        return 1
      fi
      echo "::warning::read ${failures} of the load test hold failed; trying again"
      sleep "$POLL_SECONDS"
      continue
    fi
    failures=0
    if [[ -z "$runs" ]]; then
      echo "no load test runs (checked: GitHub environment ${ENVIRONMENT}, Container Apps job ${JOB}); deploying"
      if ((waited)); then azure_relogin; fi
      return 0
    fi
    if [[ "$runs" != "$last" ]]; then
      echo "::notice::load test running, the deploy waits: $(echo "$runs" | tr '\n' ';' | sed 's/;$//')"
      last="$runs"
    fi
    waited=1
    sleep "$POLL_SECONDS"
  done
  echo "::warning::a load test still runs after ${WAIT_MINUTES} minutes; deploying"
  azure_relogin
}

cmd_start() {
  local testid="${1:?testid}" r id
  r="$(repo)"
  id="$(jq -n --arg env "$ENVIRONMENT" --arg d "$testid" \
    '{ref: "main", environment: $env, task: "load-test", description: $d, auto_merge: false,
      required_contexts: [], transient_environment: true, production_environment: false}' |
    gh api -X POST "repos/${r}/deployments" --input - --jq .id)"
  gh api -X POST "repos/${r}/deployments/${id}/statuses" -f state=in_progress -f description="$testid" --silent
  echo "$id"
}

cmd_end() {
  local id="${1:?deployment id}"
  gh api -X POST "repos/$(repo)/deployments/${id}/statuses" -f state=inactive --silent
}

case "${1:-}" in
  start) cmd_start "${2:-}" ;;
  end) cmd_end "${2:-}" ;;
  check) cmd_check ;;
  wait) cmd_wait ;;
  *) sed -n '5,8p' "$0"; exit 64 ;;
esac
