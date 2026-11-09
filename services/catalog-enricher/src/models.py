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
    # HealthDCAT-AP Release 8 (#700), as vocabulary codes like the hub's own
    # datasets carry them (neo4j/register-healthdcat-ap-r8.cypher).
    access_rights: str | None = None
    applicable_legislation: list[str] = Field(default_factory=list)
    health_categories: list[str] = Field(default_factory=list)
    health_themes: list[str] = Field(default_factory=list)
    coding_systems: list[str] = Field(default_factory=list)
    has_structured_data: bool | None = None
    hdab_did: str | None = None
    keywords: list[str] = Field(default_factory=list)


class ServiceUpsert(BaseModel):
    """Shape written to Neo4j for each dcat:DataService in the catalog (#934).

    An offer of another data space that is not a health dataset, in DCAT-AP
    3.0.1: AlphaKasse's bonus programme. Its rule is the dct:Standard it
    conforms to that carries a version (ADR-080, decision 3).
    """

    service_id: str
    title: str
    description: str | None = None
    publisher_did: str
    publisher_name: str | None = None
    endpoint_url: str | None = None
    # Extra node labels, only from KNOWN_SERVICE_KINDS: a remote catalogue
    # never names a label of the hub's graph.
    kinds: list[str] = Field(default_factory=list)
    themes: list[str] = Field(default_factory=list)
    keywords: list[str] = Field(default_factory=list)
    access_rights: str | None = None
    applicable_legislation: list[str] = Field(default_factory=list)
    conforms_to: list[str] = Field(default_factory=list)
    rule_id: str | None = None
    rule_title: str | None = None
    rule_description: str | None = None
    rule_version: str | None = None
    last_seen_at: datetime
