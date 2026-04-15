#!/bin/sh
# POSIX sh — runs under Alpine (Docker), Ubuntu CI, and macOS.
set -eu
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
UI_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
SRC="${UI_ROOT}/node_modules/swagger-ui-dist"
DEST="${UI_ROOT}/public/swagger-ui"

if [ ! -d "$SRC" ]; then
  echo "swagger-ui-dist not installed; skipping asset copy" >&2
  exit 0
fi

mkdir -p "$DEST"
for f in swagger-ui.css swagger-ui-bundle.js swagger-ui-standalone-preset.js; do
  cp -f "${SRC}/${f}" "${DEST}/${f}"
done
echo "Copied Swagger UI assets to ${DEST}"
