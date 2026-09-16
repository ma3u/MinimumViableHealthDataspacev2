#!/usr/bin/env python3
"""Renders docs/diagrams/ehds-operating-model-wide.svg, the slide version.

Six lessons from the Catena-X operating model, each with what it means for an
operating company doing secondary use under Regulation (EU) 2025/327.

Two earlier attempts at this slide were wrong in opposite directions. The first
was the reference diagram at a wider aspect ratio: five bands, nineteen boxes, a
paragraph in each, unreadable while somebody talks over it. The second cut to
three tiers and forty words, which reads instantly and says almost nothing a
ministry could act on.

What is actually worth the slide is neither the layer stack nor a slogan. It is
the transfer: Catena-X has run a dataspace for years and learned things that
cost money to learn, and each of those lands on a specific article of the
Regulation. Left column is the lesson, right column is where it bites.

The full layered model is still ehds-operating-model.svg, and the argument is
docs/ehds-operating-company.md.

    python3 docs/diagrams/ehds-operating-model-wide.py
"""

from html import escape
from pathlib import Path

W = 2400
MARGIN = 50
HEAD_Y = 74
ROW_H = 150
ROWS_Y = 108

INK = "#16324F"
MUTED = "#5A6B7B"
FAINT = "#9AA7B3"
RULE = "#DCE3EA"

EU = "#2471A3"
STATE = "#148F77"
OPCO = "#CA6F1E"
SERVICE = "#1E8449"
PEOPLE = "#7D3C98"
RED = "#B03A2E"

LEFT_X = 150
SPLIT = 1070
RIGHT_X = 1150
RIGHT_EDGE = W - MARGIN - 30

# (accent, lesson from Catena-X, what it means under the Regulation, articles)
LESSONS = [
    (EU, "Standards alone do not make a dataspace",
     ["Catena-X became real when one company was made accountable for running it,",
      "not when the standards were published. EHDS has rules and dates, and no operator."],
     "Art. 55(2)"),
    (STATE, "Keep governance and operation in different hands",
     ["The association writes the rules, the operating company runs the services.",
      "Here: the access body decides the permit, an operator runs everything else."],
     "Art. 55(3), 74"),
    (OPCO, "Onboarding is the product, not a phase",
     ["A catalogue with no participants is worth nothing. Holders owe data within three",
      "months with a penalty for every day late, so they must be connected in 2027."],
     "Art. 60(2), 63(4)"),
    (SERVICE, "Publish a service map, and certify against it",
     ["Every service has a named owner and a role that can be assessed. Onboarding, core",
      "services per Member State, secure processing, and a market above them."],
     "Art. 57, 73"),
    (PEOPLE, "Run a release train, not a project",
     ["One cadence, two supported versions, a published deprecation window, a sandbox.",
      "The difference here is that the dates are statutory: 2027 designate, 2029 live."],
     "Art. 105"),
    (RED, "The operator must not compete with its own market",
     ["Catena-X separates the operator from the application providers. EHDS goes further:",
      "fees recover cost only and may not restrict competition."],
     "Art. 62"),
]

H = ROWS_Y + ROW_H * len(LESSONS) + 66

out: list[str] = []
add = out.append


def text(x, y, s, size, fill=INK, weight="normal", style="normal", anchor="start"):
    add(
        f'<text x="{x:.0f}" y="{y:.0f}" font-size="{size}" fill="{fill}" font-weight="{weight}" '
        f'font-style="{style}" text-anchor="{anchor}">{escape(s)}</text>'
    )


add(
    f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" '
    'font-family="Inter, Helvetica Neue, Helvetica, Arial, sans-serif">'
)
add(f'<rect width="{W}" height="{H}" fill="#FFFFFF"/>')

text(LEFT_X, HEAD_Y, "WHAT CATENA-X LEARNED", 21, fill=FAINT, weight="700")
text(RIGHT_X, HEAD_Y, "WHAT IT MEANS FOR AN EHDS OPERATING COMPANY", 21, fill=FAINT, weight="700")
add(f'<line x1="{MARGIN}" y1="{HEAD_Y + 20}" x2="{W - MARGIN}" y2="{HEAD_Y + 20}" '
    f'stroke="{RULE}" stroke-width="2"/>')

for i, (accent, lesson, consequence, refs) in enumerate(LESSONS):
    y = ROWS_Y + i * ROW_H
    if i % 2 == 0:
        add(f'<rect x="{MARGIN}" y="{y}" width="{W - 2 * MARGIN}" height="{ROW_H}" fill="#F7F9FB"/>')
    add(f'<circle cx="{MARGIN + 52}" cy="{y + 62}" r="27" fill="{accent}"/>')
    text(MARGIN + 52, y + 71, str(i + 1), 27, fill="#FFFFFF", weight="700", anchor="middle")
    text(LEFT_X, y + 60, lesson, 28, weight="700")
    add(f'<line x1="{SPLIT}" y1="{y + 26}" x2="{SPLIT}" y2="{y + ROW_H - 26}" '
        f'stroke="{RULE}" stroke-width="2"/>')
    for j, line in enumerate(consequence):
        text(RIGHT_X, y + 52 + j * 32, line, 22, fill=MUTED)
    text(RIGHT_EDGE, y + 120, refs, 20, fill=accent, weight="700", anchor="end")

text(MARGIN, H - 26,
     "Catena-X operating model, catenax-ev.github.io   ·   Cofinity-X, the operating company   ·   "
     "Regulation (EU) 2025/327, Chapter IV   ·   the full model in docs/ehds-operating-company.md",
     19, fill=FAINT)
add("</svg>")

path = Path(__file__).with_suffix(".svg")
path.write_text("\n".join(out) + "\n", encoding="utf-8")
print(f"wrote {path} ({W}x{H}, ratio {W / H:.2f})")
