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

    def test_lab_report_bundle_is_never_a_patient_summary(self):
        def doc(code):
            comp = {"resourceType": "Composition", "type": {"coding": [{"code": code}]}}
            return {"resourceType": "Bundle", "type": "document", "entry": [{"resource": comp}]}

        collection = {"resourceType": "Bundle", "type": "collection", "entry": [{"resource": {"resourceType": "Patient"}}]}
        self.assertTrue(validate.matches_filter(doc("11502-2"), "laboratory-report-bundle"))
        self.assertTrue(validate.matches_filter(collection, "laboratory-report-bundle"))
        self.assertFalse(validate.matches_filter(doc("60591-5"), "laboratory-report-bundle"))

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

    def test_the_matchbox_image_bakes_exactly_the_pinned_igs(self):
        # ADR-097: the image (services/matchbox) is built from the file build.py
        # writes, and its bake step checks the IGs it reads from that file.
        # Both must name FHIR R4 core and every IG of profiles.json, no more.
        import subprocess

        cfg = validate.load_config()
        image_dir = build.ROOT / "services" / "matchbox"
        self.assertEqual(build.MATCHBOX, image_dir / "application.yaml")
        self.assertIn("COPY --chown=1000:1000 application.yaml /config/application.yaml",
                      (image_dir / "Dockerfile").read_text(encoding="utf-8"))
        listed = subprocess.run(
            ["bash", str(image_dir / "bake.sh"), "--list"],
            env={"MATCHBOX_CONFIG": str(build.MATCHBOX), "PATH": "/usr/bin:/bin"},
            capture_output=True, text=True, check=True,
        ).stdout.split()
        want = [f"hl7.fhir.r4.core#{cfg['validator']['fhirVersion']}"] + [
            f"{cfg['igs'][k]['package']}#{cfg['igs'][k]['version']}" for k in sorted(cfg["igs"])
        ]
        self.assertEqual(listed, want)

    def test_report_covers_every_configured_profile(self):
        cfg = validate.load_config()
        report = json.loads(validate.REPORT.read_text(encoding="utf-8"))
        self.assertEqual(set(report["profiles"]), {p["profileId"] for p in cfg["profiles"]})
        self.assertEqual(
            set(report["national"]["profiles"]), {p["profileId"] for p in validate.national(cfg)["profiles"]}
        )

    def test_every_national_profile_names_a_known_national_ig(self):
        cfg = validate.load_config()
        nat = validate.national(cfg)
        eehrxf_ids = {p["profileId"] for p in cfg["profiles"]}
        for ig in nat["igs"].values():
            self.assertIn(ig["status"], ("published", "ballot", "draft"), ig["package"])
            self.assertTrue(ig["checkedOn"] and ig["checkedAt"].startswith("https://"), ig["package"])
        for p in nat["profiles"]:
            self.assertIn(p["ig"], nat["igs"], p["profileId"])
            self.assertNotIn(p["profileId"], eehrxf_ids)
            self.assertNotIn("categories", p, "a German profile is not an EEHRxF category member")


class LabBundleFilter(unittest.TestCase):
    def test_a_bundle_counts_as_lab_only_with_a_lab_report_in_it(self):
        lab = {"resourceType": "DiagnosticReport", "category": [{"coding": [{"code": "LAB"}]}]}
        ecg = {"resourceType": "DiagnosticReport", "category": [{"coding": [{"code": "EC"}]}]}
        self.assertTrue(
            validate.matches_filter({"resourceType": "Bundle", "entry": [{"resource": lab}]}, "laboratory-bundle")
        )
        self.assertFalse(
            validate.matches_filter({"resourceType": "Bundle", "entry": [{"resource": ecg}]}, "laboratory-bundle")
        )


class ReportOnly(unittest.TestCase):
    """#1172: draft and ballot guides report, every other guide gates."""

    def test_status_decides(self):
        for status in ("draft", "Draft", "ballot", "Ballot", " BALLOT "):
            self.assertTrue(validate.report_only({"status": status}), status)
        for status in ("published", "STU 1", "STU 2", ""):
            self.assertFalse(validate.report_only({"status": status}), status)

    def _results(self, status: str, outcome: list[dict]) -> dict:
        igs = {"g": {"package": "x.y", "version": "1.0.0", "status": status}}
        profiles = [{"profileId": "p", "ig": "g", "canonical": "http://x/p"}]
        index = {"p__klarbefund__000.json": ("p", "klarbefund", "a.json")}
        outcomes = {"p__klarbefund__000.json": outcome}
        return validate.profile_results({"validator": {}}, igs, profiles, {"klarbefund": {}}, index, outcomes)

    def test_a_draft_failure_is_reported_and_does_not_gate(self):
        err = [{"severity": "error", "details": {"text": "Observation.performer: minimum required = 1"}}]
        result = self._results("draft", err)["p"]
        self.assertEqual((result["tested"], result["failed"], result["gate"]), (1, 1, False))
        self.assertEqual(result["topIssues"][0]["resources"], 1)
        report = {"profiles": {}, "national": {"profiles": {"p": result}}}
        self.assertEqual(validate.gate_failures(report, None), [])

    def test_the_same_failure_gates_once_published(self):
        err = [{"severity": "error", "details": {"text": "Observation.performer: minimum required = 1"}}]
        report = {"profiles": {}, "national": {"profiles": {"p": self._results("published", err)["p"]}}}
        self.assertEqual(len(validate.gate_failures(report, None)), 1)
        # A baseline that had the profile as report-only allows nothing.
        draft = {"profiles": {}, "national": {"profiles": {"p": self._results("draft", err)["p"]}}}
        self.assertEqual(len(validate.gate_failures(report, draft)), 1)
        # A baseline that records the failure as gating accepts it: known failures do not fail a run.
        self.assertEqual(validate.gate_failures(report, report), [])

    def test_a_new_failure_of_a_gating_profile_fails_the_run(self):
        before = {"profiles": {"p": {"ig": "x#1", "gate": True, "tested": 3, "failed": 1}}}
        after = {"profiles": {"p": {"ig": "x#1", "gate": True, "tested": 3, "failed": 2}}}
        self.assertEqual(validate.gate_failures(before, before), [])
        self.assertEqual(len(validate.gate_failures(after, before)), 1)
        # A baseline written before #1172 has no gate field: its entries gate.
        legacy = {"profiles": {"p": {"ig": "x#1", "tested": 3, "failed": 2}}}
        self.assertEqual(validate.gate_failures(after, legacy), [])

    def test_committed_report_passes_its_own_gate(self):
        report = json.loads(validate.REPORT.read_text(encoding="utf-8"))
        self.assertEqual(validate.gate_failures(report, report), [])


class NationalStaysOffTheEehrxfPage(unittest.TestCase):
    def test_build_writes_no_german_package_or_profile(self):
        cfg = validate.load_config()
        report = json.loads(build.REPORT.read_text(encoding="utf-8"))
        m = build.model(cfg, report)
        text = build.cypher(m) + json.dumps(build.mock(m, None))
        nat = validate.national(cfg)
        for ig in nat["igs"].values():
            self.assertNotIn(ig["package"], text)
        for p in nat["profiles"]:
            self.assertNotIn(p["profileId"], text)
            self.assertNotIn(p["canonical"], text)


if __name__ == "__main__":
    unittest.main()
