#!/usr/bin/env bash
# Build the German national EUDI wallet iOS app for a *physical* iPhone and
# install it, signed with your own Apple Developer team.
#
# This cannot be a straight device build of the published project, for two
# reasons that are not going away:
#
#   1. The bundle id belongs to SPRIND. `org.sprind.wallet[.dev|.sandbox]` is
#      registered to team RKHWDWUG28; nobody else can sign it. A device build
#      therefore ships under YOUR bundle id, which changes the App Attest
#      identity — so the backend has to be told the new team and bundle id
#      (IOS_TEAM_ID / IOS_BUNDLE_IDS in docker-compose.eudi.yml).
#   2. A device cannot reach the backend on localhost. WALLET_HOST_URL has to be
#      the Mac's LAN address, and App Transport Security blocks cleartext to it
#      unless NSAllowsLocalNetworking is set.
#
# Both are handled here. The published files are preserved with a `.published`
# suffix, as in configure-ios-dev.sh.
#
# Usage: scripts/eudi/build-ios-device.sh [install|build]
#   EUDI_IOS_DIR    default ~/projects/dataspaces/eudi-wallet-de/ios
#   DEVELOPMENT_TEAM   your Apple Team ID (auto-detected from installed profiles)
#   DEVICE_BUNDLE_ID   default io.healthgraph.eudiwallet.dev
#   BACKEND_URL        default http://<en0 address>:8081
#   DEVICE             device name from `xcrun devicectl list devices`
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
IOS_DIR="${EUDI_IOS_DIR:-${HOME}/projects/dataspaces/eudi-wallet-de/ios}"
DERIVED="${DERIVED_DATA:-/tmp/idgo-dd-device}"
CONFIGURATION="${CONFIGURATION:-DevDebug}"
SCHEME="${SCHEME:-IDGo Dev}"
ACTION="${1:-install}"
BUNDLE_ID="${DEVICE_BUNDLE_ID:-io.healthgraph.eudiwallet.dev}"

log() { printf '==> %s\n' "$*"; }

[[ -d "${IOS_DIR}" ]] || { echo "no iOS clone at ${IOS_DIR}" >&2; exit 1; }

# --- team -------------------------------------------------------------------
TEAM="${DEVELOPMENT_TEAM:-}"
if [[ -z "${TEAM}" ]]; then
  TEAM="$(python3 - <<'PY'
import glob, pathlib, plistlib
teams = []
for pat in ("~/Library/Developer/Xcode/UserData/Provisioning Profiles/*.mobileprovision",
            "~/Library/MobileDevice/Provisioning Profiles/*.mobileprovision"):
    for path in glob.glob(str(pathlib.Path(pat).expanduser())):
        raw = pathlib.Path(path).read_bytes()
        s, e = raw.find(b"<?xml"), raw.find(b"</plist>")
        if s < 0 or e < 0:
            continue
        for t in plistlib.loads(raw[s:e + 8]).get("TeamIdentifier", []) or []:
            teams.append(t)
print(teams[0] if teams else "")
PY
)"
fi
[[ -n "${TEAM}" ]] || {
  echo "no Apple Team ID found. Open the project in Xcode once, or set DEVELOPMENT_TEAM." >&2
  exit 1
}
log "team ${TEAM}, bundle id ${BUNDLE_ID}"

# --- backend address --------------------------------------------------------
# Pick the address the *phone* can reach, which is not always the Mac's primary
# one. 172.20.10.x means the iPhone's Personal Hotspot: that link bypasses a
# corporate network entirely, and on a network with client isolation (a Meraki
# guest SSID, say) it is the only address that works — the phone can be on the
# same Wi-Fi as the Mac and still not reach it.
HOTSPOT_IP="$(ifconfig 2>/dev/null | awk '/inet 172\.20\.10\./{print $2; exit}')"
LAN_IP="${HOTSPOT_IP:-$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)}"
BACKEND="${BACKEND_URL:-http://${LAN_IP}:8081}"
[[ "${BACKEND}" != "http://:8081" ]] || { echo "could not determine a LAN address; set BACKEND_URL" >&2; exit 1; }
log "backend ${BACKEND}${HOTSPOT_IP:+  (iPhone Personal Hotspot)}"
if [[ -z "${HOTSPOT_IP}" ]]; then
  echo "    note: no Personal Hotspot link. If registration times out with"
  echo "          http.status_code 0, the phone cannot route to this address —"
  echo "          turn on Personal Hotspot and re-run. See the runbook."
fi
curl -fsS -o /dev/null --max-time 5 "${BACKEND}/actuator/health/readiness" \
  || echo "    warning: ${BACKEND} is not answering — start the stack first"

# --- shared patches ---------------------------------------------------------
"${REPO_ROOT}/scripts/eudi/patch-ios-spm.py" "${IOS_DIR}"
"${REPO_ROOT}/scripts/eudi/patch-ios-resources.sh" "${IOS_DIR}"

# --- device entitlements ----------------------------------------------------
# The simulator build uses a literal ad-hoc prefix; a device build must use the
# variables so the entitlement matches whatever App ID Xcode provisions.
DEVICE_ENT="${IOS_DIR}/IDGo.device.entitlements"
if [[ ! -f "${DEVICE_ENT}" ]]; then
  log "writing IDGo.device.entitlements"
  cat > "${DEVICE_ENT}" <<'ENTEOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<!-- Device build. application-identifier is injected from the provisioning
     profile; only the keychain group is declared, using the standard variables
     so it matches whichever team signs. -->
<plist version="1.0">
<dict>
	<key>keychain-access-groups</key>
	<array>
		<string>$(AppIdentifierPrefix)$(CFBundleIdentifier)</string>
	</array>
</dict>
</plist>
ENTEOF
fi

# --- App Transport Security -------------------------------------------------
# The backend is plain HTTP on the LAN. NSAllowsLocalNetworking is the narrow
# exception for exactly that: it permits cleartext to private-range addresses
# and .local names, and nothing else. The NIAP restriction the mirror sets is
# left alone.
python3 - "${IOS_DIR}/Wallet/Wallet.plist" <<'PY'
import plistlib, pathlib, shutil, sys
path = pathlib.Path(sys.argv[1])
data = plistlib.loads(path.read_bytes())
ats = data.setdefault("NSAppTransportSecurity", {})
if ats.get("NSAllowsLocalNetworking") is not True:
    backup = path.with_suffix(path.suffix + ".published")
    if not backup.exists():
        shutil.copy2(path, backup)
    ats["NSAllowsLocalNetworking"] = True
    path.write_bytes(plistlib.dumps(data))
    print("==> Wallet.plist: NSAllowsLocalNetworking = true")
else:
    print("==> Wallet.plist: NSAllowsLocalNetworking already set")
PY

# --- build settings ---------------------------------------------------------
"${REPO_ROOT}/scripts/eudi/configure-ios-dev.sh" "${IOS_DIR}"
WALLET_HOST_ESC="$(printf '%s' "${BACKEND}" | sed 's|://|:/$()/|')"
python3 - "${IOS_DIR}/Wallet/Config/WalletDev.xcconfig" "${WALLET_HOST_ESC}" <<'PY'
import pathlib, sys
path, wallet = pathlib.Path(sys.argv[1]), sys.argv[2]
out = []
for line in path.read_text().splitlines():
    if line.split("=", 1)[0].strip() == "WALLET_HOST_URL":
        out.append(f"WALLET_HOST_URL = {wallet}")
    else:
        out.append(line)
path.write_text("\n".join(out) + "\n")
print(f"==> WALLET_HOST_URL = {wallet}")
PY

# --- build ------------------------------------------------------------------
BUILD_LOG="${BUILD_LOG:-${TMPDIR:-/tmp}/eudi-ios-device-build.log}"
log "building ${SCHEME} (${CONFIGURATION}) for a physical device"
log "full log: ${BUILD_LOG}"
cd "${IOS_DIR}"
xcodebuild \
  -project IDGo.xcodeproj \
  -scheme "${SCHEME}" \
  -configuration "${CONFIGURATION}" \
  -destination 'generic/platform=iOS' \
  -derivedDataPath "${DERIVED}" \
  -skipMacroValidation \
  -skipPackagePluginValidation \
  -allowProvisioningUpdates \
  DEVELOPMENT_TEAM="${TEAM}" \
  PRODUCT_BUNDLE_IDENTIFIER="${BUNDLE_ID}" \
  CODE_SIGN_ENTITLEMENTS="IDGo.device.entitlements" \
  CODE_SIGN_STYLE=Automatic \
  build 2>&1 | tee "${BUILD_LOG}" || true

# Automatic signing creates the App ID and profile through the developer portal,
# which needs an Apple ID signed in to Xcode. Detect that specific failure and
# say so, because "No Accounts: Add a new account in Accounts settings" reads
# like a project fault and is not one. Detected after the fact rather than
# preflighted: Xcode moves where it records accounts between releases, and a
# preflight that guesses wrong blocks a build that would have worked.
if grep -q "No Accounts: Add a new account" "${BUILD_LOG}"; then
  cat >&2 <<'MSG'

No Apple ID is signed in to Xcode, so no provisioning profile could be created.

  Xcode -> Settings -> Accounts -> + -> Apple ID, and sign in with the account
  that owns your team. Then re-run this script.
MSG
  exit 1
fi
grep -q '\*\* BUILD SUCCEEDED \*\*' "${BUILD_LOG}" || {
  echo "build failed - see ${BUILD_LOG}" >&2
  grep -E '^.*error: ' "${BUILD_LOG}" | grep -v 'Internal Error' | head -10 >&2
  exit 1
}

APP="$(find "${DERIVED}/Build/Products/${CONFIGURATION}-iphoneos" -maxdepth 1 -name '*.app' -print -quit)"
[[ -n "${APP}" ]] || { echo "no .app produced" >&2; exit 1; }
log "built ${APP}"

[[ "${ACTION}" == "install" ]] || exit 0

DEVICE_ID="$(xcrun devicectl list devices 2>/dev/null \
  | awk -v want="${DEVICE:-}" 'NR>2 && NF>3 { if (want == "" || $1 == want) { print $3; exit } }')"
[[ -n "${DEVICE_ID}" ]] || { echo "no paired device found (xcrun devicectl list devices)" >&2; exit 1; }

log "installing on ${DEVICE_ID}"
xcrun devicectl device install app --device "${DEVICE_ID}" "${APP}"
log "installed ${BUNDLE_ID}"
echo
echo "Point the backend at this build before launching it:"
echo "  IOS_TEAM_ID=${TEAM} \\"
echo "  IOS_BUNDLE_IDS=${BUNDLE_ID} \\"
echo "  WALLET_PUBLIC_URL=${BACKEND} \\"
echo "  docker compose -f docker-compose.yml -f docker-compose.eudi.yml up -d wallet-backend"
