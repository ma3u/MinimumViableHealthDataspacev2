#!/usr/bin/env python3
"""
Seed SPE-2, the second secure processing environment, from SPE-1 (ADR-069).

SPE-2 holds a different set of patients from the one SPE-1 answers for: the
second half of SPE-1's synthetic patients, ordered by
coalesce(resourceId, id, elementId). For each of them it copies

  - the Patient,
  - its clinical records one hop away (Encounter, Condition, Observation,
    MedicationRequest, MedicationStatement, Procedure, DiagnosticReport,
    Immunization, AllergyIntolerance),
  - its OMOPPerson (MAPPED_TO) and the OMOP records one hop from that,
  - the terminology concepts those records are CODED_BY (shared reference
    data, not anybody's record),
  - every relationship between two copied nodes,

then applies neo4j/init-schema.cypher (so the full-text tier of the NLQ finds
its indexes) and neo4j/register-fhir-dataset-hdcatap-spe2.cypher (SPE-2's
HealthDCAT-AP registration) to SPE-2.

Never copied: a patient the Klarbefund app or a PID created or connected to
(`sandbox`, `appAccount`, a HAS_APP_CONNECTION) and any node the app
contributed (`contributedBy = 'klarbefund-app'`). Those hold a real person's
data, which belongs on the hub that person chose and nowhere else.

Idempotent. Every node is merged on its primary label and `_speKey`, the
source node's own id (`id`, `resourceId` or `code`; the elementId only as the
last resort), so a second run updates instead of duplicating. Labels are set
to the source's on every run, so an Art. 71 opt-out (the `OptedOut` label,
ADR-062) and its reversal reach SPE-2 the next time this runs. Nothing on
SPE-1 is changed, and nothing on SPE-2 is deleted: a run that finds patients
on SPE-2 that it did not select fails and says so.

APOC is not needed on either side.

Usage (compose: SPE-1 on 7687, SPE-2 on 7688, profile `federated`):
    python3 scripts/seed-spe2.py
    python3 scripts/seed-spe2.py --dry-run
    python3 scripts/seed-spe2.py --source bolt://localhost:7687 --target bolt://localhost:7688

Connection settings come from the environment, flags override the URIs:
    SOURCE_NEO4J_URI / SOURCE_NEO4J_USER / SOURCE_NEO4J_PASSWORD
    TARGET_NEO4J_URI / TARGET_NEO4J_USER / TARGET_NEO4J_PASSWORD
Passwords are read from the environment only, never from a flag, and never
printed. On Azure the ACA job mvhd-neo4j-spe2-seed runs this
(scripts/azure/20-neo4j-spe2.sh --seed).

Exit codes: 0 seeded (or dry run done), 1 the seed or its check failed,
2 a database did not answer.
"""

from __future__ import annotations

import argparse
import os
import re
import sys
import time
from pathlib import Path

try:
    from neo4j import GraphDatabase
except ImportError:
    sys.exit("ERROR: neo4j package not found.  Run: pip install neo4j")

REPO_ROOT = Path(__file__).resolve().parent.parent

# Person-level FHIR records one hop from a Patient (the FHIR part of
# PERSON_LABELS in services/neo4j-proxy/src/opt-out.ts).
CLINICAL_LABELS = [
    "Encounter",
    "Condition",
    "Observation",
    "MedicationRequest",
    "MedicationStatement",
    "Procedure",
    "DiagnosticReport",
    "Immunization",
    "AllergyIntolerance",
]
# Person-level OMOP CDM records one hop from an OMOPPerson.
OMOP_LABELS = [
    "OMOPConditionOccurrence",
    "OMOPMeasurement",
    "OMOPDrugExposure",
    "OMOPVisitOccurrence",
    "OMOPProcedureOccurrence",
    "OMOPObservation",
]
# The label a node is merged on, first match wins; anything else falls back
# to its alphabetically first label.
PRIMARY_LABELS = ["Patient", "OMOPPerson", *CLINICAL_LABELS, *OMOP_LABELS]
OPTED_OUT_LABEL = "OptedOut"
APP_CONTRIBUTION = "klarbefund-app"
KEY = "_speKey"
# The property the throwaway copy of 2026-10-30 keyed on. A target that has
# it was seeded with elementIds as keys, which this script cannot match.
LEGACY_KEY = "_srcId"
BATCH = 500
IDENTIFIER = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")

# The patients SPE-2 holds: SPE-1's synthetic ones, the second half.
SELECT_PATIENTS = """
MATCH (p:Patient)
WHERE coalesce(p.sandbox, false) = false
  AND p.appAccount IS NULL
  AND NOT (p)-[:HAS_APP_CONNECTION]->()
WITH p ORDER BY coalesce(p.resourceId, p.id, elementId(p))
WITH collect(elementId(p)) AS ids
RETURN size(ids) AS eligible, ids[size(ids) / 2..] AS chosen
"""

CLINICAL_NEIGHBOURS = """
UNWIND $ids AS id
MATCH (p) WHERE elementId(p) = id
MATCH (p)--(n)
WHERE any(l IN labels(n) WHERE l IN $labels)
  AND coalesce(n.contributedBy, '') <> $app
RETURN DISTINCT elementId(n) AS id
"""

OMOP_PERSONS = """
UNWIND $ids AS id
MATCH (p) WHERE elementId(p) = id
MATCH (p)-[:MAPPED_TO]->(op:OMOPPerson)
RETURN DISTINCT elementId(op) AS id
"""

CODED_BY = """
UNWIND $ids AS id
MATCH (n) WHERE elementId(n) = id
MATCH (n)-[:CODED_BY]->(c)
RETURN DISTINCT elementId(c) AS id
"""

READ_NODES = """
UNWIND $ids AS id
MATCH (n) WHERE elementId(n) = id
RETURN id, labels(n) AS labels, properties(n) AS props
"""

READ_RELATIONSHIPS = """
UNWIND $ids AS id
MATCH (a) WHERE elementId(a) = id
MATCH (a)-[r]->(b)
RETURN id AS start, type(r) AS type, properties(r) AS props, elementId(b) AS end
"""


def log(msg: str) -> None:
    print(msg, flush=True)


def ident(name: str) -> str:
    """A label or relationship type as a backticked Cypher identifier.

    The names come from SPE-1's own schema, never from a request; anything
    that is not a plain identifier is refused rather than escaped."""
    if not IDENTIFIER.match(name):
        raise ValueError(f"refusing to use {name!r} as a label or type")
    return f"`{name}`"


def primary_label(labels: list[str]) -> str:
    for label in PRIMARY_LABELS:
        if label in labels:
            return label
    rest = sorted(l for l in labels if l != OPTED_OUT_LABEL)
    if not rest:
        raise ValueError("a node without a label cannot be keyed")
    return rest[0]


def node_key(eid: str, props: dict) -> str:
    for name in ("id", "resourceId", "code"):
        value = props.get(name)
        if value is not None and value != "":
            return str(value)
    return eid


def split_statements(text: str) -> list[str]:
    """Statements of a .cypher file, split on `;` outside strings, backticks
    and // comments (a comment such as `// Art. 75; adopted` is not a split)."""
    out: list[str] = []
    buf: list[str] = []
    i, n = 0, len(text)
    while i < n:
        ch = text[i]
        if ch in ("'", '"', "`"):
            j = i + 1
            while j < n and text[j] != ch:
                j += 2 if text[j] == "\\" and ch != "`" else 1
            buf.append(text[i : j + 1])
            i = j + 1
            continue
        if ch == "/" and text[i + 1 : i + 2] == "/":
            j = text.find("\n", i)
            i = n if j == -1 else j
            continue
        if ch == ";":
            stmt = "".join(buf).strip()
            if stmt:
                out.append(stmt)
            buf = []
            i += 1
            continue
        buf.append(ch)
        i += 1
    tail = "".join(buf).strip()
    if tail:
        out.append(tail)
    return out


def batches(items: list, size: int = BATCH):
    for i in range(0, len(items), size):
        yield items[i : i + size]


def wait_for(driver, name: str, uri: str, attempts: int) -> None:
    for i in range(1, attempts + 1):
        try:
            driver.verify_connectivity()
            log(f"{name} answers at {uri}")
            return
        except Exception as exc:  # noqa: BLE001 - any failure means "not yet"
            if i == attempts:
                log(f"ERROR: {name} did not answer at {uri} after {attempts} attempts: {exc}")
                sys.exit(2)
            time.sleep(5)


def collect_ids(session, query: str, ids: list[str], **params) -> list[str]:
    found: list[str] = []
    for chunk in batches(ids):
        found.extend(r["id"] for r in session.run(query, ids=chunk, **params))
    return found


def read_source(session) -> tuple[int, list[str], dict, list]:
    row = session.run(SELECT_PATIENTS).single()
    eligible, patients = row["eligible"], list(row["chosen"])
    clinical = collect_ids(
        session, CLINICAL_NEIGHBOURS, patients, labels=CLINICAL_LABELS, app=APP_CONTRIBUTION
    )
    persons = collect_ids(session, OMOP_PERSONS, patients)
    omop = collect_ids(
        session, CLINICAL_NEIGHBOURS, persons, labels=OMOP_LABELS, app=APP_CONTRIBUTION
    )
    records = list(dict.fromkeys(clinical + omop))
    concepts = collect_ids(session, CODED_BY, records)
    ids = list(dict.fromkeys(patients + persons + records + concepts))

    nodes: dict[str, dict] = {}
    for chunk in batches(ids):
        for r in session.run(READ_NODES, ids=chunk):
            props = dict(r["props"])
            if props.get("contributedBy") == APP_CONTRIBUTION:
                continue
            labels = list(r["labels"])
            nodes[r["id"]] = {
                "labels": labels,
                "primary": primary_label(labels),
                "key": node_key(r["id"], props),
                "props": props,
            }

    rels = []
    for chunk in batches(list(nodes)):
        for r in session.run(READ_RELATIONSHIPS, ids=chunk):
            if r["end"] in nodes:
                rels.append((r["start"], r["type"], dict(r["props"]), r["end"]))
    return eligible, patients, nodes, rels


def write_nodes(session, nodes: dict) -> int:
    groups: dict[tuple, list] = {}
    for node in nodes.values():
        labels = tuple(sorted(set(node["labels"])))
        groups.setdefault((node["primary"], labels), []).append(
            {"key": node["key"], "props": node["props"]}
        )
    for primary in sorted({p for p, _ in groups}):
        session.run(
            f"CREATE INDEX {ident('spe2_key_' + primary)} IF NOT EXISTS "
            f"FOR (n:{ident(primary)}) ON (n.{KEY})"
        ).consume()
    session.run("CALL db.awaitIndexes(300)").consume()
    written = 0
    for (primary, labels), rows in sorted(groups.items()):
        set_labels = ":".join(ident(l) for l in labels)
        query = (
            "UNWIND $rows AS row "
            f"MERGE (n:{ident(primary)} {{{KEY}: row.key}}) "
            "ON CREATE SET n += row.props "
            "ON MATCH SET n += row.props "
            f"REMOVE n:{ident(OPTED_OUT_LABEL)} "
            f"SET n:{set_labels}"
        )
        for chunk in batches(rows):
            session.run(query, rows=chunk).consume()
            written += len(chunk)
    return written


def write_relationships(session, nodes: dict, rels: list) -> int:
    groups: dict[tuple, list] = {}
    for start, rtype, props, end in rels:
        s, e = nodes[start], nodes[end]
        groups.setdefault((s["primary"], rtype, e["primary"]), []).append(
            {"s": s["key"], "e": e["key"], "props": props}
        )
    written = 0
    for (sl, rtype, el), rows in sorted(groups.items()):
        query = (
            "UNWIND $rows AS row "
            f"MATCH (a:{ident(sl)} {{{KEY}: row.s}}) "
            f"MATCH (b:{ident(el)} {{{KEY}: row.e}}) "
            f"MERGE (a)-[r:{ident(rtype)}]->(b) "
            "ON CREATE SET r += row.props "
            "ON MATCH SET r += row.props"
        )
        for chunk in batches(rows):
            session.run(query, rows=chunk).consume()
            written += len(chunk)
    return written


def run_file(session, path: Path) -> None:
    statements = split_statements(path.read_text(encoding="utf-8"))
    for stmt in statements:
        session.run(stmt).consume()
    log(f"  {path.name}: {len(statements)} statements")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--source", default=os.environ.get("SOURCE_NEO4J_URI", "bolt://localhost:7687"))
    parser.add_argument("--target", default=os.environ.get("TARGET_NEO4J_URI", "bolt://localhost:7688"))
    parser.add_argument("--dry-run", action="store_true", help="read SPE-1 and report, write nothing")
    parser.add_argument("--schema", default=str(REPO_ROOT / "neo4j" / "init-schema.cypher"))
    parser.add_argument(
        "--registration",
        default=str(REPO_ROOT / "neo4j" / "register-fhir-dataset-hdcatap-spe2.cypher"),
    )
    parser.add_argument("--wait-attempts", type=int, default=60, help="5 s apart")
    args = parser.parse_args()

    src_auth = (os.environ.get("SOURCE_NEO4J_USER", "neo4j"), os.environ.get("SOURCE_NEO4J_PASSWORD", "healthdataspace"))
    tgt_auth = (os.environ.get("TARGET_NEO4J_USER", "neo4j"), os.environ.get("TARGET_NEO4J_PASSWORD", "healthdataspace"))
    if args.source == args.target:
        log("ERROR: source and target are the same database")
        return 1

    source = GraphDatabase.driver(args.source, auth=src_auth)
    wait_for(source, "SPE-1", args.source, args.wait_attempts)
    with source.session(database="neo4j", default_access_mode="READ") as s:
        eligible, patients, nodes, rels = read_source(s)
    source.close()

    by_label: dict[str, int] = {}
    for node in nodes.values():
        by_label[node["primary"]] = by_label.get(node["primary"], 0) + 1
    log(f"SPE-1: {eligible} synthetic patients, SPE-2 takes {len(patients)}")
    log(f"  {len(nodes)} nodes, {len(rels)} relationships to copy")
    for label in sorted(by_label):
        log(f"    {label}: {by_label[label]}")
    if not patients:
        log("ERROR: SPE-1 has no synthetic patients to copy; is it seeded?")
        return 1
    if args.dry_run:
        log("dry run: nothing written")
        return 0

    target = GraphDatabase.driver(args.target, auth=tgt_auth)
    wait_for(target, "SPE-2", args.target, args.wait_attempts)
    with target.session(database="neo4j") as t:
        legacy = t.run(f"MATCH (n) WHERE n.{LEGACY_KEY} IS NOT NULL RETURN count(n) AS c").single()["c"]
        if legacy:
            log(
                f"ERROR: SPE-2 holds {legacy} nodes from an earlier copy keyed on {LEGACY_KEY} "
                "(elementIds). Empty SPE-2 once, then run this again."
            )
            return 1
        log("SPE-2: schema")
        run_file(t, Path(args.schema))
        n = write_nodes(t, nodes)
        r = write_relationships(t, nodes, rels)
        log(f"SPE-2: merged {n} nodes, {r} relationships")
        log("SPE-2: HealthDCAT-AP registration")
        run_file(t, Path(args.registration))

        expected = {nodes[p]["key"] for p in patients if p in nodes}
        held = {
            row["key"]
            for row in t.run(f"MATCH (p:Patient) RETURN coalesce(p.{KEY}, elementId(p)) AS key")
        }
    target.close()

    missing, extra = expected - held, held - expected
    if missing or extra:
        log(
            f"ERROR: SPE-2 holds {len(held)} patients, expected the {len(expected)} selected: "
            f"{len(missing)} missing, {len(extra)} not selected by this run"
        )
        return 1
    log(f"OK: SPE-2 holds exactly the {len(expected)} selected patients")
    return 0


if __name__ == "__main__":
    sys.exit(main())
