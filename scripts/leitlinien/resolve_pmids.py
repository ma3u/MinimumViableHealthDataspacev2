#!/usr/bin/env python3
"""Find the PubMed id of guideline references that do not carry one.

The NVL print a PubMed link behind most entries; the DEGAM guidelines print
none. This asks PubMed's public E-utilities, in this order:

  1. the DOI, when the entry has one        (esearch, field [AID])
  2. journal, year, volume, first page and first author   (ecitmatch)

A match is taken only when PubMed returns exactly one record. An ambiguous or
missing answer leaves the entry unresolved: a wrong link from a guideline to a
study is worse than no link. Every id found is marked with where it came from
(`pmidSource`: "doi" or "citation match"; ids printed in the guideline are
"reference list").

Only bibliographic data is sent: a DOI, or journal|year|volume|page|author.
Answers are cached in data/pmid-cache.json, so a second run asks nothing again.

Usage:
  python3 resolve_pmids.py              # resolve, update data/guidelines-manifest.json
  python3 resolve_pmids.py --dry-run    # report what could be asked, ask nothing
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
TOOL = "mvhd-guideline-references"
PAUSE_SECONDS = 0.4  # NCBI allows three requests a second without a key
BATCH = 40

MONTHS = (r"Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember|"
          r"Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Okt|Nov|Dec|Dez")
# "... Am J Public Health. Januar 2021;111(1):145–9."  and  "... J Hypertens 2023; 41(12):1874–2071."
LOCATOR = re.compile(
    rf"(?:\.\s*|\s)(?:\d{{1,2}}\.?\s*)?(?:(?:{MONTHS})\.?\s+)?(?P<year>(?:19|20)\d{{2}})"
    rf"(?:\s+(?:{MONTHS})\.?(?:\s+\d{{1,2}})?)?\s*;\s*(?P<volume>\d+)\s*(?:\([^)]*\))?\s*:\s*(?P<page>[A-Za-z]?\d+)"
)


def citation_key(citation: str) -> str:
    return hashlib.sha1(citation.encode("utf-8")).hexdigest()[:16]  # noqa: S324 (a cache key, not a secret)


def parse_locator(citation: str) -> dict | None:
    """Journal, year, volume, first page and first author of a journal citation.

    Returns None for anything that is not one: a book, a report, a web page.
    """
    m = LOCATOR.search(citation)
    if not m:
        return None
    before = citation[: m.start()].rstrip(" .")
    journal = re.split(r"[.?!]\s", before)[-1].strip()  # the title may end in a question mark
    author = re.match(r"([A-Za-zÀ-ÿ'’-]+(?: [a-zà-ÿ]{2,4} [A-Za-zÀ-ÿ'’-]+)?)", citation)
    if not journal or len(journal) > 120 or not author or journal == before and "." not in citation[: m.start()]:
        return None
    return {"journal": journal, "year": m.group("year"), "volume": m.group("volume"),
            "page": m.group("page"), "author": author.group(1)}


def ecitmatch_line(loc: dict, key: str) -> str:
    clean = lambda v: re.sub(r"[|\r\n]", " ", v)  # noqa: E731
    return "|".join([clean(loc["journal"]), loc["year"], loc["volume"], loc["page"], clean(loc["author"]), key, ""])


def parse_ecitmatch(answer: str) -> dict[str, str]:
    """`journal|year|volume|page|author|key|PMID` per line; only a plain number is a match."""
    found: dict[str, str] = {}
    for line in answer.splitlines():
        parts = line.strip().split("|")
        if len(parts) >= 7 and parts[6].strip().isdigit():
            found[parts[5]] = parts[6].strip()
    return found


def unresolved(manifest: dict) -> list[dict]:
    return [r for g in manifest["guidelines"] for r in g.get("references", []) if not r.get("pmid")]


def http(url: str, data: bytes | None = None) -> str:
    req = urllib.request.Request(url, data=data, headers={"User-Agent": TOOL})
    with urllib.request.urlopen(req, timeout=60) as resp:  # noqa: S310 (fixed https host)
        return resp.read().decode("utf-8", errors="replace")


def resolve(manifest: dict, cache: dict[str, str | None], ask=http, pause: float = PAUSE_SECONDS) -> dict[str, int]:
    """Fill `pmid` and `pmidSource` in place. `cache` maps a citation key to an id or None."""
    refs = unresolved(manifest)
    counts = {"asked": 0, "doi": 0, "citation match": 0, "cached": 0, "not a journal citation": 0, "no match": 0}
    sources: dict[str, str] = {}

    todo_match: list[tuple[str, dict]] = []
    for r in refs:
        key = citation_key(r["citation"])
        if key in cache:
            counts["cached"] += 1
            continue
        if r.get("doi"):
            term = urllib.parse.quote(f'"{r["doi"]}"[AID]')
            answer = json.loads(ask(f"{EUTILS}/esearch.fcgi?db=pubmed&retmode=json&tool={TOOL}&term={term}"))
            counts["asked"] += 1
            time.sleep(pause)
            ids = answer.get("esearchresult", {}).get("idlist", [])
            if len(ids) == 1:
                cache[key], sources[key] = ids[0], "doi"
                continue
        loc = parse_locator(r["citation"])
        if loc:
            todo_match.append((key, loc))
        else:
            cache[key] = None
            counts["not a journal citation"] += 1

    for start in range(0, len(todo_match), BATCH):
        batch = todo_match[start : start + BATCH]
        bdata = "\r".join(ecitmatch_line(loc, key) for key, loc in batch)
        body = urllib.parse.urlencode({"db": "pubmed", "retmode": "xml", "tool": TOOL, "bdata": bdata}).encode()
        found = parse_ecitmatch(ask(f"{EUTILS}/ecitmatch.cgi", body))
        counts["asked"] += 1
        time.sleep(pause)
        for key, _loc in batch:
            cache[key] = found.get(key)
            if key in found:
                sources[key] = "citation match"

    for r in refs:
        key = citation_key(r["citation"])
        pmid = cache.get(key)
        if pmid:
            r["pmid"] = pmid
            r["pmidSource"] = sources.get(key) or ("doi" if r.get("doi") else "citation match")
            counts[r["pmidSource"]] += 0 if key not in sources else 1
        elif key not in sources and cache.get(key) is None and parse_locator(r["citation"]):
            counts["no match"] += 1
    return counts


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--manifest", type=Path, default=HERE / "data" / "guidelines-manifest.json")
    ap.add_argument("--cache", type=Path, default=HERE / "data" / "pmid-cache.json")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    cache = json.loads(args.cache.read_text(encoding="utf-8")) if args.cache.exists() else {}
    refs = unresolved(manifest)
    if args.dry_run:
        with_doi = sum(1 for r in refs if r.get("doi"))
        journal = sum(1 for r in refs if not r.get("doi") and parse_locator(r["citation"]))
        print(f"{len(refs)} references without a PubMed id: {with_doi} with a DOI, "
              f"{journal} more that read as a journal citation, {len(refs) - with_doi - journal} neither")
        return 0
    counts = resolve(manifest, cache)
    args.cache.write_text(json.dumps(cache, indent=0, sort_keys=True) + "\n", encoding="utf-8")
    args.manifest.write_text(json.dumps(manifest, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    for g in manifest["guidelines"]:
        rs = g.get("references", [])
        print(f"{g['id']:34} {sum(1 for r in rs if r.get('pmid'))} of {len(rs)} references with a PubMed id")
    print(", ".join(f"{k}: {v}" for k, v in counts.items()))
    return 0


if __name__ == "__main__":
    sys.exit(main())
