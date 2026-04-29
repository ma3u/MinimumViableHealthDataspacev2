"""
Layer 6 loader — ingest Docling-parsed AWMF guidelines into Neo4j.

For every guideline that has a corresponding Docling JSON in --data-dir,
MERGE:
  (:Guideline {awmfId})                     ← metadata from awmf-index.json
  -[:PUBLISHED_BY]->(:Organization)         ← matches existing Layer 2 nodes
  -[:COVERS_EHDS_CATEGORY]->(:EEHRxFCategory)  ← heuristic via category_mapper
  -[:HAS_SECTION]->(:GuidelineSection)      ← from H2 headings in the Markdown
                  -[:HAS_CHUNK]->(:GuidelineChunk)  ← ~500-word windows

Embeddings are NOT written here — run register-leitlinien-embeddings-aoai.cypher
after this loader, matching the existing apoc.ml.azure.openai.embedding()
convention used by Layers 2-5.

Resumable: a guideline whose `chunkCount` property is already > 0 is skipped
unless --force is passed.

Usage:
  uv run python load_layer6.py --neo4j-password <password>           # full run
  uv run python load_layer6.py --limit 10                            # smoke test
  uv run python load_layer6.py --only 001-018                        # one guideline
  uv run python load_layer6.py --dry-run                             # no DB writes
  uv run python load_layer6.py --data-dir /path/to/data              # custom dir

Required env (or CLI flags):
  NEO4J_URI       (default bolt://localhost:7687)
  NEO4J_USER      (default neo4j)
  NEO4J_PASSWORD  (no default — must be supplied)
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from dataclasses import dataclass
from pathlib import Path

from category_mapper import map_to_categories

# Default chunking knobs — tuned for German S3 prose; adjust if downstream
# embedding cost or recall changes.
CHUNK_TARGET_WORDS = 500
CHUNK_MIN_WORDS = 100


@dataclass
class GuidelineRecord:
    awmf_id: str
    name: str
    guideline_class: str
    description: str
    title_keywords: str
    detail_page: str
    release_date: str | None
    last_edit: str | None
    valid_until: str | None
    version_major: str | None
    version_minor: str | None
    association_number: str | None
    leading_orgs: list[dict]
    participating_orgs: list[dict]


def load_index(data_dir: Path) -> dict[str, GuidelineRecord]:
    raw = json.loads((data_dir / "awmf-index.json").read_text())
    out = {}
    for r in raw["records"]:
        awmf_id = r["AWMFGuidelineID"]
        out[awmf_id] = GuidelineRecord(
            awmf_id=awmf_id,
            name=r.get("name", ""),
            guideline_class=r.get("AWMFGuidelineClass", ""),
            description=r.get("description", ""),
            title_keywords=r.get("titleKeywords", ""),
            detail_page=r.get("AWMFDetailPage", ""),
            release_date=r.get("releaseDate"),
            last_edit=r.get("lastEdit"),
            valid_until=r.get("validUntilDate"),
            version_major=r.get("versionMajor"),
            version_minor=r.get("versionMinor"),
            association_number=r.get("AWMFAssociationNumber"),
            leading_orgs=r.get("institutions", {}).get("leading", []) or [],
            participating_orgs=r.get("institutions", {}).get("participating", []) or [],
        )
    return out


# Match a Markdown H2 heading and capture its text.
H2_RE = re.compile(r"^##\s+(.+?)\s*$", re.MULTILINE)


def parse_markdown_sections(md: str) -> list[tuple[str, str]]:
    """Return list of (heading, body) tuples in document order. The pre-H2
    preamble — if any — is returned with heading 'Preamble'."""
    matches = list(H2_RE.finditer(md))
    sections: list[tuple[str, str]] = []

    if not matches:
        return [("Preamble", md.strip())] if md.strip() else []

    if matches[0].start() > 0:
        preamble = md[: matches[0].start()].strip()
        if preamble:
            sections.append(("Preamble", preamble))

    for i, m in enumerate(matches):
        heading = m.group(1).strip()
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(md)
        body = md[start:end].strip()
        sections.append((heading, body))

    return sections


def chunk_section_body(body: str) -> list[str]:
    """Split section body into chunks of ~CHUNK_TARGET_WORDS words by
    grouping consecutive paragraphs. Paragraphs are blank-line-separated."""
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", body) if p.strip()]
    if not paragraphs:
        return []

    chunks: list[str] = []
    buf: list[str] = []
    buf_words = 0

    for p in paragraphs:
        words = len(p.split())
        # If buffer already has enough content, emit before adding more
        if buf and buf_words + words > CHUNK_TARGET_WORDS:
            chunks.append("\n\n".join(buf))
            buf = [p]
            buf_words = words
        else:
            buf.append(p)
            buf_words += words

    if buf:
        if chunks and buf_words < CHUNK_MIN_WORDS:
            # Tail-merge tiny final chunk into the previous one
            chunks[-1] = chunks[-1] + "\n\n" + "\n\n".join(buf)
        else:
            chunks.append("\n\n".join(buf))

    return chunks


def section_id_for(awmf_id: str, idx: int, heading: str) -> str:
    safe = re.sub(r"[^a-zA-Z0-9]+", "-", heading).strip("-").lower()[:60]
    return f"{awmf_id}::s{idx:03d}-{safe}" if safe else f"{awmf_id}::s{idx:03d}"


def chunk_id_for(section_id: str, idx: int) -> str:
    return f"{section_id}::c{idx:03d}"


# ── Cypher templates ──────────────────────────────────────────────────────────
# Chunked apoc.periodic.iterate is overkill at <300 guidelines; plain
# parameterised MERGE is clearer to debug and resumable.

CYPHER_MERGE_GUIDELINE = """
MERGE (g:Guideline {awmfId: $awmfId})
SET g.name = $name,
    g.guidelineClass = $guidelineClass,
    g.description = $description,
    g.titleKeywords = $titleKeywords,
    g.awmfDetailPage = $detailPage,
    g.releaseDate = $releaseDate,
    g.lastEdit = $lastEdit,
    g.validUntilDate = $validUntil,
    g.versionMajor = $versionMajor,
    g.versionMinor = $versionMinor,
    g.associationNumber = $associationNumber,
    g.language = 'de',
    g.source = 'AWMF',
    g.lastIngestedAt = datetime()
RETURN g.awmfId AS awmfId
"""

CYPHER_MERGE_PUBLISHED_BY = """
MATCH (g:Guideline {awmfId: $awmfId})
UNWIND $orgs AS org
  MERGE (o:Organization {organizationId: $awmfId + '::' + org.AWMFAssociationNumber})
  ON CREATE SET o.name = org.name,
                o.discipline = org.discipline,
                o.href = org.href,
                o.source = 'AWMF'
  MERGE (g)-[r:PUBLISHED_BY]->(o)
  SET r.role = $role
RETURN count(o) AS organizationsLinked
"""

CYPHER_MERGE_COVERS_CATEGORY = """
MATCH (g:Guideline {awmfId: $awmfId})
UNWIND $categoryIds AS cid
  MATCH (c:EEHRxFCategory {categoryId: cid})
  MERGE (g)-[r:COVERS_EHDS_CATEGORY]->(c)
  ON CREATE SET r.assignedBy = 'category_mapper.heuristic',
                r.assignedAt = datetime()
RETURN count(c) AS categoriesLinked
"""

CYPHER_MERGE_SECTION = """
MATCH (g:Guideline {awmfId: $awmfId})
MERGE (s:GuidelineSection {sectionId: $sectionId})
SET s.awmfId = $awmfId,
    s.heading = $heading,
    s.orderIndex = $orderIndex,
    s.wordCount = $wordCount
MERGE (g)-[:HAS_SECTION {orderIndex: $orderIndex}]->(s)
RETURN s.sectionId AS sectionId
"""

CYPHER_MERGE_CHUNK = """
MATCH (s:GuidelineSection {sectionId: $sectionId})
MERGE (c:GuidelineChunk {chunkId: $chunkId})
SET c.awmfId = $awmfId,
    c.sectionId = $sectionId,
    c.text = $text,
    c.chunkIndex = $chunkIndex,
    c.wordCount = $wordCount
MERGE (s)-[:HAS_CHUNK {chunkIndex: $chunkIndex}]->(c)
RETURN c.chunkId AS chunkId
"""

CYPHER_FINALIZE_GUIDELINE = """
MATCH (g:Guideline {awmfId: $awmfId})
SET g.sectionCount = $sectionCount,
    g.chunkCount = $chunkCount
RETURN g.awmfId AS awmfId, g.sectionCount AS sections, g.chunkCount AS chunks
"""

CYPHER_GET_CHUNK_COUNT = """
MATCH (g:Guideline {awmfId: $awmfId})
RETURN coalesce(g.chunkCount, 0) AS chunkCount
"""


def load_one(session, rec: GuidelineRecord, md_path: Path, dry_run: bool) -> dict:
    md = md_path.read_text(encoding="utf-8")
    sections = parse_markdown_sections(md)

    if dry_run:
        total_chunks = sum(len(chunk_section_body(body)) for _, body in sections)
        return {
            "awmf_id": rec.awmf_id,
            "sections": len(sections),
            "chunks": total_chunks,
            "dry_run": True,
        }

    # 1. Guideline metadata
    session.run(CYPHER_MERGE_GUIDELINE, {
        "awmfId": rec.awmf_id,
        "name": rec.name,
        "guidelineClass": rec.guideline_class,
        "description": rec.description,
        "titleKeywords": rec.title_keywords,
        "detailPage": rec.detail_page,
        "releaseDate": rec.release_date,
        "lastEdit": rec.last_edit,
        "validUntil": rec.valid_until,
        "versionMajor": rec.version_major,
        "versionMinor": rec.version_minor,
        "associationNumber": rec.association_number,
    })

    # 2. Publisher orgs
    if rec.leading_orgs:
        session.run(CYPHER_MERGE_PUBLISHED_BY, {
            "awmfId": rec.awmf_id,
            "orgs": rec.leading_orgs,
            "role": "leading",
        })
    if rec.participating_orgs:
        session.run(CYPHER_MERGE_PUBLISHED_BY, {
            "awmfId": rec.awmf_id,
            "orgs": rec.participating_orgs,
            "role": "participating",
        })

    # 3. EEHRxF categories
    category_ids = map_to_categories(rec.name, rec.title_keywords, rec.description)
    session.run(CYPHER_MERGE_COVERS_CATEGORY, {
        "awmfId": rec.awmf_id,
        "categoryIds": category_ids,
    })

    # 4. Sections + chunks
    section_count = 0
    chunk_count = 0
    for s_idx, (heading, body) in enumerate(sections):
        s_id = section_id_for(rec.awmf_id, s_idx, heading)
        word_count = len(body.split())
        session.run(CYPHER_MERGE_SECTION, {
            "awmfId": rec.awmf_id,
            "sectionId": s_id,
            "heading": heading,
            "orderIndex": s_idx,
            "wordCount": word_count,
        })
        section_count += 1

        for c_idx, chunk_text in enumerate(chunk_section_body(body)):
            c_id = chunk_id_for(s_id, c_idx)
            session.run(CYPHER_MERGE_CHUNK, {
                "awmfId": rec.awmf_id,
                "sectionId": s_id,
                "chunkId": c_id,
                "text": chunk_text,
                "chunkIndex": c_idx,
                "wordCount": len(chunk_text.split()),
            })
            chunk_count += 1

    # 5. Finalize counts on the guideline node
    session.run(CYPHER_FINALIZE_GUIDELINE, {
        "awmfId": rec.awmf_id,
        "sectionCount": section_count,
        "chunkCount": chunk_count,
    })

    return {
        "awmf_id": rec.awmf_id,
        "sections": section_count,
        "chunks": chunk_count,
        "categories": category_ids,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-dir", type=Path, default=Path("data"),
                    help="Directory containing awmf-index.json + leitlinien-docling/ + leitlinien-markdown/")
    ap.add_argument("--limit", type=int, default=None,
                    help="Process at most N guidelines (test mode)")
    ap.add_argument("--only", type=str, default=None,
                    help="Process only one AWMF ID")
    ap.add_argument("--dry-run", action="store_true",
                    help="Parse and report counts but don't write to Neo4j")
    ap.add_argument("--force", action="store_true",
                    help="Reload guidelines that already have chunkCount > 0")
    ap.add_argument("--neo4j-uri", default=os.environ.get("NEO4J_URI", "bolt://localhost:7687"))
    ap.add_argument("--neo4j-user", default=os.environ.get("NEO4J_USER", "neo4j"))
    ap.add_argument("--neo4j-password", default=os.environ.get("NEO4J_PASSWORD"))
    args = ap.parse_args()

    docling_dir = args.data_dir / "leitlinien-docling"
    md_dir = args.data_dir / "leitlinien-markdown"

    if not (args.data_dir / "awmf-index.json").exists():
        print(f"awmf-index.json not found in {args.data_dir} — run fetch_index.py first.", file=sys.stderr)
        sys.exit(1)

    index = load_index(args.data_dir)
    print(f"Index has {len(index)} guidelines", file=sys.stderr)

    available = sorted([p.stem for p in docling_dir.glob("*.json")]) if docling_dir.exists() else []
    if not available:
        print(f"No parsed guidelines found in {docling_dir}", file=sys.stderr)
        sys.exit(1)

    if args.only:
        targets = [args.only] if args.only in available else []
        if not targets:
            print(f"--only {args.only} not in {docling_dir}", file=sys.stderr)
            sys.exit(1)
    else:
        targets = available
        if args.limit:
            targets = targets[: args.limit]

    print(f"Loading {len(targets)} guidelines into Neo4j (dry_run={args.dry_run})\n", file=sys.stderr)

    if args.dry_run:
        driver = None
        session = _DryRunSession()
    else:
        if not args.neo4j_password:
            print("NEO4J_PASSWORD env var (or --neo4j-password) is required.", file=sys.stderr)
            sys.exit(2)
        from neo4j import GraphDatabase  # lazy import — keeps --dry-run / --help fast
        driver = GraphDatabase.driver(args.neo4j_uri, auth=(args.neo4j_user, args.neo4j_password))
        session = driver.session()

    summary = {"ok": 0, "skipped": 0, "missing_md": 0, "fail": 0}
    try:
        for i, awmf_id in enumerate(targets, 1):
            prefix = f"[{i:>3}/{len(targets)}] {awmf_id:<14}"
            rec = index.get(awmf_id)
            if not rec:
                print(f"{prefix} SKIP not in index")
                summary["skipped"] += 1
                continue

            md_path = md_dir / f"{awmf_id}.md"
            if not md_path.exists():
                print(f"{prefix} MISS no markdown at {md_path}")
                summary["missing_md"] += 1
                continue

            if not args.force and not args.dry_run:
                existing = session.run(CYPHER_GET_CHUNK_COUNT, {"awmfId": awmf_id}).single()
                if existing and existing["chunkCount"] > 0:
                    print(f"{prefix} SKIP already loaded ({existing['chunkCount']} chunks)")
                    summary["skipped"] += 1
                    continue

            try:
                result = load_one(session, rec, md_path, args.dry_run)
                print(f"{prefix} OK   sections={result['sections']:<3} chunks={result['chunks']:<4}"
                      + (f" categories={result.get('categories', [])}" if 'categories' in result else ""))
                summary["ok"] += 1
            except Exception as e:
                print(f"{prefix} FAIL {type(e).__name__}: {e}")
                summary["fail"] += 1

    finally:
        if driver:
            session.close()
            driver.close()

    print(f"\n=== Summary ===", file=sys.stderr)
    for k, v in summary.items():
        print(f"  {k:<12} {v}", file=sys.stderr)


class _DryRunSession:
    """Stand-in that pretends to write but only counts."""
    def run(self, *_a, **_kw):
        class _R:
            def single(self): return None
        return _R()
    def close(self):
        pass


if __name__ == "__main__":
    main()
