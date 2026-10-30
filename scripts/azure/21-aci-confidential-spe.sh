#!/usr/bin/env bash
set -euo pipefail
# =============================================================================
# Phase 21: two SPE workspaces as ACI confidential container groups, and the
# access body's Trustee (ADR-068, ADR-069, #774)
# =============================================================================
#   21-aci-confidential-spe.sh --trustee [--reference-values <file.json>]
#        identity, shares, images, mvhd-trustee (KBS + built-in AS) and its
#        admin job; resource policy deny-all until --policy binds the permits.
#        With --reference-values: set the SNP reference values (after the
#        first attestation; see --check).
#   21-aci-confidential-spe.sh --extracts
#        build kbs-client (snp attester) and spe-loader in ACR; the admin job
#        exports each SPE's half of the hub's patients, seals it, puts the key
#        into Trustee; the ciphertext is baked into mvhd-spe-loader-spe<n>.
#   21-aci-confidential-spe.sh --policy
#        TLS certificates, passwords, `az confcom acipolicygen` per group;
#        prints each policy hash (SHA-256 of the ccePolicy = SEV-SNP HOST_DATA),
#        records it on the permit and binds it in Trustee's resource policy.
#   21-aci-confidential-spe.sh --workspaces
#        deploy mvhd-spe-1 and mvhd-spe-2 (sku Confidential).
#   21-aci-confidential-spe.sh --wire-proxy
#        point mvhd-neo4j-proxy at both workspaces (Bolt with TLS, CA pinned).
#   21-aci-confidential-spe.sh --check
#        report, change nothing; prints each workspace's attestation and the
#        claims to pin as reference values.
#
# Idempotent: every phase can run again. Needs a fresh `az login` (one hour)
# and the PIM role rol-ssg-prd-project_owner (identities, role assignments,
# shares); `az confcom` (az extension add --name confcom) and Docker for
# --policy, which pulls the images to measure them.
#
# What lives where (ADR-068 decision 1, ADR-069):
#   - Trustee's admin key, token signing key, resource policy, reference
#     values and the extract keys: Trustee's own shares (trustee-keys,
#     trustee-data), mounted into mvhd-trustee and its admin job only. Never
#     the hub's Key Vault, never this laptop. Honest limit: the shares are in
#     the hub's storage account, so the subscription owner could read them;
#     for the claim to hold, MedReg DE runs Trustee in a subscription of its own.
#   - The workspaces' Bolt CA: ${SPE_CA_DIR} on this laptop (mode 700). The
#     server keys and Neo4j passwords reach each group through its secret
#     volume, outside the ccePolicy; the passwords are in the hub's Key Vault
#     because the proxy needs them (not in the key path).
#   - Nothing secret is printed. State that is not secret (image digests,
#     policy hashes, FQDNs) is kept in ${SPE_STATE_DIR}/state.env.
# =============================================================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
# shellcheck source=scripts/azure/env.sh
source "$SCRIPT_DIR/env.sh"

MODE="${1:-}"
SPE_STATE_DIR="${SPE_STATE_DIR:-${HOME}/.mvhd/spe-state}"
STATE="${SPE_STATE_DIR}/state.env"
TEMPLATE="${SCRIPT_DIR}/aci/spe-workspace.template.json"
JOB_TIMEOUT_SECONDS="${JOB_TIMEOUT_SECONDS:-1800}"
WORK=""
trap 'if [ -n "$WORK" ]; then rm -rf "$WORK"; fi' EXIT

mkdir -p "$SPE_STATE_DIR"
chmod 700 "$SPE_STATE_DIR" "${HOME}/.mvhd" 2>/dev/null || true
touch "$STATE"
# shellcheck source=/dev/null
source "$STATE"

state_set() {  # state_set KEY VALUE (not a secret)
  local tmp
  tmp="$(mktemp)"
  grep -v "^${1}=" "$STATE" >"$tmp" || true
  printf '%s=%q\n' "$1" "$2" >>"$tmp"
  mv "$tmp" "$STATE"
  export "$1=$2"
}
workdir() { WORK="$(mktemp -d)"; chmod 700 "$WORK"; }
fqdn_of() { printf '%s-%s.%s.azurecontainer.io' "mvhd-spe-${1}" "$SPE_DNS_SUFFIX" "$LOCATION"; }
group_of() { printf 'mvhd-spe-%s' "$1"; }
kv_uri() {
  local uri
  uri="$(az keyvault show --name "$KEY_VAULT_NAME" --query properties.vaultUri -o tsv 2>/dev/null || true)"
  uri="${uri:-https://${KEY_VAULT_NAME}.vault.azure.net/}"
  printf '%s' "${uri%/}"
}
kv_has() { az keyvault secret show --vault-name "$KEY_VAULT_NAME" --name "$1" --query id -o none 2>/dev/null; }
identity_ensure() {  # identity_ensure NAME -> prints resource id
  az identity show -n "$1" -g "$RG" -o none 2>/dev/null || az identity create -n "$1" -g "$RG" --tags project=mvhd adr=ADR-069 -o none
  az identity show -n "$1" -g "$RG" --query id -o tsv
}
grant() {  # grant <principal-id> <role> <scope>
  if [ -n "$(az role assignment list --assignee "$1" --role "$2" --scope "$3" --query '[0].id' -o tsv 2>/dev/null)" ]; then
    ok "  ${2} on ${3##*/}: present"; return 0
  fi
  for _ in 1 2 3 4 5 6; do
    az role assignment create --assignee-object-id "$1" --assignee-principal-type ServicePrincipal \
      --role "$2" --scope "$3" -o none 2>/dev/null && { ok "  ${2} on ${3##*/}: granted"; return 0; }
    sleep 10
  done
  err "could not grant ${2} on ${3}"; exit 1
}
storage_key() {
  az storage account keys list -g "$RG" -n "$STORAGE_ACCOUNT" --query '[0].value' -o tsv
}
digest_of() {  # digest_of <repo> <tag> -> sha256:...
  az acr repository show -n "$ACR_NAME" --image "${1}:${2}" --query digest -o tsv 2>/dev/null || true
}

# ── images ──────────────────────────────────────────────────────────────────
# Tagged with the commit of what they carry, never :latest (gotcha #6).
build_images() {
  local tag kdig ldig ctx
  tag="$(git -C "$REPO_ROOT" log -1 --format=%h -- services/spe-loader trustee neo4j/init-schema.cypher \
    neo4j/register-fhir-dataset-hdcatap-spe1.cypher neo4j/register-fhir-dataset-hdcatap-spe2.cypher)"

  kdig="$(digest_of "$KBS_CLIENT_ACI_REPO" "$TRUSTEE_VERSION")"
  if [ -z "$kdig" ]; then
    log "building ${KBS_CLIENT_ACI_REPO}:${TRUSTEE_VERSION} in ACR (Rust, about 20 minutes)"
    az acr build -r "$ACR_NAME" -t "${KBS_CLIENT_ACI_REPO}:${TRUSTEE_VERSION}" --platform linux/amd64 \
      -f "${REPO_ROOT}/services/spe-loader/kbs-client.aci.Dockerfile" "${REPO_ROOT}/services/spe-loader" -o none
    kdig="$(digest_of "$KBS_CLIENT_ACI_REPO" "$TRUSTEE_VERSION")"
  fi
  state_set KBS_CLIENT_ACI_DIGEST "$kdig"
  ok "kbs-client (snp attester): ${ACR_LOGIN_SERVER}/${KBS_CLIENT_ACI_REPO}@${kdig}"

  ldig="$(digest_of "$SPE_LOADER_REPO" "$tag")"
  if [ -z "$ldig" ]; then
    workdir; ctx="$WORK/ctx"
    mkdir -p "$ctx/services/spe-loader" "$ctx/neo4j" "$ctx/trustee"
    (cd "${REPO_ROOT}/services/spe-loader" && cp -R package.json package-lock.json tsconfig.json tsconfig.build.json src scripts Dockerfile "$ctx/services/spe-loader/")
    cp "${REPO_ROOT}/neo4j/init-schema.cypher" "${REPO_ROOT}"/neo4j/register-fhir-dataset-hdcatap-spe[12].cypher "$ctx/neo4j/"
    cp -R "${REPO_ROOT}/trustee/policies" "${REPO_ROOT}/trustee/reference-values-local.json" "${REPO_ROOT}/trustee/workload-local.json" "$ctx/trustee/"
    log "building ${SPE_LOADER_REPO}:${tag} in ACR"
    az acr build -r "$ACR_NAME" -t "${SPE_LOADER_REPO}:${tag}" --platform linux/amd64 \
      --build-arg "KBS_CLIENT_IMAGE=${ACR_LOGIN_SERVER}/${KBS_CLIENT_ACI_REPO}@${kdig}" \
      -f "$ctx/services/spe-loader/Dockerfile" "$ctx" -o none
    rm -rf "$WORK"; WORK=""
    ldig="$(digest_of "$SPE_LOADER_REPO" "$tag")"
  fi
  state_set SPE_LOADER_IMAGE "${ACR_LOGIN_SERVER}/${SPE_LOADER_REPO}@${ldig}"
  ok "spe-loader: ${SPE_LOADER_IMAGE}"

  if [ -z "$(digest_of key-broker-service "built-in-as-${TRUSTEE_VERSION}")" ]; then
    log "importing Trustee KBS ${TRUSTEE_VERSION} into ACR (pinned by digest)"
    az acr import -n "$ACR_NAME" --source "$TRUSTEE_KBS_SOURCE" --image "key-broker-service:built-in-as-${TRUSTEE_VERSION}" -o none
  fi
  state_set TRUSTEE_KBS_DIGEST "$(digest_of key-broker-service "built-in-as-${TRUSTEE_VERSION}")"
  ok "KBS: ${TRUSTEE_KBS_IMAGE}@${TRUSTEE_KBS_DIGEST}"
}

# ── the admin job (as MedReg DE) ────────────────────────────────────────────
run_admin() {  # run_admin <command> <args...>: one execution of mvhd-trustee-admin, waited for
  local cmd="$1" execution status="" deadline
  shift
  execution="$(az containerapp job start -n "$TRUSTEE_ADMIN_JOB" -g "$RG" \
    --image "$SPE_LOADER_IMAGE" --container-name trustee-admin \
    --command "$cmd" --args "$@" --query name -o tsv)"
  log "${TRUSTEE_ADMIN_JOB}: ${execution} (${cmd} $1)"
  deadline=$((SECONDS + JOB_TIMEOUT_SECONDS))
  while [ "$SECONDS" -lt "$deadline" ]; do
    status="$(az containerapp job execution show -n "$TRUSTEE_ADMIN_JOB" -g "$RG" \
      --job-execution-name "$execution" --query properties.status -o tsv 2>/dev/null || true)"
    case "$status" in Succeeded | Failed) break ;; esac
    sleep 10
  done
  az containerapp job logs show -n "$TRUSTEE_ADMIN_JOB" -g "$RG" --container trustee-admin \
    --execution "$execution" --tail 40 --format text 2>/dev/null || true
  [ "$status" = Succeeded ] || { err "${TRUSTEE_ADMIN_JOB} ${execution}: ${status:-no answer}"; exit 1; }
}

# ── --trustee ───────────────────────────────────────────────────────────────
trustee() {
  local rv="${1:-}" tid tprincipal acr_id key env_id spec share
  log "Phase 21 --trustee: mvhd-trustee, operated as MedReg DE (ADR-068)"
  tid="$(identity_ensure "$TRUSTEE_IDENTITY")"
  tprincipal="$(az identity show -n "$TRUSTEE_IDENTITY" -g "$RG" --query principalId -o tsv)"
  acr_id="$(az acr show -n "$ACR_NAME" --query id -o tsv)"
  grant "$tprincipal" AcrPull "$acr_id"

  key="$(storage_key)"
  for share in "$SHARE_TRUSTEE_KEYS" "$SHARE_TRUSTEE_DATA" "$SHARE_SPE_EXTRACTS"; do
    az storage share-rm show -g "$RG" --storage-account "$STORAGE_ACCOUNT" -n "$share" -o none 2>/dev/null ||
      az storage share-rm create -g "$RG" --storage-account "$STORAGE_ACCOUNT" -n "$share" --quota 1 -o none
    az containerapp env storage set -n "$ACA_ENV" -g "$RG" --storage-name "$share" \
      --azure-file-account-name "$STORAGE_ACCOUNT" --azure-file-account-key "$key" \
      --azure-file-share-name "$share" --access-mode ReadWrite -o none
    ok "share ${share}"
  done
  # The KBS configuration sits beside its keys; uploaded every run, so a change
  # in trustee/kbs-config.toml reaches Trustee on its next restart.
  az storage file upload --account-name "$STORAGE_ACCOUNT" --account-key "$key" --share-name "$SHARE_TRUSTEE_KEYS" \
    --source "${REPO_ROOT}/trustee/kbs-config.toml" --path kbs-config.toml -o none
  key=""

  build_images
  env_id="$(az containerapp env show -n "$ACA_ENV" -g "$RG" --query id -o tsv)"
  workdir; spec="$WORK/trustee.yaml"
  cat >"$spec" <<YAML
location: ${LOCATION}
identity:
  type: UserAssigned
  userAssignedIdentities:
    ${tid}: {}
tags: {project: mvhd, adr: ADR-069, operator: "MedReg DE (access body)"}
properties:
  environmentId: ${env_id}
  configuration:
    activeRevisionsMode: Single
    registries:
      - server: ${ACR_LOGIN_SERVER}
        identity: ${tid}
    ingress:
      external: true
      targetPort: 8080
      transport: http
      allowInsecure: false
  template:
    initContainers:
      - name: trustee-setup
        image: ${SPE_LOADER_IMAGE}
        command: ["bash", "/app/scripts/trustee-setup.sh", "/keys"]
        resources: {cpu: 0.25, memory: 0.5Gi}
        volumeMounts: [{volumeName: keys, mountPath: /keys}]
    containers:
      - name: kbs
        image: ${TRUSTEE_KBS_IMAGE}@${TRUSTEE_KBS_DIGEST}
        command: ["/usr/local/bin/kbs", "--config-file", "/opt/confidential-containers/kbs/user-keys/kbs-config.toml"]
        env: [{name: RUST_LOG, value: info}]
        resources: {cpu: 0.5, memory: 1Gi}
        volumeMounts:
          - {volumeName: keys, mountPath: /opt/confidential-containers/kbs/user-keys}
          - {volumeName: data, mountPath: /opt/confidential-containers/storage}
    scale: {minReplicas: 1, maxReplicas: 1}
    volumes:
      - {name: keys, storageType: AzureFile, storageName: ${SHARE_TRUSTEE_KEYS}}
      - {name: data, storageType: AzureFile, storageName: ${SHARE_TRUSTEE_DATA}}
YAML
  if az containerapp show -n "$TRUSTEE_APP" -g "$RG" -o none 2>/dev/null; then
    az containerapp update -n "$TRUSTEE_APP" -g "$RG" --yaml "$spec" -o none
  else
    az containerapp create -n "$TRUSTEE_APP" -g "$RG" --yaml "$spec" -o none
  fi
  state_set TRUSTEE_FQDN "$(az containerapp show -n "$TRUSTEE_APP" -g "$RG" --query properties.configuration.ingress.fqdn -o tsv)"
  ok "${TRUSTEE_APP}: https://${TRUSTEE_FQDN}"

  spec="$WORK/admin.yaml"
  cat >"$spec" <<YAML
location: ${LOCATION}
identity:
  type: UserAssigned
  userAssignedIdentities:
    ${tid}: {}
properties:
  environmentId: ${env_id}
  configuration:
    triggerType: Manual
    replicaTimeout: ${JOB_TIMEOUT_SECONDS}
    replicaRetryLimit: 0
    manualTriggerConfig: {parallelism: 1, replicaCompletionCount: 1}
    registries:
      - server: ${ACR_LOGIN_SERVER}
        identity: ${tid}
    secrets:
      - {name: hub-neo4j-password, value: "${NEO4J_PASSWORD}"}
  template:
    containers:
      - name: trustee-admin
        image: ${SPE_LOADER_IMAGE}
        command: ["spe-loader"]
        args: ["trustee-configure"]
        resources: {cpu: 1.0, memory: 2Gi}
        env:
          - {name: TRUSTEE_URL, value: "http://${TRUSTEE_APP}"}
          - {name: TRUSTEE_ADMIN_TOKEN_FILE, value: /keys/admin-token}
          - {name: HUB_NEO4J_URI, value: "${NEO4J_BOLT_URI}"}
          - {name: HUB_NEO4J_USER, value: "${NEO4J_USER}"}
          - {name: HUB_NEO4J_PASSWORD, secretRef: hub-neo4j-password}
          - {name: SPE_PERMIT_ID, value: "${SPE_PERMIT_ID}"}
        volumeMounts:
          - {volumeName: keys, mountPath: /keys}
          - {volumeName: extracts, mountPath: /extracts}
    volumes:
      - {name: keys, storageType: AzureFile, storageName: ${SHARE_TRUSTEE_KEYS}}
      - {name: extracts, storageType: AzureFile, storageName: ${SHARE_SPE_EXTRACTS}}
YAML
  if az containerapp job show -n "$TRUSTEE_ADMIN_JOB" -g "$RG" -o none 2>/dev/null; then
    az containerapp job update -n "$TRUSTEE_ADMIN_JOB" -g "$RG" --yaml "$spec" -o none
  else
    az containerapp job create -n "$TRUSTEE_ADMIN_JOB" -g "$RG" --yaml "$spec" -o none
  fi
  rm -rf "$WORK"; WORK=""
  ok "${TRUSTEE_ADMIN_JOB} (identity ${TRUSTEE_IDENTITY})"

  # Until --policy binds the permits, nothing is released: KBS's built-in
  # default would release to any non-sample TEE.
  if [ -z "${SPE_POLICY_HASHES:-}" ]; then
    run_admin kbs-client --url "http://${TRUSTEE_APP}" config --admin-token-file /keys/admin-token set-resource-policy --deny-all
  else
    run_admin spe-loader trustee-configure --resource-policy-template /app/trustee/policies/resource-azure.rego.tmpl \
      --policy-hashes "$SPE_POLICY_HASHES"
  fi
  if [ -n "$rv" ]; then
    [ -s "$rv" ] || { err "no reference values file ${rv}"; exit 1; }
    run_admin spe-loader trustee-configure --reference-values "$(jq -c . "$rv")"
    ok "reference values set from ${rv}; restart the workspaces: az container restart -n mvhd-spe-<n> -g ${RG}"
  fi
  echo "  Next: $0 --extracts"
}

# ── --extracts ──────────────────────────────────────────────────────────────
extracts() {
  local key n tag dig
  log "Phase 21 --extracts: sealed extracts, keys into Trustee (Art. 73(2))"
  [ -n "${SPE_LOADER_IMAGE:-}" ] || build_images
  run_admin bash /app/scripts/extract-all.sh /extracts
  workdir
  key="$(storage_key)"
  tag="$(date -u +%Y%m%d%H%M)"
  for n in 1 2; do
    az storage file download --account-name "$STORAGE_ACCOUNT" --account-key "$key" --share-name "$SHARE_SPE_EXTRACTS" \
      --path "spe-${n}.enc" --dest "$WORK/spe.enc" -o none
    # Ciphertext only: the key went from the job straight into Trustee.
    printf 'FROM %s\nCOPY spe.enc /extracts/spe.enc\n' "$SPE_LOADER_IMAGE" >"$WORK/Dockerfile"
    az acr build -r "$ACR_NAME" -t "${SPE_LOADER_REPO}-spe${n}:${tag}" --platform linux/amd64 -f "$WORK/Dockerfile" "$WORK" -o none
    dig="$(digest_of "${SPE_LOADER_REPO}-spe${n}" "$tag")"
    state_set "SPE${n}_LOADER_IMAGE" "${ACR_LOGIN_SERVER}/${SPE_LOADER_REPO}-spe${n}@${dig}"
    ok "SPE-${n}: $(eval "printf '%s' \"\$SPE${n}_LOADER_IMAGE\"")"
    rm -f "$WORK/spe.enc"
  done
  key=""
  rm -rf "$WORK"; WORK=""
  echo "  Next: $0 --policy (the images changed, so the policy hashes do)"
}

# ── --policy ────────────────────────────────────────────────────────────────
params_file() {  # params_file <n> <file> <with-secrets:0|1>
  local n="$1" out="$2" secrets="$3" tls="${SPE_STATE_DIR}/tls-${1}" pid pw auth="" pwb="" keyb=""
  pid="$(az identity show -n "$SPE_PULL_IDENTITY" -g "$RG" --query id -o tsv)"
  if [ "$secrets" = 1 ]; then
    pw="$(az keyvault secret show --vault-name "$KEY_VAULT_NAME" --name "$(eval "printf '%s' \"\$KV_SPE${n}_NEO4J_PASSWORD\"")" --query value -o tsv)"
    auth="$(printf 'neo4j/%s' "$pw" | base64 | tr -d '\n')"
    pwb="$(printf '%s' "$pw" | base64 | tr -d '\n')"
    keyb="$(base64 <"${tls}/private.key" | tr -d '\n')"
    pw=""
  fi
  jq -n \
    --arg name "$(group_of "$n")" --arg location "$LOCATION" --arg n "$n" \
    --arg loader "$(eval "printf '%s' \"\$SPE${n}_LOADER_IMAGE\"")" \
    --arg neo4j "${NEO4J_IMAGE}" --arg dns "mvhd-spe-${n}-${SPE_DNS_SUFFIX}" \
    --arg trustee "https://${TRUSTEE_FQDN}" --arg registry "$ACR_LOGIN_SERVER" --arg pull "$pid" \
    --arg key "${keyb:-cGxhY2Vob2xkZXI=}" --arg cert "$(base64 <"${tls}/public.crt" | tr -d '\n')" \
    --arg auth "${auth:-cGxhY2Vob2xkZXI=}" --arg pw "${pwb:-cGxhY2Vob2xkZXI=}" \
    '{"$schema":"https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#",
      contentVersion:"1.0.0.0",
      parameters:{name:{value:$name},location:{value:$location},speNumber:{value:$n},
        loaderImage:{value:$loader},neo4jImage:{value:$neo4j},dnsLabel:{value:$dns},
        trusteeUrl:{value:$trustee},registryServer:{value:$registry},pullIdentity:{value:$pull},
        boltTlsKey:{value:$key},boltTlsCert:{value:$cert},neo4jAuth:{value:$auth},neo4jPassword:{value:$pw}}}' >"$out"
  chmod 600 "$out"
}

policy() {
  local pid pprincipal acr_id n s hash hashes="{}" tmpl
  log "Phase 21 --policy: TLS, passwords, ccePolicy per group, the permit's hash"
  for s in SPE1_LOADER_IMAGE SPE2_LOADER_IMAGE TRUSTEE_FQDN; do
    [ -n "${!s:-}" ] || { err "${s} unknown: run --trustee and --extracts first"; exit 1; }
  done
  az confcom --help >/dev/null 2>&1 || { err "az confcom missing: az extension add --name confcom"; exit 1; }
  pid="$(identity_ensure "$SPE_PULL_IDENTITY")"
  pprincipal="$(az identity show -n "$SPE_PULL_IDENTITY" -g "$RG" --query principalId -o tsv)"
  acr_id="$(az acr show -n "$ACR_NAME" --query id -o tsv)"
  grant "$pprincipal" AcrPull "$acr_id"
  : "$pid"
  az acr login -n "$ACR_NAME" >/dev/null

  for n in 1 2; do
    s="$(eval "printf '%s' \"\$KV_SPE${n}_NEO4J_PASSWORD\"")"
    if ! kv_has "$s"; then
      az keyvault secret set --vault-name "$KEY_VAULT_NAME" --name "$s" \
        --value "$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-28)" -o none
      ok "created ${s} in ${KEY_VAULT_NAME} (not displayed)"
    fi
    [ -s "${SPE_STATE_DIR}/tls-${n}/public.crt" ] ||
      "${SCRIPT_DIR}/spe-tls.sh" "$SPE_CA_DIR" "${SPE_STATE_DIR}/tls-${n}" "$(fqdn_of "$n")"
    chmod 700 "$SPE_CA_DIR" "${SPE_STATE_DIR}/tls-${n}"

    # The policy covers images (by digest, layer by layer), commands, env and
    # mounts; never a secret's value, so placeholders are enough here.
    workdir
    tmpl="$WORK/template.json"
    cp "$TEMPLATE" "$tmpl"
    params_file "$n" "$WORK/params.json" 0
    az confcom acipolicygen -a "$tmpl" -p "$WORK/params.json" -y >/dev/null
    jq -e '.resources[0].properties.confidentialComputeProperties.ccePolicy | length > 0' "$tmpl" >/dev/null ||
      { err "acipolicygen left ccePolicy empty for SPE-${n}"; exit 1; }
    cp "$tmpl" "${SPE_STATE_DIR}/template-spe${n}.json"
    hash="sha256:$(jq -r '.resources[0].properties.confidentialComputeProperties.ccePolicy' "$tmpl" | base64 -d | shasum -a 256 | cut -c1-64)"
    rm -rf "$WORK"; WORK=""
    state_set "SPE${n}_POLICY_HASH" "$hash"
    ok "SPE-${n} policy hash (= SEV-SNP HOST_DATA): ${hash}"
    run_admin spe-loader record-permit --spe "$n" --policy-hash "$hash"
    hashes="$(jq -c --arg k "spe-${n}" --arg v "$hash" '. + {($k): $v}' <<<"$hashes")"
  done
  state_set SPE_POLICY_HASHES "$hashes"
  run_admin spe-loader trustee-configure --resource-policy-template /app/trustee/policies/resource-azure.rego.tmpl \
    --policy-hashes "$hashes"
  ok "Trustee releases default/spe-<n>/extract-key only to HOST_DATA = the permit's hash"
  echo "  Next: $0 --workspaces"
}

# ── --workspaces ────────────────────────────────────────────────────────────
workspaces() {
  local n
  log "Phase 21 --workspaces: mvhd-spe-1, mvhd-spe-2 (ACI, sku Confidential)"
  for n in 1 2; do
    [ -s "${SPE_STATE_DIR}/template-spe${n}.json" ] || { err "no generated template for SPE-${n}: run --policy"; exit 1; }
    workdir
    params_file "$n" "$WORK/params.json" 1
    az deployment group create -g "$RG" -n "spe-${n}-workspace" \
      -f "${SPE_STATE_DIR}/template-spe${n}.json" -p "@$WORK/params.json" -o none
    rm -rf "$WORK"; WORK=""
    ok "$(group_of "$n"): bolt+s://$(fqdn_of "$n"):7687"
  done
  echo "  Off hours (ADR-053): run scripts/azure/18-offhours-jobs.sh once more, so id-mvhd-offhours"
  echo "  may stop and start the groups (Contributor on each group, nothing else)."
  echo "  Next: $0 --wire-proxy, then $0 --check"
}

# ── --wire-proxy ────────────────────────────────────────────────────────────
wire_proxy() {
  local identity kv n
  log "Phase 21 --wire-proxy: ${NEO4J_PROXY_APP} federates over the workspaces"
  identity="$(az containerapp show -n "$NEO4J_PROXY_APP" -g "$RG" --query "keys(identity.userAssignedIdentities)[0]" -o tsv 2>/dev/null || true)"
  [ -n "$identity" ] || identity="$(az identity show -n id-mvhd-claude-federation -g "$RG" --query id -o tsv)"
  az containerapp identity assign -n "$NEO4J_PROXY_APP" -g "$RG" --user-assigned "$identity" -o none
  kv="$(kv_uri)"
  # The CA certificate is public, but multi-line: a secret is how ACA carries it.
  az containerapp secret set -n "$NEO4J_PROXY_APP" -g "$RG" --secrets \
    "spe-1-neo4j-password=keyvaultref:${kv}/secrets/${KV_SPE1_NEO4J_PASSWORD},identityref:${identity}" \
    "spe-2-neo4j-password=keyvaultref:${kv}/secrets/${KV_SPE2_NEO4J_PASSWORD},identityref:${identity}" \
    "spe-ca-cert=$(cat "${SPE_CA_DIR}/ca.crt")" -o none
  az containerapp update -n "$NEO4J_PROXY_APP" -g "$RG" --set-env-vars \
    "NEO4J_SPE1_URI=bolt+s://$(fqdn_of 1):7687" "NEO4J_SPE1_USER=neo4j" "NEO4J_SPE1_PASSWORD=secretref:spe-1-neo4j-password" \
    "NEO4J_SPE2_URI=bolt+s://$(fqdn_of 2):7687" "NEO4J_SPE2_USER=neo4j" "NEO4J_SPE2_PASSWORD=secretref:spe-2-neo4j-password" \
    "NEO4J_SPE_CA_CERT=secretref:spe-ca-cert" \
    "SPE_ENVIRONMENT=azure" "TRUSTEE_URL=https://${TRUSTEE_FQDN}" "TRUSTEE_PROBE_URL=http://${TRUSTEE_APP}" \
    "TRUSTEE_VERIFIER=snp" \
    "SPE1_RUNS_ON=ACI confidential container group mvhd-spe-1 (${LOCATION})" \
    "SPE2_RUNS_ON=ACI confidential container group mvhd-spe-2 (${LOCATION})" -o none
  RESOURCE_GROUP="$RG" "${SCRIPT_DIR}/retire-stale-revisions.sh" --when-healthy "$NEO4J_PROXY_APP" ||
    warn "the previous ${NEO4J_PROXY_APP} revision is still active"
  ok "${NEO4J_PROXY_APP}: SPE-1 and SPE-2 are the ACI workspaces, CA pinned"
  for n in 1 2; do
    echo "  SPE-${n}: bolt+s://$(fqdn_of "$n"):7687"
  done
}

# ── --check ─────────────────────────────────────────────────────────────────
check() {
  local n g
  log "Phase 21 --check"
  echo "  state: ${STATE}"
  grep -E '^(TRUSTEE_FQDN|SPE[12]_POLICY_HASH|SPE[12]_LOADER_IMAGE|KBS_CLIENT_ACI_DIGEST)=' "$STATE" | sed 's/^/    /' || true
  if az containerapp show -n "$TRUSTEE_APP" -g "$RG" -o none 2>/dev/null; then
    echo "  ${TRUSTEE_APP}: $(az containerapp show -n "$TRUSTEE_APP" -g "$RG" --query properties.runningStatus -o tsv)," \
      "answers HTTP $(curl -s -o /dev/null -w '%{http_code}' "https://${TRUSTEE_FQDN:-none}/kbs/v0/auth" || echo 000)"
  else
    echo "  MISSING  ${TRUSTEE_APP}"
  fi
  for n in 1 2; do
    g="$(group_of "$n")"
    if ! az container show -n "$g" -g "$RG" -o none 2>/dev/null; then echo "  MISSING  ${g}"; continue; fi
    az container show -n "$g" -g "$RG" --query "{group:name, state:instanceView.state, sku:sku, fqdn:ipAddress.fqdn}" -o json
    # The loader prints the attestation verdict and the claims to pin; no secret.
    echo "  ${g} spe-unlock:"
    az container logs -n "$g" -g "$RG" --container-name spe-unlock 2>/dev/null | grep -E 'attested|refused|pinnable|platform|HOST_DATA' | sed 's/^/    /' || true
    echo "  ${g} spe-ingest:"
    az container logs -n "$g" -g "$RG" --container-name spe-ingest 2>/dev/null | tail -3 | sed 's/^/    /' || true
  done
  echo "  First run: copy the pinnable claims into a file shaped like trustee/reference-values-aci.example.json,"
  echo "  then: $0 --trustee --reference-values <file> and restart both groups."
}

case "$MODE" in
  --trustee)
    if [ "${2:-}" = --reference-values ]; then trustee "${3:-}"; else trustee; fi ;;
  --extracts) extracts ;;
  --policy) policy ;;
  --workspaces) workspaces ;;
  --wire-proxy) wire_proxy ;;
  --check) check ;;
  *) sed -n '3,47p' "${BASH_SOURCE[0]}"; exit 2 ;;
esac
