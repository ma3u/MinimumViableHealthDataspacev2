#!/usr/bin/env python3
"""Renders docs/diagrams/ehds-operating-model.svg.

The graphic answers one question: if the Catena-X operating model were re-cut
for Regulation (EU) 2025/327, which layers would an operating company actually
be allowed to hold?

Written as a generator rather than hand-authored SVG because the layout is
arithmetic (five bands, boxes that must tile a fixed inner width exactly) and
hand-typed coordinates drift the moment a column is added. Re-render with:

    python3 docs/diagrams/ehds-operating-model.py

Every article number is the number in the adopted Regulation, not the 2022
proposal. The two differ by roughly twenty, and the proposal numbering is what
most of this repository still carries: see docs/ehds-article-numbering.md.
"""

from html import escape
from pathlib import Path

W = 1640
MARGIN = 40
STRIP = 6  # width of the coloured strip down the left of each band
PAD = 16  # gap between the strip and the first box

INK = "#16324F"
MUTED = "#5A6B7B"
FAINT = "#8FA0AE"
PAPER = "#FFFFFF"

# Layer accents, the same five the UI uses in ui/src/lib/graph-constants.ts.
EU = "#2471A3"
STATE = "#148F77"
OPCO = "#CA6F1E"
SERVICE = "#1E8449"
PEOPLE = "#7D3C98"

INNER_X = MARGIN + STRIP + PAD  # 62
INNER_W = (W - MARGIN) - INNER_X  # 1538 -> boxes tile this exactly


def tile(count: int, gap: int) -> tuple[float, list[float]]:
    """Box width and x positions for `count` boxes filling INNER_W."""
    width = (INNER_W - gap * (count - 1)) / count
    return width, [INNER_X + i * (width + gap) for i in range(count)]


out: list[str] = []


def add(s: str) -> None:
    out.append(s)


def text(x, y, s, size=11, fill=INK, weight="normal", style="normal", anchor="start"):
    add(
        f'<text x="{x:.1f}" y="{y:.1f}" font-size="{size}" fill="{fill}" '
        f'font-weight="{weight}" font-style="{style}" text-anchor="{anchor}">'
        f"{escape(s)}</text>"
    )


def box(x, y, w, h, accent, title, bullets, ref=None):
    add(
        f'<rect x="{x:.1f}" y="{y}" width="{w:.1f}" height="{h}" rx="6" '
        f'fill="{PAPER}" stroke="{accent}" stroke-opacity="0.35" stroke-width="1"/>'
    )
    text(x + 13, y + 22, title, size=12.5, weight="600")
    for i, b in enumerate(bullets):
        text(x + 13, y + 42 + i * 15, b, size=10.5, fill=MUTED)
    if ref:
        text(x + 13, y + h - 11, ref, size=10, fill=accent, weight="600")


def band(y, h, accent, tint, title_en, title_es, chip, footnote=None):
    add(
        f'<rect x="{MARGIN}" y="{y}" width="{W - 2 * MARGIN}" height="{h}" rx="10" '
        f'fill="{tint}" stroke="{accent}" stroke-opacity="0.28"/>'
    )
    add(
        f'<path d="M{MARGIN + 10} {y} h-4 a6 6 0 0 0 -6 6 v{h - 12} '
        f'a6 6 0 0 0 6 6 h4 z" fill="{accent}"/>'
    )
    text(INNER_X, y + 27, title_en, size=16, weight="700")
    text(INNER_X, y + 45, title_es, size=11.5, fill=MUTED, style="italic")
    chip_w, chip_x = 342, W - MARGIN - 16 - 342
    add(
        f'<rect x="{chip_x}" y="{y + 15}" width="{chip_w}" height="23" rx="11.5" '
        f'fill="#FFFFFF" stroke="{FAINT}" stroke-opacity="0.6"/>'
    )
    text(chip_x + chip_w / 2, y + 30.5, chip, size=10.5, fill=MUTED, anchor="middle")
    if footnote:
        text(INNER_X, y + h - 14, footnote, size=10.5, fill=accent, style="italic")


def arrow(y0, y1, label):
    x = W / 2
    add(
        f'<line x1="{x}" y1="{y0 + 4}" x2="{x}" y2="{y1 - 8}" stroke="{FAINT}" '
        f'stroke-width="1.6" marker-end="url(#tip)"/>'
    )
    text(x + 14, (y0 + y1) / 2 + 4, label, size=10.5, fill=MUTED, style="italic")


add(
    f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="1252" '
    f'viewBox="0 0 {W} 1252" font-family="Inter, Helvetica Neue, Helvetica, Arial, sans-serif">'
)
add(
    '<defs><marker id="tip" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" '
    f'markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10 z" fill="{FAINT}"/>'
    "</marker></defs>"
)
add(f'<rect width="{W}" height="1252" fill="#F7F9FB"/>')

# ---------------------------------------------------------------- title
text(MARGIN, 46, "An Operating Company for the European Health Data Space", size=25, weight="700")
text(
    MARGIN, 68,
    "Una sociedad operadora para el Espacio Europeo de Datos de Salud",
    size=14, fill=MUTED, style="italic",
)
text(
    MARGIN, 92,
    "The Catena-X operating model, re-cut for Regulation (EU) 2025/327. "
    "Grey chips name the Catena-X role each layer replaces.",
    size=11.5, fill=MUTED,
)

# ---------------------------------------------------------------- Union level
Y = 112
band(Y, 196, EU, "#EEF4F9",
     "Union level: governance and the central platform",
     "Nivel de la Unión: gobernanza y plataforma central",
     "Catena-X analogue: Association e.V. and CSP-B",
     "Statutory. There is no version of this layer that a company operates.")
w, xs = tile(3, 17)
box(xs[0], Y + 58, w, 100, EU, "EHDS Board", [
    "Member States and the Commission, one voice each",
    "Guidance and consistency across the whole Regulation",
    "A stakeholder forum sits alongside it, Art. 93",
], "Art. 92, 94")
box(xs[1], Y + 58, w, 100, EU, "HealthData@EU steering group", [
    "One seat per national contact point for secondary use",
    "Takes the operational decisions on the infrastructure",
    "Consensus first, otherwise two thirds, one vote each",
], "Art. 95")
box(xs[2], Y + 58, w, 100, EU, "Commission central platform", [
    "A federated EU catalogue over the national ones",
    "Routes an application that spans several countries",
    "Compliance checks, and a central SPE for bodies that want one",
], "Art. 96, 79, 67(3)")

arrow(Y + 196, 346, "connect and comply, Art. 75(3) and (6)")

# ---------------------------------------------------------------- Member State
Y = 346
band(Y, 196, STATE, "#EDF6F3",
     "Member State: the sovereign decision",
     "Estado miembro: la decisión soberana",
     "Catena-X analogue: none, this layer is what EHDS adds",
     "Art. 55(3) obliges the body to segregate assessing applications, preparing datasets and "
     "running the environment. That duty is what makes room for an operating company.")
w, xs = tile(3, 17)
box(xs[0], Y + 58, w, 100, STATE, "Health Data Access Body", [
    "Issues, refuses and revokes the data permit",
    "Three months to decide, two on the accelerated path",
    "Controller for the secondary-use processing, Art. 74",
], "Art. 55, 57, 68")
box(xs[1], Y + 58, w, 100, STATE, "Enforcement and fees", [
    "Revokes a permit, can exclude a user for five years",
    "A daily penalty when a holder misses the three months",
    "Fees recover cost only, transparent and non-discriminatory",
], "Art. 62, 63")
box(xs[2], Y + 58, w, 100, STATE, "National contact point for secondary use", [
    "The gateway to HealthData@EU, organisational and technical",
    "Designated and notified to the Commission by 26 March 2027",
    "May be the coordinator access body itself",
], "Art. 75(1)")

arrow(Y + 196, 580, "delegates the operation, keeps the decision")

# ---------------------------------------------------------------- Operating company
Y = 580
band(Y, 202, OPCO, "#FBF1E6",
     "The Operating Company: processor for the access body, Art. 28 GDPR",
     "La sociedad operadora: encargada del tratamiento por cuenta del organismo de acceso",
     "Catena-X analogue: Cofinity-X",
     "It never decides a permit. That stays with the access body and is not delegable.")
w, xs = tile(5, 14)
box(xs[0], Y + 58, w, 104, OPCO, "Planning and roadmap", [
    "A release train on the statutory dates",
    "2027 designate, 2029 Chapter IV live",
    "2031 more categories, 2035 third countries",
], "Art. 105")
box(xs[1], Y + 58, w, 104, OPCO, "Holders and onboarding", [
    "Find, contract, connect, catalogue, label",
    "Keeps holders inside the three-month duty",
    "Annual re-check of every description",
], "Art. 60, 77, 78")
box(xs[2], Y + 58, w, 104, OPCO, "Services to the ecosystem", [
    "Runs the service map below",
    "A published catalogue with published prices",
    "Non-discriminatory access for every actor",
], "Art. 57, 62")
box(xs[3], Y + 58, w, 104, OPCO, "Incident management", [
    "One bridge across holder, SPE and platform",
    "A permit-scope breach escalates to the body",
    "GDPR 72 h and NIS2 clocks start together",
], "Art. 63, 73(3)")
box(xs[4], Y + 58, w, 104, OPCO, "Support model", [
    "L1 desk in the national language, then L2, L3",
    "Holder success, not a ticket queue",
    "A researcher desk for feasibility, not only IT",
], "Art. 82")

arrow(Y + 202, 818, "operates and is measured on")

# ---------------------------------------------------------------- service map
Y = 818
band(Y, 180, SERVICE, "#EDF6F0",
     "What it runs: the EHDS service map",
     "Lo que opera: el mapa de servicios del EEDS",
     "Catena-X analogue: the Service Map")
w, xs = tile(4, 16)
box(xs[0], Y + 58, w, 104, SERVICE, "Onboarding services", [
    "Registration portal and legal-entity validation",
    "Identity: did:web and verifiable credentials",
    "Connector provisioning and a conformance test",
    "Dataset description intake, HealthDCAT-AP",
])
box(xs[1], Y + 58, w, 104, SERVICE, "Core services, one set per Member State", [
    "Permit and application register, Art. 57(1)(e)",
    "Public information system, Art. 58",
    "National dataset catalogue, Art. 77 and 79",
    "Data quality and utility label, Art. 78",
])
box(xs[2], Y + 58, w, 104, SERVICE, "Secure processing services", [
    "One environment per permit, Art. 73",
    "Pseudonymisation by a segregated team, Art. 55(3)",
    "Output checking before anything leaves",
    "Attestation, a year of logs, third-party audits",
])
box(xs[3], Y + 58, w, 104, SERVICE, "Enablement services and applications", [
    "A competitive market, not the operator's monopoly",
    "Dataspace connectors, FHIR and OMOP pipelines",
    "Confidential computing, for example Edgeless Contrast",
    "Cohort discovery, HTA, pharmacovigilance",
])

arrow(Y + 180, 1036, "serves, at a cost-recovery fee")

# ---------------------------------------------------------------- participants
Y = 1036
band(Y, 156, PEOPLE, "#F4EEF7",
     "Who it serves",
     "A quién sirve",
     "Catena-X analogue: data provider and consumer")
w, xs = tile(3, 17)
box(xs[0], Y + 58, w, 82, PEOPLE, "Health data holders", [
    "Hospitals, registries, insurers, biobanks, cohorts",
    "Deliver in three months, describe the dataset yearly",
], "Art. 60")
box(xs[1], Y + 58, w, 82, PEOPLE, "Health data users", [
    "Researchers, HTA bodies, regulators, innovators",
    "Work inside the environment, make results public",
], "Art. 53, 61")
box(xs[2], Y + 58, w, 82, PEOPLE, "Natural persons", [
    "An opt-out honoured before a dataset is assembled",
    "Can see which permits were issued, and to whom",
], "Art. 58, 71")

text(
    MARGIN, 1228,
    "Regulation (EU) 2025/327, article numbers as adopted   ·   "
    "Catena-X operating model, catenax-ev.github.io   ·   "
    "MinimumViableHealthDataspacev2, issue #27",
    size=10.5, fill=FAINT,
)
add("</svg>")

path = Path(__file__).with_suffix(".svg")
path.write_text("\n".join(out) + "\n", encoding="utf-8")
print(f"wrote {path} ({path.stat().st_size} bytes)")
