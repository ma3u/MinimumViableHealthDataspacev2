#!/usr/bin/env bash
# =============================================================================
# Cost guards for rg-mvhd-dev: a budget, a crash-loop alert, an alert on a
# failed off-hours job, no ingestion cap.
# =============================================================================
#   [ALERT_EMAIL=<address>] set-cost-guards.sh [monthly budget, default 1000]
#
# ADR-045 decisions 13 to 16 and runbook docs/knowledge/runbooks/cost-efficient-logging.md
# Phase A items 4 and 5 (#418). Safe to re-run: every call is a PUT.
#
# 1. Action group `mvhd-ops`: notifies the subscription's Owners by role and,
#    when ALERT_EMAIL is set (the workflow passes the repository secret), the
#    operator, who is not an Owner. No address is written into the repository.
# 2. Log alert `mvhd-crash-loop`: any app with more than 3 terminated
#    containers in 15 minutes. Crash loops, not traffic, were the log bill:
#    Neo4j on SMB from 2026-09-22, the EDC services without databases, the
#    data planes on one port. Each looked "Running" to `az containerapp list`.
#    One evening stop or one deploy terminates one or two containers per app,
#    which stays under the threshold.
# 2b. Metric alerts `mvhd-offhours-stop-failed` and `mvhd-offhours-start-failed`:
#    an execution of either off-hours job ended Failed (#595, ADR-058). The
#    stop is what keeps the bill down at night (ADR-053), and a failed one
#    leaves the whole stack running. A run that never fires is covered by
#    aca-schedule.yml, which runs an hour later and decides for itself.
#    The jobs' `Executions` metric counts executions by `state` once a minute.
# 3. Monthly budget `mvhd-monthly` on the resource group, alerts at 50, 80 and
#    100 % of actual cost and at 100 % of forecast, to the same recipients. The budget, not a cap, is the
#    guard: a cap stops ingestion, and with it the logs a crash loop leaves.
# 4. Log Analytics daily cap removed (it was 1 GB). Only after 3 succeeded.
#
# `az monitor scheduled-query` needs an extension that fails on some machines
# (`No module named 'rpds.rpds'`), so the rule and the action group go through
# `az rest`.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/env.sh"

amount="${1:-1000}"
# Decided 2026-10-04 on #418: 1000 EUR a month, alerts also to the operator's
# address. The address comes from the ALERT_EMAIL secret, never the repo.
alert_email="${ALERT_EMAIL:-}"
SUB_ID=$(az account show --query id -o tsv)
RG_ID="/subscriptions/${SUB_ID}/resourceGroups/${RG}"
LAW_ID=$(az monitor log-analytics workspace show --resource-group "$RG" \
  --workspace-name "$LAW_NAME" --query id -o tsv)
OWNER_ROLE_ID="8e3af657-a8ff-443c-a75c-2fe8c4bcb635"
AG_ID="${RG_ID}/providers/Microsoft.Insights/actionGroups/mvhd-ops"

# ── 1. Action group ──────────────────────────────────────────────────────────
log "Action group mvhd-ops (subscription Owners${alert_email:+ and the operator})..."
ag_body=$(OWNER_ROLE_ID="$OWNER_ROLE_ID" ALERT_EMAIL="$alert_email" python3 - <<'PY'
import json, os
props = {"groupShortName": "mvhd-ops", "enabled": True,
         "armRoleReceivers": [{"name": "owners", "roleId": os.environ["OWNER_ROLE_ID"],
                               "useCommonAlertSchema": True}]}
if os.environ["ALERT_EMAIL"]:
    props["emailReceivers"] = [{"name": "operator", "emailAddress": os.environ["ALERT_EMAIL"],
                                "useCommonAlertSchema": True}]
print(json.dumps({"location": "Global", "properties": props}))
PY
)
az rest --method put --url "https://management.azure.com${AG_ID}?api-version=2023-01-01" \
  --body "$ag_body" -o none
ok "Action group mvhd-ops"

# ── 2. Crash-loop alert ──────────────────────────────────────────────────────
log "Log alert mvhd-crash-loop..."
query='ContainerAppSystemLogs_CL | where Reason_s == "ContainerTerminated" | summarize restarts = count() by ContainerAppName_s | where restarts > 3'
body=$(QUERY="$query" LAW_ID="$LAW_ID" AG_ID="$AG_ID" LOCATION="$LOCATION" python3 - <<'PY'
import json, os
print(json.dumps({
  "location": os.environ["LOCATION"],
  "properties": {
    "displayName": "mvhd-crash-loop",
    "description": "An app terminated more than 3 containers in 15 minutes (#418, ADR-045).",
    "severity": 2, "enabled": True,
    "scopes": [os.environ["LAW_ID"]],
    "evaluationFrequency": "PT15M", "windowSize": "PT15M",
    "criteria": {"allOf": [{
      "query": os.environ["QUERY"], "timeAggregation": "Count",
      "dimensions": [{"name": "ContainerAppName_s", "operator": "Include", "values": ["*"]}],
      "operator": "GreaterThan", "threshold": 0,
      "failingPeriods": {"numberOfEvaluationPeriods": 1, "minFailingPeriodsToAlert": 1}}]},
    "autoMitigate": True,
    "actions": {"actionGroups": [os.environ["AG_ID"]]}}}))
PY
)
az rest --method put \
  --url "https://management.azure.com${RG_ID}/providers/Microsoft.Insights/scheduledQueryRules/mvhd-crash-loop?api-version=2023-03-15-preview" \
  --body "$body" -o none
ok "Log alert mvhd-crash-loop"

# ── 2b. Off-hours job failures ───────────────────────────────────────────────
for job in mvhd-offhours-stop mvhd-offhours-start; do
  rule="${job}-failed"
  log "Metric alert ${rule}..."
  job_id="${RG_ID}/providers/Microsoft.App/jobs/${job}"
  az rest --method get --url "https://management.azure.com${job_id}?api-version=2024-03-01" -o none \
    || { err "${job} does not exist; run scripts/azure/18-offhours-jobs.sh first"; exit 1; }
  body=$(JOB="$job" JOB_ID="$job_id" AG_ID="$AG_ID" python3 - <<'PY'
import json, os
job = os.environ["JOB"]
print(json.dumps({
  "location": "global",
  "properties": {
    "description": f"An execution of {job} ended Failed (#595, ADR-058). Its log: "
                   f"az containerapp job execution list -n {job} -g rg-mvhd-dev",
    "severity": 2, "enabled": True,
    "scopes": [os.environ["JOB_ID"]],
    "evaluationFrequency": "PT5M", "windowSize": "PT30M",
    "criteria": {
      "odata.type": "Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria",
      "allOf": [{
        "name": "failed-executions", "criterionType": "StaticThresholdCriterion",
        "metricName": "Executions", "metricNamespace": "Microsoft.App/jobs",
        "dimensions": [{"name": "state", "operator": "Include", "values": ["Failed"]}],
        "operator": "GreaterThan", "threshold": 0, "timeAggregation": "Maximum"}]},
    "autoMitigate": True,
    "actions": [{"actionGroupId": os.environ["AG_ID"]}]}}))
PY
)
  az rest --method put \
    --url "https://management.azure.com${RG_ID}/providers/Microsoft.Insights/metricAlerts/${rule}?api-version=2018-03-01" \
    --body "$body" -o none
  ok "Metric alert ${rule}"
done

# ── 3. Budget ────────────────────────────────────────────────────────────────
log "Budget mvhd-monthly (${amount} per month)..."
start=$(date -u +%Y-%m-01)
body=$(AMOUNT="$amount" START="$start" ALERT_EMAIL="$alert_email" python3 - <<'PY'
import json, os
def note(threshold, kind):
    n = {"enabled": True, "operator": "GreaterThanOrEqualTo", "threshold": threshold,
         "thresholdType": kind, "contactRoles": ["Owner"]}
    if os.environ["ALERT_EMAIL"]:
        n["contactEmails"] = [os.environ["ALERT_EMAIL"]]
    return n
print(json.dumps({"properties": {
  "category": "Cost", "amount": float(os.environ["AMOUNT"]), "timeGrain": "Monthly",
  "timePeriod": {"startDate": os.environ["START"] + "T00:00:00Z"},
  "notifications": {"actual50": note(50, "Actual"), "actual80": note(80, "Actual"),
                    "actual100": note(100, "Actual"), "forecast100": note(100, "Forecasted")}}}))
PY
)
az rest --method put \
  --url "https://management.azure.com${RG_ID}/providers/Microsoft.Consumption/budgets/mvhd-monthly?api-version=2023-05-01" \
  --body "$body" -o none
ok "Budget mvhd-monthly"

# ── 4. No ingestion cap ──────────────────────────────────────────────────────
# ARM PATCH, not `az monitor log-analytics workspace update --quota -1`: on the
# GitHub runner that command dies inside the CLI with "deadlock detected by
# _ModuleLock('requests.structures')", twice in a row on 2026-10-04.
log "Removing the Log Analytics daily cap on ${LAW_NAME}..."
law_url="https://management.azure.com${LAW_ID}?api-version=2022-10-01"
az rest --method patch --url "$law_url" \
  --body '{"properties": {"workspaceCapping": {"dailyQuotaGb": -1}}}' -o none
cap=$(az rest --method get --url "$law_url" \
  --query "properties.workspaceCapping.dailyQuotaGb" -o tsv)
if [ "$cap" != "-1.0" ] && [ "$cap" != "-1" ]; then
  err "daily cap is ${cap} GB after the update, expected -1"
  exit 1
fi
ok "No daily cap; the budget is the guard"
