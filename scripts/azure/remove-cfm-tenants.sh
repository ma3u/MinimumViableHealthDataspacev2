#!/usr/bin/env bash
# =============================================================================
# Remove failed CFM test tenants from Azure, everywhere they left a trace (#574)
# =============================================================================
# Runs INSIDE the ACA environment, as the job cfm-remove-tenants.yml creates.
# The Tenant Manager cannot do it: DisposeProfile refuses VPAs that are not
# active and DeleteTenant refuses a tenant with participants, which is every
# failed onboarding. So, per tenant, in this order (#577):
#
#   1. IdentityHub participant context   (ends an onboarding orchestration
#      still polling it: the agent's lookup fails and it acks the message)
#   2. control-plane participant context
#   3. the Keycloak clients CFM made     <ctx> and <ctx>-vault
#   4. the CFM rows, after a copy into removed_tenants / removed_participant_profiles
#      in the same database (a dump that keeps whatever secrets the rows hold
#      where they already are, rather than in a log)
#
# A tenant is found by its id; its contexts by the DID CFM recorded
# (participant_profiles.identifier), which the control plane holds as
# `identity` and IdentityHub as `did`.
#
#   MODE=plan   list what each tenant left and what would go; change nothing
#   MODE=apply  remove it
#
# A tenant whose activities are all active is refused: that is a working
# participant (Ostsee Klinikum Rostock, e7e2afc4-..., stays).
#
# Environment: MODE, TENANT_IDS (space or comma separated), CP, IH, KC,
# PGHOST, PGUSER, PGDATABASE=cfm, PGSSLMODE=require; secrets PGPASSWORD,
# ADMIN_SECRET (Keycloak client `admin`), PROVISIONER_SECRET (client
# `provisioner`), KC_ADMIN_PASSWORD (Keycloak master).
#
# IdentityHub wants the `admin` role claim; the control plane's participant API
# wants `provisioner`, as 05-cp-participants.sh creates the contexts with it.
# The admin token lists control-plane contexts but its DELETE is refused with
# 403 "Required user role not satisfied" (2026-10-07, Elbufer).
# =============================================================================
set -uo pipefail
MODE="${MODE:-plan}"
MGMT_V="${EDC_MGMT_API_VERSION:-v5beta}"
log()  { printf '[tenants] %s\n' "$*"; }
fail() { printf '[tenants] FAIL %s\n' "$*"; exit 1; }

IDS=$(printf '%s' "${TENANT_IDS:-}" | tr ',' ' ')
[ -n "${IDS// /}" ] || fail "TENANT_IDS is empty"
for t in $IDS; do
  [[ "$t" =~ ^[0-9a-f-]{36}$ ]] || fail "not a tenant id: $t"
done

psql_q() { psql -X -q -v ON_ERROR_STOP=1 -At "$@"; }
psql_q -c "select 1" >/dev/null || fail "cannot reach ${PGDATABASE} on ${PGHOST}"

ADMIN_TOKEN=$(curl -sS --max-time 20 -X POST "${KC}/realms/edcv/protocol/openid-connect/token" \
  --data-urlencode grant_type=client_credentials --data-urlencode client_id=admin \
  --data-urlencode "client_secret=${ADMIN_SECRET}" | jq -r '.access_token // empty')
[ -n "$ADMIN_TOKEN" ] || fail "no token for the admin client"
PROV_TOKEN=$(curl -sS --max-time 20 -X POST "${KC}/realms/edcv/protocol/openid-connect/token" \
  --data-urlencode grant_type=client_credentials --data-urlencode client_id=provisioner \
  --data-urlencode "client_secret=${PROVISIONER_SECRET}" | jq -r '.access_token // empty')
[ -n "$PROV_TOKEN" ] || fail "no token for the provisioner client"
master_token() {
  curl -sS --max-time 20 -X POST "${KC}/realms/master/protocol/openid-connect/token" \
    --data-urlencode grant_type=password --data-urlencode client_id=admin-cli \
    --data-urlencode username=admin --data-urlencode "password=${KC_ADMIN_PASSWORD}" | jq -r '.access_token // empty'
}

CP_LIST=$(curl -sS --max-time 30 -H "Authorization: Bearer ${ADMIN_TOKEN}" "${CP}/${MGMT_V}/participants")
IH_LIST=$(curl -sS --max-time 30 -H "Authorization: Bearer ${ADMIN_TOKEN}" "${IH}/v1alpha/participants")

delete() {  # delete <label> <url> <bearer>
  local code
  code=$(curl -sS --max-time 30 -o /tmp/del.out -w '%{http_code}' -X DELETE -H "Authorization: Bearer $3" "$2")
  case "$code" in
    2??|404) log "    deleted $1 (HTTP $code)" ;;
    *) log "    could not delete $1: HTTP $code $(head -c 200 /tmp/del.out)"; return 1 ;;
  esac
}

any_failed=0
for t in $IDS; do
  name=$(psql_q -c "select coalesce(properties->>'displayName', properties->>'name', '') from tenants where id = '$t'")
  exists=$(psql_q -c "select count(*) from tenants where id = '$t'")
  log "tenant ${t} ${name:+(${name})}"
  [ "$exists" = 1 ] || { log "  not in the tenants table; nothing to do"; continue; }

  # One row per profile: id, DID, and the VPA states as type:state pairs.
  profiles=$(psql_q -F '|' -c "select id, identifier,
      coalesce((select string_agg(coalesce(v->>'type','?') || ':' || coalesce(v->>'state','?'), ',')
                from jsonb_array_elements(coalesce(vpas::jsonb, '[]'::jsonb)) v), '')
    from participant_profiles where tenant_id = '$t'")
  if [ -z "$profiles" ]; then log "  no participant profiles"; fi

  all_active=1; any=0
  while IFS='|' read -r pid did states; do
    [ -n "$pid" ] || continue
    any=1
    log "  profile ${pid}  did=${did}  vpas=${states:-none}"
    for st in ${states//,/ }; do [ "${st##*:}" = active ] || all_active=0; done
    [ -n "$states" ] || all_active=0
    cp_ctx=$(printf '%s' "$CP_LIST" | jq -r --arg d "$did" '.[]? | select(.identity == $d) | ."@id"' | head -1)
    ih_ctx=$(printf '%s' "$IH_LIST" | jq -r --arg d "$did" '.[]? | select(.did == $d) | .participantContextId' | head -1)
    log "    identityhub context: ${ih_ctx:-none}   control-plane context: ${cp_ctx:-none}"
  done <<EOF
$profiles
EOF
  if [ "$any" = 1 ] && [ "$all_active" = 1 ]; then
    log "  REFUSED: every activity of this tenant is active, so it is a working participant"
    continue
  fi
  [ "$MODE" = apply ] || continue

  failed=0
  while IFS='|' read -r pid did states; do
    [ -n "$pid" ] || continue
    cp_ctx=$(printf '%s' "$CP_LIST" | jq -r --arg d "$did" '.[]? | select(.identity == $d) | ."@id"' | head -1)
    ih_ctx=$(printf '%s' "$IH_LIST" | jq -r --arg d "$did" '.[]? | select(.did == $d) | .participantContextId' | head -1)
    if [ -n "$ih_ctx" ]; then delete "identityhub ${ih_ctx}" "${IH}/v1alpha/participants/${ih_ctx}" "$ADMIN_TOKEN" || failed=1; fi
    if [ -n "$cp_ctx" ]; then delete "control plane ${cp_ctx}" "${CP}/${MGMT_V}/participants/${cp_ctx}" "$PROV_TOKEN" || failed=1; fi
    ctx="${cp_ctx:-$ih_ctx}"
    if [ -n "$ctx" ]; then
      mt=$(master_token)
      [ -n "$mt" ] || { log "    no Keycloak master token"; failed=1; continue; }
      for cid in "$ctx" "${ctx}-vault"; do
        uuid=$(curl -sS --max-time 20 -H "Authorization: Bearer $mt" \
          "${KC}/admin/realms/edcv/clients?clientId=${cid}" | jq -r '.[0].id // empty')
        if [ -n "$uuid" ]; then delete "keycloak client ${cid}" "${KC}/admin/realms/edcv/clients/${uuid}" "$mt" || failed=1
        else log "    keycloak client ${cid}: none"; fi
      done
    fi
  done <<EOF
$profiles
EOF
  [ "$failed" = 0 ] || { log "  kept the CFM rows: a delete above failed; rerun after fixing it"; any_failed=1; continue; }

  psql_q <<SQL || fail "could not move the CFM rows of ${t}"
begin;
create table if not exists removed_tenants as select now() as removed_at, * from tenants where false;
create table if not exists removed_participant_profiles as select now() as removed_at, * from participant_profiles where false;
insert into removed_tenants select now(), * from tenants where id = '${t}';
insert into removed_participant_profiles select now(), * from participant_profiles where tenant_id = '${t}';
delete from participant_profiles where tenant_id = '${t}';
delete from tenants where id = '${t}';
commit;
SQL
  log "  CFM rows moved to removed_tenants and removed_participant_profiles"
done

[ "$MODE" = apply ] || { log "MODE=${MODE}: nothing changed"; exit 0; }
log "remaining tenants: $(psql_q -c "select count(*) from tenants")"
[ "$any_failed" = 0 ] || fail "a tenant kept its CFM rows (a delete failed); the job fails so the workflow does"
