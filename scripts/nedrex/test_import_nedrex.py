"""The NeDRex importer's matching and the seed it writes (#1167).

The fixture dump below is invented (mondo.90000xx, fictional names); it has
the columns and the JSON list cells of the real CSV export, so the tests run
without the download. The last class checks the committed seed and its wiring.

    python3 -m unittest discover -s scripts/nedrex -p "test_*.py" -v
"""

from __future__ import annotations

import csv
import gzip
import importlib.util
import json
import re
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]

_spec = importlib.util.spec_from_file_location("import_nedrex", HERE / "import_nedrex.py")
nx = importlib.util.module_from_spec(_spec)
assert _spec.loader is not None
# Registered before it runs: on Python 3.12 a @dataclass looks its module up
# in sys.modules, and CI runs 3.12.
sys.modules[_spec.name] = nx
_spec.loader.exec_module(nx)


def _write(dump: Path, name: str, header: list[str], rows: list[dict]) -> None:
    with gzip.open(dump / name, "wt", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=header)
        w.writeheader()
        for r in rows:
            w.writerow({k: json.dumps(v) if isinstance(v, (list, dict)) else v for k, v in r.items()})


def disorder(mid: str, name: str, snomed: list[str] = (), icd10: list[str] = ()) -> dict:
    return {
        "primaryDomainId": mid,
        "displayName": name,
        "description": f"{name}, a test disorder; it's 'quoted'",
        "domainIds": [mid] + [f"snomedct.{s}" for s in snomed],
        "icd10": list(icd10),
    }


DISORDERS = [
    disorder("mondo.9000001", "test root"),
    disorder("mondo.9000002", "test airway disease", icd10=["X45"]),
    disorder("mondo.9000003", "test airway disease, type 1", icd10=["X45.9", "X45"]),
    disorder("mondo.9000004", "test airway disease, type 2", icd10=["X45"]),
    disorder("mondo.9000005", "susceptibility to test airway disease", icd10=["X45.9", "X45"]),
    disorder("mondo.9000006", "test joint disease", snomed=["111111"], icd10=["Y06"]),
    disorder("mondo.9000007", "test syndrome A", icd10=["Z18"]),
    disorder("mondo.9000008", "test syndrome B", icd10=["Z18.2"]),
    disorder("mondo.9000009", "test grouping A", icd10=["W10"]),
    disorder("mondo.9000010", "test grouping B", icd10=["W10"]),
    disorder("mondo.9000011", "child of grouping A"),
    disorder("mondo.9000012", "child of grouping B"),
    disorder("mondo.9000013", "test kidney disease", icd10=["T18.9"]),
    disorder("mondo.9000014", "test kidney disease, stage 1"),
]
SUBTYPES = [
    ("mondo.9000002", "mondo.9000001"),
    ("mondo.9000003", "mondo.9000002"),
    ("mondo.9000004", "mondo.9000002"),
    ("mondo.9000006", "mondo.9000001"),
    ("mondo.9000011", "mondo.9000009"),
    ("mondo.9000012", "mondo.9000010"),
    ("mondo.9000014", "mondo.9000013"),
]
DRUGS = [
    {"primaryDomainId": "drugbank.DB90001", "displayName": "Testamab",
     "domainIds": ["drugbank.DB90001", "drug_central.12", "drug_central.3"],
     "casNumber": "1-2-3", "drugGroups": ["approved"]},
    {"primaryDomainId": "drugbank.DB90002", "displayName": "Placebonol",
     "domainIds": ["drugbank.DB90002"], "casNumber": "", "drugGroups": []},
]
INDICATIONS = [
    ("drugbank.DB90001", "mondo.9000006", ["drugcentral"]),
    ("drugbank.DB90001", "mondo.9000006", ["ctd"]),
    ("drugbank.DB90002", "mondo.9000006", ["ctd"]),
    ("drugbank.DB90002", "mondo.9000002", ["drugcentral"]),
    ("drugbank.DB90002", "mondo.9000001", ["ctd"]),  # the root, never matched
]
HUB = [
    {"code": "111111", "display": "Joint disease", "icd10": ["Q99"]},
    {"code": "222222", "display": "Airway disease", "icd10": ["X45.20", "X45.9"]},
    {"code": "333333", "display": "Syndromes only", "icd10": ["Z18.2"]},
    {"code": "444444", "display": "Two groupings", "icd10": ["W10.1"]},
    {"code": "555555", "display": "Nothing", "icd10": ["V01.1"]},
    {"code": "666666", "display": "No ICD-10", "icd10": []},
    {"code": "777777", "display": "Kidney disease stage 3", "icd10": ["T18.3"]},
]


def build_dump(dump: Path) -> None:
    _write(dump, "metadata.csv.gz", ["_id", "source_databases", "version"],
           [{"_id": "x", "source_databases": {"mondo": {"version": "2025-08-05"}}, "version": "2.2.13"}])
    _write(dump, "disorder.csv.gz",
           ["primaryDomainId", "displayName", "description", "domainIds", "icd10"], DISORDERS)
    _write(dump, "disorder_is_subtype_of_disorder.csv.gz", ["sourceDomainId", "targetDomainId"],
           [{"sourceDomainId": c, "targetDomainId": p} for c, p in SUBTYPES])
    _write(dump, "drug.csv.gz",
           ["primaryDomainId", "displayName", "domainIds", "casNumber", "drugGroups"], DRUGS)
    _write(dump, "drug_has_indication.csv.gz", ["sourceDomainId", "targetDomainId", "dataSources"],
           [{"sourceDomainId": d, "targetDomainId": t, "dataSources": s} for d, t, s in INDICATIONS])


class FixtureCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls._tmp = tempfile.TemporaryDirectory()
        cls.dump_dir = Path(cls._tmp.name)
        build_dump(cls.dump_dir)
        cls.dump = nx.load_dump(cls.dump_dir)
        cls.matches = {m.code: m for m in nx.match_conditions(cls.dump, HUB)}

    @classmethod
    def tearDownClass(cls) -> None:
        cls._tmp.cleanup()


class Matching(FixtureCase):
    def test_reads_the_release_version(self) -> None:
        self.assertEqual(self.dump.version, "2.2.13")

    def test_snomed_xref_wins_over_icd10(self) -> None:
        m = self.matches["111111"]
        self.assertEqual((m.route, m.disorders, m.via), ("snomedct", ("mondo.9000006",), "snomedct.111111"))

    def test_icd10_route_takes_the_most_general_disorder_of_the_category(self) -> None:
        # X45.9 alone names a subtype and a susceptibility entry; the category
        # X45 brings in the grouping disorder, which has two subtypes.
        m = self.matches["222222"]
        self.assertEqual((m.route, m.disorders, m.via), ("icd10", ("mondo.9000002",), "X45"))

    def test_icd10_route_compares_categories_on_both_sides(self) -> None:
        # The hub's T18.3 and the disorder's T18.9 share the category T18.
        m = self.matches["777777"]
        self.assertEqual((m.route, m.disorders, m.via), ("icd10", ("mondo.9000013",), "T18.9"))

    def test_icd10_candidates_without_subtypes_are_no_match(self) -> None:
        m = self.matches["333333"]
        self.assertEqual((m.route, m.disorders), ("none", ()))
        self.assertIn("none with MONDO subtypes", m.via)

    def test_icd10_tie_is_no_match(self) -> None:
        m = self.matches["444444"]
        self.assertEqual((m.route, m.disorders), ("none", ()))
        self.assertIn("tie", m.via)

    def test_unknown_icd10_and_no_icd10_are_no_match(self) -> None:
        self.assertIn("no disorder carries a code in V01", self.matches["555555"].via)
        self.assertIn("no ICD-10 code in the hub", self.matches["666666"].via)

    def test_icd10_category(self) -> None:
        self.assertEqual(nx.icd10_category("J45.20"), "J45")
        self.assertEqual(nx.icd10_category("c18.9"), "C18")
        self.assertEqual(nx.icd10_category("I10"), "I10")

    def test_closure_survives_a_cycle(self) -> None:
        graph = {"a": {"b"}, "b": {"c"}, "c": {"a"}}
        self.assertEqual(nx.closure("a", graph), {"b", "c"})


class Subset(FixtureCase):
    def setUp(self) -> None:
        self.subset = nx.select_subset(self.dump, list(self.matches.values()))

    def test_keeps_matched_disorders_and_their_ancestors_only(self) -> None:
        self.assertEqual(self.subset.matched, ["mondo.9000002", "mondo.9000006", "mondo.9000013"])
        self.assertEqual(
            self.subset.disorders,
            ["mondo.9000001", "mondo.9000002", "mondo.9000006", "mondo.9000013"],
        )
        self.assertEqual(
            self.subset.subtype_edges,
            [("mondo.9000002", "mondo.9000001"), ("mondo.9000006", "mondo.9000001")],
        )

    def test_indications_for_matched_disorders_with_merged_sources(self) -> None:
        self.assertEqual(
            self.subset.indications,
            [
                ("drugbank.DB90001", "mondo.9000006", ("ctd", "drugcentral")),
                ("drugbank.DB90002", "mondo.9000002", ("drugcentral",)),
                ("drugbank.DB90002", "mondo.9000006", ("ctd",)),
            ],
        )
        self.assertEqual(self.subset.drugs, ["drugbank.DB90001", "drugbank.DB90002"])


class Rendering(FixtureCase):
    def render(self) -> str:
        matches = list(self.matches.values())
        return nx.render_cypher(self.dump, matches, nx.select_subset(self.dump, matches))

    def test_is_deterministic(self) -> None:
        self.assertEqual(self.render(), self.render())

    def test_merge_only_and_attributed(self) -> None:
        text = self.render()
        code = "\n".join(l for l in text.splitlines() if not l.lstrip().startswith("//"))
        self.assertNotRegex(code, r"\bCREATE\b(?! SET)")
        self.assertIn("doi: '10.5281/zenodo.23940639'", code)
        self.assertIn("licence: 'CC-BY-4.0'", code)
        self.assertIn("nedrexRelease: '2.2.13'", code)
        # Every MERGE sets on create and on match (.claude/rules/code-style.md).
        self.assertEqual(code.count("MERGE "), code.count("ON CREATE SET"))
        self.assertEqual(code.count("ON CREATE SET"), code.count("ON MATCH SET"))

    def test_drug_ids_and_sources(self) -> None:
        text = self.render()
        self.assertIn("drugbankId: 'DB90001'", text)
        self.assertIn("drugCentralIds: ['3', '12']", text)
        self.assertIn("sources: ['ctd', 'drugcentral'], drugCentral: true", text)

    def test_escapes_quotes(self) -> None:
        self.assertIn("it\\'s \\'quoted\\'", self.render())
        self.assertEqual(nx.cypher_literal("a\\b'\n"), "'a\\\\b\\'\\n'")
        self.assertEqual(nx.cypher_literal({"k": [1, True, None]}), "{k: [1, true, null]}")

    def test_removes_mappings_this_run_does_not_write(self) -> None:
        self.assertIn(
            "WHERE NOT [s.conceptId, d.nedrexId] IN "
            "[['111111', 'mondo.9000006'], ['222222', 'mondo.9000002'], ['777777', 'mondo.9000013']]",
            self.render(),
        )


class Checksums(unittest.TestCase):
    def test_reports_missing_and_changed_files(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            Path(tmp, "a.csv.gz").write_bytes(b"x")
            problems = nx.verify_checksums(Path(tmp), {"a.csv.gz": "0" * 32, "b.csv.gz": "0" * 32})
        self.assertEqual(len(problems), 2)
        self.assertIn("a.csv.gz: md5 9dd4e461268c8034f5c8564e155c67a6", problems[0])
        self.assertEqual(problems[1], "b.csv.gz: missing")

    def test_pins_the_files_the_import_reads(self) -> None:
        self.assertEqual(
            sorted(nx.DUMP_MD5),
            ["disorder.csv.gz", "disorder_is_subtype_of_disorder.csv.gz", "drug.csv.gz",
             "drug_has_indication.csv.gz", "metadata.csv.gz"],
        )


class CommittedSeed(unittest.TestCase):
    """neo4j/seed-nedrex.cypher, generated from the real dump, and its wiring."""

    seed = (ROOT / "neo4j" / "seed-nedrex.cypher").read_text(encoding="utf-8")
    seed_sh = (ROOT / "neo4j" / "seed.sh").read_text(encoding="utf-8")
    schema = (ROOT / "neo4j" / "init-schema.cypher").read_text(encoding="utf-8")

    def test_rheumatoid_arthritis_reaches_its_mondo_disorder(self) -> None:
        self.assertRegex(self.seed, r"\{code: '69896004', disorder: 'mondo\.0008383', route: 'snomedct'")

    def test_asthma_and_colon_cancer_go_the_icd10_route(self) -> None:
        self.assertIn("{code: '195967001', disorder: 'mondo.0004979', route: 'icd10', via: 'J45'}", self.seed)
        self.assertIn("{code: '93761005', disorder: 'mondo.0021063', route: 'icd10', via: 'C18'}", self.seed)
        # CKD stage 3 (N18.3) lands on chronic kidney disease, which carries N18.9.
        self.assertIn("{code: '433144002', disorder: 'mondo.0005300', route: 'icd10', via: 'N18.9'}", self.seed)

    def test_hub_codes_are_strings(self) -> None:
        # SnomedConcept.conceptId is a string (#1231); an integer links nothing.
        hub = json.loads((HERE / "hub-conditions.json").read_text(encoding="utf-8"))
        self.assertTrue(all(isinstance(c["code"], str) for c in hub["conditions"]))
        self.assertNotRegex(self.seed, r"\{code: \d")

    def test_no_bare_create(self) -> None:
        code = "\n".join(l for l in self.seed.splitlines() if not l.startswith("//"))
        self.assertNotRegex(code, r"\bCREATE\b(?! SET)")

    def test_schema_constrains_the_keys(self) -> None:
        for label, key in (("NeDRexRelease", "version"), ("NeDRexDisorder", "nedrexId"), ("NeDRexDrug", "nedrexId")):
            self.assertRegex(self.schema, rf"IF NOT EXISTS FOR \(\w+:{label}\) REQUIRE \w+\.{key} IS UNIQUE")

    def test_seed_sh_runs_it_after_the_terminology_keys(self) -> None:
        # Twice: the full run and SEED_PHASE=demo-only.
        lines = self.seed_sh.splitlines()
        nedrex = [i for i, l in enumerate(lines) if l.strip().startswith("run_file") and "seed-nedrex.cypher" in l]
        keys = [i for i, l in enumerate(lines) if l.strip().startswith("run_file") and "migrate-terminology-key-types.cypher" in l]
        self.assertEqual(len(nedrex), 2)
        self.assertEqual(len(keys), 2)
        for n, k in zip(sorted(nedrex), sorted(keys)):
            self.assertGreater(n, k)
        self.assertEqual(len(re.findall(r"^\s*check_nedrex_links$", self.seed_sh, re.M)), 2)


if __name__ == "__main__":
    unittest.main()
