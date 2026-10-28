#!/usr/bin/env bash
# Provision a software HSM (SoftHSM2) for dev/test so the wallet backend can run
# WITHOUT the build-docs profile — i.e. so it can actually sign.
#
# Runs inside the backend image, which already carries softhsm2, opensc and
# openssl. It is idempotent: every object is skipped if its label already exists.
#
# What the backend requires, read off the published source:
#
#   AsymmetricSigningLineage.initialize() (shared/keyrollover) scans the token
#   for EC private keys whose CKA_LABEL starts with the lineage's key prefix and
#   whose CKA_START_DATE/CKA_END_DATE bracket today. For each candidate it then
#     1. fetches a PEM chain from S3 at  <slotLabel>/<label minus -prvk>.pem
#        (HsmKey.certObjectKey), and validates it to that lineage's pinned root;
#     2. signs a random challenge with the HSM key and verifies it with the
#        leaf certificate's public key (signProofOfPossession).
#   So the HSM key and the published leaf certificate must be the same keypair.
#
#   SymmetricKeyLineage just needs a secret key whose label starts with the
#   prefix. CKA_ID must be non-empty for either — HsmKey.from returns null
#   without it, and the key becomes invisible.
#
#   CKA_START_DATE/CKA_END_DATE are deliberately left unset: HsmKey.from falls
#   back to LocalDate.MIN/MAX, so a dev key never expires and never needs a
#   rollover run.
#
# This is a DEV/TEST HSM. SoftHSM keeps key material in ordinary files on a
# volume; it provides the PKCS#11 interface, not the protection. Nothing signed
# by it should be trusted anywhere real.
set -euo pipefail

MODULE="${HSM_MODULE_LIBRARY:-/usr/lib/softhsm/libsofthsm2.so}"
TOKEN_DIR="${HSM_TOKEN_DIR:-/home/wallet/softhsm/tokens}"
CERT_DIR="${HSM_CERT_DIR:-/home/wallet/certs}"      # dev roots: <name>.crt + <name>.key
CHAIN_DIR="${HSM_CHAIN_DIR:-/home/wallet/chains}"   # output, uploaded to S3 by the mc init
LEAF_DAYS="${HSM_LEAF_DAYS:-825}"

SLOT_LABEL="${HSM_SLOT_LABEL:-wallet}"
SLOT_PIN="${HSM_SLOT_PIN:-1234}"
SLOT_SO_PIN="${HSM_SLOT_SO_PIN:-123456}"
WI_SLOT_LABEL="${HSM_WI_SLOT_LABEL:-wallet-wi}"
WI_SLOT_PIN="${HSM_WI_SLOT_PIN:-1234}"
WI_SLOT_SO_PIN="${HSM_WI_SLOT_SO_PIN:-123456}"

export SOFTHSM2_CONF="${SOFTHSM2_CONF:-/home/wallet/softhsm/softhsm2.conf}"

log() { printf '==> %s\n' "$*"; }

# --- softhsm config ---------------------------------------------------------
mkdir -p "${TOKEN_DIR}" "${CHAIN_DIR}" "$(dirname "${SOFTHSM2_CONF}")"
cat > "${SOFTHSM2_CONF}" <<EOF
directories.tokendir = ${TOKEN_DIR}
objectstore.backend = file
log.level = ERROR
slots.removable = false
EOF

# softhsm2-util pads Label: values to a fixed width, so the trailing spaces have
# to come off before comparing.
slot_id_for() {
  softhsm2-util --show-slots 2>/dev/null | awk -v want="$1" '
    /^Slot [0-9]+$/ { slot = $2 }
    /^ +Label: +/   { sub(/^ +Label: +/, ""); sub(/ +$/, "");
                      if ($0 == want) { print slot; exit } }'
}

token_exists() { [[ -n "$(slot_id_for "$1")" ]]; }

init_token() {
  local label="$1" pin="$2" so_pin="$3"
  if token_exists "${label}"; then
    log "token '${label}' already initialised"
    return
  fi
  log "initialising token '${label}'"
  softhsm2-util --init-token --free --label "${label}" --so-pin "${so_pin}" --pin "${pin}" >/dev/null
}

# pkcs11-tool's --token-label is not honoured by this build: with two tokens
# present it silently used the first slot, so objects landed in the wrong token.
# Resolve the slot id from the label and address the slot directly.
p11() {
  local pin="$1"; shift
  local slot; slot="$(slot_id_for "${TOKEN}")"
  [[ -n "${slot}" ]] || { echo "no SoftHSM slot with token label '${TOKEN}'" >&2; exit 1; }
  pkcs11-tool --module "${MODULE}" --slot "${slot}" --login --pin "${pin}" "$@"
}

object_exists() {
  local pin="$1" label="$2"
  p11 "${pin}" -O 2>/dev/null | sed 's/ *$//' | grep -qE "^ +label: +${label}\$"
}

# A stable CKA_ID per label. Any non-empty value works; deriving it keeps
# re-runs and log lines reproducible.
key_id() { printf '%s' "$1" | sha256sum | cut -c1-16; }

# --- asymmetric lineages ----------------------------------------------------
# <key prefix> <root cert basename in CERT_DIR> <subject CN>
provision_signing_key() {
  local prefix="$1" root="$2" cn="$3" pin="$4"
  local label="${prefix}-prvk"
  local chain_out="${CHAIN_DIR}/${TOKEN}/${prefix}.pem"

  if object_exists "${pin}" "${label}" && [[ -s "${chain_out}" ]]; then
    log "signing key '${label}' already provisioned"
    return
  fi

  local root_crt="${CERT_DIR}/${root}.crt" root_key="${CERT_DIR}/${root}.key"
  [[ -f "${root_crt}" && -f "${root_key}" ]] || {
    echo "missing dev root ${root_crt} / ${root_key} — run scripts/eudi/gen-dev-certs.sh" >&2
    exit 1
  }

  local tmp; tmp="$(mktemp -d)"
  log "issuing ${prefix} leaf under ${root} and importing it into '${TOKEN}'"

  openssl ecparam -name prime256v1 -genkey -noout -out "${tmp}/leaf.key" 2>/dev/null
  openssl req -new -key "${tmp}/leaf.key" -subj "/CN=${cn}/O=EHDS Integration Demo" -out "${tmp}/leaf.csr" 2>/dev/null
  # End-entity, signing only: the lineage verifies a signature with this leaf's
  # public key, and PKIX would reject a CA certificate at the end of the path.
  printf 'basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\n' > "${tmp}/leaf.ext"
  # -CAserial into the temp dir: bare -CAcreateserial writes <ca>.srl next to the
  # CA certificate, and the dev-cert directory is mounted read-only.
  openssl x509 -req -in "${tmp}/leaf.csr" \
    -CA "${root_crt}" -CAkey "${root_key}" \
    -CAserial "${tmp}/ca.srl" -CAcreateserial \
    -days "${LEAF_DAYS}" -extfile "${tmp}/leaf.ext" \
    -out "${tmp}/leaf.crt"

  # Leaf first, then the root. S3CertChainProvider filters the anchor out of the
  # path and validates the remainder against it, so including it is harmless and
  # makes the object self-describing.
  mkdir -p "$(dirname "${chain_out}")"
  cat "${tmp}/leaf.crt" "${root_crt}" > "${chain_out}"

  openssl pkcs8 -topk8 -nocrypt -in "${tmp}/leaf.key" -outform DER -out "${tmp}/leaf.p8"
  p11 "${pin}" --write-object "${tmp}/leaf.p8" --type privkey \
    --label "${label}" --id "$(key_id "${label}")" --usage-sign >/dev/null

  rm -rf "${tmp}"
}

# --- symmetric lineages -----------------------------------------------------
provision_secret_key() {
  local label="$1" keytype="$2" pin="$3"; shift 3
  if object_exists "${pin}" "${label}"; then
    log "secret key '${label}' already provisioned"
    return
  fi
  log "generating ${keytype} '${label}' in '${TOKEN}'"
  p11 "${pin}" --keygen --key-type "${keytype}" \
    --label "${label}" --id "$(key_id "${label}")" "$@" >/dev/null
}

# ---------------------------------------------------------------------------
init_token "${SLOT_LABEL}" "${SLOT_PIN}" "${SLOT_SO_PIN}"
init_token "${WI_SLOT_LABEL}" "${WI_SLOT_PIN}" "${WI_SLOT_SO_PIN}"

TOKEN="${SLOT_LABEL}"

# Prefixes and root certs must match application.yaml. Changing one without the
# other leaves the lineage unable to resolve and the context fails to start.
provision_signing_key wpb-wia-auth            wpb-wia-root    "EHDS Demo WPB WIA Signer"         "${SLOT_PIN}"
provision_signing_key rwsca-wte-auth          rwsca-wte-root  "EHDS Demo RWSCA WTE Signer"       "${SLOT_PIN}"
provision_signing_key mdvm-attestation        mdvm-root       "EHDS Demo MDVM Attestation"       "${SLOT_PIN}"
provision_signing_key statuslist-wpb-wia-auth statuslist-root "EHDS Demo Status List Signer"     "${SLOT_PIN}"

# challenge tokens and the RWSCA PIN protocol: generic secrets (HMAC-style use).
provision_secret_key challenge-symk    "GENERIC:32" "${SLOT_PIN}" --usage-sign
provision_secret_key rwsca-pin-symk    "GENERIC:32" "${SLOT_PIN}" --usage-sign
# AEAD over stored RWSCA material: encrypt/decrypt.
provision_secret_key rwsca-aead-symk   "aes:32"     "${SLOT_PIN}" --usage-decrypt

# rwsca-master lives in the wallet-instance slot (RwscaKeyProvider takes it from
# the RWSCA_WI_HSM_PROVIDER qualifier, i.e. rwsca.wi-slot) and wraps per-instance
# keys, so it needs wrap/unwrap rather than encrypt/decrypt.
TOKEN="${WI_SLOT_LABEL}"
provision_secret_key rwsca-master      "aes:32"     "${WI_SLOT_PIN}" --usage-wrap

log "provisioned tokens:"
softhsm2-util --show-slots 2>/dev/null | grep -E "^ +Label:" | sed 's/^/    /'
log "cert chains for S3:"
find "${CHAIN_DIR}" -name '*.pem' | sed 's/^/    /'
