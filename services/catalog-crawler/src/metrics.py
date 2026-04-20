"""Prometheus metrics — exposed on :METRICS_PORT/metrics."""

from __future__ import annotations

from prometheus_client import Counter, Histogram, start_http_server

requests_total = Counter(
    "crawler_requests_total",
    "DSP catalog requests attempted",
    labelnames=("participant", "outcome"),  # ok | http_error | timeout | invalid_json
)

request_seconds = Histogram(
    "crawler_request_seconds",
    "Time to fetch one DSP catalog end-to-end",
    labelnames=("participant",),
)

last_success_ts = Counter(
    "crawler_last_success_ts",
    "Unix timestamp of the last successful crawl, per participant",
    labelnames=("participant",),
)


def start_metrics_server(port: int) -> None:
    start_http_server(port)
