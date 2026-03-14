#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# generate-test-report.sh — Create a Markdown test summary from:
#   • Integration test JSON results (DSP TCK, DCP, EHDS)
#   • Vitest unit/API tests
#   • Playwright E2E tests
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

# ── Helper: latest JSON file in a directory ───────────────────────
latest_json() {
  local dir="$1"
  ls -1t "${dir}"/*.json 2>/dev/null | head -1
}

# ── Helper: render a test suite section from JSON ─────────────────
# Uses only built-in tools (no jq dependency).
render_suite() {
  local json_file="$1"
  local heading="$2"

  if [[ ! -f "${json_file}" ]]; then
    echo "## ${heading}" >> "${REPORT_FILE}"
    echo "" >> "${REPORT_FILE}"
    echo "_No results found._" >> "${REPORT_FILE}"
    echo "" >> "${REPORT_FILE}"
    return
  fi

  # Parse summary fields with grep/sed (portable, no jq needed)
  local total passed failed skipped passRate timestamp suite
  suite=$(grep -o '"suite"[[:space:]]*:[[:space:]]*"[^"]*"' "${json_file}" | head -1 | sed 's/.*:.*"\(.*\)"/\1/')
  total=$(grep -o '"total"[[:space:]]*:[[:space:]]*[0-9]*' "${json_file}" | head -1 | grep -o '[0-9]*$')
  passed=$(grep -o '"passed"[[:space:]]*:[[:space:]]*[0-9]*' "${json_file}" | head -1 | grep -o '[0-9]*$')
  failed=$(grep -o '"failed"[[:space:]]*:[[:space:]]*[0-9]*' "${json_file}" | head -1 | grep -o '[0-9]*$')
  skipped=$(grep -o '"skipped"[[:space:]]*:[[:space:]]*[0-9]*' "${json_file}" | head -1 | grep -o '[0-9]*$')
  passRate=$(grep -o '"passRate"[[:space:]]*:[[:space:]]*"[^"]*"' "${json_file}" | head -1 | sed 's/.*:.*"\(.*\)"/\1/')
  timestamp=$(grep -o '"timestamp"[[:space:]]*:[[:space:]]*"[^"]*"' "${json_file}" | head -1 | sed 's/.*:.*"\(.*\)"/\1/')

  cat >> "${REPORT_FILE}" << EOF
## ${heading}

**Suite:** ${suite}
**Run:** ${timestamp}
**Source:** \`$(basename "${json_file}")\`

| Metric | Value |
| ------ | ----- |
| Total | ${total} |
| Passed | ${passed} ✅ |
| Failed | ${failed} ${failed:+$([ "${failed}" = "0" ] && echo "✅" || echo "❌")} |
| Skipped | ${skipped} ⏭️ |
| Pass rate | ${passRate} |

<details>
<summary>Individual test results</summary>

| Test ID | Category | Status | Detail |
| ------- | -------- | ------ | ------ |
EOF

  # Parse individual tests — each JSON line like {"id":"...","category":"...", ...}
  grep -o '{"id":"[^}]*}' "${json_file}" | while IFS= read -r line; do
    local tid tcat tstatus tdetail
    tid=$(echo "${line}" | grep -o '"id":"[^"]*"' | sed 's/"id":"\(.*\)"/\1/')
    tcat=$(echo "${line}" | grep -o '"category":"[^"]*"' | sed 's/"category":"\(.*\)"/\1/')
    tstatus=$(echo "${line}" | grep -o '"status":"[^"]*"' | sed 's/"status":"\(.*\)"/\1/')
    tdetail=$(echo "${line}" | grep -o '"detail":"[^"]*"' | sed 's/"detail":"\(.*\)"/\1/')

    local icon="❓"
    case "${tstatus}" in
      passed)  icon="✅" ;;
      failed)  icon="❌" ;;
      skipped) icon="⏭️" ;;
    esac

    echo "| ${tid} | ${tcat} | ${icon} ${tstatus} | ${tdetail} |" >> "${REPORT_FILE}"
  done

  echo "" >> "${REPORT_FILE}"
  echo "</details>" >> "${REPORT_FILE}"
  echo "" >> "${REPORT_FILE}"
}

# ── Integration Test Results ─────────────────────────────────────
echo "## Integration Test Summary" >> "${REPORT_FILE}"
echo "" >> "${REPORT_FILE}"

DSP_JSON=$(latest_json "test-results/dsp-tck")
DCP_JSON=$(latest_json "test-results/dcp")
EHDS_JSON=$(latest_json "test-results/ehds")

# Overall summary table
get_field() { grep -o "\"$2\"[[:space:]]*:[[:space:]]*[0-9]*" "$1" 2>/dev/null | head -1 | grep -o '[0-9]*$' || echo "—"; }
get_rate()  { grep -o "\"passRate\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" "$1" 2>/dev/null | head -1 | sed 's/.*:.*"\(.*\)"/\1/' || echo "—"; }

cat >> "${REPORT_FILE}" << EOF
| Suite | Total | Passed | Failed | Skipped | Pass Rate |
| ----- | ----: | -----: | -----: | ------: | --------: |
| DSP 2025-1 TCK | $(get_field "${DSP_JSON}" total) | $(get_field "${DSP_JSON}" passed) | $(get_field "${DSP_JSON}" failed) | $(get_field "${DSP_JSON}" skipped) | $(get_rate "${DSP_JSON}") |
| DCP v1.0 Compliance | $(get_field "${DCP_JSON}" total) | $(get_field "${DCP_JSON}" passed) | $(get_field "${DCP_JSON}" failed) | $(get_field "${DCP_JSON}" skipped) | $(get_rate "${DCP_JSON}") |
| EHDS Health-Domain | $(get_field "${EHDS_JSON}" total) | $(get_field "${EHDS_JSON}" passed) | $(get_field "${EHDS_JSON}" failed) | $(get_field "${EHDS_JSON}" skipped) | $(get_rate "${EHDS_JSON}") |

EOF

# Detailed sections
render_suite "${DSP_JSON}" "DSP 2025-1 Technology Compatibility Kit"
render_suite "${DCP_JSON}" "DCP v1.0 Compliance Tests"
render_suite "${EHDS_JSON}" "EHDS Health-Domain Compliance Tests"

# ── Vitest unit + API tests ──────────────────────────────────────
echo "## Unit & API Tests (Vitest)" >> "${REPORT_FILE}"
echo "" >> "${REPORT_FILE}"

if [[ -d "${UI_DIR}" ]]; then
  pushd "${UI_DIR}" > /dev/null

  VITEST_OUT=$(npx vitest run --reporter=verbose 2>&1 || true)
  PASSED=$(echo "${VITEST_OUT}" | grep -c "✓" || true)
  FAILED=$(echo "${VITEST_OUT}" | grep -c "✗" || true)
  # Strip ANSI escape codes from the summary line
  SUMMARY_LINE=$(echo "${VITEST_OUT}" | grep -E "Tests\s+" | tail -1 | sed 's/\x1b\[[0-9;]*m//g' || echo "")

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

  popd > /dev/null
else
  echo "_UI directory not found — Vitest/Playwright tests skipped._" >> "${REPORT_FILE}"
  echo "" >> "${REPORT_FILE}"
fi

# ── Timestamp ────────────────────────────────────────────────────
echo "---" >> "${REPORT_FILE}"
echo "" >> "${REPORT_FILE}"
echo "_Generated: $(date -u '+%Y-%m-%d %H:%M:%S UTC')_" >> "${REPORT_FILE}"

echo "✅ Report written to ${REPORT_FILE}"
