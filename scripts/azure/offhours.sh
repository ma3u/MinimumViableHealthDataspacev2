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
#
# The one place this logic lives. Two callers:
#   - the ACA jobs mvhd-offhours-stop and mvhd-offhours-start, on Azure's own
#     cron, signed in as the managed identity id-mvhd-offhours (ADR-058;
#     scripts/azure/18-offhours-jobs.sh). GitHub's scheduler dropped every
#     scheduled run on 2026-10-06 (#595), so it no longer triggers this;
#   - .github/workflows/aca-schedule.yml: a manual start or stop, and a
#     fallback cron an hour after the jobs, which finds nothing to do when the
#     job did its work.
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
  mvhd-cfm-obagent mvhd-cfm-regagent mvhd-cfm-edcvagent mvhd-cfm-kcagent
  mvhd-cfm-cp-shim
  mvhd-provision-mgr mvhd-tenant-mgr mvhd-issuerservice mvhd-identityhub
  mvhd-dp-omop mvhd-dp-fhir mvhd-siglet mvhd-controlplane
  mvhd-nats mvhd-claude-federation mvhd-keycloak mvhd-vault
  mvhd-observability
)
CORE_APPS=(mvhd-vault mvhd-keycloak mvhd-claude-federation mvhd-neo4j mvhd-nats
           mvhd-neo4j-proxy mvhd-catalog-enricher mvhd-observability)
EDC_APPS=(mvhd-controlplane mvhd-siglet mvhd-dp-fhir mvhd-dp-omop
          mvhd-identityhub mvhd-issuerservice mvhd-tenant-mgr mvhd-provision-mgr)
CFM_APPS=(mvhd-cfm-cp-shim mvhd-cfm-kcagent mvhd-cfm-edcvagent mvhd-cfm-regagent mvhd-cfm-obagent)

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

  # A stop, not min=0: scale-to-zero only reaches zero for an app nobody calls
  # (PR #482). A stopped app keeps its revision and scale.
  log "stopping ${#BACKEND_APPS[@]} apps"
  "${SCRIPT_DIR}/set-app-power.sh" stop "${BACKEND_APPS[@]}"

  # Last, because Keycloak, Vault and the EDC services hold connections to it.
  local state
  state=$(pg_state); log "$PG_FLEX_NAME: $state"
  if [ "$state" = Ready ]; then
    az postgres flexible-server stop --name "$PG_FLEX_NAME" --resource-group "$RESOURCE_GROUP" -o none
  fi
  state=$(pg_state)
  [ "$state" = Stopped ] || { error "$PG_FLEX_NAME is '$state' after the stop (expected Stopped)"; exit 1; }
  log "stopped: UI offline at min=0, ${#BACKEND_APPS[@]} apps and $PG_FLEX_NAME"
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

  log "core apps"
  "${SCRIPT_DIR}/set-app-power.sh" start "${CORE_APPS[@]}" || warn "Not every core app reported running, see above"
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

  # NATS consumers with no ingress: nothing wakes them from zero (#318).
  log "CFM shim and agents"
  "${SCRIPT_DIR}/set-app-power.sh" start "${CFM_APPS[@]}" || warn "Not every CFM app reported running, see above"
  scale 1 1 "${CFM_APPS[@]}"

  log "Vault bootstrap job"
  az containerapp job start --name mvhd-vault-bootstrap --resource-group "$RESOURCE_GROUP" -o none ||
    warn "Vault bootstrap job start failed"

  # Last, so a visitor sees the offline notice until the stack is up.
  log "UI out of offline mode"
  az containerapp update --name mvhd-ui --resource-group "$RESOURCE_GROUP" \
    --min-replicas 1 --max-replicas 3 --set-env-vars LIVE_DEMO_OFFLINE=false -o none
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
  log "started: Postgres, $(( ${#CORE_APPS[@]} + ${#EDC_APPS[@]} + ${#CFM_APPS[@]} )) apps, UI online"
}

case "${1:-}" in
  decide)     decide "${2:-}" ;;
  stop)       do_stop ;;
  start)      do_start ;;
  auto-stop)  a=$(decide stop);  log "decision: $a"; [ "$a" = stop ]  && do_stop;  true ;;
  auto-start) a=$(decide start); log "decision: $a"; [ "$a" = start ] && do_start; true ;;
  *) sed -n '5,10p' "$0"; exit 64 ;;
esac
