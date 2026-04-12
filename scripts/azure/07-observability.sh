#!/usr/bin/env bash
# Phase 7: Observability — diagnostic settings, alerts, KQL saved queries, dashboard.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/env.sh"

log "Phase 7: Observability"

# ── Get resource IDs ─────────────────────────────────────────────────────────
LAW_RESOURCE_ID=$(az monitor log-analytics workspace show \
  --resource-group "$RG" --workspace-name "$LAW_NAME" \
  --query "id" -o tsv)
ACA_ENV_ID=$(az containerapp env show --name "$ACA_ENV" --resource-group "$RG" \
  --query "id" -o tsv)
SUB_ID=$(az account show --query "id" -o tsv)

# ── Diagnostic settings ─────────────────────────────────────────────────────
log "Creating diagnostic settings for ACA environment..."
az monitor diagnostic-settings create \
  --name "mvhd-diagnostics" \
  --resource "$ACA_ENV_ID" \
  --workspace "$LAW_RESOURCE_ID" \
  --logs '[
    {"category":"ContainerAppConsoleLogs","enabled":true},
    {"category":"ContainerAppSystemLogs","enabled":true}
  ]' \
  --metrics '[{"category":"AllMetrics","enabled":true}]' \
  -o none 2>/dev/null || warn "Diagnostic settings may already exist"
ok "Diagnostic settings"

# ── Metric alerts ────────────────────────────────────────────────────────────
create_replica_alert() {
  local name="$1" app_name="$2"
  log "Creating alert: ${name}..."
  az monitor metrics alert create \
    --resource-group "$RG" --name "$name" \
    --scopes "$ACA_ENV_ID" \
    --condition "avg Replicas < 1" \
    --dimension "containerAppName=${app_name}" \
    --window-size 5m --evaluation-frequency 1m \
    --severity 1 --description "Alert when ${app_name} has 0 replicas" \
    -o none 2>/dev/null || warn "Alert ${name} may already exist"
  ok "Alert ${name}"
}

create_replica_alert "mvhd-ui-down" "$UI_APP"
create_replica_alert "mvhd-keycloak-down" "$KEYCLOAK_APP"
create_replica_alert "mvhd-neo4j-down" "$NEO4J_APP"

# ── Saved KQL queries ───────────────────────────────────────────────────────
log "Creating saved KQL queries..."

save_query() {
  local display_name="$1" query="$2" query_id="$3"
  az monitor log-analytics workspace saved-search create \
    --resource-group "$RG" --workspace-name "$LAW_NAME" \
    --name "$query_id" \
    --display-name "$display_name" \
    --category "MVHD Monitoring" \
    --query "$query" \
    -o none 2>/dev/null || warn "Query ${display_name} may already exist"
  ok "Query: ${display_name}"
}

save_query "MVHD Errors" \
  'ContainerAppConsoleLogs_CL | where Log_s contains "error" or Log_s contains "ERROR" | project TimeGenerated, ContainerAppName_s, Log_s | order by TimeGenerated desc | take 100' \
  "mvhd-errors"

save_query "MVHD Service Health" \
  'ContainerAppConsoleLogs_CL | summarize LastSeen=max(TimeGenerated), LogCount=count() by ContainerAppName_s | order by LastSeen desc' \
  "mvhd-health"

save_query "MVHD Auth Events" \
  'ContainerAppConsoleLogs_CL | where ContainerAppName_s == "mvhd-keycloak" | where Log_s contains "LOGIN" or Log_s contains "LOGOUT" or Log_s contains "LOGIN_ERROR" | project TimeGenerated, Log_s | order by TimeGenerated desc | take 100' \
  "mvhd-auth"

save_query "MVHD Neo4j Activity" \
  'ContainerAppConsoleLogs_CL | where ContainerAppName_s in ("mvhd-neo4j", "mvhd-neo4j-proxy") | project TimeGenerated, ContainerAppName_s, Log_s | order by TimeGenerated desc | take 100' \
  "mvhd-neo4j"

# ── Portal dashboard ─────────────────────────────────────────────────────────
log "Creating portal dashboard..."
DASHBOARD_JSON=$(cat <<DASH
{
  "lenses": {
    "0": {
      "order": 0,
      "parts": {
        "0": {
          "position": {"x": 0, "y": 0, "colSpan": 6, "rowSpan": 4},
          "metadata": {
            "type": "Extension/HubsExtension/PartType/MonitorChartPart",
            "inputs": [],
            "settings": {"title": "MVHD Container Apps Overview"}
          }
        }
      }
    }
  },
  "metadata": {
    "model": {
      "timeRange": {"value": {"relative": {"duration": 24, "timeUnit": 1}}, "type": "MsPortalFx.Composition.Configuration.ValueTypes.TimeRange"}
    }
  }
}
DASH
)

az portal dashboard create \
  --resource-group "$RG" \
  --name "mvhd-monitoring" \
  --input-path <(echo "$DASHBOARD_JSON") \
  --location "$LOCATION" \
  -o none 2>/dev/null || warn "Dashboard may already exist or portal extension not available"
ok "Dashboard created (check Azure Portal > Dashboards)"

# ── Summary ──────────────────────────────────────────────────────────────────
log "Observability complete"
echo "  Diagnostic settings: mvhd-diagnostics"
echo "  Alerts:              mvhd-ui-down, mvhd-keycloak-down, mvhd-neo4j-down"
echo "  Saved queries:       mvhd-errors, mvhd-health, mvhd-auth, mvhd-neo4j"
echo "  Dashboard:           MVHD Health Dataspace Monitoring"
echo ""
echo "Access Log Analytics: Azure Portal > ${LAW_NAME} > Logs"
