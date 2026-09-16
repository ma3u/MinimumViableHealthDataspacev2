#!/usr/bin/env python3
"""Builds docs/demos/spain-ehds-5-slides.pptx, the whole pitch in five slides.

The 24-slide deck is the full story and stays as it is. This is the version for
a short slot, and it is about **secondary use**: turning 17 regional datasets
into one research resource, under one permit, without raw data ever leaving a
secure environment.

Illustrations are deliberately large. The header is compressed to about 1.4in so
every image gets the full remaining height, and the operating-model diagram is
the wide 2.3:1 rendering rather than the 1.3:1 one, because that is the
difference between a diagram a room can read and one it cannot.

House style is the same as the long deck, read back out of it rather than
invented: navy rule, 30pt bold navy title, 16pt grey standfirst, cream cards
with a coloured header, the same five accents. The title slide reuses the long
deck's own hero image, extracted at build time so there is no second copy of a
945 KB PNG in the repository.

Every slide carries its sources bottom right.

    python3 docs/demos/build-5-slide-deck.py

Rebuilds from scratch each time, so it is safe to re-run after editing.
"""

import io
import sys
from pathlib import Path

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN
from pptx.util import Inches, Pt

HERE = Path(__file__).resolve().parent
DIAGRAMS = HERE.parent / "diagrams"
LONG_DECK = HERE / "spain-ehds-ministry-deck.pptx"
OUT = HERE / "spain-ehds-5-slides.pptx"
MODEL = DIAGRAMS / "ehds-operating-model-wide.png"
JOURNEY = DIAGRAMS / "ehds-secondary-journey-bilingual.png"

NAVY = RGBColor(0x14, 0x3D, 0x59)
TEAL = RGBColor(0x2A, 0x9D, 0x8F)
AMBER = RGBColor(0xE6, 0xA8, 0x17)
RED = RGBColor(0xC3, 0x1E, 0x2E)
GREEN = RGBColor(0x52, 0x8B, 0x55)
CREAM = RGBColor(0xF4, 0xEF, 0xE6)
BODY = RGBColor(0x4F, 0x55, 0x60)
FAINT = RGBColor(0x8A, 0x8F, 0x98)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)

FOOTER = "European Health Data Space  ·  A federated approach for Spain"


def shape(slide, kind, x, y, w, h, fill):
    s = slide.shapes.add_shape(kind, Inches(x), Inches(y), Inches(w), Inches(h))
    s.fill.solid()
    s.fill.fore_color.rgb = fill
    s.line.fill.background()
    s.shadow.inherit = False
    if kind == MSO_SHAPE.ROUNDED_RECTANGLE:
        s.adjustments[0] = 0.05
    return s


def textbox(slide, x, y, w, h, lines, size, colour=BODY, bold=False, spacing=1.0,
            align=None):
    """Lines are strings, or (lead, rest) pairs where the lead is bold navy."""
    tb = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    for i, line in enumerate(lines):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.line_spacing = spacing
        if align is not None:
            p.alignment = align
        parts = line if isinstance(line, tuple) else (line,)
        for j, part in enumerate(parts):
            run = p.add_run()
            run.text = part
            run.font.name = "Calibri"
            run.font.size = Pt(size)
            run.font.bold = bold or (len(parts) > 1 and j == 0)
            run.font.color.rgb = NAVY if (len(parts) > 1 and j == 0) else colour
    return tb


def sources(slide, text):
    textbox(slide, 6.4, 7.05, 6.3, 0.3, [text], 9, FAINT, align=PP_ALIGN.RIGHT)


def card(slide, x, y, w, h, header, accent, lines, size=13, head_size=17):
    shape(slide, MSO_SHAPE.ROUNDED_RECTANGLE, x, y, w, h, CREAM)
    shape(slide, MSO_SHAPE.RECTANGLE, x, y, w, 0.42, accent)
    textbox(slide, x + 0.22, y + 0.08, w - 0.44, 0.34, [header], head_size, WHITE, bold=True)
    textbox(slide, x + 0.22, y + 0.62, w - 0.44, h - 0.8, lines, size, BODY, spacing=1.08)


def band(slide, y, h, text, accent=NAVY, size=14):
    shape(slide, MSO_SHAPE.ROUNDED_RECTANGLE, 0.6, y, 12.13, h, CREAM)
    shape(slide, MSO_SHAPE.RECTANGLE, 0.6, y, 0.18, h, accent)
    textbox(slide, 1.05, y + 0.18, 11.4, h - 0.28, [text], size, BODY, spacing=1.1)


def frame(prs, title, standfirst):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    shape(slide, MSO_SHAPE.RECTANGLE, 0, 0, 13.33, 0.18, NAVY)
    textbox(slide, 0.6, 0.35, 12.0, 0.7, [title], 30, NAVY, bold=True)
    textbox(slide, 0.6, 1.05, 12.0, 0.45, [standfirst], 16, BODY)
    textbox(slide, 0.6, 7.05, 5.6, 0.3, [FOOTER], 10, BODY)
    return slide


def deck_image(slide_index: int, pic_index: int = 0) -> io.BytesIO:
    """An image out of the long deck, so there is no second copy in the repo."""
    prs = Presentation(str(LONG_DECK))
    pictures = [sh for sh in prs.slides[slide_index].shapes if sh.shape_type == 13]
    return io.BytesIO(pictures[pic_index].image.blob)


def tight_frame(prs, title, standfirst):
    """Like frame(), but the header takes 1.4in instead of 1.8, for big art."""
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    shape(slide, MSO_SHAPE.RECTANGLE, 0, 0, 13.33, 0.18, NAVY)
    textbox(slide, 0.6, 0.32, 12.0, 0.55, [title], 27, NAVY, bold=True)
    textbox(slide, 0.6, 0.94, 12.0, 0.4, [standfirst], 14, BODY)
    textbox(slide, 0.6, 7.05, 5.6, 0.3, [FOOTER], 10, BODY)
    return slide


# --------------------------------------------------------------------- slides
def slide_1(prs):
    """Title and the problem, because five slides cannot spare one for a title."""
    s = prs.slides.add_slide(prs.slide_layouts[6])
    s.shapes.add_picture(deck_image(0), Inches(0.06), Inches(-0.02), Inches(13.27), Inches(4.22))
    shape(s, MSO_SHAPE.RECTANGLE, 0.42, 0.95, 10.49, 2.85, NAVY)
    shape(s, MSO_SHAPE.RECTANGLE, 0, 4.2, 13.33, 0.25, AMBER)
    shape(s, MSO_SHAPE.RECTANGLE, 0, 4.45, 13.33, 0.08, RED)
    textbox(s, 0.8, 1.25, 11.7, 1.0, ["A Connected Health System for Spain"], 42, WHITE, bold=True)
    textbox(s, 0.8, 2.45, 11.7, 0.5, ["Seventeen regional datasets, one research resource"], 22, WHITE)
    textbox(s, 0.8, 3.05, 11.7, 0.5, ["secondary use of health data under the EHDS"], 20, AMBER, bold=True)

    problems = [
        (TEAL, "Researchers", "Studying a rare disease across Spain means asking 17 separate "
                              "regions for permission and for data.", "Art. 67: one application"),
        (AMBER, "Data holders", "Hospitals and registries hold the data with no way to publish "
                                "what they hold, or to deliver it on a deadline.",
         "Art. 60: three months to deliver"),
        (RED, "The regulator", "Every approval is bespoke, and nobody outside can see which "
                               "permits were issued, or why.", "Art. 68: one permit, published"),
    ]
    for i, (accent, title, text, kind) in enumerate(problems):
        x = 0.6 + i * 4.12
        shape(s, MSO_SHAPE.ROUNDED_RECTANGLE, x, 4.8, 3.9, 1.7, CREAM)
        shape(s, MSO_SHAPE.RECTANGLE, x, 4.8, 3.9, 0.16, accent)
        textbox(s, x + 0.25, 5.05, 3.4, 0.35, [title], 17, NAVY, bold=True)
        textbox(s, x + 0.25, 5.45, 3.4, 0.7, [text], 11.5, BODY, spacing=1.08)
        textbox(s, x + 0.25, 6.15, 3.4, 0.25, [kind], 11, accent, bold=True)

    textbox(s, 0.6, 6.65, 8.0, 0.3,
            ["Spain's strength is regional autonomy. The cost is fragmentation."], 13, NAVY, bold=True)
    textbox(s, 0.6, 7.05, 5.6, 0.3, [FOOTER], 10, BODY)
    sources(s, "Secondary use, Chapter IV of Regulation (EU) 2025/327  ·  data.europa.eu/eli/reg/2025/327/oj")


def slide_2(prs):
    s = tight_frame(prs, "One question, asked once",
                    "What the Regulation requires for secondary use, and what it puts in place to make it work.")
    s.shapes.add_picture(deck_image(4), Inches(0.6), Inches(1.45), Inches(7.2), Inches(5.4))
    card(s, 8.05, 1.45, 4.68, 3.5, "What EHDS puts in place", NAVY, [
        "•  One application, however many regions   Art. 67",
        "•  A permit decision in three months   Art. 68(4)",
        "•  Holders deliver within three months   Art. 60(2)",
        "•  Analysis inside a secure environment   Art. 73",
        "•  Only results leave, never the rows   Art. 73(2)",
        "•  Every permit published, with reasons   Art. 57(1)(j)",
    ], size=12.5, head_size=15)
    card(s, 8.05, 5.1, 4.68, 1.75, "And the price is fixed by law", TEAL, [
        "Fees recover cost only, transparent and non-discriminatory, with reduced rates "
        "for public bodies and university researchers. Art. 62.",
    ], size=12, head_size=15)
    sources(s, "Reg. (EU) 2025/327, Art. 57, 60, 62, 67, 68, 73")


def slide_3(prs):
    s = tight_frame(prs, "What the demonstration shows",
                    "The whole journey, from registration to an audited result. Synthetic data, real protocols.")
    s.shapes.add_picture(str(JOURNEY), Inches(1.8), Inches(1.45), Inches(9.73), Inches(5.4))
    sources(s, "Live: ehds.mabu.red  ·  Mirror: ma3u.github.io/MinimumViableHealthDataspacev2  ·  issue #27")


def slide_4(prs):
    s = tight_frame(prs, "What Catena-X teaches an EHDS operating company",
                    "Six lessons from running the automotive dataspace, and where each one lands in the Regulation.")
    s.shapes.add_picture(str(MODEL), Inches(0.665), Inches(1.48), Inches(12.0), Inches(5.37))
    sources(s, "catenax-ev.github.io/docs/operating-model  ·  data.europa.eu/eli/reg/2025/327/oj  ·  cofinity-x.com")


def slide_5(prs):
    s = frame(prs, "The conversation we want to start",
              "Working together with the Ministry and the regions.")
    card(s, 0.6, 1.85, 6.0, 4.0, "Questions for the Ministry", NAVY, [
        "•  One access body, or several with a coordinator?   Art. 55(1)",
        "•  Is the national contact point that same body, or separate?   Art. 75(1)",
        "•  Does the March 2027 designation have an owner and a budget line?",
        "•  Who holds the inventory of the Art. 51 data categories?",
        "•  In-house entity, joint venture, or tendered concession, and by when?",
    ], size=12.5)
    card(s, 6.85, 1.85, 6.0, 4.0, "What we bring to the table", TEAL, [
        "•  A working live demonstration with realistic data.",
        "•  Experience federating data across European regions.",
        "•  Templates for the legal, organisational and operational setup.",
        "•  A roadmap aligned with the European timetable.",
        "•  A team that has done this before, ready to support each region.",
    ], size=13)
    band(s, 6.05, 0.85,
         "The access body and the national contact point must be designated by March 2027, and "
         "Chapter IV applies in full from March 2029. Counting procurement, that is about two "
         "release years away.", accent=AMBER)
    sources(s, "Reg. (EU) 2025/327, Art. 55(6), 75(1), 105  ·  Paper: docs/ehds-operating-company.md")


def main() -> int:
    for path in (LONG_DECK, JOURNEY, MODEL):
        if not path.exists():
            print(f"missing {path}")
            return 1
    prs = Presentation()
    prs.slide_width, prs.slide_height = Inches(13.333), Inches(7.5)
    prs.core_properties.title = "A Connected Health System for Spain"
    prs.core_properties.subject = "European Health Data Space, five slides"
    prs.core_properties.author = "Matthias Buchhorn"
    for fn in (slide_1, slide_2, slide_3, slide_4, slide_5):
        fn(prs)
    prs.save(str(OUT))
    print(f"{OUT.name}: {len(Presentation(str(OUT)).slides)} slides, "
          f"{OUT.stat().st_size // 1024} KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
