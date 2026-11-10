#!/usr/bin/env bash
# =============================================================================
# The cfm database and the 0.18 Vault keys, from inside the environment (#927)
# =============================================================================
# Runs INSIDE the ACA environment, as the job edc-retire-v018-azure.yml creates:
# the Flexible Server admits only Azure addresses, and Vault and IdentityHub
# have internal ingress only.
#
#   MODE=plan    list what cfm holds and which Vault keys would go; change nothing
#   MODE=apply   empty cfm, delete those keys
#   SCOPE=all | databases | vault-keys
#
# cfm (ADR-085): the 2026-03 CFM managers' tables go, the database stays for
# eclipse-cfm 0.0.7. Every schema other than public is dropped and public is
# emptied (tables, views, sequences, routines, types), except what belongs to
# an extension. The schema itself and the database's grants stay.
#
# Vault: the keys 0.18 read, for the five demo participants, and nothing else:
#   secret/<slug>-private-key-alias                         (vault-bootstrap-participant-keys.yml)
#   secret/did%3Aweb%3Amvhd-identityhub%253A7083%3A<slug>%23key1
#   secret/did:web:mvhd-identityhub%3A7083:<slug>#key1     (the same alias, unencoded)
# Exact names only. EDC 1.0's aliases start the same way and end in @<context>
# (scripts/seed-identityhub-participants.sh, #881 finding 18), so a prefix
# match would take the keys 1.0 signs with. The issuer's #key-1, transit
# signing-siglet and every other entry stay. Before deleting, the script reads
# every IdentityHub key pair and refuses if one still names a key it would
# delete.
#
# Environment (from the job definition): MODE, SCOPE, PGHOST, PGUSER,
# PGDATABASE, PGSSLMODE, VAULT_ADDR, KC, IH; secrets PGPASSWORD, VAULT_TOKEN,
# ADMIN_SECRET.
# =============================================================================
set -uo pipefail
MODE="${MODE:-plan}"
SCOPE="${SCOPE:-all}"
SLUGS=(alpha-klinik pharmaco medreg lmc irs)
DID_HOST_ENC='mvhd-identityhub%253A7083'
DID_HOST_RAW='mvhd-identityhub%3A7083'

log()  { printf '[retire] %s\n' "$*"; }
fail() { printf '[retire] FAIL %s\n' "$*"; exit 1; }

case "$MODE" in plan | apply) ;; *) fail "MODE must be plan or apply, not ${MODE}" ;; esac
case "$SCOPE" in all | databases | vault-keys) ;; *) fail "SCOPE must be all, databases or vault-keys" ;; esac

# ── cfm ─────────────────────────────────────────────────────────────────────
# Every relation, routine and type outside the system schemas that no
# extension owns. The same predicate decides what is listed, what is dropped
# and what must be left afterwards.
USER_OBJECTS_SQL="
with ext as (select objid from pg_depend where deptype = 'e'),
sys as (select oid from pg_namespace
        where nspname in ('pg_catalog', 'information_schema')
           or nspname like 'pg\\_toast%' or nspname like 'pg\\_temp%')
select n.nspname || '.' || c.relname || ' (' || c.relkind::text || ')'
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where c.relkind in ('r', 'p', 'v', 'm', 'S', 'f')
   and n.oid not in (select oid from sys) and c.oid not in (select objid from ext)
union all
select n.nspname || '.' || p.proname || ' (routine)'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.oid not in (select oid from sys) and p.oid not in (select objid from ext)
   and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'i')
union all
select n.nspname || '.' || t.typname || ' (type)'
  from pg_type t join pg_namespace n on n.oid = t.typnamespace
 where (t.typtype in ('e', 'd', 'r')
        or (t.typtype = 'c' and exists (select 1 from pg_class k where k.oid = t.typrelid and k.relkind = 'c')))
   and n.oid not in (select oid from sys) and t.oid not in (select objid from ext)
union all
select n.nspname || ' (schema)'
  from pg_namespace n
 where n.oid not in (select oid from sys) and n.nspname <> 'public'
   and n.oid not in (select objid from ext)
order by 1"

EMPTY_SQL="
do \$\$
declare r record;
begin
  for r in select n.nspname from pg_namespace n
            where n.nspname not in ('public', 'pg_catalog', 'information_schema')
              and n.nspname not like 'pg\\_%'
              and not exists (select 1 from pg_depend d where d.objid = n.oid and d.deptype = 'e')
  loop
    execute format('drop schema %I cascade', r.nspname);
  end loop;
  for r in select c.relname, c.relkind from pg_class c
            where c.relnamespace = 'public'::regnamespace
              and c.relkind in ('v', 'm', 'r', 'p', 'f', 'S')
              and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e')
            order by case c.relkind when 'v' then 0 when 'm' then 1 when 'S' then 3 else 2 end
  loop
    execute format('drop %s if exists public.%I cascade',
      case r.relkind when 'v' then 'view' when 'm' then 'materialized view'
                     when 'S' then 'sequence' when 'f' then 'foreign table' else 'table' end,
      r.relname);
  end loop;
  -- Types before routines: a range type owns its constructor functions.
  for r in select t.oid from pg_type t
            where t.typnamespace = 'public'::regnamespace
              and (t.typtype in ('e', 'd', 'r')
                   or (t.typtype = 'c' and exists (select 1 from pg_class k
                                                    where k.oid = t.typrelid and k.relkind = 'c')))
              and not exists (select 1 from pg_depend d where d.objid = t.oid and d.deptype = 'e')
  loop
    if exists (select 1 from pg_type where oid = r.oid) then
      execute format('drop type %s cascade', r.oid::regtype);
    end if;
  end loop;
  for r in select p.oid, p.prokind from pg_proc p
            where p.pronamespace = 'public'::regnamespace
              and not exists (select 1 from pg_depend d
                               where d.objid = p.oid and d.deptype in ('e', 'i'))
  loop
    if exists (select 1 from pg_proc where oid = r.oid) then
      execute format('drop %s %s cascade',
        case r.prokind when 'p' then 'procedure' when 'a' then 'aggregate' else 'function' end,
        r.oid::regprocedure);
    end if;
  end loop;
end
\$\$;"

psql_q() { psql -X -q -v ON_ERROR_STOP=1 -At "$@"; }

do_cfm() {
  log "cfm on ${PGHOST}"
  psql_q -c "select 1" >/dev/null || fail "cannot reach ${PGDATABASE} on ${PGHOST}"
  log "  owner $(psql_q -c "select pg_get_userbyid(datdba) from pg_database where datname = current_database()"), size $(psql_q -c "select pg_size_pretty(pg_database_size(current_database()))")"

  local tables
  tables=$(psql_q -c "select quote_ident(schemaname) || '.' || quote_ident(relname) from pg_stat_user_tables order by 1") ||
    fail "cannot list cfm's tables"
  if [ -n "$tables" ]; then
    log "  tables and their rows:"
    local t rows
    while IFS= read -r t; do
      [ -n "$t" ] || continue
      rows=$(psql_q -c "select count(*) from ${t}" 2>/dev/null || echo "?")
      log "    ${t}: ${rows}"
    done <<<"$tables"
  fi
  local objects n
  objects=$(psql_q -c "$USER_OBJECTS_SQL") || fail "cannot list cfm's objects"
  n=$(grep -c . <<<"$objects" || true)
  log "  ${n} objects outside the system schemas that no extension owns"
  [ "$n" -eq 0 ] || sed 's/^/[retire]     /' <<<"$objects"

  if [ "$MODE" = plan ]; then
    log "  plan: apply would drop these and keep the database"
    return 0
  fi
  if [ "$n" -eq 0 ]; then
    log "  cfm is already empty"
    return 0
  fi
  psql_q -1 -c "$EMPTY_SQL" || fail "could not empty cfm"
  objects=$(psql_q -c "$USER_OBJECTS_SQL") || fail "cannot list cfm's objects after emptying it"
  n=$(grep -c . <<<"$objects" || true)
  if [ "$n" -ne 0 ]; then
    sed 's/^/[retire]     left: /' <<<"$objects"
    fail "cfm still holds ${n} objects"
  fi
  log "  cfm is empty; the database stays (ADR-085)"
}

# ── Vault ───────────────────────────────────────────────────────────────────
vault_get()  { curl -sk --max-time 30 -H "X-Vault-Token: ${VAULT_TOKEN}" "${VAULT_ADDR%/}/v1/$1"; }
# Fails on an error answer or a missing path (Vault answers a LIST of an empty
# folder with 404), so the caller decides whether that is fatal.
vault_list() { vault_get "$1?list=true" | jq -er '.data.keys[]'; }
urlenc() { jq -rn --arg s "$1" '$s|@uri'; }

do_vault() {
  log "Vault at ${VAULT_ADDR}"
  local health
  health=$(curl -sk --max-time 30 -o /dev/null -w '%{http_code}' "${VAULT_ADDR%/}/v1/sys/health")
  [ "$health" = 200 ] || fail "Vault answers ${health} on sys/health (sealed, standby or stopped)"

  local targets=() s
  for s in "${SLUGS[@]}"; do
    targets+=("${s}-private-key-alias"
              "did%3Aweb%3A${DID_HOST_ENC}%3A${s}%23key1"
              "did:web:${DID_HOST_RAW}:${s}#key1")
  done

  local keys
  keys=$(vault_list secret/metadata/) || fail "cannot list secret/"
  local delete=() keep=0 k t hit
  while IFS= read -r k; do
    [ -n "$k" ] || continue
    hit=0
    for t in "${targets[@]}"; do [ "$k" = "$t" ] && hit=1 && break; done
    if [ "$hit" -eq 1 ]; then delete+=("$k"); else keep=$((keep + 1)); log "  keep     secret/${k}"; fi
  done <<<"$keys"
  log "  ${keep} entries in secret/ stay; ${#delete[@]} are 0.18 keys:"
  # ${a[@]+...}: an empty array is unbound under set -u in bash before 4.4.
  for k in ${delete[@]+"${delete[@]}"}; do log "  delete   secret/${k}"; done

  # The same 0.18 alias form anywhere under participants/ is reported, not
  # deleted: nothing in #927 puts it there, so finding it needs a person.
  local ctxs c e
  ctxs=$(vault_list participants/metadata/ || true)
  while IFS= read -r c; do
    [ -n "$c" ] || continue
    while IFS= read -r e; do
      case "$e" in
        *%23key1) log "  NOTE     participants/${c}identityhub/${e} has the 0.18 alias form; left in place" ;;
      esac
    done < <(vault_list "participants/metadata/${c}identityhub/" || true)
  done <<<"$ctxs"
  log "  $(grep -c . <<<"$ctxs" || true) participant folders under participants/ (not touched)"

  # The guard: no key pair IdentityHub knows names an alias in the delete set.
  local token parts ctx aliases
  token=$(curl -sS --max-time 20 -X POST "${KC}/realms/edcv/protocol/openid-connect/token" \
    --data-urlencode grant_type=client_credentials --data-urlencode client_id=admin \
    --data-urlencode "client_secret=${ADMIN_SECRET}" | jq -r '.access_token // empty')
  [ -n "$token" ] || fail "no token for the admin client; cannot check IdentityHub's key pairs"
  parts=$(curl -sS --max-time 30 -H "Authorization: Bearer ${token}" "${IH}/v1/participants" |
    jq -r 'if type == "array" then .[].participantContextId else error("not a list") end') ||
    fail "IdentityHub did not list its participants"
  aliases=""
  while IFS= read -r ctx; do
    [ -n "$ctx" ] || continue
    aliases+=$(curl -sS --max-time 30 -H "Authorization: Bearer ${token}" \
      "${IH}/v1/participants/$(urlenc "$ctx")/keypairs" |
      jq -r 'if type == "array" then .[].privateKeyAlias // empty else error("not a list") end') ||
      fail "IdentityHub did not list the key pairs of ${ctx}"
    aliases+=$'\n'
  done <<<"$parts"
  log "  IdentityHub: $(grep -c . <<<"$parts" || true) participants, $(grep -c . <<<"$aliases" || true) key pairs"
  local in_use=()
  for k in ${delete[@]+"${delete[@]}"}; do
    # The alias as IdentityHub records it, unencoded.
    local raw
    raw=$(printf '%s' "$k" | python3 -c 'import sys, urllib.parse; print(urllib.parse.unquote(sys.stdin.read()))')
    if grep -qxF -e "$k" -e "$raw" <<<"$aliases"; then in_use+=("$k"); fi
  done
  if [ "${#in_use[@]}" -gt 0 ]; then
    for k in ${in_use[@]+"${in_use[@]}"}; do log "  IN USE   secret/${k} is a key pair's alias in IdentityHub"; done
    fail "refusing: a key IdentityHub still names would be deleted"
  fi
  log "  ok       no IdentityHub key pair names a key in the delete set"

  if [ "$MODE" = plan ]; then
    log "  plan: apply would delete the ${#delete[@]} entries above, all versions"
    return 0
  fi
  local code
  for k in ${delete[@]+"${delete[@]}"}; do
    code=$(curl -sk --max-time 30 -o /dev/null -w '%{http_code}' -X DELETE \
      -H "X-Vault-Token: ${VAULT_TOKEN}" "${VAULT_ADDR%/}/v1/secret/metadata/$(urlenc "$k")")
    case "$code" in
      204 | 200) log "  deleted  secret/${k}" ;;
      *) fail "deleting secret/${k} answered ${code}" ;;
    esac
  done
  local left
  left=$(vault_list secret/metadata/)
  for k in ${delete[@]+"${delete[@]}"}; do
    grep -qxF "$k" <<<"$left" && fail "secret/${k} is still listed"
  done
  log "  the 0.18 keys are gone; $(grep -c . <<<"$left" || true) entries in secret/ remain"
}

log "mode ${MODE}, scope ${SCOPE}"
case "$SCOPE" in all | databases) do_cfm ;; esac
case "$SCOPE" in all | vault-keys) do_vault ;; esac
log "done"
