"""Unit tests for mapping.py — pure-function coverage, no I/O."""

from __future__ import annotations

from datetime import datetime, timezone

from src.mapping import (
    extract_datasets,
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
