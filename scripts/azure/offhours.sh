#!/usr/bin/env bash
# =============================================================================
# The off-hours stop and the morning start of the live demo (ADR-053, ADR-058)
# =============================================================================
#   offhours.sh decide start|stop   print what a scheduled run should do:
#                                   start, stop or noop (reads Azure, changes nothing)
#   offhours.sh stop                stop: UI offline, every other app, then Postgres
#   offhours.sh start               start: Postgres, the apps in order, UI online last
#   offhours.sh auto-stop           decide stop, then do it (the scheduled path)
#   offhours.sh auto-start          decide start, then do it
#   offhours.sh idle-stop           stop each SPE workspace idle for
#                                   SPE_IDLE_STOP_MINUTES (default 30, ADR-072)
#
# The one place this logic lives. Two callers:
#   - the ACA jobs mvhd-offhours-stop and mvhd-offhours-start, on Azure's own
#     cron, signed in as the managed identity id-mvhd-offhours (ADR-058;
#     scripts/azure/18-offhours-jobs.sh). GitHub's scheduler dropped every
#     scheduled run on 2026-10-06 (#595), so it no longer triggers this;
#   - .github/workflows/aca-schedule.yml: a manual start or stop, and a
#     fallback cron an hour after the jobs, which finds nothing to do when the
#     job did its work.
#   - the ACA job mvhd-spe-idle-stop, every 15 minutes: idle-stop (ADR-072).
#
# The SPE workspaces (ADR-069) start on demand (ADR-072): the evening stop
# stops them, the morning start leaves them stopped, and the hub starts one
# when an operator presses Start or a federated query needs it. idle-stop
# stops one nobody has queried for SPE_IDLE_STOP_MINUTES.
#   SPE_START_WITH_STACK=true   the morning start starts them again, as
#                               before ADR-072 (default false)
#   SPE_IDLE_STOP_MINUTES=0     idle-stop stops nothing
#   SPE_STATUS_URL              where idle-stop reads lastQueriedAt (the
#                               proxy's /spe/status, internal ingress)
#
# Holds (stop skipped):
#   KEEP_UP_DATES          Berlin dates, space separated (below, in the repo)
#   live-demo-hold-until   tag on the app mvhd-ui, an ISO instant (UTC). The
#                          Azure job can read it, and Container Apps
#                          Contributor can write it (runbook live-demo-off-hours.md):
#                          az resource update -g rg-mvhd-dev -n mvhd-ui \
#                            --resource-type Microsoft.App/containerApps \
#                            --set tags.live-demo-hold-until=2026-10-10T22:00Z
#   LIVE_DEMO_HOLD_UNTIL   the same as an environment variable (the workflow
#                          passes its repository variable; the job cannot read
#                          that, so a hold for the job is the tag)
#
# Needs: az signed in (the identity above, or the CI identity), curl, jq,
# python3 (the Berlin holiday calendar is pip-installed on demand).
# =============================================================================
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export RESOURCE_GROUP="${RESOURCE_GROUP:-rg-mvhd-dev}"
PG_FLEX_NAME="${PG_FLEX_NAME:-mvhd-pg-b53a0449}"
KEYCLOAK_PUBLIC_HOSTNAME="${KEYCLOAK_PUBLIC_HOSTNAME:-auth.ehds.mabu.red}"
# The UI's replica range for the day (ADR-061; the same numbers as
# UI_MIN_REPLICAS/UI_MAX_REPLICAS in env.sh, which this script does not source).
UI_MIN_REPLICAS="${UI_MIN_REPLICAS:-1}"
UI_MAX_REPLICAS="${UI_MAX_REPLICAS:-6}"

# Dates (Europe/Berlin) on which the evening stop is skipped, so the stack
# runs through the night into the next scheduled stop. One reason per date:
#   2026-10-14  HL7 AI Challenge Winners Showcase webinar, 11:00 EDT
#               (17:00 Berlin), and the demo must still answer at 20:00 EDT
#               (02:00 Berlin, 15 Oct) for anyone who opens it afterwards.
KEEP_UP_DATES="${KEEP_UP_DATES:-2026-10-14}"

# ADR-053: every Container App except the UI, consumers first, dependencies
# last, then the database.
BACKEND_APPS=(
  mvhd-catalog-enricher mvhd-neo4j-proxy mvhd-neo4j
  mvhd-issuerservice mvhd-identityhub mvhd-siglet mvhd-controlplane
  mvhd-nats mvhd-claude-federation mvhd-keycloak mvhd-vault
  mvhd-observability
)
CORE_APPS=(mvhd-vault mvhd-keycloak mvhd-claude-federation mvhd-neo4j mvhd-nats
           mvhd-neo4j-proxy mvhd-catalog-enricher mvhd-observability)
# EDC 1.0 (ADR-078): the control plane, siglet as its data plane, the
# IdentityHub and the IssuerService.
EDC_APPS=(mvhd-controlplane mvhd-siglet mvhd-identityhub mvhd-issuerservice)
# CFM from our fork (ADR-088, 20-cfm-fork.sh), each left out while it does not
# exist. They read Postgres and NATS, so they stop first and start after the
# EDC apps; the managers before the agents, since a manager creates the NATS
# bucket the agents open (docs/knowledge/runbooks/cfm-fork.md).
CFM_APPS=(mvhd-cfm-pmanager mvhd-cfm-tmanager mvhd-cfm-agents)
# The two SPE workspaces, ACI confidential container groups, and the access
# body's Trustee on ACA (ADR-069), from the moment 21-aci-confidential-spe.sh
# has created them; each is left out while it does not exist. A stopped ACI
# group bills nothing, and each start re-attests and reloads its workspace
# from the sealed extract: nothing row-level survives a stop, by design.
SPE_GROUPS=(mvhd-spe-1 mvhd-spe-2)
TRUSTEE_APP="${TRUSTEE_APP:-mvhd-trustee}"
# ADR-072: off by default, started on demand; true restores the morning start.
SPE_START_WITH_STACK="${SPE_START_WITH_STACK:-false}"
SPE_IDLE_STOP_MINUTES="${SPE_IDLE_STOP_MINUTES:-30}"
SPE_STATUS_URL="${SPE_STATUS_URL:-http://mvhd-neo4j-proxy/spe/status}"

# GitHub annotations when run there, plain lines anywhere else.
gh_mark() { if [ -n "${GITHUB_ACTIONS:-}" ]; then echo "::$1::$2"; else echo "$(tr '[:lower:]' '[:upper:]' <<<"$1"): $2"; fi; }
error()   { gh_mark error "$*" >&2; }
warn()    { gh_mark warning "$*" >&2; }
# stderr: decide prints its answer on stdout, and $(decide ...) must get
# only that (the trap of #307).
log()     { echo "[offhours] $*" >&2; }

ui_flag()     { az containerapp show --name mvhd-ui --resource-group "$RESOURCE_GROUP" \
                  --query "properties.template.containers[0].env[?name=='LIVE_DEMO_OFFLINE'].value | [0]" -o tsv; }
vault_state() { az containerapp show --name mvhd-vault --resource-group "$RESOURCE_GROUP" \
                  --query properties.runningStatus -o tsv; }
pg_state()    { az postgres flexible-server show --name "$PG_FLEX_NAME" --resource-group "$RESOURCE_GROUP" \
                  --query state -o tsv 2>/dev/null || echo unknown; }
cfm_apps() {  # the CFM apps that exist, in start order, one per line
  local a
  for a in "${CFM_APPS[@]}"; do
    az containerapp show --name "$a" --resource-group "$RESOURCE_GROUP" --query name -o tsv >/dev/null 2>&1 && echo "$a"
  done
  return 0
}
trustee_present() { az containerapp show --name "$TRUSTEE_APP" --resource-group "$RESOURCE_GROUP" \
                      --query name -o tsv >/dev/null 2>&1; }
spe_groups() {  # the SPE container groups that exist, one per line
  local g
  for g in "${SPE_GROUPS[@]}"; do
    az container show --name "$g" --resource-group "$RESOURCE_GROUP" --query name -o tsv >/dev/null 2>&1 && echo "$g"
  done
  return 0
}
spe_power() {  # spe_power stop|start: both SPE groups, in order, those that exist
  local verb="$1" g
  while read -r g; do
    [ -n "$g" ] || continue
    log "  $g: az container $verb"
    az container "$verb" --name "$g" --resource-group "$RESOURCE_GROUP" -o none ||
      warn "az container $verb $g failed"
  done < <(spe_groups)
}
# Not ${1,,}: macOS runs this with bash 3.2.
is_true() { case "${1:-}" in true|TRUE|True|1|yes|on) return 0 ;; *) return 1 ;; esac; }
# ISO-8601 to epoch seconds; empty for anything it cannot read. python3, not
# date -d: the same on GNU (the job's image) and BSD (a Mac).
to_epoch() {
  [ -n "${1:-}" ] || return 0
  python3 -c 'import sys, re, datetime
t = re.sub(r"\.[0-9]+", "", sys.argv[1].strip()).replace("Z", "+00:00")
try:
    d = datetime.datetime.fromisoformat(t)
    if d.tzinfo is None: d = d.replace(tzinfo=datetime.timezone.utc)
    print(int(d.timestamp()))
except ValueError:
    pass' "$1" 2>/dev/null || true
}
scale() {  # scale <min> <max> <app>...
  local min="$1" max="$2" app; shift 2
  for app in "$@"; do
    log "  $app -> $min/$max"
    az containerapp update --name "$app" --resource-group "$RESOURCE_GROUP" \
      --min-replicas "$min" --max-replicas "$max" -o none || warn "Failed to scale $app"
  done
}

# ── decide ──────────────────────────────────────────────────────────────────
hold_until() {
  local tag
  tag=$(az containerapp show --name mvhd-ui --resource-group "$RESOURCE_GROUP" \
    --query "tags.\"live-demo-hold-until\"" -o tsv 2>/dev/null || true)
  # The later of the tag and the variable wins.
  printf '%s\n%s\n' "${tag:-}" "${LIVE_DEMO_HOLD_UNTIL:-}" | while read -r t; do
    [ -n "$t" ] && date -u -d "$t" +%s 2>/dev/null
  done | sort -n | tail -1
}

decide() {
  local today
  today=$(TZ=Europe/Berlin date +%F)
  case "$1" in
    start)
      python3 -c "import holidays" 2>/dev/null || python3 -m pip install --quiet holidays >/dev/null 2>&1 \
        || python3 -m pip install --quiet --break-system-packages holidays >/dev/null 2>&1 || true
      python3 -c "import holidays" 2>/dev/null ||
        warn "the Berlin holiday calendar (python holidays) is not available: starting as on a working day"
      # Skip the morning start on Berlin public holidays, or a weekday holiday
      # runs the whole stack 07:00 to 20:00 for nobody. subdiv BE = Land Berlin.
      if [ "$(python3 -c "import holidays, datetime as t; print(1 if t.date.fromisoformat('$today') in holidays.Germany(subdiv='BE') else 0)" 2>/dev/null || echo 0)" = 1 ]; then
        log "Berlin public holiday ($today): no start"; echo noop
      elif [ "$(ui_flag)" = false ]; then
        log "the UI is out of offline mode: a start has finished today"; echo noop
      else
        echo start
      fi ;;
    stop)
      local hold
      hold=$(hold_until || true)
      if [ -n "$hold" ] && [ "$(date -u +%s)" -lt "$hold" ]; then
        log "held until $(date -u -d "@$hold" +%FT%RZ): no stop"; echo noop
      elif [[ " $KEEP_UP_DATES " == *" $today "* ]]; then
        log "keep-up date ($today): no stop"; echo noop
      elif [ "$(ui_flag)" = true ] && [ "$(vault_state)" = Stopped ]; then
        log "the UI is offline and Vault is stopped: a stop has finished"; echo noop
      else
        echo stop
      fi ;;
    *) error "decide start|stop"; exit 64 ;;
  esac
}

# ── idle stop (ADR-072) ─────────────────────────────────────────────────────
# A workspace is idle when neither its last query (the proxy's lastQueriedAt)
# nor its start (ARM, the neo4j container's start time) is within
# SPE_IDLE_STOP_MINUTES. A hold or a keep-up date skips it, as it skips the
# evening stop, so a demo never meets a cold start. The proxy unreachable
# means nobody can query a workspace: its start time alone decides. A start
# time ARM does not report leaves the group running (the evening stop still
# comes).
idle_stop() {
  local minutes="$SPE_IDLE_STOP_MINUTES" now today hold status g id state started last ref idle
  if ! [[ "$minutes" =~ ^[0-9]+$ ]] || [ "$minutes" -eq 0 ]; then
    log "idle stop off (SPE_IDLE_STOP_MINUTES=${minutes})"; return 0
  fi
  now="${OFFHOURS_NOW:-$(date -u +%s)}"
  today=$(TZ=Europe/Berlin date +%F)
  hold=$(hold_until || true)
  if [ -n "$hold" ] && [ "$now" -lt "$hold" ]; then
    log "held until $hold (epoch): no idle stop"; return 0
  fi
  if [[ " $KEEP_UP_DATES " == *" $today "* ]]; then
    log "keep-up date ($today): no idle stop"; return 0
  fi
  status=$(curl -sf --max-time 20 "$SPE_STATUS_URL" 2>/dev/null || true)
  if [ -z "$status" ] || ! jq -e '.spes | type == "array"' >/dev/null 2>&1 <<<"$status"; then
    log "the proxy's /spe/status did not answer: start times alone decide"
    status='{"spes":[]}'
  fi
  while read -r g; do
    [ -n "$g" ] || continue
    id="SPE-${g##*-}"
    state=$(az container show --name "$g" --resource-group "$RESOURCE_GROUP" \
      --query instanceView.state -o tsv 2>/dev/null || true)
    if [ "$state" != Running ]; then
      log "  $g: ${state:-unknown}, nothing to stop"; continue
    fi
    started=$(az container show --name "$g" --resource-group "$RESOURCE_GROUP" \
      --query "containers[?name=='neo4j'] | [0].instanceView.currentState.startTime" -o tsv 2>/dev/null || true)
    last=$(jq -r --arg id "$id" '.spes[]? | select(.id == $id) | .lastQueriedAt // empty' <<<"$status")
    started=$(to_epoch "$started"); last=$(to_epoch "$last")
    if [ -z "$started" ]; then
      warn "$g runs, but ARM reports no start time: left running"; continue
    fi
    ref="$started"
    if [ -n "$last" ] && [ "$last" -gt "$ref" ]; then ref="$last"; fi
    idle=$(( (now - ref) / 60 ))
    if [ "$idle" -ge "$minutes" ]; then
      log "  $g: idle ${idle} min (>= ${minutes}): az container stop"
      az container stop --name "$g" --resource-group "$RESOURCE_GROUP" -o none ||
        warn "az container stop $g failed"
    else
      log "  $g: last used ${idle} min ago, keeps running"
    fi
  done < <(spe_groups)
}

# ── stop ────────────────────────────────────────────────────────────────────
do_stop() {
  # First, so no visitor reaches a page whose backend is going away. At min=0
  # a visitor wakes the UI, it answers with the offline notice, and it scales
  # back to zero. One update carries the flag and the scale together.
  log "UI into offline mode"
  az containerapp update --name mvhd-ui --resource-group "$RESOURCE_GROUP" \
    --min-replicas 0 --max-replicas 1 --set-env-vars LIVE_DEMO_OFFLINE=true -o none
  local min
  min=$(az containerapp show --name mvhd-ui --resource-group "$RESOURCE_GROUP" \
    --query "properties.template.scale.minReplicas" -o tsv)
  if [ "$(ui_flag)" != true ] || [ "$min" != 0 ]; then
    error "mvhd-ui LIVE_DEMO_OFFLINE=$(ui_flag) minReplicas=$min (expected true, 0)"; exit 1
  fi

  # The SPE workspaces first: their memory-backed stores go with them, which
  # is the design (ADR-069); the morning start loads them afresh.
  log "SPE workspaces (ACI)"
  spe_power stop

  # A stop, not min=0: scale-to-zero only reaches zero for an app nobody calls
  # (PR #482). A stopped app keeps its revision and scale. Trustee goes with
  # the backend once the workspaces that ask it are down.
  # ${apps[@]+...}: bash before 4.4 (macOS /bin/bash 3.2, where the unit
  # test runs it) calls an empty array unbound under set -u.
  local -a apps=()
  local cfm
  while read -r cfm; do [ -n "$cfm" ] && apps=("$cfm" ${apps[@]+"${apps[@]}"}); done < <(cfm_apps)
  apps+=("${BACKEND_APPS[@]}")
  if trustee_present; then apps+=("$TRUSTEE_APP"); fi
  log "stopping ${#apps[@]} apps"
  "${SCRIPT_DIR}/set-app-power.sh" stop "${apps[@]}"

  # Last, because Keycloak, Vault and the EDC services hold connections to it.
  local state
  state=$(pg_state); log "$PG_FLEX_NAME: $state"
  if [ "$state" = Ready ]; then
    az postgres flexible-server stop --name "$PG_FLEX_NAME" --resource-group "$RESOURCE_GROUP" -o none
  fi
  state=$(pg_state)
  [ "$state" = Stopped ] || { error "$PG_FLEX_NAME is '$state' after the stop (expected Stopped)"; exit 1; }
  log "stopped: UI offline at min=0, ${#apps[@]} apps and $PG_FLEX_NAME"
}

# ── start ───────────────────────────────────────────────────────────────────
do_start() {
  # Keycloak, Vault and the EDC services crash-loop without their database,
  # so nothing else starts until it is Ready.
  local state
  state=$(pg_state); log "$PG_FLEX_NAME: $state"
  if [ "$state" = Stopped ]; then
    az postgres flexible-server start --name "$PG_FLEX_NAME" --resource-group "$RESOURCE_GROUP" -o none
  fi
  for _ in $(seq 1 30); do state=$(pg_state); [ "$state" = Ready ] && break; sleep 10; done
  [ "$state" = Ready ] || { error "$PG_FLEX_NAME is '$state', not Ready; the stack stays offline"; exit 1; }

  # A start brings back every active revision, and an old one without traffic
  # still runs replicas (an old Neo4j revision held the store lock, 2026-10-04).
  "${SCRIPT_DIR}/retire-stale-revisions.sh" || warn "A stale revision could not be deactivated, see above"

  # Trustee first: a workspace started on demand attests to it (ADR-069).
  # The workspaces themselves stay stopped until the hub starts one
  # (ADR-072); SPE_START_WITH_STACK=true starts them here as before, and the
  # proxy, among the core apps, reconnects to them as they finish loading.
  local -a core=("${CORE_APPS[@]}")
  if trustee_present; then core=("$TRUSTEE_APP" "${core[@]}"); fi
  log "core apps"
  "${SCRIPT_DIR}/set-app-power.sh" start "${core[@]}" || warn "Not every core app reported running, see above"
  if is_true "$SPE_START_WITH_STACK"; then
    log "SPE workspaces (ACI): SPE_START_WITH_STACK=${SPE_START_WITH_STACK}"
    spe_power start
  else
    log "SPE workspaces (ACI): left stopped, they start on demand (ADR-072)"
  fi
  scale 1 1 mvhd-neo4j mvhd-keycloak mvhd-vault mvhd-catalog-enricher mvhd-claude-federation
  # A scale change can make a new Neo4j revision; the old one keeps the lock.
  "${SCRIPT_DIR}/retire-stale-revisions.sh" mvhd-neo4j || warn "A stale mvhd-neo4j revision could not be deactivated, see above"
  scale 1 2 mvhd-neo4j-proxy
  scale 1 1 mvhd-nats
  log "waiting 75 s for Neo4j and Vault"; sleep 75

  # The edcv realm has gone missing after a stop and start (2026-09-14); it is
  # checked and re-imported on every start. Not fatal here: the login check
  # at the end is what fails the run.
  for _ in $(seq 1 30); do
    [ "$(curl -s -o /dev/null -w '%{http_code}' "https://${KEYCLOAK_PUBLIC_HOSTNAME}/realms/master/.well-known/openid-configuration" || true)" = 200 ] && break
    sleep 10
  done
  "${SCRIPT_DIR}/restore-keycloak-realm.sh" ||
    error "Keycloak realm could not be restored, so every sign-in on ${KEYCLOAK_PUBLIC_HOSTNAME} will fail"

  log "EDC apps (ADR-024)"
  "${SCRIPT_DIR}/set-app-power.sh" start "${EDC_APPS[@]}" || warn "Not every EDC app reported running, see above"
  scale 1 1 "${EDC_APPS[@]}"

  local -a cfm=()
  local a
  while read -r a; do [ -n "$a" ] && cfm+=("$a"); done < <(cfm_apps)
  if [ "${#cfm[@]}" -gt 0 ]; then
    log "CFM apps (ADR-088)"
    "${SCRIPT_DIR}/set-app-power.sh" start "${cfm[@]}" || warn "Not every CFM app reported running, see above"
  fi

  log "Vault bootstrap job"
  az containerapp job start --name mvhd-vault-bootstrap --resource-group "$RESOURCE_GROUP" -o none ||
    warn "Vault bootstrap job start failed"

  # Last, so a visitor sees the offline notice until the stack is up.
  log "UI out of offline mode"
  az containerapp update --name mvhd-ui --resource-group "$RESOURCE_GROUP" \
    --min-replicas "$UI_MIN_REPLICAS" --max-replicas "$UI_MAX_REPLICAS" \
    --set-env-vars LIVE_DEMO_OFFLINE=false -o none
  [ "$(ui_flag)" = false ] || { error "mvhd-ui LIVE_DEMO_OFFLINE=$(ui_flag) after the start (expected false)"; exit 1; }

  local fqdn code
  fqdn=$(az containerapp show --name mvhd-ui --resource-group "$RESOURCE_GROUP" \
    --query properties.configuration.ingress.fqdn -o tsv)
  for i in $(seq 1 30); do
    code=$(curl -sf -o /dev/null -w '%{http_code}' "https://${fqdn}" 2>/dev/null || echo 000)
    [ "$code" = 200 ] && { log "UI healthy after $((i * 10)) s"; break; }
    sleep 10
  done
  [ "$code" = 200 ] || warn "UI did not return 200 within 300 s"

  # The one check allowed to fail the start: a stack that cannot serve a
  # login is not started, whatever the steps above said (2026-09-30).
  "${SCRIPT_DIR}/check-keycloak-health.sh" "https://${KEYCLOAK_PUBLIC_HOSTNAME}" edcv
  log "started: Postgres, $(( ${#core[@]} + ${#EDC_APPS[@]} )) apps, UI online"
}

case "${1:-}" in
  decide)     decide "${2:-}" ;;
  stop)       do_stop ;;
  start)      do_start ;;
  auto-stop)  a=$(decide stop);  log "decision: $a"; [ "$a" = stop ]  && do_stop;  true ;;
  auto-start) a=$(decide start); log "decision: $a"; [ "$a" = start ] && do_start; true ;;
  # auto-idle-stop: the name the ACA job's "auto-${ACTION}" gives it.
  idle-stop|auto-idle-stop) idle_stop ;;
  *) sed -n '5,12p' "$0"; exit 64 ;;
esac
