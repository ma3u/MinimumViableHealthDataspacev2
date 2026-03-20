#!/usr/bin/env bash
# =============================================================================
# Health Dataspace v2 — Unified Seed Script
# =============================================================================
# Runs all seed scripts in correct dependency order to fully populate the
# dataspace with tenants, credentials, policies, assets, and negotiations.
#
# Execution order:
#   1. seed-health-tenants.sh   — Create 5 tenants via CFM TenantManager
#   2. seed-ehds-credentials.sh — Register EHDS credential types on IssuerService
#   3. seed-ehds-policies.sh    — Create ODRL policies for all participants
#   4. seed-data-assets.sh      — Register data assets + contracts on EDC-V
#   5. seed-contract-negotiation.sh — PharmaCo↔AlphaKlinik negotiations + data planes
#   6. seed-federated-catalog.sh  — MedReg↔LMC federated catalog negotiation
#   7. seed-data-transfer.sh    — Verify EDR tokens and data plane transfers
#
# Usage:
#   ./jad/seed-all.sh              # Run all seed phases
#   ./jad/seed-all.sh --from 3     # Resume from step 3 (policies)
#   ./jad/seed-all.sh --only 5     # Run only step 5
#
# Prerequisites:
#   - JAD stack running (bootstrap-jad.sh or docker compose up)
#   - jad-seed container completed (creates initial tenants + VPAs)
#   - IssuerService identity fixup applied (seed-issuer-identity.sql)
# =============================================================================
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()   { echo -e "${BLUE}[SEED]${NC} $*"; }
ok()    { echo -e "${GREEN}[SEED]${NC} $*"; }
warn()  { echo -e "${YELLOW}[SEED]${NC} $*"; }
error() { echo -e "${RED}[SEED]${NC} $*" >&2; }

FROM_STEP=1
ONLY_STEP=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --from) FROM_STEP="$2"; shift 2 ;;
    --only) ONLY_STEP="$2"; shift 2 ;;
    --help|-h)
      echo "Usage: $0 [--from N] [--only N] [--help]"
      echo ""
      echo "  --from N   Start from step N (1-7)"
      echo "  --only N   Run only step N"
      echo "  --help     Show this help"
      exit 0
      ;;
    *) error "Unknown option: $1"; exit 1 ;;
  esac
done

should_run() {
  local step="$1"
  if [ "$ONLY_STEP" -gt 0 ]; then
    [ "$step" -eq "$ONLY_STEP" ]
  else
    [ "$step" -ge "$FROM_STEP" ]
  fi
}

run_step() {
  local step="$1"
  local name="$2"
  local script="$3"

  if ! should_run "$step"; then
    return 0
  fi

  echo ""
  log "════════════════════════════════════════════════════"
  log "  Step $step/7: $name"
  log "════════════════════════════════════════════════════"

  if [ ! -f "$SCRIPT_DIR/$script" ]; then
    error "Script not found: $SCRIPT_DIR/$script"
    return 1
  fi

  if bash "$SCRIPT_DIR/$script"; then
    ok "Step $step complete: $name"
  else
    warn "Step $step had warnings: $name (continuing)"
  fi
}

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║   Health Dataspace v2 — Full Seed Pipeline                 ║"
echo "╚══════════════════════════════════════════════════════════════╝"

run_step 1 "Health-Specific Tenants (CFM)"            "seed-health-tenants.sh"
run_step 2 "EHDS Credential Types (IssuerService)"    "seed-ehds-credentials.sh"
run_step 3 "EHDS ODRL Policies (EDC-V)"               "seed-ehds-policies.sh"
run_step 4 "Data Assets & Contracts (EDC-V)"           "seed-data-assets.sh"
run_step 5 "Contract Negotiations & Data Planes"       "seed-contract-negotiation.sh"
run_step 6 "Federated Catalog (HealthDCAT-AP)"         "seed-federated-catalog.sh"
run_step 7 "Data Transfer Verification"                "seed-data-transfer.sh"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║   Seed Pipeline Complete                                   ║"
echo "╚══════════════════════════════════════════════════════════════╝"
ok "All seed steps finished. Check output above for any warnings."
echo ""
