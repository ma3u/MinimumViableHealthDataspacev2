#!/usr/bin/env bash
# Phase 3b: Download Synthea and generate a Type 2 Diabetes FHIR cohort.
#
# Usage:
#   ./scripts/generate-synthea.sh          # generate 50 patients (default)
#   ./scripts/generate-synthea.sh 200      # generate 200 patients
#
# Output: neo4j/import/fhir/*.json  (one Bundle per patient)
#
# Requirements: Java ≥ 21

set -euo pipefail

POPULATION=${1:-50}
SYNTHEA_VERSION="3.3.0"
SYNTHEA_JAR="synthea-with-dependencies.jar"
SYNTHEA_URL="https://github.com/synthetichealth/synthea/releases/download/v${SYNTHEA_VERSION}/${SYNTHEA_JAR}"
OUTPUT_DIR="$(cd "$(dirname "$0")/.." && pwd)/neo4j/import/fhir"
SCRIPTS_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== Phase 3b: Synthea FHIR Data Generation ==="
echo "Population : ${POPULATION} patients"
echo "Output dir : ${OUTPUT_DIR}"
echo ""

# ── 1. Check Java ────────────────────────────────────────────────────────────
if ! command -v java &>/dev/null; then
  echo "ERROR: Java not found. Install OpenJDK ≥ 21 and re-run."
  exit 1
fi
JAVA_VER=$(java -version 2>&1 | awk -F '"' '/version/ {print $2}' | cut -d'.' -f1)
if [[ "${JAVA_VER}" -lt 21 ]]; then
  echo "ERROR: Java 21+ required (found ${JAVA_VER})."
  exit 1
fi

# ── 2. Download Synthea JAR (once) ───────────────────────────────────────────
JAR_PATH="${SCRIPTS_DIR}/${SYNTHEA_JAR}"
if [[ ! -f "${JAR_PATH}" ]]; then
  echo "Downloading Synthea ${SYNTHEA_VERSION}…"
  curl -L --progress-bar "${SYNTHEA_URL}" -o "${JAR_PATH}"
else
  echo "Synthea JAR already present — skipping download."
fi

# ── 3. Create output directory ───────────────────────────────────────────────
mkdir -p "${OUTPUT_DIR}"

# ── 4. Run Synthea ───────────────────────────────────────────────────────────
echo ""
echo "Generating ${POPULATION} patients (all modules — chronic conditions emerge naturally)…"
java -jar "${JAR_PATH}" \
  -p "${POPULATION}" \
  --exporter.fhir.export=true \
  --exporter.fhir.version=R4 \
  --exporter.hospital.fhir.export=false \
  --exporter.practitioner.fhir.export=false \
  --exporter.baseDirectory="${OUTPUT_DIR}/.." \
  --exporter.subdir="fhir" \
  Massachusetts
# Synthea writes to {baseDirectory}/fhir/ which equals OUTPUT_DIR — no mv needed

BUNDLE_COUNT=$(ls -1 "${OUTPUT_DIR}"/*.json 2>/dev/null | wc -l | tr -d ' ')
echo ""
echo "✓ Done — ${BUNDLE_COUNT} FHIR bundle(s) in ${OUTPUT_DIR}"
echo ""
echo "Next: load into Neo4j:"
echo "  python3 scripts/load_fhir_neo4j.py"
