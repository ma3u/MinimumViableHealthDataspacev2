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
# Through cypher-shell inside the container, over Bolt. The POST to
# ${NEO4J_HTTP_URL}:7474/db/neo4j/tx/commit that used to sit here could never
# answer: mvhd-neo4j has TCP ingress with targetPort and exposedPort 7687 and
# no additionalPortMappings, so the transactional HTTP API is not served, and
# the internal ingress is not reachable from a workstation on any port either.
# This section therefore printed "(Neo4j not reachable from this network)"
# every single time (issue #205).
#
# `az containerapp exec` needs a TTY — headless it dies inside the CLI with
# `termios.error: (25, 'Inappropriate ioctl for device')`, the same limitation
# 06-post-deploy.sh and 11-claude-federation.sh document. Say so rather than
# print a wrong number.
echo "── Neo4j Graph ────────────────────────────────────────────────────"
if [[ ! -t 0 ]]; then
  echo "  (no TTY: 'az containerapp exec' cannot run here — skipped)"
else
  # exec wraps the output in terminal chrome, so carry a marker through the
  # query and pull the number out of that rather than expecting a bare line.
  RESULT=$(az containerapp exec \
    --name "$NEO4J_APP" --resource-group "$RG" \
    --command "cypher-shell -a bolt://localhost:7687 -u ${NEO4J_USER} -p ${NEO4J_PASSWORD} --non-interactive --format plain \"MATCH (n) RETURN 'NODECOUNT=' + toString(count(n)) AS c\"" \
    2>/dev/null || echo "")
  TOTAL=$(printf '%s' "$RESULT" | sed -n 's/.*NODECOUNT=\([0-9][0-9]*\).*/\1/p' | head -1)
  if [[ -n "$TOTAL" ]]; then
    echo "  Total nodes: ${TOTAL}"
  else
    echo "  (Neo4j did not answer — check the app's logs)"
  fi
fi
echo ""

echo "══════════════════════════════════════════════════════════════════"
