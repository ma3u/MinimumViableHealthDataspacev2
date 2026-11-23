#!/usr/bin/env bash
# The push data plane's registration for one participant context (ADR-095).
# Sourced by the seeds that register data planes; siglet's registration for
# HttpData-PULL stays where it is, beside the call to this.
#
#   register_push_dataplane <management url with version> <bearer token> <context id>
#
# Prints nothing; returns 0 when the control plane answered 2xx. The data
# plane's id carries the context id: the id is global, and the control plane
# accepts a callback for a transfer only from the id registered for its
# participant context.
#
# The authorization profile is what makes signaling authenticated both ways:
# the control plane calls the data plane with a token of this Keycloak client,
# and verifies the data plane's callbacks against jwksUri. The client secret
# here is the compose stack's; Azure passes its own.

PUSH_DATAPLANE_URL="${PUSH_DATAPLANE_URL:-http://dataplane:8090}"
PUSH_DATAPLANE_TOKEN_ENDPOINT="${PUSH_DATAPLANE_TOKEN_ENDPOINT:-http://keycloak:8080/realms/edcv/protocol/openid-connect/token}"
PUSH_DATAPLANE_CLIENT_ID="${PUSH_DATAPLANE_CLIENT_ID:-dataplane-signaling}"
PUSH_DATAPLANE_CLIENT_SECRET="${PUSH_DATAPLANE_CLIENT_SECRET:-dataplane-signaling-secret}"

push_dataplane_id() {
  printf 'mvhd-dp-%s' "$1"
}

register_push_dataplane() {
  local mgmt="$1" token="$2" ctx="$3" body code
  body=$(jq -nc \
    --arg id "$(push_dataplane_id "$ctx")" \
    --arg endpoint "${PUSH_DATAPLANE_URL}/api/v1/${ctx}/dataflows" \
    --arg tokenEndpoint "$PUSH_DATAPLANE_TOKEN_ENDPOINT" \
    --arg clientId "$PUSH_DATAPLANE_CLIENT_ID" \
    --arg clientSecret "$PUSH_DATAPLANE_CLIENT_SECRET" \
    --arg jwksUri "${PUSH_DATAPLANE_URL}/.well-known/jwks.json" \
    '{dataplaneId: $id, endpoint: $endpoint,
      profiles: ["HttpData-PUSH", "HttpStream-PUSH", "HttpFile-PUSH", "Kafka-PUSH", "Kafka-PULL"],
      authorization: {type: "oauth2_client_credentials", tokenEndpoint: $tokenEndpoint,
                      clientId: $clientId, clientSecret: $clientSecret, jwksUri: $jwksUri}}')
  # curl prints 000 itself when nothing answers
  code=$(curl -sS --max-time 30 -o /dev/null -w '%{http_code}' -X PUT "${mgmt}/participants/${ctx}/dataplanes" \
    -H "Authorization: Bearer ${token}" -H "Content-Type: application/json" -d "$body" 2>/dev/null) || code="000"
  case "$code" in
    2??) return 0 ;;
    *)
      echo "push data plane for ${ctx}: HTTP ${code}" >&2
      return 1
      ;;
  esac
}
