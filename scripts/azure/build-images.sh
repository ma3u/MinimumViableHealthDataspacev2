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
