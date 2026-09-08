#!/usr/bin/env bash
# Verify every third-party image in the compose files is covered by the
# scheduled CVE scan in .github/workflows/security-scan.yml.
#
# Why: security-scan.yml has to repeat the image list (a GitHub Actions matrix
# cannot read docker-compose.yml), so the two can drift. A bumped image tag in
# compose that is not bumped in the workflow means the scan silently keeps
# checking the OLD image and reports green.
#
# Images built from this repository (ghcr.io/ma3u/*) are excluded — they are
# covered by the source SBOM scan, not the image matrix.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

WORKFLOW=".github/workflows/security-scan.yml"
[[ -f "$WORKFLOW" ]] || {
  echo "ERROR: $WORKFLOW not found" >&2
  exit 1
}

missing=0
while IFS= read -r img; do
  [[ -z "$img" ]] && continue
  # Skip images built from this repo, and digest-pinned third-party builds
  # (a digest pin cannot drift by definition).
  case "$img" in
    ghcr.io/ma3u/* | *@sha256:*) continue ;;
  esac
  if ! grep -qF -- "$img" "$WORKFLOW"; then
    echo "NOT SCANNED: $img"
    echo "   -> add it to the image-scan matrix in $WORKFLOW"
    missing=$((missing + 1))
  fi
done < <(
  grep -hoE "image: [^ ]+" docker-compose.yml docker-compose.jad.yml 2>/dev/null |
    sed 's/image: //' | sort -u
)

if [[ "$missing" -gt 0 ]]; then
  echo
  echo "$missing compose image(s) are not in the CVE scan matrix."
  exit 1
fi

echo "All third-party compose images are covered by $WORKFLOW"
