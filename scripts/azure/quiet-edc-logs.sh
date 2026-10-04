#!/usr/bin/env bash
# =============================================================================
# EDC at INFO without colour codes, and the unconfigured OTel agent off.
# =============================================================================
#   quiet-edc-logs.sh [--dry-run] [<app> ...]
#   quiet-edc-logs.sh --print-command <image>     (what would be set, no Azure)
#
# Every JAD image starts its runtime with `--log-level=debug` in its own start
# command, and EDC's console monitor writes ANSI colour codes unless told
# `--no-color`, so every line reached Log Analytics as `[0;37mDEBUG ...`.
# The images also start the OpenTelemetry Java agent, which with no endpoint
# configured logs "Failed to export" errors against localhost:4318 (#418,
# ADR-045). This script, per EDC app:
#
#   1. reads the start command from the image the app runs (the ACR images are
#      an April build, not the ghcr ones docker-compose uses, so it is read,
#      never assumed),
#   2. swaps --log-level=<x> for --log-level=info and adds --no-color,
#   3. sets it as the container's args (image with a CMD, keeping its
#      entrypoint) or command (image with an ENTRYPOINT only, the issuer),
#   4. sets OTEL_JAVAAGENT_ENABLED=false until Plane 1 configures a collector.
#
# Each update makes a new revision, so each app restarts once. Run it in
# office hours with the stack up; 04-edc-services.sh runs it after creating
# the apps. Needs docker and `az acr login` to read the image.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Prints "args|command" then the new shell string, for one image.
new_command() {
  local image="$1"
  docker pull -q --platform linux/amd64 "$image" >/dev/null
  docker image inspect "$image" --format '{{json .Config}}' | python3 -c '
import json, re, sys
cfg = json.load(sys.stdin)
cmd, ep = cfg.get("Cmd") or [], cfg.get("Entrypoint") or []
# The runtime is started by `sh -c "<string>"`, in CMD or, for the issuer, in
# ENTRYPOINT. Anything else is a layout this script does not know: refuse.
for kind, argv in (("args", cmd), ("command", ep)):
    if len(argv) == 3 and argv[0] == "sh" and argv[1] == "-c" and "java" in argv[2]:
        s = argv[2]
        s = re.sub(r"--log-level=\w+", "--log-level=info", s) if "--log-level=" in s else s + " --log-level=info"
        if "--no-color" not in s:
            s += " --no-color"
        print(kind)
        print(s)
        break
else:
    sys.exit(f"unrecognised start command: Entrypoint={ep} Cmd={cmd}")
'
}

if [ "${1:-}" = "--print-command" ]; then
  new_command "$2"
  exit 0
fi

source "${SCRIPT_DIR}/env.sh"
dry_run=""
if [ "${1:-}" = "--dry-run" ]; then
  dry_run=1
  shift
fi
[ "$#" -gt 0 ] || set -- "$CONTROLPLANE_APP" "$DP_FHIR_APP" "$DP_OMOP_APP" "$IDENTITYHUB_APP" "$ISSUER_APP"

az acr login --name "$ACR_NAME" >/dev/null

failed=0
for app in "$@"; do
  image=$(az containerapp show --name "$app" --resource-group "$RG" \
    --query "properties.template.containers[0].image" -o tsv)
  # An override someone set on purpose is not replaced silently: done ones
  # (already --no-color) are skipped, any other stops for a person to look.
  current=$(az containerapp show --name "$app" --resource-group "$RG" \
    --query "properties.template.containers[0].[command, args]" -o json | tr -d ' \n')
  case "$current" in
    "[null,null]" | "[[],[]]" | "[null,[]]" | "[[],null]") ;;
    *--no-color*) echo "  $app: already quiet, skipped"; continue ;;
    *) echo "  $app: has its own command/args ($current), not replaced"; failed=1; continue ;;
  esac
  if ! out=$(new_command "$image"); then
    echo "  $app: $image has a start command this script does not know, skipped"
    failed=1
    continue
  fi
  kind=$(echo "$out" | sed -n 1p)
  shell_string=$(echo "$out" | sed -n 2p)
  echo "  $app ($image): --$kind sh -c \"$shell_string\""
  [ -n "$dry_run" ] && continue
  az containerapp update --name "$app" --resource-group "$RG" \
    "--$kind" "sh" "-c" "$shell_string" \
    --set-env-vars OTEL_JAVAAGENT_ENABLED=false -o none ||
    { echo "  $app: update failed"; failed=1; }
done
exit "$failed"
