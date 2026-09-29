#!/usr/bin/env bash
# Build all custom images for linux/amd64 and push to ACR.
# Third-party images (Neo4j, Keycloak, Vault, NATS) are pulled and re-tagged.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
source "${SCRIPT_DIR}/env.sh"

log "Building and pushing all images to ${ACR_LOGIN_SERVER}"
az acr login --name "$ACR_NAME"

# ── Custom images (built from source) ───────────────────────────────────────
build_and_push() {
  local name="$1" context="$2" dockerfile="${3:-Dockerfile}" image="$4"
  log "Building ${name}..."
  docker buildx build --platform linux/amd64 \
    -f "${context}/${dockerfile}" \
    -t "${image}" --push "${context}"
  ok "${name} → ${image}"
}

build_and_push "UI" "${REPO_ROOT}/ui" "Dockerfile" "$UI_IMAGE"
build_and_push "Neo4j Proxy" "${REPO_ROOT}/services/neo4j-proxy" "Dockerfile" "$NEO4J_PROXY_IMAGE"

# ── Third-party images (pull amd64, re-tag, push) ───────────────────────────
# The SOURCE tag must be pinned, not floating. These four previously pulled
# `neo4j:5-community`, `keycloak:latest`, `vault:latest` and `nats:alpine`, then
# pushed them to ACR under a version tag from env.sh — so `acr/keycloak:26.6.4`
# contained whatever `latest` happened to be on the build day. The pin was a
# label, not a guarantee: rebuilding the "same" version silently changed
# production, and the Trivy matrix in security-scan.yml was scanning the real
# upstream 26.6.4 rather than the image actually deployed. ADR-029 pinning is
# only real if the source is pinned too.
pull_retag_push() {
  local name="$1" source="$2" target="$3"
  log "Pulling ${name} (amd64) from ${source}..."
  docker pull --platform linux/amd64 "$source"
  docker tag "$source" "$target"
  docker push "$target"
  ok "${name} → ${target}"
}

pull_retag_push "Neo4j" "neo4j:${NEO4J_VERSION}" "$NEO4J_IMAGE"
pull_retag_push "Keycloak" "quay.io/keycloak/keycloak:${KEYCLOAK_VERSION}" "$KEYCLOAK_IMAGE"
pull_retag_push "Vault" "hashicorp/vault:${VAULT_VERSION}" "$VAULT_IMAGE"
pull_retag_push "NATS" "nats:${NATS_VERSION}" "$NATS_IMAGE"
pull_retag_push "nginx (CFM control-plane shim)" "nginx:${NGINX_VERSION:-1.29-alpine}" "$CFM_CP_SHIM_IMAGE"

# ── CFM provisioning agents (imported from GHCR by digest) ──────────────────
# Not built here and not pulled through this laptop either: `az acr import`
# copies server side, so a multi-hundred-MB image never crosses the local
# network and no `docker pull` of a foreign-arch manifest can pick the wrong
# platform. The source is a digest, which is the whole point — GHCR `:latest`
# for these four was overwritten on 2026-04-11 with a build that panics at
# launch without a Fulcrum job coordinator (ADR-029, #181), and the digests
# below are the 2026-03-09 build that works. They match docker-compose.jad.yml.
#
# Idempotent: an import onto a tag that already resolves to the same digest is
# a no-op, so a re-run costs one API call per image.
# Azure Container Apps runs linux/amd64 and only linux/amd64. Importing an
# arm64-only digest would put an image in ACR that ACA starts and never runs,
# which is #380 happening a second time in a different place — there, compose
# said "Started" for a linux/arm64 Tenant Manager on an amd64 runner and every
# call to it failed for months without anything saying why. So check the
# manifest before importing, and refuse rather than leave that trap in ACR.
import_from_ghcr() {
  local name="$1" repo="$2" digest="$3" tag="$4"

  local ref="ghcr.io/ma3u/health-dataspace/${repo}@${digest}"
  if ! python3 "${REPO_ROOT}/scripts/check-image-platforms.py" --ref "$ref" >/dev/null 2>&1; then
    err "${name}: ${repo}@${digest:0:19}... has no linux/amd64 manifest."
    err "  Azure Container Apps is amd64 only, so this image would be imported,"
    err "  deployed, reported Started, and never serve. Not importing it."
    err "  The working 2026-03-09 CFM build is arm64 only; GHCR :latest is amd64"
    err "  but is the 2026-04-11 build that panics without a Fulcrum job"
    err "  coordinator (ADR-029, #181). An amd64 build of the 2026-03-09 source"
    err "  is what #318 and #380 both need. Run:"
    err "    python3 scripts/check-image-platforms.py --ref ${ref}"
    return 1
  fi

  log "Importing ${name} from GHCR (${digest:0:19}...)..."
  if az acr import --name "$ACR_NAME" \
      --source "ghcr.io/ma3u/health-dataspace/${repo}@${digest}" \
      --image "${repo}:${tag}" --force -o none; then
    ok "${name} → ${ACR_LOGIN_SERVER}/${repo}:${tag}"
  else
    err "${name}: import failed. GHCR must serve this digest publicly, and the"
    err "  account needs AcrPush on ${ACR_NAME}."
    return 1
  fi
}

AGENTS_IMPORTED=0
AGENTS_BLOCKED=0
for _spec in \
  "CFM Keycloak agent|cfm-kcagent|${CFM_KC_AGENT_DIGEST}" \
  "CFM EDC-V agent|cfm-edcvagent|${CFM_EDCV_AGENT_DIGEST}" \
  "CFM Registration agent|cfm-regagent|${CFM_REG_AGENT_DIGEST}" \
  "CFM Onboarding agent|cfm-obagent|${CFM_OB_AGENT_DIGEST}"; do
  IFS='|' read -r _name _repo _digest <<<"$_spec"
  if import_from_ghcr "$_name" "$_repo" "$_digest" "$CFM_AGENT_VERSION"; then
    AGENTS_IMPORTED=$((AGENTS_IMPORTED + 1))
  else
    AGENTS_BLOCKED=$((AGENTS_BLOCKED + 1))
  fi
done
if [ "$AGENTS_BLOCKED" -gt 0 ]; then
  err "${AGENTS_BLOCKED} of 4 CFM agent image(s) were not imported (see above)."
  err "Every other image in this script still pushed; #318 stays blocked on an"
  err "amd64 build, not on this script."
fi

# ── Summary ──────────────────────────────────────────────────────────────────
log "All images pushed"
echo ""
echo "  Custom:"
echo "    ${UI_IMAGE}"
echo "    ${NEO4J_PROXY_IMAGE}"
echo ""
echo "  Third-party:"
echo "    ${NEO4J_IMAGE}"
echo "    ${KEYCLOAK_IMAGE}"
echo "    ${VAULT_IMAGE}"
echo "    ${NATS_IMAGE}"
echo "    ${CFM_CP_SHIM_IMAGE}"
echo ""
echo "  CFM agents (imported from GHCR by digest, #318):"
echo "    ${CFM_KC_AGENT_IMAGE}"
echo "    ${CFM_EDCV_AGENT_IMAGE}"
echo "    ${CFM_REG_AGENT_IMAGE}"
echo "    ${CFM_OB_AGENT_IMAGE}"
echo ""
echo "  JAD / CFM images are built from their own repositories, not this one."
echo "  They currently resolve to :latest, which ACA caches and will not re-pull"
echo "  on restart — see issue #116. env.sh routes them through JAD_VERSION and"
echo "  CFM_VERSION, so pinning is a one-line change ONCE the tags exist in ACR."
echo ""
echo "  To pin, push tagged images FIRST, then set the variable. From each"
echo "  upstream checkout, with JAD_VERSION set to that repo's git SHA:"
echo ""
for repo in jad-controlplane jad-dataplane jad-identity-hub jad-issuerservice; do
  echo "    docker buildx build --platform linux/amd64 \\"
  echo "      -t ${ACR_LOGIN_SERVER}/${repo}:\${JAD_VERSION} --push ."
done
for repo in cfm-tmanager cfm-pmanager; do
  echo "    docker buildx build --platform linux/amd64 \\"
  echo "      -t ${ACR_LOGIN_SERVER}/${repo}:\${CFM_VERSION} --push ."
done
echo ""
echo "  Current resolution:"
echo "    JAD_VERSION=${JAD_VERSION}  CFM_VERSION=${CFM_VERSION}"

# A partial run must not read as a complete one: the caller asked for every
# image to be in ACR and four of them are not. The summary above still prints,
# so the failure is informative rather than merely loud.
if [ "${AGENTS_BLOCKED:-0}" -gt 0 ]; then
  err "build-images.sh: ${AGENTS_BLOCKED} CFM agent image(s) could not be imported (#318, #380)"
  exit 1
fi
