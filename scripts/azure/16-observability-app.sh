#!/usr/bin/env bash
# =============================================================================
# Phase 16: mvhd-observability, the Grafana of the live hub (ADR-045, #418).
# =============================================================================
# One Container App running the OpenTelemetry Collector, Loki, Tempo,
# Prometheus and Grafana (observability/azure/Dockerfile). Grafana is public
# and signs in through Keycloak only (realm edcv, client mvhd-grafana); the
# collector's OTLP port 4318 is internal to the environment.
#
#   16-observability-app.sh               build the image, wire Keycloak, create or update the app
#   16-observability-app.sh --wire-proxy  point mvhd-neo4j-proxy's traces and logs at it
#                                         (needs a proxy image with OTLP logs, #418)
#   16-observability-app.sh --bind-domain bind grafana.<custom domain> once its DNS records exist
#   16-observability-app.sh --check       report, change nothing
#
# Secrets: the Keycloak client secret and the Grafana admin password are
# generated here, set in Keycloak and as ACA secrets, and never printed. Each
# full run rotates both. Nobody signs in as the Grafana admin; it exists for
# the API only, the login form is off.
#
# Data lives in the replica: a restart, and the nightly stop (ADR-053), empty
# Loki, Tempo and Prometheus. Log Analytics keeps the stdout copy as before.
# Azure Blob for Loki and Tempo is the next step in #418.
#
# Needs: az (logged in to INF-STG-EU_EHDS, rights on rg-mvhd-dev and the ACR),
# jq, openssl, curl.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
# shellcheck source=env.sh
source "${SCRIPT_DIR}/env.sh"
eval "$(get_aca_fqdns)"

MODE="${1:-deploy}"
case "$MODE" in
  deploy | --wire-proxy | --bind-domain | --check) ;;
  *) sed -n '10,14p' "$0"; exit 64 ;;
esac

OBS_APP="mvhd-observability"
OTLP_PORT=4318
API_VERSION="2024-03-01"
KEYCLOAK_URL="https://auth.${CUSTOM_DOMAIN}"
GRAFANA_HOST="grafana.${CUSTOM_DOMAIN}"
ENV_DOMAIN="$(az containerapp env show --name "$ACA_ENV" --resource-group "$RG" \
  --query properties.defaultDomain -o tsv)"
APP_FQDN="${OBS_APP}.${ENV_DOMAIN}"

app_exists() {
  az containerapp show --name "$OBS_APP" --resource-group "$RG" --query name -o tsv >/dev/null 2>&1
}

# The URL people open: the custom domain once it is bound, the ACA name before.
root_url() {
  if az containerapp hostname list --name "$OBS_APP" --resource-group "$RG" \
    --query "[?name=='${GRAFANA_HOST}'].name" -o tsv 2>/dev/null | grep -q .; then
    echo "https://${GRAFANA_HOST}"
  else
    echo "https://${APP_FQDN}"
  fi
}

check() {
  if ! app_exists; then
    echo "$OBS_APP does not exist"
    return 1
  fi
  az containerapp show --name "$OBS_APP" --resource-group "$RG" --query "{
      image: properties.template.containers[0].image,
      running: properties.runningStatus,
      fqdn: properties.configuration.ingress.fqdn,
      internalPorts: properties.configuration.ingress.additionalPortMappings[].exposedPort}" -o json
  local url
  url="$(root_url)"
  echo "Grafana at $url"
  echo "  health:              $(curl -s -o /dev/null -w '%{http_code}' -m 20 "$url/api/health")"
  echo "  anonymous API:       $(curl -s -o /dev/null -w '%{http_code}' -m 20 "$url/api/search") (401 expected)"
  echo "  sign-in redirects to: $(curl -s -o /dev/null -w '%{redirect_url}' -m 20 "$url/login")"
  echo "mvhd-neo4j-proxy OTLP endpoint: $(az containerapp show --name "$NEO4J_PROXY_APP" \
    --resource-group "$RG" \
    --query "properties.template.containers[0].env[?name=='OTEL_EXPORTER_OTLP_ENDPOINT'].value | [0]" -o tsv)"
}

if [[ "$MODE" == "--check" ]]; then
  check
  exit $?
fi

# -----------------------------------------------------------------------------
if [[ "$MODE" == "--wire-proxy" ]]; then
  app_exists || { echo "$OBS_APP does not exist yet: run without arguments first" >&2; exit 1; }
  log "Pointing $NEO4J_PROXY_APP at http://${OBS_APP}:${OTLP_PORT}"
  # --set-env-vars merges, so the deploy workflow's variables stay.
  az containerapp update --name "$NEO4J_PROXY_APP" --resource-group "$RG" \
    --set-env-vars "OTEL_EXPORTER_OTLP_ENDPOINT=http://${OBS_APP}:${OTLP_PORT}" \
    "OTEL_SERVICE_NAME=neo4j-proxy" -o none
  "${SCRIPT_DIR}/retire-stale-revisions.sh" "$NEO4J_PROXY_APP" || warn "a stale proxy revision is still active"
  ok "$NEO4J_PROXY_APP exports traces and logs to $OBS_APP"
  exit 0
fi

# -----------------------------------------------------------------------------
if [[ "$MODE" == "--bind-domain" ]]; then
  app_exists || { echo "$OBS_APP does not exist yet: run without arguments first" >&2; exit 1; }
  VERIFY_ID="$(az containerapp show --name "$OBS_APP" --resource-group "$RG" \
    --query properties.customDomainVerificationId -o tsv)"
  cname="$(dig +short CNAME "$GRAFANA_HOST" @8.8.8.8 | head -1)"
  txt="$(dig +short TXT "asuid.${GRAFANA_HOST}" @8.8.8.8 | tr -d '"' | head -1)"
  if [[ "${cname%.}" != "$APP_FQDN" || "$txt" != "$VERIFY_ID" ]]; then
    echo "DNS is not there yet. Add at the DNS provider of ${CUSTOM_DOMAIN}:" >&2
    echo "  CNAME  ${GRAFANA_HOST}        -> ${APP_FQDN}   (now: ${cname:-none})" >&2
    echo "  TXT    asuid.${GRAFANA_HOST}  -> ${VERIFY_ID}" >&2
    exit 1
  fi
  log "Binding $GRAFANA_HOST with a managed certificate"
  az containerapp hostname add --name "$OBS_APP" --resource-group "$RG" \
    --hostname "$GRAFANA_HOST" -o none
  az containerapp hostname bind --name "$OBS_APP" --resource-group "$RG" \
    --hostname "$GRAFANA_HOST" --environment "$ACA_ENV" --validation-method CNAME -o none
  az containerapp update --name "$OBS_APP" --resource-group "$RG" \
    --set-env-vars "GF_SERVER_ROOT_URL=https://${GRAFANA_HOST}" -o none
  ok "Grafana at https://${GRAFANA_HOST}"
  exit 0
fi

# -----------------------------------------------------------------------------
# deploy
TAG="$(git -C "$REPO_ROOT" rev-parse --short HEAD)"
IMAGE="${ACR_LOGIN_SERVER}/${OBS_APP}:${TAG}"

log "Building $IMAGE in $ACR_NAME"
az acr build --registry "$ACR_NAME" --image "${OBS_APP}:${TAG}" \
  --file "${REPO_ROOT}/observability/azure/Dockerfile" "${REPO_ROOT}/observability" \
  --no-logs -o none
ok "image built"

OAUTH_SECRET="$(openssl rand -hex 32)"
ADMIN_PASSWORD="$(openssl rand -hex 24)"
# Kept in Key Vault too, so the API admin can be looked up, never printed.
az keyvault secret set --vault-name "$KEY_VAULT_NAME" --name grafana-admin-password \
  --value "$ADMIN_PASSWORD" -o none ||
  warn "could not write grafana-admin-password to $KEY_VAULT_NAME (needs Key Vault Secrets Officer)"

log "Keycloak client mvhd-grafana at $KEYCLOAK_URL"
KC_PASSWORD="$(kc_admin_password)"
[[ -n "$KC_PASSWORD" ]] || { echo "could not read keycloak-admin-password" >&2; exit 1; }
KC_TOKEN="$(curl -sf -X POST "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" \
  -d client_id=admin-cli -d username=admin --data-urlencode "password=${KC_PASSWORD}" \
  -d grant_type=password | jq -r '.access_token // empty')"
[[ -n "$KC_TOKEN" ]] || { echo "Keycloak admin login failed" >&2; exit 1; }
# The realm file's client, with this run's secret and the https addresses only.
CLIENT_JSON="$(jq -c --arg secret "$OAUTH_SECRET" '
  .clients[] | select(.clientId == "mvhd-grafana")
  | .secret = $secret
  | .redirectUris |= map(select(startswith("https://")))
  | .webOrigins |= map(select(startswith("https://")))
  | .attributes["post.logout.redirect.uris"] |= (split("##") | map(select(startswith("https://"))) | join("##"))
' "${REPO_ROOT}/jad/keycloak-realm.json")"
[[ -n "$CLIENT_JSON" ]] || { echo "mvhd-grafana is not in jad/keycloak-realm.json" >&2; exit 1; }
EXISTING="$(curl -sf -H "Authorization: Bearer $KC_TOKEN" \
  "${KEYCLOAK_URL}/admin/realms/edcv/clients?clientId=mvhd-grafana" | jq -r '.[0].id // empty')"
if [[ -z "$EXISTING" ]]; then
  code="$(curl -s -o /dev/null -w '%{http_code}' -X POST -H "Authorization: Bearer $KC_TOKEN" \
    -H "Content-Type: application/json" "${KEYCLOAK_URL}/admin/realms/edcv/clients" -d "$CLIENT_JSON")"
  [[ "$code" == "201" ]] || { echo "client create failed: HTTP $code" >&2; exit 1; }
else
  code="$(curl -s -o /dev/null -w '%{http_code}' -X PUT -H "Authorization: Bearer $KC_TOKEN" \
    -H "Content-Type: application/json" "${KEYCLOAK_URL}/admin/realms/edcv/clients/${EXISTING}" \
    -d "$(jq -c --arg id "$EXISTING" '. + {id: $id}' <<<"$CLIENT_JSON")")"
  [[ "$code" == "204" ]] || { echo "client update failed: HTTP $code" >&2; exit 1; }
fi
ok "Keycloak client mvhd-grafana"

ENV_VARS=(
  "GF_SERVER_ROOT_URL=$(app_exists && root_url || echo "https://${APP_FQDN}")"
  "GF_AUTH_GENERIC_OAUTH_AUTH_URL=${KEYCLOAK_URL}/realms/edcv/protocol/openid-connect/auth"
  "GF_AUTH_GENERIC_OAUTH_TOKEN_URL=${KEYCLOAK_URL}/realms/edcv/protocol/openid-connect/token"
  "GF_AUTH_GENERIC_OAUTH_API_URL=${KEYCLOAK_URL}/realms/edcv/protocol/openid-connect/userinfo"
  "GF_AUTH_GENERIC_OAUTH_CLIENT_SECRET=secretref:grafana-oauth-secret"
  "GF_SECURITY_ADMIN_PASSWORD=secretref:grafana-admin-password"
  # The proxy's read-only audit endpoints, by app name inside the environment.
  "MVHD_AUDIT_URL=http://${NEO4J_PROXY_APP}"
)

if app_exists; then
  log "Updating $OBS_APP"
  az containerapp secret set --name "$OBS_APP" --resource-group "$RG" \
    --secrets "grafana-oauth-secret=${OAUTH_SECRET}" "grafana-admin-password=${ADMIN_PASSWORD}" -o none
  az containerapp update --name "$OBS_APP" --resource-group "$RG" --image "$IMAGE" \
    --set-env-vars "${ENV_VARS[@]}" -o none
else
  log "Creating $OBS_APP"
  ACR_PASSWORD="$(az acr credential show --name "$ACR_NAME" --query 'passwords[0].value' -o tsv)"
  az containerapp create --name "$OBS_APP" --resource-group "$RG" --environment "$ACA_ENV" \
    --image "$IMAGE" \
    --registry-server "$ACR_LOGIN_SERVER" --registry-username "$ACR_NAME" \
    --registry-password "$ACR_PASSWORD" \
    --cpu 1.0 --memory 2.0Gi --min-replicas 1 --max-replicas 1 \
    --ingress external --target-port 3000 --transport auto \
    --secrets "grafana-oauth-secret=${OAUTH_SECRET}" "grafana-admin-password=${ADMIN_PASSWORD}" \
    --env-vars "${ENV_VARS[@]}" -o none
fi
unset OAUTH_SECRET ADMIN_PASSWORD KC_PASSWORD KC_TOKEN

# The collector's OTLP/HTTP port, internal only: http://mvhd-observability:4318
# from any app in the environment (as configure-data-planes.sh does, #421).
log "Exposing OTLP port $OTLP_PORT inside the environment"
APP_ID="$(az containerapp show --name "$OBS_APP" --resource-group "$RG" --query id -o tsv)"
az rest --method PATCH \
  --url "https://management.azure.com${APP_ID}?api-version=${API_VERSION}" \
  --body "{\"properties\":{\"configuration\":{\"ingress\":{
    \"external\": true, \"targetPort\": 3000,
    \"additionalPortMappings\": [
      {\"targetPort\": ${OTLP_PORT}, \"exposedPort\": ${OTLP_PORT}, \"external\": false}
    ]}}}}" -o none
"${SCRIPT_DIR}/retire-stale-revisions.sh" "$OBS_APP" || warn "a stale $OBS_APP revision is still active"
ok "$OBS_APP: Grafana on 3000 (public, Keycloak), OTLP on ${OTLP_PORT} (internal)"

log "Waiting for Grafana"
for _ in $(seq 1 60); do
  [[ "$(curl -s -o /dev/null -w '%{http_code}' -m 10 "https://${APP_FQDN}/api/health")" == "200" ]] && break
  sleep 10
done
check
cat <<DNS

Next:
  1. DNS at the provider of ${CUSTOM_DOMAIN#*.} (record names relative to that zone), for https://${GRAFANA_HOST}:
       CNAME  ${GRAFANA_HOST%."${CUSTOM_DOMAIN#*.}"}         ${APP_FQDN}
       TXT    asuid.${GRAFANA_HOST%."${CUSTOM_DOMAIN#*.}"}   $(az containerapp show --name "$OBS_APP" --resource-group "$RG" --query properties.customDomainVerificationId -o tsv)
     then: $0 --bind-domain
  2. Once the proxy image with OTLP logs is deployed: $0 --wire-proxy
DNS
