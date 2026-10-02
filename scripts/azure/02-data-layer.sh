#!/usr/bin/env bash
# Phase 2: Data layer — Postgres (container app + Azure Files) + Neo4j.
#
# Workaround B (ADR-018): Postgres runs as an ACA container app with TCP ingress
# on port 5432 and NO data volume. Postgres cannot initdb on an SMB Azure Files
# share, so its durability comes from Flexible Server instead (ADR-041).
# Neo4j mounts neo4j-data per ADR-017; Neo4j tolerates SMB for its store, Postgres
# does not. Neo4j's /logs is NOT mounted (ADR-042): log4j cannot roll its files on
# SMB, and from 2026-09-22 printed a stack trace on every attempt, 180 MB a day of
# billed Log Analytics ingestion. Logs stay in the container; neo4j.log reaches the
# console anyway.
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
docker pull --platform linux/amd64 "postgres:${POSTGRES_VERSION}"
docker tag "postgres:${POSTGRES_VERSION}" "${PG_IMAGE}"
docker push "${PG_IMAGE}"
ok "Postgres image in ACR"

# ── Postgres container app (step 1: create with CLI flags) ─────────────────
log "Creating Postgres container app ${PG_APP} (no volume yet)..."
# Sized for the keycloak realm DB only — the other 6 databases (controlplane,
# dataplane, dataplane_omop, identityhub, issuerservice, cfm) exist for the EDC
# services that don't boot on ACA (issue #25 / ADR-022). 0.5 vCPU / 1 GiB is
# comfortable headroom for one Keycloak realm with a handful of clients and
# users; raise to 1.0/2Gi if/when those services come back online.
az containerapp create \
  --name "$PG_APP" --resource-group "$RG" --environment "$ACA_ENV" \
  --image "$PG_IMAGE" \
  --registry-server "$ACR_LOGIN_SERVER" \
  --registry-username "$ACR_NAME" \
  --registry-password "$ACR_PASSWORD" \
  --cpu 0.5 --memory 1Gi \
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

# ── Postgres storage: deliberately none (ADR-041) ──────────────────────────
# This phase used to mount the `pg-data` AzureFile share here. It must not.
#
# `initdb` chmods PGDATA unconditionally and SMB cannot do POSIX chmod, so the
# mount does not give Postgres a durable disk, it stops Postgres booting at all.
# Measured 2026-10-02 on the live app:
#
#   chmod: changing permissions of '/var/lib/postgresql/data/pgdata': Operation not permitted
#   initdb: error: could not change permissions of directory ".../pgdata": Operation not permitted
#
# No mountOptions (uid, gid, dir_mode, file_mode) changes that. NFS would, but
# it needs a Premium FileStorage account and a VNet-injected ACA environment,
# and this estate has neither. See docs/gotchas.md (2026-10-02) and ADR-041.
#
# So this container app runs on ephemeral storage on purpose, and durability
# comes from Azure Database for PostgreSQL Flexible Server instead (ADR-041).
# Until that cutover lands, a replica restart still empties the cluster and
# `restore-keycloak-realm.sh` is how the realm comes back.
#
# The guard below is the opposite of the one that used to be here: it fails if
# anything has re-added the mount, because that is a crash loop, not a fix.
PG_MOUNT=$(az containerapp show --name "$PG_APP" --resource-group "$RG" \
  --query "properties.template.containers[0].volumeMounts[?volumeName=='pgdata'].mountPath | [0]" \
  -o tsv 2>/dev/null || echo "")
if [ -n "$PG_MOUNT" ] && [ "$PG_MOUNT" != "None" ]; then
  err "pgdata is mounted at '${PG_MOUNT}'. Postgres cannot initdb on an SMB"
  err "share and will crash-loop. Remove the mount; see ADR-041."
  exit 1
fi

PG_SECRETS=$(az containerapp secret list --name "$PG_APP" --resource-group "$RG" \
  --query "[?name=='pg-password'] | length(@)" -o tsv 2>/dev/null || echo "0")
if [ "$PG_SECRETS" != "1" ]; then
  err "the pg-password secret is missing from ${PG_APP}."
  exit 1
fi
ok "Postgres created without a data volume, as ADR-041 requires"

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
# Drop a neo4j-logs volume left by runs before ADR-042, so a re-run repairs it.
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
echo "  Postgres:  ${PG_APP} (internal TCP 5432, ephemeral storage, see ADR-041)"
echo "  Databases: (created in phase 6 after PG is reachable)"
echo "  Neo4j:     ${NEO4J_APP} (internal TCP 7687, Azure Files /data)"
