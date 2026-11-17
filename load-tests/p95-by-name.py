#!/usr/bin/env python3
"""The p50 and p95 of http_req_duration per k6 `name` tag, from a run's
`--out json` samples (load-tests/run.sh with K6_JSON=1)."""
import json
import sys
from collections import defaultdict


def pct(values, p):
    values = sorted(values)
    # k6's own method: linear interpolation between the closest ranks.
    k = (len(values) - 1) * p
    lo = int(k)
    hi = min(lo + 1, len(values) - 1)
    return values[lo] + (values[hi] - values[lo]) * (k - lo)


def main(path):
    by = defaultdict(list)
    kinds = {}
    with open(path) as f:
        for line in f:
            s = json.loads(line)
            if s.get("type") != "Point" or s.get("metric") != "http_req_duration":
                continue
            tags = s["data"].get("tags") or {}
            name = tags.get("name", "?")
            by[name].append(s["data"]["value"])
            kinds[name] = tags.get("kind", "")
            by[("kind", tags.get("kind", ""))].append(s["data"]["value"])
    rows = sorted(k for k in by if isinstance(k, str))
    print(f"{'endpoint':45} {'kind':6} {'n':>5} {'p50 ms':>8} {'p95 ms':>8}")
    for name in rows:
        v = by[name]
        print(f"{name:45} {kinds[name]:6} {len(v):5} {pct(v, .5):8.0f} {pct(v, .95):8.0f}")
    for key in sorted(k for k in by if not isinstance(k, str)):
        v = by[key]
        print(f"{'all kind:' + key[1]:45} {'':6} {len(v):5} {pct(v, .5):8.0f} {pct(v, .95):8.0f}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("usage: p95-by-name.py <results/testid.ndjson>")
    main(sys.argv[1])
