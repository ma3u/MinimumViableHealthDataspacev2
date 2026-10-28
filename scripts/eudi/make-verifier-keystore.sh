#!/usr/bin/env bash
# Build the PKCS#12 keystore the self-hosted EUDI verifier signs its requests
# with (ADR-066, #182 W1). The verifier refuses a self-signed access
# certificate, so even the development keystore carries a chain.
#
#   make-verifier-keystore.sh --dev
#       A throwaway development CA and a leaf under it, for the compose
#       overlay, plus dev.properties with an intended use whose registration
#       certificate that leaf signs. Written to services/eudi-verifier/certs/
#       (git-ignored), password "dev-keystore". No wallet trusts any of it.
#
#   make-verifier-keystore.sh --real <access-cert.pem> [<chain.pem>]
#       The access certificate the SPRIND sandbox issued for our CSR, with the
#       private key that never left this Mac (~/.config/mvhd/eudi-rp). Checks
#       that the certificate belongs to that key, then writes keystore.p12 and
#       a random keystore.pass next to the key, both readable only by you.
#       Neither is printed. Upload them with scripts/azure/19-eudi-verifier.sh
#       --upload-keystore.
#
# The alias is "verifier" in both cases; key and keystore share the password,
# which is what the verifier's VERIFIER_ACCESS_CERTIFICATE_* settings expect.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RP_DIR="${EUDI_RP_DIR:-${HOME}/.config/mvhd/eudi-rp}"
VERIFIER_HOST="${EUDI_VERIFIER_HOST:-verifier.ehds.mabu.red}"
ALIAS="verifier"

# LibreSSL (macOS) writes an EC key with explicit curve parameters unless told
# otherwise, and a CA or a JDK may refuse those. Prefer Homebrew's OpenSSL.
OPENSSL="openssl"
for candidate in /opt/homebrew/opt/openssl@3/bin/openssl /usr/local/opt/openssl@3/bin/openssl; do
  if [[ -x "$candidate" ]]; then
    OPENSSL="$candidate"
    break
  fi
done

die() {
  echo "error: $*" >&2
  exit 1
}

export_p12() {
  local key="$1" cert="$2" chain="$3" out="$4" passfile="$5"
  local args=(pkcs12 -export -name "$ALIAS" -inkey "$key" -in "$cert"
    -out "$out" -passout "file:${passfile}")
  [[ -n "$chain" ]] && args+=(-certfile "$chain")
  # AES and SHA-256 rather than the RC2/3DES defaults older tools pick.
  if "$OPENSSL" version | grep -q '^OpenSSL 3'; then
    args+=(-keypbe AES-256-CBC -certpbe AES-256-CBC -macalg sha256)
  fi
  "$OPENSSL" "${args[@]}"
}

dev() {
  local dir="${REPO_ROOT}/services/eudi-verifier/certs"
  mkdir -p "$dir"
  if [[ -f "${dir}/keystore.p12" ]]; then
    echo "==> ${dir}/keystore.p12 exists, keeping it"
    return
  fi
  local tmp
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' RETURN

  "$OPENSSL" genpkey -algorithm EC -pkeyopt ec_paramgen_curve:prime256v1 \
    -pkeyopt ec_param_enc:named_curve -out "${tmp}/ca.key"
  "$OPENSSL" req -x509 -new -sha256 -days 825 -key "${tmp}/ca.key" \
    -subj "/CN=MVHD dev verifier CA/O=Minimum Viable Health Dataspace (dev only)" \
    -addext "basicConstraints=critical,CA:TRUE,pathlen:0" \
    -addext "keyUsage=critical,keyCertSign,cRLSign" \
    -out "${dir}/dev-ca.crt"

  "$OPENSSL" genpkey -algorithm EC -pkeyopt ec_paramgen_curve:prime256v1 \
    -pkeyopt ec_param_enc:named_curve -out "${tmp}/leaf.key"
  "$OPENSSL" req -new -sha256 -key "${tmp}/leaf.key" \
    -subj "/CN=localhost/O=Minimum Viable Health Dataspace (dev only)" \
    -out "${tmp}/leaf.csr"
  printf '%s\n' "subjectAltName=DNS:localhost,DNS:${VERIFIER_HOST}" \
    "keyUsage=critical,digitalSignature" "basicConstraints=CA:FALSE" >"${tmp}/leaf.ext"
  "$OPENSSL" x509 -req -sha256 -days 825 -in "${tmp}/leaf.csr" \
    -CA "${dir}/dev-ca.crt" -CAkey "${tmp}/ca.key" -CAcreateserial \
    -extfile "${tmp}/leaf.ext" -out "${tmp}/leaf.crt" 2>/dev/null

  printf 'dev-keystore' >"${tmp}/pass"
  export_p12 "${tmp}/leaf.key" "${tmp}/leaf.crt" "${dir}/dev-ca.crt" \
    "${dir}/keystore.p12" "${tmp}/pass"
  # Readable by the verifier container's own user; it is a dev key.
  chmod 644 "${dir}/keystore.p12"

  # The verifier will not start without an intended use, and an intended use
  # carries a registration certificate. This one is signed by the dev leaf and
  # names the two claims the hub asks for; on Azure it is the one SPRIND issues.
  python3 - "${tmp}/leaf.key" "${tmp}/leaf.crt" >"${dir}/dev.properties" <<'PYRC'
import base64, json, sys, time
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature

key = serialization.load_pem_private_key(open(sys.argv[1], "rb").read(), None)
cert = x509.load_pem_x509_certificate(open(sys.argv[2], "rb").read())
b64u = lambda b: base64.urlsafe_b64encode(b).rstrip(b"=").decode()
claims = [{"path": ["family_name"]}, {"path": ["given_name"]}]
header = {"typ": "rc-wrp+jwt", "alg": "ES256",
          "x5c": [base64.b64encode(cert.public_bytes(serialization.Encoding.DER)).decode()]}
now = int(time.time())
payload = {
    "sub": "MVHD-DEV", "country": "DE", "iat": now, "exp": now + 825 * 86400,
    "entitlements": ["https://uri.etsi.org/19475/Entitlement/Service_Provider"],
    "policy_id": ["0.4.0.19475.3.1"],
    "purpose": [{"lang": "en", "value": "Sign in to the Health Dataspace patient portal (dev only)"}],
    "credentials": [
        {"format": "dc+sd-jwt", "meta": {"vct_values": ["urn:eudi:pid:1", "urn:eudi:pid:de:1"]}, "claim": claims},
        {"format": "mso_mdoc", "meta": {"doctype_value": "eu.europa.ec.eudi.pid.1"},
         "claim": [{"path": ["eu.europa.ec.eudi.pid.1", c["path"][0]]} for c in claims]},
    ],
}
signing_input = (b64u(json.dumps(header).encode()) + "." + b64u(json.dumps(payload).encode())).encode()
r, s = decode_dss_signature(key.sign(signing_input, ec.ECDSA(hashes.SHA256())))
jws = signing_input.decode() + "." + b64u(r.to_bytes(32, "big") + s.to_bytes(32, "big"))
# HAIP's client id: x509_hash, the base64url SHA-256 of the leaf certificate.
digest = hashes.Hash(hashes.SHA256()); digest.update(cert.public_bytes(serialization.Encoding.DER))
print("verifier.clientIdPrefix=x509_hash")
print("verifier.originalClientId=" + b64u(digest.finalize()))
print("verifier.intendedUses[0].id=ehds-patient-sign-in")
print("verifier.intendedUses[0].description=Sign in to the Health Dataspace patient portal")
print("verifier.intendedUses[0].registration-certificate=" + jws)
PYRC
  echo "==> ${dir}/keystore.p12 (alias ${ALIAS}, password dev-keystore, dev CA only)"
  echo "==> ${dir}/dev.properties (intended use ehds-patient-sign-in, dev registration certificate)"
}

real() {
  local cert="${1:-}" chain="${2:-}"
  [[ -f "$cert" ]] || die "give the access certificate PEM from the SPRIND sandbox"
  [[ -z "$chain" || -f "$chain" ]] || die "chain file not found: $chain"
  local key="${RP_DIR}/access-cert.key"
  [[ -f "$key" ]] || die "no private key at $key"

  local want got
  want="$("$OPENSSL" pkey -in "$key" -pubout | "$OPENSSL" sha256)"
  got="$("$OPENSSL" x509 -in "$cert" -noout -pubkey | "$OPENSSL" sha256)"
  [[ "$want" == "$got" ]] || die "the certificate does not belong to ${key}"
  "$OPENSSL" x509 -in "$cert" -noout -ext subjectAltName -enddate

  umask 077
  local pass="${RP_DIR}/keystore.pass"
  [[ -f "$pass" ]] || "$OPENSSL" rand -hex 24 | tr -d '\n' >"$pass"
  export_p12 "$key" "$cert" "$chain" "${RP_DIR}/keystore.p12" "$pass"
  echo "==> ${RP_DIR}/keystore.p12 and keystore.pass written (alias ${ALIAS}); the password was not printed"
}

case "${1:-}" in
  --dev) dev ;;
  --real) shift; real "$@" ;;
  *) sed -n '2,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 2 ;;
esac
