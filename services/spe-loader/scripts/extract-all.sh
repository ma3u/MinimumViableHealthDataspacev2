#!/usr/bin/env bash
set -euo pipefail
# =============================================================================
# One sealed extract per SPE, its key into Trustee (ADR-068, #774)
# =============================================================================
#   extract-all.sh <out-dir>
#
# The holder's upload of Art. 73(2), run as the access body: for each SPE in
# SPE_NUMBERS (default "1 2") export its half of the hub's synthetic patients,
# seal it under a new key, put the key into Trustee at
# default/spe-<n>/extract-key and write <out-dir>/spe-<n>.enc (ciphertext
# only). The permit (SPE_PERMIT_ID) records the policy hash. Used by the
# compose overlay's spe-extract service and by the Azure job mvhd-spe-extract.
# =============================================================================
out="${1:?usage: extract-all.sh <out-dir>}"
mkdir -p "$out"
for n in ${SPE_NUMBERS:-1 2}; do
  spe-loader extract --spe "$n" --out "${out}/spe-${n}.enc.tmp" --record-permit
  mv "${out}/spe-${n}.enc.tmp" "${out}/spe-${n}.enc"
done
ls -l "$out"
