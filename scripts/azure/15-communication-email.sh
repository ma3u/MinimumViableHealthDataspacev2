#!/usr/bin/env bash
set -euo pipefail
# =============================================================================
# Phase 15: the hub can send mail (ADR-048)
#
# RETIRED by ADR-050: the start page links to a public TestFlight group, and no
# route sends mail any more. Kept for the record and for removing what it made.
# =============================================================================
# The start page's Klarbefund TestFlight form posts to /api/testflight-request,
# which mails the request through Azure Communication Services Email. This
# phase creates what that needs and wires it into mvhd-ui the way ADR-036 keeps
# operator secrets: the connection string once, in Key Vault, read by the app
# through a managed identity.
#
#   Email Communication Service  mvhd-email, data in Europe
#   email domain                 AzureManagedDomain (DoNotReply@<guid>.azurecomm.net,
#                                no DNS work, low sending limits)
#   Communication Service        mvhd-acs, data in Europe, linked to the domain
#   Key Vault secret             acs-email-connection-string
#   mvhd-ui                      secret keyvaultref, env ACS_EMAIL_CONNECTION_STRING,
#                                ACS_EMAIL_SENDER, TESTFLIGHT_REQUEST_TO
#
# Usage:
#   scripts/azure/15-communication-email.sh          # create (idempotent) and wire
#   scripts/azure/15-communication-email.sh --rotate # also replace the stored
#                                                    # connection string with the
#                                                    # current primary key's
#
# Never prints the connection string. Needs Microsoft.Communication registered
# (it can be, unlike the providers in ADR-018), Key Vault Secrets Officer and
# Container Apps Contributor.
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/azure/env.sh
source "$SCRIPT_DIR/env.sh"

ROTATE=false
[ "${1:-}" = "--rotate" ] && ROTATE=true

EMAIL_SERVICE="${ACS_EMAIL_SERVICE:-mvhd-email}"
ACS_NAME="${ACS_NAME:-mvhd-acs}"
DOMAIN="AzureManagedDomain"
DATA_LOCATION="Europe"
SECRET_NAME="acs-email-connection-string"
IDENTITY_NAME="${ACS_IDENTITY:-id-mvhd-claude-federation}"
# Already public in the form's mailto fallback (TestflightRequestForm.tsx).
REQUEST_TO="${TESTFLIGHT_REQUEST_TO:-matthias.buchhorn@web.de}"

log "resource provider Microsoft.Communication"
state="$(az provider show -n Microsoft.Communication --query registrationState -o tsv)"
if [ "$state" != "Registered" ]; then
  az provider register -n Microsoft.Communication --wait -o none
fi
ok "Microsoft.Communication registered"

log "email service ${EMAIL_SERVICE} and its Azure-managed domain"
if ! az communication email show -n "$EMAIL_SERVICE" -g "$RG" -o none 2>/dev/null; then
  az communication email create -n "$EMAIL_SERVICE" -g "$RG" \
    --location global --data-location "$DATA_LOCATION" -o none
fi
if ! az communication email domain show -n "$DOMAIN" --email-service-name "$EMAIL_SERVICE" \
     -g "$RG" -o none 2>/dev/null; then
  az communication email domain create -n "$DOMAIN" --email-service-name "$EMAIL_SERVICE" \
    -g "$RG" --location global --domain-management AzureManaged \
    --user-engmnt-tracking Disabled -o none
fi
DOMAIN_ID="$(az communication email domain show -n "$DOMAIN" \
  --email-service-name "$EMAIL_SERVICE" -g "$RG" --query id -o tsv)"
SENDER_DOMAIN="$(az communication email domain show -n "$DOMAIN" \
  --email-service-name "$EMAIL_SERVICE" -g "$RG" --query mailFromSenderDomain -o tsv)"
SENDER="DoNotReply@${SENDER_DOMAIN}"
ok "sender ${SENDER}"

log "communication service ${ACS_NAME}, linked to the domain"
if ! az communication show -n "$ACS_NAME" -g "$RG" -o none 2>/dev/null; then
  az communication create -n "$ACS_NAME" -g "$RG" \
    --location global --data-location "$DATA_LOCATION" -o none
fi
az communication update -n "$ACS_NAME" -g "$RG" \
  --linked-domains "[\"${DOMAIN_ID}\"]" -o none
ok "${ACS_NAME} sends from ${SENDER_DOMAIN}"

log "Key Vault secret ${SECRET_NAME}"
if [ "$ROTATE" = true ] || ! az keyvault secret show --vault-name "$KEY_VAULT_NAME" \
     --name "$SECRET_NAME" --query id -o none 2>/dev/null; then
  # Held in a variable that never reaches the terminal or the log.
  conn="$(az communication list-key -n "$ACS_NAME" -g "$RG" \
    --query primaryConnectionString -o tsv)"
  az keyvault secret set --vault-name "$KEY_VAULT_NAME" --name "$SECRET_NAME" \
    --value "$conn" -o none
  unset conn
  ok "stored ${SECRET_NAME} (not displayed)"
else
  ok "Key Vault already holds ${SECRET_NAME}; kept as it is"
fi

KV_URI="$(az keyvault show --name "$KEY_VAULT_NAME" --query properties.vaultUri -o tsv)"
SECRET_URL="${KV_URI%/}/secrets/${SECRET_NAME}"
IDENTITY_ID="$(az identity show --name "$IDENTITY_NAME" --resource-group "$RG" --query id -o tsv)"
REF="keyvaultref:${SECRET_URL},identityref:${IDENTITY_ID}"

log "${UI_APP}: identity, secret reference, env"
az containerapp identity assign --name "$UI_APP" --resource-group "$RG" \
  --user-assigned "$IDENTITY_ID" -o none
az containerapp secret set --name "$UI_APP" --resource-group "$RG" \
  --secrets "${SECRET_NAME}=${REF}" -o none
az containerapp update --name "$UI_APP" --resource-group "$RG" \
  --set-env-vars "ACS_EMAIL_CONNECTION_STRING=secretref:${SECRET_NAME}" \
                 "ACS_EMAIL_SENDER=${SENDER}" \
                 "TESTFLIGHT_REQUEST_TO=${REQUEST_TO}" -o none
ok "${UI_APP} mails TestFlight requests from ${SENDER}"
