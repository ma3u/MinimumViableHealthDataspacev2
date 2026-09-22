#!/bin/bash
# Captures the App Store screenshots on a 6.9-inch simulator.
#
# Screens are reached with a launch argument rather than by scripting taps, so
# a re-shoot after a layout change needs no new coordinates. The data comes
# from DemoSeed, which is `#if DEBUG` and entirely fictional: these images get
# published to the App Store, so nothing real may ever appear in them.
#
# The same script shoots the documentation. `SEED=-MBDevData` swaps the two
# demo reports for the seven-report dev dataset (also fictional, also in
# memory only), `SCREENS` names the screens, and `OUT` points outside
# `appstore/`, which skips the App Store size check:
#
#   SEED=-MBDevData OUT=/tmp/shots SCREENS="list detail trends" Scripts/capture-screenshots.sh
set -euo pipefail

cd "$(dirname "$0")/.."

DEVICE="${DEVICE:-com.apple.CoreSimulator.SimDeviceType.iPhone-16-Pro-Max}"
NAME="${NAME:-MB-Shots-69}"
BUNDLE=red.mabu.meinbefund
LOCALE="${LOCALE:-en}"
OUT="${OUT:-appstore/screenshots/$LOCALE}"
SEED="${SEED:--MBDemoSeed}"
read -r -a SCREENS <<<"${SCREENS:-list detail consent settings privacy}"

settle() { python3 -c "import time; time.sleep($1)"; }

command -v xcodegen >/dev/null || { echo "xcodegen not found: brew install xcodegen"; exit 1; }
xcodegen generate >/dev/null

runtime="$(xcrun simctl list runtimes | grep -o 'com.apple.CoreSimulator.SimRuntime.iOS-[0-9-]*' | tail -1)"
sim="$(xcrun simctl list devices -j | python3 -c "
import json, sys
name = '$NAME'
for devices in json.load(sys.stdin)['devices'].values():
    for d in devices:
        if d['name'] == name:
            print(d['udid']); raise SystemExit
")"
if [ -z "$sim" ]; then
  sim="$(xcrun simctl create "$NAME" "$DEVICE" "$runtime")"
  echo "==> Created simulator $NAME ($sim)"
fi

xcrun simctl boot "$sim" >/dev/null 2>&1 || true
xcrun simctl bootstatus "$sim" -b >/dev/null

echo "==> Building"
xcodebuild -project MeinBefund.xcodeproj -scheme MeinBefund -sdk iphonesimulator \
  -destination "id=$sim" -configuration Debug build >/dev/null

app="$(xcodebuild -project MeinBefund.xcodeproj -scheme MeinBefund -sdk iphonesimulator \
  -destination "id=$sim" -configuration Debug -showBuildSettings 2>/dev/null |
  awk '/ BUILT_PRODUCTS_DIR = /{d=$3} / FULL_PRODUCT_NAME = /{n=$3} END{print d"/"n}')"
xcrun simctl install "$sim" "$app"

mkdir -p "$OUT"
for screen in "${SCREENS[@]}"; do
  xcrun simctl terminate "$sim" "$BUNDLE" >/dev/null 2>&1 || true
  settle 1
  # -AppleLanguages picks the app's language per launch, so both listings are
  # shot from one simulator instead of one per locale.
  xcrun simctl launch "$sim" "$BUNDLE" "$SEED" -MBShot "$screen" \
    -AppleLanguages "($LOCALE)" -AppleLocale "$LOCALE" >/dev/null
  settle 4
  xcrun simctl io "$sim" screenshot --type=png "$OUT/$screen.png" >/dev/null 2>&1
  width="$(sips -g pixelWidth "$OUT/$screen.png" | awk '/pixelWidth/{print $2}')"
  height="$(sips -g pixelHeight "$OUT/$screen.png" | awk '/pixelHeight/{print $2}')"
  size="${width}x${height}"
  echo "    $screen.png  $size"
  case "$OUT" in
    appstore/*)
      case "$size" in
        1320x2868|1290x2796) ;;
        *) echo "    unusable: APP_IPHONE_67 accepts 1320x2868 or 1290x2796 only"; exit 1 ;;
      esac ;;
  esac
done
echo "==> $OUT is ready"
case "$OUT" in
  appstore/*) echo "    upload with: python3 appstore/push.py --screenshots-only" ;;
esac
