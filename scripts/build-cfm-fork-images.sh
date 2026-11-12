#!/usr/bin/env bash
set -euo pipefail
#
# Builds the CFM images the compose profile `cfm` runs, from the fork's
# integration tag (ADR-085, #973): mvhd/cfm-<name>:<version>, e.g.
# mvhd/cfm-tmanager:0.0.8-mvhd.1. The fork is eclipse-cfm/cfm v0.0.8 with the
# seven fixes listed in .github/upstream.json (fork.patches);
# each image is labelled with the commit it was built from.
#
# Built from a clean export of the tag (git archive), not the working tree, so
# what runs is what the tag says. Local images only; nothing is pushed.
#
#   scripts/build-cfm-fork-images.sh                 # ../cfm, or clones CFM_REPO
#   scripts/build-cfm-fork-images.sh /path/to/cfm
#   CFM_REF=v0.0.8-mvhd.1 scripts/build-cfm-fork-images.sh
#
# For a stack in another Docker context, export DOCKER_CONTEXT (e.g. orbstack).

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CFM_DIR="${1:-${CFM_DIR:-$REPO_ROOT/../cfm}}"
CFM_REPO="${CFM_REPO:-https://github.com/ma3u/cfm.git}"
CFM_REF="${CFM_REF:-v0.0.8-mvhd.1}"
VERSION="${CFM_REF#v}"
IMAGES=(tmanager pmanager jwtletagent edcvagent ihagent regagent obagent sigletagent)

if [[ ! -d "$CFM_DIR/.git" ]]; then
  echo "No CFM checkout at $CFM_DIR; cloning $CFM_REPO"
  git clone --quiet "$CFM_REPO" "$CFM_DIR"
fi
git -C "$CFM_DIR" fetch --quiet --tags 2>/dev/null || true
COMMIT="$(git -C "$CFM_DIR" rev-parse --verify "${CFM_REF}^{commit}")" || {
  echo "$CFM_REF is not in $CFM_DIR" >&2
  exit 1
}

SRC="$(mktemp -d)"
trap 'rm -rf "$SRC"' EXIT
git -C "$CFM_DIR" archive "$CFM_REF" | tar -x -C "$SRC"

for name in "${IMAGES[@]}"; do
  echo "mvhd/cfm-${name}:${VERSION} from ${CFM_REF} (${COMMIT:0:12})"
  docker build --quiet \
    -f "$SRC/docker/Dockerfile.${name}.dockerfile" \
    --label "org.opencontainers.image.source=${CFM_REPO}" \
    --label "org.opencontainers.image.revision=${COMMIT}" \
    --label "org.opencontainers.image.version=${VERSION}" \
    -t "mvhd/cfm-${name}:${VERSION}" \
    "$SRC" >/dev/null
done
echo "Built ${#IMAGES[@]} images, mvhd/cfm-*:${VERSION}"
