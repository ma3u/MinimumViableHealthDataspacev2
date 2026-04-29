"""
Parse downloaded AWMF S3 guideline PDFs with Docling and emit:
  data/leitlinien-docling/{awmf_id}.json    -- structured DoclingDocument
  data/leitlinien-markdown/{awmf_id}.md     -- Markdown rendering (human-readable + chunk-friendly)
  data/parse-manifest.json                  -- per-PDF timing and success/fail

Resumable: skips a PDF if both outputs already exist and are non-empty.

Usage:
  uv run python parse_with_docling.py [--limit N]
  uv run python parse_with_docling.py --limit 3          # smoke test
  uv run python parse_with_docling.py --only 018-038OL   # single-file mode
"""
import argparse
import json
import sys
import time
import traceback
from pathlib import Path

PDF_DIR = Path("data/leitlinien-pdf")
JSON_DIR = Path("data/leitlinien-docling")
MD_DIR = Path("data/leitlinien-markdown")
MANIFEST_FILE = Path("data/parse-manifest.json")


def load_manifest() -> dict:
    if MANIFEST_FILE.exists():
        return json.loads(MANIFEST_FILE.read_text())
    return {"results": {}}


def save_manifest(manifest: dict) -> None:
    MANIFEST_FILE.write_text(json.dumps(manifest, indent=2, ensure_ascii=False))


def parse_one(converter, pdf_path: Path, json_out: Path, md_out: Path) -> dict:
    t0 = time.time()
    result = converter.convert(pdf_path)
    t_convert = time.time() - t0

    doc = result.document

    # JSON structured output
    doc_dict = doc.export_to_dict()
    json_out.write_text(json.dumps(doc_dict, indent=2, ensure_ascii=False))

    # Markdown rendering
    md = doc.export_to_markdown()
    md_out.write_text(md)

    t_total = time.time() - t0
    return {
        "status": "ok",
        "pdf_size": pdf_path.stat().st_size,
        "json_size": json_out.stat().st_size,
        "md_size": md_out.stat().st_size,
        "convert_seconds": round(t_convert, 2),
        "total_seconds": round(t_total, 2),
        # Shallow summary of what docling extracted
        "texts": len(doc_dict.get("texts", [])),
        "tables": len(doc_dict.get("tables", [])),
        "pictures": len(doc_dict.get("pictures", [])),
        "pages": len(doc_dict.get("pages", {})),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None,
                    help="Process at most N PDFs")
    ap.add_argument("--only", type=str, default=None,
                    help="Process only one AWMF ID (e.g. 018-038OL)")
    args = ap.parse_args()

    JSON_DIR.mkdir(parents=True, exist_ok=True)
    MD_DIR.mkdir(parents=True, exist_ok=True)

    pdfs = sorted(PDF_DIR.glob("*.pdf"))
    if args.only:
        pdfs = [p for p in pdfs if p.stem == args.only]
        if not pdfs:
            print(f"No PDF found for --only {args.only}", file=sys.stderr)
            sys.exit(1)
    if args.limit:
        pdfs = pdfs[:args.limit]

    print(f"Parsing {len(pdfs)} PDFs with Docling", file=sys.stderr)
    print("First-run note: Docling downloads ~2GB of models on first use.\n", file=sys.stderr)

    # Defer import so the script can fail fast on argparse without waiting on
    # the heavy docling import
    from docling.document_converter import DocumentConverter
    converter = DocumentConverter()

    manifest = load_manifest()

    for i, pdf in enumerate(pdfs, 1):
        awmf_id = pdf.stem
        json_out = JSON_DIR / f"{awmf_id}.json"
        md_out = MD_DIR / f"{awmf_id}.md"

        prefix = f"[{i:>3}/{len(pdfs)}] {awmf_id:<12}"

        if json_out.exists() and md_out.exists() and json_out.stat().st_size > 0 and md_out.stat().st_size > 0:
            print(f"{prefix} SKIP (already parsed)")
            continue

        try:
            result = parse_one(converter, pdf, json_out, md_out)
            manifest["results"][awmf_id] = result
            save_manifest(manifest)
            print(
                f"{prefix} OK   "
                f"{result['total_seconds']:>6.1f}s  "
                f"pages={result['pages']:<4}  "
                f"texts={result['texts']:<5}  "
                f"tables={result['tables']:<4}  "
                f"md={result['md_size']/1024:>6.0f}KB"
            )
        except Exception as e:
            tb = traceback.format_exc()
            manifest["results"][awmf_id] = {
                "status": "fail",
                "error": str(e),
                "traceback": tb.splitlines()[-3:],
            }
            save_manifest(manifest)
            print(f"{prefix} FAIL {type(e).__name__}: {e}")

    # Summary
    ok = sum(1 for r in manifest["results"].values() if r.get("status") == "ok")
    fail = sum(1 for r in manifest["results"].values() if r.get("status") == "fail")
    print(f"\n=== Summary ===", file=sys.stderr)
    print(f"  OK:     {ok}", file=sys.stderr)
    print(f"  FAIL:   {fail}", file=sys.stderr)
    if ok:
        total_time = sum(r["total_seconds"] for r in manifest["results"].values() if r.get("status") == "ok")
        avg = total_time / ok
        print(f"  avg parse time: {avg:.1f}s / PDF", file=sys.stderr)


if __name__ == "__main__":
    main()
