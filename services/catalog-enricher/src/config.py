"""Runtime configuration for catalog-enricher.

All values read from environment; none are secret (credentials live in
NATS/Neo4j config). NEO4J_URI uses the ACA short service name per ADR-018.
"""

from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Config:
    nats_url: str
    nats_subject: str
    nats_consumer: str
    neo4j_uri: str
    neo4j_user: str
    neo4j_password: str
    metrics_port: int
    log_level: str


def from_env() -> Config:
    return Config(
        nats_url=os.environ.get("NATS_URL", "nats://mvhd-nats:4222"),
        nats_subject=os.environ.get("NATS_SUBJECT", "dataspace.catalog.raw"),
        nats_consumer=os.environ.get("NATS_CONSUMER", "enricher"),
        neo4j_uri=os.environ.get("NEO4J_URI", "bolt://mvhd-neo4j:7687"),
        neo4j_user=os.environ.get("NEO4J_USER", "neo4j"),
        neo4j_password=os.environ.get("NEO4J_PASSWORD", "healthdataspace"),
        metrics_port=int(os.environ.get("METRICS_PORT", "9464")),
        log_level=os.environ.get("LOG_LEVEL", "INFO"),
    )
