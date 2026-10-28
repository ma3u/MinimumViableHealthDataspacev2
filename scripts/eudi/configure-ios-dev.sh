#!/usr/bin/env bash
# Fill in the iOS wallet's Dev build configuration for a local EHDS demo.
#
# The published Wallet/Config/WalletDev.xcconfig is a placeholder: it says so at
# the top. The keys are published, the values are not, because they are the
# German deployment's endpoints. A source build therefore cannot talk to that
# deployment and must be pointed somewhere — here, at the wallet backend this
# repo runs from the Apache-2.0 mirror.
#
# The iOS app is EUPL-1.2 and is NOT vendored into this repo; it is cloned
# elsewhere and this script writes into that clone.
#
# Usage: scripts/eudi/configure-ios-dev.sh [path-to-ios-clone]
#   EUDI_IOS_DIR      default ~/projects/dataspaces/eudi-wallet-de/ios
#   WALLET_HOST_URL   default http://localhost:8081  (docker-compose.eudi.yml)
#   VCI_ISSUER_URL    default https://issuer.eudiw.dev (EU reference PID issuer)
set -euo pipefail

IOS_DIR="${1:-${EUDI_IOS_DIR:-${HOME}/projects/dataspaces/eudi-wallet-de/ios}}"
CONFIG="${IOS_DIR}/Wallet/Config/WalletDev.xcconfig"

WALLET_HOST_URL="${WALLET_HOST_URL:-http://localhost:8081}"
VCI_ISSUER_URL="${VCI_ISSUER_URL:-https://issuer.eudiw.dev}"

[[ -f "${CONFIG}" ]] || { echo "no xcconfig at ${CONFIG}" >&2; exit 1; }

if ! grep -q '^VCI_ISSUER_URL = PLACEHOLDER' "${CONFIG}"; then
  echo "==> ${CONFIG} is already configured, leaving it alone"
  exit 0
fi

# xcconfig treats '//' as a comment, so every URL has to break the pair with
# the empty-substitution escape $(). This is upstream's own idiom — see
# BURGERAMT_SERVICE_LINK in the published file.
esc() { printf '%s' "$1" | sed 's|://|:/$()/|'; }

cp "${CONFIG}" "${CONFIG}.published"

python3 - "${CONFIG}" "$(esc "${VCI_ISSUER_URL}")" "$(esc "${WALLET_HOST_URL}")" <<'PY'
import pathlib
import sys
import urllib.parse

path, vci, wallet = pathlib.Path(sys.argv[1]), sys.argv[2], sys.argv[3]
issuer_host = urllib.parse.urlparse(vci.replace("$()", "")).hostname or "localhost"

values = {
    "VCI_ISSUER_URL": vci,
    "PID_ISSUER_NAME": issuer_host,
    "WALLET_HOST_URL": wallet,
    # Nothing local serves these; the app tolerates them being unreachable.
    "PRIVACY_POLICY_LINK": "https:/$()/example.invalid/privacy",
    "WALLET_OTLP_HOST_URL": "http:/$()/localhost:4318",
    "WALLET_OTLP_SERVICE_NAME": "ehds-demo-wallet-ios",
    "FEATURE_FLAG_BASE_URL": "https:/$()/example.invalid/flags",
    "APP_UPDATE_URL": "https:/$()/example.invalid/update",
    # ConfigLogic falls back to exactly these two when the keys are absent.
    "PID_MSO_MDOC_CONFIG_ID": "pid-mso-mdoc",
    "PID_SD_JWT_CONFIG_ID": "pid-sd-jwt",
}

out = []
for line in path.read_text().splitlines():
    key = line.split("=", 1)[0].strip()
    if key in values and "PLACEHOLDER" in line:
        out.append(f"{key} = {values[key]}")
    else:
        out.append(line)
path.write_text("\n".join(out) + "\n")

remaining = [ln for ln in out if "PLACEHOLDER_" in ln]
if remaining:
    print("still placeholder: " + ", ".join(ln.split("=")[0].strip() for ln in remaining))
PY

echo "==> configured ${CONFIG} (original kept as WalletDev.xcconfig.published)"
grep -E '^(WALLET_HOST_URL|VCI_ISSUER_URL|PID_ISSUER_NAME)' "${CONFIG}"
