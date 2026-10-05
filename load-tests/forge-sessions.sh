#!/usr/bin/env bash
# Forges NextAuth sessions for k6 (#519) with the same script the API
# collection uses (ui/scripts/forge-bruno-session.mjs), into
# load-tests/.sessions.json (git-ignored; valid 8 hours): SESSIONS_PER_PERSONA
# distinct users per persona (default 10), because the proxy counts its rate
# limit per user, and 50 virtual users must be 50 people, not 5.
#
#   NEXTAUTH_SECRET=... COOKIE_NAME=... SESSIONS_PER_PERSONA=10 load-tests/forge-sessions.sh
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

PER_PERSONA="${SESSIONS_PER_PERSONA:-10}"
umask 077
{
  echo "{"
  first=1
  for persona in edcadmin clinicuser lmcuser researcher regulator patient1; do
    [ "$first" = 1 ] || echo ","
    first=0
    printf '  "%s": [' "$persona"
    for i in $(seq 1 "$PER_PERSONA"); do
      value="$(cd "$ROOT/ui" && SESSION_SUFFIX="$i" node scripts/forge-bruno-session.mjs "$persona" | awk -F= '/^COOKIE_VALUE=/{print substr($0, 14)}')"
      [ -n "$value" ] || { echo "no session for $persona" >&2; exit 1; }
      [ "$i" = 1 ] || printf ','
      printf '{"cookieName": "%s", "cookieValue": "%s"}' "$COOKIE_NAME" "$value"
    done
    printf ']'
  done
  echo
  echo "}"
} > "$OUT"
echo "forged 6 personas x $PER_PERSONA users (cookie $COOKIE_NAME, 8 h) into $OUT"
