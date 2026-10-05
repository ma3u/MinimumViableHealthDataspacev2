#!/usr/bin/env bash
# Wires the sandbox accounts the Klarbefund app creates for itself (ADR-054)
# into a running realm, and on Azure into mvhd-ui.
#
# The realm file (jad/keycloak-realm.json) is imported only when the realm is
# created, so a running Keycloak gets the parts from here:
#
#   klarbefund-account     public client, password grant only
#   ehds-account-service   confidential client whose service account may
#                          create, find and delete users, nothing else
#   klarbefund-patients    group carrying the PATIENT role
#
# On Azure the service account's secret is regenerated, kept in Key Vault as
# keycloak-account-service-secret, and handed to mvhd-ui as a Key Vault
# reference (KEYCLOAK_ACCOUNT_SERVICE_SECRET). It is never printed.
#
#   ./scripts/azure/wire-klarbefund-accounts.sh            # Azure
#   ./scripts/azure/wire-klarbefund-accounts.sh --local    # compose stack, localhost:8080
#   ./scripts/azure/wire-klarbefund-accounts.sh --check    # report, change nothing
#   ./scripts/azure/wire-klarbefund-accounts.sh --wire-only  # CI: only the mvhd-ui reference
#
# A maintainer with Container Apps Contributor cannot put a Key Vault
# reference on mvhd-ui (it needs userAssignedIdentities/assign/action,
# 2026-10-04), so that last step also runs as the CI identity:
# .github/workflows/wire-klarbefund-accounts.yml, which calls --wire-only.
#
# Idempotent. Azure needs the Keycloak admin password (Key Vault), Key Vault
# Secrets Officer for the secret, and Container Apps Contributor on mvhd-ui.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

LOCAL=false
CHECK_ONLY=false
WIRE_ONLY=false
for arg in "$@"; do
  case "$arg" in
    --local) LOCAL=true ;;
    --check) CHECK_ONLY=true ;;
    --wire-only) WIRE_ONLY=true ;;
    *) echo "unknown argument: $arg" >&2; exit 64 ;;
  esac
done

REALM_FILE="$(cd ../.. && pwd)/jad/keycloak-realm.json"
SECRET_NAME="keycloak-account-service-secret"
SERVICE_ROLES='["manage-users","view-users","query-groups"]'

# The Key Vault reference on mvhd-ui. Wiring only: the secret is already in
# Key Vault, and the app resolves it through its managed identity.
wire_ui() {
  KV_URI="$(az keyvault show --name "$KEY_VAULT_NAME" --query properties.vaultUri -o tsv 2>/dev/null || true)"
  KV_URI="${KV_URI:-https://${KEY_VAULT_NAME}.vault.azure.net/}"
  IDENTITY_ID="$(az identity show --name "${DSP_TOKEN_IDENTITY:-id-mvhd-claude-federation}" \
    --resource-group "$RG" --query id -o tsv)"
  REF="keyvaultref:${KV_URI%/}/secrets/${SECRET_NAME},identityref:${IDENTITY_ID}"
  # Assigning needs Managed Identity Operator, which a maintainer may lack;
  # wire-dsp-catalog-token.sh has normally assigned it already.
  if ! az containerapp show --name "$UI_APP" --resource-group "$RG" \
      --query "identity.userAssignedIdentities" -o json | grep -qi "${IDENTITY_ID##*/}"; then
    az containerapp identity assign --name "$UI_APP" --resource-group "$RG" \
      --user-assigned "$IDENTITY_ID" -o none
  fi
  az containerapp secret set --name "$UI_APP" --resource-group "$RG" \
    --secrets "${SECRET_NAME}=${REF}" -o none
  az containerapp update --name "$UI_APP" --resource-group "$RG" \
    --set-env-vars "KEYCLOAK_ACCOUNT_SERVICE_SECRET=secretref:${SECRET_NAME}" -o none
  echo "    mvhd-ui reads KEYCLOAK_ACCOUNT_SERVICE_SECRET from Key Vault"
}

if [[ "$WIRE_ONLY" == "true" ]]; then
  # shellcheck source=env.sh
  source ./env.sh
  # No read of the secret here: the CI identity may not read this vault's
  # secrets (Forbidden, 2026-10-05), and need not. mvhd-ui's managed identity
  # resolves the reference; a missing secret shows as a failed revision.
  wire_ui
  exit 0
fi

if [[ "$LOCAL" == "true" ]]; then
  KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8080}"
  KC_ADMIN_USER="${KC_ADMIN_USER:-admin}"
  KC_PASSWORD="${KC_ADMIN_PASSWORD:-admin}"
else
  # shellcheck source=env.sh
  source ./env.sh
  eval "$(get_aca_fqdns)"
  KEYCLOAK_URL="https://auth.${CUSTOM_DOMAIN}"
  echo "==> Reading the admin password from Key Vault"
  KC_PASSWORD="$(kc_admin_password)"
  [[ -n "$KC_PASSWORD" ]] || { echo "could not read keycloak-admin-password" >&2; exit 1; }
fi
ADMIN="${KEYCLOAK_URL}/admin/realms/edcv"

echo "==> Keycloak at $KEYCLOAK_URL"
KC_TOKEN="$(curl -sf -X POST "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" \
  -d "client_id=admin-cli" -d "username=${KC_ADMIN_USER}" \
  --data-urlencode "password=${KC_PASSWORD}" -d "grant_type=password" | jq -r '.access_token // empty')"
unset KC_PASSWORD
[[ -n "$KC_TOKEN" ]] || { echo "admin login failed" >&2; exit 1; }
api() { curl -sf -H "Authorization: Bearer $KC_TOKEN" "$@"; }
status() { curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $KC_TOKEN" "$@"; }
client_id_of() { api "${ADMIN}/clients?clientId=$1" | jq -r '.[0].id // empty'; }

if [[ "$CHECK_ONLY" == "true" ]]; then
  rc=0
  for c in klarbefund-account ehds-account-service; do
    if [[ -n "$(client_id_of "$c")" ]]; then echo "$c exists"; else echo "$c is missing"; rc=1; fi
  done
  if [[ -n "$(api "${ADMIN}/groups?search=klarbefund-patients&exact=true" | jq -r '.[0].id // empty')" ]]; then
    echo "klarbefund-patients exists"
  else
    echo "klarbefund-patients is missing"; rc=1
  fi
  exit "$rc"
fi

# ---- the two clients, copied from the realm file ----
for c in klarbefund-account ehds-account-service; do
  JSON="$(jq -c --arg c "$c" '.clients[] | select(.clientId == $c)' "$REALM_FILE")"
  [[ -n "$JSON" ]] || { echo "$c is not in $REALM_FILE" >&2; exit 1; }
  # The file's secret is the compose stack's; a live realm gets its own below.
  [[ "$LOCAL" == "true" ]] || JSON="$(jq -c 'del(.secret)' <<<"$JSON")"
  ID="$(client_id_of "$c")"
  if [[ -z "$ID" ]]; then
    echo "==> Creating $c"
    CODE="$(status -X POST -H "Content-Type: application/json" "${ADMIN}/clients" -d "$JSON")"
    [[ "$CODE" == "201" ]] || { echo "create $c failed: HTTP $CODE" >&2; exit 1; }
  else
    echo "==> Updating $c"
    CODE="$(status -X PUT -H "Content-Type: application/json" "${ADMIN}/clients/${ID}" \
      -d "$(jq -c --arg id "$ID" '. + {id: $id}' <<<"$JSON")")"
    [[ "$CODE" == "204" ]] || { echo "update $c failed: HTTP $CODE" >&2; exit 1; }
  fi
done

# ---- the group that carries PATIENT ----
GROUP_ID="$(api "${ADMIN}/groups?search=klarbefund-patients&exact=true" | jq -r '.[0].id // empty')"
if [[ -z "$GROUP_ID" ]]; then
  echo "==> Creating the group klarbefund-patients"
  CODE="$(status -X POST -H "Content-Type: application/json" "${ADMIN}/groups" -d '{"name":"klarbefund-patients"}')"
  [[ "$CODE" == "201" ]] || { echo "create group failed: HTTP $CODE" >&2; exit 1; }
  GROUP_ID="$(api "${ADMIN}/groups?search=klarbefund-patients&exact=true" | jq -r '.[0].id // empty')"
fi
PATIENT_ROLE="$(api "${ADMIN}/roles/PATIENT")"
CODE="$(status -X POST -H "Content-Type: application/json" \
  "${ADMIN}/groups/${GROUP_ID}/role-mappings/realm" -d "[${PATIENT_ROLE}]")"
[[ "$CODE" == "204" ]] || { echo "PATIENT on the group failed: HTTP $CODE" >&2; exit 1; }
echo "    klarbefund-patients carries PATIENT"

# ---- the service account's roles: users, and nothing else ----
SVC_ID="$(client_id_of ehds-account-service)"
SVC_USER="$(api "${ADMIN}/clients/${SVC_ID}/service-account-user" | jq -r '.id')"
RM_ID="$(client_id_of realm-management)"
ROLES="$(api "${ADMIN}/clients/${RM_ID}/roles" | jq -c --argjson want "$SERVICE_ROLES" \
  '[.[] | select(.name as $n | $want | index($n))]')"
[[ "$(jq length <<<"$ROLES")" == "3" ]] || { echo "realm-management roles not found" >&2; exit 1; }
CODE="$(status -X POST -H "Content-Type: application/json" \
  "${ADMIN}/users/${SVC_USER}/role-mappings/clients/${RM_ID}" -d "$ROLES")"
[[ "$CODE" == "204" ]] || { echo "service account roles failed: HTTP $CODE" >&2; exit 1; }
echo "    ehds-account-service may manage, view and query users"

# ---- the secret ----
if [[ "$LOCAL" == "true" ]]; then
  SECRET="$(jq -r '.clients[] | select(.clientId == "ehds-account-service") | .secret' "$REALM_FILE")"
  echo "    compose: KEYCLOAK_ACCOUNT_SERVICE_SECRET is the realm file's development secret"
else
  echo "==> Regenerating the service account's secret into Key Vault"
  SECRET="$(api -X POST "${ADMIN}/clients/${SVC_ID}/client-secret" | jq -r '.value // empty')"
  [[ -n "$SECRET" ]] || { echo "could not regenerate the secret" >&2; exit 1; }
  az keyvault secret set --vault-name "$KEY_VAULT_NAME" --name "$SECRET_NAME" \
    --value "$SECRET" -o none
  echo "    kept in Key Vault as ${SECRET_NAME}"
  echo "    mvhd-ui reads it once the CI identity wires the reference:"
  echo "      gh workflow run wire-klarbefund-accounts.yml --ref main"
fi

# ---- prove it: the service account gets a token and may list users ----
echo "==> Signing in as the service account"
SVC_TOKEN="$(curl -sf -X POST "${KEYCLOAK_URL}/realms/edcv/protocol/openid-connect/token" \
  -d grant_type=client_credentials -d client_id=ehds-account-service \
  --data-urlencode "client_secret=${SECRET}" | jq -r '.access_token // empty')"
unset SECRET
[[ -n "$SVC_TOKEN" ]] || { echo "the service account cannot sign in" >&2; exit 1; }
CODE="$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $SVC_TOKEN" \
  "${ADMIN}/users?max=1")"
[[ "$CODE" == "200" ]] || { echo "the service account cannot list users: HTTP $CODE" >&2; exit 1; }
echo "    ok: the service account signs in and may list users"
