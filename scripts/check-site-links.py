#!/usr/bin/env python3
"""Check every link of the static site before it is published.

The GitHub Pages site lives under a base path (/MinimumViableHealthDataspacev2).
A link written as /docs/ehds/x works on the hub and is a 404 on Pages; a
relative .md link in a published document was rendered that way until #1277.
The Markdown hook checks the sources, not what Next renders, so this script
checks the rendered export itself.

For every HTML file in the export (ui/out):

- an internal href or src must start with the base path and resolve to a file
  in the export (x.html, x/index.html or the file itself);
- a #fragment must be an id on the target page (same page for a bare #x);
- with --external, every http(s) URL is fetched once (HEAD, then GET).
  Rate limits (429) and pages that refuse robots (401, 403, 405) are warnings,
  not failures, and so are localhost links.

Exit 1 when an internal link or anchor is broken, or an external URL answers
404 or 410 (with --external).

    python3 scripts/check-site-links.py ui/out --base /MinimumViableHealthDataspacev2
    python3 scripts/check-site-links.py ui/out --base /MinimumViableHealthDataspacev2 --external
"""

from __future__ import annotations

import argparse
import html
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ATTR = re.compile(r'<(a|img|link|script|source|iframe)\b[^>]*?\b(href|src)="([^"]*)"', re.I)
ID = re.compile(r'\bid="([^"]+)"')
SKIP_SCHEMES = ("mailto:", "tel:", "javascript:", "data:", "blob:")
# Next's own chunks and data, generated with the export, never authored.
SKIP_PREFIXES = ("/_next/",)
SOFT_EXTERNAL = {401, 403, 405, 429}
HARD_EXTERNAL = {404, 410}


def strip_scripts(text: str) -> str:
    """Links inside a script (the RSC payload) are not anchors a reader
    clicks; Next writes them for the client router."""
    return re.sub(r"<script\b[^>]*>.*?</script>", "", text, flags=re.S | re.I)


def page_of(out: Path, path: str) -> Path | None:
    """The export file a site path is served from, as GitHub Pages does."""
    rel = urllib.parse.unquote(path).lstrip("/")
    candidates = [out / rel] if rel else []
    candidates += [out / (rel.rstrip("/") + ".html"), out / rel / "index.html"]
    for c in candidates:
        if c.is_file():
            return c
    return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("out", type=Path, help="the static export, e.g. ui/out")
    ap.add_argument("--base", default="", help="the site's base path")
    ap.add_argument("--external", action="store_true", help="also fetch external URLs")
    args = ap.parse_args()
    out: Path = args.out.resolve()
    base = args.base.rstrip("/")
    if not out.is_dir():
        print(f"no export at {out}", file=sys.stderr)
        return 2

    pages = sorted(out.rglob("*.html"))
    ids: dict[Path, set[str]] = {}
    texts: dict[Path, str] = {}
    for p in pages:
        t = p.read_text(encoding="utf-8", errors="replace")
        texts[p] = t
        ids[p] = set(ID.findall(t))

    errors: list[str] = []
    external: dict[str, set[str]] = {}
    checked = 0

    for p in pages:
        rel_page = "/" + p.relative_to(out).as_posix()
        for _tag, _attr, raw in ATTR.findall(strip_scripts(texts[p])):
            href = html.unescape(raw).strip()
            if not href or href.startswith(SKIP_SCHEMES):
                continue
            if href.startswith("#/"):
                continue  # a client-side route (reveal.js slides), not an anchor
            if href.startswith("#"):
                frag = urllib.parse.unquote(href[1:])
                checked += 1
                if frag and frag not in ids[p]:
                    errors.append(f"{rel_page}: anchor {href} is not on the page")
                continue
            parsed = urllib.parse.urlparse(href)
            if parsed.scheme in ("http", "https"):
                if parsed.hostname in ("localhost", "127.0.0.1"):
                    continue
                external.setdefault(href.split("#")[0], set()).add(rel_page)
                continue
            if parsed.scheme or href.startswith("//"):
                continue
            path = parsed.path
            if not path.startswith("/"):
                # Relative to the page's own directory, as the browser does.
                # The page is served at base + its place in the export.
                here = base + "/" + p.relative_to(out).parent.as_posix()
                path = urllib.parse.urljoin(here.rstrip("/").rstrip(".") + "/", path)
            checked += 1
            if base and not (path == base or path.startswith(base + "/")):
                if path.startswith(SKIP_PREFIXES):
                    continue
                errors.append(f"{rel_page}: {href} lacks the base path {base}")
                continue
            site_path = path[len(base):] if base else path
            if site_path.startswith(SKIP_PREFIXES):
                continue
            target = page_of(out, site_path)
            if target is None:
                errors.append(f"{rel_page}: {href} is not in the export")
                continue
            if parsed.fragment and not parsed.fragment.startswith("/") and target.suffix == ".html":
                frag = urllib.parse.unquote(parsed.fragment)
                if frag not in ids.get(target, set()):
                    errors.append(f"{rel_page}: {href} has no anchor #{frag}")

    warnings: list[str] = []
    if args.external and external:
        ua = {"User-Agent": "Mozilla/5.0 (site link check)"}

        def fetch(url: str) -> tuple[str, object]:
            for method in ("HEAD", "GET"):
                try:
                    req = urllib.request.Request(url, headers=ua, method=method)
                    with urllib.request.urlopen(req, timeout=20) as r:
                        return url, r.status
                except urllib.error.HTTPError as e:
                    if method == "HEAD":
                        continue
                    return url, e.code
                except Exception as e:  # noqa: BLE001 - a dead host is a finding
                    if method == "HEAD":
                        continue
                    return url, type(e).__name__
            return url, "unknown"

        with ThreadPoolExecutor(int(os.environ.get("LINK_CHECK_THREADS", "8"))) as ex:
            for url, status in ex.map(fetch, sorted(external)):
                where = ", ".join(sorted(external[url])[:3])
                if isinstance(status, int) and status < 400:
                    continue
                line = f"{url} answered {status} (on {where})"
                if isinstance(status, int) and status in HARD_EXTERNAL:
                    errors.append(line)
                elif isinstance(status, int) and status in SOFT_EXTERNAL:
                    warnings.append(line)
                else:
                    warnings.append(line)

    print(f"{len(pages)} pages, {checked} internal links and anchors, {len(external)} external URLs")
    for w in warnings:
        print(f"::warning::{w}")
    for e in errors:
        print(f"::error::{e}")
    if errors:
        print(f"{len(errors)} broken link(s)", file=sys.stderr)
        return 1
    print("no broken links")
    return 0


if __name__ == "__main__":
    sys.exit(main())
