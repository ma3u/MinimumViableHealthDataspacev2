#!/usr/bin/env python3
"""Status and type of every study a guideline cites, from PubMed.

For each PubMed id in data/guidelines-manifest.json this asks PubMed's
E-utilities (esummary) and records

  status: retracted, expression of concern, corrected and republished, erratum
          (from the publication types and the linked notices)
  type:   guideline, meta-analysis, systematic review, randomised trial, other
          clinical trial, observational study, review, case report, comment,
          journal article (from the publication types)

A status tool that reports "nothing found" has to prove it can find something.
Every run also asks for one paper known to be retracted (the positive control)
and fails when PubMed's answer does not show it as retracted. A paper PubMed
does not return is reported as `not found`, never as clean.

A clean status says the paper was not withdrawn. It does not say it is sound.

Writes
  data/study-status.json   every study: title, journal, year, types, status, notices
  study-flags.json         committed: the flagged studies with the guidelines that
                           cite them, and the count of study types per guideline

Only PubMed ids are sent. Usage:
  python3 study_status.py            # ask PubMed, write both files
  python3 study_status.py --check    # exit 1 when study-flags.json would change
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
TOOL = "mvhd-guideline-references"
BATCH = 200
PAUSE_SECONDS = 0.4

# Hydroxychloroquine or chloroquine ... a multinational registry analysis, Lancet 2020: retracted.
POSITIVE_CONTROL = "32450107"

# Most serious first; a study carries every flag that applies.
STATUS_BY_PUBTYPE = {
    "Retracted Publication": "retracted",
    "Corrected and Republished Article": "corrected and republished",
}
STATUS_BY_REFTYPE = {
    "Retraction in": "retracted",
    "Expression of concern in": "expression of concern",
    "Corrected and republished in": "corrected and republished",
    "Erratum in": "erratum",
}
STATUS_ORDER = ["retracted", "expression of concern", "corrected and republished", "erratum"]

# First match wins: the strongest design a record names.
TYPE_RULES = [
    ("guideline", ("Practice Guideline", "Guideline", "Consensus Development Conference")),
    ("meta-analysis", ("Meta-Analysis",)),
    ("systematic review", ("Systematic Review",)),
    ("randomised trial", ("Randomized Controlled Trial", "Pragmatic Clinical Trial", "Equivalence Trial")),
    ("other clinical trial", ("Clinical Trial", "Clinical Trial, Phase I", "Clinical Trial, Phase II",
                              "Clinical Trial, Phase III", "Clinical Trial, Phase IV", "Controlled Clinical Trial",
                              "Clinical Study", "Clinical Trial Protocol")),
    ("observational study", ("Observational Study", "Validation Study", "Twin Study")),
    ("review", ("Review",)),
    ("case report", ("Case Reports",)),
    ("comment", ("Editorial", "Comment", "Letter", "News")),
]


def study_type(pubtypes: list[str]) -> str:
    for name, matches in TYPE_RULES:
        if any(p in matches for p in pubtypes):
            return name
    return "journal article"


def study_flags(pubtypes: list[str], references: list[dict]) -> list[str]:
    found = {STATUS_BY_PUBTYPE[p] for p in pubtypes if p in STATUS_BY_PUBTYPE}
    found |= {STATUS_BY_REFTYPE[r.get("reftype", "")] for r in references if r.get("reftype") in STATUS_BY_REFTYPE}
    return [s for s in STATUS_ORDER if s in found]


def parse_summary(answer: dict) -> dict[str, dict]:
    """PubMed's esummary answer, one record per id it knows."""
    result = answer.get("result", {})
    out: dict[str, dict] = {}
    for uid in result.get("uids", []):
        rec = result[uid]
        if "error" in rec:
            continue
        pubtypes = rec.get("pubtype", [])
        refs = rec.get("references", [])
        notices = [{"type": r["reftype"], "pmid": str(r.get("pmid", ""))} for r in refs if r.get("reftype") in STATUS_BY_REFTYPE]
        out[uid] = {
            "pmid": uid, "title": rec.get("title", ""), "journal": rec.get("source", ""),
            "year": int(rec["pubdate"][:4]) if rec.get("pubdate", "")[:4].isdigit() else None,
            "publicationTypes": pubtypes, "type": study_type(pubtypes),
            "flags": study_flags(pubtypes, refs), "notices": notices,
        }
    return out


def cited_by(manifest: dict) -> dict[str, list[str]]:
    """PubMed id -> the guidelines (awmfId) that cite it, current versions only."""
    out: dict[str, set[str]] = {}
    for g in manifest["guidelines"]:
        if g.get("supersededBy"):
            continue
        for r in g.get("references", []):
            if r.get("pmid"):
                out.setdefault(r["pmid"], set()).add(g["awmfId"])
    return {k: sorted(v) for k, v in out.items()}


def http(url: str, data: bytes | None = None) -> str:
    """One request, tried up to four times: PubMed answers a 502 or 429 now and then."""
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, data=data, headers={"User-Agent": TOOL})
            with urllib.request.urlopen(req, timeout=90) as resp:  # noqa: S310 (fixed https host)
                return resp.read().decode("utf-8", errors="replace")
        except OSError as err:  # HTTPError, URLError and socket.timeout are all OSError
            code = getattr(err, "code", None)
            if attempt == 3 or (code is not None and code < 500 and code != 429):
                raise
            time.sleep(2 ** attempt * 2)
    raise AssertionError("unreachable")


def fetch(pmids: list[str], ask=http, pause: float = PAUSE_SECONDS) -> dict[str, dict]:
    """Ask PubMed for the ids and the positive control. Raises when the control is not seen as retracted."""
    ids = sorted(set(pmids) | {POSITIVE_CONTROL})
    found: dict[str, dict] = {}
    for start in range(0, len(ids), BATCH):
        body = f"db=pubmed&retmode=json&tool={TOOL}&id={','.join(ids[start:start + BATCH])}".encode()
        found.update(parse_summary(json.loads(ask(f"{EUTILS}/esummary.fcgi", body))))
        time.sleep(pause)
    control = found.pop(POSITIVE_CONTROL, None) if POSITIVE_CONTROL not in pmids else found.get(POSITIVE_CONTROL)
    if not control or "retracted" not in control["flags"]:
        raise RuntimeError(
            f"positive control failed: PubMed did not show PMID {POSITIVE_CONTROL} as retracted, "
            "so a clean result from this run would prove nothing")
    return found


def build_flags(manifest: dict, status: dict[str, dict]) -> dict:
    """What is committed: flagged studies, studies PubMed did not return, and study types per guideline."""
    citing = cited_by(manifest)
    flagged = [
        {"pmid": p, "flags": status[p]["flags"], "type": status[p]["type"], "year": status[p]["year"],
         "journal": status[p]["journal"], "title": status[p]["title"], "notices": status[p]["notices"],
         "citedBy": citing[p]}
        for p in sorted(citing) if p in status and status[p]["flags"]
    ]
    flagged.sort(key=lambda s: (STATUS_ORDER.index(s["flags"][0]), s["pmid"]))
    types: dict[str, dict[str, int]] = {}
    for p, guidelines in citing.items():
        kind = status[p]["type"] if p in status else "not found"
        for g in guidelines:
            types.setdefault(g, {})
            types[g][kind] = types[g].get(kind, 0) + 1
    return {
        "source": "PubMed E-utilities (esummary)", "positiveControl": POSITIVE_CONTROL,
        "studies": len(citing), "notFound": sorted(p for p in citing if p not in status),
        "countsByFlag": {s: sum(1 for f in flagged if s in f["flags"]) for s in STATUS_ORDER},
        "typesByGuideline": {g: dict(sorted(t.items())) for g, t in sorted(types.items())},
        "flagged": flagged,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--manifest", type=Path, default=HERE / "data" / "guidelines-manifest.json")
    ap.add_argument("--out", type=Path, default=HERE / "data" / "study-status.json")
    ap.add_argument("--flags", type=Path, default=HERE / "study-flags.json")
    ap.add_argument("--check", action="store_true", help="exit 1 when the flags file would change")
    args = ap.parse_args()

    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    citing = cited_by(manifest)
    status = fetch(sorted(citing))
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps({"generated": manifest.get("generated"), "studies": status},
                                   ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    flags = build_flags(manifest, status)
    print(f"{flags['studies']} studies asked, positive control seen as retracted, {len(flags['notFound'])} not found")
    for name, n in flags["countsByFlag"].items():
        print(f"  {name}: {n}")
    for f in flags["flagged"]:
        if f["flags"][0] != "erratum":
            print(f"  ! PMID {f['pmid']} {', '.join(f['flags'])}: {f['title'][:70]} (cited by {', '.join(f['citedBy'])})")
    new = json.dumps(flags, ensure_ascii=False, indent=2) + "\n"
    old = args.flags.read_text(encoding="utf-8") if args.flags.exists() else ""
    if new == old:
        print("flags unchanged")
        return 0
    if args.check:
        print("flags would change", file=sys.stderr)
        return 1
    args.flags.write_text(new, encoding="utf-8")
    print(f"wrote {args.flags}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
