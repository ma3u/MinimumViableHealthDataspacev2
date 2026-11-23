#!/usr/bin/env bash
set -euo pipefail
# ---------------------------------------------------------------------------
# The push data plane on a running compose stack (ADR-095)
# ---------------------------------------------------------------------------
# A fresh stack needs none of steps 1 and 2: jad/init-postgres*.sql create the
# database and jad/keycloak-realm.json the client. A Postgres volume or a realm
# older than the service has neither, and the data plane then fails at boot
# ("database dataplane_v1 does not exist") or refuses every signal (401).
#
#   1. the role `dataplane` and the database `dataplane_v1`, when missing;
#   2. the Keycloak client `dataplane-signaling`, when missing;
#   3. the container, and only it (--no-deps: started from another folder than
#      the running stack, compose would recreate Postgres and Keycloak);
#   4. the registration mvhd-dp-<context> for every participant context;
#   5. read-back: the data plane is healthy and serves its JWKS, and a signal
#      without the control plane's token is refused.
#
# Idempotent. COMPOSE_FILES lists the compose files the stack was started from
# (default "docker-compose.yml docker-compose.jad.yml"); when the stack runs
# from another folder, export COMPOSE_PROJECT_NAME as well.
#
# SEED_DATAPLANE_ONLY=register runs step 4 alone.
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
# shellcheck source=lib/push-dataplane.sh
source "${SCRIPT_DIR}/lib/push-dataplane.sh"

KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8080}"
KC_ADMIN_USER="${KC_ADMIN_USER:-admin}"
KC_ADMIN_PASSWORD="${KC_ADMIN_PASSWORD:-admin}"
EDC_MANAGEMENT_URL="${EDC_MANAGEMENT_URL:-http://localhost:11003/api/mgmt}"
MGMT_V="${EDC_MGMT_API_VERSION:-v5}"
PG_CONTAINER="${PG_CONTAINER:-health-dataspace-postgres}"
DP_CONTAINER="${DP_CONTAINER:-health-dataspace-dataplane}"

say() { printf '%s\n' "$*"; }
die() {
  printf 'seed-dataplane: %s\n' "$*" >&2
  exit 1
}

if [ "${SEED_DATAPLANE_ONLY:-}" != "register" ]; then
  # --- 1. database -----------------------------------------------------------
  psql_cp() { docker exec "$PG_CONTAINER" psql -U cp -d postgres -tAqc "$1"; }
  if [ "$(psql_cp "SELECT 1 FROM pg_roles WHERE rolname='dataplane'")" != "1" ]; then
    # the compose stack's password, as jad/init-postgres.sql has it
    psql_cp "CREATE USER dataplane WITH PASSWORD 'dataplane'" >/dev/null
    say "1. role dataplane created"
  fi
  if [ "$(psql_cp "SELECT 1 FROM pg_database WHERE datname='dataplane_v1'")" != "1" ]; then
    psql_cp "CREATE DATABASE dataplane_v1 OWNER dataplane" >/dev/null
    say "1. database dataplane_v1 created"
  else
    say "1. database dataplane_v1 exists"
  fi

  # --- 2. Keycloak -----------------------------------------------------------
  ADMIN_TOKEN="$(curl -sf --max-time 20 -X POST "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" \
    -d grant_type=password -d client_id=admin-cli \
    --data-urlencode "username=${KC_ADMIN_USER}" --data-urlencode "password=${KC_ADMIN_PASSWORD}" |
    jq -r '.access_token // empty')" || die "no Keycloak admin token from ${KEYCLOAK_URL}"
  [ -n "$ADMIN_TOKEN" ] || die "no Keycloak admin token from ${KEYCLOAK_URL}"
  REALM="${KEYCLOAK_URL}/admin/realms/edcv"
  existing="$(curl -sf --max-time 20 -H "Authorization: Bearer ${ADMIN_TOKEN}" \
    "${REALM}/clients?clientId=${PUSH_DATAPLANE_CLIENT_ID}" | jq -r 'length')" || die "Keycloak did not list its clients"
  if [ "$existing" = "0" ]; then
    client="$(jq -nc --arg id "$PUSH_DATAPLANE_CLIENT_ID" --arg secret "$PUSH_DATAPLANE_CLIENT_SECRET" \
      '{clientId: $id, name: "Data Plane Signaling", enabled: true, protocol: "openid-connect",
        publicClient: false, serviceAccountsEnabled: true, secret: $secret,
        standardFlowEnabled: false, directAccessGrantsEnabled: false, fullScopeAllowed: false}')"
    curl -sf --max-time 20 -o /dev/null -X POST "${REALM}/clients" -H "Authorization: Bearer ${ADMIN_TOKEN}" \
      -H 'Content-Type: application/json' -d "$client" || die "Keycloak refused the client ${PUSH_DATAPLANE_CLIENT_ID}"
    say "2. Keycloak client ${PUSH_DATAPLANE_CLIENT_ID} created"
  else
    say "2. Keycloak client ${PUSH_DATAPLANE_CLIENT_ID} exists"
  fi

  # --- 3. the container ------------------------------------------------------
  compose=(docker compose)
  for f in ${COMPOSE_FILES:-docker-compose.yml docker-compose.jad.yml}; do compose+=(-f "${REPO_DIR}/${f}"); done
  "${compose[@]}" up -d --no-deps dataplane >/dev/null 2>&1 || die "docker compose could not start dataplane"
  status=""
  for _ in $(seq 1 40); do
    status="$(docker inspect -f '{{.State.Health.Status}}' "$DP_CONTAINER" 2>/dev/null || true)"
    [ "$status" = "healthy" ] && break
    sleep 3
  done
  [ "$status" = "healthy" ] || die "${DP_CONTAINER} is '${status:-absent}', not healthy; see docker logs ${DP_CONTAINER}"
  say "3. ${DP_CONTAINER} healthy"
fi

# --- 4. one registration per participant context ------------------------------
TOKEN="$(curl -sS --max-time 20 -X POST "${KEYCLOAK_URL}/realms/edcv/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&client_id=provisioner&client_secret=provisioner-secret" 2>/dev/null |
  jq -r '.access_token // empty' 2>/dev/null || true)"
[ -n "$TOKEN" ] || die "no provisioner token from ${KEYCLOAK_URL}"
MGMT="${EDC_MANAGEMENT_URL}/${MGMT_V}"
contexts="$(curl -sS --max-time 20 -H "Authorization: Bearer ${TOKEN}" "${MGMT}/participants" |
  jq -r '.[] | select(.identity // "" | startswith("did:")) | ."@id"')" ||
  die "could not list the participant contexts at ${MGMT}"
registered=0
failed=0
while read -r ctx; do
  [ -n "$ctx" ] || continue
  if register_push_dataplane "$MGMT" "$TOKEN" "$ctx"; then
    registered=$((registered + 1))
  else
    failed=$((failed + 1))
  fi
done <<<"$contexts"
say "4. registered for ${registered} participant contexts, ${failed} failed"
[ "$failed" -eq 0 ] || die "a registration failed"
[ "$registered" -gt 0 ] || die "the control plane lists no participant context; seed the identity layer first"

# --- 5. read-back -------------------------------------------------------------
if [ "${SEED_DATAPLANE_ONLY:-}" != "register" ]; then
  keys="$(docker exec "$DP_CONTAINER" curl -fsS http://localhost:8090/.well-known/jwks.json | jq -r '.keys | length')" ||
    die "the data plane serves no JWKS"
  [ "$keys" = "1" ] || die "the JWKS holds ${keys} keys, expected 1"
  first_ctx="$(head -1 <<<"$contexts")"
  code="$(docker exec "$DP_CONTAINER" curl -s -o /dev/null -w '%{http_code}' -X POST \
    -H 'Content-Type: application/json' -d '{}' "http://localhost:8090/api/v1/${first_ctx}/dataflows/prepare")" || code="000"
  [ "$code" = "401" ] || die "a signal without a token answered ${code}, expected 401"
  say "5. JWKS served; a signal without the control plane's token is refused (401)"
fi
say "push data plane seeded"
