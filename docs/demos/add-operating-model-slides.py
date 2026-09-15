#!/usr/bin/env python3
"""Adds the closing operating-model section to the Spanish ministry deck.

Five slides, inserted before "The conversation we want to start", answering the
question the demo always provokes at the end: who actually runs this?

Every slide carries its sources bottom-right, because the argument rests on two
documents the audience can check for themselves: the adopted Regulation and the
published Catena-X operating model.

The deck has no master to inherit from (every slide is Blank with hand-placed
shapes), so the house style is reproduced here: navy rule across the top, 30pt
bold navy title, 16pt grey standfirst, 10pt grey footer, cream cards with a
coloured header bar. Colours and coordinates were read back out of the existing
slides rather than guessed.

Idempotent: refuses to run twice by looking for the first new title.

    python3 docs/demos/add-operating-model-slides.py
"""

import copy
import sys
from pathlib import Path

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN
from pptx.util import Inches, Pt

DECK = Path(__file__).resolve().parent / "spain-ehds-ministry-deck.pptx"
DIAGRAM = Path(__file__).resolve().parents[1] / "diagrams" / "ehds-operating-model.png"

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
MARKER = "Who operates the Health Data Space?"


def shape(slide, kind, x, y, w, h, fill):
    s = slide.shapes.add_shape(kind, Inches(x), Inches(y), Inches(w), Inches(h))
    s.fill.solid()
    s.fill.fore_color.rgb = fill
    s.line.fill.background()
    s.shadow.inherit = False
    if kind == MSO_SHAPE.ROUNDED_RECTANGLE:
        s.adjustments[0] = 0.05
    return s


def textbox(slide, x, y, w, h, lines, size, colour=BODY, bold=False, spacing=1.0):
    """Lines are strings, or (lead, rest) pairs where the lead is bold navy."""
    tb = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    for i, line in enumerate(lines):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.line_spacing = spacing
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
    """Bottom right, opposite the footer. The audience can check the argument."""
    tb = textbox(slide, 6.5, 7.05, 6.2, 0.3, [text], 9, FAINT)
    tb.text_frame.paragraphs[0].alignment = PP_ALIGN.RIGHT
    return tb


def frame(prs, title, standfirst):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    shape(slide, MSO_SHAPE.RECTANGLE, 0, 0, 13.33, 0.18, NAVY)
    textbox(slide, 0.6, 0.35, 12.0, 0.7, [title], 30, NAVY, bold=True)
    textbox(slide, 0.6, 1.05, 12.0, 0.45, [standfirst], 16, BODY)
    textbox(slide, 0.6, 7.05, 12.0, 0.3, [FOOTER], 10, BODY)
    return slide


def card(slide, x, y, w, h, header, accent, lines, size=13, head_size=17):
    shape(slide, MSO_SHAPE.ROUNDED_RECTANGLE, x, y, w, h, CREAM)
    shape(slide, MSO_SHAPE.RECTANGLE, x, y, w, 0.42, accent)
    textbox(slide, x + 0.22, y + 0.08, w - 0.44, 0.34, [header], head_size, WHITE, bold=True)
    textbox(slide, x + 0.22, y + 0.62, w - 0.44, h - 0.8, lines, size, BODY, spacing=1.08)


def band(slide, y, h, text, accent=NAVY, size=14):
    shape(slide, MSO_SHAPE.ROUNDED_RECTANGLE, 0.6, y, 12.1, h, CREAM)
    shape(slide, MSO_SHAPE.RECTANGLE, 0.6, y, 0.18, h, accent)
    textbox(slide, 1.05, y + 0.2, 11.4, h - 0.3, [text], size, BODY, spacing=1.1)


def phase(slide, y, h, tag, accent, heading, detail):
    shape(slide, MSO_SHAPE.ROUNDED_RECTANGLE, 0.6, y, 12.1, h, CREAM)
    shape(slide, MSO_SHAPE.RECTANGLE, 0.6, y, 0.18, h, accent)
    shape(slide, MSO_SHAPE.ROUNDED_RECTANGLE, 0.95, y + 0.3, 1.55, 0.5, accent)
    textbox(slide, 0.95, y + 0.41, 1.55, 0.3, [tag], 14, WHITE, bold=True).text_frame.paragraphs[
        0
    ].alignment = PP_ALIGN.CENTER
    textbox(slide, 2.8, y + 0.16, 9.8, 0.42, [heading], 20, NAVY, bold=True)
    textbox(slide, 2.8, y + 0.62, 9.8, 0.5, [detail], 13, BODY, spacing=1.05)


def build(prs):
    # 1 -----------------------------------------------------------------
    s = frame(
        prs, MARKER,
        "Catena-X answered this question. Two thirds of the answer is already law in EHDS.",
    )
    cards = [
        (NAVY, "Rules and governance", [
            "Catena-X: the Association writes the standards, the certification framework, the rulebook.",
            "",
            "EHDS: already law. The EHDS Board, the stakeholder forum, the steering groups, and Commission implementing acts.",
            "",
            "Verdict: statutory. Not open to design.",
        ]),
        (AMBER, "Reference implementation", [
            "Catena-X: Eclipse Tractus-X. Open source, vendor neutral, with an integration sandbox.",
            "",
            "EHDS: nothing equivalent exists. Every access body is at risk of commissioning its own.",
            "",
            "Verdict: the biggest gap in Europe today.",
        ]),
        (TEAL, "Operation", [
            "Catena-X: an operating company. Cofinity-X registers participants, issues identities, runs the core services, answers the phone.",
            "",
            "EHDS: undefined below the access body.",
            "",
            "Verdict: this is the opening.",
        ]),
    ]
    for i, (accent, header, lines) in enumerate(cards):
        card(s, 0.6 + i * 4.1, 1.9, 3.9, 4.0, header, accent, lines)
    band(s, 6.1, 0.75,
         "Catena-X did not become a working dataspace when the standards were published. "
         "It became one when somebody was made accountable for running it.")
    sources(s, "catenax-ev.github.io/docs/operating-model  ·  cofinity-x.com  ·  eclipse-tractusx.github.io")

    # 2 -----------------------------------------------------------------
    s = frame(
        prs, "A proposed operating model for the EHDS",
        "The Catena-X operating model, re-cut for Regulation (EU) 2025/327.",
    )
    s.shapes.add_picture(str(DIAGRAM), Inches(0.55), Inches(1.8), Inches(6.68), Inches(5.1))
    for i, (accent, header, line) in enumerate([
        (NAVY, "Closed by law", "The Union layer is the Commission's: the federated EU catalogue, cross-border routing, compliance checks, a central environment. Art. 96."),
        (TEAL, "Open by design", "Below the access body nothing is specified. That is where an operating company sits, as processor under Art. 28 GDPR."),
        (AMBER, "Never delegated", "Issuing a permit, enforcement and fees stay with the access body. Art. 68, Art. 63, Art. 62."),
    ]):
        card(s, 7.5, 1.8 + i * 1.78, 5.2, 1.6, header, accent, [line], size=12, head_size=15)
    sources(s, "Regulation (EU) 2025/327, data.europa.eu/eli/reg/2025/327/oj  ·  catenax-ev.github.io/docs/operating-model")

    # 3 -----------------------------------------------------------------
    s = frame(
        prs, "What the access body keeps, and what an operator runs",
        "The line is drawn by the access body's own conflict-of-interest duty, not by convenience.",
    )
    card(s, 0.6, 1.85, 6.0, 3.9, "Stays with the Health Data Access Body", NAVY, [
        "•  Issuing, refusing and revoking a data permit   Art. 68",
        "•  Enforcement, up to five years' exclusion   Art. 63",
        "•  Setting fees, and settling a disagreement   Art. 62",
        "•  Controllership for the secondary use   Art. 74",
        "•  Supervising holders and users   Art. 57(1)(a)",
        "",
        "These are sovereign acts of a public body. No contract moves them.",
    ], size=14)
    card(s, 6.85, 1.85, 6.0, 3.9, "Can be operated on its behalf", TEAL, [
        "•  Onboarding holders, and the identities they use",
        "•  The national catalogue and the quality label   Art. 77, 78",
        "•  Receiving and preparing data, pseudonymisation   Art. 57(1)(b)",
        "•  Running the secure processing environment   Art. 73",
        "•  Incident coordination and the support desk",
        "",
        "As a processor under Art. 28 GDPR, on documented instructions.",
    ], size=14)
    band(s, 5.95, 0.9,
         "Art. 55(3) obliges the access body to segregate assessing applications, preparing datasets "
         "and running the environment. Read the other way round, that is a list of exactly what can be industrialised.")
    sources(s, "Regulation (EU) 2025/327, Art. 55(3), 57, 62, 63, 68, 73, 74, 77, 78  ·  GDPR Art. 28")

    # 4 -----------------------------------------------------------------
    s = frame(
        prs, "The five things an operating company does",
        "Each one looks different under EHDS than under Catena-X, and the difference is the regulation.",
    )
    five = [
        (NAVY, "Planning and roadmap", [
            "A release train against dates nobody gets to choose.",
            "",
            "Two supported versions, a published deprecation window, a sandbox with synthetic data.",
            "",
            "Art. 105",
        ]),
        (TEAL, "Data holders", [
            "Identify, register, validate, contract, connect, describe, label, sustain.",
            "",
            "The last two have no Catena-X counterpart, and are the ones ministries underestimate.",
            "",
            "Art. 60, 77, 78",
        ]),
        (GREEN, "Services", [
            "A published service map, published prices, non-discriminatory access.",
            "",
            "Onboarding, core, secure processing, and a competitive market above them.",
            "",
            "Art. 57, 62",
        ]),
        (RED, "Incidents", [
            "One record and one timeline across every party involved.",
            "",
            "A permit-scope breach is escalated to the access body, never quietly fixed.",
            "",
            "Art. 63, 73(3)",
        ]),
        (AMBER, "Support", [
            "L1 in Spanish, L2 per service, L3 with the suppliers.",
            "",
            "Plus holder success and a researcher feasibility desk, neither of which is a ticket queue.",
            "",
            "Art. 82",
        ]),
    ]
    for i, (accent, header, lines) in enumerate(five):
        card(s, 0.6 + i * 2.45, 1.9, 2.3, 4.0, header, accent, lines, size=12, head_size=13)
    band(s, 6.05, 0.85,
         "Holders owe the data within three months, with a penalty for every day late. The body owes a "
         "decision in three. Descriptions are re-verified yearly. The clocks are the job.")
    sources(s, "Reg. (EU) 2025/327, Art. 57, 60, 62, 63, 73, 77, 78, 82, 105  ·  Catena-X, 'How: Data Space Operations'")

    # 5 -----------------------------------------------------------------
    s = frame(
        prs, "The dates, and the money",
        "Two constraints that decide the shape of whatever gets built, and neither is ours to set.",
    )
    card(s, 0.6, 1.85, 6.0, 4.1, "The dates are not negotiable", NAVY, [
        ("Mar 2027   ", "Access bodies and the national contact point"),
        ("               ", "designated and notified.   Art. 55(6), Art. 75(1)"),
        "",
        ("Mar 2029   ", "Chapter IV in full: permits, holders' duties,"),
        ("               ", "secure environments, HealthData@EU."),
        "",
        ("Mar 2031   ", "The wider data categories in Art. 51(1)."),
        "",
        ("Mar 2035   ", "Third countries join HealthData@EU.   Art. 75(5)"),
        "",
        "Counting procurement, March 2029 is about two release years away.",
    ], size=13)
    card(s, 6.85, 1.85, 6.0, 4.1, "Cost recovery, not a platform business", TEAL, [
        "•  Fees proportionate to cost, never restricting competition",
        "•  Transparent and non-discriminatory, without exception",
        "•  Reduced rates for public bodies, universities, small firms",
        "•  Part of the fee passes through to the data holder",
        "•  If the parties disagree, the access body sets the price",
        "",
        "So: an in-house entity, a public-private joint venture as Cofinity-X is, or a tendered concession. The commercial upside is the enablement layer above the operator, not the operator.",
    ], size=13)
    band(s, 6.15, 0.75,
         "Keeping the operator out of the application market is exactly what keeps that market open. "
         "Saying so plainly makes the proposition more credible, not less.", accent=TEAL)
    sources(s, "Reg. (EU) 2025/327, Art. 62 and Art. 105  ·  fee-policy implementing acts still pending, Art. 62(6)")


def move_before(prs, count, target_title):
    """Move the last `count` slides to sit before the slide with `target_title`."""
    slides = list(prs.slides)  # same order as the id list
    index = next(
        i
        for i, slide in enumerate(slides[:-count])
        if any(
            sh.has_text_frame and target_title in sh.text_frame.text
            for sh in slide.shapes
        )
    )
    id_list = prs.slides._sldIdLst
    entries = list(id_list)
    new = entries[-count:]
    rest = entries[:-count]
    for entry in entries:
        id_list.remove(entry)
    for entry in rest[:index] + new + rest[index:]:
        id_list.append(entry)


def main() -> int:
    if not DIAGRAM.exists():
        print(f"missing {DIAGRAM}; run docs/diagrams/ehds-operating-model.py first")
        return 1
    prs = Presentation(str(DECK))
    for slide in prs.slides:
        for sh in slide.shapes:
            if sh.has_text_frame and MARKER in sh.text_frame.text:
                print("the operating-model slides are already in the deck; nothing to do")
                return 0
    before = len(prs.slides)
    build(prs)
    move_before(prs, 5, "The conversation we want to start")
    prs.save(str(DECK))
    print(f"{DECK.name}: {before} slides -> {len(Presentation(str(DECK)).slides)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
