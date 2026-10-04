#!/usr/bin/env bash
# =============================================================================
# Prove Keycloak can actually serve a login, not just answer a cached read.
# =============================================================================
# On 2026-09-30 every token grant and every browser sign-in on the live stack
# returned HTTP 500 for over an hour and three separate guards called it green:
#
#   POST /realms/master/.../token   (admin-cli, password grant)  500
#   GET  /realms/edcv/.../auth      (browser sign-in entry)      500
#   GET  /realms/edcv               (discovery)                  200
#
# The 200 is the trap. Keycloak serves realm metadata from its Infinispan
# cache, so discovery keeps answering long after the `realm` table has gone.
# `restore-keycloak-realm.sh` read exactly that and printed "realm edcv is
# present"; the root cause was that Postgres had re-run initdb and every
# Keycloak table was gone (see docs/gotchas.md, 2026-09-30).
#
# So the check here is deliberately NOT discovery. It is the authorize
# endpoint, which has to reach the database to look up a realm and a client:
#
#   healthy   -> 200 (login form) or 400/404 for a bad client or realm
#   broken    -> 5xx
#
# It needs no client id, no redirect URI and no secret, because a request that
# is wrong in every one of those ways still has to hit the database to find
# that out. Measured on the broken stack: a bogus client, and even a realm that
# does not exist, both returned 500 where a healthy Keycloak returns 400.
#
# Exit codes, so a caller can tell the two failures apart:
#   0  healthy
#   1  reachable, but the realm is missing  -> importing the realm is the fix
#   2  5xx from the persistence layer       -> importing will NOT help; the
#                                              database is the problem
#   3  Keycloak did not answer at all
#
# Usage:
#   scripts/azure/check-keycloak-health.sh [BASE_URL] [REALM]
#   BASE_URL defaults to $KEYCLOAK_PUBLIC_URL, then https://auth.ehds.mabu.red
#   REALM    defaults to $KEYCLOAK_REALM, then edcv
# =============================================================================
set -euo pipefail

BASE_URL="${1:-${KEYCLOAK_PUBLIC_URL:-https://auth.ehds.mabu.red}}"
REALM="${2:-${KEYCLOAK_REALM:-edcv}}"
BASE_URL="${BASE_URL%/}"

# curl -o /dev/null -w never fails the script on an HTTP error, only on a
# transport error, which is what the 000 below means.
probe() {
  curl -s -o /dev/null -m 20 -w '%{http_code}' "$1" 2>/dev/null || echo "000"
}

AUTHORIZE="${BASE_URL}/realms/${REALM}/protocol/openid-connect/auth"
AUTHORIZE="${AUTHORIZE}?client_id=keycloak-health-probe&response_type=code"
AUTHORIZE="${AUTHORIZE}&scope=openid&redirect_uri=https%3A%2F%2Fexample.invalid%2Fcb"
DISCOVERY="${BASE_URL}/realms/${REALM}/.well-known/openid-configuration"

auth_code="$(probe "$AUTHORIZE")"
disc_code="$(probe "$DISCOVERY")"

echo "keycloak health: ${BASE_URL} realm=${REALM}"
echo "  authorize (hits the database): ${auth_code}"
echo "  discovery (may be cached):     ${disc_code}"

case "$auth_code" in
  000)
    echo "FAIL: Keycloak did not answer at ${BASE_URL}." >&2
    exit 3
    ;;
  5*)
    echo "FAIL: authorize returned ${auth_code}. Keycloak is up but cannot reach" >&2
    echo "      its database, so every sign-in and every token grant fails." >&2
    if [ "$disc_code" = "200" ]; then
      echo "      Discovery still answers 200 from the Infinispan cache. Do not" >&2
      echo "      read that as healthy, and do not import the realm: the import" >&2
      echo "      needs the same tables." >&2
    fi
    echo "      Check the Flexible Server first (ADR-041):" >&2
    echo "        az postgres flexible-server show -n mvhd-pg-b53a0449 \\" >&2
    echo "          -g rg-mvhd-dev --query state -o tsv" >&2
    echo "      Stopped is the off-hours stop (ADR-053); the morning start" >&2
    echo "      starts it. Ready means look at Keycloak's KC_DB_URL next." >&2
    exit 2
    ;;
  404)
    echo "FAIL: realm '${REALM}' does not exist. Import it:" >&2
    echo "        ./scripts/azure/restore-keycloak-realm.sh" >&2
    exit 1
    ;;
esac

if [ "$disc_code" != "200" ]; then
  echo "FAIL: authorize answered ${auth_code} but discovery returned ${disc_code}," >&2
  echo "      so realm '${REALM}' is not being served." >&2
  exit 1
fi

echo "OK: Keycloak is serving realm '${REALM}' from a working database."
