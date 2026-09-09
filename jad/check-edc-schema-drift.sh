#!/usr/bin/env bash
# Detect (and optionally repair) EDC store schema drift.
#
# EDC ships its DDL inside the connector jar and applies it with
# `CREATE TABLE IF NOT EXISTS`. That creates a table the first time and is a
# NO-OP forever after — it never adds a column to an existing table. So when the
# connector image is upgraded, any column added upstream is simply missing, and
# `edc.sql.schema.autocreate=true` reports nothing wrong.
#
# Found 2026-09-09 (issue #169): `edc_contract_agreement` was missing `claims`,
# added upstream between the schema's creation and the June connector build
# adopted by issue #97 Phase B. Every contract negotiation TERMINATED and
# `contractnegotiations/request` returned 500 —
#
#   PSQLException: The column name claims was not found in this ResultSet
#     at SqlContractNegotiationStore.mapContractAgreement(...:265)
#
# — while the seed script reported success. This makes that class of drift
# visible instead of leaving it to surface as unrelated-looking 500s.
#
# Compares the jar's DDL against the live database and reports columns the DDL
# declares but the database lacks.
#
# Usage:
#   ./jad/check-edc-schema-drift.sh            # report drift, exit 1 if any
#   ./jad/check-edc-schema-drift.sh --apply    # additionally ADD the columns
#
# --apply is ADDITIVE ONLY: it emits ALTER TABLE ... ADD COLUMN IF NOT EXISTS
# and nothing else. It never drops, never retypes, never touches data. A column
# the DDL no longer declares is left alone and reported, because removing it is
# a judgement call this script has no business making.
#
# NOTE: after applying, RESTART the connector. Postgres caches prepared-statement
# plans per connection, so an in-flight pool answers
# "cached plan must not change result type" until it re-prepares.
set -uo pipefail

CONTAINER="${EDC_CONTAINER:-health-dataspace-controlplane}"
JAR="${EDC_JAR:-/app/edc-controlplane.jar}"
PG_CONTAINER="${PG_CONTAINER:-health-dataspace-postgres}"
PG_USER="${PG_USER:-cp}"
PG_DB="${PG_DB:-controlplane}"
APPLY=0
[ "${1:-}" = "--apply" ] && APPLY=1

command -v docker >/dev/null 2>&1 || { echo "ERROR: docker not found" >&2; exit 1; }
docker inspect "$CONTAINER" >/dev/null 2>&1 || { echo "ERROR: container $CONTAINER not running" >&2; exit 1; }

echo "Comparing ${JAR} DDL against ${PG_DB} on ${PG_CONTAINER}"
echo ""

TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT

# Pull the DDL the running image actually ships, not a copy that could drift.
docker exec "$CONTAINER" sh -c "cd /tmp && rm -f ./*.sql && unzip -o -q ${JAR} '*.sql' 2>/dev/null; cat /tmp/*.sql" \
  > "$TMP/ddl.sql" 2>/dev/null
[ -s "$TMP/ddl.sql" ] || { echo "ERROR: no DDL extracted from ${JAR}" >&2; exit 1; }

docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -t -A -F$'\t' \
  -c "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public';" \
  > "$TMP/live.tsv" 2>/dev/null
[ -s "$TMP/live.tsv" ] || { echo "ERROR: could not read live schema" >&2; exit 1; }

python3 - "$TMP/ddl.sql" "$TMP/live.tsv" "$APPLY" > "$TMP/report.txt" <<'PY'
import re, sys, collections

ddl_path, live_path, apply_flag = sys.argv[1], sys.argv[2], sys.argv[3] == "1"
ddl = open(ddl_path, encoding="utf-8", errors="replace").read()

# Postgres types EDC's shipped DDL actually uses. Deliberately a whitelist:
# a type we do not recognise is reported as nothing rather than guessed at.
KNOWN_TYPES = {
    "VARCHAR", "TEXT", "CHAR", "BIGINT", "INTEGER", "INT", "SMALLINT",
    "BOOLEAN", "BOOL", "JSON", "JSONB", "NUMERIC", "DECIMAL", "REAL",
    "DOUBLE", "TIMESTAMP", "DATE", "TIME", "UUID", "BYTEA", "SERIAL",
}

# Parse `CREATE TABLE IF NOT EXISTS <name> ( ... );` into name -> [columns].
declared = {}
for m in re.finditer(
    r"CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([A-Za-z0-9_]+)\s*\((.*?)\n\s*\);",
    ddl, re.S | re.I,
):
    table, body = m.group(1).lower(), m.group(2)
    cols = {}
    depth = 0
    for raw in body.split("\n"):
        line = raw.strip().rstrip(",")
        if not line:
            continue
        # Skip table-level constraints and the continuation lines of a
        # column-level one. Without the REFERENCES/DEFAULT/NOT cases, the
        # wrapped foreign key in edc_contract_negotiation —
        #     agreement_id VARCHAR
        #         CONSTRAINT contract_negotiation_..._fk
        #             REFERENCES edc_contract_agreement,
        # parses as a column named `references` of type
        # EDC_CONTRACT_AGREEMENT, and `references` is a reserved word.
        if re.match(
            r"^(PRIMARY|UNIQUE|CONSTRAINT|FOREIGN|CHECK|REFERENCES|DEFAULT|NOT|ON)\b",
            line, re.I,
        ):
            continue
        tok = re.match(r"^([A-Za-z0-9_]+)\s+([A-Za-z0-9_]+)", line)
        if not tok:
            continue
        name, typ = tok.group(1).lower(), tok.group(2).upper()
        # Only accept real column types. Anything else is a constraint fragment
        # we have not anticipated, and inventing an ALTER from it is worse than
        # missing a column: the failure would be a confusing SQL error rather
        # than a clear report.
        if typ.split("(")[0] not in KNOWN_TYPES:
            continue
        cols[name] = typ
    if cols:
        declared[table] = cols

live = collections.defaultdict(set)
for line in open(live_path, encoding="utf-8"):
    if "\t" not in line:
        continue
    t, c = line.rstrip("\n").split("\t", 1)
    live[t.lower()].add(c.lower())

missing_total = 0
for table in sorted(declared):
    if table not in live:
        continue  # table absent entirely — autocreate handles that case
    gap = [(c, ty) for c, ty in declared[table].items() if c not in live[table]]
    if gap:
        missing_total += len(gap)
        for c, ty in gap:
            print(f"MISSING\t{table}\t{c}\t{ty}")

print(f"SUMMARY\t{missing_total}")
PY

MISSING=$(grep -c '^MISSING' "$TMP/report.txt" || true)
if [ "$MISSING" -eq 0 ]; then
  echo "  No drift: every column the shipped DDL declares exists in ${PG_DB}."
  exit 0
fi

echo "  Columns declared by the connector's DDL but missing from the database:"
echo ""
grep '^MISSING' "$TMP/report.txt" | while IFS=$'\t' read -r _ table col type; do
  printf '    %-32s %-24s %s\n' "$table" "$col" "$type"
done
echo ""

if [ "$APPLY" -eq 0 ]; then
  echo "  Re-run with --apply to add them (ADD COLUMN only; nothing is dropped)."
  echo "  Then RESTART the connector — Postgres caches prepared-statement plans"
  echo "  and will answer 'cached plan must not change result type' until it does."
  exit 1
fi

echo "  Applying (additive only)..."
FAILED=0
grep '^MISSING' "$TMP/report.txt" | while IFS=$'\t' read -r _ table col type; do
  printf '    ALTER TABLE %s ADD COLUMN %s %s ... ' "$table" "$col" "$type"
  if docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" \
       -c "ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${col} ${type};" >/dev/null 2>&1; then
    echo "ok"
  else
    echo "FAILED"
    FAILED=1
  fi
done

echo ""
echo "  Now restart the connector so it re-prepares its statements:"
echo "    docker restart ${CONTAINER}"
[ "$FAILED" -eq 0 ] || exit 1
