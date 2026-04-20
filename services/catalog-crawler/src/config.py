"""Runtime configuration for catalog-crawler.

All values read from environment; none are secret. NEO4J_URI uses the ACA
short service name per ADR-018. Crawl interval defaults to 5 min per the
ADR-020 decision.
"""

from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Config:
    nats_url: str
    nats_subject: str
    neo4j_uri: str
    neo4j_user: str
    neo4j_password: str
    # did:web that the crawler identifies itself as when signing DSP
    # requests. Kept for logging today; actual signing is deferred until
    # a remote participant demands it (ADR-020 open question 3).
    crawler_did: str
    # Per-request HTTP timeout and the max seconds we'll wait per
    # participant before giving up on this cycle.
    request_timeout_s: float
    # Override for operational debugging; default 300s matches ADR-020.
    crawl_interval_s: int
    # One-shot mode — exit after a single cycle (used by the ACA
    # Schedule-trigger Job; the same code runs as a long-lived loop in
    # docker compose).
    run_once: bool
    metrics_port: int
    log_level: str


def from_env() -> Config:
    return Config(
        nats_url=os.environ.get("NATS_URL", "nats://mvhd-nats:4222"),
        nats_subject=os.environ.get("NATS_SUBJECT", "dataspace.catalog.raw"),
        neo4j_uri=os.environ.get("NEO4J_URI", "bolt://mvhd-neo4j:7687"),
        neo4j_user=os.environ.get("NEO4J_USER", "neo4j"),
        neo4j_password=os.environ.get("NEO4J_PASSWORD", "healthdataspace"),
        crawler_did=os.environ.get(
            "CRAWLER_DID", "did:web:ehds.mabu.red:crawler"
        ),
        request_timeout_s=float(os.environ.get("REQUEST_TIMEOUT_S", "10")),
        crawl_interval_s=int(os.environ.get("CRAWL_INTERVAL_S", "300")),
        run_once=os.environ.get("RUN_ONCE", "false").lower() == "true",
        metrics_port=int(os.environ.get("METRICS_PORT", "9465")),
        log_level=os.environ.get("LOG_LEVEL", "INFO"),
    )
