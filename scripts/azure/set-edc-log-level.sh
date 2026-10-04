#!/usr/bin/env bash
# =============================================================================
# Run the EDC services at INFO, without ANSI colour (#418, ADR-045).
# =============================================================================
#   set-edc-log-level.sh [info|debug|warning]      default: info
#
# Every JAD image this estate deploys (jad-*:2026-04-14) has `--log-level=debug`
# baked into its start command, so on Azure the EDC services log DEBUG with ANSI
# colour codes: `[0;37mDEBUG ... [CredentialWatchdog] checking N credentials`
# from IdentityHub alone was 882 billed lines in 48 hours. The runtime reads two
# program arguments for its console monitor, both present in the jar's
# ExtensionLoader and ConsoleMonitor: `--log-level=<level>` and `--no-color`.
#
# This passes each image's own start command with those two changed. Read from
# the image configs in ACR on 2026-10-04:
#
#   jad-controlplane, jad-dataplane, jad-identity-hub
#     ENTRYPOINT /__cacert_entrypoint.sh, CMD sh -c "exec java ... -jar X.jar ..."
#     -> override CMD (ACA args) and keep the entrypoint
#   jad-issuerservice
#     ENTRYPOINT sh -c "exec java $ENV_JVM_ARGS -jar issuerservice.jar ...", no CMD
#     -> override the entrypoint (ACA command)
#
# An app already running the wanted command is skipped, so a re-run makes no
# new revision. Re-read the image commands when JAD_VERSION changes (ADR-029).
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/env.sh"

level="${1:-info}"
case "$level" in
  info | debug | warning) ;;
  *)
    echo "usage: $0 [info|debug|warning]" >&2
    exit 2
    ;;
esac
flags="--log-level=${level} --no-color"
API_VERSION="2024-03-01"
RG_ID="/subscriptions/$(az account show --query id -o tsv)/resourceGroups/${RG}"
egd="-Djava.security.egd=file:/dev/urandom"

# app|field|start command
apps=(
  "${CONTROLPLANE_APP}|args|exec java ${egd} -jar edc-controlplane.jar ${flags}"
  "${DP_FHIR_APP}|args|exec java ${egd} -jar edc-dataplane.jar ${flags}"
  "${DP_OMOP_APP}|args|exec java ${egd} -jar edc-dataplane.jar ${flags}"
  "${IDENTITYHUB_APP}|args|exec java ${egd} -jar identity-hub.jar ${flags}"
  # $ENV_JVM_ARGS is for the container's shell to expand, not this one.
  "${ISSUER_APP}|command|exec java \$ENV_JVM_ARGS -jar issuerservice.jar ${flags}"
)

failed=0
for entry in "${apps[@]}"; do
  IFS='|' read -r app field start <<<"$entry"
  current=$(az containerapp show --name "$app" --resource-group "$RG" \
    --query "properties.template.containers[0].${field}[2]" -o tsv 2>/dev/null || echo "")
  if [ "$current" = "$start" ]; then
    ok "$app already runs at ${level} without colour"
    continue
  fi
  log "$app: ${field} = sh -c \"${start}\""
  # Not `az containerapp update --args sh -c ...`: its parser takes `-c` for an
  # option ("unrecognized arguments"). PATCH the template alone through ARM;
  # the configuration, and with it every secret, is left as it is.
  url="https://management.azure.com${RG_ID}/providers/Microsoft.App/containerApps/${app}?api-version=${API_VERSION}"
  template=$(az rest --method get --url "$url" --query properties.template -o json)
  body=$(TEMPLATE="$template" FIELD="$field" START="$start" python3 -c '
import json, os
t = json.loads(os.environ["TEMPLATE"])
t["containers"][0][os.environ["FIELD"]] = ["sh", "-c", os.environ["START"]]
print(json.dumps({"properties": {"template": t}}))')
  if ! az rest --method patch --url "$url" --body "$body" -o none; then
    err "$app: update failed"
    failed=1
  fi
done
exit "$failed"
