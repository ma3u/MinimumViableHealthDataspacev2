#!/usr/bin/env python3
"""Snapshot the class hierarchy the HealthData@EU validator loads (#700).

The official validator imports the ontologies listed in its
imports/imports.ttl (DCAT 2, Dublin Core, FOAF, PROV, vCard, ...) into the
data graph. Their rdfs:subClassOf triples decide what a shape targets: DCAT 2
says dcat:Catalog is a dcat:Dataset, so every Dataset shape also applies to
the catalogue. validate.py loads this snapshot rather than a dozen web hosts.

    python3 scripts/healthdcat-ap/snapshot-imports.py

Reads release-8/imports.ttl, writes release-8/imports-hierarchy.ttl (only
subClassOf triples between IRIs). Update SHA256SUMS afterwards.
"""
import os
import sys
import urllib.request

from rdflib import OWL, RDFS, Graph, URIRef

HERE = os.path.dirname(os.path.abspath(__file__))
RELEASE = os.path.join(HERE, "release-8")

# Where an imported IRI does not answer, the copy used instead (2026-10-27).
MIRRORS = {
    "http://www.w3.org/ns/adms.ttl": "https://raw.githubusercontent.com/SEMICeu/ADMS/master/releases/2.00/voc/adms.ttl",
}


def fetch(iri):
    url = MIRRORS.get(iri, iri)
    req = urllib.request.Request(
        url,
        # dublincore.org answers 403 to a client without a browser-like agent
        headers={"Accept": "text/turtle, application/rdf+xml;q=0.9", "User-Agent": "Mozilla/5.0 (rdf-snapshot)"},
    )
    with urllib.request.urlopen(req, timeout=60) as r:  # noqa: S310 (IRIs from the vendored imports.ttl)
        data = r.read()
    return Graph().parse(data=data, format="xml" if url.endswith((".rdf", ".xml")) else "turtle")


def main():
    imports = Graph().parse(os.path.join(RELEASE, "imports.ttl"), format="turtle")
    out = Graph()
    out.bind("rdfs", RDFS)
    missing = []
    for iri in sorted(str(o) for o in imports.objects(None, OWL.imports)):
        try:
            g = fetch(iri)
        except Exception as e:  # noqa: BLE001 (report every host that fails, then go on)
            print(f"  unreachable {iri}: {e}")
            missing.append(iri)
            continue
        n = 0
        for s, o in g.subject_objects(RDFS.subClassOf):
            if isinstance(s, URIRef) and isinstance(o, URIRef) and s != o:
                out.add((s, RDFS.subClassOf, o))
                n += 1
        print(f"{n:5d} {iri}")
    out.serialize(os.path.join(RELEASE, "imports-hierarchy.ttl"), format="turtle")
    print(f"{len(out)} triples; unreachable: {len(missing)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
