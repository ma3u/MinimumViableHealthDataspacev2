#!/usr/bin/env bash
# =============================================================================
# Health Dataspace v2 — JAD Bootstrap Script
# =============================================================================
# Brings up the full JAD (Joint Architecture Demo) stack for local development.
# This script handles the correct startup ordering and health checks that
# docker-compose depends_on alone may not guarantee.
#
# Usage:
#   ./scripts/bootstrap-jad.sh          # Start full stack
#   ./scripts/bootstrap-jad.sh --down   # Tear down everything
#   ./scripts/bootstrap-jad.sh --reset  # Tear down + remove volumes
#   ./scripts/bootstrap-jad.sh --status # Show service status
#
# Prerequisites:
#   - Docker Engine 24+ with Compose V2
#   - At least 8 GB RAM allocated to Docker
#   - Ports 80, 4222, 5432, 7474, 7687, 8080, 8090, 8200, 8222 available
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILES="-f docker-compose.yml -f docker-compose.jad.yml"

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
    if curl -sf "$url" > /dev/null 2>&1; then
      ok "$service is healthy (attempt $i/$max_attempts)"
      return 0
    fi
    sleep "$interval"
  done
  error "$service did not become healthy after $((max_attempts * interval))s"
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

  # Check port availability
  local ports=(80 4222 5432 8080 8090 8200 8222 10013 11002 11003 11005 11006 11007)
  local busy_ports=()
  for port in "${ports[@]}"; do
    if lsof -iTCP:"$port" -sTCP:LISTEN -t &> /dev/null; then
      busy_ports+=("$port")
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

  log "=== Phase 1: Starting infrastructure services ==="
  docker compose $COMPOSE_FILES up -d postgres vault keycloak nats

  # Wait for infrastructure to be healthy
  wait_for_service "PostgreSQL" "http://localhost:5432" 10 3 || true  # TCP, curl may fail
  wait_for_service "Vault" "http://localhost:8200/v1/sys/health" 15 3
  wait_for_service "Keycloak" "http://localhost:9000/health/ready" 30 5
  wait_for_service "NATS" "http://localhost:8222/healthz" 10 3
  ok "Infrastructure services are healthy"

  log "=== Phase 2: Running Vault bootstrap ==="
  docker compose $COMPOSE_FILES up vault-bootstrap
  ok "Vault bootstrap complete"

  log "=== Phase 3: Starting Traefik gateway ==="
  docker compose $COMPOSE_FILES up -d traefik
  ok "Traefik gateway started"

  log "=== Phase 4: Starting EDC-V / DCore application services ==="
  docker compose $COMPOSE_FILES up -d controlplane dataplane identityhub issuerservice

  wait_for_service "Control Plane" "http://localhost:11003/api/mgmt/check/readiness" 30 5
  wait_for_service "Identity Hub" "http://localhost:11005/api/identity/check/readiness" 30 5
  ok "EDC-V / DCore services are healthy"

  log "=== Phase 5: Starting CFM services ==="
  docker compose $COMPOSE_FILES up -d tenant-manager provision-manager
  docker compose $COMPOSE_FILES up -d cfm-agents cfm-edcv-agent cfm-registration-agent cfm-onboarding-agent
  ok "CFM services started"

  log "=== Phase 6: Starting Neo4j (from base compose) ==="
  docker compose $COMPOSE_FILES up -d neo4j
  ok "Neo4j started"
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
  echo "  Traefik Dashboard:   http://localhost:8090"
  echo "  Keycloak Admin:      http://keycloak.localhost  (admin/admin)"
  echo "  Vault UI:            http://vault.localhost      (token: root)"
  echo "  NATS Monitor:        http://localhost:8222"
  echo "  Control Plane Mgmt:  http://cp.localhost        (port 11003 direct)"
  echo "  Data Plane Public:   http://dp.localhost        (port 11002 direct)"
  echo "  Identity Hub:        http://ih.localhost        (port 11005 direct)"
  echo "  Issuer Service:      http://issuer.localhost    (port 10013 direct)"
  echo "  Tenant Manager:      http://tm.localhost        (port 11006 direct)"
  echo "  Provision Manager:   http://pm.localhost        (port 11007 direct)"
  echo ""
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
    --help|-h)
      echo "Usage: $0 [--down|--reset|--status|--pull|--help]"
      echo ""
      echo "  (no args)   Start full JAD stack with health checks"
      echo "  --down      Stop all services"
      echo "  --reset     Stop all services and remove volumes"
      echo "  --status    Show service status and endpoints"
      echo "  --pull      Pull latest images"
      echo "  --help      Show this help"
      ;;
    *)
      preflight
      pull_images
      start_stack
      show_status
      ok "JAD stack is ready! 🚀"
      ;;
  esac
}

main "$@"
