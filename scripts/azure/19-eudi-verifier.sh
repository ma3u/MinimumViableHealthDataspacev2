#!/usr/bin/env bash
set -euo pipefail
# =============================================================================
# mvhd-eudi-verifier: our own EUDI verifier, so d-you trusts the hub (#182 W1)
# =============================================================================
#   19-eudi-verifier.sh --upload-keystore <registration-certificate.jwt>
#                                    operator, once per certificate: puts the
#                                    keystore, its password, the client id and
#                                    the registration certificate in Key Vault
#   19-eudi-verifier.sh              create or update the app (idempotent)
#   19-eudi-verifier.sh --check      report, change nothing
#
# Decided in ADR-066:
#   - the image the EU runs at verifier-backend.eudiw.dev, pinned, signing
#     with the access certificate SPRIND issued for our CSR. Its key was made
#     on the maintainer's Mac and lives in Key Vault only
#     (eudi-rp-access-cert-key, and inside eudi-verifier-keystore);
#   - two containers in one replica. The gate (services/eudi-verifier) is the
#     only public side and passes /wallet/* alone; the verifier's /ui/* API,
#     which starts requests signed in our name, is an internal port (8080)
#     the hub calls as http://mvhd-eudi-verifier:8080;
#   - Key Vault holds the keystore base64-encoded (a secret is text); an init
#     container decodes it into an in-memory volume at every start, so no
#     image and no disk carries the key;
#   - one replica: the verifier keeps its transactions in memory;
#   - public on verifier.ehds.mabu.red. The client id is x509_hash: the
#     SPRIND registrar sets its own subject and puts no DNS name in the
#     access certificate (2026-10-28), so x509_san_dns is not an option.
#
# The hub keeps using the hosted EU verifier until EUDI_VERIFIER_BASE_URL is
# switched (deploy-azure.yml re-asserts it on every deploy), see the runbook
# docs/knowledge/runbooks/eudi-verifier-self-hosted.md.
#
# --upload-keystore needs Key Vault Secrets Officer; the rest needs Container
# Apps Contributor and the registry credentials. Never prints a secret.
# =============================================================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
# shellcheck source=scripts/azure/env.sh
source "$SCRIPT_DIR/env.sh"

MODE="${1:-apply}"
APP="${EUDI_VERIFIER_APP:-mvhd-eudi-verifier}"
HOST="${EUDI_VERIFIER_HOST:-verifier.${CUSTOM_DOMAIN}}"
IDENTITY_NAME="${EUDI_VERIFIER_IDENTITY:-id-mvhd-claude-federation}"
RP_DIR="${EUDI_RP_DIR:-${HOME}/.config/mvhd/eudi-rp}"
VERIFIER_IMAGE_SRC="ghcr.io/eu-digital-identity-wallet/eudi-srv-verifier-endpoint:v0.12.0"
VERIFIER_IMAGE="${ACR_LOGIN_SERVER}/eudi-srv-verifier-endpoint:v0.12.0"
GATE_TAG="$(git -C "$REPO_ROOT" log -1 --format=%h -- services/eudi-verifier)"
GATE_IMAGE="${ACR_LOGIN_SERVER}/mvhd-eudi-verifier-gate:${GATE_TAG}"
# The init container decodes the keystore as root into the shared volume.
INIT_IMAGE="${ACR_LOGIN_SERVER}/alpine:3.22.2"
INTENDED_USE_ID="ehds-patient-sign-in"
# Key Vault secret names; the app reads them through its identity.
KV_KEYSTORE="eudi-verifier-keystore"
KV_PASSWORD="eudi-verifier-keystore-password"
KV_CLIENT_ID="eudi-verifier-client-id"
KV_REG_CERT="eudi-verifier-registration-certificate"

report() {
  for s in "$KV_KEYSTORE" "$KV_PASSWORD" "$KV_CLIENT_ID" "$KV_REG_CERT"; do
    if az keyvault secret show --vault-name "$KEY_VAULT_NAME" --name "$s" --query id -o none 2>/dev/null; then
      echo "  present  Key Vault ${s}"
    else
      echo "  MISSING  Key Vault ${s} (or no right to see it)"
    fi
  done
  if az containerapp show --name "$APP" --resource-group "$RG" -o none 2>/dev/null; then
    az containerapp show --name "$APP" --resource-group "$RG" --query "{fqdn:properties.configuration.ingress.fqdn, \
      domains:properties.configuration.ingress.customDomains[].name, revision:properties.latestRevisionName}" -o json
  else
    echo "  MISSING  app ${APP}"
  fi
  echo "  gate     https://${HOST}/healthz -> $(curl -s -o /dev/null -w '%{http_code}' -m 10 "https://${HOST}/healthz" || echo none)"
  echo "  blocked  https://${HOST}/ui/presentations -> $(curl -s -o /dev/null -w '%{http_code}' -m 10 -X POST "https://${HOST}/ui/presentations" || echo none) (must be 404)"
}

upload_keystore() {
  local reg_cert="${1:-}"
  [[ -f "$reg_cert" ]] || { err "give the registration certificate (JWS) SPRIND issued"; exit 1; }
  [[ -f "${RP_DIR}/keystore.p12" && -f "${RP_DIR}/keystore.pass" ]] || {
    err "no keystore in ${RP_DIR}; run scripts/eudi/make-verifier-keystore.sh --real first"
    exit 1
  }
  # x509_hash: the base64url SHA-256 of the access certificate, read from the
  # keystore itself so the client id cannot drift from the key that signs.
  local client_id
  client_id="$(openssl pkcs12 -in "${RP_DIR}/keystore.p12" -passin "file:${RP_DIR}/keystore.pass" \
    -nokeys -clcerts 2>/dev/null | openssl x509 -outform DER | openssl dgst -sha256 -binary \
    | openssl base64 -A | tr '+/' '-_' | tr -d '=')"
  [[ -n "$client_id" ]] || { err "could not read the access certificate from the keystore"; exit 1; }

  local tmp
  tmp="$(mktemp)"
  trap 'rm -f "$tmp"' RETURN
  openssl base64 -A -in "${RP_DIR}/keystore.p12" >"$tmp"
  az keyvault secret set --vault-name "$KEY_VAULT_NAME" --name "$KV_KEYSTORE" --file "$tmp" \
    --content-type "application/x-pkcs12;base64" -o none
  az keyvault secret set --vault-name "$KEY_VAULT_NAME" --name "$KV_PASSWORD" \
    --file "${RP_DIR}/keystore.pass" -o none
  az keyvault secret set --vault-name "$KEY_VAULT_NAME" --name "$KV_CLIENT_ID" \
    --value "$client_id" -o none
  tr -d '\n' <"$reg_cert" >"$tmp"
  az keyvault secret set --vault-name "$KEY_VAULT_NAME" --name "$KV_REG_CERT" --file "$tmp" \
    --content-type "application/jwt" -o none
  ok "Key Vault ${KEY_VAULT_NAME}: ${KV_KEYSTORE}, ${KV_PASSWORD}, ${KV_CLIENT_ID}, ${KV_REG_CERT}"
  echo "  client_id x509_hash:${client_id}"
}

case "$MODE" in
  --check) report; exit 0 ;;
  --upload-keystore) shift; upload_keystore "$@"; exit 0 ;;
  apply) ;;
  *) sed -n '3,33p' "${BASH_SOURCE[0]}"; exit 2 ;;
esac

# ── 1. The images ───────────────────────────────────────────────────────────
if az acr repository show-tags --name "$ACR_NAME" --repository eudi-srv-verifier-endpoint -o tsv 2>/dev/null | grep -qx v0.12.0; then
  ok "${VERIFIER_IMAGE} already in ACR"
else
  az acr import --name "$ACR_NAME" --source "$VERIFIER_IMAGE_SRC" --image "eudi-srv-verifier-endpoint:v0.12.0" -o none
  ok "imported ${VERIFIER_IMAGE_SRC}"
fi
if az acr repository show-tags --name "$ACR_NAME" --repository alpine -o tsv 2>/dev/null | grep -qx 3.22.2; then
  ok "${INIT_IMAGE} already in ACR"
else
  az acr import --name "$ACR_NAME" --source docker.io/library/alpine:3.22.2 --image alpine:3.22.2 -o none
  ok "imported alpine:3.22.2"
fi
if az acr repository show-tags --name "$ACR_NAME" --repository mvhd-eudi-verifier-gate -o tsv 2>/dev/null | grep -qx "$GATE_TAG"; then
  ok "${GATE_IMAGE} already in ACR"
else
  az acr build --registry "$ACR_NAME" --image "mvhd-eudi-verifier-gate:${GATE_TAG}" \
    --platform linux/amd64 "${REPO_ROOT}/services/eudi-verifier" -o none
  ok "built ${GATE_IMAGE}"
fi

# ── 2. The app ──────────────────────────────────────────────────────────────
KV_URI="$(az keyvault show --name "$KEY_VAULT_NAME" --query properties.vaultUri -o tsv 2>/dev/null || true)"
KV_URI="${KV_URI:-https://${KEY_VAULT_NAME}.vault.azure.net/}"
IDENTITY_ID="$(az identity show --name "$IDENTITY_NAME" --resource-group "$RG" --query id -o tsv)"
ENV_ID="$(az containerapp env show --name "$ACA_ENV" --resource-group "$RG" --query id -o tsv)"
ACR_PASSWORD="$(az acr credential show --name "$ACR_NAME" --query 'passwords[0].value' -o tsv)"

SPEC="$(mktemp)"
trap 'rm -f "$SPEC"' EXIT
chmod 600 "$SPEC"
kv() { printf '%s' "${KV_URI%/}/secrets/$1"; }
cat >"$SPEC" <<YAML
location: $(az group show --name "$RG" --query location -o tsv)
identity:
  type: UserAssigned
  userAssignedIdentities:
    ${IDENTITY_ID}: {}
properties:
  environmentId: ${ENV_ID}
  configuration:
    activeRevisionsMode: Single
    ingress:
      external: true
      targetPort: 8081
      transport: http
      allowInsecure: false
      additionalPortMappings:
        - external: false
          targetPort: 8080
          exposedPort: 8080
    registries:
      - server: ${ACR_LOGIN_SERVER}
        username: ${ACR_NAME}
        passwordSecretRef: acr-password
    secrets:
      - name: acr-password
        value: ${ACR_PASSWORD}
      - name: keystore
        keyVaultUrl: $(kv "$KV_KEYSTORE")
        identity: ${IDENTITY_ID}
      - name: keystore-password
        keyVaultUrl: $(kv "$KV_PASSWORD")
        identity: ${IDENTITY_ID}
      - name: client-id
        keyVaultUrl: $(kv "$KV_CLIENT_ID")
        identity: ${IDENTITY_ID}
      - name: registration-certificate
        keyVaultUrl: $(kv "$KV_REG_CERT")
        identity: ${IDENTITY_ID}
  template:
    scale:
      minReplicas: 1
      maxReplicas: 1
    volumes:
      - name: keystore-b64
        storageType: Secret
        secrets:
          - secretRef: keystore
            path: keystore.b64
      - name: keystore
        storageType: EmptyDir
    initContainers:
      - name: decode-keystore
        image: ${INIT_IMAGE}
        command: ["/bin/sh", "-c"]
        args: ["base64 -d /kv/keystore.b64 > /keystore/keystore.p12 && chmod 0444 /keystore/keystore.p12"]
        resources: { cpu: 0.25, memory: 0.5Gi }
        volumeMounts:
          - { volumeName: keystore-b64, mountPath: /kv }
          - { volumeName: keystore, mountPath: /keystore }
    containers:
      - name: verifier
        image: ${VERIFIER_IMAGE}
        resources: { cpu: 0.5, memory: 1Gi }
        volumeMounts:
          - { volumeName: keystore, mountPath: /keystore }
        env:
          - { name: VERIFIER_PUBLICURL, value: "https://${HOST}" }
          - { name: VERIFIER_CLIENTIDPREFIX, value: x509_hash }
          - { name: VERIFIER_ORIGINALCLIENTID, secretRef: client-id }
          - { name: VERIFIER_ACCESS_CERTIFICATE_SIGNING_ALGORITHM, value: ES256 }
          - { name: VERIFIER_ACCESS_CERTIFICATE_KEYSTORE, value: "file:///keystore/keystore.p12" }
          - { name: VERIFIER_ACCESS_CERTIFICATE_KEYSTORE_TYPE, value: pkcs12 }
          - { name: VERIFIER_ACCESS_CERTIFICATE_KEYSTORE_PASSWORD, secretRef: keystore-password }
          - { name: VERIFIER_ACCESS_CERTIFICATE_ALIAS, value: verifier }
          - { name: VERIFIER_ACCESS_CERTIFICATE_PASSWORD, secretRef: keystore-password }
          - { name: VERIFIER_DEFAULTHTTPRESPONSEMODE, value: DirectPostJwt }
          - { name: VERIFIER_ATTESTATIONCLASSIFICATIONS_PID_VCTS, value: "urn:eudi:pid:1,urn:eudi:pid:de:1" }
          - { name: VERIFIER_ATTESTATIONCLASSIFICATIONS_PID_DOCTYPES, value: eu.europa.ec.eudi.pid.1 }
          - { name: VERIFIER_INTENDEDUSES_0_ID, value: ${INTENDED_USE_ID} }
          - { name: VERIFIER_INTENDEDUSES_0_DESCRIPTION, value: "Sign in to the Health Dataspace patient portal" }
          - { name: VERIFIER_INTENDEDUSES_0_REGISTRATIONCERTIFICATE, secretRef: registration-certificate }
      - name: gate
        image: ${GATE_IMAGE}
        resources: { cpu: 0.25, memory: 0.5Gi }
        env:
          - { name: VERIFIER_UPSTREAM, value: "localhost:8080" }
        probes:
          - type: Readiness
            httpGet: { path: /healthz, port: 8081 }
YAML

if az containerapp show --name "$APP" --resource-group "$RG" -o none 2>/dev/null; then
  log "updating ${APP}"
  az containerapp update --name "$APP" --resource-group "$RG" --yaml "$SPEC" -o none
else
  log "creating ${APP}"
  az containerapp create --name "$APP" --resource-group "$RG" --yaml "$SPEC" -o none
fi
ok "${APP} applied"

# ── 3. The public name ──────────────────────────────────────────────────────
FQDN="$(az containerapp show --name "$APP" --resource-group "$RG" --query properties.configuration.ingress.fqdn -o tsv)"
VID="$(az containerapp show --name "$APP" --resource-group "$RG" --query properties.customDomainVerificationId -o tsv)"
if az containerapp hostname list --name "$APP" --resource-group "$RG" --query "[?name=='${HOST}'] | [0].name" -o tsv | grep -qx "$HOST"; then
  ok "${HOST} bound"
elif [[ "$(dig +short "$HOST" CNAME | sed 's/\.$//')" == "$FQDN" ]]; then
  az containerapp hostname add --name "$APP" --resource-group "$RG" --hostname "$HOST" -o none
  az containerapp hostname bind --name "$APP" --resource-group "$RG" --hostname "$HOST" \
    --environment "$ACA_ENV" --validation-method CNAME -o none
  ok "${HOST} bound with a managed certificate"
else
  warn "DNS for ${HOST} is not in place yet. Add these records, then run this script again:"
  echo "  asuid.${HOST}.  IN TXT    \"${VID}\""
  echo "  ${HOST}.        IN CNAME  ${FQDN}."
fi

echo
echo "The hub still uses the hosted EU verifier. To switch it, see"
echo "docs/knowledge/runbooks/eudi-verifier-self-hosted.md (EUDI_VERIFIER_BASE_URL=http://${APP}:8080,"
echo "EUDI_INTENDED_USE_ID=${INTENDED_USE_ID}, EUDI_PID_VCT=urn:eudi:pid:de:1)."
report
