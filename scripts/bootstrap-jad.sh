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
#   - Ports 80, 4222, 5432, 7474, 7687, 8080, 8090, 8200, 8222 available
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
    local http_code
    http_code=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000")
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

  # Check port availability (skip ports owned by Docker/OrbStack — our own stack)
  local ports=(80 4222 5432 8080 8090 8200 8222 9090 10013 11002 11003 11005 11006 11007 11012)
  local busy_ports=()
  for port in "${ports[@]}"; do
    local pid
    pid=$(lsof -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true)
    pid=$(echo "$pid" | head -1)
    if [ -n "$pid" ]; then
      # Check if owned by Docker (our own stack) — skip if so
      local cmd
      cmd=$(ps -p "$pid" -o comm= 2>/dev/null || echo "")
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
  docker compose $COMPOSE_FILES pull
  ok "All images pulled"
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
  docker compose $COMPOSE_FILES up -d postgres vault keycloak nats

  # Wait for infrastructure to be healthy
  wait_for_service "PostgreSQL" "http://localhost:5432" 10 3 || true  # TCP, curl may fail
  wait_for_service "Vault" "http://localhost:8200/v1/sys/health" 15 3
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

  log "=== Phase 4: Starting EDC-V / DCore application services ==="
  docker compose $COMPOSE_FILES up -d controlplane dataplane-fhir dataplane-omop identityhub issuerservice

  wait_for_service "Control Plane" "http://localhost:11003/api/mgmt/check/readiness" 30 5
  wait_for_service "Data Plane FHIR" "http://localhost:11002/api/check/readiness" 30 5
  wait_for_service "Data Plane OMOP" "http://localhost:11012/api/check/readiness" 30 5
  wait_for_service "Identity Hub" "http://localhost:11005/api/identity/check/readiness" 30 5
  ok "EDC-V / DCore services are healthy"

  log "=== Phase 4b: Starting Neo4j Query Proxy ==="
  docker compose $COMPOSE_FILES up -d neo4j-proxy
  wait_for_service "Neo4j Query Proxy" "http://localhost:9090/health" 15 3
  ok "Neo4j Query Proxy is healthy"

  log "=== Phase 5: Starting CFM services ==="
  docker compose $COMPOSE_FILES up -d tenant-manager provision-manager
  docker compose $COMPOSE_FILES up -d cfm-agents cfm-edcv-agent cfm-registration-agent cfm-onboarding-agent
  assert_cfm_agents_running
  ok "CFM services started"

  log "=== Phase 6: Starting Neo4j (from base compose) ==="
  docker compose $COMPOSE_FILES up -d neo4j
  ok "Neo4j started"

  log "=== Phase 6b: Building and starting Live UI (port 3003) ==="
  docker compose $COMPOSE_FILES up -d --build graph-explorer
  ok "Live UI started on http://localhost:3003"
}

# ---------------------------------------------------------------------------
# Assert the CFM provisioning agents are actually running
# ---------------------------------------------------------------------------
# These agents drive participant provisioning. When they crash-loop, every VPA
# stays `pending` and the only symptom downstream is a 180s wait that times out
# 94 poll lines later (issue #181). Check them where the failure happens.
# ---------------------------------------------------------------------------
assert_cfm_agents_running() {
  local agents=(
    health-dataspace-cfm-keycloak-agent
    health-dataspace-cfm-edcv-agent
    health-dataspace-cfm-registration-agent
    health-dataspace-cfm-onboarding-agent
  )
  local settle=15
  log "Waiting ${settle}s for CFM agents to settle, then checking they stayed up..."
  sleep "$settle"

  local failed=0 agent state
  for agent in "${agents[@]}"; do
    state=$(docker inspect -f '{{.State.Status}}' "$agent" 2>/dev/null || true)
    [ -n "$state" ] || state="missing (no such container)"
    if [ "$state" != "running" ]; then
      error "CFM agent $agent is '$state', not 'running'"
      docker logs "$agent" --tail 15 2>&1 | sed 's/^/    /' >&2
      failed=1
      continue
    fi
    # A restarting container can report "running" between restarts, so also
    # reject one that has panicked since it last started.
    if docker logs "$agent" --tail 40 2>&1 | grep -q "^panic:"; then
      error "CFM agent $agent panicked after starting:"
      docker logs "$agent" --tail 40 2>&1 | grep -A3 "^panic:" | sed 's/^/    /' >&2
      failed=1
    fi
  done

  if [ "$failed" -ne 0 ]; then
    error ""
    error "Participant provisioning cannot work while any CFM agent is down."
    error "Aborting here rather than timing out later on VPAs that will never"
    error "leave 'pending'. See issue #181 and docs/gotchas.md."
    exit 1
  fi
  ok "All four CFM agents are running"
}

# ---------------------------------------------------------------------------
# Assert participants actually finished provisioning
# ---------------------------------------------------------------------------
# The single property that matters after seeding: at least one participant has
# all of its VPAs active. It is the one check that catches every way this chain
# breaks, whether the agents are down, the control plane rejects the call, the
# JetStream volume is unusable, or a store is missing a column (issue #181).
# ---------------------------------------------------------------------------
assert_participants_active() {
  local tm="http://localhost:11006"
  log "Verifying at least one participant reached ACTIVE ..."

  local report
  report=$(python3 - "$tm" <<'PYEOF' 2>/dev/null || true
import json, sys, urllib.request

base = sys.argv[1].rstrip("/") + "/api/v1alpha1/tenants"
try:
    tenants = json.load(urllib.request.urlopen(base, timeout=10))
except Exception as exc:
    print(f"UNREACHABLE:{exc}")
    raise SystemExit(0)

active = stuck = 0
detail = []
for t in tenants:
    name = t.get("properties", {}).get("displayName", t.get("id"))
    try:
        profiles = json.load(urllib.request.urlopen(f"{base}/{t['id']}/participant-profiles", timeout=10))
    except Exception:
        continue
    for prof in profiles:
        states = [v.get("state") for v in prof.get("vpas", [])]
        if states and set(states) == {"active"}:
            active += 1
        elif states:
            stuck += 1
            detail.append(f"{name}: {', '.join(sorted(set(states)))}")

print(f"RESULT:{active}:{stuck}:" + " | ".join(detail[:6]))
PYEOF
)

  case "$report" in
    UNREACHABLE:*)
      error "TenantManager unreachable at $tm (${report#UNREACHABLE:})"
      error "Cannot tell whether provisioning worked, so not claiming it did."
      exit 1
      ;;
    RESULT:*)
      local rest="${report#RESULT:}"
      local active="${rest%%:*}"; rest="${rest#*:}"
      local stuck="${rest%%:*}";  local detail="${rest#*:}"
      if [ "${active:-0}" -gt 0 ]; then
        ok "Participant provisioning verified: $active fully active, $stuck not"
        [ "${stuck:-0}" -gt 0 ] && warn "Not active: $detail"
        return 0
      fi
      error "No participant has all VPAs active (${stuck:-0} not active)"
      [ -n "$detail" ] && error "  $detail"
      error "Participant provisioning did not complete. See issue #181."
      exit 1
      ;;
    *)
      error "Could not read participant state from $tm"
      exit 1
      ;;
  esac
}

# ---------------------------------------------------------------------------
# Seed and fix IssuerService identity (post-startup)
# ---------------------------------------------------------------------------
seed_and_fix() {
  cd "$PROJECT_DIR"

  log "=== Phase 7: Running JAD seed ==="
  docker compose $COMPOSE_FILES run --rm jad-seed || {
    warn "JAD seed may have partially failed — continuing with identity fixup"
  }
  ok "JAD seed complete"

  log "=== Phase 8: IssuerService identity fixup ==="
  log "Applying issuer keypair, DID, and activation records..."

  # Wait for IssuerService tables to be available (Flyway migrations)
  local max_attempts=10
  for i in $(seq 1 "$max_attempts"); do
    if docker exec health-dataspace-postgres psql -U issuer -d issuerservice \
      -c "SELECT 1 FROM participant_context LIMIT 1" > /dev/null 2>&1; then
      break
    fi
    if [ "$i" -eq "$max_attempts" ]; then
      error "IssuerService DB not ready after $max_attempts attempts"
      return 1
    fi
    sleep 3
  done

  docker exec -i health-dataspace-postgres psql -U issuer -d issuerservice \
    < "$PROJECT_DIR/jad/seed-issuer-identity.sql" && \
    ok "IssuerService identity fixup applied" || \
    error "IssuerService identity fixup failed"

  # Restart IssuerService to pick up the new identity records
  log "Restarting IssuerService to activate identity..."
  docker restart health-dataspace-issuerservice
  sleep 5
  wait_for_service "IssuerService" "http://localhost:10013/api/check/readiness" 15 3 || \
    wait_for_service "IssuerService (direct)" "http://localhost:10013/api/version" 15 3 || true
  ok "IssuerService restarted with identity records"

  # Verify DID document is served
  if docker exec health-dataspace-issuerservice \
    wget -qO- "http://localhost:10016/issuer/did.json" 2>/dev/null | grep -q "verificationMethod"; then
    ok "IssuerService DID document verified ✓"
  else
    warn "DID document not yet available — may need manual verification"
  fi

  log "=== Phase 8b: Seeding IssuerService credential definitions ==="
  if [ -f "$PROJECT_DIR/jad/seed-issuer-defs.sh" ]; then
    bash "$PROJECT_DIR/jad/seed-issuer-defs.sh" && \
      ok "IssuerService attestation + credential definitions seeded" || \
      warn "IssuerService definition seeding had warnings — check output above"
  else
    warn "jad/seed-issuer-defs.sh not found — skipping credential definitions"
  fi
}

# ---------------------------------------------------------------------------
# Run full seed pipeline (health tenants, credentials, policies, assets, etc.)
# ---------------------------------------------------------------------------
seed_dataspace() {
  cd "$PROJECT_DIR"

  log "=== Phase 9: Seeding dataspace (tenants, credentials, policies, assets, negotiations) ==="

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
  echo "  Data Plane FHIR:     http://localhost:11002"
  echo "  Data Plane OMOP:     http://localhost:11012"
  echo "  Neo4j Query Proxy:   http://localhost:9090"
  echo "  Identity Hub:        http://localhost:11005"
  echo "  Issuer Service:      http://localhost:10013"
  echo "  Tenant Manager:      http://localhost:11006"
  echo "  Provision Manager:   http://localhost:11007"
  echo ""

  # The *.localhost names this used to print have never resolved (#190).
  # Traefik v3 pins Docker API 1.24 and the daemon requires 1.40, so its
  # Docker provider discovers nothing and every one of those URLs 404s. The
  # direct ports above work, which is why it went unnoticed for months.
  #
  # Print the names only if a route actually answers, rather than printing a
  # list and asserting nothing about it — the ADR-031 shape that #181 and this
  # issue are both about.
  local traefik_code
  traefik_code=$(curl -s --max-time 3 -o /dev/null -w '%{http_code}' \
    -H 'Host: keycloak.localhost' http://localhost:80 2>/dev/null || echo 000)
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
      seed_and_fix
      seed_dataspace
      ok "Seed and identity fixup complete"
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
      echo "  --seed      Re-run JAD seed, identity fixup, and dataspace seeding"
      echo "  --ui-only   Rebuild and restart the UI container only (fast, no downtime for infra)"
      echo "  --help      Show this help"
      ;;
    *)
      preflight
      pull_images
      start_stack
      seed_and_fix
      seed_dataspace
      show_status
      ok "JAD stack is ready! 🚀"
      ;;
  esac
}

main "$@"
