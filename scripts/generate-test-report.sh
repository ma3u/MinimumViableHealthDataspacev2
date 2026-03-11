#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# generate-test-report.sh — Create a Markdown test summary from Vitest + Playwright
# Run from the repository root after tests have been executed.
# ---------------------------------------------------------------------------
set -euo pipefail

REPORT_FILE="docs/test-report.md"
UI_DIR="ui"

echo "Generating test report → ${REPORT_FILE}"

cat > "${REPORT_FILE}" << 'HEADER'
# Test Report — Health Dataspace v2

> Auto-generated test summary. Run `scripts/generate-test-report.sh` to regenerate.

HEADER

# ── Vitest unit + API tests ──────────────────────────────────────
echo "## Unit & API Tests (Vitest)" >> "${REPORT_FILE}"
echo "" >> "${REPORT_FILE}"

cd "${UI_DIR}"

# Run tests with JSON output
npx vitest run --reporter=verbose 2>&1 | grep -cE "✓|✗" > /dev/null || true
VITEST_OUT=$(npx vitest run --reporter=verbose 2>&1)
PASSED=$(echo "${VITEST_OUT}" | grep -c "✓" || echo "0")
FAILED=$(echo "${VITEST_OUT}" | grep -c "✗" || echo "0")
FILES=$(echo "${VITEST_OUT}" | grep -cE "^[[:space:]]*(✓|✗|❯)" | head -1 || echo "?")
SUMMARY_LINE=$(echo "${VITEST_OUT}" | grep -E "Tests\s+" | tail -1 || echo "")

cat >> "../${REPORT_FILE}" << EOF
| Metric | Value |
| ------ | ----- |
| Tests passed | ${PASSED} |
| Tests failed | ${FAILED} |
| Summary | ${SUMMARY_LINE} |

EOF

# ── Coverage ──────────────────────────────────────────────────────
echo "### Coverage (v8)" >> "../${REPORT_FILE}"
echo "" >> "../${REPORT_FILE}"
echo '```' >> "../${REPORT_FILE}"
npx vitest run --coverage 2>&1 | grep -E "All files|Statements|Branches|Functions|Lines" >> "../${REPORT_FILE}" || true
npx vitest run --coverage 2>&1 | grep "All files" >> "../${REPORT_FILE}" || true
echo '```' >> "../${REPORT_FILE}"
echo "" >> "../${REPORT_FILE}"

# ── Playwright e2e tests ─────────────────────────────────────────
echo "## E2E Tests (Playwright)" >> "../${REPORT_FILE}"
echo "" >> "../${REPORT_FILE}"

if command -v npx &> /dev/null && [ -f playwright.config.ts ]; then
  PW_OUT=$(npx playwright test --reporter=line 2>&1 || true)
  PW_PASSED=$(echo "${PW_OUT}" | grep -oE "[0-9]+ passed" || echo "0 passed")
  PW_FAILED=$(echo "${PW_OUT}" | grep -oE "[0-9]+ failed" || echo "0 failed")
  PW_FILES=$(ls -1 __tests__/e2e/*.spec.ts 2>/dev/null | wc -l | tr -d ' ')

  cat >> "../${REPORT_FILE}" << EOF
| Metric | Value |
| ------ | ----- |
| Spec files | ${PW_FILES} |
| Tests passed | ${PW_PASSED} |
| Tests failed | ${PW_FAILED} |

EOF
else
  echo "_Playwright not available — skipped._" >> "../${REPORT_FILE}"
  echo "" >> "../${REPORT_FILE}"
fi

# ── Test file inventory ──────────────────────────────────────────
echo "## Test Inventory" >> "../${REPORT_FILE}"
echo "" >> "../${REPORT_FILE}"
echo "### Unit & API Tests" >> "../${REPORT_FILE}"
echo "" >> "../${REPORT_FILE}"
echo "| File | Type |" >> "../${REPORT_FILE}"
echo "| ---- | ---- |" >> "../${REPORT_FILE}"
find __tests__/unit __tests__/api -name "*.test.*" 2>/dev/null | sort | while read -r f; do
  TYPE="unit"
  [[ "$f" == *"/api/"* ]] && TYPE="api"
  echo "| \`${f}\` | ${TYPE} |" >> "../${REPORT_FILE}"
done
echo "" >> "../${REPORT_FILE}"

echo "### E2E Tests" >> "../${REPORT_FILE}"
echo "" >> "../${REPORT_FILE}"
echo "| File |" >> "../${REPORT_FILE}"
echo "| ---- |" >> "../${REPORT_FILE}"
find __tests__/e2e -name "*.spec.*" 2>/dev/null | sort | while read -r f; do
  echo "| \`${f}\` |" >> "../${REPORT_FILE}"
done
echo "" >> "../${REPORT_FILE}"

cd ..

# ── Timestamp ────────────────────────────────────────────────────
echo "---" >> "${REPORT_FILE}"
echo "" >> "${REPORT_FILE}"
echo "_Generated: $(date -u '+%Y-%m-%d %H:%M:%S UTC')_" >> "${REPORT_FILE}"

echo "✅ Report written to ${REPORT_FILE}"
