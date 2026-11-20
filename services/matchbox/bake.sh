#!/usr/bin/env bash
set -euo pipefail
# =============================================================================
# Bake the IG packages into the Matchbox image (ADR-095, #1174)
# =============================================================================
#   bake.sh          the image build's step: start Matchbox, let it install
#                    every IG, check each one, stop it
#   bake.sh --list   print the IGs of the config as name#version and exit
#                    (scripts/eehrxf/test_eehrxf.py compares them with
#                    profiles.json)
#
# Runs once, in the image build (services/matchbox/Dockerfile): starts
# Matchbox with application.yaml, lets it fetch every IG that file names, and
# the packages those depend on, from the FHIR package servers into its H2
# database under /database, checks that each IG is installed, and stops it
# with SIGTERM so H2 closes the file. A container from the image finds every
# package in /database and fetches nothing: it starts with no network.
#
# The list of IGs is application.yaml itself, which scripts/eehrxf/build.py
# writes from scripts/eehrxf/profiles.json; this script keeps no list of its own.
#
#   MATCHBOX_CONFIG        the config to read (default /config/application.yaml)
#   BAKE_TIMEOUT_SECONDS   how long the first start may take (default 1500)
# =============================================================================
CONFIG="${MATCHBOX_CONFIG:-/config/application.yaml}"
BASE="http://localhost:8080/matchboxv3"
TIMEOUT="${BAKE_TIMEOUT_SECONDS:-1500}"
LOG="/tmp/matchbox-bake.log"

# name#version of every IG under hapi.fhir.implementationguides, in file order.
# A while loop, not mapfile: the unit test runs --list with macOS bash 3.2.
WANT=()
while IFS= read -r pv; do
  [ -n "$pv" ] && WANT+=("$pv")
done < <(awk '
  /^    implementationguides:/ { in_igs = 1; next }
  in_igs && /^[^ ]/ { in_igs = 0 }
  in_igs && /^ *name: / { name = $2 }
  in_igs && /^ *version: / && name != "" { v = $2; gsub(/"/, "", v); print name "#" v; name = "" }
' "$CONFIG")
[ "${#WANT[@]}" -gt 0 ] || { echo "bake: no IG in ${CONFIG}" >&2; exit 1; }

if [ "${1:-}" = "--list" ]; then
  printf '%s\n' "${WANT[@]}"
  exit 0
fi
echo "bake: ${#WANT[@]} IGs from ${CONFIG}: ${WANT[*]}"

# The base image's entrypoint, with its working directory: H2 is
# jdbc:h2:file:./database/h2, so / puts it in /database.
cd /
java -Dfhir.settings.path=/config/fhir-settings.json \
  "-Dspring.config.additional-location=optional:file:${CONFIG}" \
  -jar /matchbox.jar >"$LOG" 2>&1 &
pid=$!
started=$(date +%s)

up=""
while [ $(($(date +%s) - started)) -lt "$TIMEOUT" ]; do
  if ! kill -0 "$pid" 2>/dev/null; then
    tail -n 80 "$LOG" >&2
    echo "bake: Matchbox exited before it was up" >&2
    exit 1
  fi
  if curl -sf "${BASE}/actuator/health" 2>/dev/null | grep -q '"UP"'; then
    up=1
    break
  fi
  sleep 5
done
if [ -z "$up" ]; then
  tail -n 80 "$LOG" >&2
  echo "bake: Matchbox was not up after ${TIMEOUT} s" >&2
  kill "$pid" 2>/dev/null || true
  exit 1
fi
echo "bake: up after $(($(date +%s) - started)) s"

# Every IG of the config must be installed. Matchbox lists each installed
# package as an ImplementationGuide with the id <name>-<version> (its search
# answers; a read by id does not). A package that failed to load fails the
# build, never an image that validates against less than CI does.
installed=$(curl -sf -H 'Accept: application/fhir+json' \
  "${BASE}/fhir/ImplementationGuide?_count=1000&_elements=packageId,version" | tr -d ' \n')
missing=0
for pv in "${WANT[@]}"; do
  if printf '%s' "$installed" | grep -qF "\"id\":\"${pv%%#*}-${pv#*#}\""; then
    echo "bake: installed ${pv}"
  else
    echo "bake: NOT installed ${pv}" >&2
    missing=$((missing + 1))
  fi
done
total=$(printf '%s' "$installed" | sed -n 's/.*"total":\([0-9]*\).*/\1/p')
echo "bake: ${total:-?} packages in /database, dependencies included"

# SIGTERM: Spring shuts down and H2 closes the database file.
kill -TERM "$pid"
wait "$pid" || true
if [ "$missing" -gt 0 ]; then
  tail -n 80 "$LOG" >&2
  exit 1
fi
rm -f "$LOG"
du -sh /database
echo "bake: done"
