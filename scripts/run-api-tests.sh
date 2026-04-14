#!/usr/bin/env bash
# run-api-tests.sh — Execute the Bruno API collection for MVHDv2.
#
# Wraps `bru run` so devs and CI can invoke the same entry point. Generates an
# HTML report under bruno-report/ and exits non-zero on any failed request.
#
# Usage:
#   ./scripts/run-api-tests.sh                     # default: Local env
#   ./scripts/run-api-tests.sh Static-mock         # GitHub Pages mock JSON
#   ./scripts/run-api-tests.sh Azure-Dev           # ACA stack
#   ./scripts/run-api-tests.sh Local Catalog       # only Catalog folder
#
# Env vars:
#   BRUNO_COOKIE       — value of next-auth.session-token cookie (Local/Azure)
#   BRUNO_REPORT_DIR   — override report output directory
#   BRUNO_BIN          — override bru binary (default: npx @usebruno/cli)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COLLECTION_DIR="${REPO_ROOT}/bruno/MVHDv2"
REPORT_DIR="${BRUNO_REPORT_DIR:-${REPO_ROOT}/bruno-report}"
ENV_NAME="${1:-Local}"
FOLDER="${2:-}"

if [[ ! -d "${COLLECTION_DIR}" ]]; then
  echo "ERROR: Bruno collection not found at ${COLLECTION_DIR}" >&2
  exit 1
fi

if [[ ! -f "${COLLECTION_DIR}/environments/${ENV_NAME}.bru" ]]; then
  echo "ERROR: Unknown environment '${ENV_NAME}'." >&2
  echo "Available environments:" >&2
  for f in "${COLLECTION_DIR}/environments"/*.bru; do
    echo "  - $(basename "${f%.bru}")" >&2
  done
  exit 1
fi

if [[ -n "${BRUNO_BIN:-}" ]]; then
  # shellcheck disable=SC2206
  BRU_CMD=( ${BRUNO_BIN} )
elif command -v bru >/dev/null 2>&1; then
  BRU_CMD=( bru )
else
  BRU_CMD=( npx --yes @usebruno/cli )
fi

mkdir -p "${REPORT_DIR}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
HTML_REPORT="${REPORT_DIR}/${ENV_NAME}-${TIMESTAMP}.html"
JSON_REPORT="${REPORT_DIR}/${ENV_NAME}-${TIMESTAMP}.json"

echo "── MVHDv2 API tests ──────────────────────────────────"
echo "  Collection : ${COLLECTION_DIR}"
echo "  Environment: ${ENV_NAME}"
[[ -n "${FOLDER}" ]] && echo "  Folder     : ${FOLDER}"
echo "  HTML report: ${HTML_REPORT}"
echo "  JSON report: ${JSON_REPORT}"
echo "──────────────────────────────────────────────────────"

CMD=( "${BRU_CMD[@]}" run )
if [[ -n "${FOLDER}" ]]; then
  CMD+=( "${FOLDER}" )
fi
CMD+=(
  --env "${ENV_NAME}"
  --reporter-html "${HTML_REPORT}"
  --reporter-json "${JSON_REPORT}"
)

if [[ -n "${BRUNO_COOKIE:-}" ]]; then
  CMD+=( --env-var "sessionCookie=${BRUNO_COOKIE}" )
fi

cd "${COLLECTION_DIR}"
"${CMD[@]}"
EXIT_CODE=$?

echo "──────────────────────────────────────────────────────"
if [[ "${EXIT_CODE}" -eq 0 ]]; then
  echo "PASS: Bruno run completed successfully."
else
  echo "FAIL: Bruno run exited with code ${EXIT_CODE}." >&2
fi
echo "Report: ${HTML_REPORT}"
exit "${EXIT_CODE}"
