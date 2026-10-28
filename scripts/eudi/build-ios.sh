#!/usr/bin/env bash
# Build the German national EUDI wallet iOS app from its published mirror and
# install it on a simulator.
#
# The app is EUPL-1.2 and is NOT vendored into this repo: clone it separately
# and point EUDI_IOS_DIR at the clone. This script only drives Xcode and the
# two patch scripts next to it.
#
# Usage: scripts/eudi/build-ios.sh [install|build]
#   EUDI_IOS_DIR   default ~/projects/dataspaces/eudi-wallet-de/ios
#   SIMULATOR      default "iPhone 17 Pro"
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
IOS_DIR="${EUDI_IOS_DIR:-${HOME}/projects/dataspaces/eudi-wallet-de/ios}"
SIMULATOR="${SIMULATOR:-iPhone 17 Pro}"
DERIVED="${DERIVED_DATA:-/tmp/idgo-dd}"
ACTION="${1:-install}"

# The scheme's own configuration. There is no "Debug" configuration in this
# project — passing one silently splits the build: the SwiftPM package projects
# use their Debug, the app target falls back to DevRelease, and the app then
# fails copying resource bundles that were written to the other directory.
CONFIGURATION="${CONFIGURATION:-DevDebug}"
SCHEME="${SCHEME:-IDGo Dev}"

log() { printf '==> %s\n' "$*"; }

[[ -d "${IOS_DIR}" ]] || { echo "no iOS clone at ${IOS_DIR}" >&2; exit 1; }

log "patching the published SPM manifests"
"${REPO_ROOT}/scripts/eudi/patch-ios-spm.py" "${IOS_DIR}"

log "restoring the app-target resources the mirror strips"
"${REPO_ROOT}/scripts/eudi/patch-ios-resources.sh" "${IOS_DIR}"

log "configuring the Dev build settings"
"${REPO_ROOT}/scripts/eudi/configure-ios-dev.sh" "${IOS_DIR}"

log "building ${SCHEME} (${CONFIGURATION}) for ${SIMULATOR}"
cd "${IOS_DIR}"
# -skipMacroValidation, -skipPackagePluginValidation: Xcode will not run an
#   unapproved Swift macro or build-tool plugin in a non-interactive build; the
#   2026-09-16 sync adds secp256k1.swift, whose SharedSourcesPlugin needs the second.
# -skipMacroValidation: Xcode will not run an unapproved Swift macro plugin in a
#   non-interactive build, and this project uses one (Copyable).
# CODE_SIGN_IDENTITY="-": ad-hoc signing. The project pins SPRIND's development
#   team, which nobody else can sign with, but the build cannot simply be left
#   unsigned either: without an application-identifier entitlement every
#   Keychain call fails with -34018 and the wallet never gets past its splash
#   screen. Ad-hoc signing with the placeholder IDGo.entitlements is enough on
#   a simulator, where no profile validates the signature.
xcodebuild \
  -project IDGo.xcodeproj \
  -scheme "${SCHEME}" \
  -configuration "${CONFIGURATION}" \
  -destination "platform=iOS Simulator,name=${SIMULATOR}" \
  -derivedDataPath "${DERIVED}" \
  -skipMacroValidation \
  -skipPackagePluginValidation \
  CODE_SIGN_IDENTITY="-" CODE_SIGN_STYLE=Manual \
  DEVELOPMENT_TEAM="" PROVISIONING_PROFILE_SPECIFIER="" \
  build

APP="$(find "${DERIVED}/Build/Products/${CONFIGURATION}-iphonesimulator" \
        -maxdepth 1 -name '*.app' -print -quit)"
[[ -n "${APP}" ]] || { echo "no .app produced" >&2; exit 1; }
log "built ${APP}"

[[ "${ACTION}" == "install" ]] || exit 0

log "booting ${SIMULATOR}"
xcrun simctl boot "${SIMULATOR}" 2>/dev/null || true
xcrun simctl bootstatus "${SIMULATOR}" -b
open -a Simulator

BUNDLE_ID="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "${APP}/Info.plist")"
log "installing ${BUNDLE_ID}"
xcrun simctl install "${SIMULATOR}" "${APP}"
xcrun simctl launch "${SIMULATOR}" "${BUNDLE_ID}"
log "launched ${BUNDLE_ID} on ${SIMULATOR}"
