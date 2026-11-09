#!/usr/bin/env bash
# =============================================================================
# Health Dataspace v2 — JAD Bootstrap Script
# =============================================================================
# Brings up the full JAD (Joint Architecture Demo) stack for local development.
# This script handles the correct startup ordering and health checks that
# docker-compose depends_on alone may not guarantee.
#
# Usage:
#   ./scripts/bootstrap-jad.sh             # Start full stack
#   ./scripts/bootstrap-jad.sh --ui-only   # Rebuild & restart UI only (fast)
#   ./scripts/bootstrap-jad.sh --down      # Tear down everything
#   ./scripts/bootstrap-jad.sh --reset     # Tear down + remove volumes
#   ./scripts/bootstrap-jad.sh --status    # Show service status
#
# Prerequisites:
#   - Docker Engine 24+ with Compose V2
#   - At least 8 GB RAM allocated to Docker
#   - The host ports of the default stack available: 80, 3000, 3003, 4222,
#     5432, 7474, 7687, 8080, 8090, 8200, 8222, 9000, 9090, 10013, 10023,
#     11003, 11005 (the 0.18 ports 11002, 11006, 11007, 11012 belong to the
#     edc018 profile, which this script does not start)
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILES="-f docker-compose.yml -f docker-compose.jad.yml -f docker-compose.live.yml"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log()   { echo -e "${BLUE}[JAD]${NC} $*"; }
ok()    { echo -e "${GREEN}[JAD]${NC} $*"; }
warn()  { echo -e "${YELLOW}[JAD]${NC} $*"; }
error() { echo -e "${RED}[JAD]${NC} $*" >&2; }

# ---------------------------------------------------------------------------
# Helper: wait for a service health check to pass
# ---------------------------------------------------------------------------
wait_for_service() {
  local service="$1"
  local url="$2"
  local max_attempts="${3:-30}"
  local interval="${4:-5}"

  log "Waiting for $service at $url ..."
  for i in $(seq 1 "$max_attempts"); do
    # Accept any HTTP response (including 401/403) as proof the service is up.
    # curl -sf fails on 4xx, so use --write-out to check for a valid HTTP code.
    # curl prints 000 itself when nothing answers; `|| echo 000` appended a
    # second one, and "000000" passed every wait on its first attempt.
    local http_code
    http_code=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null) || http_code=000
    if [ "$http_code" != "000" ]; then
      ok "$service is healthy (attempt $i/$max_attempts, HTTP $http_code)"
      return 0
    fi
    sleep "$interval"
  done
  error "$service did not become healthy after $((max_attempts * interval))s"
  return 1
}

# ---------------------------------------------------------------------------
# Helper: wait for a container's own healthcheck
# ---------------------------------------------------------------------------
# For services whose readiness is not an HTTP status: Postgres speaks no HTTP,
# and the file-backed Vault (2026-09-26) answers 501 while it is uninitialised
# and sealed, until vault-unseal initialises or unseals it.
wait_for_healthy() {
  local container="$1" max_attempts="${2:-30}" interval="${3:-3}" status=""
  log "Waiting for $container to report healthy ..."
  for i in $(seq 1 "$max_attempts"); do
    status=$(docker inspect -f '{{.State.Health.Status}}' "$container" 2>/dev/null) || status=""
    if [ "$status" = "healthy" ]; then
      ok "$container is healthy (attempt $i/$max_attempts)"
      return 0
    fi
    sleep "$interval"
  done
  error "$container is ${status:-missing} after $((max_attempts * interval))s"
  return 1
}

# ---------------------------------------------------------------------------
# Wait for Neo4j, following its plugin installation
# ---------------------------------------------------------------------------
# Before Neo4j starts, the image's entrypoint installs NEO4J_PLUGINS, and APOC
# Extended, GDS and n10s come from the internet. On the first start of a new
# image (5.26.32, 2026-11-09) that took about three minutes, and the flat
# 120 s wait stopped the bootstrap before the proxy and the seed. So the wait
# reads the container's log: while the entrypoint is still installing it
# allows NEO4J_PLUGIN_WAIT seconds (600) and prints each plugin as it comes;
# once Neo4j logs "Starting..." it allows NEO4J_START_WAIT seconds (120) for
# the HTTP port to answer. A container that stops or restarts fails at once,
# with its log.
wait_for_neo4j() {
  local container="${1:-health-dataspace-neo4j}" url="${2:-http://localhost:7474}"
  local plugin_wait="${NEO4J_PLUGIN_WAIT:-600}" start_wait="${NEO4J_START_WAIT:-120}"
  local since state restarts0 code logs line="" last="" started=0 deadline phase="installing plugins"
  since=$(docker inspect -f '{{.State.StartedAt}}' "$container" 2>/dev/null) || {
    error "no container $container"
    return 1
  }
  restarts0=$(docker inspect -f '{{.RestartCount}}' "$container" 2>/dev/null) || restarts0=0
  deadline=$(( $(date +%s) + plugin_wait ))
  log "Waiting for Neo4j at $url (plugins up to ${plugin_wait}s, then ${start_wait}s to answer) ..."
  while :; do
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$url" 2>/dev/null) || code=000
    if [ "$code" != "000" ]; then
      ok "Neo4j is healthy (HTTP $code)"
      return 0
    fi
    state=$(docker inspect -f '{{.State.Running}} {{.RestartCount}}' "$container" 2>/dev/null) || state="false ?"
    if [ "$state" != "true $restarts0" ]; then
      error "$container stopped or restarted while $phase (running ${state% *}, restarts ${state#* }); its log:"
      docker logs --tail 20 "$container" 2>&1 | sed 's/^/    /' >&2
      return 1
    fi
    if [ "$started" -eq 0 ]; then
      logs=$(docker logs --since "$since" "$container" 2>&1) || logs=""
      if [[ "$logs" == *" Starting..."* ]]; then
        started=1
        phase="starting"
        deadline=$(( $(date +%s) + start_wait ))
        log "  plugins installed; Neo4j is starting"
      else
        line=$(printf '%s\n' "$logs" | grep -E "^(Installing|Fetching) " | tail -1) || line=""
        if [ -n "$line" ] && [ "$line" != "$last" ]; then
          log "  $line"
          last="$line"
        fi
      fi
    fi
    if [ "$(date +%s)" -ge "$deadline" ]; then
      if [ "$started" -eq 0 ]; then
        error "Neo4j was still installing plugins after ${plugin_wait}s (NEO4J_PLUGIN_WAIT); last: ${last:-no plugin line yet}"
      else
        error "Neo4j did not answer ${start_wait}s after it started (NEO4J_START_WAIT); its log:"
        docker logs --tail 20 "$container" 2>&1 | sed 's/^/    /' >&2
      fi
      return 1
    fi
    sleep 3
  done
}

# ---------------------------------------------------------------------------
# Load the graph into an empty Neo4j
# ---------------------------------------------------------------------------
# A fresh neo4j_data volume holds no graph, and the seeds' last step reads
# patients through the data plane (seed-data-transfer.sh). These are the files
# compliance.yml loads before the API collection ("Seed Neo4j with the
# documented minimal data set"). A graph that already holds patients, such as
# one with the Synthea set, is left as it is.
load_graph_if_empty() {
  local neo4j=(docker exec -i health-dataspace-neo4j cypher-shell -u neo4j -p healthdataspace)
  local patients f
  patients=$("${neo4j[@]}" --format plain "MATCH (p:Patient) RETURN count(p)" | tail -1) || {
    error "Neo4j does not answer cypher-shell"
    return 1
  }
  if [ "$patients" != "0" ]; then
    ok "Neo4j holds $patients patients; the graph is left as it is"
    return 0
  fi
  log "Neo4j is empty; loading the schema and the minimal data set ..."
  "${neo4j[@]}" < neo4j/init-schema.cypher > /dev/null
  for f in neo4j/insert-synthetic-schema-data.cypher \
           neo4j/register-eehrxf-profiles.cypher \
           neo4j/seed-compliance-matrix.cypher \
           neo4j/participant-source-init.cypher \
           neo4j/seed-persona-overview.cypher \
           neo4j/seed-study-results.cypher \
           neo4j/seed-catalog-translations.cypher; do
    "${neo4j[@]}" < "$f" > /dev/null
  done
  patients=$("${neo4j[@]}" --format plain "MATCH (p:Patient) RETURN count(p)" | tail -1)
  ok "Graph loaded: $patients patients"
}

# ---------------------------------------------------------------------------
# Helper: wait until an API answers at all
# ---------------------------------------------------------------------------
# The EDC 1.0 launchers publish their APIs but not their health contexts, and
# the control plane has no compose healthcheck. Any HTTP status means the API
# is listening; 401 is the usual one, asking for a token (as compliance.yml
# waits for them).
wait_for_api() {
  local name="$1" url="$2" max_attempts="${3:-60}" interval="${4:-5}" code=000
  log "Waiting for $name to answer at $url ..."
  for _ in $(seq 1 "$max_attempts"); do
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$url" 2>/dev/null) || code=000
    if [ "$code" != "000" ]; then
      ok "$name answers (HTTP $code)"
      return 0
    fi
    sleep "$interval"
  done
  error "$name did not answer after $((max_attempts * interval))s"
  return 1
}

# ---------------------------------------------------------------------------
# JetStream round trip
# ---------------------------------------------------------------------------
# Issue #191. A `nats_data` volume written by an older server can leave
# JetStream in a state where every publish fails with
#
#   nats: invalid jetstream publish response
#
# while the server logs nothing, `docker ps` shows it healthy and
# /healthz returns 200. The only symptom a human sees is a CFM participant
# whose VPAs go straight to `error`, several services away from the cause.
#
# Measured in #191: 2.14.3 on the existing volume fails, 2.11.17 on a fresh
# volume works, and 2.14.3 on a fresh volume works. So the pinned version is
# fine and the stale volume is the fault.
#
# A round trip is the check, not a heuristic on stream metadata: the broken
# volume's streams looked unremarkable from the outside (KV_cfm-bucket held
# 53 messages between first_seq 26 and last_seq 243439, and an empty stream
# legitimately reports first_seq = last_seq + 1), so there is nothing
# reliable to pattern-match. Publishing a message and reading it back is
# unambiguous.
assert_jetstream_roundtrip() {
  local network="${1:-health-dataspace-edcv}"
  local stream="bootstrap_probe_$$"
  local subject="bootstrap.probe.$$"

  log "Checking a JetStream publish round trip ..."
  if ! docker image inspect natsio/nats-box:latest >/dev/null 2>&1; then
    log "  pulling natsio/nats-box (first run only)"
    docker pull -q natsio/nats-box:latest >/dev/null 2>&1 || {
      log "  WARNING: could not pull natsio/nats-box; skipping the round trip."
      log "  If CFM orchestrations later fail with 'invalid jetstream publish"
      log "  response', the nats_data volume is the first thing to suspect (#191)."
      return 0
    }
  fi

  local out rc
  set +e
  out=$(docker run --rm --network "$network" natsio/nats-box:latest sh -c "
    set -e
    # --defaults, because the CLI prompts for every unset option and there
    # is no terminal here: without it the probe dies with 'cannot ask for
    # confirmation without a terminal' and looks like a JetStream fault.
    nats --server nats://nats:4222 stream add '$stream' \
      --subjects '$subject' --storage file --defaults >/dev/null
    nats --server nats://nats:4222 pub '$subject' 'bootstrap-probe' >/dev/null
    nats --server nats://nats:4222 stream info '$stream' --json \
      | grep -q '\"messages\": *1'
  " 2>&1)
  rc=$?
  docker run --rm --network "$network" natsio/nats-box:latest \
    nats --server nats://nats:4222 stream rm "$stream" -f >/dev/null 2>&1 || true
  set -e

  if [ "$rc" -eq 0 ]; then
    ok "JetStream round trip succeeded"
    return 0
  fi

  error "JetStream cannot store a message. Every CFM orchestration will fail"
  error "with 'invalid jetstream publish response' and each participant's VPAs"
  error "will go straight to 'error', with nothing in the NATS log to say why."
  error ""
  error "This is almost always a stale nats_data volume (issue #191). Recover:"
  error "  docker compose \$COMPOSE_FILES stop nats"
  error "  docker compose \$COMPOSE_FILES rm -f nats"
  error "  docker volume rm \$(docker volume ls -q | grep nats_data)"
  error "  docker compose \$COMPOSE_FILES up -d nats"
  error "The managers recreate cfm-stream and KV_cfm-bucket on startup, so"
  error "losing the volume costs nothing."
  error ""
  error "nats-box said:"
  printf '%s\n' "$out" | sed 's/^/    /' >&2
  return 1
}

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------
preflight() {
  log "Running pre-flight checks..."

  # Docker
  if ! command -v docker &> /dev/null; then
    error "Docker is not installed. Install Docker Desktop: https://docs.docker.com/desktop/"
    exit 1
  fi

  # Docker Compose V2
  if ! docker compose version &> /dev/null; then
    error "Docker Compose V2 is required. Update Docker Desktop or install the Compose plugin."
    exit 1
  fi

  # Docker running
  if ! docker info &> /dev/null 2>&1; then
    error "Docker daemon is not running. Start Docker Desktop first."
    exit 1
  fi

  # Check available memory (warn if < 8GB)
  local mem_bytes
  mem_bytes=$(docker info --format '{{.MemTotal}}' 2>/dev/null || echo "0")
  local mem_gb=$((mem_bytes / 1073741824))
  if [ "$mem_gb" -lt 8 ]; then
    warn "Docker has ${mem_gb}GB RAM. Recommended: 8GB+ for the full JAD stack."
  fi

  # The host ports of the services in no profile, the ones start_stack runs.
  # Ports Docker or OrbStack already hold are our own stack and are skipped.
  local ports=(80 3000 3003 4222 5432 7474 7687 8080 8090 8200 8222 9000 9090 10013 10023 11003 11005)
  local busy_ports=()
  for port in "${ports[@]}"; do
    local pid
    pid=$(lsof -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true)
    pid=$(echo "$pid" | head -1)
    if [ -n "$pid" ]; then
      # Owned by Docker or OrbStack: our own stack, skipped. Lower case,
      # because OrbStack's process is "OrbStack Helper", which the pattern
      # never matched, so every port of a running stack was reported taken.
      local cmd
      cmd=$(ps -p "$pid" -o comm= 2>/dev/null | tr '[:upper:]' '[:lower:]' || echo "")
      if [[ "$cmd" != *"com.docker"* && "$cmd" != *"orbstack"* && "$cmd" != *"vpnkit"* ]]; then
        busy_ports+=("$port")
      fi
    fi
  done
  if [ ${#busy_ports[@]} -gt 0 ]; then
    warn "Ports already in use: ${busy_ports[*]}"
    warn "The stack may fail to start. Stop conflicting services or adjust port mappings."
  fi

  ok "Pre-flight checks passed"
}

# ---------------------------------------------------------------------------
# Pull GHCR images
# ---------------------------------------------------------------------------
pull_images() {
  log "Pulling JAD container images..."
  cd "$PROJECT_DIR"
  # --ignore-buildable: the proxy and the UI build from in-repo source (ADR-029
  # rule 3); only the third-party JAD/CFM images are pulled. Without this, pull
  # errors trying to fetch the local-only mvhd-neo4j-proxy:dev tag (#349).
  docker compose $COMPOSE_FILES pull --ignore-buildable
  ok "All third-party images pulled"
}

# ---------------------------------------------------------------------------
# Start the stack
# ---------------------------------------------------------------------------
start_stack() {
  cd "$PROJECT_DIR"

  # Clean up any orphaned containers from previous runs to avoid name conflicts
  log "Cleaning up orphaned containers..."
  docker compose $COMPOSE_FILES down --remove-orphans 2>/dev/null || true

  log "=== Phase 1: Starting infrastructure services ==="
  # vault-unseal belongs here: the file-backed Vault stays sealed, and its
  # healthcheck fails, until the sidecar initialises or unseals it, so
  # vault-bootstrap (which needs Vault healthy) could never start without it.
  docker compose $COMPOSE_FILES up -d postgres vault vault-unseal keycloak nats

  # Wait for infrastructure to be healthy
  wait_for_healthy health-dataspace-postgres 20 3
  wait_for_healthy health-dataspace-vault 30 3
  wait_for_service "Keycloak" "http://localhost:9000/health/ready" 30 5
  wait_for_service "NATS" "http://localhost:8222/healthz" 10 3
  # /healthz says the server is up, not that JetStream can store anything —
  # the #191 failure passes that check and fails every publish.
  assert_jetstream_roundtrip || exit 1
  ok "Infrastructure services are healthy"

  log "=== Phase 2: Running Vault bootstrap ==="
  docker compose $COMPOSE_FILES up -d vault-bootstrap
  # vault-bootstrap is a sidecar (sleep infinity) — wait for its success log
  log "Waiting for Vault bootstrap to complete..."
  for i in $(seq 1 60); do
    if docker logs health-dataspace-vault-bootstrap 2>&1 | grep -q "Vault bootstrap completed successfully"; then
      ok "Vault bootstrap complete"
      break
    fi
    if [ "$i" -eq 60 ]; then
      error "Vault bootstrap did not complete within 60s"
      docker logs health-dataspace-vault-bootstrap --tail 20 2>&1
      exit 1
    fi
    sleep 2
  done

  # Siglet (EDC 0.18 dataplane cert-exchange — issue #97 Phase B) signs tokens
  # via the Vault transit engine. jad/bootstrap-vault.sh owns this since Vault
  # became file-backed (2026-09-26); kept here as a harmless idempotent repeat
  # for stacks whose vault-bootstrap sidecar predates that.
  log "Enabling Vault transit engine + signing-siglet key for siglet..."
  curl -s -X POST http://localhost:8200/v1/sys/mounts/transit \
    -H "X-Vault-Token: root" -d '{"type":"transit"}' -o /dev/null || true
  curl -s -X POST http://localhost:8200/v1/transit/keys/signing-siglet \
    -H "X-Vault-Token: root" -d '{"type":"ed25519"}' -o /dev/null || true
  ok "Vault transit ready for siglet"

  log "=== Phase 3: Starting Traefik gateway ==="
  docker compose $COMPOSE_FILES up -d traefik
  ok "Traefik gateway started"

  log "=== Phase 4: Starting the EDC 1.0 services and siglet ==="
  # EDC 1.0 (#881, ADR-078): the launchers from runtimes/edc, which compose
  # builds on the first run (a few minutes of Gradle); siglet is the data
  # plane. JAD's data planes and CFM are 0.18 only (profile edc018).
  docker compose $COMPOSE_FILES up -d controlplane identityhub issuerservice simpl-ga-issuer siglet

  wait_for_api "Control Plane" "http://localhost:11003/api/mgmt/v5/participants" 60 5 || exit 1
  wait_for_api "Identity Hub" "http://localhost:11005/api/identity" 60 5 || exit 1
  wait_for_api "Issuer Service" "http://localhost:10013/api/admin" 60 5 || exit 1
  ok "EDC 1.0 services are answering"

  log "=== Phase 4b: Starting Neo4j (from base compose) ==="
  # Before the proxy, which exits while it cannot reach Neo4j.
  docker compose $COMPOSE_FILES up -d neo4j
  wait_for_neo4j || exit 1
  ok "Neo4j started"
  load_graph_if_empty || exit 1

  log "=== Phase 5: Starting Neo4j Query Proxy ==="
  # --build: the proxy is our code; build it from ./services/neo4j-proxy so the
  # running container matches the source, not a stale image (#349, ADR-029 r3).
  docker compose $COMPOSE_FILES up -d --build neo4j-proxy
  wait_for_service "Neo4j Query Proxy" "http://localhost:9090/health" 20 3
  ok "Neo4j Query Proxy is healthy"

  log "=== Phase 5b: Building and starting Live UI (port 3003) ==="
  docker compose $COMPOSE_FILES up -d --build graph-explorer
  ok "Live UI started on http://localhost:3003"
}

# ---------------------------------------------------------------------------
# Assert the participants exist and hold a credential
# ---------------------------------------------------------------------------
# The property that matters after seeding (#181): the five demo participants
# are contexts on the control plane. On EDC 1.0 they stay CREATED, which the
# hub accepts (#878, #891); their credentials are checked by seed step 1, which
# requests a MembershipCredential for each and fails when one does not arrive.
# ---------------------------------------------------------------------------
assert_participants_active() {
  log "Verifying the participant contexts on the control plane ..."
  local token count
  token=$(curl -s --max-time 20 -X POST "http://localhost:8080/realms/edcv/protocol/openid-connect/token" \
    -d "grant_type=client_credentials&client_id=admin&client_secret=edc-v-admin-secret" 2>/dev/null \
    | python3 -c "import json,sys; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null || true)
  [ -n "$token" ] || { error "no admin token from the local Keycloak"; exit 1; }
  count=$(curl -s --max-time 20 -H "Authorization: Bearer $token" \
    "http://localhost:11003/api/mgmt/v5/participants" 2>/dev/null \
    | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d) if isinstance(d, list) else 0)" 2>/dev/null || echo 0)
  if [ "${count:-0}" -ge 5 ]; then
    ok "$count participant contexts on the control plane"
  else
    error "only ${count:-0} participant contexts on the control plane, five expected"
    exit 1
  fi
}

# ---------------------------------------------------------------------------
# Run full seed pipeline (health tenants, credentials, policies, assets, etc.)
# ---------------------------------------------------------------------------
seed_dataspace() {
  cd "$PROJECT_DIR"

  log "=== Phase 7: Seeding the dataspace (participants and credentials, policies, assets, negotiations) ==="

  if [ ! -f "$PROJECT_DIR/jad/seed-all.sh" ]; then
    error "jad/seed-all.sh not found, cannot seed the dataspace"
    exit 1
  fi

  # seed-all.sh exits non-zero when a phase fails, and phases are strictly
  # ordered, so a failure here means the stack is not usable. Reporting it as
  # a warning and printing "ready" is what issue #181 was about.
  if ! bash "$PROJECT_DIR/jad/seed-all.sh"; then
    error "Dataspace seed pipeline FAILED, see the step list above"
    exit 1
  fi
  ok "Dataspace seed pipeline complete"

  assert_participants_active

  # #710, ADR-064: the fictional Simpl Governance Authority, trusted for
  # MembershipCredential, and Institut de Recherche Santé's membership from it.
  # The rest of the stack does not need it, so a failure is a warning; the
  # identity checks (TRUST-6.2) then say what is missing.
  log "=== Phase 7b: Simpl test Governance Authority (#710) ==="
  if bash "$PROJECT_DIR/scripts/seed-simpl-ga.sh"; then
    ok "irs holds its membership from the Simpl test Governance Authority"
  else
    warn "scripts/seed-simpl-ga.sh failed; the TRUST checks will report it"
  fi
}

# ---------------------------------------------------------------------------
# Show status
# ---------------------------------------------------------------------------
show_status() {
  cd "$PROJECT_DIR"
  echo ""
  log "=== Service Status ==="
  docker compose $COMPOSE_FILES ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
  echo ""
  log "=== Service Endpoints ==="
  echo "  Neo4j Browser:       http://localhost:7474"
  echo "  Live UI:             http://localhost:3003  (production build)"
  echo "  Traefik Dashboard:   http://localhost:8090"
  echo "  Keycloak Admin:      http://localhost:8080      (admin/admin)"
  echo "  Vault UI:            http://localhost:8200      (token: root)"
  echo "  NATS Monitor:        http://localhost:8222"
  echo "  Control Plane Mgmt:  http://localhost:11003"
  echo "  Neo4j Query Proxy:   http://localhost:9090"
  echo "  Identity Hub:        http://localhost:11005"
  echo "  Issuer Service:      http://localhost:10013"
  echo ""

  # The *.localhost names stayed dead for months (#190): Traefik v3.4 asked
  # for Docker API 1.24, the daemon requires 1.40, and its Docker provider
  # discovered nothing. Traefik v3.7 negotiates the version and routes them.
  #
  # Print the names only if a route actually answers, rather than printing a
  # list and asserting nothing about it — the ADR-031 shape that #181 and this
  # issue are both about.
  local traefik_code
  traefik_code=$(curl -s --max-time 3 -o /dev/null -w '%{http_code}' \
    -H 'Host: keycloak.localhost' http://localhost:80 2>/dev/null) || traefik_code=000
  if [ "$traefik_code" = "200" ]; then
    echo "  Traefik *.localhost routing is live (keycloak.localhost, cp.localhost, ...)"
    echo ""
  fi
}

# ---------------------------------------------------------------------------
# Tear down
# ---------------------------------------------------------------------------
tear_down() {
  local remove_volumes="${1:-false}"
  cd "$PROJECT_DIR"

  log "Stopping all services..."
  docker compose $COMPOSE_FILES down

  if [ "$remove_volumes" = "true" ]; then
    warn "Removing volumes (all data will be lost)..."
    docker compose $COMPOSE_FILES down -v
  fi

  ok "Stack stopped"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
main() {
  case "${1:-}" in
    --down)
      tear_down false
      ;;
    --reset)
      tear_down true
      ;;
    --status)
      show_status
      ;;
    --pull)
      preflight
      pull_images
      ;;
    --seed)
      seed_dataspace
      ok "Dataspace seeded"
      ;;
    --ui-only)
      log "Rebuilding and restarting UI only (no infrastructure teardown)..."
      cd "$PROJECT_DIR"
      docker compose $COMPOSE_FILES up -d --build graph-explorer
      ok "Live UI rebuilt and started on http://localhost:3003"
      ;;
    --help|-h)
      echo "Usage: $0 [--down|--reset|--status|--pull|--seed|--ui-only|--help]"
      echo ""
      echo "  (no args)   Start full JAD stack with health checks"
      echo "  --down      Stop all services"
      echo "  --reset     Stop all services and remove volumes"
      echo "  --status    Show service status and endpoints"
      echo "  --pull      Pull latest images"
      echo "  --seed      Re-run the dataspace seed (jad/seed-all.sh)"
      echo "  --ui-only   Rebuild and restart the UI container only (fast, no downtime for infra)"
      echo "  --help      Show this help"
      ;;
    *)
      preflight
      pull_images
      start_stack
      seed_dataspace
      show_status
      ok "JAD stack is ready! 🚀"
      ;;
  esac
}

main "$@"
