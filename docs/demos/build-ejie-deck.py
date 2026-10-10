#!/usr/bin/env python3
"""Builds docs/demos/euskadi-ejie-2026.pptx, the animated fallback for the EJIE meeting.

The main deck is the narrated web presentation in
ui/public/presentations/euskadi-ejie-2026/ (Spanish narration, Basque
subtitles). This is the same 16 slides as a PowerPoint file, for a room where
the browser or the network fails:

- slides 2 to 10 are the Basque deck's (build-basque-deck.py), unchanged;
- a Spanish title slide, the next steps, the Euskadi pilot in four slides and a
  closing slide with the LinkedIn QR code are new here;
- every slide fades in, the question slides build themselves card by card, and
  the pilot and closing slides build on each click, as in the web version;
- the pilot slides carry the source links as clickable hyperlinks.

python-pptx writes no animations, so the generator adds the slide's <p:timing>
and <p:transition> XML itself: a fade entrance per shape, in click groups or in
one automatic sequence.

    python3 docs/demos/build-ejie-deck.py
"""

import importlib.util
import sys
from pathlib import Path

from lxml import etree
from pptx import Presentation
from pptx.enum.shapes import MSO_CONNECTOR, MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.oxml.ns import qn
from pptx.util import Emu, Inches, Pt

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
OUT = HERE / "euskadi-ejie-2026.pptx"
QR = ROOT / "ui/public/presentations/euskadi-ejie-2026/img/qr-linkedin.png"

_spec = importlib.util.spec_from_file_location("basque", HERE / "build-basque-deck.py")
B = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(B)
B.FOOTER = "Reunión de preparación  ·  Espacio de Datos EJIE  ·  País Vasco"

NAVY, TEAL, AMBER, RED, GREEN = B.NAVY, B.TEAL, B.AMBER, B.RED, B.GREEN
CREAM, BODY, FAINT, WHITE = B.CREAM, B.BODY, B.FAINT, B.WHITE
RGB = B.RGBColor
ORANGE = RGB(0xEE, 0x96, 0x33)
SLATE = RGB(0x5F, 0x6B, 0x78)
INK = RGB(0x22, 0x26, 0x2B)
S_AVAIL, S_PROG, S_OPEN = RGB(0x2E, 0x7D, 0x3A), RGB(0xF2, 0xC1, 0x4E), RGB(0xC0, 0x39, 0x2B)
STATUS = {
    "available": (S_AVAIL, WHITE),
    "in progress": (S_PROG, NAVY),
    "open decision": (S_OPEN, WHITE),
    "we build it": (WHITE, NAVY),
}
DOT = {"avail": S_AVAIL, "prog": S_PROG, "open": S_OPEN, "build": WHITE}


# ---------------------------------------------------------------- animation XML
P = "http://schemas.openxmlformats.org/presentationml/2006/main"


def _effect(ids, spid, node_type):
    i = next(ids)
    return (
        f'<p:par><p:cTn id="{i}" presetID="10" presetClass="entr" presetSubtype="0" fill="hold" '
        f'grpId="0" nodeType="{node_type}"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>'
        f'<p:set><p:cBhvr><p:cTn id="{next(ids)}" dur="1" fill="hold"><p:stCondLst><p:cond delay="0"/>'
        f'</p:stCondLst></p:cTn><p:tgtEl><p:spTgt spid="{spid}"/></p:tgtEl><p:attrNameLst>'
        f'<p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="visible"/>'
        f'</p:to></p:set><p:animEffect transition="in" filter="fade"><p:cBhvr><p:cTn id="{next(ids)}" '
        f'dur="500"/><p:tgtEl><p:spTgt spid="{spid}"/></p:tgtEl></p:cBhvr></p:animEffect>'
        f"</p:childTnLst></p:cTn></p:par>"
    )


def animate(slide, groups, auto):
    """Fade the shapes in, a group at a time: on each click, or by themselves.

    `groups` is a list of shape lists. With `auto`, the whole sequence starts
    as the slide appears and each group follows the last after 300 ms.
    """
    groups = [g for g in groups if g]
    if groups:
        counter = iter(range(3, 100000))
        if auto:
            inner = ""
            for k, g in enumerate(groups):
                effects = "".join(_effect(counter, s.shape_id, "afterEffect" if j == 0 and k == 0 else "withEffect")
                                  for j, s in enumerate(g))
                inner += (f'<p:par><p:cTn id="{next(counter)}" fill="hold"><p:stCondLst><p:cond delay="{k * 300}"/>'
                          f"</p:stCondLst><p:childTnLst>{effects}</p:childTnLst></p:cTn></p:par>")
            seq = (f'<p:par><p:cTn id="{next(counter)}" fill="hold"><p:stCondLst><p:cond delay="indefinite"/>'
                   f'<p:cond evt="onBegin" delay="0"><p:tn val="2"/></p:cond></p:stCondLst>'
                   f"<p:childTnLst>{inner}</p:childTnLst></p:cTn></p:par>")
        else:
            seq = ""
            for g in groups:
                effects = "".join(_effect(counter, s.shape_id, "clickEffect" if j == 0 else "withEffect")
                                  for j, s in enumerate(g))
                seq += (f'<p:par><p:cTn id="{next(counter)}" fill="hold"><p:stCondLst><p:cond delay="indefinite"/>'
                        f'</p:stCondLst><p:childTnLst><p:par><p:cTn id="{next(counter)}" fill="hold"><p:stCondLst>'
                        f'<p:cond delay="0"/></p:stCondLst><p:childTnLst>{effects}</p:childTnLst></p:cTn></p:par>'
                        f"</p:childTnLst></p:cTn></p:par>")
        timing = (
            f'<p:timing xmlns:p="{P}"><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" '
            f'nodeType="tmRoot"><p:childTnLst><p:seq concurrent="1" nextAc="seek"><p:cTn id="2" '
            f'dur="indefinite" nodeType="mainSeq"><p:childTnLst>{seq}</p:childTnLst></p:cTn><p:prevCondLst>'
            f'<p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst>'
            f'<p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond>'
            f"</p:nextCondLst></p:seq></p:childTnLst></p:cTn></p:par></p:tnLst></p:timing>"
        )
    sld = slide._element
    for old in sld.findall(qn("p:transition")) + sld.findall(qn("p:timing")):
        sld.remove(old)
    anchor = sld.find(qn("p:clrMapOvr"))
    if anchor is None:
        anchor = sld.find(qn("p:cSld"))
    transition = etree.fromstring(f'<p:transition xmlns:p="{P}" spd="med"><p:fade/></p:transition>')
    anchor.addnext(transition)
    if groups:
        transition.addnext(etree.fromstring(timing))


def card_groups(slide, top_min=1.75, top_max=7.0):
    """The body of a slide as cards: every shape joins the largest shape that holds its centre."""
    body = [s for s in slide.shapes
            if Inches(top_min) <= s.top < Inches(top_max) and s.width and s.height]
    body.sort(key=lambda s: s.width * s.height, reverse=True)
    roots = []  # (root shape, its members); shapes are not hashable
    for s in body:
        cx, cy = s.left + s.width // 2, s.top + s.height // 2
        for r, members in roots:
            if r.left <= cx <= r.left + r.width and r.top <= cy <= r.top + r.height:
                members.append(s)
                break
        else:
            roots.append((s, [s]))
    roots.sort(key=lambda rm: (round(rm[0].top / Inches(0.4)), rm[0].left))
    return [members for _, members in roots]


# ------------------------------------------------------------------- helpers
class Group:
    """Collects the shapes added inside a `with` block, for one animation step."""

    def __init__(self, slide):
        self.slide, self.shapes = slide, []

    def __enter__(self):
        self.start = len(self.slide.shapes)
        return self

    def __exit__(self, *exc):
        self.shapes = list(self.slide.shapes)[self.start:]


def rich(slide, x, y, w, h, parts, size, colour=BODY, align=None, anchor=None):
    """One paragraph of runs: (text, url) pairs, url None for plain text."""
    tb = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    if anchor is not None:
        tf.vertical_anchor = anchor
    p = tf.paragraphs[0]
    if align is not None:
        p.alignment = align
    for text, url in parts:
        run = p.add_run()
        run.text = text
        run.font.name = "Calibri"
        run.font.size = Pt(size)
        run.font.color.rgb = colour
        if url:
            run.hyperlink.address = url
            run.font.color.rgb = TEAL
            run.font.underline = True
    return tb


def pill(slide, x, y, w, h, text, fill, colour, size=11, border=None):
    s = B.shape(slide, MSO_SHAPE.ROUNDED_RECTANGLE, x, y, w, h, fill)
    s.adjustments[0] = 0.5
    if border is not None:
        s.line.color.rgb = border
        s.line.width = Pt(1.5)
    B.textbox(slide, x, y, w, h, [text], size, colour, bold=True, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)


def dot_line(slide, x, y, w, dot, text, colour, size=12.5):
    tb = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(0.3))
    tf = tb.text_frame
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    p = tf.paragraphs[0]
    r = p.add_run()
    r.text = "●  " if dot != "build" else "○  "
    r.font.size = Pt(size)
    r.font.color.rgb = DOT[dot] if dot != "build" else colour
    r2 = p.add_run()
    r2.text = text
    r2.font.name = "Calibri"
    r2.font.size = Pt(size)
    r2.font.color.rgb = colour


def eyebrow_frame(prs, eyebrow, title, standfirst, dark=False):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    if dark:
        B.shape(s, MSO_SHAPE.RECTANGLE, 0, 0, 13.333, 7.5, NAVY)
    else:
        B.shape(s, MSO_SHAPE.RECTANGLE, 0, 0, 13.33, 0.18, NAVY)
    B.textbox(s, 0.6, 0.32, 12.0, 0.3, [eyebrow], 11, AMBER if dark else TEAL, bold=True)
    B.textbox(s, 0.6, 0.6, 12.1, 0.6, [title], 28, WHITE if dark else NAVY, bold=True)
    B.textbox(s, 0.6, 1.2, 12.1, 0.4, [standfirst], 15, RGB(0xD5, 0xE0, 0xE8) if dark else BODY)
    B.textbox(s, 0.6, 7.05, 8.0, 0.3, [B.FOOTER + "  ·  status October 2026"], 10,
              RGB(0xD5, 0xE0, 0xE8) if dark else BODY)
    return s


def detail_row(s, x, y, w, h, title, parts, status, bg):
    B.shape(s, MSO_SHAPE.ROUNDED_RECTANGLE, x, y, w, h, bg)
    B.textbox(s, x + 0.2, y + 0.1, w - 2.3, 0.32, [title], 14.5, NAVY, bold=True)
    rich(s, x + 0.2, y + 0.44, w - 2.3, h - 0.5, parts, 11.5)
    fill, ink = STATUS[status]
    pill(s, x + w - 1.85, y + (h - 0.36) / 2, 1.65, 0.36, status, fill, ink, 11,
         border=NAVY if status == "we build it" else None)


# --------------------------------------------------------------------- slides
def title_slide(prs):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    B.shape(s, MSO_SHAPE.RECTANGLE, 0, 0, 6.6, 7.5, NAVY)
    pic = s.shapes.add_picture(B.deck_image(6, 3), Inches(6.7), Inches(0), Inches(6.633), Inches(7.5))
    pic.crop_bottom = 0.13
    pic.crop_left = pic.crop_right = 0.28
    B.shape(s, MSO_SHAPE.RECTANGLE, 6.6, 0, 0.1, 7.5, AMBER)
    groups = []
    for build in (
        lambda: B.textbox(s, 0.6, 1.05, 5.7, 0.35, ["REUNIÓN DE PREPARACIÓN"], 14, AMBER, bold=True),
        lambda: B.textbox(s, 0.6, 1.45, 5.7, 1.9, ["Espacio de Datos EJIE · País Vasco"], 40, WHITE, bold=True,
                          spacing=0.95),
        lambda: B.textbox(s, 0.6, 3.45, 5.7, 1.1, ["A connected health system for the Basque Country: what we "
                                                   "learned from Catena-X, and what it means for the EHDS"],
                          17, RGB(0xD5, 0xE0, 0xE8), spacing=1.05),
        lambda: B.textbox(s, 0.6, 4.75, 5.7, 0.4, ["Answers to your eight questions, and a pilot"], 17, AMBER,
                          bold=True),
        lambda: B.textbox(s, 0.6, 5.8, 5.7, 0.4, ["EJIE  ·  Gobierno Vasco  ·  October 2026"], 14,
                          RGB(0xD5, 0xE0, 0xE8)),
    ):
        with Group(s) as g:
            build()
        groups.append(g.shapes)
    B.notes(s, "[0:30] Good morning. Egun on. You sent us eight questions; I answer them in your order. "
               "I speak from Catena-X and from an EHDS demonstrator that runs live today.")
    animate(s, groups, auto=True)


def next_steps(prs):
    s = eyebrow_frame(prs, "WHAT COULD COME NEXT", "Suggested next steps",
                      "Small steps. Each one is useful on its own.", dark=True)
    steps = [("Choose use cases", "One or two, with a result you can measure."),
             ("Agree the roles", "The Health Data Office as access body, EJIE as operator."),
             ("Open working groups", "With the hospitals, on existing standards."),
             ("Build a pilot", "Tendered on standards and conformity tests.")]
    for i, (head, text) in enumerate(steps):
        x = 0.6 + i * 3.07
        B.shape(s, MSO_SHAPE.ROUNDED_RECTANGLE, x, 1.95, 2.85, 2.6, RGB(0x1C, 0x4D, 0x6E))
        B.textbox(s, x + 0.25, 2.1, 2.4, 0.7, [str(i + 1)], 36, AMBER, bold=True)
        B.textbox(s, x + 0.25, 2.9, 2.4, 0.7, [head], 17, WHITE, bold=True)
        B.textbox(s, x + 0.25, 3.55, 2.4, 0.9, [text], 13, RGB(0xD5, 0xE0, 0xE8), spacing=1.08)
    for i, (date, text) in enumerate([("March 2027", "Access bodies must be designated."),
                                      ("March 2029", "Secondary use applies in full.")]):
        x = 0.6 + i * 6.18
        b = B.shape(s, MSO_SHAPE.ROUNDED_RECTANGLE, x, 4.85, 5.95, 1.3, NAVY)
        b.line.color.rgb = AMBER
        b.line.width = Pt(1.5)
        B.textbox(s, x + 0.3, 4.98, 5.4, 0.55, [date], 26, AMBER, bold=True)
        B.textbox(s, x + 0.3, 5.6, 5.4, 0.4, [text], 15, WHITE)
    B.notes(s, "[0:45] Four small steps. The dates are fixed by the Regulation: access bodies by March 2027, "
               "secondary use in full by March 2029.")
    animate(s, card_groups(s, 1.9, 6.9), auto=True)


def pilot_overview(prs):
    s = eyebrow_frame(prs, "THE SUGGESTED PILOT  ·  A REGIONAL EHDS NODE",
                      "Euskadi pilot: start regional, connect upwards",
                      "Build one Basque node first. Then connect it to Spain, and through Spain to the EU.")
    stairs = [
        (0.89, 2.99, 2.52, ORANGE, NAVY, "STEP 1  ·  2027  ·  BUILD", "Euskadi pilot",
         [("prog", "Basque Health Data Office"), ("prog", "Data lake → FHIR and OMOP"),
          ("build", "One regional node"), ("open", "Secure processing environment"), ("build", "Two use cases")]),
        (4.82, 2.5, 3.01, SLATE, WHITE, "STEP 2  ·  2028  ·  ALIGN", "Connect to Spain",
         [("prog", "ENDS, the national data space"), ("open", "National access body"),
          ("open", "Ley de Salud Digital"), ("avail", "MyHealth@EU (primary use)")]),
        (8.75, 2.01, 3.5, INK, WHITE, "STEP 3  ·  MAR 2029  ·  REUSE", "Connect to the EU",
         [("prog", "HealthData@EU"), ("prog", "EHDS implementing acts (2027)"), ("prog", "EUDI Wallet and eIDAS 2")]),
    ]
    groups = []
    for k, (x, y, h, fill, ink, lab, head, items) in enumerate(stairs):
        if k:
            with Group(s) as g:
                px = stairs[k - 1][0] + 1.85
                c = s.shapes.add_connector(MSO_CONNECTOR.CURVE, Inches(px), Inches(stairs[k - 1][1] - 0.05),
                                           Inches(x - 0.05), Inches(y + 0.2))
                c.line.color.rgb = NAVY
                c.line.width = Pt(2.25)
                ln = c.line._get_or_add_ln()
                ln.append(etree.fromstring('<a:tailEnd xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" type="triangle" w="med" len="med"/>'))
                B.textbox(s, px - 0.95, stairs[k - 1][1] - 0.45, 1.8, 0.3, ["connect upwards"], 11, BODY)
                s.shapes[-1].text_frame.paragraphs[0].runs[0].font.italic = True
            groups.append(g.shapes)
        with Group(s) as g:
            B.shape(s, MSO_SHAPE.ROUNDED_RECTANGLE, x, y, 3.69, h, fill)
            B.textbox(s, x + 0.2, y + 0.18, 3.3, 0.3, [lab], 11, AMBER if fill == INK else ink, bold=True)
            B.textbox(s, x + 0.2, y + 0.48, 3.3, 0.4, [head], 18, ink, bold=True)
            for i, (dot, text) in enumerate(items):
                dot_line(s, x + 0.2, y + 1.0 + i * 0.29, 3.35, dot, text, ink)
        groups.append(g.shapes)
    with Group(s) as g:
        B.shape(s, MSO_SHAPE.ROUNDED_RECTANGLE, 0.6, 5.62, 12.13, 0.72, RGB(0xE9, 0xE3, 0xD8))
        B.textbox(s, 0.8, 5.7, 11.5, 0.28, ["FOUNDATION  ·  AVAILABLE TODAY  ·  REUSE FROM DAY ONE"], 11, NAVY, bold=True)
        for i, text in enumerate(["Eclipse EDC · Simpl-Open", "HealthData@EU code", "FHIR · OMOP · SNOMED CT",
                                  "Cl@ve · FNMT · ENS"]):
            dot_line(s, 0.8 + i * 2.95, 6.0, 2.9, "avail", text, NAVY, 12)
    groups.append(g.shapes)
    legend = rich(s, 6.4, 6.55, 6.33, 0.3, [("●", None), (" available    ", None), ("●", None),
                                            (" in progress    ", None), ("●", None), (" open decision    ", None),
                                            ("○", None), (" we build it", None)], 10, FAINT, align=PP_ALIGN.RIGHT)
    runs = legend.text_frame.paragraphs[0].runs
    for r, c in zip(runs[0::2], (S_AVAIL, S_PROG, S_OPEN, NAVY)):
        r.font.color.rgb = c
    B.notes(s, "[0:45, six clicks] Step 1 Euskadi pilot 2027 with Osakidetza and EJIE; connect upwards; "
               "Step 2 Spain 2028; connect upwards; Step 3 the EU, March 2029; and the foundation that is "
               "available today.")
    animate(s, groups, auto=False)


def pilot_step1(prs):
    s = eyebrow_frame(prs, "THE PILOT  ·  STEP 1 OF 3  ·  2027", "Step 1: build the Euskadi pilot",
                      "Build with Osakidetza and EJIE, under the Basque Health Data Office.")
    B.shape(s, MSO_SHAPE.ROUNDED_RECTANGLE, 0.6, 1.75, 12.13, 5.15, ORANGE)
    rows = [
        ("Basque Health Data Office: governance and requests",
         [("Announced in January 2025", "https://www.euskadi.eus/gobierno-vasco/-/noticia/2025/euskadi-dedicara-1-35-millones-fondos-europeos-creacion-del-espacio-nacional-datos-salud-consejo-gobierno-18-02-2025/"),
          (". A model: ", None),
          ("Aragón opened Spain's first regional office", "https://www.redaccionmedica.com/autonomias/20251008/aragon-primera-comunidad-autonoma-en-crear-la-oficina-del-dato-de-salud/250739_0.html"),
          (", October 2025.", None)], "in progress"),
        ("Osakidetza data lake → FHIR and OMOP",
         [("The data lake is Euskadi's part of the national ENDS: ", None),
          ("€1.35M of EU recovery funds", "https://www.euskadi.eus/gobierno-vasco/-/noticia/2025/euskadi-dedicara-1-35-millones-fondos-europeos-creacion-del-espacio-nacional-datos-salud-consejo-gobierno-18-02-2025/"),
          (", February 2025.", None)], "in progress"),
        ("One regional node: connector and metadata",
         [("An ", None), ("Eclipse EDC", "https://github.com/eclipse-edc"),
          (" connector and a HealthDCAT-AP catalogue, operated by ", None), ("EJIE", "https://www.ejie.eus/"),
          (".", None)], "we build it"),
        ("Secure processing environment: our own, or national?",
         [("A Basque environment, or the processing capacity of ", None),
          ("ENDS", "https://www.sanidad.gob.es/areas/saludDigital/espacioNacionalDS/home.htm"),
          (". Either way it must meet the ", None), ("ENS", "https://ens.ccn.cni.es/"), (".", None)], "open decision"),
        ("Two use cases: cohort discovery and a disease registry",
         [("For example the ", None),
          ("hospital cancer registries", "https://www.osakidetza.euskadi.eus/contenidos/informacion/osk_pro_dat_datatable/es_def/adjuntos/avisos/ci-REGISTROS-HOSPITALARIOS-DEL-CANCER_v1.pdf"),
          (" that Osakidetza already runs.", None)], "we build it"),
    ]
    groups = []
    for i, (title, parts, status) in enumerate(rows):
        with Group(s) as g:
            detail_row(s, 0.8, 1.9 + i * 0.98, 11.73, 0.85, title, parts, status, RGB(0xFF, 0xF6, 0xEA))
        groups.append(g.shapes)
    B.notes(s, "[0:45, five clicks] Office announced Jan 2025, Aragón as model; data lake funded as Euskadi's "
               "ENDS part; one node run by EJIE; own or national secure environment; two use cases.")
    animate(s, groups, auto=False)


def pilot_step2(prs):
    s = eyebrow_frame(prs, "THE PILOT  ·  STEP 2 OF 3  ·  2028", "Step 2: connect to Spain",
                      "Align with the Ministry of Health and the Ministry for Digital Transformation (MTDFP).")
    B.shape(s, MSO_SHAPE.ROUNDED_RECTANGLE, 0.6, 1.75, 12.13, 5.15, SLATE)
    rows = [
        ("ENDS, the National Health Data Space: the interface for regional nodes",
         [("Opened January 2026", "https://www.sanidad.gob.es/gabinete/notasPrensa.do?id=6837"),
          (": a network of regional platforms on common protocols, with €28M for the regions. ", None),
          ("ENDS home", "https://www.sanidad.gob.es/areas/saludDigital/espacioNacionalDS/home.htm")], "in progress"),
        ("The access body for Spain: one national, or regional ones with a coordinator?",
         [("It must be designated by 26 March 2027. The Regulation allows several bodies with one coordinator: ", None),
          ("Art. 55(1)", "https://eur-lex.europa.eu/eli/reg/2025/327/oj"), (".", None)], "open decision"),
        ("Ley de Salud Digital: the legal role of the regions",
         [("Still a draft (", None),
          ("public consultation", "https://www.sanidad.gob.es/normativa/docs/2025.09.22_CPP_CPP_APL_Salud_Digital1_.pdf"),
          (" from September 2025). It sets up the access bodies and national and regional catalogues.", None)],
         "open decision"),
        ("MyHealth@EU national contact point: HCDSNS and e-Receta",
         [("Primary use, already live: the Basque Country is ", None),
          ("connected since 2023", "https://www.lamoncloa.gob.es/serviciosdeprensa/notasprensa/sanidad14/Paginas/2023/180423-interoperabilidad-clinica-paises-ue.aspx"),
          (". The path upwards works. ", None),
          ("MyHealth@EU", "https://health.ec.europa.eu/ehealth-digital-health-and-care/electronic-cross-border-health-services_en")],
         "available"),
    ]
    groups = []
    for i, (title, parts, status) in enumerate(rows):
        with Group(s) as g:
            detail_row(s, 0.8, 1.92 + i * 1.22, 11.73, 1.08, title, parts, status, RGB(0xF1, 0xF3, 0xF5))
        groups.append(g.shapes)
    B.notes(s, "[0:45, four clicks] ENDS opened Jan 2026 as a network of regional platforms; access body by "
               "March 2027, one or several; the law is still a draft; MyHealth@EU live since 2023.")
    animate(s, groups, auto=False)


def pilot_step3(prs):
    s = eyebrow_frame(prs, "THE PILOT  ·  STEP 3 OF 3  ·  MARCH 2029",
                      "Step 3: connect to the EU, on a ready foundation",
                      "Reuse what the European Commission builds. Most of the foundation is available today.")
    B.shape(s, MSO_SHAPE.ROUNDED_RECTANGLE, 0.6, 1.75, 12.13, 2.75, INK)
    rows = [
        ("HealthData@EU: cross-border access for research",
         [("Connection due 26 March 2029, and 2031 for the remaining data categories. ", None),
          ("EHDS", "https://health.ec.europa.eu/ehealth-digital-health-and-care/european-health-data-space-regulation-ehds_en")]),
        ("EHDS implementing acts: catalogue, permits, quality label",
         [("Due earlier, by 26 March 2027: they shape what Step 1 builds. ", None),
          ("Regulation (EU) 2025/327", "https://eur-lex.europa.eu/eli/reg/2025/327/oj")]),
        ("EUDI Wallet and eIDAS 2: trust for citizens and users",
         [("Every Member State must offer a wallet by the end of 2026. ", None),
          ("European Digital Identity", "https://commission.europa.eu/strategy-and-policy/priorities-2019-2024/europe-fit-digital-age/european-digital-identity_en")]),
    ]
    groups = []
    for i, (title, parts) in enumerate(rows):
        with Group(s) as g:
            detail_row(s, 0.8, 1.88 + i * 0.86, 11.73, 0.76, title, parts, "in progress", RGB(0xF1, 0xF1, 0xEF))
        groups.append(g.shapes)
    with Group(s) as g:
        B.textbox(s, 0.6, 4.62, 12.0, 0.3, ["FOUNDATION  ·  AVAILABLE TODAY  ·  REUSE FROM DAY ONE"], 11, S_AVAIL,
                  bold=True)
    groups.append(g.shapes)
    found = [
        ("Eclipse EDC  ·  Simpl-Open", [("Open-source connector", "https://github.com/eclipse-edc"), ("; ", None),
                                        ("Simpl-Open", "https://simpl-programme.ec.europa.eu/"),
                                        (" release of July 2026.", None)]),
        ("HealthData@EU platform code", [("Open source ", None),
                                         ("on code.europa.eu", "https://code.europa.eu/healthdataeu/healthdataeu-eu-dataset-catalogue"),
                                         (" since May 2025.", None)]),
        ("FHIR  ·  OMOP  ·  SNOMED CT", [("FHIR R4", "https://hl7.org/fhir/R4/"), (", ", None),
                                         ("OMOP CDM", "https://ohdsi.github.io/CommonDataModel/"), (" and ", None),
                                         ("SNOMED CT", "https://www.snomed.org/"), (": mature, used worldwide.", None)]),
        ("Cl@ve  ·  FNMT  ·  ENS (CCN)", [("Cl@ve", "https://clave.gob.es/"), (" identity, ", None),
                                          ("FNMT", "https://www.fnmt.es/"), (" certificates, the ", None),
                                          ("ENS", "https://ens.ccn.cni.es/"), (" security scheme.", None)]),
    ]
    for i, (title, parts) in enumerate(found):
        x, y = 0.6 + (i % 2) * 6.13, 4.98 + (i // 2) * 0.98
        with Group(s) as g:
            B.shape(s, MSO_SHAPE.ROUNDED_RECTANGLE, x, y, 6.0, 0.86, WHITE)
            B.shape(s, MSO_SHAPE.RECTANGLE, x, y, 0.1, 0.86, S_AVAIL)
            B.textbox(s, x + 0.3, y + 0.08, 5.5, 0.3, [title], 13.5, NAVY, bold=True)
            rich(s, x + 0.3, y + 0.42, 5.5, 0.4, parts, 11.5)
        groups.append(g.shapes)
    B.notes(s, "[0:45, eight clicks] HealthData@EU 2029; implementing acts 2027; EUDI wallet end 2026; then the "
               "four foundation blocks.")
    animate(s, groups, auto=False)


def discussion(prs):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    B.shape(s, MSO_SHAPE.RECTANGLE, 0, 0, 13.33, 0.18, NAVY)
    B.textbox(s, 0.6, 0.45, 7.4, 0.3, ["LET'S DISCUSS"], 11, TEAL, bold=True)
    B.textbox(s, 0.6, 0.75, 7.4, 1.2, ["Three questions to start our discussion"], 30, NAVY, bold=True)
    groups = []
    with Group(s) as g:
        card = B.shape(s, MSO_SHAPE.ROUNDED_RECTANGLE, 8.35, 1.0, 4.4, 5.3, CREAM)
        card.line.color.rgb = RGB(0xE7, 0xE0, 0xD4)
        s.shapes.add_picture(str(QR), Inches(9.0), Inches(1.35), Inches(3.1), Inches(3.1))
        B.textbox(s, 8.35, 4.6, 4.4, 0.4, ["Matthias Buchhorn"], 20, NAVY, bold=True, align=PP_ALIGN.CENTER)
        B.textbox(s, 8.35, 5.05, 4.4, 0.3, ["Scan to continue on LinkedIn"], 13, BODY, align=PP_ALIGN.CENTER)
        rich(s, 8.35, 5.45, 4.4, 0.35, [("linkedin.com/in/mbuchhorn", "https://www.linkedin.com/in/mbuchhorn")], 14,
             align=PP_ALIGN.CENTER)
    groups.append(g.shapes)
    questions = [(TEAL, "Which one or two use cases would show value first?"),
                 (AMBER, "Who will set the rules, and who will run the services?"),
                 (NAVY, "Which hospitals would join the first working group?")]
    for i, (accent, q) in enumerate(questions):
        y = 2.2 + i * 1.12
        with Group(s) as g:
            B.shape(s, MSO_SHAPE.ROUNDED_RECTANGLE, 0.6, y, 7.4, 0.95, WHITE)
            B.shape(s, MSO_SHAPE.RECTANGLE, 0.6, y, 0.12, 0.95, accent)
            B.badge(s, 0.95, y + 0.2, 0.55, str(i + 1), accent)
            B.textbox(s, 1.75, y, 6.1, 0.95, [q], 17, NAVY, bold=True, anchor=MSO_ANCHOR.MIDDLE)
        groups.append(g.shapes)
    B.textbox(s, 0.6, 5.75, 7.4, 0.5, ["Eskerrik asko  ·  Gracias  ·  Thank you"], 22, NAVY, bold=True)
    rich(s, 0.6, 6.3, 7.4, 0.35, [("Live demonstration: ", None), ("ehds.mabu.red", "https://ehds.mabu.red")], 14)
    B.textbox(s, 0.6, 7.05, 8.0, 0.3, [B.FOOTER], 10, BODY)
    B.notes(s, "[0:15, then discussion] Scan the code for LinkedIn. Three questions, one per click. Offer the live "
               "demo if there is time.")
    # The QR card is there from the start; the three questions come one click at a time.
    animate(s, groups[1:], auto=False)


def main() -> int:
    for path in (B.LONG_DECK, B.LAYERS, QR):
        if not path.exists():
            print(f"missing {path}")
            return 1
    prs = Presentation()
    prs.slide_width, prs.slide_height = Inches(13.333), Inches(7.5)
    prs.core_properties.title = "Reunión preparación Espacio Datos EJIE País Vasco"
    prs.core_properties.subject = "European Health Data Space: eight answers and the Euskadi pilot"
    prs.core_properties.author = "Matthias Buchhorn"
    title_slide(prs)
    # Slides 2 to 10 are the Basque deck's own; they build themselves card by card.
    for fn in (B.overview_slide, B.q1, B.q2, B.q3, B.q4, B.q5, B.q6, B.q7, B.q8):
        fn(prs)
        slide = prs.slides[-1]
        animate(slide, card_groups(slide, 1.9 if fn is not B.overview_slide else 1.7), auto=True)
    next_steps(prs)
    pilot_overview(prs)
    pilot_step1(prs)
    pilot_step2(prs)
    pilot_step3(prs)
    discussion(prs)
    prs.save(str(OUT))
    check = Presentation(str(OUT))
    animated = sum(1 for sl in check.slides if sl._element.find(qn("p:timing")) is not None)
    print(f"{OUT.name}: {len(check.slides)} slides, {animated} animated, {OUT.stat().st_size // 1024} KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
