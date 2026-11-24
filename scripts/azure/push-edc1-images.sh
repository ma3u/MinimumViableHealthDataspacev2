#!/usr/bin/env bash
# =============================================================================
# Build the EDC 1.0 launchers for Azure and push them to ACR (#881, ADR-078).
# =============================================================================
#   scripts/azure/push-edc1-images.sh build   linux/amd64 images, local only
#   scripts/azure/push-edc1-images.sh push    the built images to ACR
#   scripts/azure/push-edc1-images.sh check   which tags ACR already holds
#   scripts/azure/push-edc1-images.sh tag     print the tag, nothing else
#
#   build, push and check take runtime names after the verb and then handle
#   only those: `build dataplane` is how 23-dataplane.sh builds the push data
#   plane (ADR-095), which the same Dockerfile builds with RUNTIME=dataplane.
#   Without names they handle the three EDC launchers, as before.
#
# Three images from runtimes/edc (controlplane, identity-hub, issuerservice),
# tagged mvhd-edc-<runtime>:<EDC_VERSION>-<12 characters of the last commit
# that changed runtimes/edc>, the tag migrate-edc-to-v1.sh takes as EDC1_TAG,
# so a tag names its source. siglet 0.1.6 is not built here: 17-siglet.sh
# imports it by the digest docker-compose.jad.yml pins.
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

EDC_VERSION="${EDC_VERSION:-1.0.0-RC8}"
# The last commit that changed the launchers, so later commits elsewhere do
# not change the tag of the same images.
REV="$(git -C "$REPO_ROOT" log -1 --format=%H -- runtimes/edc)"
TAG="${EDC_VERSION}-${REV:0:12}"
RUNTIMES=(controlplane identity-hub issuerservice)
VERB="${1:-}"
if [ "$#" -gt 1 ]; then
  shift
  RUNTIMES=("$@")
  for r in "${RUNTIMES[@]}"; do
    case "$r" in
      controlplane | identity-hub | issuerservice | dataplane) ;;
      *) err "unknown runtime '${r}' (controlplane, identity-hub, issuerservice, dataplane)"; exit 2 ;;
    esac
  done
fi

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
  ok "ACR holds ${RUNTIMES[*]}, tag ${TAG}; set EDC1_TAG=${TAG} for migrate-edc-to-v1.sh"
}

cmd_check() {
  local r
  for r in "${RUNTIMES[@]}"; do
    printf '%-26s ' "mvhd-edc-$r"
    az acr repository show-tags --name "$ACR_NAME" --repository "mvhd-edc-$r" -o tsv 2>/dev/null |
      tr '\n' ' ' || printf '(none)'
    echo
  done
}

case "$VERB" in
  build) cmd_build ;;
  push) cmd_push ;;
  check) cmd_check ;;
  tag) echo "$TAG" ;;
  *) sed -n '5,8p' "$0"; exit 2 ;;
esac
