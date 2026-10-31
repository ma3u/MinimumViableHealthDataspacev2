#!/usr/bin/env bash
set -euo pipefail
# =============================================================================
# Bolt TLS for an SPE workspace: a CA of its own and a server certificate
# (ADR-069, #774)
# =============================================================================
#   spe-tls.sh <ca-dir> <out-dir> <dns-name>
#
# <ca-dir>/ca.key, ca.crt   the CA, made once (EC P-256, 5 years). The proxy
#                           trusts this CA and no other for the workspaces
#                           (NEO4J_SPE_CA_CERT); ca.key never leaves <ca-dir>.
# <out-dir>/private.key, public.crt
#                           the workspace's server key and certificate, for
#                           <dns-name> (the ACI DNS label's FQDN), 1 year.
#
# 21-aci-confidential-spe.sh keeps <ca-dir> outside the repository
# (~/.mvhd/spe-ca, mode 700). Nothing is printed but file names.
# =============================================================================
ca="${1:?usage: spe-tls.sh <ca-dir> <out-dir> <dns-name>}"
out="${2:?usage: spe-tls.sh <ca-dir> <out-dir> <dns-name>}"
name="${3:?usage: spe-tls.sh <ca-dir> <out-dir> <dns-name>}"
umask 077

# A CA that is gone while certificates it signed are still around: a new CA
# would not match the one the proxy pins (NEO4J_SPE_CA_CERT) nor the
# certificates already deployed. Refuse, and say how to recover.
if [ ! -s "$ca/ca.key" ]; then
  parent="$(dirname "$out")"
  for existing in "$parent"/tls-*/public.crt "$out/public.crt"; do
    if [ -s "$existing" ]; then
      echo "spe-tls: ${existing} exists but the CA in ${ca} does not." >&2
      echo "spe-tls: Either restore ${ca} (ca.key, ca.crt) from its backup, or start over:" >&2
      echo "spe-tls:   remove every ${parent}/tls-*, then run 21-aci-confidential-spe.sh --policy" >&2
      echo "spe-tls:   --workspaces --wire-proxy, so the groups and the proxy get the new CA." >&2
      exit 1
    fi
  done
fi
mkdir -p "$ca" "$out"

if [ ! -s "$ca/ca.key" ]; then
  openssl ecparam -name prime256v1 -genkey -noout -out "$ca/ca.key"
  openssl req -x509 -new -key "$ca/ca.key" -days 1825 -sha256 \
    -subj "/O=MedReg DE/OU=SPE workspaces/CN=mvhd SPE Bolt CA" \
    -addext "basicConstraints=critical,CA:TRUE" \
    -addext "keyUsage=critical,keyCertSign,cRLSign" \
    -out "$ca/ca.crt"
  echo "spe-tls: CA made in ${ca}"
fi

ext="$(mktemp)"
printf 'basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\nextendedKeyUsage=serverAuth\nsubjectAltName=DNS:%s\n' "$name" >"$ext"
openssl ecparam -name prime256v1 -genkey -noout -out "$out/key.ec"
# Neo4j reads PKCS#8.
openssl pkcs8 -topk8 -nocrypt -in "$out/key.ec" -out "$out/private.key"
rm -f "$out/key.ec"
openssl req -new -key "$out/private.key" -subj "/O=MedReg DE/OU=SPE workspaces/CN=${name}" -out "$out/server.csr"
openssl x509 -req -in "$out/server.csr" -CA "$ca/ca.crt" -CAkey "$ca/ca.key" -CAcreateserial \
  -days 365 -sha256 -extfile "$ext" -out "$out/public.crt" 2>/dev/null
rm -f "$out/server.csr" "$ext"
chmod 0644 "$out/public.crt" "$ca/ca.crt"
# Keys are the owner's only. The group gets the server key through its
# secret volume, which sets its own modes inside the container.
chmod 0600 "$out/private.key" "$ca/ca.key"
rm -f "$ca/ca.srl"
echo "spe-tls: certificate for ${name} in ${out}"
