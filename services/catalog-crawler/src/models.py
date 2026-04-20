"""Pydantic models for the crawler → NATS contract.

CrawlEnvelope MUST stay byte-compatible with the enricher's equivalent
model in services/catalog-enricher/src/models.py. Any shape change here
needs a coordinated change there; this comment exists so future-you
notices before causing a silent drop on the enricher side.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class Participant(BaseModel):
    """Row read from Neo4j for every target the crawler should hit."""

    participant_id: str
    name: str
    dsp_catalog_url: str
    country: str | None = None
    wallet_type: str | None = None


class CrawlEnvelope(BaseModel):
    """Message shape the crawler publishes on `dataspace.catalog.raw`."""

    participant_did: str = Field(..., alias="participantDid")
    fetched_at: datetime = Field(..., alias="fetchedAt")
    catalog: dict[str, Any]

    class Config:
        populate_by_name = True
