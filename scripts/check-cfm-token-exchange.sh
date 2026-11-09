#!/usr/bin/env bash
set -euo pipefail
#
# Does Keycloak answer the token exchange the CFM agents send? (ADR-085 step 1, #973)
#
# The eclipse-cfm agents obtain every EDC API token by RFC 8693 exchange
# (cfm v0.0.7, common/tokenexchange/tokenprovider.go L120-L126). Upstream the
# exchange is jwtlet, which needs a Kubernetes API server. ADR-085 decision 2.1
# asks whether Keycloak, which the EDC 1.0 runtimes already trust, can take
# its place on Compose and Container Apps.
#
# This starts a throwaway Keycloak with the edcv realm plus a `cfm-agents`
# client (standard token exchange on), takes a client-credentials token as the
# subject token, and replays the agents' form twice:
#   1. exactly as CFM sends it (subject_token_type ...:token-type:jwt);
#   2. the same with subject_token_type ...:token-type:access_token.
# Client authentication goes as HTTP Basic, which Go's http.Client sends when
# tokenexchange.url carries user info, so the agents could pass it unchanged.
#
# Exit 0 when Keycloak accepts the request as CFM sends it, 1 when it refuses.
# Nothing it starts is left running; it touches no other container.
#
#   scripts/check-cfm-token-exchange.sh
#   DOCKER_CONTEXT=desktop-linux KC_PORT=18080 scripts/check-cfm-token-exchange.sh

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
KC_PORT="${KC_PORT:-18080}"
NAME="cfm-token-exchange-check"
CTX_ARGS=()
if [[ -n "${DOCKER_CONTEXT:-}" ]]; then
  CTX_ARGS=(--context "$DOCKER_CONTEXT")
fi
# The Keycloak the compose stack runs, so the check moves with it.
KC_IMAGE="${KC_IMAGE:-$(sed -n '/^  keycloak:/,/^  [a-z]/s/^ *image: *//p' "$REPO_ROOT/docker-compose.jad.yml" | head -1)}"
SECRET="$(openssl rand -hex 16)"
WORK="$(mktemp -d)"

cleanup() {
  docker "${CTX_ARGS[@]}" rm -f "$NAME" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

mkdir -p "$WORK/import"
python3 -I - "$REPO_ROOT/jad/keycloak-realm.json" "$WORK/import/edcv-realm.json" "$SECRET" <<'PY'
import copy, json, sys
src, dst, secret = sys.argv[1:4]
realm = json.load(open(src))
admin = next(c for c in realm["clients"] if c["clientId"] == "admin")
client = copy.deepcopy(admin)
client.pop("id", None)
client.update(clientId="cfm-agents", name="CFM agents (token exchange check)", secret=secret)
client.setdefault("attributes", {})["standard.token.exchange.enabled"] = "true"
for mapper in client.get("protocolMappers", []):
    mapper.pop("id", None)
client.setdefault("protocolMappers", []).append({
    "name": "audience-self", "protocol": "openid-connect",
    "protocolMapper": "oidc-audience-mapper",
    "config": {"included.client.audience": "cfm-agents", "access.token.claim": "true", "id.token.claim": "false"},
})
realm["clients"].append(client)
json.dump(realm, open(dst, "w"))
PY

echo "Keycloak ${KC_IMAGE} on localhost:${KC_PORT}"
docker "${CTX_ARGS[@]}" rm -f "$NAME" >/dev/null 2>&1 || true
docker "${CTX_ARGS[@]}" run -d --name "$NAME" -p "${KC_PORT}:8080" \
  -e KC_BOOTSTRAP_ADMIN_USERNAME=admin -e "KC_BOOTSTRAP_ADMIN_PASSWORD=${SECRET}" \
  -v "$WORK/import:/opt/keycloak/data/import:ro" \
  "$KC_IMAGE" start-dev --import-realm >/dev/null

BASE="http://localhost:${KC_PORT}/realms/edcv"
for _ in $(seq 1 80); do
  curl -sf -o /dev/null "$BASE/.well-known/openid-configuration" && break
  sleep 3
done
curl -sf -o /dev/null "$BASE/.well-known/openid-configuration" || {
  echo "Keycloak did not start" >&2
  exit 2
}

TOKEN_URL="$BASE/protocol/openid-connect/token"
SUBJECT="$(curl -sf -X POST "$TOKEN_URL" -d grant_type=client_credentials \
  -d client_id=cfm-agents --data-urlencode "client_secret=${SECRET}" |
  python3 -I -c 'import json,sys; print(json.load(sys.stdin)["access_token"])')"

# The fields and values of tokenprovider.go L120-L126; resource is the
# participant context, scope one the control plane client asks for.
exchange() {
  curl -s -o "$WORK/answer.json" -w '%{http_code}' -u "cfm-agents:${SECRET}" -X POST "$TOKEN_URL" \
    --data-urlencode "grant_type=urn:ietf:params:oauth:grant-type:token-exchange" \
    --data-urlencode "subject_token=${SUBJECT}" \
    --data-urlencode "subject_token_type=$1" \
    --data-urlencode "resource=check-participant-context" \
    --data-urlencode "scope=management-api:admin" \
    --data-urlencode "audience=cfm-agents"
}

describe() {
  python3 -I -c '
import base64, json, sys
answer = json.load(open(sys.argv[1]))
if "access_token" not in answer:
    print("  ", answer)
    sys.exit()
payload = answer["access_token"].split(".")[1]
claims = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
print("   issued", answer.get("issued_token_type"), {k: claims.get(k) for k in ("aud", "role", "scope")})
' "$WORK/answer.json"
}

echo
echo "1. As CFM sends it (subject_token_type ...:jwt):"
as_sent="$(exchange urn:ietf:params:oauth:token-type:jwt)"
echo "   HTTP ${as_sent}"
describe

echo
echo "2. With subject_token_type ...:access_token, all else the same:"
as_access="$(exchange urn:ietf:params:oauth:token-type:access_token)"
echo "   HTTP ${as_access}"
describe

echo
if [[ "$as_sent" == "200" ]]; then
  echo "Keycloak accepts the agents' exchange as sent."
  exit 0
fi
echo "Keycloak refuses the agents' exchange as sent (HTTP ${as_sent})."
exit 1
