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
import_from_ghcr() {
  local name="$1" repo="$2" digest="$3" tag="$4"
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

import_from_ghcr "CFM Keycloak agent"     cfm-kcagent   "$CFM_KC_AGENT_DIGEST"   "$CFM_AGENT_VERSION"
import_from_ghcr "CFM EDC-V agent"        cfm-edcvagent "$CFM_EDCV_AGENT_DIGEST" "$CFM_AGENT_VERSION"
import_from_ghcr "CFM Registration agent" cfm-regagent  "$CFM_REG_AGENT_DIGEST"  "$CFM_AGENT_VERSION"
import_from_ghcr "CFM Onboarding agent"   cfm-obagent   "$CFM_OB_AGENT_DIGEST"   "$CFM_AGENT_VERSION"

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
