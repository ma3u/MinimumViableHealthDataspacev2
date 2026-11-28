#!/usr/bin/env bash
set -euo pipefail
#
# Builds the CFM images the compose profile `cfm` runs, from our forks'
# integration tags (ADR-085, #973, #1285): mvhd/cfm-<name>:<version>, e.g.
# mvhd/cfm-tmanager:0.1.0-mvhd.1. Since eclipse-cfm v0.1.0 CFM is two
# repositories, so the hub has two forks, each a `fork` block in
# .github/upstream.json with its tag, its patches and the images it builds:
# ma3u/cfm builds pmanager, ma3u/cfm-dataspace the Tenant Manager and the
# agents. Each image is labelled with the repository and commit it was built
# from.
#
# Built from a clean export of each tag (git archive), not the working tree,
# so what runs is what the tags say. Local images only; nothing is pushed.
#
#   scripts/build-cfm-fork-images.sh              # clones in ../<name>, or cloned there
#   scripts/build-cfm-fork-images.sh /path/to/dir # clones in /path/to/dir/<name>
#   CFM_REF=v0.1.0-mvhd.1 scripts/build-cfm-fork-images.sh   # another tag, for every fork
#
# For a stack in another Docker context, export DOCKER_CONTEXT (e.g. orbstack).

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FORKS_DIR="${1:-${CFM_FORKS_DIR:-$REPO_ROOT/..}}"

# One line per fork: repository, tag, images.
FORKS="$(python3 - "$REPO_ROOT/.github/upstream.json" <<'PY'
import json, sys
for entry in json.load(open(sys.argv[1]))["repos"]:
    fork = entry.get("fork")
    if fork and fork.get("images"):
        print(fork["repo"], fork["tag"], " ".join(fork["images"]))
PY
)"
[ -n "$FORKS" ] || { echo "no fork with images in .github/upstream.json" >&2; exit 1; }

SRC="$(mktemp -d)"
trap 'rm -rf "$SRC"' EXIT
VERSIONS=()
count=0
while read -r repo tag images; do
  ref="${CFM_REF:-$tag}"
  version="${ref#v}"
  dir="$FORKS_DIR/${repo#*/}"
  url="https://github.com/${repo}.git"
  if [[ ! -d "$dir/.git" ]]; then
    echo "No checkout at $dir; cloning $url"
    git clone --quiet "$url" "$dir"
  fi
  git -C "$dir" fetch --quiet --tags 2>/dev/null || true
  commit="$(git -C "$dir" rev-parse --verify "${ref}^{commit}")" || {
    echo "$ref is not in $dir" >&2
    exit 1
  }
  mkdir -p "$SRC/${repo#*/}"
  git -C "$dir" archive "$ref" | tar -x -C "$SRC/${repo#*/}"
  for name in $images; do
    echo "mvhd/cfm-${name}:${version} from ${repo} ${ref} (${commit:0:12})"
    docker build --quiet \
      -f "$SRC/${repo#*/}/docker/Dockerfile.${name}.dockerfile" \
      --label "org.opencontainers.image.source=${url}" \
      --label "org.opencontainers.image.revision=${commit}" \
      --label "org.opencontainers.image.version=${version}" \
      -t "mvhd/cfm-${name}:${version}" \
      "$SRC/${repo#*/}" >/dev/null
    count=$((count + 1))
  done
  VERSIONS+=("$version")
done <<<"$FORKS"

if [ "$(printf '%s\n' "${VERSIONS[@]}" | sort -u | wc -l)" -ne 1 ]; then
  echo "warning: the forks' tags differ (${VERSIONS[*]}); compose expects one version" >&2
fi
echo "Built ${count} images, mvhd/cfm-*:${VERSIONS[0]}"
