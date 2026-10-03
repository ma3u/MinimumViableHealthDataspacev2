#!/usr/bin/env bash
# Phase 2: Data layer — Postgres (Flexible Server, ADR-041) + Neo4j.
#
# Neo4j mounts neo4j-data per ADR-017; Neo4j tolerates SMB for its store. Its /logs
# is NOT mounted (ADR-045): log4j cannot roll its files on SMB, and from 2026-09-22
# printed a stack trace on every attempt, 180 MB a day of billed Log Analytics
# ingestion. Logs stay in the container; neo4j.log reaches the console anyway.
# Postgres does not tolerate SMB at all, which is why it is a managed server and
# not a container (ADR-041).
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

# ── Postgres: Flexible Server (ADR-041) ────────────────────────────────────
# No container app any more. Postgres on ACA had no durable storage: the SMB
# share crash-loops initdb (chmod EPERM) and ACA has no block storage, so every
# restart wiped every database. Phase 1 creates the server with its password
# generated straight into Key Vault; phase 2 creates the seven databases.
"${SCRIPT_DIR}/13-postgres-flexible-server.sh" 1
"${SCRIPT_DIR}/13-postgres-flexible-server.sh" 2
ok "Postgres: ${PG_FLEX_NAME} with its databases"

# ── Push Neo4j image to ACR ─────────────────────────────────────────────────
log "Pulling and pushing Neo4j image..."
docker pull --platform linux/amd64 "neo4j:${NEO4J_VERSION}"
docker tag "neo4j:${NEO4J_VERSION}" "${NEO4J_IMAGE}"
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
log "Patching Neo4j to mount the neo4j-data Azure Files share (no /logs mount)..."
NEO4J_YAML=$(mktemp)
az containerapp show --name "$NEO4J_APP" --resource-group "$RG" -o yaml > "$NEO4J_YAML"

python3 - "$NEO4J_YAML" <<'PY'
import sys, yaml
path = sys.argv[1]
with open(path) as f:
    doc = yaml.safe_load(f)
tpl = doc['properties']['template']
vols = tpl.get('volumes') or []
# Drop a neo4j-logs volume left by runs before ADR-045, so a re-run repairs it.
vols = [v for v in vols if (v or {}).get('name') != 'neo4j-logs']
if not any((v or {}).get('name') == 'neo4j-data' for v in vols):
    vols.append({'name': 'neo4j-data', 'storageType': 'AzureFile', 'storageName': 'neo4j-data'})
tpl['volumes'] = vols
for c in tpl['containers']:
    mounts = [m for m in (c.get('volumeMounts') or []) if (m or {}).get('volumeName') != 'neo4j-logs']
    if not any((m or {}).get('volumeName') == 'neo4j-data' for m in mounts):
        mounts.append({'volumeName': 'neo4j-data', 'mountPath': '/data'})
    c['volumeMounts'] = mounts
with open(path, 'w') as f:
    yaml.safe_dump(doc, f)
PY

az containerapp update --name "$NEO4J_APP" --resource-group "$RG" --yaml "$NEO4J_YAML" -o none
rm -f "$NEO4J_YAML"
ok "Neo4j volume attached (neo4j-data → /data; logs stay in the container)"

# Single revision mode keeps the last *ready* revision running until the new one
# is ready. Neo4j's store lock on the shared /data means the new one never can
# be, so the two deadlock and the old one is re-activated on every update
# (docs/gotchas.md, 2026-10-02). Stop every other revision; that costs a short
# outage, which a single-writer database on a shared volume cannot avoid.
NEO4J_LATEST=$(az containerapp show --name "$NEO4J_APP" --resource-group "$RG" \
  --query "properties.latestRevisionName" -o tsv)
while read -r rev; do
  [[ -z "$rev" || "$rev" == "$NEO4J_LATEST" ]] && continue
  log "Deactivating ${rev} so ${NEO4J_LATEST} can take the Neo4j store lock..."
  az containerapp revision deactivate --name "$NEO4J_APP" --resource-group "$RG" \
    --revision "$rev" -o none
done < <(az containerapp revision list --name "$NEO4J_APP" --resource-group "$RG" \
  --query "[?properties.active].name" -o tsv)
ok "Only ${NEO4J_LATEST} is active"

# Postgres readiness needs no wait here: phase 1 returns only once the server
# reports Ready, and phase 2 reads every database back.

# ── Summary ──────────────────────────────────────────────────────────────────
log "Data layer complete"
echo "  Postgres:  ${PG_FLEX_NAME} (Flexible Server, TLS, ADR-041)"
echo "  Databases: keycloak, controlplane, dataplane, dataplane_omop, identityhub, issuerservice, cfm"
echo "  Neo4j:     ${NEO4J_APP} (internal TCP 7687, Azure Files /data; logs stay in the container)"
