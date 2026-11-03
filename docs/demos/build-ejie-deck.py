#!/usr/bin/env python3
"""Builds docs/demos/euskadi-ejie-2026.pptx and .pdf, the offline copies of the EJIE deck,
in English, and euskadi-ejie-2026-es.pptx and -es.pdf in Spanish.

The deck itself is the narrated web presentation in
ui/public/presentations/euskadi-ejie-2026/ (English or Spanish, narrated).
The copies are rendered from it rather than rebuilt by hand, so they cannot
drift apart:

- export-ejie-deck.mjs prints the deck to a vector PDF, one page per slide with
  every build shown, and a second one set in Arial (which every PowerPoint has)
  with the cover photo cropped to its box;
- LibreOffice imports that second PDF as an Impress document, so every text and
  shape stays editable, and saves it as PowerPoint;
- this script turns off word wrap in every text box and gives each a little
  room, since the import sizes a box to the exact width of its line, and copies
  each slide's speaker notes from the web deck's <aside class="notes">.

Each line is its own text box, as the PDF has it, so a longer edit is easier in
the web deck: change it there and run this again.

    cd ui && npm ci                      # Playwright and its Chromium
    brew install --cask libreoffice      # soffice
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


def editable(prs: Presentation) -> None:
    """No word wrap and a quarter more width, so no line breaks where the PDF had none."""

    def walk(shapes):
        for sh in shapes:
            if sh.shape_type == 6:  # a group
                walk(sh.shapes)
            elif sh.has_text_frame and sh.text_frame.text.strip():
                sh.text_frame.word_wrap = False
                sh.width = int(sh.width * 1.25) + 20000

    for slide in prs.slides:
        walk(slide.shapes)


def build(lang: str) -> None:
    out, pdf = HERE / f"{FILES[lang]}.pptx", HERE / f"{FILES[lang]}.pdf"
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(["node", str(HERE / "export-ejie-deck.mjs"), tmp, lang], check=True)
        subprocess.run(
            ["soffice", "--headless", "--infilter=impress_pdf_import", "--convert-to", "pptx",
             "--outdir", tmp, str(Path(tmp) / "editable.pdf")],
            check=True, capture_output=True,
        )
        prs = Presentation(str(Path(tmp) / "editable.pptx"))
        texts = notes()
        if len(prs.slides) != len(texts):
            sys.exit(f"{len(prs.slides)} slides imported but {len(texts)} slides in {DECK.name}")
        editable(prs)
        for slide, text in zip(prs.slides, texts):
            slide.notes_slide.notes_text_frame.text = text
        prs.save(out)
        pdf.write_bytes((Path(tmp) / "deck.pdf").read_bytes())
    print(f"{len(texts)} slides: {out.relative_to(ROOT)} and {pdf.relative_to(ROOT)}")


def main() -> int:
    for lang in FILES:
        build(lang)
    return 0


if __name__ == "__main__":
    sys.exit(main())
