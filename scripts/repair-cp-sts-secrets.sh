#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Give the control plane the STS client secret each participant already has
# ---------------------------------------------------------------------------
# #349. A participant's STS client secret lives in two places that do not know
# about each other:
#
#   IdentityHub  participants/<ctx>/identityhub/<ctx>-sts-client-secret
#                (its own per-participant Vault config, see the context's
#                 edc.vault.hashicorp.config.folderPath)
#   control plane  secret/<ctx>-sts-client-secret
#                (its global mount; the alias comes from the context's
#                 edc.iam.sts.oauth.client.secret.alias)
#
# CFM writes both when it provisions. The dev Vault lost its contents on
# 2026-09-24 and only the IdentityHub's copy came back, so every outbound DSP
# call died at
#
#   Unable to obtain credentials: Failed to fetch client secret from the vault
#   with alias: <ctx>-sts-client-secret
#
# and every negotiation and transfer with it. This copies the secret the
# IdentityHub holds to the alias the control plane asks for. It invents
# nothing: if the IdentityHub has no secret for a participant, that participant
# is reported and skipped, because a wrong value produces `401 invalid_client`
# from the STS, which is harder to diagnose than a missing one.
#
# Idempotent. Safe to re-run; it overwrites the control plane's copy with the
# IdentityHub's, which is the source of truth.
#
# Usage:
#   ./scripts/repair-cp-sts-secrets.sh                # every participant context
#   ./scripts/repair-cp-sts-secrets.sh <ctx> [<ctx>]  # only these
#
# Env:
#   VAULT_CONTAINER   default health-dataspace-vault
#   VAULT_TOKEN       default root (dev stack)
#   EDC_MANAGEMENT_URL, KEYCLOAK_URL, EDC_CLIENT_ID, EDC_CLIENT_SECRET
#                     used only to list the contexts when none are given
# ---------------------------------------------------------------------------
set -euo pipefail

VAULT_CONTAINER="${VAULT_CONTAINER:-health-dataspace-vault}"
VAULT_TOKEN="${VAULT_TOKEN:-root}"
KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8080}"
REALM="${KEYCLOAK_REALM:-edcv}"
EDC_MANAGEMENT_URL="${EDC_MANAGEMENT_URL:-http://localhost:11003/api/mgmt}"
MGMT_V="${EDC_MGMT_API_VERSION:-v5beta}"
EDC_CLIENT_ID="${EDC_CLIENT_ID:-admin}"
EDC_CLIENT_SECRET="${EDC_CLIENT_SECRET:-edc-v-admin-secret}"

CYAN='\033[0;36m'; GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[0;33m'; NC='\033[0m'
log() { echo -e "${CYAN}[sts-repair]${NC} $*"; }

vault() { docker exec -e "VAULT_TOKEN=${VAULT_TOKEN}" "$VAULT_CONTAINER" vault "$@" 2>/dev/null; }

contexts=("$@")
if [ "${#contexts[@]}" -eq 0 ]; then
  token=$(curl -sS --max-time 20 -X POST \
    "${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/token" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "grant_type=client_credentials&client_id=${EDC_CLIENT_ID}&client_secret=${EDC_CLIENT_SECRET}" \
    | python3 -c "import json,sys; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null || true)
  [ -n "$token" ] || { echo -e "${RED}ERROR${NC}: no Keycloak token from ${KEYCLOAK_URL}" >&2; exit 1; }
  # A read loop, not mapfile: mapfile is bash 4+ and macOS ships 3.2.
  contexts=()
  while IFS= read -r line; do
    [ -n "$line" ] && contexts+=("$line")
  done < <(curl -sS --max-time 20 -H "Authorization: Bearer ${token}" \
    "${EDC_MANAGEMENT_URL}/${MGMT_V}/participants" \
    | python3 -c "import json,sys; [print(p['@id']) for p in json.load(sys.stdin)]" 2>/dev/null || true)
  [ "${#contexts[@]}" -gt 0 ] || { echo -e "${RED}ERROR${NC}: the control plane listed no participant contexts" >&2; exit 1; }
  log "found ${#contexts[@]} participant context(s) on the control plane"
fi

copied=0; already=0; missing=0
for ctx in "${contexts[@]}"; do
  [ -n "$ctx" ] || continue
  src="participants/${ctx}/identityhub/${ctx}-sts-client-secret"
  dst="secret/${ctx}-sts-client-secret"

  value=$(vault kv get -field=content "$src" || true)
  if [ -z "$value" ]; then
    echo -e "  ${YELLOW}~${NC} ${ctx}: the IdentityHub holds no secret at ${src}; skipped"
    missing=$((missing + 1))
    continue
  fi

  current=$(vault kv get -field=content "$dst" || true)
  if [ "$current" = "$value" ]; then
    echo -e "  ${GREEN}=${NC} ${ctx}: the control plane already has it"
    already=$((already + 1))
    continue
  fi

  if vault kv put "$dst" content="$value" >/dev/null; then
    echo -e "  ${GREEN}+${NC} ${ctx}: copied to ${dst}"
    copied=$((copied + 1))
  else
    echo -e "  ${RED}x${NC} ${ctx}: could not write ${dst}" >&2
    missing=$((missing + 1))
  fi
done

echo -e "${CYAN}[sts-repair]${NC} copied ${copied}, already present ${already}, unavailable ${missing}"

# Read-back: the property is that the control plane can now read each alias it
# is configured with, not that the loop ran (ADR-031).
bad=0
for ctx in "${contexts[@]}"; do
  [ -n "$ctx" ] || continue
  vault kv get -field=content "secret/${ctx}-sts-client-secret" >/dev/null || bad=$((bad + 1))
done
if [ "$bad" -gt 0 ]; then
  echo -e "${RED}FAIL${NC}: ${bad} context(s) still have no secret at secret/<ctx>-sts-client-secret" >&2
  echo "  Those participants cannot obtain an STS token, so every DSP call they make will fail." >&2
  exit 1
fi
echo -e "${GREEN}OK${NC}: every participant context has its STS client secret where the control plane looks for it"
