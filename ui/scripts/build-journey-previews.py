#!/usr/bin/env python3
"""Turns the captures of __tests__/e2e/capture-journey-previews.spec.ts into
what the full-screen journeys page serves.

    python3 scripts/build-journey-previews.py <captures-dir>

For every <slug>.png and <slug>.json in the folder it writes
public/images/journeys/<slug>.webp (1200 px wide) and adds the page to
src/content/journey-previews.json: its image, the image's size, and the core
features' boxes as fractions of the image, so the preview can zoom to them at
any size. Needs cwebp (brew install webp). Run from ui/.
"""
import json
import pathlib
import subprocess
import sys

WIDTH = 1200
QUALITY = "66"

src = pathlib.Path(sys.argv[1])
out_dir = pathlib.Path("public/images/journeys")
out_dir.mkdir(parents=True, exist_ok=True)
pages = {}
for meta_path in sorted(src.glob("*.json")):
    meta = json.loads(meta_path.read_text())
    slug = meta_path.stem
    png = src / f"{slug}.png"
    webp = out_dir / f"{slug}.webp"
    subprocess.run(
        ["cwebp", "-quiet", "-resize", str(WIDTH), "0", "-q", QUALITY, str(png), "-o", str(webp)],
        check=True,
    )
    w, h = meta["width"], meta["height"]

    def frac(b):
        x = max(0.0, b["x"] / w)
        y = max(0.0, b["y"] / h)
        return {
            "x": round(x, 4),
            "y": round(y, 4),
            "w": round(min(1.0 - x, b["w"] / w), 4),
            "h": round(min(1.0 - y, b["h"] / h), 4),
        }

    pages[meta["href"]] = {
        "src": f"/images/journeys/{slug}.webp",
        "width": WIDTH,
        "height": round(h * WIDTH / w),
        "focus": [frac(b) for b in meta["focus"]],
    }

manifest = pathlib.Path("src/content/journey-previews.json")
manifest.write_text(json.dumps({"pages": pages}, indent=2) + "\n")
total = sum(p.stat().st_size for p in out_dir.glob("*.webp"))
print(f"{len(pages)} pages, {total // 1024} KB of WebP, {manifest}")
