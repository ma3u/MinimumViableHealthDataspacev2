#!/usr/bin/env bash
# MeinBefund → App Store Connect → TestFlight (internal testers).
#
# This script takes the build as far as a signed .ipa and uploads it. What it
# CANNOT do, and what you must do once by hand first:
#
#   1. A paid Apple Developer Program membership.
#   2. An App Store Connect record for bundle id red.mabu.meinbefund
#      (App Store Connect → Apps → +, platform iOS). The app NAME must be unique
#      across the App Store: check "MeinBefund" is free before relying on it.
#   3. An App Store Connect API key (Users and Access → Integrations → App Store
#      Connect API). Download the .p8 once; it is not downloadable again.
#   4. A distribution certificate and provisioning profile for that bundle id,
#      which Xcode will create for you on first archive if you are signed in.
#
# Internal testers (up to 100, on your team) need NO App Review. External
# testing does. So this path gets a build in front of your own devices today.
#
#   export TEAM_ID=ABCDE12345
#   export ASC_KEY_ID=XXXXXXXXXX ASC_ISSUER_ID=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee
#   export ASC_KEY_PATH=~/private_keys/AuthKey_XXXXXXXXXX.p8
#   ./Scripts/archive-and-upload.sh
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

: "${TEAM_ID:?Set TEAM_ID to your Apple Developer team id}"
BUILD_DIR="${BUILD_DIR:-.build/release}"
ARCHIVE="$BUILD_DIR/MeinBefund.xcarchive"
IPA_DIR="$BUILD_DIR/ipa"

echo "==> Regenerating the Xcode project"
command -v xcodegen >/dev/null || { echo "xcodegen not found: brew install xcodegen"; exit 1; }
xcodegen generate

# The generated analyte table must match its TypeScript source before a build
# goes to a tester: a stale copy is the divergence clients/ios exists to stop.
echo "==> Checking the generated analyte table is current"
(cd ../../services/epa-ingest && npm run --silent generate:swift -- --check)

# Every user-visible string needs both languages, and none of them may be
# German sitting in the English base. Cheap here, expensive after upload.
echo "==> Checking English and German are both complete"
./Scripts/check-localization.sh

# App Store Connect rejects a marketing icon that carries an alpha channel
# (ITMS-90717), and it rejects it after the upload, having consumed the build
# number. Checking the file costs nothing.
echo "==> Checking the marketing icon has no alpha channel"
icon=Sources/MeinBefund/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png
alpha="$(sips -g hasAlpha "$icon" | awk '/hasAlpha/ {print $2}')"
[ "$alpha" = "no" ] || { echo "$icon has an alpha channel; flatten it first"; exit 1; }

echo "==> Verifying analyte parity"
swift run AnalyteParity >/dev/null && echo "    parity ok"

echo "==> Archiving"
rm -rf "$ARCHIVE"
xcodebuild archive \
  -project MeinBefund.xcodeproj \
  -scheme MeinBefund \
  -sdk iphoneos \
  -configuration Release \
  -archivePath "$ARCHIVE" \
  DEVELOPMENT_TEAM="$TEAM_ID" \
  CODE_SIGN_STYLE=Automatic \
  -allowProvisioningUpdates

echo "==> Exporting .ipa"
cat > "$BUILD_DIR/ExportOptions.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>app-store-connect</string>
  <key>teamID</key><string>${TEAM_ID}</string>
  <key>uploadSymbols</key><true/>
  <key>destination</key><string>export</string>
</dict>
</plist>
PLIST

rm -rf "$IPA_DIR"
xcodebuild -exportArchive \
  -archivePath "$ARCHIVE" \
  -exportOptionsPlist "$BUILD_DIR/ExportOptions.plist" \
  -exportPath "$IPA_DIR" \
  -allowProvisioningUpdates

IPA="$(find "$IPA_DIR" -name '*.ipa' -maxdepth 1 | head -1)"
[ -n "$IPA" ] || { echo "No .ipa produced"; exit 1; }
echo "    $IPA"

if [ -z "${ASC_KEY_ID:-}" ] || [ -z "${ASC_ISSUER_ID:-}" ]; then
  cat <<MSG

Archive exported but NOT uploaded: no App Store Connect API key in the
environment. Either set ASC_KEY_ID / ASC_ISSUER_ID / ASC_KEY_PATH and re-run,
or upload "$IPA" with the Transporter app from the Mac App Store.

MSG
  exit 0
fi

echo "==> Uploading to App Store Connect"
# The private key must sit where altool looks for it.
if [ -n "${ASC_KEY_PATH:-}" ]; then
  mkdir -p ~/.appstoreconnect/private_keys
  cp "$ASC_KEY_PATH" ~/.appstoreconnect/private_keys/
fi

xcrun altool --upload-app \
  --type ios \
  --file "$IPA" \
  --apiKey "$ASC_KEY_ID" \
  --apiIssuer "$ASC_ISSUER_ID"

cat <<'DONE'

Uploaded. The build takes a few minutes to finish processing, then:

  App Store Connect → your app → TestFlight → Internal Testing
  → add your team members → the build appears in their TestFlight app.

Internal testing needs no App Review. External testing does.

One thing to answer in App Store Connect before external testing: the export
compliance question. This app uses only standard platform cryptography
(CryptoKit AES-GCM and Keychain), which is normally the exempt answer, but
confirm it for your own filing rather than taking a script's word for it.
DONE
