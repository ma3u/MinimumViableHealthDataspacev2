#!/usr/bin/env bash
# Klarbefund → App Store Connect → TestFlight (internal testers).
#
# This script takes the build as far as a signed .ipa and uploads it. What it
# CANNOT do, and what you must do once by hand first:
#
#   1. A paid Apple Developer Program membership.
#   2. An App Store Connect record for bundle id red.mabu.meinbefund
#      (App Store Connect → Apps → +, platform iOS). The app NAME must be unique
#      across the App Store: check "Klarbefund" is free before relying on it.
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
#
# `--upload-only` sends an .ipa this script already built, for the common case
# where the build is fine and the one missing thing was the issuer id. The
# issuer id lives only on the App Store Connect **website**, under Users and
# Access → Integrations → App Store Connect API; the App Store Connect app on
# iPhone does not show API keys at all.
#
#   ASC_ISSUER_ID=... ./Scripts/archive-and-upload.sh --upload-only
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

UPLOAD_ONLY=false
[ "${1:-}" = "--upload-only" ] && UPLOAD_ONLY=true

: "${TEAM_ID:=38R8Z4P7S8}"
BUILD_DIR="${BUILD_DIR:-.build/release}"
ARCHIVE="$BUILD_DIR/MeinBefund.xcarchive"
IPA_DIR="$BUILD_DIR/ipa"

if [ "$UPLOAD_ONLY" = false ]; then

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

# Export needs a **distribution** profile, and automatic signing only creates
# one by asking App Store Connect, which needs credentials the archive step
# did not. So when a distribution profile for this bundle id is already
# installed, name it and sign manually; that is the case as soon as the app has
# been exported once, and it turns a failing export into a working one.
#
#   error: exportArchive No profiles for 'red.mabu.meinbefund' were found
#
# is what the automatic path says when it cannot reach the account.
BUNDLE_ID="${BUNDLE_ID:-red.mabu.meinbefund}"
profile_name=""
for p in ~/Library/Developer/Xcode/UserData/Provisioning\ Profiles/*.mobileprovision; do
  [ -e "$p" ] || continue
  plist="$(mktemp)"
  security cms -D -i "$p" >"$plist" 2>/dev/null || { rm -f "$plist"; continue; }
  name="$(python3 - "$plist" "$BUNDLE_ID" "$TEAM_ID" <<'PY'
import plistlib, sys
d = plistlib.load(open(sys.argv[1], "rb"))
app_id = d.get("Entitlements", {}).get("application-identifier", "")
# A distribution profile provisions no specific devices.
if app_id == f"{sys.argv[3]}.{sys.argv[2]}" and not d.get("ProvisionedDevices"):
    print(d.get("Name", ""))
PY
)"
  rm -f "$plist"
  [ -n "$name" ] && { profile_name="$name"; break; }
done

echo "==> Exporting .ipa"
{
  cat <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>app-store-connect</string>
  <key>teamID</key><string>${TEAM_ID}</string>
  <key>uploadSymbols</key><true/>
  <key>destination</key><string>export</string>
PLIST
  if [ -n "$profile_name" ]; then
    echo "    using the installed distribution profile: $profile_name" >&2
    cat <<PLIST
  <key>signingStyle</key><string>manual</string>
  <key>signingCertificate</key><string>Apple Distribution</string>
  <key>provisioningProfiles</key>
  <dict>
    <key>${BUNDLE_ID}</key><string>${profile_name}</string>
  </dict>
PLIST
  fi
  echo "</dict>"
  echo "</plist>"
} > "$BUILD_DIR/ExportOptions.plist"

rm -rf "$IPA_DIR"
xcodebuild -exportArchive \
  -archivePath "$ARCHIVE" \
  -exportOptionsPlist "$BUILD_DIR/ExportOptions.plist" \
  -exportPath "$IPA_DIR" \
  -allowProvisioningUpdates

fi  # end of the build half

IPA="$(find "$IPA_DIR" -name '*.ipa' -maxdepth 1 | head -1)"
if [ -z "$IPA" ]; then
  echo "No .ipa in $IPA_DIR. Run without --upload-only to build one." >&2
  exit 1
fi
if [ ! -f "$BUILD_DIR/ExportOptions.plist" ]; then
  echo "No $BUILD_DIR/ExportOptions.plist. Run without --upload-only once." >&2
  exit 1
fi
echo "    $IPA"

# No API key: upload with the Apple ID signed into Xcode instead.
#
# This is the path that needs nothing extra, and it is the one to reach for
# first. `destination: upload` makes xcodebuild send the build itself, using
# Xcode's own account session, so there is no issuer id to find. The issuer id
# is the part people get stuck on: it exists only on the App Store Connect
# website, under Users and Access → Integrations → App Store Connect API, and
# the App Store Connect app on iPhone does not show API keys at all.
#
# Requires an Apple ID in Xcode → Settings → Accounts. Without one the whole
# chain fails, and the first symptom is the export a few lines above saying
# "No profiles for <bundle id> were found", which reads like a signing problem
# and is really a sign-in problem.
if [ -z "${ASC_KEY_ID:-}" ] || [ -z "${ASC_ISSUER_ID:-}" ]; then
  echo "==> Uploading with the Apple ID signed into Xcode"
  sed 's|<string>export</string>|<string>upload</string>|' \
    "$BUILD_DIR/ExportOptions.plist" > "$BUILD_DIR/UploadOptions.plist"
  rm -rf "$BUILD_DIR/upload"
  xcodebuild -exportArchive \
    -archivePath "$ARCHIVE" \
    -exportOptionsPlist "$BUILD_DIR/UploadOptions.plist" \
    -exportPath "$BUILD_DIR/upload" \
    -allowProvisioningUpdates
else

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
fi

cat <<'DONE'

Uploaded. The build takes a few minutes to finish processing. Once it has,
give the testers something to read:

  ASC_APP_ID=6811688174 python3 appstore/push.py --testflight-only

which writes the TestFlight description and What to Test, in both languages.
Then:

  App Store Connect → your app → TestFlight → Internal Testing
  → add your team members → the build appears in their TestFlight app.

Internal testing needs no App Review. External testing does.

One thing to answer in App Store Connect before external testing: the export
compliance question. This app uses only standard platform cryptography
(CryptoKit AES-GCM and Keychain), which is normally the exempt answer, but
confirm it for your own filing rather than taking a script's word for it.
DONE
