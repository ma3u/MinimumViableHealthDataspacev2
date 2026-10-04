#!/usr/bin/env bash
# =============================================================================
# The FHIR and OMOP data planes get their own ports and register (#421)
# =============================================================================
#   ./scripts/azure/configure-data-planes.sh check   # read-only
#   ./scripts/azure/configure-data-planes.sh apply   # both data planes
#
# Until this script, mvhd-dp-fhir and mvhd-dp-omop had never booted on Azure.
# Phase 4 put the default, public and control web contexts on one port
# (11002, 11012), and EDC binds one context per port:
#
#   SEVERE Error booting runtime: A binding for port 11002 already exists
#
# They also lacked what makes a data plane useful to the control plane: no
# edc.dpf.selector.url to register at, no edc.hostname to register as, no
# selector types, no schema autocreate. docker-compose.jad.yml has all of it.
#
# After `apply` each data plane matches compose, laid out on the ingress the
# way the control plane is (04-edc-services.sh):
#
#                     FHIR    OMOP
#   web (health)      8080    8080   targetPort
#   control           8083    8083   additionalPortMappings, internal
#   public            11002   11012  additionalPortMappings, internal
#   certs             8186    8186   inside the replica only
#
# The control plane reaches a data plane at http://<app>:8083/api/control,
# which is what the data plane registers through edc.hostname.
#
# `apply` changes the ingress first (app scope, no new revision), then the
# environment, whose new revision boots with the ports already exposed.
#
# Needs: az, logged in to INF-STG-EU_EHDS with write access to rg-mvhd-dev.
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=env.sh
source "${SCRIPT_DIR}/env.sh"

API_VERSION="2024-03-01"
WEB_PORT=8080
CONTROL_PORT=8083
CERTS_PORT=8186

# app selector-name public-port transfer-type, as in docker-compose.jad.yml
DATA_PLANES="
${DP_FHIR_APP} FHIR 11002 HttpData-PUSH
${DP_OMOP_APP} OMOP 11012 HttpData-PULL
"

check_one() {
  local app="$1"
  echo "== $app"
  az containerapp show --name "$app" --resource-group "$RG" \
    --query "{targetPort: properties.configuration.ingress.targetPort, extraPorts: properties.configuration.ingress.additionalPortMappings[].exposedPort, latest: properties.latestRevisionName}" \
    -o json
  # Names and values of the web and selector settings; none is a secret.
  az containerapp show --name "$app" --resource-group "$RG" \
    --query "properties.template.containers[0].env[?starts_with(name, 'WEB_HTTP') || starts_with(name, 'EDC_DPF') || starts_with(name, 'EDC_HOSTNAME') || starts_with(name, 'EDC_DATAPLANE_SELECTOR')].[name, value]" \
    -o tsv | sed 's/^/  /'
  local latest
  latest=$(az containerapp show --name "$app" --resource-group "$RG" \
    --query "properties.latestRevisionName" -o tsv)
  az containerapp revision show --name "$app" --resource-group "$RG" \
    --revision "$latest" \
    --query "{health: properties.healthState, running: properties.runningState}" -o tsv |
    sed 's/^/  latest revision: /'
}

apply_one() {
  local app="$1" selector="$2" public_port="$3" transfer_type="$4"
  echo "== $app (public $public_port, $transfer_type)"

  local id
  id=$(az containerapp show --name "$app" --resource-group "$RG" --query id -o tsv)
  # JSON merge patch of the ingress only; secrets and template are untouched.
  az rest --method patch \
    --url "https://management.azure.com${id}?api-version=${API_VERSION}" \
    --body "{\"properties\":{\"configuration\":{\"ingress\":{
      \"targetPort\": ${WEB_PORT},
      \"additionalPortMappings\": [
        {\"targetPort\": ${CONTROL_PORT}, \"exposedPort\": ${CONTROL_PORT}, \"external\": false},
        {\"targetPort\": ${public_port}, \"exposedPort\": ${public_port}, \"external\": false}
      ]}}}}" \
    -o none
  ok "$app ingress: $WEB_PORT, $CONTROL_PORT, $public_port"

  az containerapp update --name "$app" --resource-group "$RG" \
    --set-env-vars \
      "EDC_HOSTNAME=${app}" \
      "EDC_PARTICIPANT_ID=did:web:connector" \
      "EDC_DPF_SELECTOR_URL=http://${CONTROLPLANE_APP}:${CONTROL_PORT}/api/control/v1/dataplanes" \
      "EDC_DATAPLANE_SELECTOR_${selector}_SOURCETYPE=HttpData" \
      "EDC_DATAPLANE_SELECTOR_${selector}_DESTINATIONTYPE=HttpData" \
      "EDC_DATAPLANE_SELECTOR_${selector}_TRANSFERTYPE=${transfer_type}" \
      "EDC_SQL_SCHEMA_AUTOCREATE=true" \
      "WEB_HTTP_PORT=${WEB_PORT}" \
      "WEB_HTTP_PATH=/api" \
      "WEB_HTTP_CONTROL_PORT=${CONTROL_PORT}" \
      "WEB_HTTP_CONTROL_PATH=/api/control" \
      "WEB_HTTP_PUBLIC_PORT=${public_port}" \
      "WEB_HTTP_PUBLIC_PATH=/api/public" \
      "WEB_HTTP_CERTS_PORT=${CERTS_PORT}" \
      "WEB_HTTP_CERTS_PATH=/api/data" \
    -o none
  ok "$app environment: distinct ports, registers at ${CONTROLPLANE_APP}"
}

case "${1:-}" in
  check)
    echo "$DATA_PLANES" | while read -r app _ _ _; do
      [ -n "$app" ] && check_one "$app"
    done
    ;;
  apply)
    echo "$DATA_PLANES" | while read -r app selector port transfer; do
      [ -n "$app" ] && apply_one "$app" "$selector" "$port" "$transfer"
    done
    echo
    echo "Give them two minutes, then:"
    echo "  $0 check"
    echo "  az containerapp logs show -n ${DP_FHIR_APP} -g ${RG} --tail 50"
    echo "The log should reach 'ready' with no 'binding for port' error."
    ;;
  *)
    echo "usage: $0 check|apply" >&2
    exit 2
    ;;
esac
