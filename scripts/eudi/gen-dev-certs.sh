#!/usr/bin/env bash
# Generate the four self-signed root certificates the wallet backend requires
# before its context will start.
#
# StatusListConfiguration reads and validity-checks its pool root cert eagerly
# in the constructor, so the backend cannot start without one even under the
# build-docs profile, where no key lineage is ever built. WPB, RWSCA and MDVM
# read theirs lazily but need the paths to resolve.
#
# These are throwaway local development anchors. They are written to a
# git-ignored directory and are not a substitute for the real trust anchors,
# which the mirror does not publish.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CERT_DIR="${1:-${REPO_ROOT}/services/eudi-wallet-backend/certs}"
DAYS="${CERT_DAYS:-825}"

mkdir -p "${CERT_DIR}"

gen() {
  local name="$1" cn="$2"
  if [[ -f "${CERT_DIR}/${name}.crt" ]]; then
    echo "==> ${name}.crt exists, keeping it"
    return
  fi
  echo "==> generating ${name}.crt (CN=${cn})"
  openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-256 \
    -keyout "${CERT_DIR}/${name}.key" -out "${CERT_DIR}/${name}.crt" \
    -days "${DAYS}" -nodes -subj "/CN=${cn}/O=EHDS Integration Demo" \
    -addext "basicConstraints=critical,CA:TRUE" \
    -addext "keyUsage=critical,keyCertSign,cRLSign" 2>/dev/null
  chmod 600 "${CERT_DIR}/${name}.key"
}

gen wpb-wia-root       "EHDS Demo WPB WIA Root"
gen rwsca-wte-root     "EHDS Demo RWSCA WTE Root"
gen mdvm-root          "EHDS Demo MDVM Root"
gen statuslist-root    "EHDS Demo Status List Root"

echo "==> certs in ${CERT_DIR}:"
ls -1 "${CERT_DIR}"
