#!/usr/bin/env bash
# Pulls the live hub's side of a load test from Azure Monitor (#519): for every
# container app its replicas, CPU, memory, requests and restarts, and for the
# Flexible Server its CPU, burst credits and connections, at one-minute grain,
# into CSV files next to the k6 summary of the run.
#
#   scripts/azure/export-load-metrics.sh <testid> <start> <end>
#     start, end   ISO 8601 UTC, e.g. 2026-10-06T08:00:00Z (k6 prints the run's
#                  start; the summary JSON has the end)
#
# Output: load-tests/results/<testid>/azure-<app>.csv and azure-postgres.csv,
# one row per minute. Grafana has no Azure credentials, so this is how the
# platform's view joins the client's view in the report.
#
# Needs: az logged in (Monitoring Reader is enough).
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/env.sh"

TESTID="${1:-}"; START="${2:-}"; END="${3:-}"
[ -n "$TESTID" ] && [ -n "$START" ] && [ -n "$END" ] || { sed -n '2,15p' "$0"; exit 2; }
OUT="${SCRIPT_DIR}/../../load-tests/results/${TESTID}"
mkdir -p "$OUT"

# The apps a user's request touches, plus the ones a sign-in or a query touches.
APPS=(mvhd-ui mvhd-neo4j-proxy mvhd-neo4j mvhd-keycloak mvhd-controlplane mvhd-identityhub mvhd-issuerservice mvhd-dp-fhir mvhd-dp-omop mvhd-vault mvhd-nats)
# Microsoft.App/containerApps metrics (names read from list-definitions on
# 2026-10-05): replicas, CPU and memory as a share of the limit, the ingress's
# response time, requests, restarts, network bytes.
APP_METRICS="Replicas,CpuPercentage,MemoryPercentage,ResponseTime,Requests,RestartCount,RxBytes,TxBytes"
PG_METRICS="cpu_percent,cpu_credits_remaining,cpu_credits_consumed,active_connections,memory_percent,iops"

to_csv() {  # az monitor JSON on stdin → "time,metric,value" rows
  python3 -c '
import json, sys
d = json.load(sys.stdin)
print("time,metric,aggregation,value")
for m in d["value"]:
    name = m["name"]["value"]
    for ts in m["timeseries"]:
        for p in ts["data"]:
            stamp = p["timeStamp"]
            for agg in ("average", "total", "maximum"):
                if p.get(agg) is not None:
                    print(f"{stamp},{name},{agg},{p[agg]}")
'
}

for app in "${APPS[@]}"; do
  id=$(az containerapp show -n "$app" -g "$RG" --query id -o tsv 2>/dev/null || true)
  [ -n "$id" ] || { log "skip $app (not found)"; continue; }
  az monitor metrics list --resource "$id" --metrics "$APP_METRICS" \
    --start-time "$START" --end-time "$END" --interval PT1M \
    --aggregation Average Total Maximum -o json | to_csv > "$OUT/azure-${app}.csv"
  log "$app: $(($(wc -l < "$OUT/azure-${app}.csv") - 1)) rows"
done

pg_id=$(az postgres flexible-server show -g "$RG" -n "${PG_SERVER:-mvhd-pg-b53a0449}" --query id -o tsv 2>/dev/null || true)
if [ -n "$pg_id" ]; then
  az monitor metrics list --resource "$pg_id" --metrics "$PG_METRICS" \
    --start-time "$START" --end-time "$END" --interval PT1M \
    --aggregation Average Maximum -o json | to_csv > "$OUT/azure-postgres.csv"
  log "postgres: $(($(wc -l < "$OUT/azure-postgres.csv") - 1)) rows"
fi
ok "metrics for $TESTID in $OUT"
