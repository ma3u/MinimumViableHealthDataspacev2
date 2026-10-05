#!/usr/bin/env bash
# Forges one NextAuth session per persona for k6 (#519), with the same script
# the API collection uses (ui/scripts/forge-bruno-session.mjs), into
# load-tests/.sessions.json (git-ignored; valid 8 hours).
#
#   NEXTAUTH_SECRET=... COOKIE_NAME=... load-tests/forge-sessions.sh
#
# Without NEXTAUTH_SECRET it is read from the compose UI container, as
# scripts/run-api-tests.sh does. The secret is never printed.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${SESSIONS:-$ROOT/load-tests/.sessions.json}"
UI_CONTAINER="${UI_CONTAINER:-health-dataspace-ui}"
COOKIE_NAME="${COOKIE_NAME:-next-auth.session-token}"

if [ -z "${NEXTAUTH_SECRET:-}" ]; then
  NEXTAUTH_SECRET="$(docker exec "$UI_CONTAINER" printenv NEXTAUTH_SECRET 2>/dev/null || true)"
  [ -n "$NEXTAUTH_SECRET" ] || {
    echo "NEXTAUTH_SECRET is not set and could not be read from $UI_CONTAINER" >&2
    exit 1
  }
fi
export NEXTAUTH_SECRET COOKIE_NAME

umask 077
{
  echo "{"
  first=1
  for persona in edcadmin clinicuser lmcuser researcher regulator patient1; do
    value="$(cd "$ROOT/ui" && node scripts/forge-bruno-session.mjs "$persona" | awk -F= '/^COOKIE_VALUE=/{print substr($0, 14)}')"
    [ -n "$value" ] || { echo "no session for $persona" >&2; exit 1; }
    [ "$first" = 1 ] || echo ","
    first=0
    printf '  "%s": {"cookieName": "%s", "cookieValue": "%s"}' "$persona" "$COOKIE_NAME" "$value"
  done
  echo
  echo "}"
} > "$OUT"
echo "forged 6 persona sessions (cookie $COOKIE_NAME, 8 h) into $OUT"
