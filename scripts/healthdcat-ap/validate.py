#!/usr/bin/env python3
"""Validate HealthDCAT-AP JSON-LD with the official Release 8 SHACL (#700).

Two stages, as the Release 8 specification describes: first DCAT-AP 3.0.1,
the profile HealthDCAT-AP extends (scripts/healthdcat-ap/dcat-ap-3.0.1/), then
the health constraints. The shapes are the publishers', vendored unchanged
(see the README in each folder for the source and checksums). A non-public
health dataset, which is what the hub serves, is checked in the second stage
against:

  non-public-shapes.ttl        what must be there, cardinalities, literal kinds
  range.ttl                    the class of every object
  mdr-vocabularies.shape.ttl   values from the EU controlled vocabularies,
                               with vocabularies.ttl, a snapshot of them
  non-public-shapes_recommended.ttl   the recommended properties, as warnings

One repair is made in memory, and reported: in non-public-shapes.ttl the rule
"if healthdcatap:hasStructuredData is true there must be a
healthdcatap:hasVariables" is an sh:or placed in an sh:property without
sh:path, which SHACL processors refuse as malformed. It is moved to the node
shape it belongs to; the constraint itself is unchanged. (Reported upstream.)

The data graph also gets imports-hierarchy.ttl, the rdfs:subClassOf triples of
the ontologies the HealthData@EU validator imports (snapshot-imports.py), so
shapes target what they target there, with one workaround, made in memory
and reported: DCAT 2 makes dcat:Catalog a subclass of dcat:Dataset, so every
Dataset shape would also judge the catalogue (hdab, healthCategory,
provenance, ...). The HealthDCAT-AP team confirmed this as upstream
(w3c/dx-dcat#136), will work around it in Release 9 and advised validators to
drop that triple until then (#884). --as-published keeps it, to see what the
published validator reports today.

    python3 scripts/healthdcat-ap/validate.py services/neo4j-proxy/__tests__/fixtures/healthdcat-ap-r8.jsonld
    python3 scripts/healthdcat-ap/validate.py http://localhost:9090/catalog/datasets
    python3 scripts/healthdcat-ap/validate.py <file> --recommended   # list the warnings too
    python3 scripts/healthdcat-ap/validate.py <file> --as-published  # without the workaround
    python3 scripts/healthdcat-ap/validate.py a.ttl --same-as a.jsonld  # also: the same graph?

A catalogue that is not health data (#934: AlphaKasse's bonus programme, a
dcat:DataService in the insurance and wellbeing data space) is checked against
DCAT-AP 3.0.1 alone; HealthDCAT-AP stays for health datasets (#719):

    python3 scripts/healthdcat-ap/validate.py ui/src/content/catalogues/alphakasse-dcat-ap.json --dcat-ap

DCAT-AP 3.0.1's own shapes need one repair too, made in memory and reported:
the DataService shape names two sh:property shapes the file never defines, so
any data with a dcat:DataService stops the processor (SEMICeu/DCAT-AP#448,
open, fixed in the drafts). The two references are dropped.

A source ending in .ttl is read as Turtle, anything else as JSON-LD.

Exit 0 when the data conforms (warnings allowed), 1 on any violation, 2 when
a vendored file does not match its recorded checksum.
"""
import argparse
import hashlib
import json
import os
import sys
import urllib.request

from pyshacl import validate
from rdflib import RDF, RDFS, Graph, Namespace
from rdflib.compare import isomorphic

HERE = os.path.dirname(os.path.abspath(__file__))
RELEASE = os.path.join(HERE, "release-8")
SH = Namespace("http://www.w3.org/ns/shacl#")
DCAT = Namespace("http://www.w3.org/ns/dcat#")
# Dropped from the imported hierarchy until HealthDCAT-AP Release 9 ships its own workaround (#884).
WORKAROUNDS = [(DCAT.Catalog, RDFS.subClassOf, DCAT.Dataset)]

DCAT_AP = "../dcat-ap-3.0.1/dcat-ap-SHACL.ttl"
SHAPES = ["non-public-shapes.ttl", "range.ttl", "mdr-vocabularies.shape.ttl"]
RECOMMENDED = ["non-public-shapes_recommended.ttl"]
IMPORTS = "imports-hierarchy.ttl"


def checked(name):
    """The path of a vendored file, after its checksum matched the README."""
    path = os.path.normpath(os.path.join(RELEASE, name))
    folder, base = os.path.split(path)
    with open(os.path.join(folder, "SHA256SUMS"), encoding="utf-8") as f:
        sums = dict(line.split()[::-1] for line in f if line.strip())
    with open(path, "rb") as f:
        digest = hashlib.sha256(f.read()).hexdigest()
    if sums.get(base) != digest:
        print(f"{name}: checksum {digest} is not the recorded one", file=sys.stderr)
        sys.exit(2)
    return path


def repair(shapes):
    """Move an sh:or that sits in a path-less sh:property onto its node shape."""
    fixed = 0
    for node, prop in list(shapes.subject_objects(SH.property)):
        if (prop, SH.path, None) not in shapes and (prop, SH["or"], None) in shapes:
            for alternatives in shapes.objects(prop, SH["or"]):
                shapes.add((node, SH["or"], alternatives))
            shapes.remove((node, SH.property, prop))
            fixed += 1
    return fixed


def drop_undefined(shapes):
    """Drop sh:property references to shapes the file never defines (SEMICeu/DCAT-AP#448)."""
    dropped = 0
    for node, prop in list(shapes.subject_objects(SH.property)):
        if (prop, None, None) not in shapes:
            shapes.remove((node, SH.property, prop))
            dropped += 1
    return dropped


def load(source):
    if source.startswith("http://") or source.startswith("https://"):
        with urllib.request.urlopen(source, timeout=60) as r:  # noqa: S310 (a URL the caller names)
            text = r.read().decode("utf-8")
    else:
        with open(source, encoding="utf-8") as f:
            text = f.read()
    if source.endswith(".ttl"):
        return Graph().parse(data=text, format="turtle")
    json.loads(text)  # a clear error for something that is not JSON at all
    return Graph().parse(data=text, format="json-ld")


def report(results, label):
    rows = results.query(
        """PREFIX sh: <http://www.w3.org/ns/shacl#>
        SELECT ?sev ?path ?msg (COUNT(*) AS ?n) WHERE {
          ?report sh:result ?r . ?r sh:resultSeverity ?sev .
          OPTIONAL { ?r sh:resultPath ?path } OPTIONAL { ?r sh:resultMessage ?msg }
        } GROUP BY ?sev ?path ?msg ORDER BY DESC(?n)"""
    )
    for r in rows:
        sev = str(r.sev).rsplit("#", 1)[-1]
        path = str(r.path).rsplit("/", 1)[-1] if r.path else "-"
        print(f"  {label} {int(r.n):4d} {sev:9s} {path:30s} {str(r.msg or '')[:100]}")


def verdict(results):
    """Top-level violations only; nested sh:detail results are not counted."""
    n = sum(
        1
        for report in results.subjects(RDF.type, SH.ValidationReport)
        for r in results.objects(report, SH.result)
        if results.value(r, SH.resultSeverity) == SH.Violation
    )
    return n == 0, f"{'conforms' if n == 0 else 'DOES NOT CONFORM'} ({n} violation{'' if n == 1 else 's'})"


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("source", help="a JSON-LD file or URL")
    ap.add_argument("--recommended", action="store_true", help="also list the recommended-property warnings")
    ap.add_argument("--as-published", action="store_true", help="keep dcat:Catalog rdfs:subClassOf dcat:Dataset (no workaround)")
    ap.add_argument("--dcat-ap", action="store_true", help="DCAT-AP 3.0.1 only, for a catalogue that is not health data (#934)")
    ap.add_argument("--same-as", metavar="OTHER", help="also fail unless OTHER holds the same graph (e.g. the Turtle of a JSON-LD)")
    args = ap.parse_args()

    data = load(args.source)
    if args.same_as:
        same = isomorphic(data, load(args.same_as))
        print(f"0. Same graph as {args.same_as}: {'yes' if same else 'NO'}")
        if not same:
            return 1
    triples = len(data)
    data.parse(checked("vocabularies.ttl"), format="turtle")
    data.parse(checked(IMPORTS), format="turtle")
    dropped = 0
    if not args.as_published:
        for triple in WORKAROUNDS:
            if triple in data:
                data.remove(triple)
                dropped += 1

    base = Graph().parse(checked(DCAT_AP), format="turtle")
    undefined = drop_undefined(base)
    _, base_results, _ = validate(data, shacl_graph=base, inference="none", allow_warnings=True)
    base_ok, text = verdict(base_results)
    print(f"1. DCAT-AP 3.0.1: {triples} triples, {text}; hierarchy workarounds: {dropped}; undefined shapes dropped: {undefined}")
    report(base_results, "dcat-ap ")
    if args.dcat_ap:
        return 0 if base_ok else 1

    shapes = Graph()
    for name in SHAPES:
        shapes.parse(checked(name), format="turtle")
    fixed = repair(shapes)
    _, results, _ = validate(data, shacl_graph=shapes, inference="none", allow_warnings=True)
    conforms, text = verdict(results)
    print(f"2. HealthDCAT-AP Release 8, non-public: {text}; shape repairs: {fixed}")
    report(results, "required")
    conforms = conforms and base_ok

    if args.recommended:
        rec = Graph()
        for name in RECOMMENDED:
            rec.parse(checked(name), format="turtle")
        _, rec_results, _ = validate(data, shacl_graph=rec, inference="none", allow_warnings=True)
        report(rec_results, "recommended")
    return 0 if conforms else 1


if __name__ == "__main__":
    sys.exit(main())
