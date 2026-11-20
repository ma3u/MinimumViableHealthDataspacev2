"""Unit tests for scripts/eehrxf (#1144). Standard library only.

    python3 -m unittest discover -s scripts/eehrxf -p "test_*.py" -v
"""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import build  # noqa: E402
import validate  # noqa: E402


class Coverage(unittest.TestCase):
    def test_profile_coverage(self):
        self.assertEqual(build.coverage(0, 0), "untested")
        self.assertEqual(build.coverage(5, 5), "full")
        self.assertEqual(build.coverage(5, 1), "partial")
        self.assertEqual(build.coverage(5, 0), "none")

    def test_category_status(self):
        self.assertEqual(build.category_status(["full", "full"]), "available")
        self.assertEqual(build.category_status(["full", "untested"]), "partial")
        self.assertEqual(build.category_status(["none", "untested"]), "none")
        self.assertEqual(build.category_status(["untested", "untested"]), "untested")


class Filters(unittest.TestCase):
    def test_laboratory_and_imaging_by_category(self):
        lab = {"category": [{"coding": [{"code": "laboratory"}]}]}
        rad = {"category": [{"coding": [{"code": "RAD"}]}]}
        self.assertTrue(validate.matches_filter(lab, "laboratory"))
        self.assertFalse(validate.matches_filter(rad, "laboratory"))
        self.assertTrue(validate.matches_filter(rad, "imaging"))

    def test_patient_summary_document_needs_the_composition_first(self):
        comp = {"resourceType": "Composition", "type": {"coding": [{"code": "60591-5"}]}}
        doc = {"resourceType": "Bundle", "type": "document", "entry": [{"resource": comp}]}
        collection = {**doc, "type": "collection"}
        self.assertTrue(validate.matches_filter(doc, "patient-summary-document"))
        self.assertFalse(validate.matches_filter(collection, "patient-summary-document"))

    def test_unknown_filter_is_an_error(self):
        with self.assertRaises(ValueError):
            validate.matches_filter({}, "radiology")


class Outcomes(unittest.TestCase):
    def test_parse_keeps_errors_per_file(self):
        out = {
            "resourceType": "Bundle",
            "entry": [
                {
                    "resource": {
                        "resourceType": "OperationOutcome",
                        "extension": [{"url": validate.FILE_EXT, "valueString": "/tmp/in/a__synthea__000.json"}],
                        "issue": [
                            {"severity": "error", "details": {"text": "Patient.name: minimum required = 1"}},
                            {"severity": "warning", "details": {"text": "only a warning"}},
                        ],
                    }
                },
                {
                    "resource": {
                        "resourceType": "OperationOutcome",
                        "extension": [{"url": validate.FILE_EXT, "valueString": "/tmp/in/a__synthea__001.json"}],
                        "issue": [{"severity": "information", "details": {"text": "fine"}}],
                    }
                },
            ],
        }
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
            json.dump(out, f)
        parsed = validate.parse_outcomes(Path(f.name))
        self.assertEqual(len(parsed["a__synthea__000.json"]), 1)
        self.assertEqual(parsed["a__synthea__001.json"], [])

    def test_ignored_issue_applies_only_to_its_source(self):
        cfg = {"validator": {"ignoredIssues": [{"contains": "conditional reference", "sources": ["synthea"]}]}}
        issue = {"severity": "error", "details": {"text": "x is a conditional reference, and ..."}}
        self.assertTrue(validate.ignored(cfg, "synthea", issue))
        self.assertFalse(validate.ignored(cfg, "klarbefund", issue))


class Config(unittest.TestCase):
    def test_categories_are_the_six_of_article_14(self):
        cfg = validate.load_config()
        self.assertEqual(
            sorted(c["article"] for c in cfg["categories"]),
            [f"Art. 14(1)({x})" for x in "abcdef"],
        )

    def test_every_profile_names_a_known_ig_and_category(self):
        cfg = validate.load_config()
        ids = {c["categoryId"] for c in cfg["categories"]}
        for p in cfg["profiles"]:
            self.assertIn(p["ig"], cfg["igs"], p["profileId"])
            self.assertTrue(set(p["categories"]) <= ids, p["profileId"])
            pkg = cfg["igs"][p["ig"]]["package"].removeprefix("hl7.fhir.eu.")
            self.assertTrue(p["canonical"].startswith(f"http://hl7.eu/fhir/{pkg}/StructureDefinition/"), p["canonical"])

    def test_layer6_maps_guidelines_to_these_categories(self):
        # load_layer6.py MATCHes EEHRxFCategory by id: an id the seed does not
        # create links nothing, silently.
        sys.path.insert(0, str(validate.ROOT / "scripts" / "leitlinien"))
        import category_mapper

        ids = {c["categoryId"] for c in validate.load_config()["categories"]}
        self.assertEqual(set(category_mapper.EEHRXF_CATEGORY_IDS), ids)
        self.assertEqual(set(category_mapper.KEYWORDS), ids)

    def test_matchbox_loads_every_pinned_ig(self):
        # The proxy's $validate (#1174) must validate against the guides CI does.
        cfg = validate.load_config()
        text = build.matchbox_config(cfg)
        for key, ig in cfg["igs"].items():
            self.assertIn(f"      {key}:\n        name: {ig['package']}\n        version: \"{ig['version']}\"\n", text)
        self.assertIn("      txServer: n/a\n", text)
        self.assertIn("      httpReadOnly: true\n", text)

    def test_report_covers_every_configured_profile(self):
        cfg = validate.load_config()
        report = json.loads(validate.REPORT.read_text(encoding="utf-8"))
        self.assertEqual(set(report["profiles"]), {p["profileId"] for p in cfg["profiles"]})


if __name__ == "__main__":
    unittest.main()
