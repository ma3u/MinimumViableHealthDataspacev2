#!/usr/bin/env python3
"""Validate HealthDCAT-AP JSON-LD with the official Release 8 SHACL (#700).

The shapes are the European Commission's, vendored unchanged under
scripts/healthdcat-ap/release-8/ (see the README there for the source and
checksums). A non-public health dataset, which is what the hub serves, is
checked against:

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

    python3 scripts/healthdcat-ap/validate.py services/neo4j-proxy/__tests__/fixtures/healthdcat-ap-r8.jsonld
    python3 scripts/healthdcat-ap/validate.py http://localhost:9090/catalog/datasets
    python3 scripts/healthdcat-ap/validate.py <file> --recommended   # list the warnings too

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
from rdflib import Graph, Namespace

HERE = os.path.dirname(os.path.abspath(__file__))
RELEASE = os.path.join(HERE, "release-8")
SH = Namespace("http://www.w3.org/ns/shacl#")

SHAPES = ["non-public-shapes.ttl", "range.ttl", "mdr-vocabularies.shape.ttl"]
RECOMMENDED = ["non-public-shapes_recommended.ttl"]


def checked(name):
    """The path of a vendored file, after its checksum matched the README."""
    path = os.path.join(RELEASE, name)
    with open(os.path.join(RELEASE, "SHA256SUMS"), encoding="utf-8") as f:
        sums = dict(line.split()[::-1] for line in f if line.strip())
    with open(path, "rb") as f:
        digest = hashlib.sha256(f.read()).hexdigest()
    if sums.get(name) != digest:
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
    json.loads(text)  # a clear error for something that is not JSON at all
    return Graph().parse(data=text, format="json-ld")


def report(results, label):
    rows = results.query(
        """PREFIX sh: <http://www.w3.org/ns/shacl#>
        SELECT ?sev ?path ?msg (COUNT(*) AS ?n) WHERE {
          ?r a sh:ValidationResult ; sh:resultSeverity ?sev .
          OPTIONAL { ?r sh:resultPath ?path } OPTIONAL { ?r sh:resultMessage ?msg }
        } GROUP BY ?sev ?path ?msg ORDER BY DESC(?n)"""
    )
    for r in rows:
        sev = str(r.sev).rsplit("#", 1)[-1]
        path = str(r.path).rsplit("/", 1)[-1] if r.path else "-"
        print(f"  {label} {int(r.n):4d} {sev:9s} {path:30s} {str(r.msg or '')[:100]}")


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("source", help="a JSON-LD file or URL")
    ap.add_argument("--recommended", action="store_true", help="also list the recommended-property warnings")
    args = ap.parse_args()

    data = load(args.source)
    triples = len(data)
    data.parse(checked("vocabularies.ttl"), format="turtle")
    shapes = Graph()
    for name in SHAPES:
        shapes.parse(checked(name), format="turtle")
    fixed = repair(shapes)

    conforms, results, _ = validate(data, shacl_graph=shapes, inference="none", allow_warnings=True)
    print(f"HealthDCAT-AP Release 8, non-public: {triples} triples, "
          f"{'conforms' if conforms else 'DOES NOT CONFORM'} (shape repairs: {fixed})")
    report(results, "required")

    if args.recommended:
        rec = Graph()
        for name in RECOMMENDED:
            rec.parse(checked(name), format="turtle")
        _, rec_results, _ = validate(data, shacl_graph=rec, inference="none", allow_warnings=True)
        report(rec_results, "recommended")
    return 0 if conforms else 1


if __name__ == "__main__":
    sys.exit(main())
