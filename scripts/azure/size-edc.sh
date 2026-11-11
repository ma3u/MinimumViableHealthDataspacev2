#!/usr/bin/env bash
# =============================================================================
# Gives the Java EDC apps the size env.sh names (ADR-089).
# =============================================================================
#   size-edc.sh                 apply the sizes to the IssuerService, the
#                               IdentityHub and the control plane, in that
#                               order, one at a time
#   size-edc.sh <app> [<app>]   only these apps
#   size-edc.sh --check         show what the apps run with now, change nothing
#
# Container Apps bills what an app is given, not what it uses. Over seven days
# the three apps used 630 MiB of their 4 GiB and under 0.02 of their 2 vCPU
# (2026-11-11), so they go to 1 vCPU and 2 GiB between them.
#
# Two things can go wrong, and the script handles both:
#   - the heap: a JVM takes a quarter of the container's memory, so half the
#     container is half the heap. EDC_JVM_HEAP_OPTS goes into
#     JAVA_TOOL_OPTIONS next to what is there, and the ceiling stays;
#   - the start: a JVM starts slower on less CPU. If the new revision is not
#     healthy in ten minutes the app gets its old size back and the script
#     exits 1.
#
# Each app restarts once: no negotiation, no credential issuance, no k6 run.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=env.sh
source "${SCRIPT_DIR}/env.sh"

ALL_APPS=("$ISSUER_APP" "$IDENTITYHUB_APP" "$CONTROLPLANE_APP")

size_of() { # <app>: the cpu and memory env.sh names for it
  if [[ "$1" == "$CONTROLPLANE_APP" ]]; then
    echo "$EDC_CP_CPU $EDC_CP_MEMORY"
  else
    echo "$EDC_ID_CPU $EDC_ID_MEMORY"
  fi
}

# JAVA_TOOL_OPTIONS with our heap option in it once: what is there stays, an
# earlier -XX:MaxRAMPercentage goes. Reads the old value as $1.
with_heap_opts() {
  local kept=() word
  for word in $1; do
    [[ "$word" == -XX:MaxRAMPercentage=* ]] || kept+=("$word")
  done
  kept+=("$EDC_JVM_HEAP_OPTS")
  echo "${kept[*]}"
}

show() { # never prints JAVA_TOOL_OPTIONS itself, only whether the heap option is in it
  local app jto
  for app in "${ALL_APPS[@]}"; do
    az containerapp show --name "$app" --resource-group "$RG" --query "{
        app: name,
        cpu: properties.template.containers[0].resources.cpu,
        memory: properties.template.containers[0].resources.memory,
        latestRevision: properties.latestRevisionName}" -o json
    jto="$(az containerapp show --name "$app" --resource-group "$RG" \
      --query "properties.template.containers[0].env[?name=='JAVA_TOOL_OPTIONS'].value | [0]" -o tsv)"
    if [[ " $jto " == *" $EDC_JVM_HEAP_OPTS "* ]]; then
      echo "  heap option: $EDC_JVM_HEAP_OPTS"
    else
      echo "  heap option: not set (the JVM takes a quarter of the container)"
    fi
  done
}

wait_healthy() { # <app>: 0 when the latest revision is Healthy within ten minutes
  local app="$1" latest health=""
  latest="$(az containerapp show --name "$app" --resource-group "$RG" \
    --query properties.latestRevisionName -o tsv)"
  for _ in $(seq 1 40); do
    health="$(az containerapp revision show --name "$app" --resource-group "$RG" \
      --revision "$latest" --query properties.healthState -o tsv)"
    [[ "$health" == Healthy ]] && { ok "$latest healthy"; return 0; }
    sleep 15
  done
  err "$latest is '$health' after 10 minutes"
  return 1
}

if [[ "${1:-}" == "--check" ]]; then
  show
  exit 0
fi

APPS=("$@")
[[ ${#APPS[@]} -gt 0 ]] || APPS=("${ALL_APPS[@]}")

for app in "${APPS[@]}"; do
  known=false
  for a in "${ALL_APPS[@]}"; do [[ "$a" == "$app" ]] && known=true; done
  if [[ "$known" != true ]]; then
    err "$app is not one of: ${ALL_APPS[*]}"
    exit 1
  fi

  read -r cpu memory <<<"$(size_of "$app")"
  old_cpu="$(az containerapp show --name "$app" --resource-group "$RG" \
    --query "properties.template.containers[0].resources.cpu" -o tsv)"
  old_memory="$(az containerapp show --name "$app" --resource-group "$RG" \
    --query "properties.template.containers[0].resources.memory" -o tsv)"
  old_jto="$(az containerapp show --name "$app" --resource-group "$RG" \
    --query "properties.template.containers[0].env[?name=='JAVA_TOOL_OPTIONS'].value | [0]" -o tsv)"
  if [[ -z "$old_cpu" || -z "$old_memory" ]]; then
    err "could not read the size of $app; nothing changed"
    exit 1
  fi

  log "Sizing $app: ${old_cpu} vCPU, ${old_memory} -> ${cpu} vCPU, ${memory}"
  # --set-env-vars merges, so every other variable stays.
  az containerapp update --name "$app" --resource-group "$RG" \
    --cpu "$cpu" --memory "$memory" \
    --set-env-vars "JAVA_TOOL_OPTIONS=$(with_heap_opts "$old_jto")" \
    -o none

  if ! wait_healthy "$app"; then
    warn "Giving $app its old size back: ${old_cpu} vCPU, ${old_memory}"
    az containerapp update --name "$app" --resource-group "$RG" \
      --cpu "$old_cpu" --memory "$old_memory" -o none
    wait_healthy "$app" || err "$app is not healthy at its old size either"
    exit 1
  fi
done
show
