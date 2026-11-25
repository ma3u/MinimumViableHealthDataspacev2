"""Terminology nodes are merged on their constrained key (#1215).

neo4j/init-schema.cypher makes SnomedConcept.conceptId, LoincCode.loincNumber
and RxNormConcept.rxcui unique. A MERGE on any other property (`code`, as the
loader and seed-study-results.cypher once did) is never seen by the
constraint, so the same concept can exist twice. These tests fail when:

- a Cypher statement of scripts/load_fhir_neo4j.py links a terminology node
  by anything but its key, or drops `code`, which readers still show;
- any seed, generator or route MERGEs a terminology node on another property;
- neo4j/seed.sh stops running neo4j/migrate-terminology-keys.cypher after the
  seeds that write terminology nodes, or stops failing when one lacks its key.

Pure text checks, no Neo4j. The migration itself runs against a real Neo4j in
ui/__tests__/unit/lib/migrate-terminology-keys.neo4j.test.ts.

    python3 -m unittest scripts/test_load_fhir_neo4j.py -v
"""

from __future__ import annotations

import importlib.util
import re
import sys
import types
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# The constrained key of each terminology label (neo4j/init-schema.cypher).
KEYS = {
    "SnomedConcept": "conceptId",
    "LoincCode": "loincNumber",
    "RxNormConcept": "rxcui",
}


def load_loader():
    """scripts/load_fhir_neo4j.py, with a stand-in for the neo4j driver."""
    if "neo4j" not in sys.modules:
        stub = types.ModuleType("neo4j")
        stub.GraphDatabase = object  # never called: the tests only read Cypher
        sys.modules["neo4j"] = stub
    spec = importlib.util.spec_from_file_location(
        "load_fhir_neo4j", ROOT / "scripts" / "load_fhir_neo4j.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


# `MERGE (x:Label {prop:` in Cypher, and `{{prop:` in a Python f-string.
MERGE_ON = re.compile(
    r"MERGE\s*\(\s*\w*\s*:\s*(SnomedConcept|LoincCode|RxNormConcept)\s*\{\{?\s*(\w+)\s*:"
)
# The same with the label and the property from a template (store.ts).
TEMPLATE_MERGE = re.compile(r"MERGE\s*\(\s*\w*\s*:\s*\$\{label\}\s*\{\$\{key\}\s*:")


def merges_in(text: str) -> list[tuple[str, str]]:
    return MERGE_ON.findall(text)


class LoaderCypher(unittest.TestCase):
    loader = load_loader()
    LINKS = {
        "LINK_CONDITIONS_SNOMED": "SnomedConcept",
        "LINK_OBSERVATIONS_LOINC": "LoincCode",
        "LINK_MEDICATIONS_RXNORM": "RxNormConcept",
        "LINK_PROCEDURES_SNOMED": "SnomedConcept",
    }

    def test_every_link_merges_on_the_constrained_key(self):
        for name, label in self.LINKS.items():
            with self.subTest(statement=name):
                cypher = getattr(self.loader, name)
                self.assertEqual(merges_in(cypher), [(label, KEYS[label])])

    def test_every_link_keeps_code_for_its_readers(self):
        for name, label in self.LINKS.items():
            with self.subTest(statement=name):
                cypher = getattr(self.loader, name)
                self.assertRegex(cypher, r"ON CREATE SET \w+\.code = row\.code")

    def test_snomed_and_rxnorm_keys_are_strings(self):
        # #1231: a uniqueness constraint treats 415749005 and "415749005" as
        # two values. Every key is a string, so the loader matches and merges
        # on toString(row.code) and never on an integer.
        for name in ("LINK_CONDITIONS_SNOMED", "LINK_PROCEDURES_SNOMED", "LINK_MEDICATIONS_RXNORM"):
            with self.subTest(statement=name):
                cypher = getattr(self.loader, name)
                self.assertNotIn("toInteger", cypher)
                self.assertRegex(cypher, r"WHERE known\.(conceptId|rxcui) = toString\(row\.code\)")
                self.assertRegex(cypher, r"MERGE \(\w+:(SnomedConcept|RxNormConcept) \{(conceptId|rxcui): toString\(row\.code\)\}\)")

    def test_parse_bundle_hands_the_links_the_code(self):
        import json
        import tempfile

        coding = lambda system, code: {"coding": [{"system": system, "code": code, "display": code}]}  # noqa: E731
        bundle = {
            "resourceType": "Bundle",
            "entry": [
                {"resource": {"resourceType": "Patient", "id": "p-1215"}},
                {"resource": {"resourceType": "Condition", "id": "c", "code": coding("http://snomed.info/sct", "44054006")}},
                {"resource": {"resourceType": "Observation", "id": "o", "code": coding("http://loinc.org", "4548-4"),
                              "valueQuantity": {"value": 6.1, "unit": "%"}}},
                {"resource": {"resourceType": "MedicationRequest", "id": "m",
                              "medicationCodeableConcept": coding("http://www.nlm.nih.gov/research/umls/rxnorm", "860975")}},
                {"resource": {"resourceType": "Procedure", "id": "pr", "code": coding("http://snomed.info/sct", "73761001")}},
            ],
        }
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
            json.dump(bundle, f)
        try:
            data = self.loader.parse_bundle(f.name, "")
        finally:
            Path(f.name).unlink()
        self.assertEqual(
            {k: [r["code"] for r in data[k]] for k in ("snomed_rows", "loinc_rows", "rxnorm_rows", "proc_snomed_rows")},
            {"snomed_rows": ["44054006"], "loinc_rows": ["4548-4"], "rxnorm_rows": ["860975"], "proc_snomed_rows": ["73761001"]},
        )


class EveryMergeOnTheKey(unittest.TestCase):
    """No file in the repository MERGEs a terminology node on another property."""

    SOURCES = [
        *sorted((ROOT / "neo4j").glob("*.cypher")),
        *sorted((ROOT / "scripts").glob("*.py")),
        *sorted((ROOT / "scripts").glob("*.cypher")),
        *sorted((ROOT / "ui" / "src").rglob("*.ts")),
        *sorted((ROOT / "services" / "neo4j-proxy" / "src").rglob("*.ts")),
    ]

    def test_the_scan_finds_the_known_merges(self):
        found = sum(len(merges_in(p.read_text(encoding="utf-8"))) for p in self.SOURCES)
        # The loader's four, the seeds', the generators' and the backfill's.
        self.assertGreater(found, 20)

    def test_every_terminology_merge_uses_the_constrained_key(self):
        wrong = []
        for path in self.SOURCES:
            if path.name == Path(__file__).name:
                continue
            for label, prop in merges_in(path.read_text(encoding="utf-8")):
                if prop != KEYS[label]:
                    wrong.append(f"{path.relative_to(ROOT)}: MERGE (:{label} {{{prop}: ...}})")
        self.assertEqual(wrong, [], "merge on the key init-schema.cypher constrains (#1215)")

    def test_the_document_import_merges_on_the_key_it_is_given(self):
        store = (ROOT / "ui" / "src" / "lib" / "fhir-documents" / "store.ts").read_text(encoding="utf-8")
        self.assertRegex(store, TEMPLATE_MERGE)
        for label, key in KEYS.items():
            self.assertIn(f'CODED_BY("{label}", "{key}", "code")', store)

    def test_the_keys_are_the_constrained_ones(self):
        schema = (ROOT / "neo4j" / "init-schema.cypher").read_text(encoding="utf-8")
        for label, key in KEYS.items():
            self.assertRegex(
                schema,
                rf"FOR \(\w+:{label}\) REQUIRE \w+\.{key} IS UNIQUE",
            )


class SeedRunsTheMigration(unittest.TestCase):
    seed = (ROOT / "neo4j" / "seed.sh").read_text(encoding="utf-8")
    MIGRATION = 'run_file "$SEED_DIR"/migrate-terminology-keys.cypher'
    # Every seed.sh file that writes terminology nodes; the migration runs after them.
    WRITERS = [
        "insert-synthetic-schema-data.cypher",
        "seed-persona-overview.cypher",
        "seed-study-results.cypher",
        "backfill-coded-by.cypher",
        "issue-19-demo-seed.cypher",
        "migrate-snomed-condition-codes.cypher",
    ]

    def phases(self) -> dict[str, str]:
        demo = self.seed.split('if [ "${SEED_PHASE:-}" = "demo-only" ]; then', 1)[1].split("\nfi\n", 1)[0]
        # The full pipeline starts where the fast paths have exited.
        full = self.seed.split('\nrun_file "$SEED_DIR"/init-schema.cypher "schema"\n', 1)[1]
        return {"demo-only": demo, "full": full}

    def test_the_migration_file_exists(self):
        self.assertTrue((ROOT / "neo4j" / "migrate-terminology-keys.cypher").is_file())

    def test_both_phases_run_it_after_every_writer_and_check_the_keys(self):
        for phase, body in self.phases().items():
            with self.subTest(phase=phase):
                self.assertIn(self.MIGRATION, body)
                at = body.index(self.MIGRATION)
                for writer in self.WRITERS:
                    if writer in body:
                        self.assertLess(body.index(writer), at, f"{writer} runs after the migration")
                self.assertIn("check_terminology_keys", body[at:])

    def test_a_node_without_its_key_fails_the_run(self):
        check = self.seed.split("check_terminology_keys() {", 1)[1].split("\n}\n", 1)[0]
        for label, key in KEYS.items():
            self.assertIn(f"MATCH (n:{label}) WHERE n.{key} IS NULL", check)
        self.assertIn('failed+=("terminology nodes without their key', check)


class MigrationCypher(unittest.TestCase):
    text = (ROOT / "neo4j" / "migrate-terminology-keys.cypher").read_text(encoding="utf-8")

    def test_it_keys_every_label_and_reports_what_is_left(self):
        for label, key in KEYS.items():
            with self.subTest(label=label):
                self.assertIn(f"MATCH (n:{label})\nWHERE n.{key} IS NULL AND n.code IS NOT NULL", self.text)
                self.assertIn(f"SET node.{key} = coalesce(node.{key}, code)", self.text)
        self.assertIn("AS unkeyedTerminologyNodes", self.text)

    def test_it_moves_relationships_without_doubling_them(self):
        self.assertEqual(self.text.count("mergeRels: true"), 3)
        self.assertNotRegex(self.text, r"\bCREATE\b")


if __name__ == "__main__":
    unittest.main()
