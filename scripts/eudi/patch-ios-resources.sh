#!/usr/bin/env bash
# Materialise the app-target resources the published iOS mirror strips but still
# lists in IDGo.xcodeproj's Copy Bundle Resources phase.
#
# Without them the build gets all the way through compiling and linking and then
# fails five times in the copy phase:
#   .env · NFC_Scan_iOS.mp4 · Wallet/Sample/EUDI_sample_data.json ·
#   Wallet.xctestplan · WalletUITests.xctestplan
# plus Wallet/Config/GoogleService-Info.plist and IDGo.entitlements, which are
# hard build inputs rather than copied resources.
#
# Each placeholder is chosen so the app degrades quietly rather than lying:
# nothing here pretends to be the real asset. Existing files are never touched.
#
# Usage: scripts/eudi/patch-ios-resources.sh [path-to-ios-clone]
set -euo pipefail

IOS_DIR="${1:-${EUDI_IOS_DIR:-${HOME}/projects/dataspaces/eudi-wallet-de/ios}}"
[[ -d "${IOS_DIR}" ]] || { echo "no iOS clone at ${IOS_DIR}" >&2; exit 1; }

created=0

place() {
  local rel="$1"
  local target="${IOS_DIR}/${rel}"
  if [[ -e "${target}" ]]; then
    return 1
  fi
  mkdir -p "$(dirname "${target}")"
  cat > "${target}"
  echo "==> created ${rel}"
  created=$((created + 1))
  return 0
}

# SwiftDotenv reads this at runtime, and AnalyticsProvider calls
# fatalError("Missing .env file") when it is absent — so this one is required to
# run, not only to build.
#
# Values must be non-empty: SwiftDotenv throws DecodingFailure on a bare `KEY=`,
# which surfaces as "Feature flag refresh failed: DecodingFailure" on every
# launch. They are placeholders, so API calls carry a meaningless key and
# telemetry export goes nowhere.
place ".env" <<'ENVEOF' || true
# Placeholder - scripts/eudi/patch-ios-resources.sh
# The mirror does not publish this file. These values are not real credentials.
API_KEY=placeholder-not-a-real-api-key
X_AUTH_API_TOKEN=placeholder-not-a-real-token
ENVEOF

# IssuanceCardView force-unwraps Bundle.main.url(forResource: "NFC_Scan_iOS"),
# so the file must exist or that screen crashes. An empty file satisfies the
# lookup; AVPlayer then shows nothing rather than the scan animation.
place "NFC_Scan_iOS.mp4" </dev/null || true

place "Wallet/Sample/EUDI_sample_data.json" <<'JSONEOF' || true
{}
JSONEOF

for plan in Wallet WalletUITests; do
  place "${plan}.xctestplan" <<'PLANEOF' || true
{
  "configurations": [{ "id": "00000000-0000-0000-0000-000000000000", "name": "Placeholder", "options": {} }],
  "defaultOptions": {},
  "testTargets": [],
  "version": 1
}
PLANEOF
done

# The mirror strips the test bundles these plans would reference; the plans are
# only listed in Copy Bundle Resources, so empty ones are enough to build.

# The mirror omits the Firebase config (it identifies a real Firebase project).
# This one is a declared build input, not just a copied resource, so the build
# stops dead without it. AppDelegate calls FirebaseApp.configure() with whatever
# is here; the values below belong to no project, so push notifications simply
# do not work. Supply a real plist to use FCM.
#
# The values still have to be well-formed: FIRInstallations validates API_KEY
# (39 characters, leading "A") and aborts the process on a malformed one, so the
# app crashes on launch rather than starting without push.
place "Wallet/Config/GoogleService-Info.plist" <<'PLISTEOF' || true
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<!-- Placeholder - scripts/eudi/patch-ios-resources.sh. Not a real Firebase project. -->
<plist version="1.0">
<dict>
	<key>API_KEY</key>
	<string>AIzaSyPLACEHOLDER-NOT-A-REAL-KEY-000000</string>
	<key>GCM_SENDER_ID</key>
	<string>000000000000</string>
	<key>PLIST_VERSION</key>
	<string>1</string>
	<key>BUNDLE_ID</key>
	<string>org.sprind.wallet.dev</string>
	<key>PROJECT_ID</key>
	<string>placeholder</string>
	<key>STORAGE_BUCKET</key>
	<string>placeholder.appspot.com</string>
	<key>IS_ADS_ENABLED</key>
	<false/>
	<key>IS_ANALYTICS_ENABLED</key>
	<false/>
	<key>IS_APPINVITE_ENABLED</key>
	<false/>
	<key>IS_GCM_ENABLED</key>
	<true/>
	<key>IS_SIGNIN_ENABLED</key>
	<false/>
	<key>GOOGLE_APP_ID</key>
	<string>1:000000000000:ios:0000000000000000000000</string>
</dict>
</plist>
PLISTEOF

# Since the 2026-09-16 sync the mirror ships one GoogleService-Info-<Env>.plist
# per configuration, and a "Copy GoogleService-Info.plist" build phase copies
# the matching one into the bundle, so the placeholder above is no longer what
# the app reads. Those files carry PLACEHOLDER_API_KEY, which FIRInstallations
# rejects at launch ("FirebaseOptions.APIKey doesn't match", uncaught exception).
# Give them the same well-formed non-key as above; every other value in them is
# already well-formed. Only a PLACEHOLDER_ value is touched, never a real one.
for plist in "${IOS_DIR}"/Wallet/Config/GoogleService-Info-*.plist; do
  [[ -f "${plist}" ]] || continue
  key="$(/usr/libexec/PlistBuddy -c 'Print :API_KEY' "${plist}" 2>/dev/null || true)"
  if [[ "${key}" == PLACEHOLDER_* ]]; then
    /usr/libexec/PlistBuddy -c 'Set :API_KEY AIzaSyPLACEHOLDER-NOT-A-REAL-KEY-000000' "${plist}"
    echo "==> well-formed placeholder API_KEY in ${plist#"${IOS_DIR}"/}"
    created=$((created + 1))
  fi
done

# IDGo.xcodeproj sets CODE_SIGN_ENTITLEMENTS = IDGo.entitlements; the mirror does
# not publish the file. It only matters if the build is signed — but it has to
# be. Without an application-identifier entitlement every Keychain and Secure
# Enclave call fails with OSStatus -34018, so SecureEnclaveController cannot
# create the wallet key and StartupViewModel.registerWallet() fails: the app
# launches and then sits on the splash screen forever.
#
# The prefix is a local ad-hoc one. A simulator build is signed ad-hoc and no
# profile validates it, so it identifies nothing and claims nothing.
place "IDGo.entitlements" <<'ENTEOF' || true
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<!-- Placeholder - scripts/eudi/patch-ios-resources.sh. Simulator ad-hoc signing only. -->
<plist version="1.0">
<dict>
	<key>application-identifier</key>
	<string>LOCALDEV.org.sprind.wallet.dev</string>
	<key>keychain-access-groups</key>
	<array>
		<string>LOCALDEV.org.sprind.wallet.dev</string>
	</array>
</dict>
</plist>
ENTEOF

echo "==> ${created} placeholder(s) created in ${IOS_DIR}"
