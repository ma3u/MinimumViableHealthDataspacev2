#!/usr/bin/env python3
"""Renders docs/diagrams/ehds-operating-model-wide.svg, the slide overview.

The same argument as ehds-operating-model.svg, reduced to what a room can take
in while somebody is talking over it. That file is the reference version: five
bands, a paragraph in every box, an article list on every line. It belongs in a
document or an issue, where a reader sets their own pace.

This one answers three questions and stops:

    who holds each layer, what is on it, and which layer is actually open

So the boxes become chips of two or three words, every box paragraph is gone,
the bilingual subtitles are gone, the per-box article lists collapse to one line
per band, and the diagram's own title block is gone because the slide already
has a title. Four bands instead of five: the service map folded into the
operating company's own row, because on a slide it was a second reading of the
same thing.

Type is correspondingly larger. The chips are 20px on a 2400px canvas, which is
about 18pt once the SVG is placed at full slide width.

    python3 docs/diagrams/ehds-operating-model-wide.py

Article numbers are the adopted ones: see docs/ehds-article-numbering.md.
"""

from html import escape
from pathlib import Path

W, H = 2400, 880
MARGIN = 40
STRIP = 9

INK = "#16324F"
MUTED = "#5A6B7B"
FAINT = "#8FA0AE"

EU = "#2471A3"
STATE = "#148F77"
OPCO = "#CA6F1E"
PEOPLE = "#7D3C98"

INNER_X = MARGIN + STRIP + 31
RIGHT = W - MARGIN - 20

out: list[str] = []
add = out.append


def text(x, y, s, size=20, fill=INK, weight="normal", style="normal", anchor="start"):
    add(
        f'<text x="{x:.1f}" y="{y:.1f}" font-size="{size}" fill="{fill}" font-weight="{weight}" '
        f'font-style="{style}" text-anchor="{anchor}">{escape(s)}</text>'
    )


def chips(x, y, labels, accent, tint):
    """A row of pills. Width is estimated from the label, which is fine at 20px."""
    for label in labels:
        w = len(label) * 10.5 + 50
        add(
            f'<rect x="{x:.1f}" y="{y}" width="{w:.1f}" height="48" rx="24" fill="{tint}" '
            f'stroke="{accent}" stroke-opacity="0.45"/>'
        )
        text(x + w / 2, y + 31, label, size=20, fill=INK, weight="600", anchor="middle")
        x += w + 16


def band(y, h, accent, tint, title, line, labels, refs, catena, chip_tint="#FFFFFF"):
    add(
        f'<rect x="{MARGIN}" y="{y}" width="{W - 2 * MARGIN}" height="{h}" rx="12" fill="{tint}" '
        f'stroke="{accent}" stroke-opacity="0.3"/>'
    )
    add(
        f'<path d="M{MARGIN + 13} {y} h-5 a8 8 0 0 0 -8 8 v{h - 16} a8 8 0 0 0 8 8 h5 z" '
        f'fill="{accent}"/>'
    )
    text(INNER_X, y + 50, title, size=32, weight="700")
    text(RIGHT, y + 46, catena, size=17, fill=FAINT, anchor="end")
    if line:
        text(INNER_X, y + 86, line, size=19, fill=MUTED)
        chip_y = y + h - 74
    else:
        chip_y = y + h - 70
    chips(INNER_X, chip_y, labels, accent, chip_tint)
    text(RIGHT, chip_y + 31, refs, size=18, fill=accent, weight="600", anchor="end")


def arrow(y, label=None):
    add(
        f'<line x1="{W / 2}" y1="{y + 4}" x2="{W / 2}" y2="{y + 24}" stroke="{FAINT}" '
        f'stroke-width="2" marker-end="url(#tip)"/>'
    )
    if label:
        text(W / 2 + 18, y + 21, label, size=17, fill=MUTED, style="italic")


add(
    f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" '
    'font-family="Inter, Helvetica Neue, Helvetica, Arial, sans-serif">'
)
add(
    '<defs><marker id="tip" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" '
    f'orient="auto"><path d="M0 0 L10 5 L0 10 z" fill="{FAINT}"/></marker></defs>'
)
add(f'<rect width="{W}" height="{H}" fill="#F7F9FB"/>')

band(40, 180, EU, "#EDF3F9",
     "Union level: closed by law",
     "The Commission builds and operates the central platform. The Board and the steering group govern it.",
     ["EU dataset catalogue", "Cross-border routing", "Compliance checks"],
     "Art. 79, 92 to 96",
     "Catena-X: the Association and CSP-B")
arrow(220)

band(252, 180, STATE, "#EBF6F2",
     "Member State: the decision, and it cannot be delegated",
     "The access body issues, refuses and revokes the permit, enforces it, and sets the fee. It is the controller.",
     ["Data permit", "Enforcement", "Fees", "Controller"],
     "Art. 55, 62, 63, 68, 74",
     "Catena-X: nothing, this is what EHDS adds")
arrow(432, "Art. 55(3) obliges the body to segregate the work below. That is what makes room for an operator.")

band(464, 180, OPCO, "#FBF0E4",
     "The Operating Company: everything else",
     "Processor for the access body under Art. 28 GDPR. It runs the lot, and it decides nothing.",
     ["Onboarding", "Catalogue and label", "Secure environment", "Incidents", "Support"],
     "Art. 57, 60, 73, 77, 82",
     "Catena-X: Cofinity-X",
     chip_tint="#FFFFFF")
arrow(644)

band(676, 150, PEOPLE, "#F3EDF7",
     "Who it serves",
     None,
     ["Health data holders", "Researchers and regulators", "Citizens"],
     "Art. 58, 60, 61, 71",
     "Catena-X: data provider and consumer")

text(MARGIN, 862,
     "Regulation (EU) 2025/327, Chapter IV, article numbers as adopted   ·   "
     "Catena-X operating model, catenax-ev.github.io   ·   "
     "detail in docs/diagrams/ehds-operating-model.svg",
     size=16, fill=FAINT)
add("</svg>")

path = Path(__file__).with_suffix(".svg")
path.write_text("\n".join(out) + "\n", encoding="utf-8")
print(f"wrote {path} ({path.stat().st_size} bytes)")
