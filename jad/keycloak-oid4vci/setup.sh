#!/usr/bin/env bash
#
# Provision the PatientIdentityCredential (SD-JWT VC, OpenID4VCI) in the `edcv` realm.
# Hackathon helper — see README.md. Requires Keycloak started with --features=oid4vc-vci.
#
# Usage:
#   KC_URL=http://localhost:8080 ADMIN_PASS=admin ./setup.sh
#
set -euo pipefail

KC_URL="${KC_URL:-http://localhost:8080}"
REALM="${REALM:-edcv}"
CLIENT="${CLIENT:-health-dataspace-ui}"
ADMIN_USER="${ADMIN_USER:-admin}"
ADMIN_PASS="${ADMIN_PASS:-admin}"
PATIENT_USER="${PATIENT_USER:-patient1}"
HERE="$(cd "$(dirname "$0")" && pwd)"

command -v jq >/dev/null 2>&1 || { echo "jq is required" >&2; exit 1; }
TMP="$(mktemp)"; trap 'rm -f "${TMP}"' EXIT

echo "→ obtaining admin token from ${KC_URL}"
TOKEN="$(curl -sf -X POST "${KC_URL}/realms/master/protocol/openid-connect/token" \
  -d "grant_type=password" -d "client_id=admin-cli" \
  -d "username=${ADMIN_USER}" -d "password=${ADMIN_PASS}" | jq -r '.access_token')"
if [ -z "${TOKEN}" ] || [ "${TOKEN}" = "null" ]; then
  echo "failed to get admin token" >&2; exit 1
fi

echo "→ adding ES256 (P-256) signing key provider"
curl -sf -X POST "${KC_URL}/admin/realms/${REALM}/components" \
  -H "Authorization: Bearer ${TOKEN}" -H "Content-Type: application/json" \
  --data @"${HERE}/ecdsa-key.component.json" \
  || echo "  (key provider may already exist — continuing)"

echo "→ setting pseudonym attribute on user ${PATIENT_USER}"
USER_ID="$(curl -sf "${KC_URL}/admin/realms/${REALM}/users?username=${PATIENT_USER}&exact=true" \
  -H "Authorization: Bearer ${TOKEN}" | jq -r '.[0].id')"
if [ -z "${USER_ID}" ] || [ "${USER_ID}" = "null" ]; then
  echo "user ${PATIENT_USER} not found" >&2; exit 1
fi
curl -sf -X PUT "${KC_URL}/admin/realms/${REALM}/users/${USER_ID}" \
  -H "Authorization: Bearer ${TOKEN}" -H "Content-Type: application/json" \
  -d '{"attributes":{"pseudonym":["PSN-7F3A21"]}}'

echo "→ creating PatientIdentityCredential client scope"
curl -sf -X POST "${KC_URL}/admin/realms/${REALM}/client-scopes" \
  -H "Authorization: Bearer ${TOKEN}" -H "Content-Type: application/json" \
  --data @"${HERE}/patient-identity-credential.scope.json" \
  || echo "  (scope may already exist — continuing)"

echo "→ attaching scope to client ${CLIENT} and enabling OID4VCI"
CID="$(curl -sf "${KC_URL}/admin/realms/${REALM}/clients?clientId=${CLIENT}" \
  -H "Authorization: Bearer ${TOKEN}" | jq -r '.[0].id')"
SID="$(curl -sf "${KC_URL}/admin/realms/${REALM}/client-scopes" \
  -H "Authorization: Bearer ${TOKEN}" \
  | jq -r '.[] | select(.name=="PatientIdentityCredential") | .id')"
if [ -z "${CID}" ] || [ "${CID}" = "null" ]; then
  echo "client ${CLIENT} not found" >&2; exit 1
fi
# Merge the OID4VCI toggle into the existing client (GET → patch → PUT) so we never
# blank the rest of the client representation. Verify the attribute key in the Admin
# Console (client → Advanced → "Enable OID4VCI") if your Keycloak build differs.
curl -sf "${KC_URL}/admin/realms/${REALM}/clients/${CID}" \
  -H "Authorization: Bearer ${TOKEN}" \
  | jq '.attributes = ((.attributes // {}) + {"oid4vci.enabled":"true"})' > "${TMP}"
curl -sf -X PUT "${KC_URL}/admin/realms/${REALM}/clients/${CID}" \
  -H "Authorization: Bearer ${TOKEN}" -H "Content-Type: application/json" \
  --data @"${TMP}"
if [ -n "${SID}" ] && [ "${SID}" != "null" ]; then
  curl -sf -X PUT "${KC_URL}/admin/realms/${REALM}/clients/${CID}/optional-client-scopes/${SID}" \
    -H "Authorization: Bearer ${TOKEN}" || true
fi

echo
echo "✅ Provisioned. Generate a credential offer (QR) for ${PATIENT_USER}:"
echo "   ${KC_URL}/realms/${REALM}/protocol/oid4vc/credential-offer-uri?credential_configuration_id=PatientIdentityCredential&type=qr-code&username=${PATIENT_USER}"
echo "   (send it with a user access token — see README.md step 5)"
