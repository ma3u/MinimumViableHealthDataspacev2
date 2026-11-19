#!/usr/bin/env python3
"""Nationale VersorgungsLeitlinien (NVL): fetch, convert to Markdown, extract references.

The AWMF register refuses automated retrieval (robots.txt: "Block other automated
retrieval", plus a bot check), so this pipeline reads the open source instead:
www.leitlinien.de, whose robots.txt allows every user agent. It

  1. reads the topic pages listed in nvl-sources.json and finds the current
     long and short version PDFs,
  2. downloads a PDF only when its URL is new (a new version has a new file name),
  3. converts each PDF to page-wise Markdown with `pdftotext` (poppler),
  4. extracts the numbered reference list of each long version, with PubMed id
     and DOI where the entry carries one,
  5. writes data/nvl-manifest.json: one record per guideline with version,
     dates, status and its references,
  6. marks a guideline `active: false` when its validity date has passed, when a
     newer version replaced it, or when the topic page no longer offers it.
     Nothing is deleted.

The guideline texts are copyrighted by the ÄZQ ("Verwertung ... nur mit
schriftlicher Zustimmung", the imprint of every NVL). Everything under data/ is
git-ignored and stays on the machine that ran this. What may be committed is
nvl-state.json: titles, versions, dates, status and counts, no guideline text.

Usage:
  python3 nvl_pipeline.py                 # fetch, convert, extract, write manifest
  python3 nvl_pipeline.py --offline       # only convert and extract what is on disk
  python3 nvl_pipeline.py --check         # exit 1 when the state file would change
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import re
import shutil
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
USER_AGENT = "MVHD-guideline-fetch/0.1 (+https://github.com/ma3u/MinimumViableHealthDataspacev2)"
BASE = "https://www.leitlinien.de"
PAUSE_SECONDS = 1.0

GERMAN_MONTHS = {
    "januar": 1, "februar": 2, "märz": 3, "april": 4, "mai": 5, "juni": 6, "juli": 7,
    "august": 8, "september": 9, "oktober": 10, "november": 11, "dezember": 12,
}


# ── finding the documents ────────────────────────────────────────────────────


def find_pdf_links(html: str, topic: str) -> dict[str, str]:
    """The current long and short version PDF of one topic page.

    Archive, consultation drafts, reports and patient material are not the
    guideline. A topic may have no short version.
    """
    links = sorted(set(re.findall(r'href="(https://www\.leitlinien\.de/themen/[^"]+\.pdf)"', html)))
    out: dict[str, str] = {}
    for url in links:
        path = url.split("/themen/", 1)[1]
        if not path.startswith(topic + "/"):
            continue
        if re.search(r"/(archiv|konsultation|leitlinienreport|patientenblaetter|patientenleitlinie)/", url):
            continue
        name = url.rsplit("/", 1)[1].lower()
        if "llr" in name or "konsultation" in name:
            continue
        kind = "short" if "kurz" in name else "long"
        out.setdefault(kind, url)
    return out


def parse_version(file_name: str) -> str | None:
    """`khk-vers7-0.pdf` -> `7.0`, `hypertonie-vers-1-0-kurz.pdf` -> `1.0`."""
    m = re.search(r"vers-?(\d+)-(\d+)", file_name.lower())
    return f"{m.group(1)}.{m.group(2)}" if m else None


# ── PDF to Markdown ──────────────────────────────────────────────────────────


def pdf_to_markdown(pdf: Path, source_url: str, fetched: str) -> str:
    """Page-wise Markdown, one `## Seite N` heading per page.

    `pdftotext -raw` keeps the reading order of the reference lists. The form
    feed that ends a page is removed here, in Python: BSD sed reads `\\f` as the
    letter f and would delete every f in the text.
    """
    if not shutil.which("pdftotext"):
        raise SystemExit("pdftotext not found. Install poppler (brew install poppler / apt install poppler-utils).")
    raw = subprocess.run(
        ["pdftotext", "-raw", "-enc", "UTF-8", str(pdf), "-"],
        check=True, capture_output=True,
    ).stdout.decode("utf-8", errors="replace")
    pages = raw.split("\f")
    if pages and not pages[-1].strip():
        pages.pop()
    title = next((ln.strip() for ln in pages[0].splitlines() if ln.strip()), pdf.stem) if pages else pdf.stem
    parts = [
        f"# {title}",
        "",
        f"Quelle: {source_url} ({len(pages)} Seiten), abgerufen am {fetched}. "
        "Text aus dem PDF extrahiert, nicht redigiert. Urheberrecht: ÄZQ; nur zum lokalen Gebrauch.",
    ]
    for n, page in enumerate(pages, 1):
        parts += ["", f"## Seite {n}", "", page.strip("\n")]
    return "\n".join(parts) + "\n"


# ── facts from the text ──────────────────────────────────────────────────────


def parse_german_date(text: str) -> str | None:
    """`15. Mai 2028` -> `2028-05-15`."""
    m = re.search(r"(\d{1,2})\.\s*([A-Za-zäÄ]+)\s+(\d{4})", text)
    if not m or m.group(2).lower() not in GERMAN_MONTHS:
        return None
    return f"{int(m.group(3)):04d}-{GERMAN_MONTHS[m.group(2).lower()]:02d}-{int(m.group(1)):02d}"


def find_validity(markdown: str) -> dict[str, str | None]:
    """Adoption date and end of validity from the section "Gültigkeitsdauer und Fortschreibung".

    A new version may revise one chapter and only confirm the rest, which then
    keeps its older, earlier end date (NVL Chronische Herzinsuffizienz, version 4).
    `validUntilDate` is the latest end date, `earliestValidUntilDate` the first
    one to pass.
    """
    flat = re.sub(r"\s+", " ", markdown)
    i = flat.upper().find("GÜLTIGKEITSDAUER UND FORTSCHREIBUNG")
    section = flat[i : i + 1500] if i >= 0 else flat[:20000]
    date = r"(\d{1,2}\.\s*[A-Za-zäÄ]+\s+\d{4})"
    untils = sorted(
        d for d in (
            parse_german_date(a or b)
            for a, b in re.findall(rf"bis\s+(?:zum\s+)?{date}\s+gültig|gültig\s+bis\s+(?:zum\s+)?{date}", section)
        ) if d
    )
    adopted = re.search(rf"am\s+{date}[^.]{{0,120}}(?:verabschiedet|beschlossen)", section)
    doi = re.search(r"10\.6101/AZQ/\d+", flat)
    return {
        "adoptedDate": parse_german_date(adopted.group(1)) if adopted else None,
        "validUntilDate": untils[-1] if untils else None,
        "earliestValidUntilDate": untils[0] if untils else None,
        "doi": doi.group(0) if doi else None,
    }


def extract_references(markdown: str) -> list[dict]:
    """The numbered reference list at the end of a long version.

    Entries are numbered 1., 2., 3. ... without gaps, so a number only starts an
    entry when it is the next one expected. A "12." inside a citation is text.
    """
    starts = [m.start() for m in re.finditer(r"(?m)^(?:Literaturverzeichnis|Literatur)\s*$", markdown)]
    if not starts:
        return []
    body = markdown[starts[-1] :]
    # page furniture: headings we added and the running header/footer lines
    body = re.sub(r"(?m)^## Seite \d+\s*$", "", body)
    body = re.sub(r"(?m)^(?:NVL .*|.*fassung – Version .*|© NVL-Programm \d{4}\s+Seite \d+)\s*$", "", body)
    refs: list[dict] = []
    expected, pos, current_start = 1, 0, None
    for m in re.finditer(r"(?m)^(\d{1,4})\.\s*", body):
        if int(m.group(1)) != expected:
            continue
        if current_start is not None:
            refs.append(_reference(expected - 1, body[current_start : m.start()]))
        current_start, expected, pos = m.end(), expected + 1, m.end()
    if current_start is not None:
        refs.append(_reference(expected - 1, body[current_start:]))
    return refs


def _reference(number: int, text: str) -> dict:
    flat = re.sub(r"-\n(?=[a-zäöü])", "", text)  # a word split at a line end
    flat = re.sub(r"\s+", " ", flat).strip()
    pmid = re.search(r"ncbi\.nlm\.nih\.gov/pubmed/(\d{5,9})|PMID:?\s*(\d{5,9})", flat)
    doi = re.search(r"DOI:\s*(10\.\d{4,9}/\S+)", flat)
    years = [int(y) for y in re.findall(r"(?<![\d/.:-])((?:19|20)\d{2})(?=\s*;|\s*\(\d|\s*\[cited|\s+[A-Z][a-z]{2}\b|\.\s|\.$)", flat)]
    years = [y for y in years if y <= dt.date.today().year]
    return {
        "number": number,
        "citation": flat,
        "pmid": next((g for g in pmid.groups() if g), None) if pmid else None,
        "doi": doi.group(1).rstrip(".") if doi else None,
        "year": years[0] if years else None,
    }


# ── status ───────────────────────────────────────────────────────────────────


def status_of(record: dict, today: dt.date) -> tuple[bool, str]:
    """A guideline is active while it is offered, current and inside its validity."""
    if record.get("supersededBy"):
        return False, "superseded"
    if not record.get("offered", True):
        return False, "withdrawn"
    until = record.get("validUntilDate")
    if until and dt.date.fromisoformat(until) < today:
        return False, "expired"
    earliest = record.get("earliestValidUntilDate")
    if earliest and dt.date.fromisoformat(earliest) < today:
        return True, "partly-expired"
    return True, "active"


def guideline_id(topic: str, version: str | None) -> str:
    return f"nvl-{topic}-v{version or 'unknown'}"


# ── run ──────────────────────────────────────────────────────────────────────


def http_get(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=120) as resp:  # noqa: S310 (https URL from our own source list)
        return resp.read()


def build(data: Path, sources: list[dict], offline: bool, today: dt.date) -> dict:
    pdf_dir, md_dir = data / "nvl-pdf", data / "nvl-markdown"
    pdf_dir.mkdir(parents=True, exist_ok=True)
    md_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = data / "nvl-manifest.json"
    previous = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {"guidelines": []}
    known = {g["id"]: g for g in previous["guidelines"]}
    fetched = today.isoformat()
    current_ids: dict[str, str] = {}

    for src in sources:
        topic = src["topic"]
        if offline:
            links = {
                ("short" if "kurz" in p.name else "long"): f"{BASE}/themen/{topic}/{p.name}"
                for p in sorted(pdf_dir.glob("*.pdf")) if p.name.startswith(tuple(src["filePrefixes"]))
            }
        else:
            html = http_get(f"{BASE}/themen/{src.get('page', topic)}").decode("utf-8", errors="replace")
            time.sleep(PAUSE_SECONDS)
            links = find_pdf_links(html, topic)
        if "long" not in links:
            print(f"{topic}: no long version offered", file=sys.stderr)
            continue
        version = parse_version(links["long"].rsplit("/", 1)[1])
        gid = guideline_id(topic, version)
        current_ids[topic] = gid
        record = known.get(gid, {"id": gid, "topic": topic, "firstSeen": fetched})
        record.update({"title": src["title"], "version": version, "publisher": "ÄZQ (BÄK, KBV, AWMF)",
                       "awmfId": src.get("awmfId"), "sourcePage": f"{BASE}/themen/{topic}",
                       "offered": True, "supersededBy": None, "lastSeen": fetched, "files": {}})
        for kind, url in links.items():
            name = url.rsplit("/", 1)[1]
            pdf = pdf_dir / name
            if not pdf.exists():
                if offline:
                    continue
                pdf.write_bytes(http_get(url))
                time.sleep(PAUSE_SECONDS)
                print(f"{topic}: downloaded {name}")
            md = md_dir / (pdf.stem + ".md")
            text = pdf_to_markdown(pdf, url, fetched)
            if not md.exists() or md.read_text(encoding="utf-8").split("\n", 3)[-1] != text.split("\n", 3)[-1]:
                md.write_text(text, encoding="utf-8")
            record["files"][kind] = {"url": url, "pdf": name, "markdown": md.name,
                                     "sha256": hashlib.sha256(pdf.read_bytes()).hexdigest()}
            if kind == "long":
                record.update(find_validity(text))
                record["references"] = extract_references(text)
        known[gid] = record

    # an older version of a topic that now has a newer one, or a topic no longer offered
    for g in known.values():
        newest = current_ids.get(g["topic"])
        if newest and newest != g["id"]:
            g["supersededBy"], g["offered"] = newest, False
        elif not newest and not offline and any(s["topic"] == g["topic"] for s in sources):
            g["offered"] = False
        g["active"], g["status"] = status_of(g, today)

    manifest = {"source": BASE, "generated": fetched, "guidelines": sorted(known.values(), key=lambda g: g["id"])}
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return manifest


def state_of(manifest: dict) -> dict:
    """What may be committed: no guideline text, no citations."""
    rows = []
    for g in manifest["guidelines"]:
        refs = g.get("references", [])
        rows.append({
            "id": g["id"], "title": g["title"], "version": g["version"], "awmfId": g.get("awmfId"),
            "adoptedDate": g.get("adoptedDate"), "validUntilDate": g.get("validUntilDate"),
            "earliestValidUntilDate": g.get("earliestValidUntilDate"),
            "active": g["active"], "status": g["status"], "supersededBy": g.get("supersededBy"),
            "sourcePage": g["sourcePage"], "references": len(refs),
            "referencesWithPmid": sum(1 for r in refs if r["pmid"]),
        })
    return {"source": manifest["source"], "guidelines": rows}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--data-dir", type=Path, default=HERE / "data")
    ap.add_argument("--sources", type=Path, default=HERE / "nvl-sources.json")
    ap.add_argument("--state", type=Path, default=HERE / "nvl-state.json")
    ap.add_argument("--offline", action="store_true", help="use the PDFs already on disk, fetch nothing")
    ap.add_argument("--check", action="store_true", help="exit 1 when the state file would change")
    ap.add_argument("--today", type=dt.date.fromisoformat, default=dt.date.today(), help=argparse.SUPPRESS)
    args = ap.parse_args()

    sources = json.loads(args.sources.read_text(encoding="utf-8"))["topics"]
    manifest = build(args.data_dir, sources, args.offline, args.today)
    new_state = json.dumps(state_of(manifest), ensure_ascii=False, indent=2) + "\n"
    old_state = args.state.read_text(encoding="utf-8") if args.state.exists() else ""
    for g in state_of(manifest)["guidelines"]:
        print(f"{g['id']:34} {g['status']:10} valid until {g['validUntilDate']}  "
              f"{g['references']} references, {g['referencesWithPmid']} with a PubMed id")
    if new_state == old_state:
        print("state unchanged")
        return 0
    if args.check:
        print("state would change", file=sys.stderr)
        return 1
    args.state.write_text(new_state, encoding="utf-8")
    print(f"wrote {args.state}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
