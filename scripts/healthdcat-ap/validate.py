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
shapes target what they target there. One consequence is upstream's, not the
hub's: DCAT 2 makes dcat:Catalog a dcat:Dataset, so the Dataset shapes also
judge the catalogue (hdab, healthCategory, provenance, ...). Those violations
are listed, named as that issue, and do not fail the run; --strict counts them.

    python3 scripts/healthdcat-ap/validate.py services/neo4j-proxy/__tests__/fixtures/healthdcat-ap-r8.jsonld
    python3 scripts/healthdcat-ap/validate.py http://localhost:9090/catalog/datasets
    python3 scripts/healthdcat-ap/validate.py <file> --recommended   # list the warnings too
    python3 scripts/healthdcat-ap/validate.py <file> --strict        # count the catalogue's too
    python3 scripts/healthdcat-ap/validate.py a.ttl --same-as a.jsonld  # also: the same graph?

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
from rdflib import RDF, Graph, Namespace
from rdflib.compare import isomorphic

HERE = os.path.dirname(os.path.abspath(__file__))
RELEASE = os.path.join(HERE, "release-8")
SH = Namespace("http://www.w3.org/ns/shacl#")
DCAT = Namespace("http://www.w3.org/ns/dcat#")
UPSTREAM = "https://code.europa.eu/healthdataeu/healthdcat-ap/-/issues"

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


def violations(results, catalogues):
    """Top-level violations: (on a dcat:Catalog, elsewhere). Nested sh:detail results are not counted."""
    on_catalogue = elsewhere = 0
    for report in results.subjects(RDF.type, SH.ValidationReport):
        for r in results.objects(report, SH.result):
            if results.value(r, SH.resultSeverity) == SH.Violation:
                if results.value(r, SH.focusNode) in catalogues:
                    on_catalogue += 1
                else:
                    elsewhere += 1
    return on_catalogue, elsewhere


def verdict(results, catalogues, strict):
    on_catalogue, elsewhere = violations(results, catalogues)
    ok = elsewhere == 0 and (on_catalogue == 0 or not strict)
    note = ""
    if on_catalogue:
        note = (f"; {on_catalogue} on the catalogue from the Dataset shapes (dcat:Catalog is a dcat:Dataset "
                f"in DCAT 2), the upstream issue, {'counted' if strict else 'not counted'}")
    return ok, f"{'conforms' if ok else 'DOES NOT CONFORM'} ({elsewhere} violation{'' if elsewhere == 1 else 's'}{note})"


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("source", help="a JSON-LD file or URL")
    ap.add_argument("--recommended", action="store_true", help="also list the recommended-property warnings")
    ap.add_argument("--strict", action="store_true", help="also fail on the catalogue's violations from the Dataset shapes")
    ap.add_argument("--same-as", metavar="OTHER", help="also fail unless OTHER holds the same graph (e.g. the Turtle of a JSON-LD)")
    args = ap.parse_args()

    data = load(args.source)
    if args.same_as:
        same = isomorphic(data, load(args.same_as))
        print(f"0. Same graph as {args.same_as}: {'yes' if same else 'NO'}")
        if not same:
            return 1
    triples = len(data)
    catalogues = set(data.subjects(RDF.type, DCAT.Catalog))
    data.parse(checked("vocabularies.ttl"), format="turtle")
    data.parse(checked(IMPORTS), format="turtle")

    base = Graph().parse(checked(DCAT_AP), format="turtle")
    _, base_results, _ = validate(data, shacl_graph=base, inference="none", allow_warnings=True)
    base_ok, text = verdict(base_results, catalogues, args.strict)
    print(f"1. DCAT-AP 3.0.1: {triples} triples, {text}")
    report(base_results, "dcat-ap ")

    shapes = Graph()
    for name in SHAPES:
        shapes.parse(checked(name), format="turtle")
    fixed = repair(shapes)
    _, results, _ = validate(data, shacl_graph=shapes, inference="none", allow_warnings=True)
    conforms, text = verdict(results, catalogues, args.strict)
    print(f"2. HealthDCAT-AP Release 8, non-public: {text}; shape repairs: {fixed}")
    report(results, "required")
    conforms = conforms and base_ok

    if args.recommended:
        rec = Graph()
        for name in RECOMMENDED:
            rec.parse(checked(name), format="turtle")
        _, rec_results, _ = validate(data, shacl_graph=rec, inference="none", allow_warnings=True)
        report(rec_results, "recommended")
    if not args.strict and violations(results, catalogues)[0]:
        print(f"   The catalogue's violations are an upstream question, not the hub's: {UPSTREAM}")
    return 0 if conforms else 1


if __name__ == "__main__":
    sys.exit(main())
