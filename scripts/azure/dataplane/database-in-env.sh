#!/usr/bin/env bash
# Runs inside the Azure environment, as the one-shot job of
# scripts/azure/create-dataplane-database.sh: the Flexible Server admits only
# Azure addresses, and a role is SQL, not an ARM resource.
#
#   MODE=plan    say whether the role and the database exist; change nothing
#   MODE=apply   the role `dataplane` with the password from Key Vault, the
#                database owned by it, then prove the role can log in and
#                create a table there
#
# Idempotent: `apply` again sets the role's password to Key Vault's value
# (which is how a rotated password reaches the server) and changes nothing else.
#
# Environment (from the job definition): MODE, PGHOST, PGUSER (the admin),
# DB, ROLE; secrets PGPASSWORD (the admin's) and ROLE_PASSWORD, both Key Vault
# references, so neither value is on a command line or in a log.
set -euo pipefail
MODE="${MODE:-plan}"
export PGSSLMODE=require PGDATABASE=postgres

fail() {
  echo "FAIL $*"
  exit 1
}
q() { psql -X -q -v ON_ERROR_STOP=1 -At "$@"; }

case "$DB$ROLE" in *[!a-z0-9_]*) fail "DB and ROLE are plain lower-case names" ;; esac
q -c "select 1" >/dev/null || fail "cannot reach ${PGHOST} as ${PGUSER}"

has_role="$(q -c "select count(*) from pg_roles where rolname = '${ROLE}'")"
has_db="$(q -c "select count(*) from pg_database where datname = '${DB}'")"
owner="$(q -c "select pg_get_userbyid(datdba) from pg_database where datname = '${DB}'")"
echo "role ${ROLE}: $([ "$has_role" = 1 ] && echo present || echo MISSING)"
echo "database ${DB}: $([ "$has_db" = 1 ] && echo "present, owner ${owner}" || echo MISSING)"
[ "$MODE" = apply ] || exit 0

[ -n "${ROLE_PASSWORD:-}" ] || fail "no ROLE_PASSWORD: the Key Vault reference did not resolve"
# The password goes in as a psql variable, quoted by psql itself (:'pw').
if [ "$has_role" = 1 ]; then
  q -v pw="$ROLE_PASSWORD" <<SQL
alter role ${ROLE} with login password :'pw';
SQL
  echo "role ${ROLE}: password set to Key Vault's value"
else
  q -v pw="$ROLE_PASSWORD" <<SQL
create role ${ROLE} with login password :'pw';
SQL
  echo "role ${ROLE}: created"
fi
# The admin is no superuser on a Flexible Server: it may hand a database to a
# role only while it is a member of that role.
q -c "grant ${ROLE} to current_user" >/dev/null
if [ "$has_db" = 1 ]; then
  [ "$owner" = "$ROLE" ] || q -c "alter database ${DB} owner to ${ROLE}"
else
  q -c "create database ${DB} owner ${ROLE}"
  echo "database ${DB}: created"
fi

# The tables go into a schema of the role's own. On PostgreSQL 15 and later
# `public` no longer takes anyone's tables, and on the Flexible Server the
# role could not create any there (first apply, 2026-11-24: has_schema_privilege
# false). The owner of a database may create schemas in it, and a role may set
# its own search path, so this runs as the role and needs nothing of the admin.
PGUSER="$ROLE" PGPASSWORD="$ROLE_PASSWORD" PGDATABASE="$DB" q <<SQL >/dev/null ||
create schema if not exists ${ROLE} authorization ${ROLE};
alter role ${ROLE} in database ${DB} set search_path = ${ROLE};
SQL
  fail "${ROLE} could not create its schema in ${DB}"

# Read back as the role itself (ADR-031), in a new session so the search path
# applies: it logs in, owns the database, and creates its tables in its schema.
got="$(PGUSER="$ROLE" PGPASSWORD="$ROLE_PASSWORD" PGDATABASE="$DB" q -c \
  "select current_user || ' ' || pg_get_userbyid(datdba) || ' ' || current_schema() || ' '
          || has_schema_privilege(current_schema(), 'CREATE')
     from pg_database where datname = current_database()")" ||
  fail "${ROLE} cannot log in to ${DB}"
[ "$got" = "${ROLE} ${ROLE} ${ROLE} true" ] ||
  fail "read-back as ${ROLE}: '${got}', expected '${ROLE} ${ROLE} ${ROLE} true'"
echo "OK: ${ROLE} logs in to ${DB}, owns it and creates its tables in schema ${ROLE}"
