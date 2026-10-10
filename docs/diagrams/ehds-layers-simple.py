#!/usr/bin/env python3
"""Renders docs/diagrams/ehds-layers-simple.svg, the layer overview for a slide.

Three layers and what sits on each, plus which of them is actually open. No
sentences: the layer name, a handful of chips, the verdict, and the Catena-X
role it corresponds to. The presenter says the rest.

This sits alongside the lessons graphic rather than replacing it. Between them:
this one is the shape of the thing, that one is what running it teaches you.
The full model, with articles on every box, stays in ehds-operating-model.svg.

    python3 docs/diagrams/ehds-layers-simple.py
"""

from html import escape
from pathlib import Path

W, H = 2400, 800
MARGIN = 50

INK = "#16324F"
MUTED = "#5A6B7B"
FAINT = "#9AA7B3"

EU = "#2471A3"
STATE = "#148F77"
OPCO = "#CA6F1E"
PEOPLE = "#7D3C98"

TEXT_X = MARGIN + 46

out: list[str] = []
add = out.append


def text(x, y, s, size, fill=INK, weight="normal", anchor="start"):
    add(
        f'<text x="{x:.0f}" y="{y:.0f}" font-size="{size}" fill="{fill}" font-weight="{weight}" '
        f'text-anchor="{anchor}">{escape(s)}</text>'
    )


def chips(x, y, labels, accent, size=21):
    for label in labels:
        w = len(label) * 11.0 + 52
        add(
            f'<rect x="{x:.0f}" y="{y}" width="{w:.0f}" height="50" rx="25" fill="#FFFFFF" '
            f'stroke="{accent}" stroke-opacity="0.5"/>'
        )
        text(x + w / 2, y + 33, label, size, fill=INK, weight="600", anchor="middle")
        x += w + 16


def layer(y, h, accent, tint, name, verdict, catena, labels, emphasis=False):
    add(
        f'<rect x="{MARGIN}" y="{y}" width="{W - 2 * MARGIN}" height="{h}" rx="16" fill="{tint}" '
        f'stroke="{accent}" stroke-opacity="{0.9 if emphasis else 0.3}" '
        f'stroke-width="{3 if emphasis else 1.5}"/>'
    )
    add(f'<rect x="{MARGIN}" y="{y}" width="14" height="{h}" rx="7" fill="{accent}"/>')
    text(TEXT_X, y + 58, name, 38 if emphasis else 34, weight="700")
    text(W - MARGIN - 50, y + 54, verdict, 40 if emphasis else 27, fill=accent,
         weight="700", anchor="end")
    text(W - MARGIN - 50, y + 88, catena, 19, fill=FAINT, anchor="end")
    chips(TEXT_X, y + h - 74, labels, accent)


add(
    f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" '
    'font-family="Inter, Helvetica Neue, Helvetica, Arial, sans-serif">'
)
add(f'<rect width="{W}" height="{H}" fill="#FFFFFF"/>')

layer(30, 165, EU, "#EDF3F9",
      "European Union", "Closed by law", "Catena-X: the Association and CSP-B",
      ["EU dataset catalogue", "Cross-border routing", "Compliance checks"])

layer(215, 165, STATE, "#EBF6F2",
      "Member State", "Cannot be delegated", "Catena-X: nothing, EHDS adds this",
      ["Data permit", "Enforcement", "Fees", "Controller"])

layer(400, 185, OPCO, "#FBEFE1",
      "The Operating Company", "OPEN", "Catena-X: Cofinity-X",
      ["Onboarding", "Catalogue and label", "Secure environment", "Incidents", "Support"],
      emphasis=True)

add(f'<rect x="{MARGIN}" y="610" width="{W - 2 * MARGIN}" height="118" rx="16" fill="#F5F1F8" '
    f'stroke="{PEOPLE}" stroke-opacity="0.3"/>')
add(f'<rect x="{MARGIN}" y="610" width="14" height="118" rx="7" fill="{PEOPLE}"/>')
text(TEXT_X, 655, "Who it serves", 26, fill=MUTED, weight="700")
chips(TEXT_X + 260, 632, ["Health data holders", "Researchers and regulators", "Citizens"], PEOPLE)

text(MARGIN, 776,
     "Regulation (EU) 2025/327, Chapter IV   ·   the full model in docs/ehds-operating-company.md",
     19, fill=FAINT)
add("</svg>")

path = Path(__file__).with_suffix(".svg")
path.write_text("\n".join(out) + "\n", encoding="utf-8")
print(f"wrote {path} ({W}x{H}, ratio {W / H:.2f})")
