#!/usr/bin/env bash
# =============================================================================
# Hold a deploy while a k6 run against the live hub is on (#571).
# =============================================================================
# deploy-azure.yml runs this right before it replaces mvhd-ui and the proxy.
#
# Two signals, because neither alone is enough:
#
#   LOAD_TEST_RUNNING  the repository variable, "<testid> <start, UTC>", set by
#                      scripts/azure/run-load-test.sh and load-tests/run.sh.
#                      The workflow passes it in from the `vars` context, which
#                      is read once when the job starts and never again: the
#                      workflow token cannot read variables through the API
#                      (there is no `variables` permission to grant it; it
#                      answered 403 on every deploy until 2026-11-12).
#   mvhd-load-test     the Container Apps job that runs k6 inside Azure. Its
#                      executions are read live, every minute, so they tell
#                      when a run ends.
#
# The deploy goes ahead when no execution is running and either the variable
# was clear, or it names an execution that has ended, or it is older than four
# hours (a run that did not clean up). It waits while an execution runs, up
# to MAX_POLLS minutes. It fails, and so does not deploy, when the variable is
# set and cannot be followed: a run from a laptop (load-tests/run.sh), or the
# executions cannot be read. After that run, deploy again:
#   gh workflow run deploy-azure.yml --ref main
#
# Variables: LOAD_TEST_RUNNING, RESOURCE_GROUP, LOAD_TEST_JOB (mvhd-load-test),
# POLL_SECONDS (60), MAX_POLLS (180), STALE_SECONDS (14400).
set -euo pipefail

HOLD="${LOAD_TEST_RUNNING:-}"
RG="${RESOURCE_GROUP:-rg-mvhd-dev}"
JOB="${LOAD_TEST_JOB:-mvhd-load-test}"
POLL="${POLL_SECONDS:-60}"
MAX="${MAX_POLLS:-180}"
STALE="${STALE_SECONDS:-14400}"
REDEPLOY="gh workflow run deploy-azure.yml --ref main"

summary() {
  echo "$1"
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then echo "${1#::*::}" >> "$GITHUB_STEP_SUMMARY"; fi
}

# ISO 8601 (with or without fractions, Z or +00:00) to epoch seconds; 0 if unreadable.
epoch() {
  jq -nr --arg s "$1" '$s | sub("\\.[0-9]+"; "") | sub("\\+00:00$"; "Z") | fromdateiso8601' 2>/dev/null || echo 0
}

testid=""
start=0
if [ -n "$HOLD" ]; then
  testid="${HOLD%% *}"
  start="$(epoch "${HOLD#* }")"
  age=$(($(date -u +%s) - start))
  if [ "$start" -gt 0 ] && [ "$age" -gt "$STALE" ]; then
    summary "::warning::LOAD_TEST_RUNNING=$HOLD is older than $((STALE / 3600)) hours, a run that did not clean up; ignoring it (gh variable delete LOAD_TEST_RUNNING)"
    HOLD=""
  else
    echo "LOAD_TEST_RUNNING=$HOLD when this job started"
  fi
else
  echo "LOAD_TEST_RUNNING was clear when this job started"
fi

errfile="$(mktemp)"
trap 'rm -f "$errfile"' EXIT

waited=0
for _ in $(seq 1 "$MAX"); do
  if ! executions="$(az containerapp job execution list --name "$JOB" --resource-group "$RG" -o json 2>"$errfile")"; then
    if grep -qiE 'ResourceNotFound|was not found|could not be found' "$errfile"; then
      executions="[]"
    elif [ -n "$HOLD" ]; then
      summary "::error::LOAD_TEST_RUNNING=$HOLD is set and the executions of $JOB cannot be read ($(tr '\n' ' ' < "$errfile")), so there is no telling when the run ends. Deploy held: after the run, $REDEPLOY"
      exit 1
    else
      summary "::warning::could not read the executions of $JOB ($(tr '\n' ' ' < "$errfile")); LOAD_TEST_RUNNING was clear when this job started; deploying"
      exit 0
    fi
  fi

  running="$(jq -r '[.[] | select(.properties.status == "Running" or .properties.status == "Processing") | .name] | join(" ")' <<<"$executions")"
  if [ -n "$running" ]; then
    if [ "$waited" -eq 0 ]; then
      summary "::notice::load test execution $running of $JOB is running; the deploy waits for it (up to $MAX minutes)"
    fi
    waited=$((waited + 1))
    sleep "$POLL"
    continue
  fi

  if [ -z "$HOLD" ]; then
    [ "$waited" -eq 0 ] || summary "::notice::the load test ended after about $waited minutes; deploying"
    exit 0
  fi

  # The execution the variable names: its TESTID, or one started within
  # fifteen minutes of the hold (run-load-test.sh sets it right before the start).
  held="$(jq -r --arg t "$testid" --argjson s "$start" '
    def ts: (. // "") | sub("\\.[0-9]+"; "") | sub("\\+00:00$"; "Z") | (try fromdateiso8601 catch 0);
    [.[] | select(
        any(.properties.template.containers[]?.env[]?; .name == "TESTID" and .value == $t)
        or ($s > 0 and (.properties.startTime | ts) as $e | $e >= $s - 120 and $e <= $s + 900))
      | "\(.name) \(.properties.status)"] | first // ""' <<<"$executions")"
  if [ -n "$held" ]; then
    summary "::notice::LOAD_TEST_RUNNING=$HOLD is execution ${held% *} of $JOB, now ${held#* }; deploying"
    exit 0
  fi

  summary "::error::LOAD_TEST_RUNNING=$HOLD was set when this job started and names no execution of $JOB, so it is a run this step cannot follow (k6 from a laptop, load-tests/run.sh). Deploy held: after the run, $REDEPLOY. If no run is on: gh variable delete LOAD_TEST_RUNNING"
  exit 1
done

summary "::error::a load test was still running after $MAX minutes. Deploy held: after the run, $REDEPLOY"
exit 1
