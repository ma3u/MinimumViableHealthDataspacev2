#!/usr/bin/env bash
# Archive the wallet app for TestFlight, rebranded so it cannot be mistaken for
# the official German national wallet.
#
# WHY THE REBRAND IS NOT OPTIONAL
# The published app builds as "EUDI Wallet DE" — the name of the German
# government's national identity wallet. EUPL-1.2 grants rights to the *code*;
# it grants nothing over the name or the identity. Uploading a build under that
# name from a private developer account puts a government ID wallet on
# TestFlight that did not come from the government, and Apple rejects it
# (Guidelines 4.1 Copycats, 5.2 Intellectual Property).
#
# So this script overrides the display name and bundle id. Both are build
# settings, so the vendored mirror is never modified.
#
# The app icon needs no change: the mirror ships a neutral placeholder (a plain
# circle with a DEV ribbon), not the federal branding.
#
# WHAT THIS SCRIPT DOES NOT DO
# It does not upload. It produces an .xcarchive and an .ipa; submitting them is
# a deliberate act that stays with you.
#
# Usage: scripts/eudi/archive-ios-testflight.sh
#   DISPLAY_NAME     default "EHDS Wallet Demo"
#   DEVICE_BUNDLE_ID default io.healthgraph.eudiwallet.dev
#   BACKEND_URL      REQUIRED — must be reachable by testers, see below
#   DEVELOPMENT_TEAM your Apple Team ID (auto-detected)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
IOS_DIR="${EUDI_IOS_DIR:-${HOME}/projects/dataspaces/eudi-wallet-de/ios}"
OUT_DIR="${ARCHIVE_DIR:-${TMPDIR:-/tmp}/eudi-testflight}"
CONFIGURATION="${CONFIGURATION:-DevRelease}"
SCHEME="${SCHEME:-IDGo Dev}"
BUNDLE_ID="${DEVICE_BUNDLE_ID:-io.healthgraph.eudiwallet.dev}"
DISPLAY_NAME="${DISPLAY_NAME:-EHDS Wallet Demo}"

log() { printf '==> %s\n' "$*"; }

[[ -d "${IOS_DIR}" ]] || { echo "no iOS clone at ${IOS_DIR}" >&2; exit 1; }

# A TestFlight build is installed by people who are not on your LAN, so a
# private address compiled into it is dead on arrival. Refuse rather than ship a
# build that cannot work.
BACKEND="${BACKEND_URL:-}"
if [[ -z "${BACKEND}" ]]; then
  cat >&2 <<'MSG'
BACKEND_URL is required.

A TestFlight build is installed by testers who are not on your network, so the
wallet backend must be reachable from the public internet. A 10.x / 172.16-31.x /
192.168.x address compiles into a build that cannot ever register.

Before using this: read the security note in
docs/knowledge/runbooks/eudi-wallet-backend-local.md. The demo backend signs with
a software HSM and ships PINs of 1234 — it is not something to expose publicly
as configured.
MSG
  exit 1
fi
case "${BACKEND}" in
  http://10.*|http://192.168.*|http://172.1[6-9].*|http://172.2[0-9].*|http://172.3[01].*|http://localhost*|http://127.*)
    echo "BACKEND_URL ${BACKEND} is a private address; testers cannot reach it." >&2
    exit 1 ;;
esac

TEAM="${DEVELOPMENT_TEAM:-}"
if [[ -z "${TEAM}" ]]; then
  TEAM="$(python3 - <<'PY'
import glob, pathlib, plistlib
for pat in ("~/Library/Developer/Xcode/UserData/Provisioning Profiles/*.mobileprovision",
            "~/Library/MobileDevice/Provisioning Profiles/*.mobileprovision"):
    for path in glob.glob(str(pathlib.Path(pat).expanduser())):
        raw = pathlib.Path(path).read_bytes()
        s, e = raw.find(b"<?xml"), raw.find(b"</plist>")
        if s < 0 or e < 0:
            continue
        for t in plistlib.loads(raw[s:e + 8]).get("TeamIdentifier", []) or []:
            print(t); raise SystemExit
PY
)"
fi
[[ -n "${TEAM}" ]] || { echo "no Apple Team ID found; set DEVELOPMENT_TEAM" >&2; exit 1; }

log "team ${TEAM}"
log "bundle id ${BUNDLE_ID}"
log "display name ${DISPLAY_NAME}   (was: EUDI Wallet DE)"
log "backend ${BACKEND}"

"${REPO_ROOT}/scripts/eudi/patch-ios-spm.py" "${IOS_DIR}"
"${REPO_ROOT}/scripts/eudi/patch-ios-resources.sh" "${IOS_DIR}"
"${REPO_ROOT}/scripts/eudi/configure-ios-dev.sh" "${IOS_DIR}"

WALLET_HOST_ESC="$(printf '%s' "${BACKEND}" | sed 's|://|:/$()/|')"
python3 - "${IOS_DIR}/Wallet/Config/WalletDev.xcconfig" "${WALLET_HOST_ESC}" <<'PY'
import pathlib, sys
path, wallet = pathlib.Path(sys.argv[1]), sys.argv[2]
out = [f"WALLET_HOST_URL = {wallet}" if ln.split("=", 1)[0].strip() == "WALLET_HOST_URL" else ln
       for ln in path.read_text().splitlines()]
path.write_text("\n".join(out) + "\n")
print(f"==> WALLET_HOST_URL = {wallet}")
PY

mkdir -p "${OUT_DIR}"
ARCHIVE="${OUT_DIR}/EHDSWalletDemo.xcarchive"

log "archiving (${CONFIGURATION})"
cd "${IOS_DIR}"
xcodebuild archive \
  -project IDGo.xcodeproj \
  -scheme "${SCHEME}" \
  -configuration "${CONFIGURATION}" \
  -destination 'generic/platform=iOS' \
  -archivePath "${ARCHIVE}" \
  -skipMacroValidation \
  -allowProvisioningUpdates \
  DEVELOPMENT_TEAM="${TEAM}" \
  PRODUCT_BUNDLE_IDENTIFIER="${BUNDLE_ID}" \
  INFOPLIST_KEY_CFBundleDisplayName="${DISPLAY_NAME}" \
  CODE_SIGN_ENTITLEMENTS="IDGo.device.entitlements" \
  CODE_SIGN_STYLE=Automatic

EXPORT_PLIST="${OUT_DIR}/ExportOptions.plist"
cat > "${EXPORT_PLIST}" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>method</key>
	<string>app-store-connect</string>
	<key>teamID</key>
	<string>${TEAM}</string>
	<key>uploadSymbols</key>
	<true/>
	<key>manageAppVersionAndBuildNumber</key>
	<true/>
	<key>destination</key>
	<string>export</string>
</dict>
</plist>
PLIST

log "exporting .ipa"
xcodebuild -exportArchive \
  -archivePath "${ARCHIVE}" \
  -exportOptionsPlist "${EXPORT_PLIST}" \
  -exportPath "${OUT_DIR}/export" \
  -allowProvisioningUpdates

log "archive:  ${ARCHIVE}"
log "ipa:      $(find "${OUT_DIR}/export" -name '*.ipa' -print -quit)"
cat <<'MSG'

Not uploaded. To put this on internal TestFlight:

  1. Distribution certificate (you have none installed):
     Xcode -> Settings -> Accounts -> Manage Certificates -> + -> Apple Distribution
  2. App Store Connect -> Apps -> + -> New App
     Platform iOS, your bundle id, SKU of your choosing
  3. Upload:  xcrun altool --upload-app -f <the .ipa> -t ios \
                --apiKey <key-id> --apiIssuer <issuer-id>
     (or drag the .xcarchive into Xcode's Organizer and use Distribute App)
  4. TestFlight tab -> Internal Testing -> add your team members

Internal testing needs no Beta App Review. External testing does, and an app
that reads national ID cards will be looked at closely — say plainly in the
review notes that it is a demo talking to a test backend and issues nothing
usable.
MSG
