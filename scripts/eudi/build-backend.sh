#!/usr/bin/env bash
# Build the German national EUDI wallet backend (Apache-2.0) from its published
# mirror, using the build files this project supplies.
#
# The mirror ships `src/main/kotlin` and `gradle/libs.versions.toml` and nothing
# else — no settings.gradle.kts, no build.gradle.kts, no resources — so it cannot
# be built as checked out. This script clones it, drops in the two Gradle files
# from services/eudi-wallet-backend/overlay/, and points the build at the rest of
# the overlay (config, schema, OpenAPI doc stubs) without copying it, so the
# vendored checkout stays a verbatim mirror (ADR-005).
#
# Usage: scripts/eudi/build-backend.sh [gradle-task ...]   (default: bootJar)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VENDOR_DIR="${REPO_ROOT}/vendor/eudi-wallet-backend"
TOOLS_DIR="${REPO_ROOT}/vendor/tools"
OVERLAY_DIR="${REPO_ROOT}/services/eudi-wallet-backend/overlay"

UPSTREAM_URL="${EUDI_BACKEND_REPO:-https://github.com/german-national-wallet/de-eudi-wallet-backend.git}"
GRADLE_VERSION="9.7.1"
JDK_MAJOR="25"

log() { printf '==> %s\n' "$*"; }

# --- the mirror -------------------------------------------------------------
if [[ ! -d "${VENDOR_DIR}/.git" ]]; then
  log "cloning ${UPSTREAM_URL}"
  git clone --depth 1 "${UPSTREAM_URL}" "${VENDOR_DIR}"
fi
log "mirror at $(git -C "${VENDOR_DIR}" rev-parse HEAD)"

# --- JDK 25 -----------------------------------------------------------------
# Gradle's foojay toolchain resolver fails behind a TLS-intercepting proxy, so
# the JDK is fetched with curl and handed to Gradle explicitly.
JDK_HOME="${TOOLS_DIR}/jdk-${JDK_MAJOR}/Contents/Home"
[[ -x "${JDK_HOME}/bin/java" ]] || JDK_HOME="${TOOLS_DIR}/jdk-${JDK_MAJOR}"
if [[ ! -x "${JDK_HOME}/bin/java" ]]; then
  log "downloading Temurin ${JDK_MAJOR}"
  case "$(uname -s)/$(uname -m)" in
    Darwin/arm64) os=mac arch=aarch64 ;;
    Darwin/x86_64) os=mac arch=x64 ;;
    Linux/aarch64) os=linux arch=aarch64 ;;
    Linux/x86_64) os=linux arch=x64 ;;
    *) echo "unsupported platform $(uname -s)/$(uname -m)" >&2; exit 1 ;;
  esac
  mkdir -p "${TOOLS_DIR}/jdk-${JDK_MAJOR}"
  curl -fL --retry 5 --retry-all-errors --connect-timeout 20 \
    --speed-time 60 --speed-limit 10000 \
    -o "${TOOLS_DIR}/jdk${JDK_MAJOR}.tar.gz" \
    "https://api.adoptium.net/v3/binary/latest/${JDK_MAJOR}/ga/${os}/${arch}/jdk/hotspot/normal/eclipse"
  tar xzf "${TOOLS_DIR}/jdk${JDK_MAJOR}.tar.gz" -C "${TOOLS_DIR}/jdk-${JDK_MAJOR}" --strip-components=1
  JDK_HOME="${TOOLS_DIR}/jdk-${JDK_MAJOR}/Contents/Home"
  [[ -x "${JDK_HOME}/bin/java" ]] || JDK_HOME="${TOOLS_DIR}/jdk-${JDK_MAJOR}"
fi
log "JDK $("${JDK_HOME}/bin/java" -version 2>&1 | head -1)"

# --- Gradle -----------------------------------------------------------------
# The mirror ships no wrapper either.
GRADLE_BIN="${TOOLS_DIR}/gradle-${GRADLE_VERSION}/bin/gradle"
if [[ ! -x "${GRADLE_BIN}" ]]; then
  log "downloading Gradle ${GRADLE_VERSION}"
  mkdir -p "${TOOLS_DIR}"
  curl -fL --retry 5 --retry-all-errors -o "${TOOLS_DIR}/gradle.zip" \
    "https://services.gradle.org/distributions/gradle-${GRADLE_VERSION}-bin.zip"
  unzip -q "${TOOLS_DIR}/gradle.zip" -d "${TOOLS_DIR}"
fi

# --- overlay ----------------------------------------------------------------
# Gradle insists these two live at the project root; everything else is read
# from the overlay in place.
cp "${OVERLAY_DIR}/settings.gradle.kts" "${OVERLAY_DIR}/build.gradle.kts" "${VENDOR_DIR}/"

log "gradle ${*:-bootJar}"
cd "${VENDOR_DIR}"
JAVA_HOME="${JDK_HOME}" "${GRADLE_BIN}" \
  "-PwalletBackendOverlay=${OVERLAY_DIR}" \
  --no-daemon --console=plain \
  "${@:-bootJar}"

log "jar: $(find "${VENDOR_DIR}/build/libs" -name '*.jar' 2>/dev/null | tr '\n' ' ')"
