#!/usr/bin/env python3
"""Renders docs/diagrams/ehds-operating-model-primary.svg.

The sibling of ehds-operating-model.py, which covers secondary use. This one
covers Chapter II: a citizen's record following them across a region and across
a border, and who would operate the services that make that happen.

Deliberately wide, 2400 x 1030, roughly 2.3:1. The secondary-use diagram is
1.3:1, which on a 16:9 slide can only be shown at about half the width and is
then too small to read. This one fills the full width of a slide.

    python3 docs/diagrams/ehds-operating-model-primary.py

Article numbers are the adopted ones: see docs/ehds-article-numbering.md.
"""

from html import escape
from pathlib import Path

W, H = 2400, 1030
MARGIN = 44
STRIP = 7
PAD = 18

INK = "#16324F"
MUTED = "#5A6B7B"
FAINT = "#8FA0AE"
PAPER = "#FFFFFF"

EU = "#2471A3"
STATE = "#148F77"
OPCO = "#CA6F1E"
SERVICE = "#1E8449"
PEOPLE = "#7D3C98"

INNER_X = MARGIN + STRIP + PAD
INNER_W = (W - MARGIN) - INNER_X

out: list[str] = []
add = out.append


def tile(count: int, gap: int) -> tuple[float, list[float]]:
    width = (INNER_W - gap * (count - 1)) / count
    return width, [INNER_X + i * (width + gap) for i in range(count)]


def text(x, y, s, size=10.5, fill=INK, weight="normal", style="normal", anchor="start"):
    add(
        f'<text x="{x:.1f}" y="{y:.1f}" font-size="{size}" fill="{fill}" '
        f'font-weight="{weight}" font-style="{style}" text-anchor="{anchor}">{escape(s)}</text>'
    )


def box(x, y, w, h, accent, title, lines, ref=None):
    add(
        f'<rect x="{x:.1f}" y="{y}" width="{w:.1f}" height="{h}" rx="6" fill="{PAPER}" '
        f'stroke="{accent}" stroke-opacity="0.35"/>'
    )
    text(x + 14, y + 23, title, size=13.5, weight="600")
    for i, line in enumerate(lines):
        text(x + 14, y + 43 + i * 15, line, size=10.5, fill=MUTED)
    if ref:
        text(x + 14, y + h - 11, ref, size=9.5, fill=accent, weight="600")


def band(y, h, accent, tint, title_en, title_es, chip, footnote=None):
    add(
        f'<rect x="{MARGIN}" y="{y}" width="{W - 2 * MARGIN}" height="{h}" rx="9" '
        f'fill="{tint}" stroke="{accent}" stroke-opacity="0.28"/>'
    )
    add(
        f'<path d="M{MARGIN + 11} {y} h-4 a6 6 0 0 0 -7 6 v{h - 12} a6 6 0 0 0 7 6 h4 z" '
        f'fill="{accent}"/>'
    )
    text(INNER_X, y + 24, title_en, size=16, weight="700")
    text(INNER_X, y + 41, title_es, size=11, fill=MUTED, style="italic")
    cw, cx = 372, W - MARGIN - 18 - 372
    add(
        f'<rect x="{cx}" y="{y + 13}" width="{cw}" height="22" rx="11" fill="#FFFFFF" '
        f'stroke="{FAINT}" stroke-opacity="0.6"/>'
    )
    text(cx + cw / 2, y + 28, chip, size=10.5, fill=MUTED, anchor="middle")
    if footnote:
        text(INNER_X, y + h - 13, footnote, size=10.5, fill=accent, style="italic")


def arrow(y0, y1, label):
    x = W / 2
    add(
        f'<line x1="{x}" y1="{y0 + 3}" x2="{x}" y2="{y1 - 7}" stroke="{FAINT}" '
        f'stroke-width="1.5" marker-end="url(#tip)"/>'
    )
    text(x + 13, (y0 + y1) / 2 + 4, label, size=10.5, fill=MUTED, style="italic")


add(
    f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" '
    'font-family="Inter, Helvetica Neue, Helvetica, Arial, sans-serif">'
)
add(
    '<defs><marker id="tip" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" '
    f'orient="auto"><path d="M0 0 L10 5 L0 10 z" fill="{FAINT}"/></marker></defs>'
)
add(f'<rect width="{W}" height="{H}" fill="#F7F9FB"/>')

text(MARGIN, 40, "Who operates primary use: one record that follows the citizen", size=23, weight="700")
text(MARGIN, 60, "Quién opera el uso primario: una historia clínica que acompaña al ciudadano",
     size=12.5, fill=MUTED, style="italic")
text(MARGIN, 80,
     "Chapter II of Regulation (EU) 2025/327, cut the way Catena-X cuts a dataspace. "
     "Grey chips name the Catena-X role each layer replaces.",
     size=11, fill=MUTED)

# -------------------------------------------------------------- Union level
Y = 92
band(Y, 150, EU, "#EEF4F9",
     "Union level: governance and the central platform",
     "Nivel de la Unión: gobernanza y plataforma central",
     "Catena-X analogue: Association e.V. and CSP-B")
w, xs = tile(3, 20)
box(xs[0], Y + 48, w, 88, EU, "EHDS Board and the steering group", [
    "Member States and the Commission. The MyHealth@EU steering group takes the",
    "operational decisions, one seat per national contact point, consensus or two thirds.",
], "Art. 92, 94, 95")
box(xs[1], Y + 48, w, 88, EU, "Commission central services", [
    "Develops, hosts and operates the central platform for MyHealth@EU, plus the",
    "cross-border identification and authentication of patients and professionals.",
], "Art. 96(1)(a), (b)")
box(xs[2], Y + 48, w, 88, EU, "Conformity and the EU database", [
    "Common specifications, a European digital testing environment, and the public",
    "register of every EHR system placed on the Union market.",
], "Art. 36, 40, 49")

arrow(Y + 150, 268, "connect, after a Commission compliance check, Art. 23(9)")

# -------------------------------------------------------------- Member State
Y = 268
band(Y, 162, STATE, "#EDF6F3",
     "Member State: the sovereign functions",
     "Estado miembro: las funciones soberanas",
     "Catena-X analogue: none, this is what EHDS adds",
     "Art. 19 names the authority and Art. 23 names the gateway. Neither article says a word about who builds or runs them.")
w, xs = tile(3, 20)
box(xs[0], Y + 48, w, 88, STATE, "Digital health authority", [
    "Enforces Chapter II, takes the citizen's complaint, reports every year. One per",
    "Member State, and the address a citizen writes to when a right is denied.",
], "Art. 19, 20, 21")
box(xs[1], Y + 48, w, 88, STATE, "National contact point for digital health", [
    "The gateway into MyHealth@EU. Designated, notified, and checked by the",
    "Commission before it is allowed to connect to anything.",
], "Art. 23")
box(xs[2], Y + 48, w, 88, STATE, "Market surveillance", [
    "Watches the EHR systems on the national market, handles serious incidents, and",
    "can restrict or withdraw a product that does not comply.",
], "Art. 43, 44, 45")

arrow(Y + 162, 456, "delegates the operation, keeps the decision and the enforcement")

# -------------------------------------------------------------- operating company
Y = 456
band(Y, 178, OPCO, "#FBF1E6",
     "The Operating Company: processor for the authority, Art. 28 GDPR",
     "La sociedad operadora: encargada del tratamiento por cuenta de la autoridad",
     "Catena-X analogue: Cofinity-X",
     "It never enforces a right and never decides a complaint. Those stay with the digital health authority.")
w, xs = tile(5, 16)
box(xs[0], Y + 48, w, 100, OPCO, "Planning and roadmap", [
    "Patient summaries and prescriptions",
    "live in 2029, imaging, labs and",
    "discharge reports in 2031.",
], "Art. 105")
box(xs[1], Y + 48, w, 100, OPCO, "Providers and onboarding", [
    "Every hospital, practice, pharmacy",
    "and lab that has to register data.",
    "Conformance tested before it connects.",
], "Art. 13, 17")
box(xs[2], Y + 48, w, 100, OPCO, "The exchange services", [
    "Conversion into and out of the",
    "European exchange format, terminology,",
    "identification management.",
], "Art. 4, 12, 15, 16")
box(xs[3], Y + 48, w, 100, OPCO, "Incidents", [
    "One timeline across provider, converter,",
    "contact point and platform. A wrong",
    "record at a bedside is a safety event.",
], "Art. 44")
box(xs[4], Y + 48, w, 100, OPCO, "Support", [
    "L1 in the national language, for",
    "citizens and clinicians both. A doctor",
    "blocked at the bedside cannot queue.",
], "Art. 82, 83")

arrow(Y + 178, 660, "operates and is measured on")

# -------------------------------------------------------------- service map
Y = 660
band(Y, 146, SERVICE, "#EDF6F0",
     "What it runs: the primary-use service map",
     "Lo que opera: el mapa de servicios del uso primario",
     "Catena-X analogue: the Service Map")
w, xs = tile(4, 18)
box(xs[0], Y + 48, w, 86, SERVICE, "Citizen-facing services", [
    "Access for a person and their representative,",
    "rectification, portability, restriction, opt-out.",
], "Art. 3 to 10")
box(xs[1], Y + 48, w, 86, SERVICE, "Professional-facing services", [
    "The health professional access service, with",
    "identification and purpose-bound access.",
], "Art. 11, 12, 16")
box(xs[2], Y + 48, w, 86, SERVICE, "Interoperability services", [
    "Conversion both ways into the European format,",
    "terminology, quality at the point of registration.",
], "Art. 13, 15, 17")
box(xs[3], Y + 48, w, 86, SERVICE, "Cross-border services", [
    "The contact point's connection to MyHealth@EU,",
    "and whatever supplementary services are added.",
], "Art. 23, 24")

arrow(Y + 146, 832, "serves")

# -------------------------------------------------------------- people
Y = 832
band(Y, 146, PEOPLE, "#F4EEF7",
     "Who it serves",
     "A quién sirve",
     "Catena-X analogue: data provider and consumer")
w, xs = tile(3, 20)
box(xs[0], Y + 48, w, 86, PEOPLE, "Natural persons", [
    "Immediate access to their own record, at no cost. They can see who looked at it,",
    "restrict access, and opt out.",
], "Art. 3, 8, 9, 10")
box(xs[1], Y + 48, w, 86, PEOPLE, "Health professionals", [
    "The record follows the patient, across a region and across a border, in a format",
    "the clinician's own system can read.",
], "Art. 11, 12")
box(xs[2], Y + 48, w, 86, PEOPLE, "EHR system manufacturers", [
    "Harmonised software components, self-certification and CE marking, and a testing",
    "environment to prove it before going to market.",
], "Chapter III")

text(MARGIN, 1006,
     "Regulation (EU) 2025/327, Chapter II, article numbers as adopted   ·   "
     "Catena-X operating model, catenax-ev.github.io   ·   MinimumViableHealthDataspacev2, issue #27",
     size=10, fill=FAINT)
add("</svg>")

path = Path(__file__).with_suffix(".svg")
path.write_text("\n".join(out) + "\n", encoding="utf-8")
print(f"wrote {path} ({path.stat().st_size} bytes)")
