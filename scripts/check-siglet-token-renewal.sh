#!/usr/bin/env bash
set -euo pipefail
# =============================================================================
# check-siglet-token-renewal.sh: a pull still works after the token's hour
# =============================================================================
# #888, #881 finding 23. Proves on a running stack that siglet renews an access
# token: PharmaCo Research AG starts a pull transfer from AlphaKlinik Berlin,
# reads its token, waits until that token has expired, reads the token again
# through siglet's token API and pulls with it. The second token must be a
# different one, must not be expired, and /dataspace/data must answer 200 with
# data.
#
# THIS TAKES ONE HOUR. siglet 0.1.6 has no setting for the token's lifetime:
# JwtTokenManager is built without token_duration, so the builder's default of
# 3600 seconds applies (facet-core token/manager/mod.rs, siglet assembly/mod.rs
# create_token_manager), and [token] in the config knows only issuer,
# refresh_endpoint, server_secret and refresh_endpoint_policy. Nothing is
# changed on siglet for this check, so there is nothing to restore afterwards.
#
# The wait survives an interruption: the flow and a hash of the first token
# are kept in STATE_FILE, and a second run picks the wait up where it stood.
# siglet's memory backend does not survive a restart of siglet though: a
# restart in that hour loses the flow, and the check says so.
#
#   ./scripts/check-siglet-token-renewal.sh                  start, wait, verify
#   ./scripts/check-siglet-token-renewal.sh --show-failure   also show, at the
#        hour, what siglet answers WITHOUT the signing-key mapping (the state
#        before scripts/seed-siglet-key-mappings.sh), then put the mapping back
#   ./scripts/check-siglet-token-renewal.sh --start-only     start and return;
#        run it again later to verify
#
# Exit 0 only when the renewed token pulled data. Tokens are never printed:
# the first eight characters, a hash and the claims that are not secret.
#
# Env (defaults are the compose stack): KEYCLOAK_URL, EDC_MANAGEMENT_URL,
# SIGLET_URL, SIGLET_MANAGEMENT_URL, NET_CONTAINER, SIGLET_CONTAINER (for the
# log lines of --show-failure; empty skips them), CONSUMER_SLUG, ASSET_ID,
# STATE_FILE.
# =============================================================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/dsp-protocol.sh
source "${SCRIPT_DIR}/lib/dsp-protocol.sh"

KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8080}"
KEYCLOAK_REALM="${KEYCLOAK_REALM:-edcv}"
EDC_CLIENT_ID="${EDC_CLIENT_ID:-admin}"
EDC_CLIENT_SECRET="${EDC_CLIENT_SECRET:-edc-v-admin-secret}"
EDC_MANAGEMENT_URL="${EDC_MANAGEMENT_URL:-http://localhost:11003/api/mgmt}"
MGMT_V="${EDC_MGMT_API_VERSION:-v5}"
SIGLET_URL="${SIGLET_URL:-http://siglet:8080}"
SIGLET_MANAGEMENT_URL="${SIGLET_MANAGEMENT_URL:-http://siglet:8083}"
NET_CONTAINER="${NET_CONTAINER-health-dataspace-controlplane}"
SIGLET_CONTAINER="${SIGLET_CONTAINER-health-dataspace-siglet}"
CONSUMER_SLUG="${CONSUMER_SLUG:-pharmaco}"
ASSET_ID="${ASSET_ID:-fhir-patient-search}"
STATE_FILE="${STATE_FILE:-${TMPDIR:-/tmp}/siglet-token-renewal.state}"
EDC_CTX="https://w3id.org/edc/connector/management/v2"

SHOW_FAILURE=0; START_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --show-failure) SHOW_FAILURE=1 ;;
    --start-only) START_ONLY=1 ;;
    -h | --help) sed -n '3,40p' "$0"; exit 0 ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done

GREEN='\033[0;32m'; RED='\033[0;31m'; CYAN='\033[0;36m'; NC='\033[0m'
step() { echo -e "${CYAN}→${NC} $*"; }
ok()   { echo -e "${GREEN}✓${NC} $*"; }
die()  { echo -e "${RED}FAIL${NC}: $*" >&2; exit 1; }
# Epoch seconds as UTC; BSD date first (macOS), then GNU.
iso()  { date -u -r "$1" +%FT%TZ 2>/dev/null || date -u -d "@$1" +%FT%TZ; }

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

# GET from inside the stack's network: siglet and the proxy's data API are not
# published. Body to the file named, status on stdout, 000 when nothing answered.
net_get() { # net_get <file> <url> [bearer]
  local file="$1" url="$2" bearer="${3:-}" out
  local args=(-sS --max-time 60 -w '\n%{http_code}' "$url")
  if [ -n "$bearer" ]; then args+=(-H "Authorization: Bearer ${bearer}"); fi
  : >"$file"
  if [ -n "$NET_CONTAINER" ]; then
    out=$(docker exec "$NET_CONTAINER" curl "${args[@]}" 2>/dev/null) || { printf '000'; return 0; }
  else
    out=$(curl "${args[@]}" 2>/dev/null) || { printf '000'; return 0; }
  fi
  printf '%s' "${out%$'\n'*}" >"$file"
  printf '%s' "${out##*$'\n'}"
}

net_send() { # net_send <method> <url> [json] -> status
  local method="$1" url="$2" json="${3:-}"
  local args=(-sS --max-time 30 -o /dev/null -w '%{http_code}' -X "$method" "$url")
  if [ -n "$json" ]; then args+=(-H "Content-Type: application/json" --data-binary "$json"); fi
  if [ -n "$NET_CONTAINER" ]; then
    docker exec "$NET_CONTAINER" curl "${args[@]}" 2>/dev/null || printf '000'
  else
    curl "${args[@]}" 2>/dev/null || printf '000'
  fi
}

mgmt() { # mgmt <method> <path> [json] -> body on stdout
  local method="$1" path="$2" json="${3:-}" token
  token=$(curl -sS --max-time 20 -X POST \
    "${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token" \
    --data-urlencode "grant_type=client_credentials" \
    --data-urlencode "client_id=${EDC_CLIENT_ID}" \
    --data-urlencode "client_secret=${EDC_CLIENT_SECRET}" 2>/dev/null \
    | python3 -c "import json,sys; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null || true)
  [ -n "$token" ] || { echo "no token from ${KEYCLOAK_URL}" >&2; return 1; }
  local args=(-sS --max-time 30 -X "$method" "${EDC_MANAGEMENT_URL%/}/${MGMT_V}/${path}"
    -H "Authorization: Bearer ${token}" -H "Content-Type: application/json")
  if [ -n "$json" ]; then args+=(--data-binary "$json"); fi
  curl "${args[@]}"
}

# What may be shown of a token answer: "<sha256> <exp> <first8> <endpoint>".
# The token itself goes to the file named, for the pull that follows.
describe_token() { # describe_token <siglet answer file> <token file>
  python3 - "$1" "$2" <<'PY'
import base64, hashlib, json, sys
answer = json.load(open(sys.argv[1]))
token = answer.get("token") or ""
if token.count(".") != 2:
    sys.exit("siglet's answer carries no JWT")
payload = token.split(".")[1]
claims = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
open(sys.argv[2], "w").write(token)
print(hashlib.sha256(token.encode()).hexdigest(), claims["exp"], token[:8], answer.get("endpoint") or "-")
PY
}

# 200 with data: a FHIR Bundle with at least one entry, or any non-empty JSON.
count_data() { # count_data <file> -> a short description, or exit 1
  python3 - "$1" <<'PY'
import json, sys
body = json.load(open(sys.argv[1]))
if isinstance(body, dict) and body.get("resourceType") == "Bundle":
    n = len(body.get("entry") or [])
    if n == 0:
        sys.exit("the Bundle has no entry")
    print(f"FHIR Bundle, {n} entries")
elif body:
    print(f"JSON, {len(body)} top-level members")
else:
    sys.exit("the body is empty")
PY
}

pull() { # pull <label> <endpoint> <token file> -> 0 when 200 with data
  local label="$1" endpoint="$2" token status what
  token=$(cat "$3")
  status=$(net_get "${WORK}/data" "${endpoint}?_count=5" "$token")
  if [ "$status" != "200" ]; then
    echo "  ${label}: ${endpoint} answered HTTP ${status} $(head -c 200 "${WORK}/data" | tr '\n' ' ')" >&2
    return 1
  fi
  what=$(count_data "${WORK}/data") || { echo "  ${label}: 200 without data" >&2; return 1; }
  ok "${label}: ${endpoint} answered 200, ${what}"
}

# ── The consumer, and the mapping it needs ───────────────────────────────────
PARTICIPANTS=$(mgmt GET "participants") || die "the control plane lists no participants"
CONSUMER_CTX=$(printf '%s' "$PARTICIPANTS" | python3 -c "
import json, sys
slug = sys.argv[1]
print(next((p.get('@id', '') for p in json.load(sys.stdin) if (p.get('identity') or '').endswith(':' + slug)), ''))" "$CONSUMER_SLUG")
[ -n "$CONSUMER_CTX" ] || die "no participant context whose DID ends in :${CONSUMER_SLUG}"

step "the signing-key mapping of ${CONSUMER_SLUG} (${CONSUMER_CTX})"
"${SCRIPT_DIR}/seed-siglet-key-mappings.sh" --check "$CONSUMER_CTX" \
  || die "siglet cannot sign a renewal for ${CONSUMER_SLUG}; run scripts/seed-siglet-key-mappings.sh"

# ── The flow: resume a wait, or start a transfer ─────────────────────────────
FLOW=""; FIRST_SHA=""; FIRST_EXP=""
if [ -f "$STATE_FILE" ]; then
  read -r s_ctx s_flow s_sha s_exp <"$STATE_FILE" || true
  if [ "${s_ctx:-}" = "$CONSUMER_CTX" ] && [ -n "${s_flow:-}" ]; then
    status=$(net_get "${WORK}/answer" "${SIGLET_URL}/tokens/${CONSUMER_CTX}/${s_flow}")
    if [ "$status" = "404" ]; then
      echo "  ${STATE_FILE} names flow ${s_flow}, which siglet no longer knows (restarted?); starting a new one"
      rm -f "$STATE_FILE"
    else
      FLOW="$s_flow"; FIRST_SHA="$s_sha"; FIRST_EXP="$s_exp"
      step "resuming flow ${FLOW} from ${STATE_FILE}"
    fi
  fi
fi

if [ -z "$FLOW" ]; then
  step "an agreement of ${CONSUMER_SLUG} for ${ASSET_ID}"
  NEGOTIATIONS=$(mgmt POST "participants/${CONSUMER_CTX}/contractnegotiations/request" \
    "{\"@context\":[\"${EDC_CTX}\"],\"@type\":\"QuerySpec\",\"limit\":500}")
  read -r AGREEMENT PROVIDER_DSP PROVIDER_DID <<<"$(printf '%s' "$NEGOTIATIONS" | python3 -c "
import json, sys
rows = [n for n in json.load(sys.stdin)
        if n.get('state') == 'FINALIZED' and n.get('type') == 'CONSUMER'
        and n.get('assetId') == sys.argv[1] and n.get('contractAgreementId')]
rows.sort(key=lambda n: n.get('createdAt') or 0)
if rows:
    n = rows[-1]
    print(n['contractAgreementId'], n.get('counterPartyAddress', ''), n.get('counterPartyId', ''))" "$ASSET_ID")" || true
  [ -n "${AGREEMENT:-}" ] || die "${CONSUMER_SLUG} holds no agreement for ${ASSET_ID}; run ./jad/seed-all.sh --only 5"
  echo "  agreement ${AGREEMENT} with ${PROVIDER_DID}"

  step "a pull transfer"
  FLOW=$(mgmt POST "participants/${CONSUMER_CTX}/transferprocesses" "{
    \"@context\": [\"${EDC_CTX}\"],
    \"@type\": \"TransferRequest\",
    \"counterPartyAddress\": \"${PROVIDER_DSP}\",
    \"protocol\": \"${DSP_PROTOCOL}\",
    \"contractId\": \"${AGREEMENT}\",
    \"assetId\": \"${ASSET_ID}\",
    \"transferType\": \"HttpData-PULL\",
    \"dataDestination\": { \"@type\": \"DataAddress\", \"type\": \"HttpProxy\" }
  }" | python3 -c "import json,sys; print(json.load(sys.stdin).get('@id',''))" 2>/dev/null || true)
  [ -n "$FLOW" ] || die "the control plane started no transfer"
  state=""
  for _ in $(seq 1 30); do
    state=$(mgmt GET "participants/${CONSUMER_CTX}/transferprocesses/${FLOW}" \
      | python3 -c "import json,sys; print(json.load(sys.stdin).get('state',''))" 2>/dev/null || true)
    [ "$state" = "STARTED" ] && break
    [ "$state" = "TERMINATED" ] && break
    sleep 2
  done
  [ "$state" = "STARTED" ] || die "transfer ${FLOW} is ${state:-unknown}, not STARTED"
  ok "transfer ${FLOW} STARTED"

  status=$(net_get "${WORK}/answer" "${SIGLET_URL}/tokens/${CONSUMER_CTX}/${FLOW}")
  [ "$status" = "200" ] || die "siglet answered HTTP ${status} for the new flow: $(head -c 200 "${WORK}/answer")"
  # An empty line still reads successfully, so the check is on the value.
  read -r FIRST_SHA FIRST_EXP first8 ENDPOINT <<<"$(describe_token "${WORK}/answer" "${WORK}/token1" || true)" || true
  [ -n "${FIRST_EXP:-}" ] || die "siglet's first answer is not a token"
  echo "  first token ${first8}... sha256 ${FIRST_SHA:0:12}, expires $(iso "$FIRST_EXP") ($((FIRST_EXP - $(date +%s))) s from now)"
  pull "pull with the first token" "$ENDPOINT" "${WORK}/token1" || die "the first token did not pull data"
  printf '%s %s %s %s\n' "$CONSUMER_CTX" "$FLOW" "$FIRST_SHA" "$FIRST_EXP" >"$STATE_FILE"
fi

if [ "$START_ONLY" = "1" ]; then
  echo "started; run this script again after $(iso "$FIRST_EXP") to verify (state in ${STATE_FILE})"
  exit 0
fi

# ── Wait until the first token has expired ───────────────────────────────────
# Two seconds past exp: siglet renews from five seconds before it, and the
# claim is what a verifier goes by.
while :; do
  left=$((FIRST_EXP + 2 - $(date +%s)))
  [ "$left" -gt 0 ] || break
  echo "  $(date -u +%T) waiting ${left} s for the first token to expire"
  if [ "$left" -gt 300 ]; then sleep 300; else sleep "$left"; fi
done
ok "the first token expired at $(iso "$FIRST_EXP")"

# ── Optional: what the hub had before the mapping ────────────────────────────
if [ "$SHOW_FAILURE" = "1" ]; then
  step "without the signing-key mapping (the state before #888)"
  since=$(date -u +%FT%TZ)
  status=$(net_send DELETE "${SIGLET_MANAGEMENT_URL%/}/key-mappings/${CONSUMER_CTX}")
  [ "$status" = "204" ] || die "could not remove the mapping for the demonstration: HTTP ${status}"
  status=$(net_get "${WORK}/answer" "${SIGLET_URL}/tokens/${CONSUMER_CTX}/${FLOW}")
  echo "  siglet answers HTTP ${status} $(head -c 200 "${WORK}/answer")"
  if [ -n "$SIGLET_CONTAINER" ]; then
    docker logs --since "$since" "$SIGLET_CONTAINER" 2>&1 \
      | sed $'s/\x1b\\[[0-9;]*m//g' | grep -E 'ERROR|WARN' | sed 's/^/  siglet log: /' | head -5 || true
  fi
  "${SCRIPT_DIR}/seed-siglet-key-mappings.sh" "$CONSUMER_CTX" >/dev/null \
    || die "the mapping could not be put back; run scripts/seed-siglet-key-mappings.sh"
  ok "mapping put back"
  [ "$status" != "200" ] || die "siglet returned a token without a mapping; the first token had not expired"
fi

# ── The renewal ──────────────────────────────────────────────────────────────
step "the token again, through siglet's token API"
status=$(net_get "${WORK}/answer" "${SIGLET_URL}/tokens/${CONSUMER_CTX}/${FLOW}")
if [ "$status" != "200" ]; then
  if [ -n "$SIGLET_CONTAINER" ]; then
    docker logs --tail 5 "$SIGLET_CONTAINER" 2>&1 | sed $'s/\x1b\\[[0-9;]*m//g' | sed 's/^/  siglet log: /' >&2 || true
  fi
  die "siglet answered HTTP ${status} instead of a renewed token: $(head -c 200 "${WORK}/answer")"
fi
read -r second_sha second_exp second8 ENDPOINT <<<"$(describe_token "${WORK}/answer" "${WORK}/token2" || true)" || true
[ -n "${second_exp:-}" ] || die "siglet's second answer is not a token"
now=$(date +%s)
echo "  second token ${second8}... sha256 ${second_sha:0:12}, expires in $((second_exp - now)) s"
[ "$second_sha" != "$FIRST_SHA" ] || die "siglet returned the first token again (sha256 ${FIRST_SHA:0:12})"
[ "$second_exp" -gt "$now" ] || die "the second token is expired too"
ok "the two tokens differ, and the second is valid for $((second_exp - now)) s"

pull "pull with the renewed token" "$ENDPOINT" "${WORK}/token2" || die "the renewed token did not pull data"
rm -f "$STATE_FILE"
echo -e "${GREEN}OK${NC}: flow ${FLOW} of ${CONSUMER_SLUG} pulled data $((now - FIRST_EXP + 3600)) s after it started, with a token siglet renewed"
