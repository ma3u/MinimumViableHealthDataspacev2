#!/usr/bin/env bash
set -euo pipefail
# =============================================================================
# seed-siglet-key-mappings.sh: what siglet needs to renew an access token
# =============================================================================
# #888, #881 finding 23. siglet's access token lives one hour (fixed in 0.1.6,
# there is no setting). After that the consumer's siglet renews it at the
# provider's siglet (port 8082, /token) with a proof JWT: iss and sub are the
# consumer's DID, the signature comes from Vault's TRANSIT engine, and the key
# name and `kid` come from a "signing-key mapping" per participant context.
# The provider resolves the consumer's DID document and looks for `kid` there.
#
# Nothing created that mapping, so every renewal ended in
#   500 {"error":"Internal server error"}
#   "Failed to resolve signing key: no signing key mapping for participant context '<id>'"
# and a transfer was dead one hour after it started.
#
# IdentityHub keeps a participant's key in Vault's KV store, where siglet
# cannot sign with it. So each participant context gets a second key that
# never leaves Vault, and IdentityHub publishes only its public half:
#
#   1. a transit key   <KEY_PREFIX>-<contextId>          (ed25519)
#   2. a key pair in IdentityHub from that public key, id <did>#siglet-<fp>,
#      so the DID document carries it as a verification method. Its usage is
#      sign_credentials only: IdentityHub then never picks it for an STS token
#      or a presentation, which it could not sign (the private key is not in
#      its vault).
#   3. the mapping in siglet {participantContextId, keyName, kid}
#
# <fp> is the first eight hex characters of the SHA-256 of the public key. A
# Vault that lost its transit keys therefore gets a new key AND a new kid on
# the next run, and the stale key pair is revoked, instead of a DID document
# that names a key nobody holds.
#
# siglet's `memory` backend (compose) keeps the mappings in the process: run
# this again after every restart of siglet. jad/seed-all.sh runs it as part of
# phase 1; scripts/check-siglet-token-renewal.sh proves a renewal.
#
#   ./scripts/seed-siglet-key-mappings.sh               every context in IdentityHub
#   ./scripts/seed-siglet-key-mappings.sh <ctx> [<ctx>] only these
#   ./scripts/seed-siglet-key-mappings.sh --check       read back, change nothing
#
# Env (defaults are the compose stack):
#   EDC_IDENTITY_URL       IdentityHub's Identity API
#   KEYCLOAK_URL, KEYCLOAK_REALM, EDC_CLIENT_ID, EDC_CLIENT_SECRET
#   VAULT_ADDR, VAULT_TOKEN, VAULT_TRANSIT_MOUNT
#   SIGLET_MANAGEMENT_URL  siglet's management API (port 8083)
#   NET_CONTAINER          a container with curl on the stack's network; siglet
#                          and the DID documents are reachable only from there.
#                          Empty when this script already runs inside the
#                          network (the Azure job).
#   DID_WEB_SCHEME         http, as siglet resolves with use_http_resolution
#   KEY_PREFIX             default siglet-proof
# =============================================================================

EDC_IDENTITY_URL="${EDC_IDENTITY_URL:-http://localhost:11005/api/identity}"
KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8080}"
KEYCLOAK_REALM="${KEYCLOAK_REALM:-edcv}"
EDC_CLIENT_ID="${EDC_CLIENT_ID:-admin}"
EDC_CLIENT_SECRET="${EDC_CLIENT_SECRET:-edc-v-admin-secret}"
VAULT_ADDR="${VAULT_ADDR:-http://localhost:8200}"
VAULT_TOKEN="${VAULT_TOKEN:-root}"
VAULT_TRANSIT_MOUNT="${VAULT_TRANSIT_MOUNT:-transit}"
SIGLET_MANAGEMENT_URL="${SIGLET_MANAGEMENT_URL:-http://siglet:8083}"
NET_CONTAINER="${NET_CONTAINER-health-dataspace-controlplane}"
DID_WEB_SCHEME="${DID_WEB_SCHEME:-http}"
KEY_PREFIX="${KEY_PREFIX:-siglet-proof}"

CHECK_ONLY=0
ONLY=()
for arg in "$@"; do
  case "$arg" in
    --check) CHECK_ONLY=1 ;;
    -h | --help) sed -n '3,55p' "$0"; exit 0 ;;
    *) ONLY+=("$arg") ;;
  esac
done

CYAN='\033[0;36m'; GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[0;33m'; NC='\033[0m'
log()  { echo -e "${CYAN}[siglet-keys]${NC} $*"; }
note() { echo -e "  ${YELLOW}=${NC} $*"; }
made() { echo -e "  ${GREEN}+${NC} $*"; }
bad()  { echo -e "  ${RED}x${NC} $*" >&2; }

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
BODY="${WORK}/body"

# Every call writes the body to $BODY and prints the status, so a caller can
# report both. A transport failure prints 000 instead of ending the script.
http() { # http <method> <url> [json] [header]...
  local method="$1" url="$2" json="${3:-}"
  shift; shift; [ "$#" -gt 0 ] && shift
  local args=(-sS --max-time 30 -o "$BODY" -w '%{http_code}' -X "$method" "$url")
  local h
  for h in "$@"; do args+=(-H "$h"); done
  if [ -n "$json" ]; then args+=(-H "Content-Type: application/json" --data-binary "$json"); fi
  : >"$BODY"
  curl "${args[@]}" 2>/dev/null || printf '000'
}

# The same from inside the stack's network. docker exec has no file to write
# to on this side, so the status travels as the last line of the output.
net_http() { # net_http <method> <url> [json]
  local method="$1" url="$2" json="${3:-}" out
  if [ -z "$NET_CONTAINER" ]; then
    http "$method" "$url" "$json"
    return 0
  fi
  local args=(-sS --max-time 30 -w '\n%{http_code}' -X "$method" "$url")
  if [ -n "$json" ]; then args+=(-H "Content-Type: application/json" --data-binary "$json"); fi
  : >"$BODY"
  out=$(docker exec "$NET_CONTAINER" curl "${args[@]}" 2>/dev/null) || { printf '000'; return 0; }
  printf '%s' "${out%$'\n'*}" >"$BODY"
  printf '%s' "${out##*$'\n'}"
}

body_head() { head -c 300 "$BODY" 2>/dev/null | tr '\n' ' '; }

vault() { # vault <method> <path under /v1> [json]
  http "$1" "${VAULT_ADDR%/}/v1/$2" "${3:-}" "X-Vault-Token: ${VAULT_TOKEN}"
}

# siglet takes a context id and a key name only from [A-Za-z0-9._:@~-]
# (facet-core util/path.rs); a Vault key name is narrower still.
plain_id() { [[ "$1" =~ ^[A-Za-z0-9._-]+$ ]]; }

# did:web:<host>[:<path>...] -> the URL of its did.json, as siglet builds it
# (facet-core jwt/did.rs): %3A in the host is the port's colon.
did_url() {
  python3 - "$1" "$DID_WEB_SCHEME" <<'PY'
import sys
did, scheme = sys.argv[1], sys.argv[2]
parts = did[len("did:web:"):].split(":")
host = parts[0].replace("%3A", ":").replace("%3a", ":")
tail = "/".join(parts[1:])
print(f"{scheme}://{host}/{tail}/did.json" if tail else f"{scheme}://{host}/.well-known/did.json")
PY
}

# The transit key's newest public key as the JWK member x; fails when the key
# is not ed25519, the only algorithm siglet signs and verifies with.
transit_x() { # reads $BODY (GET transit/keys/<name>)
  python3 - "$BODY" <<'PY'
import base64, json, sys
data = json.load(open(sys.argv[1])).get("data") or {}
if data.get("type") != "ed25519":
    sys.exit(f"transit key type is {data.get('type')!r}, siglet needs ed25519")
raw = base64.b64decode(data["keys"][str(data["latest_version"])]["public_key"])
print(base64.urlsafe_b64encode(raw).rstrip(b"=").decode())
PY
}

fingerprint() { printf '%s' "$1" | python3 -c "import hashlib,sys; print(hashlib.sha256(sys.stdin.buffer.read()).hexdigest()[:8])"; }

# ── Who is there ─────────────────────────────────────────────────────────────
IH_TOKEN=$(curl -sS --max-time 20 -X POST \
  "${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token" \
  --data-urlencode "grant_type=client_credentials" \
  --data-urlencode "client_id=${EDC_CLIENT_ID}" \
  --data-urlencode "client_secret=${EDC_CLIENT_SECRET}" 2>/dev/null \
  | python3 -c "import json,sys; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null || true)
if [ -z "$IH_TOKEN" ]; then
  echo -e "${RED}FAIL${NC}: no token for ${EDC_CLIENT_ID} from ${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}" >&2
  exit 1
fi
ih() { http "$1" "${EDC_IDENTITY_URL%/}$2" "${3:-}" "Authorization: Bearer ${IH_TOKEN}"; }

status=$(ih GET "/v1/participants")
if [ "$status" != "200" ]; then
  echo -e "${RED}FAIL${NC}: IdentityHub listed no participants: HTTP ${status} $(body_head)" >&2
  exit 1
fi
# Lines "<contextId> <did>".
PAIRS=$(python3 - "$BODY" "${ONLY[@]+"${ONLY[@]}"}" <<'PY'
import json, sys
only = set(sys.argv[2:])
for p in json.load(open(sys.argv[1])):
    ctx, did = p.get("participantContextId") or "", p.get("did") or ""
    if ctx and did.startswith("did:web:") and (not only or ctx in only):
        print(ctx, did)
PY
)
if [ -z "$PAIRS" ]; then
  echo -e "${RED}FAIL${NC}: no participant context with a did:web to work on" >&2
  exit 1
fi

status=$(vault GET "sys/mounts/${VAULT_TRANSIT_MOUNT}/tune")
if [ "$status" != "200" ]; then
  if [ "$CHECK_ONLY" = "1" ]; then
    echo -e "${RED}FAIL${NC}: Vault has no transit engine at ${VAULT_TRANSIT_MOUNT}/ (HTTP ${status})" >&2
    exit 1
  fi
  # jad/bootstrap-vault.sh enables it for signing-siglet; a Vault that never
  # ran the bootstrap gets it here.
  status=$(vault POST "sys/mounts/${VAULT_TRANSIT_MOUNT}" '{"type":"transit"}')
  case "$status" in
    2??) made "transit engine enabled at ${VAULT_TRANSIT_MOUNT}/" ;;
    *) echo -e "${RED}FAIL${NC}: cannot enable the transit engine: HTTP ${status} $(body_head)" >&2; exit 1 ;;
  esac
fi

# ── One participant context ──────────────────────────────────────────────────
# Sets KID and KEY_NAME for the read-back. Returns 1 with the reason printed.
seed_one() {
  local ctx="$1" did="$2" status x fp
  KEY_NAME="${KEY_PREFIX}-${ctx}"
  KID=""

  # 1. the transit key
  status=$(vault GET "${VAULT_TRANSIT_MOUNT}/keys/${KEY_NAME}")
  if [ "$status" = "404" ]; then
    status=$(vault POST "${VAULT_TRANSIT_MOUNT}/keys/${KEY_NAME}" '{"type":"ed25519"}')
    case "$status" in
      2??) made "transit key ${KEY_NAME}" ;;
      *) bad "transit key ${KEY_NAME}: HTTP ${status} $(body_head)"; return 1 ;;
    esac
    status=$(vault GET "${VAULT_TRANSIT_MOUNT}/keys/${KEY_NAME}")
  else
    [ "$status" = "200" ] && note "transit key ${KEY_NAME} already there"
  fi
  if [ "$status" != "200" ]; then
    bad "transit key ${KEY_NAME} cannot be read: HTTP ${status} $(body_head)"; return 1
  fi
  x=$(transit_x) || { bad "transit key ${KEY_NAME}: unusable"; return 1; }
  fp=$(fingerprint "$x")
  KID="${did}#siglet-${fp}"

  # 2. its public half in IdentityHub, and so in the DID document
  status=$(ih GET "/v1/participants/${ctx}/keypairs")
  if [ "$status" != "200" ]; then
    bad "key pairs of ${ctx}: HTTP ${status} $(body_head)"; return 1
  fi
  local plan
  # "have" when the key pair is active; then one line "stale <id>" for every
  # other active siglet key pair of this DID.
  plan=$(python3 - "$BODY" "$KID" "${did}#siglet-" <<'PY'
import json, sys
pairs, kid, prefix = json.load(open(sys.argv[1])), sys.argv[2], sys.argv[3]
ACTIVE = 200
for k in pairs:
    key_id = k.get("keyId") or ""
    if key_id == kid:
        # A revoked key pair keeps its key id, and IdentityHub refuses the id a
        # second time: say so instead of trying.
        print("have" if k.get("state") == ACTIVE else f"dead {k.get('state')}")
    elif key_id.startswith(prefix) and k.get("state") == ACTIVE:
        print("stale", k.get("id"))
PY
)
  if grep -q '^dead ' <<<"$plan"; then
    bad "${KID} exists in IdentityHub but is not active (state $(grep '^dead ' <<<"$plan" | cut -d' ' -f2)); rotate the transit key (vault write -f ${VAULT_TRANSIT_MOUNT}/keys/${KEY_NAME}/rotate) and run again"
    return 1
  fi
  if grep -qx 'have' <<<"$plan"; then
    note "key pair ${KID} already in IdentityHub"
  else
    local descriptor
    descriptor=$(python3 - "$KID" "$KEY_NAME" "$x" <<'PY'
import json, sys
kid, key_name, x = sys.argv[1:4]
print(json.dumps({
    "keyId": kid,
    # Where the private key is, for a reader: IdentityHub never looks, because
    # it never signs with this key (usage below).
    "privateKeyAlias": f"transit-{key_name}",
    "active": True,
    "usage": ["sign_credentials"],
    "publicKeyJwk": {"kty": "OKP", "crv": "Ed25519", "x": x},
}))
PY
)
    status=$(ih PUT "/v1/participants/${ctx}/keypairs" "$descriptor")
    case "$status" in
      2??) made "key pair ${KID} in IdentityHub" ;;
      *) bad "key pair ${KID}: HTTP ${status} $(body_head)"; return 1 ;;
    esac
  fi
  local stale_id
  while read -r _ stale_id; do
    [ -n "$stale_id" ] || continue
    status=$(ih POST "/v1/participants/${ctx}/keypairs/${stale_id}/revoke")
    case "$status" in
      2??) made "revoked the stale siglet key pair ${stale_id}" ;;
      *) bad "stale key pair ${stale_id} not revoked: HTTP ${status} $(body_head)"; return 1 ;;
    esac
  done < <(grep '^stale ' <<<"$plan" || true)

  # 3. the mapping in siglet
  local want
  want=$(python3 -c "import json,sys; print(json.dumps({'participantContextId': sys.argv[1], 'keyName': sys.argv[2], 'kid': sys.argv[3]}))" "$ctx" "$KEY_NAME" "$KID")
  status=$(net_http GET "${SIGLET_MANAGEMENT_URL%/}/key-mappings/${ctx}")
  case "$status" in
    200)
      if python3 -c "import json,sys; a=json.load(open(sys.argv[1])); b=json.loads(sys.argv[2]); sys.exit(0 if a==b else 1)" "$BODY" "$want" 2>/dev/null; then
        note "mapping for ${ctx} already in siglet"
      else
        status=$(net_http PUT "${SIGLET_MANAGEMENT_URL%/}/key-mappings/${ctx}" "$want")
        case "$status" in
          2??) made "mapping for ${ctx} updated in siglet" ;;
          *) bad "mapping for ${ctx} not updated: HTTP ${status} $(body_head)"; return 1 ;;
        esac
      fi ;;
    404)
      status=$(net_http POST "${SIGLET_MANAGEMENT_URL%/}/key-mappings" "$want")
      case "$status" in
        2??) made "mapping for ${ctx} in siglet" ;;
        *) bad "mapping for ${ctx} not created: HTTP ${status} $(body_head)"; return 1 ;;
      esac ;;
    *) bad "siglet's management API at ${SIGLET_MANAGEMENT_URL}: HTTP ${status} $(body_head)"; return 1 ;;
  esac
}

# ── Read back: what a renewal will meet ─────────────────────────────────────
# Asserts the outcome, not the calls above (ADR-031): the key siglet will sign
# with, the kid the provider will look up, and the document it will find it in.
check_one() {
  local ctx="$1" did="$2" status x kid key_name url
  key_name="${KEY_PREFIX}-${ctx}"

  status=$(vault GET "${VAULT_TRANSIT_MOUNT}/keys/${key_name}")
  if [ "$status" != "200" ]; then
    bad "${did}: no transit key ${key_name} (HTTP ${status})"; return 1
  fi
  x=$(transit_x) || { bad "${did}: transit key ${key_name} unusable"; return 1; }
  kid="${did}#siglet-$(fingerprint "$x")"

  status=$(net_http GET "${SIGLET_MANAGEMENT_URL%/}/key-mappings/${ctx}")
  if [ "$status" != "200" ]; then
    bad "${did}: siglet has no mapping for ${ctx} (HTTP ${status} $(body_head))"; return 1
  fi
  if ! python3 -c "import json,sys; m=json.load(open(sys.argv[1])); sys.exit(0 if (m.get('keyName'), m.get('kid')) == (sys.argv[2], sys.argv[3]) else 1)" "$BODY" "$key_name" "$kid" 2>/dev/null; then
    bad "${did}: siglet's mapping does not name ${key_name} and ${kid}: $(body_head)"; return 1
  fi

  url=$(did_url "$did")
  status=$(net_http GET "$url")
  if [ "$status" != "200" ]; then
    bad "${did}: ${url} answered HTTP ${status}"; return 1
  fi
  if ! python3 - "$BODY" "$kid" "$x" <<'PY'
import json, sys
doc, kid, x = json.load(open(sys.argv[1])), sys.argv[2], sys.argv[3]
vm = next((m for m in doc.get("verificationMethod") or [] if m.get("id") == kid), None)
if vm is None:
    sys.exit("the DID document has no such verification method")
if (vm.get("publicKeyJwk") or {}).get("x") != x:
    sys.exit("the DID document's key is not the transit key")
PY
  then
    bad "${did}: ${kid} does not resolve to the transit key in ${url}"; return 1
  fi
  echo -e "  ${GREEN}✓${NC} ${did}: transit ${key_name}, kid #${kid##*#} in the DID document, mapping in siglet"
}

failed=0; total=0
if [ "$CHECK_ONLY" = "0" ]; then
  log "transit key, IdentityHub key pair and siglet mapping per participant context"
  while read -r ctx did; do
    [ -n "$ctx" ] || continue
    echo "${did} (${ctx})"
    if ! plain_id "$ctx"; then
      bad "context id '${ctx}' cannot name a transit key; siglet would refuse it too"
      failed=$((failed + 1)); continue
    fi
    seed_one "$ctx" "$did" || failed=$((failed + 1))
  done <<<"$PAIRS"
fi

log "read back"
checked_bad=0
while read -r ctx did; do
  [ -n "$ctx" ] || continue
  total=$((total + 1))
  check_one "$ctx" "$did" || checked_bad=$((checked_bad + 1))
done <<<"$PAIRS"

if [ "$failed" -gt 0 ] || [ "$checked_bad" -gt 0 ]; then
  echo -e "${RED}FAIL${NC}: ${checked_bad} of ${total} participant context(s) cannot renew a token (${failed} step(s) failed)" >&2
  exit 1
fi
echo -e "${GREEN}OK${NC}: ${total} participant context(s) can sign a renewal proof the provider can verify"
