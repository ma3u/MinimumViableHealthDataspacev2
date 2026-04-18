"""Prometheus metrics — exposed on :METRICS_PORT/metrics."""

from __future__ import annotations

from prometheus_client import Counter, Histogram, start_http_server

messages_total = Counter(
    "enricher_messages_total",
    "Catalog envelopes processed",
    labelnames=("outcome",),  # ok | schema_error | neo4j_error
)

merge_seconds = Histogram(
    "enricher_merge_seconds",
    "Time spent writing one envelope to Neo4j",
)

unknown_theme_total = Counter(
    "enricher_unknown_theme_total",
    "Themes in federated catalogs that we could not link to a known ontology",
    labelnames=("publisher",),
)


def start_metrics_server(port: int) -> None:
    start_http_server(port)
