#!/usr/bin/env python3
"""Load guidelines and the studies they cite into Neo4j (Layer 6).

Reads data/guidelines-manifest.json, written by guideline_pipeline.py, and writes

  (:Guideline {awmfId})            one node per guideline, the current version
  (:Study {id: 'pmid-<pmid>'})     one node per cited work that has a PubMed id
  (:Guideline)-[:CITES]->(:Study)  with the number the work has in the reference list

`Study.id` is `pmid-<pmid>`, the form the Klarbefund health graph already uses
for the sources of its reference ranges, so the two graphs name the same paper
the same way. `CITES.pmidSource` says where the id came from: printed in the
guideline ("reference list") or found by resolve_pmids.py ("doi", "citation match").

A guideline whose validity has passed, or that the source no longer offers, is
set `active: false` with its `status`; it is never deleted, and neither are its
CITES relationships. An older version of the same guideline is replaced on the
node and remembered in `previousVersions`.

Works without a PubMed id (books, reports, web pages) are counted on the
guideline as `referencesWithoutPmid` and not loaded: nothing identifies them
across guidelines.

Usage:
  NEO4J_PASSWORD=... python3 load_guideline_citations.py
  python3 load_guideline_citations.py --dry-run     # report, write nothing

Run neo4j/register-leitlinien-schema.cypher first.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent

CYPHER_GUIDELINE = """
MERGE (g:Guideline {awmfId: $awmfId})
ON CREATE SET g.createdAt = datetime(), g.previousVersions = []
SET g.previousVersions = CASE
      WHEN g.version IS NOT NULL AND g.version <> $version AND NOT g.version IN g.previousVersions
      THEN g.previousVersions + g.version ELSE coalesce(g.previousVersions, []) END,
    g.name = $title,
    g.version = $version,
    g.guidelineClass = $guidelineClass,
    g.publisher = $publisher,
    g.releaseDate = $adoptedDate,
    g.validUntilDate = $validUntilDate,
    g.earliestValidUntilDate = $earliestValidUntilDate,
    g.active = $active,
    g.status = $status,
    g.doi = $doi,
    g.sourceUrl = $sourcePage,
    g.referenceCount = $referenceCount,
    g.referencesWithoutPmid = $referencesWithoutPmid,
    g.checkedAt = $checkedAt,
    g.layer = 6
"""

CYPHER_CITES = """
MATCH (g:Guideline {awmfId: $awmfId})
UNWIND $rows AS row
MERGE (s:Study {id: row.id})
ON CREATE SET s.pmid = row.pmid,
              s.pubmedUrl = 'https://pubmed.ncbi.nlm.nih.gov/' + row.pmid + '/',
              s.citation = row.citation,
              s.title = row.citation,
              s.year = row.year,
              s.doi = row.doi,
              s.kind = 'study',
              s.source = 'guideline reference list'
MERGE (g)-[c:CITES]->(s)
SET c.referenceNumber = row.number,
    c.guidelineVersion = $version,
    c.pmidSource = row.pmidSource,
    c.source = 'reference list of the guideline'
"""

# A CITES relationship of an earlier version that the current list no longer has
# stays, marked, so "which guideline ever relied on this study" keeps its answer.
CYPHER_MARK_DROPPED = """
MATCH (g:Guideline {awmfId: $awmfId})-[c:CITES]->(s:Study)
WHERE NOT s.id IN $ids AND c.guidelineVersion <> $version
SET c.droppedInVersion = $version
"""


# Status and type from study_status.py. A study PubMed did not return keeps no status:
# absent is "not checked", never "clean".
CYPHER_STUDY_STATUS = """
UNWIND $rows AS row
MATCH (s:Study {id: row.id})
SET s.title = row.title,
    s.journal = row.journal,
    s.year = coalesce(row.year, s.year),
    s.publicationTypes = row.publicationTypes,
    s.studyType = row.type,
    s.publicationStatus = row.publicationStatus,
    s.statusFlags = row.flags,
    s.retracted = row.retracted,
    s.statusSource = 'PubMed',
    s.statusCheckedAt = $checkedAt
"""


def status_rows(status: dict) -> list[dict]:
    """One row per study with the worst flag as `publicationStatus` ("ok" when PubMed lists none)."""
    return [{
        "id": f"pmid-{pmid}", "title": rec["title"], "journal": rec["journal"], "year": rec["year"],
        "publicationTypes": rec["publicationTypes"], "type": rec["type"], "flags": rec["flags"],
        "publicationStatus": rec["flags"][0] if rec["flags"] else "ok",
        "retracted": "retracted" in rec["flags"],
    } for pmid, rec in sorted(status.items())]


def current_guidelines(manifest: dict) -> list[dict]:
    """The newest version per `awmfId`: superseded versions do not get a node of their own."""
    by_awmf: dict[str, dict] = {}
    for g in manifest["guidelines"]:
        if not g.get("awmfId") or g.get("supersededBy"):
            continue
        by_awmf[g["awmfId"]] = g
    return [by_awmf[k] for k in sorted(by_awmf)]


def guideline_params(g: dict, checked_at: str) -> dict:
    refs = g.get("references", [])
    return {
        "awmfId": g["awmfId"], "title": g["title"], "version": g["version"],
        "publisher": g.get("publisher"), "guidelineClass": g.get("guidelineClass", "NVL"),
        "adoptedDate": g.get("adoptedDate"),
        "validUntilDate": g.get("validUntilDate"),
        "earliestValidUntilDate": g.get("earliestValidUntilDate"),
        "active": g["active"], "status": g["status"], "doi": g.get("doi"),
        "sourcePage": g["sourcePage"], "referenceCount": len(refs),
        "referencesWithoutPmid": sum(1 for r in refs if not r.get("pmid")),
        "checkedAt": checked_at,
    }


def citation_rows(g: dict) -> list[dict]:
    """One row per cited work with a PubMed id; a work listed twice is kept once."""
    rows: dict[str, dict] = {}
    for r in g.get("references", []):
        if not r.get("pmid"):
            continue
        rows.setdefault(r["pmid"], {
            "id": f"pmid-{r['pmid']}", "pmid": r["pmid"], "number": r["number"],
            "citation": r["citation"][:600], "year": r.get("year"), "doi": r.get("doi"),
            "pmidSource": r.get("pmidSource", "reference list"),
        })
    return list(rows.values())


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--manifest", type=Path, default=HERE / "data" / "guidelines-manifest.json")
    ap.add_argument("--study-status", type=Path, default=HERE / "data" / "study-status.json")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--neo4j-uri", default=os.environ.get("NEO4J_URI", "bolt://localhost:7687"))
    ap.add_argument("--neo4j-user", default=os.environ.get("NEO4J_USER", "neo4j"))
    ap.add_argument("--neo4j-password", default=os.environ.get("NEO4J_PASSWORD"))
    args = ap.parse_args()

    if not args.manifest.exists():
        print(f"{args.manifest} not found. Run guideline_pipeline.py first.", file=sys.stderr)
        return 2
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    guidelines = current_guidelines(manifest)
    plan = [(g, guideline_params(g, manifest["generated"]), citation_rows(g)) for g in guidelines]
    for g, params, rows in plan:
        print(f"{params['awmfId']:9} v{params['version']:5} {params['status']:15} "
              f"{len(rows)} cited studies, {params['referencesWithoutPmid']} references without a PubMed id")
    status_file = json.loads(args.study_status.read_text(encoding="utf-8")) if args.study_status.exists() else None
    rows_status = status_rows(status_file["studies"]) if status_file else []
    if status_file:
        flagged = sum(1 for r in rows_status if r["publicationStatus"] != "ok")
        print(f"status and type for {len(rows_status)} studies, {flagged} with a notice (study_status.py)")
    else:
        print(f"no {args.study_status.name}: studies load without status or type. Run study_status.py.")
    if args.dry_run:
        print("dry run: nothing written")
        return 0
    if not args.neo4j_password:
        print("NEO4J_PASSWORD env var (or --neo4j-password) is required.", file=sys.stderr)
        return 2

    from neo4j import GraphDatabase  # imported here so --dry-run and the tests need no driver

    with GraphDatabase.driver(args.neo4j_uri, auth=(args.neo4j_user, args.neo4j_password)) as driver, \
            driver.session() as session:
        for _g, params, rows in plan:
            session.run(CYPHER_GUIDELINE, params).consume()
            for start in range(0, len(rows), 500):
                session.run(CYPHER_CITES, awmfId=params["awmfId"], version=params["version"],
                            rows=rows[start : start + 500]).consume()
            session.run(CYPHER_MARK_DROPPED, awmfId=params["awmfId"], version=params["version"],
                        ids=[r["id"] for r in rows]).consume()
        for start in range(0, len(rows_status), 500):
            session.run(CYPHER_STUDY_STATUS, rows=rows_status[start : start + 500],
                        checkedAt=status_file["generated"]).consume()
        counts = session.run(
            "MATCH (g:Guideline)-[c:CITES]->(s:Study) "
            "RETURN count(DISTINCT g) AS guidelines, count(DISTINCT s) AS studies, count(c) AS citations"
        ).single()
        print(f"graph now holds {counts['guidelines']} guidelines citing {counts['studies']} studies "
              f"over {counts['citations']} CITES relationships")
    return 0


if __name__ == "__main__":
    sys.exit(main())
