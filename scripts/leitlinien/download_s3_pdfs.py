"""
Download all S3 longVersion (Langfassung) PDFs from the AWMF register.

Resumable: skips PDFs already on disk. Polite: 1 second sleep between requests.
Outputs:
  data/leitlinien-pdf/{awmf_id}.pdf
  data/download-manifest.json   (success / fail / skipped per guideline)

Usage:
  uv run python download_s3_pdfs.py [--limit N]   # default: all S3
  uv run python download_s3_pdfs.py --limit 10    # smoke-test mode
"""
import argparse
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from pathlib import Path

INDEX_FILE = Path("data/awmf-index.json")
PDF_DIR = Path("data/leitlinien-pdf")
MANIFEST_FILE = Path("data/download-manifest.json")

PDF_BASE = "https://register.awmf.org/assets/guidelines"
SLEEP_BETWEEN_REQUESTS_SEC = 1.0
TIMEOUT_SEC = 120

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/130.0.0.0 Safari/537.36"
)


def derive_folder_map(records):
    """For each AWMFAssociationNumber, find the folder name that appears
    in any record's link href. Returns {association_number: folder_name}."""
    folder_by_assoc = {}
    for r in records:
        assoc = r.get("AWMFAssociationNumber")
        if not assoc or assoc in folder_by_assoc:
            continue
        for link in r.get("links", []):
            href = link.get("href", "") if isinstance(link, dict) else ""
            if href and "/" in href and not href.startswith("file:"):
                folder = href.split("/", 1)[0]
                if folder.startswith(assoc):
                    folder_by_assoc[assoc] = folder
                    break
    return folder_by_assoc


def build_pdf_url(folder: str, media: str) -> str:
    # URL-encode each path segment to handle umlauts etc.
    folder_q = urllib.parse.quote(folder, safe="")
    media_q = urllib.parse.quote(media, safe="")
    return f"{PDF_BASE}/{folder_q}/{media_q}"


def download(url: str, dest: Path) -> tuple[bool, str]:
    req = urllib.request.Request(url, headers={
        "User-Agent": USER_AGENT,
        "Accept": "application/pdf,*/*",
        "Referer": "https://register.awmf.org/",
    })
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_SEC) as resp:
            ct = resp.headers.get("content-type", "")
            if "pdf" not in ct.lower():
                return False, f"non-pdf content-type: {ct}"
            data = resp.read()
            dest.write_bytes(data)
            return True, f"{len(data):,} bytes"
    except urllib.error.HTTPError as e:
        return False, f"HTTP {e.code}"
    except Exception as e:
        return False, f"{type(e).__name__}: {e}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None,
                    help="Only download the N most recently released S3 PDFs")
    args = ap.parse_args()

    PDF_DIR.mkdir(parents=True, exist_ok=True)

    data = json.loads(INDEX_FILE.read_text())
    records = data["records"]
    s3 = [r for r in records if r.get("AWMFGuidelineClass") == "S3"]
    s3.sort(key=lambda r: r.get("releaseDate", ""), reverse=True)

    folder_map = derive_folder_map(records)
    print(f"Folder map covers {len(folder_map)} associations\n", file=sys.stderr)

    targets = []
    for r in s3:
        assoc = r.get("AWMFAssociationNumber")
        folder = folder_map.get(assoc)
        long_versions = [
            l for l in r.get("links", [])
            if isinstance(l, dict) and l.get("type") == "longVersion" and l.get("active") == 1
        ]
        if not long_versions or not folder or not long_versions[0].get("media"):
            continue
        media = long_versions[0]["media"]
        targets.append({
            "awmf_id": r["AWMFGuidelineID"],
            "name": r["name"],
            "release_date": r.get("releaseDate"),
            "valid_until": r.get("validUntilDate"),
            "association": assoc,
            "folder": folder,
            "media": media,
            "url": build_pdf_url(folder, media),
        })

    if args.limit:
        targets = targets[:args.limit]

    print(f"S3 guidelines with active longVersion + derivable folder: {len(targets)}", file=sys.stderr)
    print(f"Downloading to: {PDF_DIR}", file=sys.stderr)
    print(f"Sleeping {SLEEP_BETWEEN_REQUESTS_SEC}s between requests (be polite)\n", file=sys.stderr)

    manifest = {"success": [], "failed": [], "skipped": []}
    for i, t in enumerate(targets, 1):
        dest = PDF_DIR / f"{t['awmf_id'].replace('/', '_')}.pdf"
        prefix = f"[{i:>3}/{len(targets)}] {t['awmf_id']:<10}"

        if dest.exists() and dest.stat().st_size > 0:
            print(f"{prefix} SKIP (exists, {dest.stat().st_size:,} bytes)")
            manifest["skipped"].append(t["awmf_id"])
            continue

        ok, msg = download(t["url"], dest)
        if ok:
            print(f"{prefix} OK   {msg}  {t['name'][:60]}")
            manifest["success"].append({"awmf_id": t["awmf_id"], "url": t["url"], "size": dest.stat().st_size})
        else:
            print(f"{prefix} FAIL {msg}  ->  {t['url']}")
            manifest["failed"].append({"awmf_id": t["awmf_id"], "url": t["url"], "error": msg})

        time.sleep(SLEEP_BETWEEN_REQUESTS_SEC)

    MANIFEST_FILE.write_text(json.dumps(manifest, indent=2, ensure_ascii=False))
    print(f"\n=== Summary ===", file=sys.stderr)
    print(f"  success: {len(manifest['success'])}", file=sys.stderr)
    print(f"  failed:  {len(manifest['failed'])}", file=sys.stderr)
    print(f"  skipped: {len(manifest['skipped'])}", file=sys.stderr)
    print(f"  manifest: {MANIFEST_FILE}", file=sys.stderr)


if __name__ == "__main__":
    main()
