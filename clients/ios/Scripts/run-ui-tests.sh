#!/usr/bin/env bash
# Drives the app in a simulator, the way a person does.
#
# The unit suite checks what the app computes. This checks what it shows and
# what a tap does, which is where this project's last several defects lived
# and where none of them was reachable from a unit test.
#
#   Scripts/run-ui-tests.sh                       # the whole suite
#   Scripts/run-ui-tests.sh TrendsUITests         # one class
#   Scripts/run-ui-tests.sh TrendsUITests/testTappingAPointShowsItsMeasurement
#
#   SIMULATOR="iPhone 17 Pro"   which simulator to use
set -euo pipefail

cd "$(dirname "$0")/.."

SIMULATOR="${SIMULATOR:-iPhone 17 Pro}"
only="${1:-}"

command -v xcodegen >/dev/null || { echo "xcodegen not found: brew install xcodegen"; exit 1; }
xcodegen generate >/dev/null

args=(
  -project MeinBefund.xcodeproj
  -scheme MeinBefund
  -destination "platform=iOS Simulator,name=$SIMULATOR"
  # Ad-hoc signature: without one every Keychain call fails with -34018 and
  # the store cannot create its key, so every test would fail for a reason
  # that has nothing to do with what it checks.
  CODE_SIGN_IDENTITY=-
  CODE_SIGNING_REQUIRED=YES
)
[ -n "$only" ] && args+=(-only-testing:"MeinBefundUITests/$only")

echo "==> Running UI tests on $SIMULATOR"
set +e
xcodebuild test "${args[@]}" 2>&1 | tee /tmp/mb-ui-tests.log |
  grep -E "Test Case .* (passed|failed)|Executed [0-9]+ test|error:|\*\* TEST" || true
status="${PIPESTATUS[0]}"
set -e

if [ "$status" -ne 0 ]; then
  echo
  echo "Failed. Full log: /tmp/mb-ui-tests.log"
  exit "$status"
fi
