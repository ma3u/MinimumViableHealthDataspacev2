"""Unit tests for mapping.py — pure-function coverage, no I/O."""

from __future__ import annotations

from datetime import datetime, timezone

from src.mapping import (
    extract_datasets,
    extract_services,
    known_theme_system,
    split_theme,
)
from src.models import CrawlEnvelope


def _envelope(catalog: dict) -> CrawlEnvelope:
    return CrawlEnvelope(
        participant_did="did:web:alpha-klinik.de:participant",
        fetched_at=datetime(2026, 4, 18, 10, 0, tzinfo=timezone.utc),
        catalog=catalog,
    )


def test_extract_handles_empty_catalog():
    assert extract_datasets(_envelope({})) == []


def test_extract_one_minimal_dataset():
    env = _envelope(
        {
            "dcat:dataset": [
                {
                    "@id": "dataset:diab-berlin",
                    "dct:title": "Diabetes registry Berlin",
                    "dct:description": "Synthetic T2DM cohort",
                    "dct:spatial": "DE",
                }
            ]
        }
    )
    out = extract_datasets(env)
    assert len(out) == 1
    assert out[0].dataset_id == "dataset:diab-berlin"
    assert out[0].title == "Diabetes registry Berlin"
    assert out[0].country == "DE"
    assert out[0].publisher_did == "did:web:alpha-klinik.de:participant"


def test_extract_links_snomed_theme():
    env = _envelope(
        {
            "dcat:dataset": [
                {
                    "@id": "dataset:a",
                    "dcat:theme": [
                        {"system": "http://snomed.info/sct", "code": "73211009"},
                    ],
                }
            ]
        }
    )
    out = extract_datasets(env)
    assert out[0].themes == ["http://snomed.info/sct|73211009"]
    assert known_theme_system(out[0].themes[0]) == "SnomedConcept"
    assert split_theme(out[0].themes[0]) == ("http://snomed.info/sct", "73211009")


def test_unknown_theme_returns_none_for_known_system_check():
    assert known_theme_system("http://example.org|X") is None


def test_extract_handles_single_dataset_not_in_list():
    # DSP permits a single dataset as an object rather than a list
    env = _envelope(
        {
            "dcat:dataset": {
                "@id": "dataset:solo",
                "dct:title": "Solo",
            }
        }
    )
    out = extract_datasets(env)
    assert len(out) == 1
    assert out[0].dataset_id == "dataset:solo"


def test_extract_skips_dataset_without_id():
    env = _envelope({"dcat:dataset": [{"dct:title": "Anonymous"}]})
    assert extract_datasets(env) == []


def test_release_8_properties_survive_federation():
    """#700: a HealthDCAT-AP Release 8 description keeps its health properties.

    The dataset is the proxy's golden output, the same document CI validates
    with the official SHACL, so the two services are tested against one shape.
    """
    import json
    from pathlib import Path

    golden = Path(__file__).resolve().parents[2] / (
        "neo4j-proxy/__tests__/fixtures/healthdcat-ap-r8.jsonld"
    )
    catalog = json.loads(golden.read_text(encoding="utf-8"))
    [fhir, omop] = extract_datasets(_envelope(catalog))

    assert fhir.dataset_id.endswith("dataset%3Aalpha-klinik-cardio-registry")
    assert fhir.access_rights == "NON_PUBLIC"
    assert fhir.applicable_legislation == ["http://data.europa.eu/eli/reg/2025/327/oj"]
    assert fhir.health_categories == ["EHRS", "MRMR"]
    assert fhir.health_themes == ["NONCOMMUNICABLE_DISEASES"]
    assert fhir.coding_systems == ["SNOMED-CT", "LOINC", "ICD-10", "RXNORM"]
    assert fhir.has_structured_data is True
    assert fhir.hdab_did == "did:web:medreg.de:hdab"
    assert fhir.license == "https://creativecommons.org/licenses/by/4.0/"
    assert "Cardiology" in fhir.keywords
    # #782: title, description and keywords come in several languages; the
    # English one is kept, not the list printed as a string.
    assert fhir.title == "AlphaKlinik Berlin Cardiac Registry"
    assert fhir.description.startswith("Synthetic registry of cardiac outcomes")
    assert "Kardiologie" not in fhir.keywords
    assert omop.title == "Limburg Medical Centre OMOP Analytics"
    assert fhir.distributions[0]["accessUrl"].startswith("https://ehds.mabu.red/data/discover")
    assert omop.coding_systems[0] == "OHDSI-VOCAB"
    assert omop.hdab_did == "did:web:irs.fr:hdab"


def _alphakasse_catalogue() -> dict:
    """AlphaKasse's DCAT-AP catalogue, the file the mock DSP route serves and
    the PR Gate validates with the DCAT-AP SHACL (#934)."""
    import json
    from pathlib import Path

    path = Path(__file__).resolve().parents[3] / "ui/src/content/catalogues/alphakasse-dcat-ap.json"
    return json.loads(path.read_text(encoding="utf-8"))


def test_bonus_programme_is_indexed_as_a_data_service():
    """#934 step 3: the programme of another data space, with its versioned rule."""
    env = CrawlEnvelope(
        participant_did="did:web:alphakasse.de:insurer",
        fetched_at=datetime(2026, 11, 9, 8, 0, tzinfo=timezone.utc),
        catalog=_alphakasse_catalogue(),
    )
    assert extract_datasets(env) == []
    [programme] = extract_services(env)

    assert programme.service_id == "urn:mvhd:programme:alphakasse:active-year-2027"
    assert programme.kinds == ["BonusProgramme"]
    assert programme.title == "Active year bonus 2027"
    assert "yes or no" in programme.description
    assert programme.publisher_did == "did:web:alphakasse.de:insurer"
    assert programme.publisher_name == "AlphaKasse DE"
    assert programme.endpoint_url == "https://ehds.mabu.red/api/mock-dsp/alphakasse"
    assert programme.themes == ["HEAL"]
    assert programme.access_rights == "PUBLIC"
    assert "http://data.europa.eu/eli/reg/2025/327/oj" in programme.applicable_legislation
    # ADR-080, decision 3: the rule travels with the entry, versioned
    assert programme.rule_version == "2027.1"
    assert programme.rule_id.endswith(":rule:2027.1")
    assert "150 minutes a week" in programme.rule_description
    assert len(programme.conforms_to) == 2
    # English and untagged keywords only, as for datasets
    assert "bonus programme" in programme.keywords
    assert "Bonusprogramm" not in programme.keywords


def test_a_service_type_never_becomes_a_label_unless_known():
    """A remote catalogue cannot name a node label of the hub's graph."""
    env = _envelope(
        {
            "dcat:service": [
                {
                    "@id": "urn:x:svc",
                    "@type": ["dcat:DataService", "ehds:Participant", "Patient"],
                    "dct:title": "Something",
                }
            ]
        }
    )
    [svc] = extract_services(env)
    assert svc.kinds == []
    assert svc.rule_version is None
    assert svc.endpoint_url is None


def test_extract_services_ignores_entries_without_an_id():
    env = _envelope({"dcat:service": [{"dct:title": "no id"}, "not a node"]})
    assert extract_services(env) == []
