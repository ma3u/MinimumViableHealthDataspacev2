#!/usr/bin/env bash
# =============================================================================
# Build the EDC 1.0 launchers for Azure and push them to ACR (#881, ADR-078).
# =============================================================================
#   scripts/azure/push-edc1-images.sh build   linux/amd64 images, local only
#   scripts/azure/push-edc1-images.sh push    the built images to ACR
#   scripts/azure/push-edc1-images.sh check   which tags ACR already holds
#
# Three images from runtimes/edc (controlplane, identity-hub, issuerservice),
# tagged mvhd-edc-<runtime>:<EDC_VERSION>-<first 12 of the commit>, the tag
# EDC1_TAG names in env.sh. The commit is the one the images are built from,
# so a tag names its source. siglet 0.1.6 is imported by digest, as compose
# pins it (docker-compose.edc1.yml).
#
# `push` changes no running app: a Container App moves only when its revision
# names the new tag (migrate-edc-to-v1.sh). It still writes to ACR, so it runs
# on Matthias's go, like every Azure step of the runbook
# (docs/knowledge/runbooks/edc-1-on-azure.md).
#
# Needs: docker with buildx, git; for push and check, az (logged in) and
# AcrPush on the registry. Pin the engine: DOCKER_CONTEXT=orbstack.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
# shellcheck source=env.sh
source "${SCRIPT_DIR}/env.sh"

EDC_VERSION="${EDC_VERSION:-1.0.0-RC5}"
REV="$(git -C "$REPO_ROOT" rev-parse HEAD)"
TAG="${EDC_VERSION}-${REV:0:12}"
RUNTIMES=(controlplane identity-hub issuerservice)
SIGLET_SRC="ghcr.io/eclipse-dataplane-core/dsdk-facet-rs/siglet:0.1.6@sha256:cb7895dd4d1b924061df0f4aae28dc3e7187e7508bca249e42d438fea8a6022e"
SIGLET_DST="siglet:0.1.6"

image() { echo "${ACR_LOGIN_SERVER}/mvhd-edc-$1:${TAG}"; }

cmd_build() {
  if [ -n "$(git -C "$REPO_ROOT" status --porcelain -- runtimes/edc)" ]; then
    err "runtimes/edc has uncommitted changes; the tag ${TAG} would not name the source"
    exit 1
  fi
  local r
  for r in "${RUNTIMES[@]}"; do
    log "building $(image "$r") for linux/amd64"
    docker buildx build --platform linux/amd64 --load \
      --build-arg RUNTIME="$r" --build-arg EDC_VERSION="$EDC_VERSION" \
      --build-arg SOURCE_REVISION="$REV" \
      -t "$(image "$r")" "${REPO_ROOT}/runtimes/edc"
  done
  ok "built ${#RUNTIMES[@]} images, tag ${TAG}; push them with '$0 push'"
}

cmd_push() {
  local r
  az acr login --name "$ACR_NAME" >/dev/null
  for r in "${RUNTIMES[@]}"; do
    docker image inspect "$(image "$r")" >/dev/null 2>&1 ||
      { err "$(image "$r") is not built; run '$0 build' first"; exit 1; }
    docker push "$(image "$r")"
  done
  log "importing siglet 0.1.6 by digest"
  az acr import --name "$ACR_NAME" --source "$SIGLET_SRC" --image "$SIGLET_DST" --force -o none
  ok "ACR holds the 1.0 images, tag ${TAG}; set EDC1_TAG=${TAG} for migrate-edc-to-v1.sh"
}

cmd_check() {
  local r
  for r in "${RUNTIMES[@]}"; do
    printf '%-26s ' "mvhd-edc-$r"
    az acr repository show-tags --name "$ACR_NAME" --repository "mvhd-edc-$r" -o tsv 2>/dev/null |
      tr '\n' ' ' || printf '(none)'
    echo
  done
  printf '%-26s ' "siglet"
  az acr repository show-tags --name "$ACR_NAME" --repository siglet -o tsv 2>/dev/null | tr '\n' ' ' || printf '(none)'
  echo
}

case "${1:-}" in
  build) cmd_build ;;
  push) cmd_push ;;
  check) cmd_check ;;
  *) sed -n '5,7p' "$0"; exit 2 ;;
esac
