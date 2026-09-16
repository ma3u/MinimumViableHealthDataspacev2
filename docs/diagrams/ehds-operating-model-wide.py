#!/usr/bin/env python3
"""Renders docs/diagrams/ehds-operating-model-wide.svg.

The slide rendering of the secondary-use operating model. Same argument as
ehds-operating-model.svg, laid out at 2400 x 1030, roughly 2.3:1, so it fills
the full width of a 16:9 slide. The 1.3:1 original is the one to use in a
document or an issue, where height is free; on a slide it can only be shown at
about half the width and is then unreadable from the back of a room.

The two carry the same content and have to be kept in step. The copy is wrapped
by hand to the column width, which is why this is a sibling file rather than a
flag on the original.

    python3 docs/diagrams/ehds-operating-model-wide.py

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

text(MARGIN, 40, "An Operating Company for the European Health Data Space", size=23, weight="700")
text(MARGIN, 60, "Una sociedad operadora para el Espacio Europeo de Datos de Salud",
     size=12.5, fill=MUTED, style="italic")
text(MARGIN, 80,
     "The Catena-X operating model, re-cut for secondary use under Regulation (EU) 2025/327. "
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
    "Member States and the Commission, with a stakeholder forum alongside. The",
    "HealthData@EU steering group takes the operational decisions, one seat each.",
], "Art. 92, 93, 94, 95")
box(xs[1], Y + 48, w, 88, EU, "Commission central platform", [
    "A federated EU dataset catalogue over the national ones, routing for an application",
    "that spans several countries, and a central environment for bodies that want one.",
], "Art. 96, 79, 67(3)")
box(xs[2], Y + 48, w, 88, EU, "Compliance checks for joining", [
    "No national contact point and no third country connects to HealthData@EU until",
    "the Commission has checked it against the requirements.",
], "Art. 75(5), (6)")

arrow(Y + 150, 268, "connect and comply, Art. 75(3) and (6)")

# -------------------------------------------------------------- Member State
Y = 268
band(Y, 162, STATE, "#EDF6F3",
     "Member State: the sovereign decision",
     "Estado miembro: la decisión soberana",
     "Catena-X analogue: none, this is what EHDS adds",
     "Art. 55(3) obliges the body to segregate assessing applications, preparing datasets and running the environment. Read the other way round, that is a list of exactly what can be industrialised.")
w, xs = tile(3, 20)
box(xs[0], Y + 48, w, 88, STATE, "Health Data Access Body", [
    "Issues, refuses and revokes the data permit. Three months to decide, two on the",
    "accelerated path, and it is the controller for the whole secondary use.",
], "Art. 55, 57, 68, 74")
box(xs[1], Y + 48, w, 88, STATE, "Enforcement and fees", [
    "Revokes a permit and can exclude a user for five years. A penalty for every day a",
    "holder is late. Fees recover cost only, transparent and non-discriminatory.",
], "Art. 62, 63")
box(xs[2], Y + 48, w, 88, STATE, "National contact point for secondary use", [
    "The organisational and technical gateway into HealthData@EU. Designated and",
    "notified to the Commission by 26 March 2027. May be the coordinator body itself.",
], "Art. 75(1)")

arrow(Y + 162, 456, "delegates the operation, keeps the decision")

# -------------------------------------------------------------- operating company
Y = 456
band(Y, 178, OPCO, "#FBF1E6",
     "The Operating Company: processor for the access body, Art. 28 GDPR",
     "La sociedad operadora: encargada del tratamiento por cuenta del organismo de acceso",
     "Catena-X analogue: Cofinity-X",
     "It never decides a permit. That stays with the access body, and it is not delegable.")
w, xs = tile(5, 16)
box(xs[0], Y + 48, w, 100, OPCO, "Planning and roadmap", [
    "A release train against the statutory",
    "dates. Two supported versions and a",
    "sandbox with synthetic data.",
], "Art. 105")
box(xs[1], Y + 48, w, 100, OPCO, "Data holders and onboarding", [
    "Find, contract, connect, catalogue,",
    "label, sustain. Keeps holders inside",
    "the three-month duty.",
], "Art. 60, 77, 78")
box(xs[2], Y + 48, w, 100, OPCO, "Services to the ecosystem", [
    "Runs the service map below, at",
    "published prices, with access nobody",
    "can be refused on other grounds.",
], "Art. 57, 62")
box(xs[3], Y + 48, w, 100, OPCO, "Incidents", [
    "One record and one timeline across",
    "holder, environment and platform. A",
    "permit-scope breach is escalated.",
], "Art. 63, 73(3)")
box(xs[4], Y + 48, w, 100, OPCO, "Support", [
    "L1 in the national language, L2 per",
    "service, L3 with suppliers. Plus holder",
    "success and a researcher desk.",
], "Art. 82")

arrow(Y + 178, 660, "operates and is measured on")

# -------------------------------------------------------------- service map
Y = 660
band(Y, 146, SERVICE, "#EDF6F0",
     "What it runs: the EHDS service map",
     "Lo que opera: el mapa de servicios del EEDS",
     "Catena-X analogue: the Service Map")
w, xs = tile(4, 18)
box(xs[0], Y + 48, w, 86, SERVICE, "Onboarding services", [
    "Registration and legal-entity validation, did:web",
    "identity, connectors, conformance testing.",
], "Art. 60, 77")
box(xs[1], Y + 48, w, 86, SERVICE, "Core services, one set per State", [
    "The permit register, the public information",
    "system, the national catalogue, the quality label.",
], "Art. 57(1)(e), 58, 77, 78")
box(xs[2], Y + 48, w, 86, SERVICE, "Secure processing services", [
    "One environment per permit, pseudonymisation by",
    "a segregated team, output checking, a year of logs.",
], "Art. 73, 55(3)")
box(xs[3], Y + 48, w, 86, SERVICE, "Enablement and applications", [
    "A competitive market, not the operator's monopoly:",
    "connectors, pipelines, confidential computing, apps.",
], "Art. 62")

arrow(Y + 146, 832, "serves")

# -------------------------------------------------------------- people
Y = 832
band(Y, 146, PEOPLE, "#F4EEF7",
     "Who it serves",
     "A quién sirve",
     "Catena-X analogue: data provider and consumer")
w, xs = tile(3, 20)
box(xs[0], Y + 48, w, 86, PEOPLE, "Health data holders", [
    "Hospitals, registries, insurers, biobanks, cohorts. Deliver within three months,",
    "describe the dataset, and re-check that description every year.",
], "Art. 60, 77")
box(xs[1], Y + 48, w, 86, PEOPLE, "Health data users", [
    "Researchers, HTA bodies, regulators, innovators. They work inside the environment,",
    "take out results rather than rows, and make those results public.",
], "Art. 53, 61")
box(xs[2], Y + 48, w, 86, PEOPLE, "Natural persons", [
    "An opt-out honoured before a dataset is ever assembled, and a public record of",
    "which permits were issued and to whom.",
], "Art. 58, 71")

text(MARGIN, 1006,
     "Regulation (EU) 2025/327, Chapter IV, article numbers as adopted   ·   "
     "Catena-X operating model, catenax-ev.github.io   ·   MinimumViableHealthDataspacev2, issue #27",
     size=10, fill=FAINT)
add("</svg>")

path = Path(__file__).with_suffix(".svg")
path.write_text("\n".join(out) + "\n", encoding="utf-8")
print(f"wrote {path} ({path.stat().st_size} bytes)")
