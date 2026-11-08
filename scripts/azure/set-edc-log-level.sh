#!/usr/bin/env bash
# =============================================================================
# Run the EDC services at INFO, without ANSI colour (#418, ADR-045).
# =============================================================================
#   set-edc-log-level.sh [info|debug|warning]      default: info
#
# The EDC runtime reads two program arguments for its console monitor, both in
# the jar's ExtensionLoader and ConsoleMonitor: `--log-level=<level>` and
# `--no-color`. Without them it logs with ANSI colour codes, which Log
# Analytics stores as text: `[0;32mINFO ...`. (The 0.18 JAD images baked in
# `--log-level=debug` as well; `[CredentialWatchdog] checking N credentials`
# from IdentityHub alone was 882 billed lines in 48 hours.)
#
# On EDC 1.0 (#881, ADR-078) the control plane, IdentityHub and IssuerService
# all run a launcher image, mvhd-edc-<runtime>, built from runtimes/edc. Its
# CMD is the same for the three, with one jar name:
#
#   sh -c "exec java -Djava.security.egd=... ${JAVA_OPTS:-} -jar edc-runtime.jar"
#
# and migrate-edc-to-v1.sh sets it on each app as command ["sh", "-c"] and
# args [<that line>]. This writes the same two fields with the flags appended,
# checked against the 1.0.0-RC5 jar on 2026-11-08. The data planes and siglet
# are not EDC runtimes on 1.0 and are not in the list.
#
# An app on any other image is left alone: after `migrate-edc-to-v1.sh
# rollback` it runs a 0.18 JAD image again, which has no edc-runtime.jar, and
# its saved definition already carries the 0.18 command at INFO. An app
# already running the wanted command is skipped, so a re-run makes no new
# revision. `migrate-edc-to-v1.sh app` writes the image's CMD back, without
# the flags: run this again after it.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=env.sh
source "${SCRIPT_DIR}/env.sh"

level="${1:-info}"
case "$level" in
  info | debug | warning) ;;
  *)
    echo "usage: $0 [info|debug|warning]" >&2
    exit 2
    ;;
esac
API_VERSION="2024-03-01"
RG_ID="/subscriptions/$(az account show --query id -o tsv)/resourceGroups/${RG}"
# ${JAVA_OPTS:-} is for the container's shell to expand, not this one.
start="exec java -Djava.security.egd=file:/dev/urandom \${JAVA_OPTS:-} -jar edc-runtime.jar --log-level=${level} --no-color"
apps=("$CONTROLPLANE_APP" "$IDENTITYHUB_APP" "$ISSUER_APP")

failed=0
for app in "${apps[@]}"; do
  # Not `az containerapp update --args sh -c ...`: its parser takes `-c` for an
  # option ("unrecognized arguments"). PATCH the template alone through ARM;
  # the configuration, and with it every secret, is left as it is.
  url="https://management.azure.com${RG_ID}/providers/Microsoft.App/containerApps/${app}?api-version=${API_VERSION}"
  if ! template=$(az rest --method get --url "$url" --query properties.template -o json); then
    err "$app: could not read its template"
    failed=1
    continue
  fi
  # One line back: "skip <image>", "same", or "patch <body>".
  result=$(TEMPLATE="$template" START="$start" python3 -c '
import json, os
t = json.loads(os.environ["TEMPLATE"])
c = t["containers"][0]
want = (["sh", "-c"], [os.environ["START"]])
if "/mvhd-edc-" not in c["image"]:
    print("skip", c["image"])
elif (c.get("command"), c.get("args")) == want:
    print("same")
else:
    c["command"], c["args"] = want
    print("patch", json.dumps({"properties": {"template": t}}))')
  case "$result" in
    same)
      ok "$app already runs at ${level} without colour"
      ;;
    skip\ *)
      warn "$app runs ${result#skip }, not a 1.0 launcher: left alone"
      ;;
    patch\ *)
      log "$app: args = \"${start}\""
      if ! az rest --method patch --url "$url" --body "${result#patch }" -o none; then
        err "$app: update failed"
        failed=1
      fi
      ;;
  esac
done
exit "$failed"
