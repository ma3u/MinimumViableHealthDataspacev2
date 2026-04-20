"""Envelope shape test — guards against silent drift with the enricher."""

from __future__ import annotations

import json
from datetime import datetime, timezone

from src.models import CrawlEnvelope


def test_envelope_serialises_with_aliases() -> None:
    env = CrawlEnvelope(
        participant_did="did:web:alpha-klinik.de:participant",
        fetched_at=datetime(2026, 4, 20, 6, 0, tzinfo=timezone.utc),
        catalog={"dcat:dataset": []},
    )
    payload = json.loads(json.dumps(env.model_dump(by_alias=True, mode="json")))
    # MUST match the enricher's expected keys exactly — camelCase aliases.
    assert "participantDid" in payload
    assert "fetchedAt" in payload
    assert payload["participantDid"] == "did:web:alpha-klinik.de:participant"
    assert payload["fetchedAt"].startswith("2026-04-20T06:00:00")
    assert payload["catalog"] == {"dcat:dataset": []}


def test_envelope_accepts_alias_input() -> None:
    # Round-trip: the enricher's model_validate reads the same payload.
    env = CrawlEnvelope.model_validate(
        {
            "participantDid": "did:web:x",
            "fetchedAt": "2026-04-20T06:00:00Z",
            "catalog": {},
        }
    )
    assert env.participant_did == "did:web:x"
    assert env.catalog == {}
