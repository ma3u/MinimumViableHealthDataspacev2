"""The crawler and the enricher each define CrawlEnvelope, the message on
`dataspace.catalog.raw`. They are separate images with separate
dependencies, so the model is duplicated rather than shared (#404), and
until now only a comment in each file kept the two in step. A shape change
on one side would make the enricher reject every message, logged and
ACKed, so nothing would crash and nothing would be enriched.

This test loads the crawler's model straight from its source file and
fails when the two stop describing the same message.
"""

from __future__ import annotations

import importlib.util
import sys
from datetime import datetime, timezone
from pathlib import Path

from src.models import CrawlEnvelope as EnricherEnvelope

CRAWLER_MODELS = (
    Path(__file__).resolve().parents[2] / "catalog-crawler" / "src" / "models.py"
)


def _crawler_envelope():
    spec = importlib.util.spec_from_file_location("crawler_models", CRAWLER_MODELS)
    assert spec and spec.loader, f"cannot load {CRAWLER_MODELS}"
    module = importlib.util.module_from_spec(spec)
    # Registered first, so pydantic can resolve the postponed annotations.
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module.CrawlEnvelope


def _shape(model) -> dict:
    """The wire schema without the prose, which may differ per side."""
    schema = model.model_json_schema(by_alias=True)
    schema.pop("title", None)
    schema.pop("description", None)
    for prop in schema.get("properties", {}).values():
        prop.pop("title", None)
        prop.pop("description", None)
    return schema


def test_both_sides_describe_the_same_message():
    assert _shape(_crawler_envelope()) == _shape(EnricherEnvelope)


def test_what_the_crawler_publishes_the_enricher_accepts():
    crawler = _crawler_envelope()(
        participant_did="did:web:alpha-klinik.de:participant",
        fetched_at=datetime(2026, 4, 20, 6, 0, tzinfo=timezone.utc),
        catalog={"@type": "dcat:Catalog", "dcat:dataset": []},
    )
    wire = crawler.model_dump_json(by_alias=True)

    received = EnricherEnvelope.model_validate_json(wire)

    assert received.participant_did == "did:web:alpha-klinik.de:participant"
    assert received.fetched_at == datetime(2026, 4, 20, 6, 0, tzinfo=timezone.utc)
    assert received.catalog["@type"] == "dcat:Catalog"
