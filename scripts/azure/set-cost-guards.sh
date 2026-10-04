#!/usr/bin/env bash
# =============================================================================
# Cost guards for rg-mvhd-dev: a budget, a crash-loop alert, no ingestion cap.
# =============================================================================
#   set-cost-guards.sh [monthly budget in the billing currency, default 450]
#
# ADR-045 decisions 13 to 16 and runbook docs/knowledge/runbooks/cost-efficient-logging.md
# Phase A items 4 and 5 (#418). Safe to re-run: every call is a PUT.
#
# 1. Action group `mvhd-ops`: notifies the subscription's Owners by role, so no
#    address is written into the repository.
# 2. Log alert `mvhd-crash-loop`: any app with more than 3 terminated
#    containers in 15 minutes. Crash loops, not traffic, were the log bill:
#    Neo4j on SMB from 2026-09-22, the EDC services without databases, the
#    data planes on one port. Each looked "Running" to `az containerapp list`.
#    One evening stop or one deploy terminates one or two containers per app,
#    which stays under the threshold.
# 3. Monthly budget `mvhd-monthly` on the resource group, alerts at 50, 80 and
#    100 % of actual cost and at 100 % of forecast. The budget, not a cap, is the
#    guard: a cap stops ingestion, and with it the logs a crash loop leaves.
# 4. Log Analytics daily cap removed (it was 1 GB). Only after 3 succeeded.
#
# `az monitor scheduled-query` needs an extension that fails on some machines
# (`No module named 'rpds.rpds'`), so the rule and the action group go through
# `az rest`.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/env.sh"

amount="${1:-450}"
SUB_ID=$(az account show --query id -o tsv)
RG_ID="/subscriptions/${SUB_ID}/resourceGroups/${RG}"
LAW_ID=$(az monitor log-analytics workspace show --resource-group "$RG" \
  --workspace-name "$LAW_NAME" --query id -o tsv)
OWNER_ROLE_ID="8e3af657-a8ff-443c-a75c-2fe8c4bcb635"
AG_ID="${RG_ID}/providers/Microsoft.Insights/actionGroups/mvhd-ops"

# ── 1. Action group ──────────────────────────────────────────────────────────
log "Action group mvhd-ops (subscription Owners)..."
az rest --method put --url "https://management.azure.com${AG_ID}?api-version=2023-01-01" \
  --body "$(
    cat <<JSON
{"location": "Global",
 "properties": {"groupShortName": "mvhd-ops", "enabled": true,
   "armRoleReceivers": [{"name": "owners", "roleId": "${OWNER_ROLE_ID}",
                         "useCommonAlertSchema": true}]}}
JSON
  )" -o none
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

# ── 3. Budget ────────────────────────────────────────────────────────────────
log "Budget mvhd-monthly (${amount} per month)..."
start=$(date -u +%Y-%m-01)
body=$(AMOUNT="$amount" START="$start" python3 - <<'PY'
import json, os
def note(threshold, kind):
    return {"enabled": True, "operator": "GreaterThanOrEqualTo", "threshold": threshold,
            "thresholdType": kind, "contactRoles": ["Owner"]}
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
