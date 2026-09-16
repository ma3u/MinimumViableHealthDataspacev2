#!/usr/bin/env python3
"""Renders docs/diagrams/ehds-operating-model-wide.svg, the slide overview.

Three tiers and one question: which of them is open?

    European Union        closed by law
    Member State          cannot be delegated
    Operating Company     OPEN

That is the whole argument, and on a slide it is the only part that survives
being talked over. Everything else, the five bands, the nineteen boxes, the
article lists, the bilingual subtitles, lives in ehds-operating-model.svg, which
is the reference version for a document or an issue where a reader sets their
own pace.

Roughly forty words. The third tier is drawn larger and warmer than the other
two because it is the one the audience is being asked to think about.

    python3 docs/diagrams/ehds-operating-model-wide.py
"""

from html import escape
from pathlib import Path

W, H = 2400, 780
MARGIN = 50

INK = "#16324F"
MUTED = "#5A6B7B"
FAINT = "#9AA7B3"

EU = "#2471A3"
STATE = "#148F77"
OPCO = "#CA6F1E"

out: list[str] = []
add = out.append


def text(x, y, s, size, fill=INK, weight="normal", style="normal", anchor="start"):
    add(
        f'<text x="{x:.0f}" y="{y:.0f}" font-size="{size}" fill="{fill}" font-weight="{weight}" '
        f'font-style="{style}" text-anchor="{anchor}">{escape(s)}</text>'
    )


def tier(y, h, accent, tint, title, line, verdict, catena, emphasis=False):
    add(
        f'<rect x="{MARGIN}" y="{y}" width="{W - 2 * MARGIN}" height="{h}" rx="16" fill="{tint}" '
        f'stroke="{accent}" stroke-opacity="{0.9 if emphasis else 0.28}" '
        f'stroke-width="{3 if emphasis else 1.5}"/>'
    )
    add(f'<rect x="{MARGIN}" y="{y}" width="14" height="{h}" rx="7" fill="{accent}"/>')
    text(MARGIN + 60, y + (78 if emphasis else 72), title, 48 if emphasis else 42, weight="700")
    text(MARGIN + 60, y + (128 if emphasis else 118), line, 26, fill=MUTED)
    text(W - MARGIN - 60, y + (76 if emphasis else 70), verdict,
         52 if emphasis else 30, fill=accent, weight="700", anchor="end")
    text(W - MARGIN - 60, y + (124 if emphasis else 112), catena, 20, fill=FAINT, anchor="end")


add(
    f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" '
    'font-family="Inter, Helvetica Neue, Helvetica, Arial, sans-serif">'
)
add(f'<rect width="{W}" height="{H}" fill="#F7F9FB"/>')

tier(40, 170, EU, "#EDF3F9",
     "European Union",
     "The Commission builds and runs the central platform.",
     "Closed by law",
     "Catena-X: the Association and CSP-B")

tier(230, 170, STATE, "#EBF6F2",
     "Member State",
     "The access body decides every permit, and enforces it.",
     "Cannot be delegated",
     "Catena-X: nothing. This is what EHDS adds.")

tier(420, 200, OPCO, "#FBEFE1",
     "The Operating Company",
     "Onboarding, the catalogue, the secure environment, incidents, support.",
     "OPEN",
     "Catena-X: Cofinity-X",
     emphasis=True)

text(W / 2, 685, "serving health data holders   ·   researchers and regulators   ·   citizens",
     24, fill=MUTED, anchor="middle")
text(W / 2, 740, "Regulation (EU) 2025/327, Chapter IV   ·   detail in docs/ehds-operating-company.md",
     19, fill=FAINT, anchor="middle")
add("</svg>")

path = Path(__file__).with_suffix(".svg")
path.write_text("\n".join(out) + "\n", encoding="utf-8")
print(f"wrote {path} ({path.stat().st_size} bytes)")
