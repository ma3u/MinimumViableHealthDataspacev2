#!/usr/bin/env bash
# =============================================================================
# Who hears about trouble: a crash-loop alert per app, a monthly budget, and
# then no daily log cap (#418 Phase A, ADR-045).
# =============================================================================
#   ALERT_EMAIL=<address> configure-alerts-and-budget.sh [--dry-run]
#   BUDGET_EUR=<amount> overrides the monthly budget (default 1000, decided
#   2026-10-04 on #418).
#
# Until now nothing told anyone: the replica alerts in 07-observability.sh have
# no action group, there was no budget, and the only cost guard was a 1 GB
# daily cap on the Log Analytics workspace, which guards by throwing logs away.
# This sets, idempotently:
#
#   1. action group mvhd-alerts, mailing ALERT_EMAIL. The address is given at
#      run time and not committed: this repository is public.
#   2. per Container App, mvhd-crashloop-<app>: more than 3 restarts in 15
#      minutes. Restarts mean a crash, a failed probe or an OOM kill. A
#      planned stop (ADR-053) removes replicas rather than restarting them, so
#      the nightly stop should stay quiet; check the first night's mail.
#   3. budget mvhd-monthly on the resource group, BUDGET_EUR a month, mails at
#      50, 80 and 100 % of actual cost and at 100 % forecast.
#   4. only once 3 exists: the workspace's daily cap removed (quota -1), so a
#      busy day keeps its logs and the budget is what notices a loop.
#
# Re-running is safe: every step replaces what it made before.
#
# Needs write access to action groups, metric alerts, budgets and the
# workspace: Contributor on the resource group. The operator's account is
# Container Apps Contributor only, so run it through the workflow
# .github/workflows/configure-alerts-and-budget.yml (dispatch from main).
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/env.sh"

dry_run=""
[ "${1:-}" = "--dry-run" ] && dry_run=1
: "${ALERT_EMAIL:?set ALERT_EMAIL, the address that gets the alerts}"
BUDGET_EUR="${BUDGET_EUR:-1000}"

run() {
  if [ -n "$dry_run" ]; then
    printf '  would run:'; printf ' %q' "$@"; printf '\n'
  else
    "$@"
  fi
}

SUB_ID=$(az account show --query id -o tsv)

# ── 1. Action group ──────────────────────────────────────────────────────────
log "Action group mvhd-alerts"
run az monitor action-group create --resource-group "$RG" --name mvhd-alerts \
  --short-name mvhdalerts --action email operator "$ALERT_EMAIL" -o none
AG_ID="/subscriptions/${SUB_ID}/resourceGroups/${RG}/providers/microsoft.insights/actionGroups/mvhd-alerts"

# ── 2. Crash-loop alert per app ──────────────────────────────────────────────
log "Crash-loop alerts (more than 3 restarts in 15 min)"
for app in $(az containerapp list --resource-group "$RG" --query "[].name" -o tsv); do
  app_id=$(az containerapp show --name "$app" --resource-group "$RG" --query id -o tsv)
  run az monitor metrics alert create --resource-group "$RG" \
    --name "mvhd-crashloop-${app}" --scopes "$app_id" \
    --condition "total RestartCount > 3" \
    --window-size 15m --evaluation-frequency 5m --severity 2 \
    --description "${app} restarted more than 3 times in 15 minutes: crash loop, failed probe or OOM kill (#418)" \
    --action "$AG_ID" -o none
  echo "  mvhd-crashloop-${app}"
done

# ── 3. Monthly budget ────────────────────────────────────────────────────────
log "Budget mvhd-monthly: ${BUDGET_EUR} EUR a month"
start=$(date -u +%Y-%m-01)
budget_body=$(python3 - "$BUDGET_EUR" "$ALERT_EMAIL" "$start" <<'EOF'
import json, sys
amount, email, start = float(sys.argv[1]), sys.argv[2], sys.argv[3]
def note(threshold, kind):
    return {"enabled": True, "operator": "GreaterThan", "threshold": threshold,
            "thresholdType": kind, "contactEmails": [email]}
print(json.dumps({"properties": {
    "category": "Cost", "amount": amount, "timeGrain": "Monthly",
    "timePeriod": {"startDate": f"{start}T00:00:00Z", "endDate": "2028-12-31T00:00:00Z"},
    "notifications": {
        "actual50": note(50, "Actual"), "actual80": note(80, "Actual"),
        "actual100": note(100, "Actual"), "forecast100": note(100, "Forecasted"),
    }}}))
EOF
)
run az rest --method put \
  --url "https://management.azure.com/subscriptions/${SUB_ID}/resourceGroups/${RG}/providers/Microsoft.Consumption/budgets/mvhd-monthly?api-version=2023-05-01" \
  --body "$budget_body" -o none

# ── 4. Daily cap off, only with the budget in place ─────────────────────────
if [ -z "$dry_run" ]; then
  az consumption budget show --budget-name mvhd-monthly --resource-group "$RG" -o none ||
    { warn "Budget not found; keeping the daily cap"; exit 1; }
fi
az monitor log-analytics workspace show --resource-group "$RG" --workspace-name "$LAW_NAME" -o none ||
  { warn "Workspace $LAW_NAME not found; set LAW_NAME"; exit 1; }
log "Log Analytics daily cap off ($LAW_NAME)"
run az monitor log-analytics workspace update --resource-group "$RG" \
  --workspace-name "$LAW_NAME" --quota -1 -o none

ok "Alerts to the operator, budget ${BUDGET_EUR} EUR/month, no daily log cap"
