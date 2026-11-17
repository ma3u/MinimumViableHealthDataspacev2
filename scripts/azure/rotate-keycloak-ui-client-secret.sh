#!/usr/bin/env bash
set -euo pipefail
# =============================================================================
# The Keycloak `health-dataspace-ui` client secret on Azure: off the public
# default, into Key Vault, and from there into mvhd-ui (#359).
# =============================================================================
# The UI signs people in with this confidential client (PKCE S256, ADR-044).
# Until 2026-11-11 the live client had the secret jad/keycloak-realm.json pins,
# "health-dataspace-ui-secret", and mvhd-ui did not even carry it: the app had
# KEYCLOAK_SECRET, which nothing reads, and NextAuth fell back to the same
# default in ui/src/lib/auth.ts. With the default and the client's direct
# access grant, anyone could exchange a demo user's password for a token as
# the UI.
#
#   Keycloak        realm edcv, client health-dataspace-ui (regenerated with --rotate)
#   Key Vault       keycloak-ui-client-secret
#   mvhd-ui         KEYCLOAK_CLIENT_SECRET=secretref:keycloak-ui-client-secret
#
# Usage:
#   rotate-keycloak-ui-client-secret.sh --check        # report, change nothing
#   rotate-keycloak-ui-client-secret.sh --rotate       # new secret: Key Vault, mvhd-ui, Keycloak
#   rotate-keycloak-ui-client-secret.sh --to-keycloak  # Key Vault's secret into Keycloak only
#   rotate-keycloak-ui-client-secret.sh                # wire Keycloak's current secret
#
# --rotate breaks sign-in from the moment mvhd-ui's new revision serves until
# Keycloak has the new secret, a few seconds. Sessions already open stay.
# A realm re-import brings the default back (runbook keycloak-realm-drift.md):
# --to-keycloak puts the Key Vault secret back, and needs no new UI revision.
# It is also the way out when --rotate stopped after step 3.
#
# Needs: Key Vault Secrets Officer (the PIM role), Container Apps Contributor.
# =============================================================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/azure/env.sh
source "$SCRIPT_DIR/env.sh"
ROTATE=false
CHECK_ONLY=false
TO_KEYCLOAK=false
case "${1:-}" in
  --rotate) ROTATE=true ;;
  --check) CHECK_ONLY=true ;;
  --to-keycloak) TO_KEYCLOAK=true ;;
  "") ;;
  *) echo "usage: $0 [--check|--rotate|--to-keycloak]" >&2; exit 64 ;;
esac
CLIENT_ID="health-dataspace-ui"
SECRET_NAME="keycloak-ui-client-secret"
IDENTITY_NAME="${ADMIN_SECRET_IDENTITY:-id-mvhd-claude-federation}"
KC="${KEYCLOAK_PUBLIC_URL:-https://auth.ehds.mabu.red}"
DEFAULT_SECRET="health-dataspace-ui-secret"

# Whether Keycloak takes a secret for the client, without a user and without a
# token: a password grant for a user that does not exist answers 400
# invalid_grant when the client authenticated, 401 unauthorized_client when it
# did not. (client_credentials cannot tell: the client has no service account.)
accepted() {
  local code
  code=$(curl -sS --max-time 30 -o /dev/null -w '%{http_code}' -X POST \
    "${KC}/realms/edcv/protocol/openid-connect/token" \
    --data-urlencode grant_type=password --data-urlencode "client_id=${CLIENT_ID}" \
    --data-urlencode "client_secret=$1" \
    --data-urlencode username=no-such-user-secret-check --data-urlencode password=x)
  [ "$code" = 400 ]
}

# How mvhd-ui carries the secret, never the value.
ui_wiring() {
  az containerapp show --name "$UI_APP" --resource-group "$RG" -o json | python3 -c '
import json, sys
for c in json.load(sys.stdin)["properties"]["template"]["containers"]:
    for e in c.get("env") or []:
        if e["name"] in ("KEYCLOAK_CLIENT_SECRET", "KEYCLOAK_SECRET"):
            print(e["name"], "secretref:" + e["secretRef"] if "secretRef" in e else "plain, %d chars" % len(e.get("value", "")))'
}

if [ "$CHECK_ONLY" = true ]; then
  if accepted "$DEFAULT_SECRET"; then
    warn "Keycloak takes the public default for ${CLIENT_ID}; run with --rotate"
  else
    ok "Keycloak refuses the public default for ${CLIENT_ID}"
  fi
  wiring=$(ui_wiring)
  echo "${UI_APP}: ${wiring:-no KEYCLOAK_CLIENT_SECRET (NextAuth falls back to the default)}"
  exit 0
fi

# A master-realm admin token. It lives a minute, so each use fetches one: the
# first --rotate run on 2026-11-11 held one across the UI rollout and Keycloak
# refused the update with 401, leaving sign-in down until --to-keycloak.
kc_master() {
  local pass token
  pass=$(kc_admin_password)
  [ -n "$pass" ] || { err "no Keycloak admin password"; return 1; }
  token=$(curl -sS --max-time 30 -X POST "${KC}/realms/master/protocol/openid-connect/token" \
    --data-urlencode grant_type=password --data-urlencode client_id=admin-cli \
    --data-urlencode username=admin --data-urlencode "password=${pass}" \
    | python3 -c 'import json,sys; print(json.load(sys.stdin).get("access_token",""))')
  [ -n "$token" ] || { err "no Keycloak admin token"; return 1; }
  printf '%s' "$token"
}

# set_keycloak_secret <value>: the client's secret in Keycloak, set rather than
# regenerated. The representation goes through a pipe, never a file.
set_keycloak_secret() {
  local master uuid code
  master=$(kc_master) || return 1
  uuid=$(curl -sS --max-time 30 -H "Authorization: Bearer ${master}" \
    "${KC}/admin/realms/edcv/clients?clientId=${CLIENT_ID}" \
    | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d[0]["id"] if d else "")')
  [ -n "$uuid" ] || { err "no client '${CLIENT_ID}' in realm edcv"; return 1; }
  code=$(curl -sS --max-time 30 -H "Authorization: Bearer ${master}" \
    "${KC}/admin/realms/edcv/clients/${uuid}" |
    NEW_SECRET="$1" python3 -c 'import json,os,sys; r=json.load(sys.stdin); r["secret"]=os.environ["NEW_SECRET"]; json.dump(r, sys.stdout)' |
    curl -sS --max-time 30 -o /dev/null -w '%{http_code}' -X PUT \
      -H "Authorization: Bearer ${master}" -H "Content-Type: application/json" \
      --data-binary @- "${KC}/admin/realms/edcv/clients/${uuid}")
  [ "$code" = 204 ] || { err "Keycloak answered HTTP ${code} to the new secret"; return 1; }
}

if [ "$TO_KEYCLOAK" = true ]; then
  SECRET=$(kv_secret "$SECRET_NAME")
  [ -n "$SECRET" ] || exit 1
  set_keycloak_secret "$SECRET"
  accepted "$SECRET" || { err "Keycloak does not take the secret in Key Vault"; exit 1; }
  unset SECRET
  ok "Keycloak has the Key Vault secret for ${CLIENT_ID}"
  exit 0
fi

KV_URI="$(az keyvault show --name "$KEY_VAULT_NAME" --query properties.vaultUri -o tsv)"
IDENTITY_ID="$(az identity show --name "$IDENTITY_NAME" --resource-group "$RG" --query id -o tsv)"
REF="keyvaultref:${KV_URI%/}/secrets/${SECRET_NAME},identityref:${IDENTITY_ID}"

if [ "$ROTATE" = true ]; then
  SECRET=$(openssl rand -hex 24)
else
  MASTER=$(kc_master)
  UUID=$(curl -sS --max-time 30 -H "Authorization: Bearer ${MASTER}" \
    "${KC}/admin/realms/edcv/clients?clientId=${CLIENT_ID}" \
    | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d[0]["id"] if d else "")')
  [ -n "$UUID" ] || { err "no client '${CLIENT_ID}' in realm edcv"; exit 1; }
  SECRET=$(curl -sS --max-time 30 -H "Authorization: Bearer ${MASTER}" \
    "${KC}/admin/realms/edcv/clients/${UUID}/client-secret" \
    | python3 -c 'import json,sys; print(json.load(sys.stdin).get("value",""))')
  [ -n "$SECRET" ] || { err "could not read the ${CLIENT_ID} client secret"; exit 1; }
  [ "$SECRET" != "$DEFAULT_SECRET" ] || warn "Keycloak still has the public default; run with --rotate"
  unset MASTER
fi

# ── 2. Key Vault ────────────────────────────────────────────────────────────
az keyvault secret set --vault-name "$KEY_VAULT_NAME" --name "$SECRET_NAME" \
  --value "$SECRET" -o none
ok "${SECRET_NAME} in ${KEY_VAULT_NAME} (${#SECRET} chars, not displayed)"

# ── 3. mvhd-ui ──────────────────────────────────────────────────────────────
# Before Keycloak: `containerapp update` returns once the new revision runs,
# so the sign-in gap is the seconds until step 4, not the whole rollout.
# KEYCLOAK_CLIENT_SECRET is what ui/src/lib/auth.ts reads; KEYCLOAK_SECRET
# was never read and goes.
REMOVE=()
ui_wiring | grep -q '^KEYCLOAK_SECRET ' && REMOVE=(--remove-env-vars KEYCLOAK_SECRET)
before=$(az containerapp show -n "$UI_APP" -g "$RG" --query properties.latestRevisionName -o tsv)
az containerapp identity assign --name "$UI_APP" --resource-group "$RG" \
  --user-assigned "$IDENTITY_ID" -o none
az containerapp secret set --name "$UI_APP" --resource-group "$RG" \
  --secrets "${SECRET_NAME}=${REF}" -o none
az containerapp update --name "$UI_APP" --resource-group "$RG" \
  --set-env-vars "KEYCLOAK_CLIENT_SECRET=secretref:${SECRET_NAME}" \
  ${REMOVE[@]+"${REMOVE[@]}"} -o none
after=$(az containerapp show -n "$UI_APP" -g "$RG" --query properties.latestRevisionName -o tsv)
if [ "$before" = "$after" ]; then
  # Already wired: the revision reads the vault when it starts, so restart it.
  az containerapp revision restart -n "$UI_APP" -g "$RG" --revision "$after" -o none
fi
for _ in $(seq 1 40); do
  state=$(az containerapp revision show -n "$UI_APP" -g "$RG" --revision "$after" \
    --query properties.healthState -o tsv)
  [ "$state" = Healthy ] && break
  sleep 15
done
[ "$state" = Healthy ] || { err "${UI_APP} ${after} is '${state}'; Keycloak left unchanged"; exit 1; }
ok "${UI_APP} reads KEYCLOAK_CLIENT_SECRET from Key Vault (${after})"

# ── 4. Keycloak takes it (--rotate) ─────────────────────────────────────────
# Set, not regenerated: the value is already in Key Vault and in the UI.
if [ "$ROTATE" = true ]; then
  set_keycloak_secret "$SECRET" ||
    { err "sign-in is down until Keycloak has it: $0 --to-keycloak"; exit 1; }
  ok "Keycloak has the new ${CLIENT_ID} secret"
fi

# ── 5. Check ────────────────────────────────────────────────────────────────
accepted "$SECRET" || { err "Keycloak does not take the secret in Key Vault"; exit 1; }
unset SECRET
ok "Keycloak takes the secret in Key Vault"
if accepted "$DEFAULT_SECRET"; then
  warn "the public default is still accepted; run with --rotate"
else
  ok "the public default is refused"
fi
echo "Sign in once at https://ehds.mabu.red to see the whole flow."
