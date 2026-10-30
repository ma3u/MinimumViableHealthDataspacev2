#!/usr/bin/env bash
set -euo pipefail
# =============================================================================
# Phase 20: mvhd-neo4j-spe2, the second secure processing environment (ADR-069)
# =============================================================================
#   20-neo4j-spe2.sh --create-secret  operator, once: SPE-2's Neo4j password,
#                                     generated into Key Vault, never shown
#   20-neo4j-spe2.sh                  share, environment storage and the app
#                                     (idempotent)
#   20-neo4j-spe2.sh --seed           build the seed image, run the job
#                                     mvhd-neo4j-spe2-seed, wait for it
#   20-neo4j-spe2.sh --wire-proxy     point mvhd-neo4j-proxy at SPE-2
#   20-neo4j-spe2.sh --check          report, change nothing
#
# In that order. Decided in ADR-069:
#   - SPE-2 is a Neo4j container app of its own, like mvhd-neo4j: the same
#     pinned image, ADR-056's size, internal TCP ingress only, its store on
#     an Azure Files share of its own (neo4j-spe2-data), logs in the
#     container (ADR-045). Bolt on 7688, as on the compose stack;
#   - its password lives in Key Vault only (ADR-036). The app reads
#     neo4j-spe2-auth (`neo4j/<password>`, for the image's NEO4J_AUTH), the
#     proxy and the seed job read neo4j-spe2-password, all three through the
#     managed identity id-mvhd-claude-federation as keyvaultref secrets;
#   - it is seeded from SPE-1 by scripts/seed-spe2.py: the second half of the
#     synthetic patients with their records, OMOP rows and codes, then the
#     schema and SPE-2's HealthDCAT-AP registration. SPE-1 is only read;
#   - it stops and starts with everything else (ADR-053): offhours.sh picks
#     it up as soon as it exists.
#
# NEO4J_AUTH sets the password once, when Neo4j finds an empty /data. A new
# value in Key Vault after that does not change the database's password;
# that takes ALTER USER on SPE-2, then the new value in Key Vault.
#
# --create-secret needs Key Vault Secrets Officer; the rest needs Container
# Apps Contributor, Contributor on the storage account (for its key) and the
# registry credentials. Never prints a secret.
# =============================================================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
# shellcheck source=scripts/azure/env.sh
source "$SCRIPT_DIR/env.sh"

MODE="${1:-apply}"
APP="$NEO4J_SPE2_APP"
JOB="$NEO4J_SPE2_SEED_JOB"
IDENTITY_NAME="${NEO4J_SPE2_IDENTITY:-id-mvhd-claude-federation}"
STORAGE_NAME="$SHARE_NEO4J_SPE2_DATA"
SEED_TIMEOUT_SECONDS="${SEED_TIMEOUT_SECONDS:-1800}"
# The seed image is tagged with the last commit that changed what it carries,
# not :latest, which ACA caches and would not pull again (gotcha #6).
SEED_FILES=(scripts/seed-spe2.py neo4j/init-schema.cypher neo4j/register-fhir-dataset-hdcatap-spe2.cypher)
SEED_TAG="$(git -C "$REPO_ROOT" log -1 --format=%h -- "${SEED_FILES[@]}")"
SEED_IMAGE="${ACR_LOGIN_SERVER}/${JOB}:${SEED_TAG}"
# The app spec carries the registry password: owner-only, gone on exit.
SPEC=""
trap 'if [ -n "$SPEC" ]; then rm -f "$SPEC"; fi' EXIT

kv_uri() {
  local uri
  uri="$(az keyvault show --name "$KEY_VAULT_NAME" --query properties.vaultUri -o tsv 2>/dev/null || true)"
  printf '%s' "${uri:-https://${KEY_VAULT_NAME}.vault.azure.net/}"
}
kv_has() {
  az keyvault secret show --vault-name "$KEY_VAULT_NAME" --name "$1" --query id -o none 2>/dev/null
}
identity_id() {
  az identity show --name "$IDENTITY_NAME" --resource-group "$RG" --query id -o tsv
}

# ── --check ─────────────────────────────────────────────────────────────────
report() {
  local s
  for s in "$KV_NEO4J_SPE2_PASSWORD" "$KV_NEO4J_SPE2_AUTH"; do
    if kv_has "$s"; then echo "  present  Key Vault ${s}"; else echo "  MISSING  Key Vault ${s} (or no right to see it)"; fi
  done
  if az containerapp env storage show --name "$ACA_ENV" --resource-group "$RG" \
       --storage-name "$STORAGE_NAME" -o none 2>/dev/null; then
    echo "  present  environment storage ${STORAGE_NAME}"
  else
    echo "  MISSING  environment storage ${STORAGE_NAME}"
  fi
  if az containerapp show --name "$APP" --resource-group "$RG" -o none 2>/dev/null; then
    az containerapp show --name "$APP" --resource-group "$RG" --query "{status:properties.runningStatus, \
      revision:properties.latestRevisionName, port:properties.configuration.ingress.exposedPort, \
      cpu:properties.template.containers[0].resources.cpu, memory:properties.template.containers[0].resources.memory}" -o json
  else
    echo "  MISSING  app ${APP}"
  fi
  if az containerapp job show --name "$JOB" --resource-group "$RG" -o none 2>/dev/null; then
    echo "  last seed: $(az containerapp job execution list --name "$JOB" --resource-group "$RG" \
      --query "sort_by([], &properties.startTime)[-1].{status:properties.status, start:properties.startTime}" -o tsv 2>/dev/null || echo none)"
  else
    echo "  MISSING  job ${JOB}"
  fi
  # The URI is not a secret; the password is shown as the name of its reference.
  echo "  proxy:   $(az containerapp show --name "$NEO4J_PROXY_APP" --resource-group "$RG" \
    --query "properties.template.containers[0].env[?starts_with(name, 'NEO4J_SPE2_')].{name:name, value:value, secretRef:secretRef}" \
    -o json 2>/dev/null | tr -d '\n' || echo unknown)"
}

# ── --create-secret ─────────────────────────────────────────────────────────
create_secret() {
  local pw
  if kv_has "$KV_NEO4J_SPE2_PASSWORD"; then
    ok "Key Vault already holds ${KV_NEO4J_SPE2_PASSWORD}; kept as it is"
    if kv_has "$KV_NEO4J_SPE2_AUTH"; then
      ok "Key Vault already holds ${KV_NEO4J_SPE2_AUTH}; kept as it is"
      return 0
    fi
    pw="$(az keyvault secret show --vault-name "$KEY_VAULT_NAME" --name "$KV_NEO4J_SPE2_PASSWORD" --query value -o tsv)"
  else
    # Generated here, held in a variable that never reaches the terminal or
    # the log, and dropped right after.
    pw="$(openssl rand -hex 24)"
    az keyvault secret set --vault-name "$KEY_VAULT_NAME" --name "$KV_NEO4J_SPE2_PASSWORD" \
      --value "$pw" -o none
    ok "created ${KV_NEO4J_SPE2_PASSWORD} in ${KEY_VAULT_NAME} (192 bit, not displayed)"
  fi
  az keyvault secret set --vault-name "$KEY_VAULT_NAME" --name "$KV_NEO4J_SPE2_AUTH" \
    --value "${NEO4J_SPE2_USER}/${pw}" -o none
  unset pw
  ok "created ${KV_NEO4J_SPE2_AUTH} in ${KEY_VAULT_NAME} (not displayed)"
}

# ── apply: share, environment storage, app ──────────────────────────────────
apply_app() {
  kv_has "$KV_NEO4J_SPE2_AUTH" ||
    warn "could not confirm ${KV_NEO4J_SPE2_AUTH} in ${KEY_VAULT_NAME}; without it the app cannot start (run --create-secret)"

  log "Azure Files share ${SHARE_NEO4J_SPE2_DATA} (${QUOTA_NEO4J_SPE2_DATA} GiB)"
  if [ "$(az storage share-rm exists --resource-group "$RG" --storage-account "$STORAGE_ACCOUNT" \
          --name "$SHARE_NEO4J_SPE2_DATA" --query exists -o tsv)" = "true" ]; then
    ok "share ${SHARE_NEO4J_SPE2_DATA} exists"
  else
    az storage share-rm create --resource-group "$RG" --storage-account "$STORAGE_ACCOUNT" \
      --name "$SHARE_NEO4J_SPE2_DATA" --quota "$QUOTA_NEO4J_SPE2_DATA" --enabled-protocols SMB -o none
    ok "share ${SHARE_NEO4J_SPE2_DATA} created"
  fi

  if az containerapp env storage show --name "$ACA_ENV" --resource-group "$RG" \
       --storage-name "$STORAGE_NAME" -o none 2>/dev/null; then
    ok "environment storage ${STORAGE_NAME} attached"
  else
    local key
    key="$(az storage account keys list --resource-group "$RG" --account-name "$STORAGE_ACCOUNT" \
      --query "[0].value" -o tsv)"
    az containerapp env storage set --name "$ACA_ENV" --resource-group "$RG" \
      --storage-name "$STORAGE_NAME" \
      --azure-file-account-name "$STORAGE_ACCOUNT" --azure-file-account-key "$key" \
      --azure-file-share-name "$SHARE_NEO4J_SPE2_DATA" --access-mode ReadWrite -o none
    unset key
    ok "environment storage ${STORAGE_NAME} attached"
  fi

  local identity env_id location acr_password existed=""
  identity="$(identity_id)"
  env_id="$(az containerapp env show --name "$ACA_ENV" --resource-group "$RG" --query id -o tsv)"
  location="$(az containerapp env show --name "$ACA_ENV" --resource-group "$RG" --query location -o tsv)"
  acr_password="$(az acr credential show --name "$ACR_NAME" --query 'passwords[0].value' -o tsv)"
  SPEC="$(mktemp)"
  chmod 600 "$SPEC"
  cat >"$SPEC" <<YAML
location: ${location}
identity:
  type: UserAssigned
  userAssignedIdentities:
    ${identity}: {}
properties:
  environmentId: ${env_id}
  configuration:
    activeRevisionsMode: Single
    ingress:
      external: false
      transport: tcp
      targetPort: 7687
      exposedPort: ${NEO4J_SPE2_PORT}
    registries:
      - server: ${ACR_LOGIN_SERVER}
        username: ${ACR_NAME}
        passwordSecretRef: acr-password
    secrets:
      - name: acr-password
        value: ${acr_password}
      - name: neo4j-auth
        keyVaultUrl: $(kv_uri | sed 's:/*$::')/secrets/${KV_NEO4J_SPE2_AUTH}
        identity: ${identity}
  template:
    scale:
      minReplicas: 1
      maxReplicas: 1
    volumes:
      - name: neo4j-spe2-data
        storageType: AzureFile
        storageName: ${STORAGE_NAME}
    containers:
      - name: neo4j
        image: ${NEO4J_IMAGE}
        resources: { cpu: ${NEO4J_CPU}, memory: ${NEO4J_MEMORY} }
        volumeMounts:
          - { volumeName: neo4j-spe2-data, mountPath: /data }
        env:
          - { name: NEO4J_AUTH, secretRef: neo4j-auth }
          - { name: NEO4J_PLUGINS, value: '["apoc"]' }
          - { name: NEO4J_dbms_security_procedures_unrestricted, value: "apoc.*" }
          - { name: NEO4J_server_default__listen__address, value: "0.0.0.0" }
          - { name: NEO4J_server_memory_heap_initial__size, value: "${NEO4J_HEAP}" }
          - { name: NEO4J_server_memory_heap_max__size, value: "${NEO4J_HEAP}" }
          - { name: NEO4J_server_memory_pagecache_size, value: "${NEO4J_PAGECACHE}" }
          - { name: NEO4J_server_jvm_additional, value: "-XX:MaxDirectMemorySize=${NEO4J_DIRECT_MEMORY}" }
YAML
  unset acr_password

  if az containerapp show --name "$APP" --resource-group "$RG" -o none 2>/dev/null; then
    existed=1
    log "updating ${APP}"
    az containerapp update --name "$APP" --resource-group "$RG" --yaml "$SPEC" -o none
  else
    log "creating ${APP} (${NEO4J_CPU} vCPU, ${NEO4J_MEMORY}, ADR-056)"
    az containerapp create --name "$APP" --resource-group "$RG" --yaml "$SPEC" -o none
  fi
  rm -f "$SPEC"
  ok "${APP} applied"

  # A new revision cannot open the store while the old one holds its lock on
  # the share (docs/gotchas.md, 2026-10-04): retire the old one.
  if [ -n "$existed" ]; then
    RESOURCE_GROUP="$RG" "${SCRIPT_DIR}/retire-stale-revisions.sh" "$APP" ||
      warn "a stale ${APP} revision is still active"
  fi
  wait_for_app "$APP" 60
  echo "  Bolt: ${NEO4J_SPE2_BOLT_URI} (inside the environment only)"
  echo "  Next: $0 --seed"
}

# ── --seed ──────────────────────────────────────────────────────────────────
seed() {
  [ -n "$SEED_TAG" ] || { err "no commit touches ${SEED_FILES[*]}; run from the repository"; exit 1; }
  az containerapp show --name "$APP" --resource-group "$RG" -o none 2>/dev/null ||
    { err "${APP} does not exist; run $0 first"; exit 1; }

  if az acr repository show-tags --name "$ACR_NAME" --repository "$JOB" -o tsv 2>/dev/null | grep -qx "$SEED_TAG"; then
    ok "${SEED_IMAGE} already in ACR"
  else
    local ctx
    ctx="$(mktemp -d)"
    cp "${REPO_ROOT}/scripts/seed-spe2.py" "${REPO_ROOT}/neo4j/init-schema.cypher" \
      "${REPO_ROOT}/neo4j/register-fhir-dataset-hdcatap-spe2.cypher" "$ctx/"
    cat >"$ctx/Dockerfile" <<'DOCKERFILE'
# Python and the Neo4j driver: a one-shot copy from SPE-1 to SPE-2 (ADR-069).
FROM python:3.12-slim
RUN pip install --no-cache-dir neo4j==5.28.1
WORKDIR /app
COPY seed-spe2.py init-schema.cypher register-fhir-dataset-hdcatap-spe2.cypher /app/
ENV PYTHONUNBUFFERED=1
# SOURCE_NEO4J_* and TARGET_NEO4J_* come from the job's environment.
ENTRYPOINT ["python3", "/app/seed-spe2.py", "--schema", "/app/init-schema.cypher", \
            "--registration", "/app/register-fhir-dataset-hdcatap-spe2.cypher"]
DOCKERFILE
    az acr build --registry "$ACR_NAME" --image "${JOB}:${SEED_TAG}" --platform linux/amd64 "$ctx" -o none
    rm -rf "$ctx"
    ok "built ${SEED_IMAGE}"
  fi

  local identity ref
  identity="$(identity_id)"
  ref="keyvaultref:$(kv_uri | sed 's:/*$::')/secrets/${KV_NEO4J_SPE2_PASSWORD},identityref:${identity}"
  if ! az containerapp job show --name "$JOB" --resource-group "$RG" -o none 2>/dev/null; then
    local acr_password
    acr_password="$(az acr credential show --name "$ACR_NAME" --query 'passwords[0].value' -o tsv)"
    # --replica-retry-limit 0: a failed copy is an answer, not something to
    # repeat (and job create refuses the call without it, #205).
    az containerapp job create \
      --name "$JOB" --resource-group "$RG" --environment "$ACA_ENV" \
      --image "$SEED_IMAGE" \
      --registry-server "$ACR_LOGIN_SERVER" --registry-username "$ACR_NAME" \
      --registry-password "$acr_password" \
      --cpu 0.5 --memory 1Gi \
      --trigger-type Manual --replica-timeout "$SEED_TIMEOUT_SECONDS" --replica-retry-limit 0 \
      -o none
    unset acr_password
    ok "job ${JOB} created"
  fi
  az containerapp job identity assign --name "$JOB" --resource-group "$RG" \
    --user-assigned "$identity" -o none
  az containerapp job secret set --name "$JOB" --resource-group "$RG" \
    --secrets "${KV_NEO4J_SPE2_PASSWORD}=${ref}" -o none
  # SPE-1's credentials are the ones every job in env.sh uses (phases 6 and 9).
  az containerapp job update --name "$JOB" --resource-group "$RG" \
    --image "$SEED_IMAGE" \
    --set-env-vars \
      "SOURCE_NEO4J_URI=${NEO4J_BOLT_URI}" \
      "SOURCE_NEO4J_USER=${NEO4J_USER}" \
      "SOURCE_NEO4J_PASSWORD=${NEO4J_PASSWORD}" \
      "TARGET_NEO4J_URI=${NEO4J_SPE2_BOLT_URI}" \
      "TARGET_NEO4J_USER=${NEO4J_SPE2_USER}" \
      "TARGET_NEO4J_PASSWORD=secretref:${KV_NEO4J_SPE2_PASSWORD}" \
    -o none
  ok "job ${JOB} runs ${SEED_TAG}, reads the SPE-2 password from Key Vault"

  local execution status="" deadline
  execution="$(az containerapp job start --name "$JOB" --resource-group "$RG" --query name -o tsv)"
  log "seeding SPE-2: execution ${execution}"
  deadline=$((SECONDS + SEED_TIMEOUT_SECONDS))
  while [ "$SECONDS" -lt "$deadline" ]; do
    status="$(az containerapp job execution show --name "$JOB" --resource-group "$RG" \
      --job-execution-name "$execution" --query properties.status -o tsv 2>/dev/null || true)"
    case "$status" in Succeeded | Failed) break ;; esac
    sleep 10
  done
  # Logs reach Log Analytics a minute or more late; best effort, never the verdict.
  az containerapp job logs show --name "$JOB" --resource-group "$RG" --container "$JOB" \
    --execution "$execution" --tail 40 --format text 2>/dev/null || true
  if [ "$status" != "Succeeded" ]; then
    err "${JOB} ${execution}: ${status:-no answer within ${SEED_TIMEOUT_SECONDS}s}"
    exit 1
  fi
  ok "SPE-2 seeded (${execution})"
  echo "  Next: $0 --wire-proxy"
}

# ── --wire-proxy ────────────────────────────────────────────────────────────
wire_proxy() {
  local identity ref
  identity="$(identity_id)"
  ref="keyvaultref:$(kv_uri | sed 's:/*$::')/secrets/${KV_NEO4J_SPE2_PASSWORD},identityref:${identity}"
  log "${NEO4J_PROXY_APP}: identity, secret reference, env"
  az containerapp identity assign --name "$NEO4J_PROXY_APP" --resource-group "$RG" \
    --user-assigned "$identity" -o none
  az containerapp secret set --name "$NEO4J_PROXY_APP" --resource-group "$RG" \
    --secrets "${KV_NEO4J_SPE2_PASSWORD}=${ref}" -o none
  az containerapp update --name "$NEO4J_PROXY_APP" --resource-group "$RG" \
    --set-env-vars \
      "NEO4J_SPE2_URI=${NEO4J_SPE2_BOLT_URI}" \
      "NEO4J_SPE2_USER=${NEO4J_SPE2_USER}" \
      "NEO4J_SPE2_PASSWORD=secretref:${KV_NEO4J_SPE2_PASSWORD}" \
    -o none
  RESOURCE_GROUP="$RG" "${SCRIPT_DIR}/retire-stale-revisions.sh" --when-healthy "$NEO4J_PROXY_APP" ||
    warn "the previous ${NEO4J_PROXY_APP} revision is still active"
  ok "${NEO4J_PROXY_APP} federates over ${NEO4J_SPE2_BOLT_URI}"
  echo "  The proxy logs 'connected to Neo4j SPE-2' once it reaches it:"
  echo "  az containerapp logs show --name ${NEO4J_PROXY_APP} --resource-group ${RG} --type console --tail 200 | grep SPE-2"
}

case "$MODE" in
  --check) report ;;
  --create-secret) create_secret ;;
  --seed) seed ;;
  --wire-proxy) wire_proxy ;;
  apply) log "Phase 20: SPE-2 (ADR-069)"; apply_app ;;
  *) sed -n '3,37p' "${BASH_SOURCE[0]}"; exit 2 ;;
esac
