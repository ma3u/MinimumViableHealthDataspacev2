#!/usr/bin/env bash
set -euo pipefail
# ---------------------------------------------------------------------------
# Run the Playwright suite locally the way CI runs it.
#
# Usage:
#   scripts/run-e2e-local.sh                 every spec
#   scripts/run-e2e-local.sh --changed       the specs this branch can break
#                                            against origin/main
#                                            (scripts/select-e2e-specs.sh)
#   scripts/run-e2e-local.sh journeys/12-    Playwright filters, as given
#
# What it does, as .github/workflows/e2e.yml and nightly.yml do:
#   1. a throwaway Neo4j (container mvhd-e2e-neo4j, Bolt on E2E_NEO4J_PORT)
#      with APOC, seeded with the demo graph by neo4j/seed.sh
#   2. the neo4j-proxy (services/neo4j-proxy) on E2E_PROXY_PORT against it
#   3. a production build of ui/ and `next start` on E2E_PORT
#   4. Playwright, chromium, with forged sessions for the Keycloak users
#      (E2E_FORGED_SESSIONS=1), so no Keycloak is needed
# All of it is removed again on exit. The shared compose stack is not touched.
#
# Environment:
#   E2E_PORT=3100         the UI's port
#   E2E_NEO4J_PORT=17687  the throwaway Neo4j's Bolt port
#   E2E_PROXY_PORT=19090  the neo4j-proxy's port
#   E2E_SKIP_BUILD=1      reuse the existing ui/.next build
#   E2E_KEEP=1            leave Neo4j and the UI running afterwards
# ---------------------------------------------------------------------------

ROOT="$(git rev-parse --show-toplevel)"
PORT="${E2E_PORT:-3100}"
BOLT="${E2E_NEO4J_PORT:-17687}"
PROXY_PORT="${E2E_PROXY_PORT:-19090}"
NEO4J_CONTAINER=mvhd-e2e-neo4j
SECRET=ci-test-secret-not-for-production

# npx starts the servers as children, so they are stopped by their port.
stop_port() {
  lsof -ti "tcp:$1" 2> /dev/null | xargs kill 2> /dev/null || true
}

cleanup() {
  if [ "${E2E_KEEP:-0}" = "1" ]; then
    echo "[e2e] left running: UI http://localhost:$PORT, proxy http://localhost:$PROXY_PORT, Neo4j bolt://localhost:$BOLT"
    return
  fi
  stop_port "$PORT"
  stop_port "$PROXY_PORT"
  docker rm -f "$NEO4J_CONTAINER" > /dev/null 2>&1 || true
}
trap cleanup EXIT

filters=()
if [ "${1:-}" = "--changed" ]; then
  git -C "$ROOT" fetch -q origin main
  selection="$("$ROOT/scripts/select-e2e-specs.sh" origin/main)"
  echo "[e2e] selected: $selection"
  case "$selection" in
    none) echo "[e2e] nothing a spec exercises changed"; exit 0 ;;
    all) ;;
    *) read -r -a filters <<< "$selection" ;;
  esac
else
  filters=("$@")
fi

for p in "$PORT" "$PROXY_PORT"; do
  if lsof -ti "tcp:$p" > /dev/null 2>&1; then
    echo "[e2e] port $p is in use; set E2E_PORT or E2E_PROXY_PORT" >&2
    exit 2
  fi
done

echo "[e2e] starting Neo4j on bolt://localhost:$BOLT"
docker rm -f "$NEO4J_CONTAINER" > /dev/null 2>&1 || true
docker run -d --name "$NEO4J_CONTAINER" -p "$BOLT:7687" \
  -e NEO4J_AUTH=neo4j/healthdataspace -e 'NEO4J_PLUGINS=["apoc"]' \
  -v "$ROOT/neo4j:/seed:ro" neo4j:5-community > /dev/null

echo "[e2e] seeding the demo graph (neo4j/seed.sh)"
docker exec -e NEO4J_HOST=localhost "$NEO4J_CONTAINER" bash /seed/seed.sh \
  | grep -E "FAIL|SEED_" || true
nodes="$(docker exec "$NEO4J_CONTAINER" cypher-shell -u neo4j -p healthdataspace \
  --format plain "MATCH (n) RETURN count(n)" | tail -1)"
echo "[e2e] graph holds $nodes nodes"

export NEO4J_URI="bolt://localhost:$BOLT" NEO4J_USER=neo4j NEO4J_PASSWORD=healthdataspace

echo "[e2e] starting the neo4j-proxy on http://localhost:$PROXY_PORT"
cd "$ROOT/services/neo4j-proxy"
[ -d node_modules ] || npm ci --no-audit --no-fund > /dev/null
npm run build > /dev/null
PORT="$PROXY_PORT" node dist/index.js > /dev/null 2>&1 &
for _ in $(seq 1 30); do
  curl -sf "http://localhost:$PROXY_PORT/health" > /dev/null 2>&1 && break
  sleep 1
done

cd "$ROOT/ui"
export NEXT_PUBLIC_STATIC_EXPORT=false
# Specs that clean up after themselves (17-patient-portal) delete through this.
export E2E_NEO4J_BOLT="bolt://localhost:$BOLT"
export NEXTAUTH_SECRET="$SECRET" NEXTAUTH_URL="http://localhost:$PORT"
export NEO4J_PROXY_URL="http://localhost:$PROXY_PORT"
# CI has no EDC connector and no Keycloak. Their defaults would reach a
# compose stack running on this machine and pass journeys that fail in CI,
# so they point at a closed port, as in CI.
NOWHERE=http://127.0.0.1:9
export EDC_MANAGEMENT_URL="$NOWHERE" EDC_IDENTITY_URL="$NOWHERE" \
  EDC_ISSUER_URL="$NOWHERE" KEYCLOAK_PUBLIC_URL="$NOWHERE"

if [ "${E2E_SKIP_BUILD:-0}" != "1" ]; then
  echo "[e2e] building the UI"
  npx next build > /dev/null
fi

echo "[e2e] starting the UI on http://localhost:$PORT"
npx next start -p "$PORT" > /dev/null 2>&1 &
for _ in $(seq 1 60); do
  curl -sf "http://localhost:$PORT/api/health" > /dev/null 2>&1 && break
  sleep 1
done

echo "[e2e] running Playwright ${filters[*]:-(every spec)}"
CI=true E2E_FORGED_SESSIONS=1 PLAYWRIGHT_BASE_URL="http://localhost:$PORT" \
  npx playwright test --project=chromium --retries=0 \
  ${filters[@]+"${filters[@]}"}
