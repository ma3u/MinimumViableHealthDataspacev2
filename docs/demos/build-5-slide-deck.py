#!/usr/bin/env python3
"""Builds docs/demos/spain-ehds-5-slides.pptx, the whole pitch in five slides.

The 24-slide deck is the full story and stays as it is. This is the version for
a short slot: one slide on the problem, one on what exists, one on the proposed
operating model, one on what running it takes, one on the ask.

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
JOURNEY = DIAGRAMS / "ehds-secondary-journey-bilingual.png"
MODEL = DIAGRAMS / "ehds-operating-model.png"

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


def hero_image() -> io.BytesIO:
    """The long deck's title image, so the two decks open the same way."""
    prs = Presentation(str(LONG_DECK))
    picture = next(sh for sh in prs.slides[0].shapes if sh.shape_type == 13)
    return io.BytesIO(picture.image.blob)


# --------------------------------------------------------------------- slides
def slide_1(prs):
    """Title and the problem, because five slides cannot spare one for a title."""
    s = prs.slides.add_slide(prs.slide_layouts[6])
    s.shapes.add_picture(hero_image(), Inches(0.06), Inches(-0.02), Inches(13.27), Inches(4.22))
    shape(s, MSO_SHAPE.RECTANGLE, 0.42, 0.95, 10.49, 2.85, NAVY)
    shape(s, MSO_SHAPE.RECTANGLE, 0, 4.2, 13.33, 0.25, AMBER)
    shape(s, MSO_SHAPE.RECTANGLE, 0, 4.45, 13.33, 0.08, RED)
    textbox(s, 0.8, 1.25, 11.7, 1.0, ["A Connected Health System for Spain"], 42, WHITE, bold=True)
    textbox(s, 0.8, 2.45, 11.7, 0.5, ["Building a federated European Health Data Space"], 22, WHITE)
    textbox(s, 0.8, 3.05, 11.7, 0.5, ["across the 17 regions of Spain"], 20, AMBER, bold=True)

    problems = [
        (RED, "Patients", "A citizen who lives in Madrid and falls ill in Seville cannot share "
                          "their medical history easily.", "Primary use of data"),
        (AMBER, "Doctors", "Hospitals in different regions cannot see what care a patient already "
                           "received elsewhere, so tests repeat.", "Primary use of data"),
        (TEAL, "Researchers", "Studying a rare disease across Spain means asking 17 separate "
                              "regions for permission and data.", "Secondary use of data"),
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
    sources(s, "Introduction for the Spanish Ministry of Health  ·  Regulation (EU) 2025/327")


def slide_2(prs):
    s = frame(prs, "What we have already built",
              "A working EHDS demonstrator. Synthetic data, real protocols, real sign-in.")
    s.shapes.add_picture(str(JOURNEY), Inches(0.6), Inches(1.85), Inches(7.4), Inches(4.11))
    right = [
        (NAVY, "The journey, end to end",
         "Onboarding, catalogue, discovery, negotiation, FHIR transfer, secure processing, audit. "
         "Eight steps, each one a real page a regulator can click."),
        (TEAL, "Real protocols, not mock-ups",
         "Dataspace Protocol, HL7 FHIR R4, OMOP CDM, HealthDCAT-AP, OIDC, ODRL policies on every "
         "access."),
        (AMBER, "Two ways to see it",
         "Live at ehds.mabu.red with real sign-in and seven personas, or a static mirror that "
         "cannot fail on the day."),
    ]
    for i, (accent, header, line) in enumerate(right):
        card(s, 8.3, 1.85 + i * 1.42, 4.43, 1.28, header, accent, [line], size=11, head_size=13)
    band(s, 6.15, 0.75,
         "Live: ehds.mabu.red      Mirror: ma3u.github.io/MinimumViableHealthDataspacev2      "
         "Two access bodies in the data, so the cross-border permit is a real one.", size=12)
    sources(s, "github.com/ma3u/MinimumViableHealthDataspacev2  ·  issue #27")


def slide_3(prs):
    s = frame(prs, "A proposed operating model for the EHDS",
              "The Catena-X operating model, re-cut for Regulation (EU) 2025/327.")
    s.shapes.add_picture(str(MODEL), Inches(0.55), Inches(1.8), Inches(6.68), Inches(5.1))
    for i, (accent, header, line) in enumerate([
        (NAVY, "Closed by law",
         "The Union layer is the Commission's: the federated EU catalogue, cross-border routing, "
         "compliance checks, a central environment. Art. 96."),
        (TEAL, "Open by design",
         "Below the access body nothing is specified. That is where an operating company sits, as "
         "processor under Art. 28 GDPR."),
        (AMBER, "Never delegated",
         "Issuing a permit, enforcement and fees stay with the access body. Art. 68, 63, 62. Its "
         "own duty to segregate functions, Art. 55(3), is what makes room for an operator."),
    ]):
        card(s, 7.5, 1.8 + i * 1.78, 5.2, 1.6, header, accent, [line], size=12, head_size=15)
    sources(s, "catenax-ev.github.io/docs/operating-model  ·  data.europa.eu/eli/reg/2025/327/oj  ·  cofinity-x.com")


def slide_4(prs):
    s = frame(prs, "What running it takes, and by when",
              "Five functions, and four dates that nobody in this room gets to choose.")
    five = [
        (NAVY, "Planning", ["A release train against the statutory dates.", "",
                            "Two supported versions, a sandbox with synthetic data.", "", "Art. 105"]),
        (TEAL, "Data holders", ["Identify, register, validate, contract, connect, describe, "
                                "label, sustain.", "", "The last two are the ones ministries "
                                "underestimate.", "", "Art. 60, 77, 78"]),
        (GREEN, "Services", ["A published service map, published prices, non-discriminatory "
                             "access.", "", "A competitive market above the operator, not owned "
                             "by it.", "", "Art. 57, 62"]),
        (RED, "Incidents", ["One record and one timeline across every party.", "",
                            "A permit-scope breach is escalated, never quietly fixed.", "",
                            "Art. 63, 73(3)"]),
        (AMBER, "Support", ["L1 in Spanish, L2 per service, L3 with the suppliers.", "",
                            "Plus holder success and a researcher feasibility desk.", "", "Art. 82"]),
    ]
    for i, (accent, header, lines) in enumerate(five):
        card(s, 0.6 + i * 2.456, 1.8, 2.3, 3.55, header, accent, lines, size=11, head_size=14)

    shape(s, MSO_SHAPE.ROUNDED_RECTANGLE, 0.6, 5.6, 12.13, 1.25, CREAM)
    dates = [
        (TEAL, "Mar 2027", "Access bodies and the national", "contact point designated. Art. 55(6), 75(1)"),
        (GREEN, "Mar 2029", "Chapter IV in full: permits,", "environments, HealthData@EU"),
        (AMBER, "Mar 2031", "The wider data categories", "in Art. 51(1)"),
        (NAVY, "Mar 2035", "Third countries join", "HealthData@EU. Art. 75(5)"),
    ]
    for i, (accent, tag, l1, l2) in enumerate(dates):
        x = 0.95 + i * 3.0
        shape(s, MSO_SHAPE.ROUNDED_RECTANGLE, x, 5.82, 1.3, 0.38, accent)
        textbox(s, x, 5.9, 1.3, 0.25, [tag], 12, WHITE, bold=True, align=PP_ALIGN.CENTER)
        textbox(s, x, 6.32, 2.75, 0.5, [l1, l2], 10.5, BODY, spacing=1.05)
    sources(s, "Reg. (EU) 2025/327, Art. 57, 60, 62, 63, 73, 77, 78, 82, 105  ·  Catena-X, 'How: Data Space Operations'")


def slide_5(prs):
    s = frame(prs, "The conversation we want to start",
              "Working together with the Ministry and the regions.")
    card(s, 0.6, 1.85, 6.0, 4.0, "Questions for the Ministry", NAVY, [
        "•  One access body, or several with a coordinator?   Art. 55(1)",
        "•  Is the national contact point that same body, or separate?   Art. 75(1)",
        "•  Does the March 2027 designation have an owner and a budget line?",
        "•  Which regions connect first, and who has the Art. 51 data inventory?",
        "•  In-house entity, public-private joint venture, or tendered concession?",
    ], size=13)
    card(s, 6.85, 1.85, 6.0, 4.0, "What we bring to the table", TEAL, [
        "•  A working live demonstration with realistic data.",
        "•  Experience federating data across European regions.",
        "•  Templates for the legal, organisational and operational setup.",
        "•  A roadmap aligned with the European timetable.",
        "•  A team that has done this before, ready to support each region.",
    ], size=13)
    band(s, 6.05, 0.85,
         "Better care for every citizen. Better research for every region. "
         "The last of those five questions is the one that decides whether anything is running by "
         "March 2029.", accent=AMBER)
    sources(s, "Full deck: spain-ehds-ministry-deck.pptx  ·  Paper: docs/ehds-operating-company.md")


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
