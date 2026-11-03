#!/usr/bin/env python3
"""Builds docs/demos/euskadi-ejie-2026.pptx and .pdf, the offline copies of the EJIE deck,
in English, and euskadi-ejie-2026-es.pptx and -es.pdf in Spanish.

The deck itself is the narrated web presentation in
ui/public/presentations/euskadi-ejie-2026/ (Spanish narration, Basque
subtitles). Since the revision of 3 November 2026 the PowerPoint is rendered
from it rather than rebuilt by hand, so the two can no longer drift apart:

- export-ejie-deck.mjs renders every slide with all its builds shown, and
  prints the deck to a vector PDF, one page per slide;
- this script puts one image per slide into a 16:9 PowerPoint and copies each
  slide's speaker notes from the web deck's <aside class="notes">.

The slides in the PowerPoint are pictures, not editable text: change the web
deck and run this again.

    cd ui && npm ci                      # Playwright and its Chromium
    pip install python-pptx
    python3 docs/demos/build-ejie-deck.py
"""

import html
import re
import subprocess
import sys
import tempfile
from pathlib import Path

from pptx import Presentation
from pptx.util import Inches

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
DECK = ROOT / "ui/public/presentations/euskadi-ejie-2026/index.html"
# The English copies keep the original names; the Spanish ones carry -es.
FILES = {"en": "euskadi-ejie-2026", "es": "euskadi-ejie-2026-es"}


def notes() -> list[str]:
    """Each slide's speaker notes, in slide order, as plain text (they stay in English)."""
    out = []
    for section in re.findall(r"<section\b.*?</section>", DECK.read_text(), re.S):
        m = re.search(r'<aside class="notes">(.*?)</aside>', section, re.S)
        text = re.sub(r"<[^>]+>", "", m.group(1)) if m else ""
        out.append(html.unescape(" ".join(text.split())))
    return out


def build(lang: str) -> None:
    out, pdf = HERE / f"{FILES[lang]}.pptx", HERE / f"{FILES[lang]}.pdf"
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(["node", str(HERE / "export-ejie-deck.mjs"), tmp, lang], check=True)
        images = sorted(Path(tmp).glob("slide-*.jpg"))
        texts = notes()
        if len(images) != len(texts):
            sys.exit(f"{len(images)} slide images but {len(texts)} slides in {DECK.name}")

        prs = Presentation()
        prs.slide_width, prs.slide_height = Inches(13.333), Inches(7.5)
        blank = prs.slide_layouts[6]
        for image, text in zip(images, texts):
            s = prs.slides.add_slide(blank)
            s.shapes.add_picture(str(image), 0, 0, prs.slide_width, prs.slide_height)
            s.notes_slide.notes_text_frame.text = text
        prs.save(out)
        pdf.write_bytes((Path(tmp) / "deck.pdf").read_bytes())
    print(f"{len(images)} slides: {out.relative_to(ROOT)} and {pdf.relative_to(ROOT)}")


def main() -> int:
    for lang in FILES:
        build(lang)
    return 0


if __name__ == "__main__":
    sys.exit(main())
