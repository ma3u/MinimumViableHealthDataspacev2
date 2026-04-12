#!/usr/bin/env bash
# Show status of all Azure services and endpoints.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/env.sh"

echo ""
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║          MVHD Azure Deployment Status                          ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""

# ── Resource group ───────────────────────────────────────────────────────────
RG_STATE=$(az group show --name "$RG" --query "properties.provisioningState" -o tsv 2>/dev/null || echo "NOT FOUND")
echo "Resource Group: ${RG} [${RG_STATE}]"
echo ""

if [[ "$RG_STATE" == "NOT FOUND" ]]; then
  err "Resource group ${RG} does not exist. Run 01-foundation.sh first."
  exit 1
fi

# ── Container Apps ───────────────────────────────────────────────────────────
echo "── Container Apps ─────────────────────────────────────────────────"
printf "%-25s %-10s %-8s %s\n" "NAME" "STATUS" "INGRESS" "FQDN"
printf "%-25s %-10s %-8s %s\n" "────" "──────" "───────" "────"

ALL_APPS=(
  "$NEO4J_APP" "$NEO4J_PROXY_APP" "$UI_APP" "$KEYCLOAK_APP"
  "$VAULT_APP" "$NATS_APP" "$CONTROLPLANE_APP" "$DP_FHIR_APP"
  "$DP_OMOP_APP" "$IDENTITYHUB_APP" "$ISSUER_APP"
  "$TENANT_MGR_APP" "$PROVISION_MGR_APP"
)

for app in "${ALL_APPS[@]}"; do
  INFO=$(az containerapp show --name "$app" --resource-group "$RG" \
    --query "{status:properties.runningStatus, ingress:properties.configuration.ingress.external, fqdn:properties.configuration.ingress.fqdn}" \
    -o json 2>/dev/null || echo '{"status":"NOT FOUND","ingress":null,"fqdn":""}')
  STATUS=$(echo "$INFO" | jq -r '.status // "unknown"')
  INGRESS=$(echo "$INFO" | jq -r 'if .ingress == true then "ext" elif .ingress == false then "int" else "—" end')
  FQDN=$(echo "$INFO" | jq -r '.fqdn // "—"')
  printf "%-25s %-10s %-8s %s\n" "$app" "$STATUS" "$INGRESS" "$FQDN"
done

echo ""

# ── ACA Jobs ─────────────────────────────────────────────────────────────────
echo "── ACA Jobs ───────────────────────────────────────────────────────"
printf "%-25s %-15s %s\n" "NAME" "LAST STATUS" "LAST RUN"
printf "%-25s %-15s %s\n" "────" "───────────" "────────"

ALL_JOBS=("$NEO4J_SEED_JOB" "$VAULT_BOOTSTRAP_JOB" "$FHIR_LOADER_JOB")
for job in "${ALL_JOBS[@]}"; do
  EXEC=$(az containerapp job execution list --name "$job" --resource-group "$RG" \
    --query "[-1:].{status:properties.status, start:properties.startTime}" \
    -o json 2>/dev/null || echo '[]')
  LAST_STATUS=$(echo "$EXEC" | jq -r '.[0].status // "never run"')
  LAST_START=$(echo "$EXEC" | jq -r '.[0].start // "—"')
  printf "%-25s %-15s %s\n" "$job" "$LAST_STATUS" "$LAST_START"
done

echo ""

# ── PostgreSQL ───────────────────────────────────────────────────────────────
echo "── PostgreSQL ─────────────────────────────────────────────────────"
PG_STATE=$(az postgres flexible-server show --resource-group "$RG" --name "$PG_SERVER" \
  --query "state" -o tsv 2>/dev/null || echo "NOT FOUND")
echo "  ${PG_SERVER}: ${PG_STATE}"
echo "  Host: ${PG_SERVER}.postgres.database.azure.com"
echo "  Databases: ${PG_DATABASES[*]}"
echo ""

# ── Public endpoints ─────────────────────────────────────────────────────────
eval "$(get_aca_fqdns)" 2>/dev/null || true
echo "── Public Endpoints ───────────────────────────────────────────────"
if [[ -n "${UI_PUBLIC_URL:-}" ]]; then
  echo "  UI:       ${UI_PUBLIC_URL}"
  echo "  Keycloak: ${KEYCLOAK_PUBLIC_URL}"
  echo "  GitHub:   https://ma3u.github.io/MinimumViableHealthDataspacev2/"
else
  echo "  (ACA environment not ready — FQDNs unavailable)"
fi
echo ""

# ── Neo4j node count ─────────────────────────────────────────────────────────
if [[ -n "${NEO4J_HTTP_URL:-}" ]]; then
  echo "── Neo4j Graph ────────────────────────────────────────────────────"
  AUTH=$(printf '%s:%s' "$NEO4J_USER" "$NEO4J_PASSWORD" | base64)
  RESULT=$(curl -sf -X POST "${NEO4J_HTTP_URL}:7474/db/neo4j/tx/commit" \
    -H "Authorization: Basic ${AUTH}" \
    -H "Content-Type: application/json" \
    -d '{"statements":[{"statement":"MATCH (n) RETURN count(n) as total"}]}' 2>/dev/null || echo "")
  if [[ -n "$RESULT" ]]; then
    TOTAL=$(echo "$RESULT" | jq -r '.results[0].data[0].row[0] // "unavailable"')
    echo "  Total nodes: ${TOTAL}"
  else
    echo "  (Neo4j not reachable from this network)"
  fi
  echo ""
fi

echo "══════════════════════════════════════════════════════════════════"
