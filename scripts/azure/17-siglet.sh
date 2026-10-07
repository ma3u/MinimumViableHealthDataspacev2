#!/usr/bin/env bash
set -euo pipefail
# =============================================================================
# mvhd-siglet: the token signer the 0.18 data planes need (#574, #542)
# =============================================================================
#   17-siglet.sh            create or update the app (idempotent)
#   17-siglet.sh --check    report, change nothing
#
# The 0.18 data plane launcher refuses to start without `edc.iam.siglet.*`:
# siglet signs the data plane's access tokens and publishes their keys at
# /keys (port 8080), the URL migrate-edc-to-v018.sh gives the data planes.
# Compose has run it since #584; Azure has not had one.
#
# Decided on #574 (2026-10-06):
#   - storage `postgres-vault`: renewable tokens and locks in the database
#     `siglet` on the Flexible Server (created here; siglet makes its own
#     tables), the other tokens in Vault;
#   - the Postgres password is a Key Vault reference to postgres-admin-password
#     through the identity the UI and the proxy use (ADR-036). sqlx reads
#     PGPASSWORD when the URL carries none, so no URL with a password exists;
#   - the Vault token is the one the six EDC apps use today
#     (EDC_VAULT_HASHICORP_TOKEN); #359 rotates all of them together;
#   - signing with the transit key `signing-siglet` (06-post-deploy.sh made it);
#   - ingress internal to the environment, API auth disabled as in compose.
#     Turning auth on (Keycloak JWKS, audience, scopes) is still open.
#
# The image is the digest docker-compose.jad.yml pins, imported into ACR
# (ADR-029). It is multi-arch (linux/amd64 and arm64).
#
# Needs the PIM role (database, registry credentials). Off hours it stops and
# starts with the other EDC apps (aca-schedule.yml).
# =============================================================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
# shellcheck source=scripts/azure/env.sh
source "$SCRIPT_DIR/env.sh"

MODE="${1:-apply}"
# The database. SIGLET_DB moves the siglet to a fresh one: a siglet build
# refuses a database whose migrations a newer build wrote ("DataPlane SDK
# error" at start), which is what pinning sha-54382c8 over the July build
# met on 2026-10-07 (#542). The old database stays as it was.
DB="${SIGLET_DB:-siglet}"
SECRET_NAME="pg-password"
IDENTITY_NAME="${SIGLET_IDENTITY:-id-mvhd-claude-federation}"

SRC=$(grep -oE 'ghcr.io/eclipse-dataplane-core/dsdk-facet-rs/siglet:[a-z0-9.-]+@sha256:[0-9a-f]{64}' \
  "${REPO_ROOT}/docker-compose.jad.yml" | head -1)
[ -n "$SRC" ] || { err "no pinned siglet image in docker-compose.jad.yml"; exit 1; }
DIGEST="${SRC##*@sha256:}"
# ACR import refuses a source with both a tag and a digest (InvalidImportImageParameter).
SRC_REPO="${SRC%@sha256:*}"
SRC="${SRC_REPO%:*}@sha256:${DIGEST}"
TAG="sha-${DIGEST:0:12}"
IMAGE="${ACR_LOGIN_SERVER}/siglet:${TAG}"

report() {
  if az postgres flexible-server db show --server-name "$PG_FLEX_NAME" \
       --resource-group "$RG" --name "$DB" -o none 2>/dev/null; then
    echo "  present  database ${DB}"
  else
    echo "  MISSING  database ${DB}"
  fi
  if az containerapp show --name "$SIGLET_APP" --resource-group "$RG" -o none 2>/dev/null; then
    az containerapp revision list --name "$SIGLET_APP" --resource-group "$RG" \
      --query "[?properties.active].{revision:name,image:properties.template.containers[0].image,health:properties.healthState,state:properties.runningState}" \
      -o table
  else
    echo "  MISSING  app ${SIGLET_APP}"
  fi
}
if [ "$MODE" = "--check" ]; then report; exit 0; fi

# ── 1. The database ─────────────────────────────────────────────────────────
if az postgres flexible-server db show --server-name "$PG_FLEX_NAME" \
     --resource-group "$RG" --name "$DB" -o none 2>/dev/null; then
  ok "${DB} exists on ${PG_FLEX_NAME}"
else
  az postgres flexible-server db create --server-name "$PG_FLEX_NAME" \
    --resource-group "$RG" --name "$DB" -o none
  ok "${DB} created on ${PG_FLEX_NAME}"
fi

# ── 2. The image ────────────────────────────────────────────────────────────
if az acr repository show-tags --name "$ACR_NAME" --repository siglet -o tsv 2>/dev/null | grep -qx "$TAG"; then
  ok "${IMAGE} already in ACR"
else
  az acr import --name "$ACR_NAME" --source "$SRC" --image "siglet:${TAG}" -o none
  ok "imported ${SRC} as ${IMAGE}"
fi

# ── 3. The app ──────────────────────────────────────────────────────────────
VAULT_URL=$(az containerapp show --name "$CONTROLPLANE_APP" --resource-group "$RG" \
  --query "properties.template.containers[0].env[?name=='EDC_VAULT_HASHICORP_URL'].value | [0]" -o tsv)
[ -n "$VAULT_URL" ] || { err "no EDC_VAULT_HASHICORP_URL on ${CONTROLPLANE_APP}"; exit 1; }
KV_URI="$(az keyvault show --name "$KEY_VAULT_NAME" --query properties.vaultUri -o tsv)"
IDENTITY_ID="$(az identity show --name "$IDENTITY_NAME" --resource-group "$RG" --query id -o tsv)"
REF="keyvaultref:${KV_URI%/}/secrets/postgres-admin-password,identityref:${IDENTITY_ID}"

ENV_VARS=(
  "SIGLET__STORAGE_BACKEND__TYPE=postgres-vault"
  "SIGLET__STORAGE_BACKEND__URL=postgres://${PG_ADMIN}@${PG_HOST}:${PG_PORT}/${DB}?sslmode=require"
  "PGPASSWORD=secretref:${SECRET_NAME}"
  "SIGLET__TOKEN__ISSUER=siglet-issuer"
  "SIGLET__VAULT__URL=${VAULT_URL}"
  "SIGLET__VAULT__TOKEN=secretref:vault-token"
  "SIGLET__VAULT__SIGNING_KEY_NAME=signing-siglet"
  "SIGLET__SIGNALING_AUTH__MODE=disabled"
  "SIGLET__TOKEN_API_AUTH__MODE=disabled"
  "SIGLET__MANAGEMENT_API_AUTH__MODE=disabled"
)
# The EDC apps' Vault token (env.sh, #359), kept in a variable only, never
# printed.
VAULT_TOKEN=$(vault_service_token)
[ -n "$VAULT_TOKEN" ] || { err "no Vault token for the services"; exit 1; }

# The image running now, to go back to if the new revision does not become
# healthy. The app runs one revision at a time, so a revision that never
# starts still takes all traffic and the data planes lose the key set.
PREV_IMAGE=$(az containerapp show --name "$SIGLET_APP" --resource-group "$RG" \
  --query "properties.template.containers[0].image" -o tsv 2>/dev/null || echo "")
if az containerapp show --name "$SIGLET_APP" --resource-group "$RG" -o none 2>/dev/null; then
  log "updating ${SIGLET_APP}"
  az containerapp identity assign --name "$SIGLET_APP" --resource-group "$RG" \
    --user-assigned "$IDENTITY_ID" -o none
  az containerapp secret set --name "$SIGLET_APP" --resource-group "$RG" \
    --secrets "${SECRET_NAME}=${REF}" "vault-token=${VAULT_TOKEN}" -o none
  az containerapp update --name "$SIGLET_APP" --resource-group "$RG" \
    --image "$IMAGE" --set-env-vars "${ENV_VARS[@]}" -o none
else
  log "creating ${SIGLET_APP}"
  ACR_PASSWORD="$(az acr credential show --name "$ACR_NAME" --query 'passwords[0].value' -o tsv)"
  az containerapp create --name "$SIGLET_APP" --resource-group "$RG" --environment "$ACA_ENV" \
    --image "$IMAGE" \
    --registry-server "$ACR_LOGIN_SERVER" --registry-username "$ACR_NAME" \
    --registry-password "$ACR_PASSWORD" \
    --user-assigned "$IDENTITY_ID" \
    --cpu 0.25 --memory 0.5Gi --min-replicas 1 --max-replicas 1 \
    --ingress internal --target-port 8080 \
    --secrets "${SECRET_NAME}=${REF}" "vault-token=${VAULT_TOKEN}" \
    --env-vars "${ENV_VARS[@]}" -o none
fi
unset VAULT_TOKEN

# ── 3b. Transfer types (#542) ───────────────────────────────────────────────
# The siglet answers every start message for a transfer type it has no entry
# for with "Data flow handler cannot handle this flow", and the transfer ends
# TERMINATED. Compose mounts jad/siglet.toml; here the same file, with this
# environment's data plane, is the secret siglet-toml mounted at /config, as
# upstream jad mounts its siglet-config ConfigMap. The endpoint goes into the
# consumer's EDR: the FHIR data plane's data API.
SIGLET_PULL_ENDPOINT="${SIGLET_PULL_ENDPOINT:-http://${DP_FHIR_APP}:8186/api/data}"
SIGLET_TOML=$(sed "s#^endpoint = .*#endpoint = \"${SIGLET_PULL_ENDPOINT}\"#" "${REPO_ROOT}/jad/siglet.toml")
az containerapp secret set --name "$SIGLET_APP" --resource-group "$RG" \
  --secrets "siglet-toml=${SIGLET_TOML}" -o none
python3 - "$SIGLET_APP" "$RG" <<'PY2'
import json, subprocess, sys, tempfile
app, rg = sys.argv[1:3]
doc = json.loads(subprocess.check_output(["az", "containerapp", "show", "-n", app, "-g", rg, "-o", "json"]))
t = doc["properties"]["template"]
vols = [v for v in t.get("volumes") or [] if v.get("name") != "siglet-config"]
vols.append({"name": "siglet-config", "storageType": "Secret",
             "secrets": [{"secretRef": "siglet-toml", "path": "siglet.toml"}]})
t["volumes"] = vols
c = t["containers"][0]
mounts = [m for m in c.get("volumeMounts") or [] if m.get("volumeName") != "siglet-config"]
mounts.append({"volumeName": "siglet-config", "mountPath": "/config"})
c["volumeMounts"] = mounts
env = [e for e in c.get("env") or [] if e.get("name") != "SIGLET_CONFIG_FILE"]
env.append({"name": "SIGLET_CONFIG_FILE", "value": "/config/siglet.toml"})
c["env"] = env
# `show` returns secrets without values; sent back empty they would be wiped.
doc["properties"]["configuration"].pop("secrets", None)
for k in ("latestRevisionName", "latestReadyRevisionName", "latestRevisionFqdn",
          "outboundIpAddresses", "eventStreamEndpoint", "runningStatus", "provisioningState"):
    doc["properties"].pop(k, None)
with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
    json.dump(doc, f)
subprocess.check_call(["az", "containerapp", "update", "-n", app, "-g", rg, "--yaml", f.name, "-o", "none"])
print("transfer types mounted at /config/siglet.toml")
PY2
ok "siglet HttpData-PULL -> ${SIGLET_PULL_ENDPOINT}"

# Signaling 8081, token refresh 8082, management 8083 (siglet's defaults),
# reachable inside the environment as http://mvhd-siglet:<port>.
az containerapp ingress update --name "$SIGLET_APP" --resource-group "$RG" \
  --type internal --target-port 8080 -o none
python3 - "$SIGLET_APP" "$RG" <<'PY'
import json, subprocess, sys
app, rg = sys.argv[1:3]
show = json.loads(subprocess.check_output(["az", "containerapp", "show", "-n", app, "-g", rg, "-o", "json"]))
ing = show["properties"]["configuration"]["ingress"]
have = {m["targetPort"] for m in ing.get("additionalPortMappings") or []}
want = [p for p in (8081, 8082, 8083) if p not in have]
if want:
    maps = (ing.get("additionalPortMappings") or []) + [
        {"targetPort": p, "exposedPort": p, "external": False} for p in want]
    subprocess.check_call(["az", "containerapp", "update", "-n", app, "-g", rg, "-o", "none",
        "--set", "properties.configuration.ingress.additionalPortMappings=" + json.dumps(maps)])
print("ports 8080 (ingress), " + ", ".join(str(p) for p in (8081, 8082, 8083)) + " (internal)")
PY

# ── 4. Healthy, and the key set answers ─────────────────────────────────────
rev=$(az containerapp show --name "$SIGLET_APP" --resource-group "$RG" --query properties.latestRevisionName -o tsv)
for _ in $(seq 1 40); do
  state=$(az containerapp revision show --name "$SIGLET_APP" --resource-group "$RG" --revision "$rev" \
    --query properties.healthState -o tsv 2>/dev/null || echo "")
  [ "$state" = Healthy ] && break
  [ "$state" = Unhealthy ] && break
  sleep 15
done
[ "$state" = Healthy ] || {
  err "${rev} is '${state:-unknown}'. Its log:"
  err "  az containerapp logs show -n ${SIGLET_APP} -g ${RG} --revision ${rev} --tail 80 --follow false"
  if [ -n "$PREV_IMAGE" ] && [ "$PREV_IMAGE" != "$IMAGE" ]; then
    err "going back to ${PREV_IMAGE} so the data planes keep their key set"
    az containerapp update --name "$SIGLET_APP" --resource-group "$RG" --image "$PREV_IMAGE" -o none
    back=$(az containerapp show --name "$SIGLET_APP" --resource-group "$RG" --query properties.latestRevisionName -o tsv)
    for _ in $(seq 1 40); do
      state=$(az containerapp revision show --name "$SIGLET_APP" --resource-group "$RG" --revision "$back" \
        --query properties.healthState -o tsv 2>/dev/null || echo "")
      [ "$state" = Healthy ] && break
      sleep 15
    done
    err "${back} on ${PREV_IMAGE}: ${state:-unknown}"
  fi
  exit 1
}
ok "${rev} Healthy"
report
log "The data planes reach its key set at http://${SIGLET_APP}/keys (migrate-edc-to-v018.sh app dp-fhir)."
