#!/usr/bin/env bash
set -euo pipefail
#
# Seeds CFM 0.0.8 (compose profile `cfm`, ADR-085, #973). Idempotent.
#
#   1. the database `cfm_v007` (owner `cfm`) on an existing Postgres volume;
#   2. Keycloak: the client scopes the agents and managers ask for, and the
#      confidential client `cfm-agents` (role admin, standard token exchange);
#   3. the Provision Manager: the activity definitions and the deploy and
#      dispose orchestration of core-platform-distribution v0.0.39
#      (templates/hooks/provision-manager-seed-job.yaml), jwtlet step included
#      (it derives the participant context id the other agents need), and the
#      IdentityHub participant in the dispose too, which upstream leaves out;
#   4. the Tenant Manager: one cell and the EHDS dataspace profile with our
#      issuer's MembershipCredential, deployed to the cell.
#
# Needs the stack and the profile up:
#   docker compose -f docker-compose.yml -f docker-compose.jad.yml --profile cfm up -d
# For a stack in another Docker context, export DOCKER_CONTEXT (e.g. orbstack).

KC_URL="${KC_URL:-http://localhost:8080}"
KC_ADMIN_USER="${KC_ADMIN_USER:-admin}"
KC_ADMIN_PASSWORD="${KC_ADMIN_PASSWORD:-admin}"
CFM_CLIENT_SECRET="${CFM_AGENTS_CLIENT_SECRET:-cfm-agents-local-dev}"
TM_URL="${CFM_TM_URL:-http://localhost:18181}"
PM_URL="${CFM_PM_URL:-http://localhost:18182}"
PG_CONTAINER="${PG_CONTAINER:-health-dataspace-postgres}"
ISSUER_DID="${EDC_ISSUER_DID:-did:web:issuerservice%3A10016:issuer}"
ISSUER_API="${EDC_ISSUER_URL:-http://localhost:10013/api/admin}"
# The MembershipCredential's definition and format, read from the issuer below
# unless set. From IdentityHub 1.0.0-RC6 a definition takes the format of the
# issuer's DCP profile (VC2_0_JOSE, IdentityHub #1248), and the holder refuses
# a delivery in another format than it requested: the onboarding agent then
# waits on a request that stays REQUESTED (#1094). RC5 issued VC1_0_JWT.
CREDENTIAL_DEFINITION_ID="${CFM_CREDENTIAL_DEFINITION_ID:-}"
CREDENTIAL_FORMAT="${CFM_CREDENTIAL_FORMAT:-}"

say() { printf '%s\n' "$*"; }
die() {
  printf 'seed-cfm: %s\n' "$*" >&2
  exit 1
}

# --- 1. database -------------------------------------------------------------
if [[ "$(docker exec "$PG_CONTAINER" psql -U cp -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='cfm_v007'")" != "1" ]]; then
  docker exec "$PG_CONTAINER" psql -U cp -d postgres -qc "CREATE DATABASE cfm_v007 OWNER cfm" >/dev/null
  say "1. database cfm_v007 created"
else
  say "1. database cfm_v007 exists"
fi

# --- 2. Keycloak -------------------------------------------------------------
ADMIN_TOKEN="$(curl -sf -X POST "$KC_URL/realms/master/protocol/openid-connect/token" \
  -d grant_type=password -d client_id=admin-cli \
  --data-urlencode "username=$KC_ADMIN_USER" --data-urlencode "password=$KC_ADMIN_PASSWORD" |
  python3 -I -c 'import json,sys; print(json.load(sys.stdin)["access_token"])')" ||
  die "no Keycloak admin token from $KC_URL"
kc() { curl -sf -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' "$@"; }
REALM="$KC_URL/admin/realms/edcv"

# The scopes CFM asks for that the realm does not define yet: the agents'
# (cfm agent/common/*: identityhub L37-L38, siglet L32-L33, issuerservice
# L36-L38 since v0.0.8 (eclipse-cfm#234), jwtletagent agentScopes L82-L91)
# and the managers' (decision record 2026-06-01).
NEW_SCOPES=(identity-api:credentials:read identity-api:credentials:write
  issuer-admin-api:holders:write issuer-admin-api:credentials:read issuer-admin-api:credentials:write
  siglet-mgmt-api:read siglet-mgmt-api:write read write
  tenant-manager-api:read tenant-manager-api:write tenant-manager-api:admin
  provision-manager-api:read provision-manager-api:write provision-manager-api:admin)
existing_scopes="$(kc "$REALM/client-scopes" | python3 -I -c 'import json,sys; print("\n".join(s["name"] for s in json.load(sys.stdin)))')"
for scope in "${NEW_SCOPES[@]}"; do
  if ! grep -qxF "$scope" <<<"$existing_scopes"; then
    kc -X POST "$REALM/client-scopes" -d "{\"name\":\"$scope\",\"protocol\":\"openid-connect\",\"attributes\":{\"include.in.token.scope\":\"true\",\"display.on.consent.screen\":\"false\"}}" >/dev/null
  fi
done

client_uuid="$(kc "$REALM/clients?clientId=cfm-agents" | python3 -I -c 'import json,sys; c=json.load(sys.stdin); print(c[0]["id"] if c else "")')"
if [[ -z "$client_uuid" ]]; then
  kc -X POST "$REALM/clients" -d "$(python3 -I - "$CFM_CLIENT_SECRET" <<'PY'
import json, sys
print(json.dumps({
    "clientId": "cfm-agents",
    "name": "CFM 0.0.7 agents and managers (ADR-085)",
    "protocol": "openid-connect",
    "publicClient": False,
    "serviceAccountsEnabled": True,
    "standardFlowEnabled": False,
    "directAccessGrantsEnabled": False,
    "secret": sys.argv[1],
    "attributes": {"standard.token.exchange.enabled": "true"},
    "protocolMappers": [
        {"name": "role", "protocol": "openid-connect", "protocolMapper": "oidc-hardcoded-claim-mapper",
         "config": {"claim.name": "role", "claim.value": "admin", "jsonType.label": "String",
                    "access.token.claim": "true", "id.token.claim": "false", "userinfo.token.claim": "false"}},
        {"name": "audience-self", "protocol": "openid-connect", "protocolMapper": "oidc-audience-mapper",
         "config": {"included.client.audience": "cfm-agents", "access.token.claim": "true", "id.token.claim": "false"}},
    ],
}))
PY
)" >/dev/null
  client_uuid="$(kc "$REALM/clients?clientId=cfm-agents" | python3 -I -c 'import json,sys; print(json.load(sys.stdin)[0]["id"])')"
  say "2. Keycloak client cfm-agents created"
else
  say "2. Keycloak client cfm-agents exists"
fi
# Every API scope as a default scope of cfm-agents, the admin client's and the new ones.
scope_ids="$(kc "$REALM/client-scopes" | python3 -I -c '
import json, sys
want = {"management-api:admin","management-api:read","management-api:write","identity-api:admin",
        "identity-api:read","identity-api:write","issuer-admin-api:admin","issuer-admin-api:read",
        "issuer-admin-api:write"} | set(sys.argv[1:])
print("\n".join(s["id"] for s in json.load(sys.stdin) if s["name"] in want))' "${NEW_SCOPES[@]}")"
while read -r sid; do
  [[ -n "$sid" ]] && kc -X PUT "$REALM/clients/$client_uuid/default-client-scopes/$sid" >/dev/null
done <<<"$scope_ids"

TOKEN="$(curl -sf -X POST "$KC_URL/realms/edcv/protocol/openid-connect/token" \
  -u "cfm-agents:$CFM_CLIENT_SECRET" -d grant_type=client_credentials |
  python3 -I -c 'import json,sys; print(json.load(sys.stdin)["access_token"])')" || die "cfm-agents cannot get a token"

# --- 3. Provision Manager ----------------------------------------------------
for _ in $(seq 1 40); do curl -sf -o /dev/null "$PM_URL/health" && curl -sf -o /dev/null "$TM_URL/health" && break; sleep 3; done
curl -sf -o /dev/null "$PM_URL/health" || die "Provision Manager not healthy at $PM_URL"
api() { curl -s -w '\n%{http_code}' -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' "$@"; }
status_of() { tail -1 <<<"$1"; }
body_of() { sed '$d' <<<"$1"; }

defs="$(api "$PM_URL/api/v1alpha1/activity-definitions")"
[[ "$(status_of "$defs")" == "200" ]] || die "activity definitions: HTTP $(status_of "$defs") $(body_of "$defs")"
for type in edcv-activity identityhub-activity registration-activity onboarding-activity jwtlet-activity siglet-activity; do
  if ! grep -q "\"$type\"" <<<"$(body_of "$defs")"; then
    r="$(api -X POST "$PM_URL/api/v1alpha1/activity-definitions" -d "{\"type\":\"$type\",\"description\":\"$type (core-platform-distribution v0.0.39)\",\"inputSchema\":{},\"outputSchema\":{}}")"
    [[ "$(status_of "$r")" -lt 300 ]] || die "activity $type: HTTP $(status_of "$r") $(body_of "$r")"
  fi
done
say "3. activity definitions present"

orchs="$(api "$PM_URL/api/v1alpha1/orchestration-definitions")"
if ! body_of "$orchs" | python3 -I -c 'import json,sys; sys.exit(0 if any(d.get("templateRef") == "mvhd-vpa" for d in json.load(sys.stdin)) else 1)'; then
  r="$(api -X POST "$PM_URL/api/v1alpha1/orchestration-definitions" -d '{
    "id": "mvhd-vpa",
    "description": "Deploys and disposes a dataspace member (core-platform-distribution v0.0.39)",
    "schema": {},
    "activities": {
      "cfm.orchestration.vpa.deploy": [
        {"id": "jwtlet-tokenexchange-agent", "type": "jwtlet-activity"},
        {"id": "registration-agent", "type": "registration-activity", "dependsOn": ["jwtlet-tokenexchange-agent"]},
        {"id": "connector-provisioner", "type": "edcv-activity", "dependsOn": ["jwtlet-tokenexchange-agent"]},
        {"id": "siglet-provisioner", "type": "siglet-activity", "dependsOn": ["jwtlet-tokenexchange-agent", "connector-provisioner"]},
        {"id": "identityhub-provisioner", "type": "identityhub-activity", "dependsOn": ["jwtlet-tokenexchange-agent"]},
        {"id": "onboarding-agent", "type": "onboarding-activity",
         "dependsOn": ["jwtlet-tokenexchange-agent", "connector-provisioner", "identityhub-provisioner", "registration-agent"]}
      ],
      "cfm.orchestration.vpa.dispose": [
        {"id": "offboarding-agent", "type": "onboarding-activity", "dependsOn": []},
        {"id": "registration-rollback", "type": "registration-activity", "dependsOn": []},
        {"id": "connector-rollback", "type": "edcv-activity", "dependsOn": []},
        {"id": "identityhub-rollback", "type": "identityhub-activity", "dependsOn": []},
        {"id": "siglet-rollback", "type": "siglet-activity", "dependsOn": []}
      ]
    }}')"
  [[ "$(status_of "$r")" -lt 300 ]] || die "orchestration definition: HTTP $(status_of "$r") $(body_of "$r")"
  say "3. orchestration definition created"
else
  say "3. orchestration definition exists"
fi

# --- 4. Tenant Manager -------------------------------------------------------
first_id() { python3 -I -c 'import json,sys; d=json.load(sys.stdin); print(d[0]["id"] if isinstance(d,list) and d else "")'; }
cells="$(api "$TM_URL/api/v1alpha1/cells")"
[[ "$(status_of "$cells")" == "200" ]] || die "cells: HTTP $(status_of "$cells") $(body_of "$cells")"
CELL_ID="$(body_of "$cells" | first_id)"
if [[ -z "$CELL_ID" ]]; then
  r="$(api -X POST "$TM_URL/api/v1alpha1/cells" -d "{\"state\":\"active\",\"stateTimestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"properties\":{\"name\":\"compose\"}}")"
  [[ "$(status_of "$r")" -lt 300 ]] || die "cell: HTTP $(status_of "$r") $(body_of "$r")"
  CELL_ID="$(body_of "$r" | python3 -I -c 'import json,sys; print(json.load(sys.stdin)["id"])')"
fi
say "4. cell $CELL_ID"

if [[ -z "$CREDENTIAL_DEFINITION_ID" || -z "$CREDENTIAL_FORMAT" ]]; then
  defs="$(api -X POST -d '{}' "$ISSUER_API/v1/participants/issuer/credentialdefinitions/query")"
  def_row="$(body_of "$defs" | python3 -I -c '
import json, sys
try: rows = json.load(sys.stdin)
except Exception: rows = []
hit = [r for r in rows if isinstance(r, dict) and r.get("credentialType") == "MembershipCredential" and r.get("id")]
print(hit[0]["id"] + " " + (hit[0].get("format") or "") if hit else "")')"
  [[ -n "$CREDENTIAL_DEFINITION_ID" ]] || CREDENTIAL_DEFINITION_ID="${def_row%% *}"
  [[ -n "$CREDENTIAL_FORMAT" ]] || CREDENTIAL_FORMAT="${def_row#* }"
fi
# The issuer was not reachable, or its definition carries no format: as before RC6.
[[ -n "$CREDENTIAL_DEFINITION_ID" ]] || CREDENTIAL_DEFINITION_ID="membership-credential-def"
[[ -n "$CREDENTIAL_FORMAT" && "$CREDENTIAL_FORMAT" != "$CREDENTIAL_DEFINITION_ID" ]] || CREDENTIAL_FORMAT="VC1_0_JWT"

profiles="$(api "$TM_URL/api/v1alpha1/dataspace-profiles")"
DS_ID="$(body_of "$profiles" | first_id)"
if [[ -z "$DS_ID" ]]; then
  r="$(api -X POST "$TM_URL/api/v1alpha1/dataspace-profiles" -d "{
    \"artifacts\": [],
    \"properties\": {\"name\": \"ehds\"},
    \"dataspaceSpec\": {
      \"protocolStack\": [\"dsp-2025-1\", \"dcp-2025-1\"],
      \"credentialSpecs\": [{\"id\": \"$CREDENTIAL_DEFINITION_ID\", \"type\": \"MembershipCredential\",
                              \"issuer\": \"$ISSUER_DID\", \"format\": \"$CREDENTIAL_FORMAT\"}]
    }}")"
  [[ "$(status_of "$r")" -lt 300 ]] || die "dataspace profile: HTTP $(status_of "$r") $(body_of "$r")"
  DS_ID="$(body_of "$r" | python3 -I -c 'import json,sys; print(json.load(sys.stdin)["id"])')"
  r="$(api -X POST "$TM_URL/api/v1alpha1/dataspace-profiles/$DS_ID/deployments" -d "{\"profileId\":\"$DS_ID\",\"cellId\":\"$CELL_ID\"}")"
  [[ "$(status_of "$r")" -lt 300 ]] || die "dataspace profile deployment: HTTP $(status_of "$r") $(body_of "$r")"
fi
say "4. dataspace profile $DS_ID (MembershipCredential: $CREDENTIAL_DEFINITION_ID, $CREDENTIAL_FORMAT)"
# An existing profile is kept as it is; one seeded on RC5 asks for VC1_0_JWT.
seeded_format="$(body_of "$profiles" | python3 -I -c '
import json, sys
try: rows = json.load(sys.stdin)
except Exception: rows = []
specs = (rows[0].get("dataspaceSpec") or {}).get("credentialSpecs") or [] if isinstance(rows, list) and rows else []
print(" ".join(sorted({c.get("format", "") for c in specs if c.get("type") == "MembershipCredential"})))')"
if [[ -n "$seeded_format" && "$seeded_format" != "$CREDENTIAL_FORMAT" ]]; then
  say "   WARNING: the profile asks for $seeded_format, the issuer issues $CREDENTIAL_FORMAT; onboarding will wait"
  say "   on a REQUESTED credential. Empty the database cfm_v007 and seed again."
fi
say "CFM seeded."
