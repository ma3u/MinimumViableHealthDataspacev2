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
        # The writer's other report kinds are collections, no EU lab report.
        self.assertFalse(validate.matches_filter(collection, "laboratory-report-bundle"))
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

    def test_each_category_is_one_annex_of_the_implementing_act(self):
        # Draft act Ares(2026)10884928: Annexes IV to IX, in the order of Art. 14(1) (#1205).
        cfg = validate.load_config()
        by_article = {c["article"]: c["annex"] for c in cfg["categories"]}
        self.assertEqual(
            [by_article[f"Art. 14(1)({x})"] for x in "abcdef"],
            [f"Annex {n}" for n in ("IV", "V", "VI", "VII", "VIII", "IX")],
        )
        act = cfg["implementingAct"]
        self.assertEqual(act["fhirVersion"], "R4")
        self.assertIn(act["status"], ("draft", "adopted"))

    def test_mock_carries_the_act_and_the_annexes(self):
        cfg = validate.load_config()
        m = build.mock(build.model(cfg, json.loads(build.REPORT.read_text(encoding="utf-8"))), None)
        self.assertEqual(m["implementingAct"]["reference"], cfg["implementingAct"]["reference"])
        self.assertNotIn("$comment", m["implementingAct"])
        self.assertTrue(all(c["annex"].startswith("Annex ") for c in m["categories"]))

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
        lab = {
            "resourceType": "DiagnosticReport",
            "category": [{"coding": [{"code": "LAB"}]}],
            "code": {"coding": [{"code": "11502-2"}]},
        }
        ecg = {"resourceType": "DiagnosticReport", "category": [{"coding": [{"code": "EC"}]}]}
        self.assertTrue(
            validate.matches_filter({"resourceType": "Bundle", "entry": [{"resource": lab}]}, "laboratory-bundle")
        )
        self.assertFalse(
            validate.matches_filter({"resourceType": "Bundle", "entry": [{"resource": ecg}]}, "laboratory-bundle")
        )


class LabReportFilter(unittest.TestCase):
    def test_a_lab_report_needs_category_lab_and_loinc_11502_2(self):
        def dr(cat, code):
            return {"category": [{"coding": [{"code": cat}]}], "code": {"coding": [{"code": code}]}}

        self.assertTrue(validate.matches_filter(dr("LAB", "11502-2"), "laboratory-report"))
        # A CGM summary sits in v2-0074 LAB but is no laboratory report.
        self.assertFalse(validate.matches_filter(dr("LAB", "107930-0"), "laboratory-report"))
        self.assertFalse(validate.matches_filter(dr("EC", "11502-2"), "laboratory-report"))


class FacadeSource(unittest.TestCase):
    """#1144: what the neo4j-proxy FHIR facade serves is a source of its own."""

    def test_each_entry_of_the_facade_sample_is_a_resource_to_validate(self):
        facade = validate.collect_sources()["facade"]
        self.assertEqual(facade["files"], [validate.FACADE_SAMPLE])
        sample = json.loads((validate.ROOT / validate.FACADE_SAMPLE).read_text(encoding="utf-8"))
        self.assertEqual(len(facade["resources"]), len(sample["entry"]))
        origin, resource = facade["resources"][0]
        self.assertEqual(origin, "facade-sample.json#entry[0]")
        self.assertEqual(resource, sample["entry"][0]["resource"])

    def test_a_missing_sample_is_an_empty_source(self):
        empty = validate.collect_entries("scripts/eehrxf/samples/no-such-sample.json", "none")
        self.assertEqual(empty["files"], [])
        self.assertEqual(empty["resources"], [])


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



class NationalOutputs(unittest.TestCase):
    """The German guides marked onPage (the MII Kerndatensatz) get a seed and a mock of their own."""

    def setUp(self):
        self.cfg = validate.load_config()
        self.report = json.loads(build.REPORT.read_text(encoding="utf-8"))
        self.n = build.national_model(self.cfg, self.report)

    def test_every_on_page_profile_and_no_other_is_in_the_national_outputs(self):
        text = build.national_cypher(self.n) + json.dumps(build.national_mock(self.n))
        nat = validate.national(self.cfg)
        for p in nat["profiles"]:
            if nat["igs"][p["ig"]].get("onPage"):
                self.assertIn(p["profileId"], text)
                self.assertIn(p["canonical"], text)
            else:
                self.assertNotIn(p["profileId"], text)

    def test_the_national_outputs_name_no_real_organisation_of_the_flag_policy(self):
        # .claude/rules/code-style.md: gematik only behind NEXT_PUBLIC_DEMO_TK.
        text = build.national_cypher(self.n) + json.dumps(build.national_mock(self.n))
        self.assertNotIn("gematik", text.lower())

    def test_every_counterpart_is_an_eehrxf_profile_of_the_same_resource(self):
        eehrxf = {p["profileId"]: p for p in self.cfg["profiles"]}
        for p in validate.national(self.cfg)["profiles"]:
            cp = p.get("eehrxfCounterpart")
            if cp is None:
                continue
            self.assertIn(cp, eehrxf, p["profileId"])
            self.assertEqual(eehrxf[cp]["baseResource"], p["baseResource"], p["profileId"])

    def test_every_national_guide_names_its_publisher(self):
        for key, ig in validate.national(self.cfg)["igs"].items():
            self.assertTrue(ig.get("publisher"), key)

    def test_the_mii_kerndatensatz_is_validated(self):
        packages = {g["igPackage"].split("#")[0] for g in self.n["guides"]}
        for module in ("base", "laborbefund", "medikation"):
            self.assertIn(f"de.medizininformatikinitiative.kerndatensatz.{module}", packages)

    def test_mock_sums_match_the_profiles(self):
        mock = build.national_mock(self.n)
        profiles = [p for g in mock["guides"] for p in g["profiles"]]
        self.assertEqual(mock["summary"]["profiles"], len(profiles))
        self.assertEqual(mock["summary"]["resourcesTested"], sum(p["tested"] for p in profiles))
        for p in profiles:
            self.assertEqual(p["passed"] + p["failed"], p["tested"])
            self.assertEqual(p["coverage"], build.coverage(p["tested"], p["passed"]))

    def test_an_unknown_counterpart_stops_the_build(self):
        cfg = json.loads(json.dumps(self.cfg))
        nat = cfg["national"]
        on_page = next(p for p in nat["profiles"] if nat["igs"][p["ig"]].get("onPage"))
        on_page["eehrxfCounterpart"] = "no-such-profile"
        with self.assertRaises(SystemExit):
            build.national_model(cfg, self.report)


if __name__ == "__main__":
    unittest.main()
