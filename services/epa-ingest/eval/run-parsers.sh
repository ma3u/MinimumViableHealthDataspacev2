#!/usr/bin/env bash
# Stage-1 parser arms — Marker v2 and MinerU — for the extraction evaluation.
#
# Neither tool is vendored or installed by this repo: both carry licence terms
# worth reading before they touch anything commercial (ADR-033), and both are
# large Python/ML installs. This script runs them if they are on PATH and tells
# you exactly how to get them if not.
#
# Everything runs locally. No page of a lab report leaves this machine unless
# you explicitly enable Marker's --use_llm against a cloud deployment, which is
# off by default here.
#
#   ./eval/run-parsers.sh ~/reports/befund.pdf ~/reports/out
set -euo pipefail

PDF="${1:-}"
OUT="${2:-}"

if [ -z "$PDF" ] || [ -z "$OUT" ]; then
  cat <<'USAGE'
Usage: ./eval/run-parsers.sh <report.pdf> <output-dir>

Keep both paths outside this repository — a lab report is personal health data.

Install the parsers first (neither is a dependency of this repo):
  pip install marker-pdf     # Marker 2.x — Apache-2.0 code, RAIL-M weights
  pip install mineru         # MinerU 2.x — custom Apache-2.0-based licence

Optional, Marker only — structured LLM assist against your own Azure deployment:
  export MARKER_USE_LLM=1
  export AZURE_API_KEY=...            AZURE_ENDPOINT=https://<account>.openai.azure.com
  export AZURE_DEPLOYMENT=gpt-5-mini  AZURE_API_VERSION=2024-10-21
Sending a real report to a cloud model is a deliberate act. Confirm the
deployment is DataZoneStandard or regional Standard first (ADR-033).
USAGE
  exit 2
fi

mkdir -p "$OUT"

run_marker() {
  if ! command -v marker_single >/dev/null 2>&1; then
    echo "skip: marker_single not on PATH (pip install marker-pdf)"
    return 1
  fi
  local args=(--output_format markdown --output_dir "$OUT/marker")
  if [ "${MARKER_USE_LLM:-0}" = "1" ]; then
    echo "  marker: --use_llm ENABLED — pages will be sent to ${AZURE_DEPLOYMENT:-<unset>}"
    args+=(--use_llm --llm_service marker.services.azure_openai.AzureOpenAIService)
  fi
  echo "→ marker_single ${PDF}"
  marker_single "$PDF" "${args[@]}"
}

run_mineru() {
  if ! command -v mineru >/dev/null 2>&1; then
    echo "skip: mineru not on PATH (pip install mineru)"
    return 1
  fi
  echo "→ mineru ${PDF}"
  mineru -p "$PDF" -o "$OUT/mineru"
}

run_marker || true
run_mineru || true

echo
echo "Now turn each parser's markdown into a scoreable arm:"
echo "  npx tsx eval/arm-from-parser.ts --in $OUT/marker/**/*.md --arm marker-v2 --out $OUT/marker.json"
echo "  npx tsx eval/arm-from-parser.ts --in $OUT/mineru/**/*.md --arm mineru   --out $OUT/mineru.json"
echo
echo "Then score every arm against your labelled truth:"
echo "  npm run eval:score -- --truth <truth.json> --report <befund.txt> \\"
echo "    --arm $OUT/marker.json --arm $OUT/mineru.json"
