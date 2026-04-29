"""
Fetch the full AWMF guideline index from leitlinien-api.awmf.org and write it
to data/awmf-index.json. Print summary stats: total count, breakdown by
guideline class (S1 / S2k / S2e / S3), top associations, and the full schema
of one S3 record so we can find the PDF URL field.
"""
import json
import sys
import urllib.request
from collections import Counter
from pathlib import Path

API_URL = "https://leitlinien-api.awmf.org/v1/list/guidelines?grouping=association&lang=de"
OUTPUT = Path("data/awmf-index.json")

# Public API key embedded in the AWMF register SPA's JS bundle — sent to
# leitlinien-api.awmf.org from every browser that loads the register. Looks
# like an Elasticsearch API key (id:secret base64-encoded). If this stops
# working, re-extract it by running discover_auth.py.
AWMF_PUBLIC_API_KEY = "MkI5Y1VIOEJ0ZGpoelNBVXRNM1E6WVFld0pBUF9RLVdJa012UHVPTmRQUQ=="


def main():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)

    print(f"Fetching {API_URL} ...", file=sys.stderr)
    req = urllib.request.Request(
        API_URL,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/130.0.0.0 Safari/537.36"
            ),
            "Accept": "application/json, text/plain, */*",
            "Origin": "https://register.awmf.org",
            "Referer": "https://register.awmf.org/",
            "api-key": AWMF_PUBLIC_API_KEY,
        },
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = json.loads(resp.read().decode("utf-8"))

    OUTPUT.write_text(json.dumps(data, indent=2, ensure_ascii=False))
    print(f"Wrote {OUTPUT} ({OUTPUT.stat().st_size:,} bytes)\n")

    records = data.get("records", [])
    meta = data.get("meta", {})
    print(f"Meta hits: {meta.get('hits')}")
    print(f"Records:   {len(records)}\n")

    by_class = Counter(r.get("AWMFGuidelineClass") for r in records)
    print("Breakdown by guideline class:")
    for cls, n in sorted(by_class.items(), key=lambda x: -x[1]):
        print(f"  {cls or '(none)':<8}  {n:>4}")

    print("\nTop 10 associations by guideline count:")
    by_assoc = Counter()
    for r in records:
        for inst in r.get("institutions", {}).get("leading", []):
            by_assoc[inst.get("name", "(unknown)")] += 1
    for name, n in by_assoc.most_common(10):
        print(f"  {n:>3}  {name[:80]}")

    print("\n=== Full schema (keys) of one S3 record ===")
    s3 = next((r for r in records if r.get("AWMFGuidelineClass") == "S3"), None)
    if s3:
        print(f"AWMFGuidelineID: {s3.get('AWMFGuidelineID')}")
        print("Top-level keys:")
        for k, v in s3.items():
            if isinstance(v, (str, int, bool)) or v is None:
                preview = str(v)[:100]
                print(f"  {k:<28} {type(v).__name__:<6}  {preview}")
            else:
                print(f"  {k:<28} {type(v).__name__:<6}  (nested — keys: {list(v)[:5] if isinstance(v, dict) else f'len={len(v)}'})")

        print("\n=== Full first S3 record dump ===")
        print(json.dumps(s3, indent=2, ensure_ascii=False)[:3000])


if __name__ == "__main__":
    main()
