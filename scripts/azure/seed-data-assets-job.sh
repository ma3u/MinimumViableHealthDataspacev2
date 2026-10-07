#!/usr/bin/env bash
# Runs inside the Azure environment as the job of
# .github/workflows/edc-seed-data-assets.yml (#542); the EDC APIs are internal.
#   MODE=plan   list each participant context: state, assets, contract definitions
#   MODE=apply  run jad/seed-data-assets.sh (assets, policies, contract
#               definitions, one siglet data plane per context), then list
# Needs CP_HOST, KC_HOST, KC_CLIENT_SECRET, NEO4J_PROXY_URL,
# SIGLET_SIGNALING_URL and, for apply, jad/seed-data-assets.sh beside it.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MGMT="${CP_HOST}/api/mgmt/${MGMT_V:-v5beta}"
CTX='https://w3id.org/edc/connector/management/v2'

token() {
  curl -sf -X POST "${KC_HOST}/realms/edcv/protocol/openid-connect/token" \
    --data-urlencode grant_type=client_credentials --data-urlencode client_id=admin \
    --data-urlencode "client_secret=${KC_CLIENT_SECRET}" | jq -r '.access_token // empty'
}

# Data plane registration is a PUT with no listing on v5beta (405 on GET), so
# the list shows what makes an offer: assets and contract definitions.
count() {
  curl -s -X POST -H "Authorization: Bearer $1" -H "Content-Type: application/json" \
    -d "{\"@context\":[\"${CTX}\"],\"@type\":\"QuerySpec\",\"limit\":100}" \
    "${MGMT}/participants/$2/$3/request" |
    jq -r 'if type == "array" then length else "-" end' 2>/dev/null || echo "-"
}

list() {
  local t
  t=$(token); [ -n "$t" ] || { echo "no token from ${KC_HOST}" >&2; return 1; }
  echo "context                           state      assets  contracts  identity"
  curl -sf -H "Authorization: Bearer $t" "${MGMT}/participants" |
    jq -r '(if type == "array" then . else [.] end)[] | [."@id", (.state // "?"), (.identity // .participantId // "")] | @tsv' |
    while IFS=$'\t' read -r id state identity; do
      printf '%-33s %-10s %-7s %-10s %s\n' "$id" "$state" \
        "$(count "$t" "$id" assets)" "$(count "$t" "$id" contractdefinitions)" "$identity"
    done
}

case "${MODE:-plan}" in
  plan) list ;;
  apply)
    bash "${SCRIPT_DIR}/seed-data-assets.sh"
    echo
    list
    ;;
  *) echo "MODE must be plan or apply" >&2; exit 2 ;;
esac
