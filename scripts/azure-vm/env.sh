#!/usr/bin/env bash
# Shared environment for the single-VM dev deployment (ADR-015).
# Source this file — do not execute directly.
#   source scripts/azure-vm/env.sh

set -euo pipefail

# ── Subscription / identity ──────────────────────────────────────────────────
# Override by exporting before sourcing. Defaults match the personal VS sub.
export AZ_SUBSCRIPTION="${AZ_SUBSCRIPTION:-PER-MSD-VS-MBUCHHORN-01}"

# ── Resource group / location ────────────────────────────────────────────────
export RG="${RG:-rg-mvhd-vm-dev}"
export LOCATION="${LOCATION:-westeurope}"

# ── VM ───────────────────────────────────────────────────────────────────────
export VM_NAME="${VM_NAME:-mvhd-dev}"
export VM_SIZE="${VM_SIZE:-Standard_B4ms}"       # 4 vCPU / 16 GB — fits 50 EUR budget
export VM_IMAGE="${VM_IMAGE:-Ubuntu2404}"         # Canonical Ubuntu 24.04 LTS alias
export VM_ADMIN="${VM_ADMIN:-azureuser}"
export VM_SSH_KEY="${VM_SSH_KEY:-$HOME/.ssh/id_rsa.pub}"
export VM_DISK_SIZE_GB="${VM_DISK_SIZE_GB:-64}"
export VM_OS_DISK_SKU="${VM_OS_DISK_SKU:-Premium_LRS}"

# ── Networking ───────────────────────────────────────────────────────────────
# Open only what the stack needs. Restrict SSH to the developer's current IP
# unless SSH_SOURCE_CIDR is overridden.
export NSG_NAME="${NSG_NAME:-nsg-mvhd-dev}"
export SSH_SOURCE_CIDR="${SSH_SOURCE_CIDR:-}"     # resolved from ipify if empty
export OPEN_PORTS=(22 3000 7474 7687 8080 9090)   # SSH, UI, Neo4j HTTP/Bolt, Keycloak, neo4j-proxy

# ── Schedule ─────────────────────────────────────────────────────────────────
export SHUTDOWN_TIME="${SHUTDOWN_TIME:-2000}"     # HHMM, local tz below
export SHUTDOWN_TZ="${SHUTDOWN_TZ:-W. Europe Standard Time}"
export STARTUP_HOUR="${STARTUP_HOUR:-7}"          # integer hour, local tz
export STARTUP_DAYS='["Monday","Tuesday","Wednesday","Thursday","Friday"]'

# ── Logic App (auto-start) ───────────────────────────────────────────────────
export LOGIC_APP_NAME="${LOGIC_APP_NAME:-la-mvhd-dev-startup}"

# ── Repo ─────────────────────────────────────────────────────────────────────
export REPO_URL="${REPO_URL:-https://github.com/ma3u/MinimumViableHealthDataspacev2.git}"
export REPO_BRANCH="${REPO_BRANCH:-main}"
export REPO_PATH_ON_VM="/opt/mvhd"
