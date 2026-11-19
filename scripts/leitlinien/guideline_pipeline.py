#!/usr/bin/env python3
"""German clinical guidelines from open sources: fetch, convert to Markdown, extract references.

The AWMF register refuses automated retrieval (robots.txt: "Block other automated
retrieval", plus a bot check), so this pipeline reads the publishers that allow
it: www.leitlinien.de (Nationale VersorgungsLeitlinien) and www.degam.de (the
guidelines of the DEGAM). Both robots.txt files allow every user agent. It

  1. reads the pages listed in guideline-sources.json and finds the current
     long and short version PDFs,
  2. downloads a PDF only when it is not on disk yet,
  3. converts each PDF to page-wise Markdown with `pdftotext` (poppler),
  4. extracts the numbered reference list of each long version, with PubMed id
     and DOI where the entry carries one (resolve_pmids.py looks up the rest),
  5. writes data/guidelines-manifest.json: one record per guideline with
     version, dates, status and its references,
  6. marks a guideline `active: false` when its validity date has passed, when a
     newer version replaced it, or when the page no longer offers it.
     Nothing is deleted.

The guideline texts are copyrighted (ÄZQ, DEGAM: "Verwertung ... nur mit
schriftlicher Zustimmung"). Everything under data/ is git-ignored and stays on
the machine that ran this. What may be committed is guidelines-state.json:
titles, versions, dates, status and counts, no guideline text.

Usage:
  python3 guideline_pipeline.py              # fetch, convert, extract, write manifest
  python3 guideline_pipeline.py --offline    # only convert and extract what is on disk
  python3 guideline_pipeline.py --check      # exit 1 when the state file would change
"""
from __future__ import annotations

import argparse
import calendar
import datetime as dt
import hashlib
import html as html_lib
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


def find_labelled_links(page: str, base_url: str, patterns: dict[str, str]) -> dict[str, str]:
    """PDF links chosen by their link text, for a page whose file names say nothing.

    `patterns` maps "long" and "short" to a regular expression on the link text;
    the first matching link of each kind wins.
    """
    out: dict[str, str] = {}
    for href, label in re.findall(r'<a[^>]+href="([^"]+\.pdf[^"]*)"[^>]*>(.*?)</a>', page, flags=re.S):
        text = re.sub(r"\s+", " ", html_lib.unescape(re.sub(r"<[^>]+>", "", label))).strip()
        for kind, pattern in patterns.items():
            if kind not in out and re.match(pattern, text):
                href = html_lib.unescape(href)
                out[kind] = href if href.startswith("http") else base_url.rstrip("/") + "/" + href.lstrip("/")
    return out


def find_page_validity(page: str) -> dict[str, str | None]:
    """`publiziert: 08/2025, gültig bis: 11/2029` on a DEGAM guideline page.

    The page gives months. A guideline is valid through the last day of the
    month named, and counts as published on the first.
    """
    text = re.sub(r"\s+", " ", html_lib.unescape(re.sub(r"<[^>]+>", " ", page)))
    published = re.search(r"publiziert\s*:\s*(\d{2})/(\d{4})", text)
    until = re.search(r"gültig bis\s*:\s*(\d{2})/(\d{4})", text)
    out: dict[str, str | None] = {}
    if published:
        out["adoptedDate"] = f"{published.group(2)}-{published.group(1)}-01"
    if until:
        year, month = int(until.group(2)), int(until.group(1))
        last = calendar.monthrange(year, month)[1]
        out["validUntilDate"] = out["earliestValidUntilDate"] = f"{year:04d}-{month:02d}-{last:02d}"
    return out


def find_text_version(markdown: str) -> str | None:
    """`Version 2.3` on the title pages of a guideline without a version in its file name."""
    m = re.search(r"Version\s+(\d+\.\d+)", markdown[:6000])
    return m.group(1) if m else None


def parse_version(file_name: str) -> str | None:
    """`khk-vers7-0.pdf` -> `7.0`, `hypertonie-vers-1-0-kurz.pdf` -> `1.0`."""
    m = re.search(r"vers-?(\d+)-(\d+)", file_name.lower())
    return f"{m.group(1)}.{m.group(2)}" if m else None


# ── PDF to Markdown ──────────────────────────────────────────────────────────


def pdf_to_markdown(pdf: Path, source_url: str, fetched: str, rights: str = "ÄZQ") -> str:
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
        f"Text aus dem PDF extrahiert, nicht redigiert. Urheberrecht: {rights}; nur zum lokalen Gebrauch.",
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


NVL_FURNITURE = r"NVL .*|.*fassung – Version .*|© NVL-Programm \d{4}\s+Seite \d+"


def extract_references(markdown: str, heading: str = r"Literaturverzeichnis|Literatur",
                       furniture: str = NVL_FURNITURE) -> list[dict]:
    """The numbered reference list at the end of a long version.

    Entries are numbered 1., 2., 3. ... without gaps, so a number only starts an
    entry when it is the next one expected. A "12." inside a citation is text.
    """
    starts = [m.start() for m in re.finditer(rf"(?m)^(?:{heading})\s*$", markdown)]
    if not starts:
        return []
    body = markdown[starts[-1] :]
    # page furniture: headings we added and the running header/footer lines
    body = re.sub(r"(?m)^## Seite \d+\s*$", "", body)
    body = re.sub(rf"(?m)^(?:{furniture})\s*$", "", body)
    body = re.sub(r"(?m)^\d{1,3}\s*$", "", body)  # a page number on a line of its own
    refs: list[dict] = []
    expected, pos, current_start = 1, 0, None
    # "15. Mancia G" and "209.Cosmi B" start an entry; "15.12.2023]" at a line start is a date
    for m in re.finditer(r"(?m)^(\d{1,4})\.(?:\s+|(?=[^\W\d]))", body):
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
    doi = re.search(r"(?:DOI|doi):\s*(10\.\d{4,9}/\S+)|doi\.org/(10\.\d{4,9}/\S+)", flat)
    years = [int(y) for y in re.findall(r"(?<![\d/.:-])((?:19|20)\d{2})(?=\s*;|\s*\(\d|\s*\[cited|\s+[A-Z][a-z]{2}\b|\.\s|\.$)", flat)]
    years = [y for y in years if y <= dt.date.today().year]
    return {
        "number": number,
        "citation": flat,
        "pmid": next((g for g in pmid.groups() if g), None) if pmid else None,
        "doi": next(g for g in doi.groups() if g).rstrip(".") if doi else None,
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


def guideline_id(store: str, topic: str, version: str | None) -> str:
    return f"{store}-{topic}-v{version or 'unknown'}"


# ── run ──────────────────────────────────────────────────────────────────────


def http_get(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=120) as resp:  # noqa: S310 (https URL from our own source list)
        return resp.read()


def build(data: Path, sources: list[dict], offline: bool, today: dt.date) -> dict:
    manifest_path = data / "guidelines-manifest.json"
    previous = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {"guidelines": []}
    known = {g["id"]: g for g in previous["guidelines"]}
    fetched = today.isoformat()
    current_ids: dict[str, str] = {}

    for src in sources:
        topic, store = src["topic"], src.get("store", "nvl")
        pdf_dir, md_dir = data / f"{store}-pdf", data / f"{store}-markdown"
        pdf_dir.mkdir(parents=True, exist_ok=True)
        md_dir.mkdir(parents=True, exist_ok=True)
        page_url = src.get("pageUrl") or f"{BASE}/themen/{src.get('page', topic)}"
        source_page = src.get("pageUrl") or f"{BASE}/themen/{topic}"
        page_facts: dict[str, str | None] = {}
        if offline:
            links = {
                ("short" if "kurz" in p.name else "long"): f"{source_page}#{p.name}"
                for p in sorted(pdf_dir.glob("*.pdf")) if p.name.startswith(tuple(src["filePrefixes"]))
            }
        else:
            page = http_get(page_url).decode("utf-8", errors="replace")
            time.sleep(PAUSE_SECONDS)
            if "linkPatterns" in src:
                links = find_labelled_links(page, src["linkBase"], src["linkPatterns"])
                page_facts = find_page_validity(page)
            else:
                links = find_pdf_links(page, topic)
        if "long" not in links:
            print(f"{topic}: no long version offered", file=sys.stderr)
            continue

        texts: dict[str, str] = {}
        files: dict[str, dict] = {}
        for kind, url in links.items():
            # A page that names its files by label gets a stable local name.
            name = f"{src['filePrefixes'][0]}{'kurzfassung' if kind == 'short' else 'langfassung'}.pdf" \
                if "linkPatterns" in src else url.rsplit("/", 1)[1].split("#")[-1]
            pdf = pdf_dir / name
            if not pdf.exists():
                if offline:
                    continue
                pdf.write_bytes(http_get(url))
                time.sleep(PAUSE_SECONDS)
                print(f"{topic}: downloaded {name}")
            md = md_dir / (pdf.stem + ".md")
            texts[kind] = pdf_to_markdown(pdf, url, fetched, src.get("rights", "ÄZQ"))
            if not md.exists() or md.read_text(encoding="utf-8").split("\n", 3)[-1] != texts[kind].split("\n", 3)[-1]:
                md.write_text(texts[kind], encoding="utf-8")
            files[kind] = {"url": url, "pdf": name, "markdown": md.name,
                           "sha256": hashlib.sha256(pdf.read_bytes()).hexdigest()}
        if "long" not in texts:
            print(f"{topic}: long version not on disk", file=sys.stderr)
            continue

        version = parse_version(files["long"]["pdf"]) or find_text_version(texts["long"])
        gid = guideline_id(store, topic, version)
        current_ids[topic] = gid
        record = known.get(gid, {"id": gid, "topic": topic, "firstSeen": fetched})
        resolved = {r["number"]: r for r in record.get("references", []) if r.get("pmidSource")}
        record.update({"title": src["title"], "version": version, "publisher": src.get("publisher", "ÄZQ (BÄK, KBV, AWMF)"),
                       "guidelineClass": src.get("guidelineClass", "NVL"),
                       "awmfId": src.get("awmfId"), "sourcePage": source_page,
                       "offered": True, "supersededBy": None, "lastSeen": fetched, "files": files})
        facts = {k: v for k, v in find_validity(texts["long"]).items() if v}
        facts.update({k: v for k, v in page_facts.items() if v})  # the page is newer than the PDF
        for key in ("adoptedDate", "validUntilDate", "earliestValidUntilDate", "doi"):
            record[key] = facts.get(key, record.get(key))
        refs = extract_references(texts["long"], src.get("referenceHeading", r"Literaturverzeichnis|Literatur"),
                                  src.get("furniture", NVL_FURNITURE))
        for r in refs:  # keep what resolve_pmids.py found for the same entry
            old = resolved.get(r["number"])
            if not r["pmid"] and old and old["citation"] == r["citation"]:
                r["pmid"], r["pmidSource"] = old["pmid"], old["pmidSource"]
            elif r["pmid"]:
                r["pmidSource"] = "reference list"
        record["references"] = refs
        known[gid] = record

    # an older version of a topic that now has a newer one, or a topic no longer offered
    for g in known.values():
        newest = current_ids.get(g["topic"])
        if newest and newest != g["id"]:
            g["supersededBy"], g["offered"] = newest, False
        elif not newest and not offline and any(s["topic"] == g["topic"] for s in sources):
            g["offered"] = False
        g["active"], g["status"] = status_of(g, today)

    manifest = {"sources": sorted({g["sourcePage"].split("/")[2] for g in known.values()}), "generated": fetched,
                "guidelines": sorted(known.values(), key=lambda g: g["id"])}
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return manifest


def state_of(manifest: dict) -> dict:
    """What may be committed: no guideline text, no citations."""
    rows = []
    for g in manifest["guidelines"]:
        refs = g.get("references", [])
        rows.append({
            "id": g["id"], "title": g["title"], "version": g["version"], "awmfId": g.get("awmfId"),
            "guidelineClass": g.get("guidelineClass"),
            "adoptedDate": g.get("adoptedDate"), "validUntilDate": g.get("validUntilDate"),
            "earliestValidUntilDate": g.get("earliestValidUntilDate"),
            "active": g["active"], "status": g["status"], "supersededBy": g.get("supersededBy"),
            "sourcePage": g["sourcePage"], "references": len(refs),
            # Ids printed in the guideline: what a run without resolve_pmids.py also finds.
            "referencesWithPmid": sum(1 for r in refs if r["pmid"] and r.get("pmidSource", "reference list") == "reference list"),
        })
    return {"sources": manifest["sources"], "guidelines": rows}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--data-dir", type=Path, default=HERE / "data")
    ap.add_argument("--sources", type=Path, default=HERE / "guideline-sources.json")
    ap.add_argument("--state", type=Path, default=HERE / "guidelines-state.json")
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
              f"{g['references']} references, {g['referencesWithPmid']} with a printed PubMed id")
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
