#!/usr/bin/env bash
# =============================================================================
# Build the six CFM images from source, for a platform you choose.
# =============================================================================
# Issues #318 and #380. The six `cfm-*` images pinned by digest in
# docker-compose.jad.yml are `linux/arm64` only, built on an Apple Silicon
# machine on 2026-03-09. CI runners and Azure Container Apps are both amd64,
# so on those the containers start, report Started, and never serve. That is
# #380 in CI and the reason #318's agents cannot be deployed.
#
# The same repos at `:latest` ARE amd64, and are not a substitute: they are a
# 2026-04-11 build of a different program. Run them and they say so:
#
#   :latest        panic: error launching Fulcrum CFM Agent: missing
#                  parameters: cfm-agent.tmanager_url is empty
#                  github.com/metaform/cfm-fulcrum/cmd/agent/launcher
#
#   this script    panic: error loading agent configuration: missing
#                  parameters: kcagent.uri is empty, kcagent.bucket is empty
#                  github.com/eclipse-cfm/cfm/pmanager/natsagent
#
# The first needs a Fulcrum job coordinator this stack does not run (ADR-029,
# #181). The second is the NATS agent the stack actually drives, failing on
# its own config because none was mounted, which is what a working binary does
# with no config. That panic is the same one `scripts/azure/05-cfm-configure.sh`
# quotes for the Tenant Manager.
#
# SOURCE. Not `Metaform/cfm-fulcrum`, which docs/azure-deployment-plan.md names
# and which builds the single `fcfmagent` binary of the broken `:latest`. The
# six come from `Metaform/connector-fabric-manager` (Go module
# `github.com/eclipse-cfm/cfm`).
#
# COMMIT. The images carry no OCI revision label, so the commit is not
# recoverable from them (ADR-029 says as much). CFM_COMMIT below is the last
# commit before the pinned images' build timestamp of 2026-03-09T21:08Z, and
# the binaries it produces match those images' behaviour. Treat it as
# well-evidenced, not as certified. `main` will NOT do: HEAD has no kcagent
# Dockerfile at all.
#
# This script labels what it builds, so nobody has to do this archaeology
# again (ADR-029 makes those labels mandatory from Phase B on).
#
# Usage:
#   scripts/build-cfm-images.sh                      # amd64, local only
#   scripts/build-cfm-images.sh --platform linux/arm64
#   scripts/build-cfm-images.sh --push ghcr.io/ma3u/health-dataspace
#   scripts/build-cfm-images.sh --push acrmvhdehds.azurecr.io --tag 2026-03-09
#   scripts/build-cfm-images.sh --only cfm-obagent --push acrmvhdehds.azurecr.io --tag 2026-03-09-p1
#
# PATCHES. Every jad/cfm-patches/*.patch is applied, in name order, on top of
# CFM_COMMIT before building, and the image says which (label
# io.mvhd.cfm.patches). 0001 stops the onboarding agent from retrying a
# credential request that is still REQUESTED as fast as it can run (#577).
# Patched images get a tag of their own (-p1, ...), so the March images stay
# where they are.
#
# Needs docker with buildx. The Dockerfiles cross-compile (they set
# --platform=$BUILDPLATFORM and pass GOOS/GOARCH to `go build`), so building
# amd64 on an arm64 machine is a cross-build, not emulation: about 30 seconds
# per image, no qemu.
# =============================================================================
set -euo pipefail

CFM_REPO="${CFM_REPO:-https://github.com/Metaform/connector-fabric-manager.git}"
CFM_COMMIT="${CFM_COMMIT:-9aa627f38c95bd6bab089aae003b2bd01ab86a33}"
PLATFORM="linux/amd64"
TAG="2026-03-09"
PUSH_TO=""
ONLY=""
PATCH_DIR="${PATCH_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/jad/cfm-patches}"
WORKDIR="${WORKDIR:-$(mktemp -d)}"

# repo-name:dockerfile-stem. The published names differ from the Dockerfile
# stems by the `cfm-` prefix, which is why this is a table and not a loop
# variable.
IMAGES=(
  "cfm-tmanager:tmanager"
  "cfm-pmanager:pmanager"
  "cfm-kcagent:kcagent"
  "cfm-edcvagent:edcvagent"
  "cfm-regagent:regagent"
  "cfm-obagent:obagent"
)

log() { printf '[cfm-build] %s\n' "$*"; }
err() { printf '[cfm-build] ERROR: %s\n' "$*" >&2; }

while [ $# -gt 0 ]; do
  case "$1" in
    --platform) PLATFORM="$2"; shift 2 ;;
    --tag)      TAG="$2"; shift 2 ;;
    --push)     PUSH_TO="$2"; shift 2 ;;
    --commit)   CFM_COMMIT="$2"; shift 2 ;;
    --only)     ONLY="$2"; shift 2 ;;
    -h|--help)  sed -n '2,60p' "$0"; exit 0 ;;
    *)          err "unknown argument: $1"; exit 2 ;;
  esac
done

command -v docker >/dev/null || { err "docker is not on PATH"; exit 1; }
docker buildx version >/dev/null 2>&1 || { err "docker buildx is not available"; exit 1; }

log "source  ${CFM_REPO}"
log "commit  ${CFM_COMMIT}"
log "platform ${PLATFORM}   tag ${TAG}"
[ -n "$PUSH_TO" ] && log "push to ${PUSH_TO}" || log "local only (no push)"

SRC="${WORKDIR}/cfm"
if [ ! -d "$SRC/.git" ]; then
  log "cloning into ${SRC} ..."
  git clone --quiet "$CFM_REPO" "$SRC"
fi
git -C "$SRC" fetch --quiet origin
# A reused WORKDIR may hold the patches of an earlier run; start clean.
git -C "$SRC" checkout --quiet --force "$CFM_COMMIT"
git -C "$SRC" clean --quiet -fd
log "checked out $(git -C "$SRC" log --format='%h %ad' --date=iso-strict -1)"

PATCHES=""
for patch in "$PATCH_DIR"/*.patch; do
  [ -e "$patch" ] || continue
  git -C "$SRC" apply --check "$patch" || { err "$(basename "$patch") does not apply to ${CFM_COMMIT}"; exit 1; }
  git -C "$SRC" apply "$patch"
  PATCHES="${PATCHES:+${PATCHES},}$(basename "$patch" .patch)"
  log "applied $(basename "$patch")"
done

# HEAD dropped the Keycloak agent, so a wrong commit fails here rather than
# silently producing five images and a confusing error later.
for entry in "${IMAGES[@]}"; do
  stem="${entry#*:}"
  if [ ! -f "${SRC}/docker/Dockerfile.${stem}.dockerfile" ]; then
    err "docker/Dockerfile.${stem}.dockerfile is absent at ${CFM_COMMIT}."
    err "That commit is not the one these images were built from."
    exit 1
  fi
done

BUILT=0
FAILED=0
for entry in "${IMAGES[@]}"; do
  repo="${entry%%:*}"
  stem="${entry#*:}"
  [ -z "$ONLY" ] || [ "$ONLY" = "$repo" ] || continue
  if [ -n "$PUSH_TO" ]; then
    ref="${PUSH_TO}/${repo}:${TAG}"
    output="--push"
  else
    ref="cfm-local/${repo}:${TAG}"
    output="--load"
  fi

  log "building ${repo} (${stem}) -> ${ref}"
  if docker buildx build \
      --platform "$PLATFORM" \
      -f "${SRC}/docker/Dockerfile.${stem}.dockerfile" \
      -t "$ref" \
      --label "org.opencontainers.image.source=${CFM_REPO%.git}" \
      --label "org.opencontainers.image.revision=${CFM_COMMIT}" \
      --label "org.opencontainers.image.version=${TAG}" \
      --label "io.mvhd.cfm.patches=${PATCHES:-none}" \
      --label "org.opencontainers.image.description=CFM ${stem}, built from source by scripts/build-cfm-images.sh" \
      $output "$SRC" >/dev/null 2>&1; then
    BUILT=$((BUILT + 1))
    if [ -z "$PUSH_TO" ]; then
      arch=$(docker image inspect "$ref" --format '{{.Os}}/{{.Architecture}}')
      if [ "$arch" != "$PLATFORM" ]; then
        err "  ${repo} built as ${arch}, wanted ${PLATFORM}"
        FAILED=$((FAILED + 1)); BUILT=$((BUILT - 1)); continue
      fi
      log "  ok ${arch}"
    else
      log "  pushed"
    fi
  else
    err "  ${repo} failed to build"
    FAILED=$((FAILED + 1))
  fi
done

log "built=${BUILT} failed=${FAILED}"
[ "$BUILT" -gt 0 ] || [ "$FAILED" -gt 0 ] || { err "--only ${ONLY} matched no image"; exit 2; }
if [ "$FAILED" -gt 0 ]; then
  err "${FAILED} image(s) did not build"
  exit 1
fi

if [ -z "$PUSH_TO" ]; then
  log ""
  log "Images are local only. Smoke test one; with no config mounted it must"
  log "panic on its OWN parameters, not on cfm-agent.tmanager_url:"
  log "  docker run --rm --platform ${PLATFORM} cfm-local/cfm-kcagent:${TAG}"
  log ""
  log "Publish with --push once you have decided where they belong."
fi
