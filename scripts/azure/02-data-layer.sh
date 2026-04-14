#!/usr/bin/env bash
# Phase 2: Data layer — Postgres (container app + Azure Files) + Neo4j.
#
# Workaround B (ADR-018): Postgres runs as an ACA container app with TCP ingress
# on port 5432 and a persistent Azure Files volume at /var/lib/postgresql/data.
# Neo4j mounts neo4j-data + neo4j-logs per ADR-017.
#
# Two-step pattern: create each app with CLI flags (no volumes), then patch
# with `az containerapp update --yaml` to attach Azure Files volumes. The
# `create --yaml` path was unreliable in the containerapp extension 1.2/1.3 beta.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/env.sh"

log "Phase 2: Data layer"
az acr login --name "$ACR_NAME"

ACR_PASSWORD=$(az acr credential show --name "$ACR_NAME" --query "passwords[0].value" -o tsv)

# ── Push Postgres image to ACR ──────────────────────────────────────────────
log "Pulling and pushing postgres:16 image..."
docker pull --platform linux/amd64 postgres:16
docker tag postgres:16 "${PG_IMAGE}"
docker push "${PG_IMAGE}"
ok "Postgres image in ACR"

# ── Postgres container app (step 1: create with CLI flags) ─────────────────
log "Creating Postgres container app ${PG_APP} (no volume yet)..."
az containerapp create \
  --name "$PG_APP" --resource-group "$RG" --environment "$ACA_ENV" \
  --image "$PG_IMAGE" \
  --registry-server "$ACR_LOGIN_SERVER" \
  --registry-username "$ACR_NAME" \
  --registry-password "$ACR_PASSWORD" \
  --cpu 1.0 --memory 2Gi \
  --min-replicas 1 --max-replicas 1 \
  --ingress internal --target-port 5432 --exposed-port 5432 --transport tcp \
  --secrets "pg-password=${PG_PASSWORD}" \
  --env-vars \
    "POSTGRES_USER=${PG_ADMIN}" \
    "POSTGRES_PASSWORD=secretref:pg-password" \
    "POSTGRES_DB=keycloak" \
    "PGDATA=/var/lib/postgresql/data/pgdata" \
  -o none
ok "Postgres container app created"

# ── Postgres (step 2: patch YAML to add Azure Files volume) ────────────────
log "Patching Postgres to mount pg-data Azure Files share..."
PG_YAML=$(mktemp)
az containerapp show --name "$PG_APP" --resource-group "$RG" -o yaml > "$PG_YAML"

python3 - "$PG_YAML" <<'PY'
import sys, yaml
path = sys.argv[1]
with open(path) as f:
    doc = yaml.safe_load(f)
tpl = doc['properties']['template']
vols = tpl.get('volumes') or []
if not any((v or {}).get('name') == 'pgdata' for v in vols):
    vols.append({'name': 'pgdata', 'storageType': 'AzureFile', 'storageName': 'pg-data'})
tpl['volumes'] = vols
for c in tpl['containers']:
    mounts = c.get('volumeMounts') or []
    if not any((m or {}).get('volumeName') == 'pgdata' for m in mounts):
        mounts.append({'volumeName': 'pgdata', 'mountPath': '/var/lib/postgresql/data'})
    c['volumeMounts'] = mounts
with open(path, 'w') as f:
    yaml.safe_dump(doc, f)
PY

az containerapp update --name "$PG_APP" --resource-group "$RG" --yaml "$PG_YAML" -o none
rm -f "$PG_YAML"
ok "Postgres volume attached (pg-data → /var/lib/postgresql/data)"

# ── Push Neo4j image to ACR ─────────────────────────────────────────────────
log "Pulling and pushing Neo4j image..."
docker pull --platform linux/amd64 neo4j:5-community
docker tag neo4j:5-community "${NEO4J_IMAGE}"
docker push "${NEO4J_IMAGE}"
ok "Neo4j image in ACR"

# ── Neo4j container app (step 1: create with CLI flags) ────────────────────
log "Creating Neo4j container app ${NEO4J_APP} (no volumes yet)..."
az containerapp create \
  --name "$NEO4J_APP" --resource-group "$RG" --environment "$ACA_ENV" \
  --image "$NEO4J_IMAGE" \
  --registry-server "$ACR_LOGIN_SERVER" \
  --registry-username "$ACR_NAME" \
  --registry-password "$ACR_PASSWORD" \
  --cpu 1.0 --memory 2Gi \
  --min-replicas 1 --max-replicas 1 \
  --ingress internal --target-port 7687 --exposed-port 7687 --transport tcp \
  --env-vars \
    "NEO4J_AUTH=${NEO4J_USER}/${NEO4J_PASSWORD}" \
    "NEO4J_PLUGINS=[\"apoc\"]" \
    "NEO4J_dbms_security_procedures_unrestricted=apoc.*" \
    "NEO4J_server_default__listen__address=0.0.0.0" \
  -o none
ok "Neo4j container app created"

# ── Neo4j (step 2: patch YAML to add Azure Files volumes) ──────────────────
log "Patching Neo4j to mount neo4j-data + neo4j-logs Azure Files shares..."
NEO4J_YAML=$(mktemp)
az containerapp show --name "$NEO4J_APP" --resource-group "$RG" -o yaml > "$NEO4J_YAML"

python3 - "$NEO4J_YAML" <<'PY'
import sys, yaml
path = sys.argv[1]
with open(path) as f:
    doc = yaml.safe_load(f)
tpl = doc['properties']['template']
vols = tpl.get('volumes') or []
for v_name, s_name in [('neo4j-data', 'neo4j-data'), ('neo4j-logs', 'neo4j-logs')]:
    if not any((v or {}).get('name') == v_name for v in vols):
        vols.append({'name': v_name, 'storageType': 'AzureFile', 'storageName': s_name})
tpl['volumes'] = vols
for c in tpl['containers']:
    mounts = c.get('volumeMounts') or []
    for v_name, mnt in [('neo4j-data', '/data'), ('neo4j-logs', '/logs')]:
        if not any((m or {}).get('volumeName') == v_name for m in mounts):
            mounts.append({'volumeName': v_name, 'mountPath': mnt})
    c['volumeMounts'] = mounts
with open(path, 'w') as f:
    yaml.safe_dump(doc, f)
PY

az containerapp update --name "$NEO4J_APP" --resource-group "$RG" --yaml "$NEO4J_YAML" -o none
rm -f "$NEO4J_YAML"
ok "Neo4j volumes attached (neo4j-data → /data, neo4j-logs → /logs)"

# ── Wait for Postgres to be reachable ───────────────────────────────────────
log "Waiting for Postgres to accept connections..."
for i in $(seq 1 30); do
  state=$(az containerapp show --name "$PG_APP" --resource-group "$RG" \
    --query "properties.runningStatus" -o tsv 2>/dev/null || echo "")
  if [[ "$state" == "Running" ]]; then
    ok "Postgres container running after ${i}x10s"
    break
  fi
  sleep 10
done

# ── Summary ──────────────────────────────────────────────────────────────────
log "Data layer complete"
echo "  Postgres:  ${PG_APP} (internal TCP 5432, Azure Files pg-data)"
echo "  Databases: (created in phase 6 after PG is reachable)"
echo "  Neo4j:     ${NEO4J_APP} (internal TCP 7687, Azure Files /data + /logs)"
