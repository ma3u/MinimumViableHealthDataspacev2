#!/usr/bin/env bash
# Generate CycloneDX SBOMs for this repository.
#
#   ./scripts/generate-sbom.sh            # source SBOMs only (fast, no pulls)
#   ./scripts/generate-sbom.sh --images   # also SBOM every container image
#   ./scripts/generate-sbom.sh --scan     # source SBOMs + grype vulnerability scan
#
# Output: sbom/*.cdx.json (CycloneDX 1.6 JSON).
#
# Container image SBOMs require pulling each image (several GB) — that is why
# they are opt-in here and run on a schedule in CI rather than on every commit.
#
# Requires: syft. Optional: grype (--scan).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${REPO_ROOT}/sbom"
WITH_IMAGES=0
WITH_SCAN=0

for arg in "$@"; do
  case "$arg" in
    --images) WITH_IMAGES=1 ;;
    --scan) WITH_SCAN=1 ;;
    -h | --help)
      sed -n '2,12p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "unknown flag: $arg" >&2
      exit 2
      ;;
  esac
done

if ! command -v syft >/dev/null 2>&1; then
  echo "ERROR: syft not found. Install with: brew install syft" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"
cd "$REPO_ROOT"

# -- Source trees ------------------------------------------------------------
# One SBOM per npm project. Paths are the two package.json roots that are not
# build output or vendored Python (see: find . -name package.json).
echo "==> Source SBOMs"
for target in "ui:ui" "neo4j-proxy:services/neo4j-proxy"; do
  name="${target%%:*}"
  path="${target#*:}"
  printf '  %-14s ' "$name"
  syft scan "dir:${path}" -o "cyclonedx-json=${OUT_DIR}/${name}.cdx.json" -q
  count=$(python3 -c "import json;print(len(json.load(open('${OUT_DIR}/${name}.cdx.json')).get('components',[])))")
  echo "${count} components -> sbom/${name}.cdx.json"
done

# -- Container images --------------------------------------------------------
# Image list is derived from the compose files so it cannot drift from what we
# actually run. Digest-pinned entries keep their digest.
if [[ "$WITH_IMAGES" -eq 1 ]]; then
  echo "==> Image SBOMs (pulling images — this is slow)"
  # Portable read loop — macOS ships bash 3.2, which has no `mapfile`.
  IMAGES=()
  while IFS= read -r line; do
    [[ -n "$line" ]] && IMAGES+=("$line")
  done < <(
    grep -hoE "image: [^ ]+" docker-compose.yml docker-compose.jad.yml 2>/dev/null |
      sed 's/image: //' | sort -u
  )
  for img in "${IMAGES[@]}"; do
    safe="$(echo "$img" | tr '/:@' '___')"
    printf '  %-60s ' "${img:0:60}"
    if syft scan "registry:${img}" -o "cyclonedx-json=${OUT_DIR}/image-${safe}.cdx.json" -q 2>/dev/null; then
      echo "ok"
    else
      echo "SKIPPED (pull failed — private or unavailable)"
    fi
  done
fi

# -- Vulnerability scan ------------------------------------------------------
if [[ "$WITH_SCAN" -eq 1 ]]; then
  if ! command -v grype >/dev/null 2>&1; then
    echo "ERROR: grype not found. Install with: brew install grype" >&2
    exit 1
  fi
  echo "==> Vulnerability scan"
  for f in "${OUT_DIR}"/*.cdx.json; do
    printf '  %-30s ' "$(basename "$f")"
    grype "sbom:${f}" -o table -q 2>/dev/null | tail -n +1 | head -1 ||
      echo "no findings"
  done
fi

echo
echo "SBOMs written to ${OUT_DIR}/"
