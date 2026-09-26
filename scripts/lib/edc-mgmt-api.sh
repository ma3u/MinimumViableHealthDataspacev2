#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Shared EDC Management API access for the compliance suites
# ---------------------------------------------------------------------------
# Sourced by scripts/run-dsp-tck.sh, scripts/run-dcp-tests.sh and
# scripts/run-ehds-tests.sh. It exists because all three opened with
#
#   participants_json=$(curl -sf ... "${MGMT_API}/${MGMT_V}/participants") || {
#     log "ERROR: Cannot fetch participant list from Management API"
#     exit 1
#   }
#
# and that line hides everything worth knowing (issue #307). `curl -sf` prints
# no body and no status, so a 404 from a wrong path, a 404 from a wrong API
# version, a 401 from a bad token and a refused connection all produced the
# same one-line message. Three issues (#205, #303, #306) were spent narrowing
# it down by elimination because the error itself never said anything.
#
# Two behaviours:
#
#   1. Report. On failure, say the URL, the HTTP status (or curl's exit code
#      when there was no response at all) and the first part of the body.
#   2. Fall back across API version segments. The Management API version is a
#      path segment and it moves: the JAD 0.18 launchers in docker-compose.jad
#      serve /v5beta, and the image deployed on Azure (jad-controlplane
#      :2026-04-14) still serves /v5alpha. A suite that hardcodes one is wrong
#      on the other environment and says only "cannot fetch". When the
#      configured version answers 404 the candidates below are tried, and
#      MGMT_V is rebound to whichever answers so the rest of the suite follows.
#
# Expects the caller to have set MGMT_API, MGMT_V and a log() function.
# ---------------------------------------------------------------------------

# Version segments tried, in order, when the configured MGMT_V answers 404.
MGMT_V_CANDIDATES="${EDC_MGMT_API_VERSION_CANDIDATES:-v5beta v5alpha v4alpha v3}"

# Results of the last request. These are globals rather than stdout because
# every caller here runs inside `set -e` and a command substitution would put
# the request in a subshell, where the status code and the body could not come
# back and where log() output would be captured into the caller's variable
# instead of being printed.
MGMT_LAST_STATUS=""
MGMT_LAST_CURL_RC=0
MGMT_LAST_BODY=""
MGMT_PARTICIPANTS_JSON=""

# mgmt_request <method> <path> [body]
# Fills MGMT_LAST_STATUS / MGMT_LAST_CURL_RC / MGMT_LAST_BODY. Returns 0 only
# on a 2xx. Never passes -f: with -f curl suppresses the error body, and -f
# together with -w concatenates the status onto whatever was already written
# (the trap behind issue #205).
mgmt_request() {
  local method="$1" path="$2" body="${3:-}"
  local tmp
  tmp=$(mktemp)
  set -- -sS --max-time 30 -o "$tmp" -w '%{http_code}' \
    -X "$method" -H "$(auth_header)" -H "Content-Type: application/json"
  if [ -n "$body" ]; then set -- "$@" -d "$body"; fi
  # `VAR=$(cmd)` is a simple command, so under `set -e` a curl that exits
  # non-zero kills the caller before the next line runs — and the whole point
  # of this function is to survive that and report it. It happens to work
  # today only because every call site is inside an `if`, which suspends
  # `set -e`; a direct call exits 7 with nothing printed. The `|| rc=$?` makes
  # it an AND-OR list, which `set -e` leaves alone.
  local status rc=0
  status=$(curl "$@" "${MGMT_API}${path}" 2>/dev/null) || rc=$?
  MGMT_LAST_STATUS="$status"
  MGMT_LAST_CURL_RC="$rc"
  MGMT_LAST_BODY=$(head -c 4000 "$tmp" 2>/dev/null || true)
  rm -f "$tmp"
  [ "$MGMT_LAST_CURL_RC" -eq 0 ] || return 1
  case "$MGMT_LAST_STATUS" in 2??) return 0 ;; *) return 1 ;; esac
}

# mgmt_explain_failure <url> — one place that says what went wrong, so the
# next person does not have to reproduce it to find out.
mgmt_explain_failure() {
  log "  ${1}"
  if [ "${MGMT_LAST_CURL_RC:-0}" -ne 0 ]; then
    log "  no HTTP response: curl exited ${MGMT_LAST_CURL_RC} (6=DNS, 7=refused, 28=timeout)"
    log "  the app is probably scaled to zero, or that port is not on its ingress"
    return
  fi
  log "  HTTP ${MGMT_LAST_STATUS:-none}"
  if [ -n "${MGMT_LAST_BODY:-}" ]; then
    log "  body: $(printf '%s' "$MGMT_LAST_BODY" | tr '\n' ' ' | cut -c1-300)"
  else
    log "  body: (empty)"
  fi
}

# mgmt_fetch_participants — leaves the participant list in
# MGMT_PARTICIPANTS_JSON and returns 0, or explains the failure and returns 1.
# Rebinds MGMT_V when this control plane serves a different version segment.
mgmt_fetch_participants() {
  local v tried="" first_v="$MGMT_V"
  MGMT_PARTICIPANTS_JSON=""
  # Deliberate word splitting: MGMT_V_CANDIDATES is a space-separated list.
  # shellcheck disable=SC2086
  for v in "$MGMT_V" $MGMT_V_CANDIDATES; do
    case " $tried " in *" $v "*) continue ;; esac
    tried="${tried} ${v}"
    if mgmt_request GET "/${v}/participants"; then
      if [ "$v" != "$first_v" ]; then
        log "  Management API is ${v}, not ${first_v} — using ${v} for this run"
        MGMT_V="$v"
      fi
      MGMT_PARTICIPANTS_JSON="$MGMT_LAST_BODY"
      # An empty list is a different problem from an unreachable API, and the
      # suites used to report both as "no context found for <slug>" three
      # times over. Say it once, plainly, so a seeding gap is not read as a
      # transport gap again (issue #307).
      if [ "$(printf '%s' "$MGMT_PARTICIPANTS_JSON" | tr -d ' \n')" = "[]" ]; then
        log "  the Management API answered on ${v} but holds no participant contexts"
        log "  every participant-scoped check below will be skipped: this is a"
        log "  seeding gap, not a transport one"
      fi
      return 0
    fi
    # Only a 404 means "wrong version segment". Anything else is the real
    # answer and trying further versions would bury it.
    case "${MGMT_LAST_STATUS:-}" in
      404) log "  ${MGMT_API}/${v}/participants -> 404, trying the next API version" ;;
      *) break ;;
    esac
  done
  log "ERROR: Cannot fetch the participant list from the Management API"
  mgmt_explain_failure "${MGMT_API}/${v}/participants"
  log "  versions tried:${tried}"
  return 1
}
