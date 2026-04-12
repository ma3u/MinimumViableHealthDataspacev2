#!/usr/bin/env bash
# Phase 2: Data layer — PostgreSQL Flexible Server + Neo4j container app.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/env.sh"

log "Phase 2: Data layer"

# ── PostgreSQL Flexible Server ───────────────────────────────────────────────
log "Creating PostgreSQL Flexible Server ${PG_SERVER} in ${PG_LOCATION}..."
az postgres flexible-server create \
  --resource-group "$RG" --name "$PG_SERVER" --location "$PG_LOCATION" \
  --admin-user "$PG_ADMIN" --admin-password "$PG_PASSWORD" \
  --sku-name "$PG_SKU" --tier Burstable --storage-size 32 \
  --version 16 --public-access 0.0.0.0 -o none
ok "PostgreSQL ${PG_SERVER}"

# Create databases
for db in "${PG_DATABASES[@]}"; do
  log "Creating database ${db}..."
  az postgres flexible-server db create \
    --resource-group "$RG" --server-name "$PG_SERVER" \
    --database-name "$db" -o none
  ok "Database ${db}"
done

# ── Push Neo4j image to ACR ─────────────────────────────────────────────────
log "Pulling and pushing Neo4j image to ACR..."
az acr login --name "$ACR_NAME"
docker pull --platform linux/amd64 neo4j:5-community
docker tag neo4j:5-community "${NEO4J_IMAGE}"
docker push "${NEO4J_IMAGE}"
ok "Neo4j image in ACR"

# ── Neo4j container app ─────────────────────────────────────────────────────
log "Creating Neo4j container app..."
az containerapp create \
  --name "$NEO4J_APP" --resource-group "$RG" --environment "$ACA_ENV" \
  --image "$NEO4J_IMAGE" \
  --registry-server "$ACR_LOGIN_SERVER" \
  --cpu 1 --memory 2Gi \
  --min-replicas 1 --max-replicas 1 \
  --ingress internal --target-port 7474 \
  --env-vars \
    "NEO4J_AUTH=${NEO4J_USER}/${NEO4J_PASSWORD}" \
    "NEO4J_PLUGINS=[\"apoc\"]" \
    "NEO4J_dbms_security_procedures_unrestricted=apoc.*" \
  -o none
ok "Neo4j container app ${NEO4J_APP}"

# ── Summary ──────────────────────────────────────────────────────────────────
log "Data layer complete"
echo "  PostgreSQL: ${PG_SERVER}.postgres.database.azure.com"
echo "  Databases:  ${PG_DATABASES[*]}"
echo "  Neo4j:      ${NEO4J_APP} (internal, port 7474)"
