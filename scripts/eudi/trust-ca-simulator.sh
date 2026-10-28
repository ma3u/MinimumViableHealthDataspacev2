#!/usr/bin/env bash
# Install the local TLS-interception root CA into an iOS Simulator's trust store.
#
# Why this exists: the Simulator has its OWN trust store and does not inherit the
# Mac's. Behind a TLS-intercepting proxy the host trusts the proxy's root, so
# curl and Safari work, while every HTTPS call from an app in the Simulator fails
# with NSURLErrorSecureConnectionFailed (-1200) — which looks like a broken
# server, not a trust problem. The German wallet hits this the moment it resolves
# OpenID4VCI issuer metadata:
#
#   Failed to resolve issuer metadata: OpenID4VCI.CredentialIssuerMetadataError
#
# Erasing a simulator wipes the trust store, so this needs re-running afterwards.
#
# Usage: scripts/eudi/trust-ca-simulator.sh [simulator-name] [CA common-name ...]
#   defaults: "iPhone 17 Pro", and every admin-domain trusted root on this Mac
set -euo pipefail

SIMULATOR="${1:-iPhone 17 Pro}"
shift || true

TMP="$(mktemp -d)"
trap 'rm -rf "${TMP}"' EXIT

if [[ $# -gt 0 ]]; then
  NAMES=("$@")
else
  # The roots an MDM/corporate build has added. `security dump-trust-settings -d`
  # lists the admin domain, which is where an interception root normally lands.
  # Read with a loop, not mapfile: macOS ships bash 3.2, which has no mapfile.
  NAMES=()
  while IFS= read -r line; do
    [[ -n "${line}" ]] && NAMES+=("${line}")
  done < <(security dump-trust-settings -d 2>/dev/null | sed -n 's/^Cert [0-9]*: //p')
fi

if [[ ${#NAMES[@]} -eq 0 ]]; then
  echo "no admin-domain trusted roots found; pass CA common names explicitly" >&2
  exit 1
fi

printf '==> candidate roots: %s\n' "${NAMES[*]}"

python3 - "${TMP}" "${NAMES[@]}" <<'PY'
import pathlib, re, subprocess, sys

outdir = pathlib.Path(sys.argv[1])
names = sys.argv[2:]
keychains = ["/Library/Keychains/System.keychain",
             str(pathlib.Path.home() / "Library/Keychains/login.keychain-db"),
             "/System/Library/Keychains/SystemRootCertificates.keychain"]

seen, n = set(), 0
for name in names:
    for kc in keychains:
        pem = subprocess.run(["security", "find-certificate", "-a", "-c", name, "-p", kc],
                             capture_output=True, text=True).stdout
        for block in re.findall(r"-----BEGIN CERTIFICATE-----.*?-----END CERTIFICATE-----",
                                pem, re.S):
            if block in seen:
                continue
            seen.add(block)
            subject = subprocess.run(["openssl", "x509", "-noout", "-subject"],
                                     input=block, capture_output=True, text=True).stdout.strip()
            (outdir / f"ca-{n}.crt").write_text(block + "\n")
            print(f"    {subject}")
            n += 1
print(f"==> exported {n} certificate(s)")
PY

installed=0
for cert in "${TMP}"/ca-*.crt; do
  [[ -e "${cert}" ]] || continue
  if xcrun simctl keychain "${SIMULATOR}" add-root-cert "${cert}" 2>/dev/null; then
    installed=$((installed + 1))
  fi
done
echo "==> installed ${installed} root(s) into '${SIMULATOR}'"
echo "    restart the app for the new trust settings to take effect"
