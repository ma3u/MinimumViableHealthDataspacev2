#!/usr/bin/env python3
"""Import the subset of the NeDRex open dump the hub needs (#1167).

The REPO4EU open dump of NeDRex 2.2.13 (doi:10.5281/zenodo.23940639, CC BY 4.0)
holds one gzipped CSV per MongoDB collection. This script reads four of them,
plus the metadata file, and writes neo4j/seed-nedrex.cypher with only what the
hub's conditions reach:

1. The NeDRex (MONDO) disorder each hub SNOMED CT code maps to. First through
   the disorder's own cross-reference (`snomedct.<code>` in domainIds). A code
   with none goes the ICD-10 route: the disorders that carry one of the ICD-10
   codes the hub pairs with it (scripts/nedrex/hub-conditions.json), or its
   three-character category, and of those the one with the most MONDO
   subtypes, when it has any and no other candidate has as many. An ICD-10
   category is shared by rare syndromes and "susceptibility to" entries
   (J45.9 names seven asthma susceptibility traits), so the most general
   disorder is the one a cohort starts from, and a tie or a set of leaves is
   no match rather than a guess.
2. Every ancestor of those disorders up the MONDO hierarchy, with the
   SUBTYPE_OF edges between them, so a cohort can start from any level.
3. The drugs NeDRex lists as indicated for a matched disorder, with the
   source of each indication: DrugCentral (approved use) or CTD (curated from
   the literature, much of it hypotheses; for hypertension 185 of 259 CTD
   indications have no DrugCentral counterpart).

Standard library only, deterministic: the same dump and code list give the
same file byte for byte. The dump itself is never committed; download the
files from https://zenodo.org/records/23940639 into an empty directory:

    disorder.csv.gz drug.csv.gz drug_has_indication.csv.gz
    disorder_is_subtype_of_disorder.csv.gz metadata.csv.gz

then:

    python3 -I scripts/nedrex/import_nedrex.py /path/to/dump

The checksums Zenodo publishes for these files are pinned below; a file that
differs stops the import.
"""

from __future__ import annotations

import argparse
import csv
import gzip
import hashlib
import json
import sys
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable, Iterator

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_HUB = ROOT / "scripts" / "nedrex" / "hub-conditions.json"
DEFAULT_OUT = ROOT / "neo4j" / "seed-nedrex.cypher"

RELEASE = {
    "version": "2.2.13",
    "title": "NeDRex Open TUM 03.11.2026 19:31",
    "doi": "10.5281/zenodo.23940639",
    "url": "https://doi.org/10.5281/zenodo.23940639",
    "licence": "CC-BY-4.0",
    "licenceUrl": "https://creativecommons.org/licenses/by/4.0/",
    "publisher": "REPO4EU, NeDRex team, Technical University of Munich",
    "attribution": (
        "Contains data from NeDRex 2.2.13, the REPO4EU open dump "
        "(doi:10.5281/zenodo.23940639), licensed under CC BY 4.0. "
        "Subset selected and reshaped for the EHDS Integration Hub."
    ),
}

# md5 of each file as Zenodo lists it for record 23940639.
DUMP_MD5 = {
    "disorder.csv.gz": "daeeb78db0c4399c7d18d5a93845f534",
    "disorder_is_subtype_of_disorder.csv.gz": "c8fd7a08b1ec9fc5fcd76477744f29ae",
    "drug.csv.gz": "95728dcd717a1133455199b9b4795fc5",
    "drug_has_indication.csv.gz": "b54484796c021ba7416a55654980b732",
    "metadata.csv.gz": "5e1aa180397d4e7610db5c0818b58402",
}

# Rows per UNWIND statement in the seed.
CHUNK = 200

csv.field_size_limit(16 * 1024 * 1024)


# ── Reading the dump ──────────────────────────────────────────────────────────


def read_rows(dump_dir: Path, name: str) -> Iterator[dict[str, str]]:
    with gzip.open(dump_dir / name, "rt", encoding="utf-8", newline="") as f:
        yield from csv.DictReader(f)


def parse_list(cell: str) -> list[str]:
    """A list cell of the CSV export is JSON (`["a", "b"]`); empty means []."""
    if not cell:
        return []
    value = json.loads(cell)
    return [str(v) for v in value] if isinstance(value, list) else []


def verify_checksums(dump_dir: Path, expected: dict[str, str] = DUMP_MD5) -> list[str]:
    """The files that are missing or differ from the published md5."""
    problems = []
    for name, md5 in sorted(expected.items()):
        path = dump_dir / name
        if not path.is_file():
            problems.append(f"{name}: missing")
            continue
        digest = hashlib.md5(path.read_bytes()).hexdigest()
        if digest != md5:
            problems.append(f"{name}: md5 {digest}, Zenodo publishes {md5}")
    return problems


@dataclass
class Disorder:
    nedrex_id: str
    name: str
    description: str
    icd10: list[str]
    snomed: list[str]


@dataclass
class Drug:
    nedrex_id: str
    name: str
    drugcentral_ids: list[str]
    cas_number: str
    drug_groups: list[str]


@dataclass
class Dump:
    version: str = ""
    source_versions: dict[str, str] = field(default_factory=dict)
    disorders: dict[str, Disorder] = field(default_factory=dict)
    drugs: dict[str, Drug] = field(default_factory=dict)
    parents: dict[str, set[str]] = field(default_factory=lambda: defaultdict(set))
    children: dict[str, set[str]] = field(default_factory=lambda: defaultdict(set))
    # disorder id -> drug id -> sorted sources
    indications: dict[str, dict[str, set[str]]] = field(
        default_factory=lambda: defaultdict(lambda: defaultdict(set))
    )
    by_snomed: dict[str, set[str]] = field(default_factory=lambda: defaultdict(set))
    by_icd10: dict[str, set[str]] = field(default_factory=lambda: defaultdict(set))


def load_dump(dump_dir: Path) -> Dump:
    dump = Dump()
    for row in read_rows(dump_dir, "metadata.csv.gz"):
        dump.version = row.get("version", "")
        sources = json.loads(row.get("source_databases") or "{}")
        dump.source_versions = {
            k: str(v.get("version", "")) for k, v in sorted(sources.items())
        }
    for row in read_rows(dump_dir, "disorder.csv.gz"):
        domain_ids = parse_list(row["domainIds"])
        d = Disorder(
            nedrex_id=row["primaryDomainId"],
            name=row["displayName"],
            description=row.get("description", ""),
            icd10=sorted(set(parse_list(row["icd10"]))),
            snomed=sorted({x[len("snomedct.") :] for x in domain_ids if x.startswith("snomedct.")}),
        )
        dump.disorders[d.nedrex_id] = d
        for code in d.snomed:
            dump.by_snomed[code].add(d.nedrex_id)
        for code in d.icd10:
            dump.by_icd10[code].add(d.nedrex_id)
    for row in read_rows(dump_dir, "disorder_is_subtype_of_disorder.csv.gz"):
        child, parent = row["sourceDomainId"], row["targetDomainId"]
        dump.parents[child].add(parent)
        dump.children[parent].add(child)
    for row in read_rows(dump_dir, "drug.csv.gz"):
        domain_ids = parse_list(row["domainIds"])
        dr = Drug(
            nedrex_id=row["primaryDomainId"],
            name=row["displayName"],
            drugcentral_ids=sorted(
                {x[len("drug_central.") :] for x in domain_ids if x.startswith("drug_central.")},
                key=_natural,
            ),
            cas_number=row.get("casNumber", ""),
            drug_groups=sorted(set(parse_list(row.get("drugGroups", "")))),
        )
        dump.drugs[dr.nedrex_id] = dr
    for row in read_rows(dump_dir, "drug_has_indication.csv.gz"):
        sources = parse_list(row["dataSources"])
        dump.indications[row["targetDomainId"]][row["sourceDomainId"]].update(sources)
    return dump


def _natural(value: str) -> tuple[int, str]:
    return (int(value), value) if value.isdigit() else (sys.maxsize, value)


# ── Matching ──────────────────────────────────────────────────────────────────


def closure(start: str, graph: dict[str, set[str]]) -> set[str]:
    """Every node reachable from start (start excluded); cycles are safe."""
    seen: set[str] = set()
    stack = list(graph.get(start, ()))
    while stack:
        node = stack.pop()
        if node in seen:
            continue
        seen.add(node)
        stack.extend(graph.get(node, ()))
    seen.discard(start)
    return seen


def icd10_category(code: str) -> str:
    """J45.20 -> J45: the three-character category ICD-10 groups codes under."""
    return code.split(".", 1)[0].strip().upper()


@dataclass(frozen=True)
class Match:
    code: str
    display: str
    disorders: tuple[str, ...]
    route: str  # "snomedct", "icd10" or "none"
    via: str  # what matched: snomedct.<code>, the ICD-10 key, or why nothing did


def match_condition(dump: Dump, code: str, display: str, icd10: Iterable[str]) -> Match:
    by_snomed = sorted(dump.by_snomed.get(code, ()))
    if by_snomed:
        return Match(code, display, tuple(by_snomed), "snomedct", f"snomedct.{code}")

    hub_icd = sorted({c.strip().upper() for c in icd10 if c.strip()})
    if not hub_icd:
        return Match(code, display, (), "none", "no SNOMED CT xref, no ICD-10 code in the hub")
    keys = sorted({k for c in hub_icd for k in (c, icd10_category(c))})
    candidates = sorted({d for k in keys for d in dump.by_icd10.get(k, ())})
    if not candidates:
        return Match(
            code, display, (), "none",
            f"no SNOMED CT xref; no disorder carries {', '.join(keys)}",
        )
    subtypes = {d: len(closure(d, dump.children)) for d in candidates}
    best = max(subtypes.values())
    winners = [d for d in candidates if subtypes[d] == best]
    if best == 0:
        return Match(
            code, display, (), "none",
            f"no SNOMED CT xref; {len(candidates)} disorder(s) carry {', '.join(keys)}, "
            "none with MONDO subtypes",
        )
    if len(winners) > 1:
        return Match(
            code, display, (), "none",
            f"no SNOMED CT xref; {len(winners)} disorders tie on {', '.join(keys)}",
        )
    winner = winners[0]
    via = ",".join(k for k in keys if k in dump.disorders[winner].icd10)
    return Match(code, display, (winner,), "icd10", via)


def match_conditions(dump: Dump, conditions: list[dict]) -> list[Match]:
    return [
        match_condition(dump, str(c["code"]), str(c.get("display", "")), c.get("icd10", []))
        for c in sorted(conditions, key=lambda c: _natural(str(c["code"])))
    ]


@dataclass
class Subset:
    matched: list[str]
    disorders: list[str]
    subtype_edges: list[tuple[str, str]]
    drugs: list[str]
    indications: list[tuple[str, str, tuple[str, ...]]]  # drug, disorder, sources


def select_subset(dump: Dump, matches: list[Match]) -> Subset:
    matched = sorted({d for m in matches for d in m.disorders})
    keep = set(matched)
    for d in matched:
        keep |= closure(d, dump.parents)
    keep &= set(dump.disorders)
    edges = sorted(
        (child, parent)
        for child in keep
        for parent in dump.parents.get(child, ())
        if parent in keep
    )
    indications = sorted(
        (drug, disorder, tuple(sorted(sources)))
        for disorder in matched
        for drug, sources in dump.indications.get(disorder, {}).items()
        if drug in dump.drugs
    )
    drugs = sorted({drug for drug, _, _ in indications})
    return Subset(matched, sorted(keep), edges, drugs, indications)


# ── Cypher ────────────────────────────────────────────────────────────────────


def cypher_literal(value: object) -> str:
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return repr(value)
    if isinstance(value, str):
        escaped = (
            value.replace("\\", "\\\\")
            .replace("'", "\\'")
            .replace("\n", "\\n")
            .replace("\r", "\\r")
            .replace("\t", "\\t")
        )
        return f"'{escaped}'"
    if isinstance(value, (list, tuple)):
        return "[" + ", ".join(cypher_literal(v) for v in value) + "]"
    if isinstance(value, dict):
        return "{" + ", ".join(f"{k}: {cypher_literal(v)}" for k, v in value.items()) + "}"
    raise TypeError(f"no Cypher literal for {type(value).__name__}")


def _chunks(items: list, size: int = CHUNK) -> Iterator[list]:
    for i in range(0, len(items), size):
        yield items[i : i + size]


def _unwind(rows: list, body: str) -> list[str]:
    out = []
    for chunk in _chunks(rows):
        lines = ",\n  ".join(cypher_literal(r) for r in chunk)
        out.append(f"UNWIND [\n  {lines}\n] AS row\n{body};\n")
    return out


def mondo_curie(nedrex_id: str) -> str:
    """mondo.0008383 -> MONDO:0008383."""
    prefix, _, local = nedrex_id.partition(".")
    return f"{prefix.upper()}:{local}" if local else nedrex_id


def render_cypher(dump: Dump, matches: list[Match], subset: Subset) -> str:
    version = RELEASE["version"]
    by_route: dict[str, int] = defaultdict(int)
    for m in matches:
        by_route[m.route] += 1
    dc = sum(1 for _, _, s in subset.indications if "drugcentral" in s)
    ctd_only = sum(1 for _, _, s in subset.indications if s == ("ctd",))

    head = [
        "// ==============================================================================",
        f"// NeDRex {version} subset for the hub's conditions (#1167)",
        "//",
        "// GENERATED by scripts/nedrex/import_nedrex.py from the REPO4EU open dump",
        f"// \"{RELEASE['title']}\", doi:{RELEASE['doi']}, CC BY 4.0. Do not edit;",
        "// rerun the importer. Attribution: the (:NeDRexRelease) node, and",
        "// nedrexRelease on every node and relationship this file writes.",
        "//",
        f"// {len(matches)} hub SNOMED CT codes: {by_route['snomedct']} matched through the",
        f"// disorder's SNOMED CT xref, {by_route['icd10']} through ICD-10, {by_route['none']} not at all.",
        f"// {len(subset.matched)} matched disorders, {len(subset.disorders)} with their MONDO ancestors,",
        f"// {len(subset.subtype_edges)} SUBTYPE_OF edges, {len(subset.drugs)} drugs,",
        f"// {len(subset.indications)} indications: {dc} from DrugCentral, {ctd_only} from CTD only.",
        "//",
        "// code       route     via                    disorder",
    ]
    for m in matches:
        target = ", ".join(
            f"{d} {dump.disorders[d].name}" for d in m.disorders
        ) or m.via
        via = m.via if m.disorders else "-"
        head.append(f"// {m.code:<10} {m.route:<9} {via:<22} {target}"[:200].rstrip())
    head += [
        "//",
        "// Idempotent, MERGE only. neo4j/seed.sh runs it after the terminology seeds.",
        "// By hand:",
        "//",
        "//   docker exec -i health-dataspace-neo4j \\",
        "//     cypher-shell -u neo4j -p healthdataspace < neo4j/seed-nedrex.cypher",
        "// ==============================================================================",
        "",
    ]

    parts: list[str] = ["\n".join(head)]

    release = dict(RELEASE)
    release["sourceVersions"] = [f"{k} {v}" for k, v in dump.source_versions.items()]
    parts.append("// ── The release, with its licence and citation ─────────────────────────────")
    parts.append(
        f"MERGE (r:NeDRexRelease {{version: {cypher_literal(version)}}})\n"
        f"ON CREATE SET r += {cypher_literal(release)}\n"
        f"ON MATCH SET r += {cypher_literal(release)};\n"
    )

    parts.append("// ── Disorders (MONDO): the matched ones and their ancestors ──────────────────")
    matched = set(subset.matched)
    disorder_rows = [
        {
            "nedrexId": d,
            "mondoId": mondo_curie(d),
            "name": dump.disorders[d].name,
            "description": dump.disorders[d].description,
            "icd10": dump.disorders[d].icd10,
            "snomedCodes": dump.disorders[d].snomed,
            "hubMatch": d in matched,
            "nedrexRelease": version,
        }
        for d in subset.disorders
    ]
    parts += _unwind(
        disorder_rows,
        "MERGE (d:NeDRexDisorder {nedrexId: row.nedrexId})\n"
        "ON CREATE SET d += row\n"
        "ON MATCH SET d += row",
    )

    parts.append("// ── MONDO hierarchy between them ─────────────────────────────────────────────")
    parts += _unwind(
        [[c, p] for c, p in subset.subtype_edges],
        "MATCH (c:NeDRexDisorder {nedrexId: row[0]})\n"
        "MATCH (p:NeDRexDisorder {nedrexId: row[1]})\n"
        "MERGE (c)-[s:SUBTYPE_OF]->(p)\n"
        f"ON CREATE SET s.nedrexRelease = {cypher_literal(version)}\n"
        f"ON MATCH SET s.nedrexRelease = {cypher_literal(version)}",
    )

    parts.append("// ── Drugs indicated for a matched disorder ───────────────────────────────────")
    drug_rows = []
    for d in subset.drugs:
        drug = dump.drugs[d]
        row: dict[str, object] = {
            "nedrexId": d,
            "drugbankId": d.split(".", 1)[1] if d.startswith("drugbank.") else "",
            "name": drug.name,
            "drugCentralIds": drug.drugcentral_ids,
            "drugGroups": drug.drug_groups,
            "nedrexRelease": version,
        }
        if drug.cas_number:
            row["casNumber"] = drug.cas_number
        drug_rows.append(row)
    parts += _unwind(
        drug_rows,
        "MERGE (dr:NeDRexDrug {nedrexId: row.nedrexId})\n"
        "ON CREATE SET dr += row\n"
        "ON MATCH SET dr += row",
    )

    parts.append("// ── Indications, with their source: DrugCentral (approved use) or CTD ────────")
    parts += _unwind(
        [
            {
                "drug": drug,
                "disorder": disorder,
                "sources": list(sources),
                "drugCentral": "drugcentral" in sources,
            }
            for drug, disorder, sources in subset.indications
        ],
        "MATCH (dr:NeDRexDrug {nedrexId: row.drug})\n"
        "MATCH (d:NeDRexDisorder {nedrexId: row.disorder})\n"
        "MERGE (dr)-[i:INDICATED_FOR]->(d)\n"
        f"ON CREATE SET i.sources = row.sources, i.drugCentral = row.drugCentral, i.nedrexRelease = {cypher_literal(version)}\n"
        f"ON MATCH SET i.sources = row.sources, i.drugCentral = row.drugCentral, i.nedrexRelease = {cypher_literal(version)}",
    )

    parts.append("// ── The hub's SNOMED CT concepts to their NeDRex disorder ────────────────────")
    links = [
        {"code": m.code, "disorder": d, "route": m.route, "via": m.via}
        for m in matches
        for d in m.disorders
    ]
    pairs = [[link["code"], link["disorder"]] for link in links]
    parts.append(
        "// A mapping an earlier run wrote and this one does not.\n"
        "MATCH (s:SnomedConcept)-[m:MAPS_TO_DISORDER]->(d:NeDRexDisorder)\n"
        f"WHERE NOT [s.conceptId, d.nedrexId] IN {cypher_literal(pairs)}\n"
        "DELETE m;\n"
    )
    parts += _unwind(
        links,
        "MATCH (s:SnomedConcept {conceptId: row.code})\n"
        "MATCH (d:NeDRexDisorder {nedrexId: row.disorder})\n"
        "MERGE (s)-[m:MAPS_TO_DISORDER]->(d)\n"
        f"ON CREATE SET m.route = row.route, m.via = row.via, m.nedrexRelease = {cypher_literal(version)}\n"
        f"ON MATCH SET m.route = row.route, m.via = row.via, m.nedrexRelease = {cypher_literal(version)}",
    )
    return "\n".join(parts)


# ── Command line ──────────────────────────────────────────────────────────────


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    ap.add_argument("dump", type=Path, help="directory with the downloaded dump files")
    ap.add_argument("--hub", type=Path, default=DEFAULT_HUB, help="hub condition codes (JSON)")
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT, help="Cypher seed to write")
    args = ap.parse_args(argv)

    problems = verify_checksums(args.dump)
    if problems:
        print("The dump does not match the files Zenodo publishes:", file=sys.stderr)
        for p in problems:
            print(f"  {p}", file=sys.stderr)
        return 2

    dump = load_dump(args.dump)
    if dump.version != RELEASE["version"]:
        print(f"metadata says NeDRex {dump.version}, expected {RELEASE['version']}", file=sys.stderr)
        return 2

    conditions = json.loads(args.hub.read_text(encoding="utf-8"))["conditions"]
    matches = match_conditions(dump, conditions)
    subset = select_subset(dump, matches)
    args.out.write_text(render_cypher(dump, matches, subset), encoding="utf-8")

    for m in matches:
        target = ", ".join(f"{d} ({dump.disorders[d].name})" for d in m.disorders) or "-"
        print(f"{m.code:<10} {m.route:<9} {m.via:<40} {target}")
    print(
        f"wrote {args.out}: {len(subset.matched)} matched disorders, "
        f"{len(subset.disorders)} with ancestors, {len(subset.drugs)} drugs, "
        f"{len(subset.indications)} indications"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
