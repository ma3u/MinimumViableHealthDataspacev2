"""Pydantic models for the NATS message contract.

The crawler MUST produce messages matching CrawlEnvelope; the enricher
validates every incoming message and rejects (ACKs with log) anything that
fails schema validation — never crashes on bad input.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class CrawlEnvelope(BaseModel):
    """Wrapper written by the catalog crawler to subject `dataspace.catalog.raw`."""

    participant_did: str = Field(..., alias="participantDid")
    fetched_at: datetime = Field(..., alias="fetchedAt")
    catalog: dict[str, Any]

    class Config:
        populate_by_name = True


class DatasetUpsert(BaseModel):
    """Shape written to Neo4j for each dcat:Dataset in the catalog."""

    dataset_id: str
    title: str
    description: str | None = None
    publisher_did: str
    country: str | None = None
    license: str | None = None
    themes: list[str] = Field(default_factory=list)
    distributions: list[dict[str, str]] = Field(default_factory=list)
    odrl_policy: dict[str, Any] | None = None
    last_seen_at: datetime
