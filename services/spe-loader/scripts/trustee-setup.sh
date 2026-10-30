#!/usr/bin/env bash
set -euo pipefail
# =============================================================================
# Trustee's keys, generated where Trustee runs, on first start (ADR-068, #774)
# =============================================================================
#   trustee-setup.sh <dir>
#
# Writes into <dir>, each only if it is not there yet (so a restart keeps them):
#   private.key, public.pub   ed25519: the access body's admin key; KBS trusts
#                             public.pub for its admin API
#   admin-token               a JWT signed with private.key (role admin, 10 years)
#   ca.key, ca-cert.pem       the CA KBS trusts for attestation tokens
#   token.key                 EC P-256: the built-in AS signs tokens with it
#   token-cert-chain.pem      token.key's certificate and the CA
#
# Nothing here is committed and nothing is printed except file names: the
# compose overlay keeps <dir> in the named volume trustee_keys, Azure keeps it
# on mvhd-trustee's own share (scripts/azure/21-aks-confidential-spe.sh).
# Modelled on Trustee v0.22.0 kbs/config/docker-compose/setup.sh.
# =============================================================================
dir="${1:?usage: trustee-setup.sh <dir>}"
issuer="${TRUSTEE_ADMIN_ISSUER:-mvhd-trustee-admin}"
mkdir -p "$dir"
cd "$dir"
umask 077

if [ ! -s private.key ]; then
  openssl genpkey -algorithm ed25519 -out private.key
  openssl pkey -in private.key -pubout -out public.pub
  echo "trustee-setup: admin key pair generated"
fi

if [ ! -s admin-token ]; then
  b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }
  iat="$(date +%s)"
  exp="$((iat + 315360000))"
  header='{"alg":"EdDSA","typ":"JWT"}'
  payload="{\"iss\":\"${issuer}\",\"sub\":\"admin\",\"aud\":[\"KBS\"],\"role\":\"admin\",\"iat\":${iat},\"exp\":${exp}}"
  h64="$(printf '%s' "$header" | b64url)"
  p64="$(printf '%s' "$payload" | b64url)"
  input="$(mktemp)"
  printf '%s' "${h64}.${p64}" >"$input"
  sig="$(openssl pkeyutl -sign -inkey private.key -rawin -in "$input" | b64url)"
  rm -f "$input"
  printf '%s.%s.%s\n' "$h64" "$p64" "$sig" >admin-token
  echo "trustee-setup: admin token written"
fi

if [ ! -s token.key ]; then
  openssl genrsa -traditional -out ca.key 2048 2>/dev/null
  openssl req -x509 -new -key ca.key -days 3650 -subj "/O=MedReg DE/OU=Trustee/CN=mvhd-trustee token CA" -out ca-cert.pem
  # P-256, not RSA: the v0.22.0 built-in AS refuses an RSA signer at start
  # ("expecting an ec key"), whatever kbs/docs/config.md says.
  openssl ecparam -name prime256v1 -genkey -noout -out token.key
  openssl req -new -key token.key -subj "/O=MedReg DE/OU=Trustee/CN=mvhd-trustee attestation service" -out token.csr
  openssl x509 -req -in token.csr -CA ca-cert.pem -CAkey ca.key -CAcreateserial -days 365 -out token-cert.pem 2>/dev/null
  cat token-cert.pem ca-cert.pem >token-cert-chain.pem
  rm -f token.csr
  echo "trustee-setup: token signing key and CA generated"
fi

# KBS and the access body's tools (trustee-policy, spe-extract) run as root;
# the workspace's loader never mounts this directory. On an Azure Files share
# (mvhd-trustee's trustee-keys) SMB has no Unix modes and a chmod can fail
# (gotcha 2026-09-30, initdb): the share's own access is the boundary there,
# mounted into mvhd-trustee and its admin job only.
chmod 0644 public.pub ca-cert.pem token-cert.pem token-cert-chain.pem 2>/dev/null ||
  echo "trustee-setup: no Unix modes on ${dir} (SMB share?)"
chmod 0600 private.key ca.key token.key admin-token 2>/dev/null || true
echo "trustee-setup: ${dir} ready"
