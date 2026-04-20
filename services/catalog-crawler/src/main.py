"""Entrypoint: one crawl cycle per CRAWL_INTERVAL_S (default 5 min).

For each enabled Participant row in Neo4j, fetches its DSP catalog and
publishes a CrawlEnvelope on NATS subject `dataspace.catalog.raw`. The
catalog-enricher service consumes that subject and writes the enriched
graph nodes.

Two run modes:
  - `RUN_ONCE=true`  — single cycle, exits 0 after publishing. Used by
                       the ACA Schedule-trigger Job.
  - `RUN_ONCE=false` — long-lived loop. Used by `docker compose up` so
                       developers see fresh catalogs continuously.

Neo4j / NATS errors are logged but don't kill the process — the next
cycle retries. Per-participant HTTP errors are logged + counted in
metrics; one bad target does not stop the rest of the cycle.
"""

from __future__ import annotations

import asyncio
import json
import logging
import signal
import time
from datetime import datetime, timezone

import httpx
import nats
from neo4j import GraphDatabase

from . import dsp_client, metrics
from .config import Config, from_env
from .models import CrawlEnvelope, Participant
from .targets import load_targets

log = logging.getLogger("catalog-crawler")


async def _crawl_one(
    http: httpx.AsyncClient,
    nats_client: nats.aio.client.Client,
    subject: str,
    participant: Participant,
    crawler_did: str,
    timeout_s: float,
) -> None:
    """Fetch one catalog + publish envelope. Records metrics per outcome."""
    label = participant.participant_id
    started = time.monotonic()
    try:
        with metrics.request_seconds.labels(participant=label).time():
            catalog = await dsp_client.fetch_catalog(
                http, participant.dsp_catalog_url, crawler_did, timeout_s
            )
        envelope = CrawlEnvelope(
            participant_did=participant.participant_id,
            fetched_at=datetime.now(timezone.utc),
            catalog=catalog,
        )
        await nats_client.publish(
            subject,
            json.dumps(envelope.model_dump(by_alias=True, mode="json")).encode("utf-8"),
        )
        metrics.requests_total.labels(participant=label, outcome="ok").inc()
        metrics.last_success_ts.labels(participant=label).inc()  # monotonic marker
        log.info(
            "fetched + published — participant=%s url=%s dt=%.2fs",
            label,
            participant.dsp_catalog_url,
            time.monotonic() - started,
        )
    except httpx.TimeoutException:
        metrics.requests_total.labels(participant=label, outcome="timeout").inc()
        log.warning("timeout fetching %s", participant.dsp_catalog_url)
    except httpx.HTTPStatusError as err:
        # 401/403 = remote participant doesn't grant us access; not a
        # crawler bug, audit and move on.
        status = err.response.status_code
        metrics.requests_total.labels(participant=label, outcome="http_error").inc()
        log.warning(
            "HTTP %d fetching %s — %s",
            status,
            participant.dsp_catalog_url,
            "access denied; participant did not grant VC" if status in (401, 403) else "error",
        )
    except (httpx.HTTPError, ValueError, json.JSONDecodeError) as err:
        metrics.requests_total.labels(participant=label, outcome="invalid_json").inc()
        log.warning("error fetching %s: %s", participant.dsp_catalog_url, err)


async def _run_cycle(cfg: Config) -> None:
    driver = GraphDatabase.driver(
        cfg.neo4j_uri, auth=(cfg.neo4j_user, cfg.neo4j_password)
    )
    try:
        try:
            targets = load_targets(driver)
        except Exception as err:  # noqa: BLE001
            log.error("could not load targets from Neo4j: %s", err)
            return
        if not targets:
            log.info("no crawl targets enabled — sleeping")
            return
        log.info("starting cycle with %d target(s)", len(targets))

        nats_client = await nats.connect(cfg.nats_url)
        try:
            async with httpx.AsyncClient() as http:
                # Max 1 concurrent request per participant (ADR-020 open
                # question 9) is enforced naturally: we only issue one
                # request per participant per cycle anyway.
                await asyncio.gather(
                    *[
                        _crawl_one(
                            http,
                            nats_client,
                            cfg.nats_subject,
                            t,
                            cfg.crawler_did,
                            cfg.request_timeout_s,
                        )
                        for t in targets
                    ]
                )
            await nats_client.flush()
        finally:
            await nats_client.close()
    finally:
        driver.close()


async def run(cfg: Config) -> None:
    metrics.start_metrics_server(cfg.metrics_port)
    log.info(
        "crawler ready — targets from %s, publishing to %s on %s, interval=%ds run_once=%s",
        cfg.neo4j_uri,
        cfg.nats_subject,
        cfg.nats_url,
        cfg.crawl_interval_s,
        cfg.run_once,
    )

    stop = asyncio.Event()

    def _shutdown(*_: object) -> None:
        log.info("shutdown signal received")
        stop.set()

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, _shutdown)

    if cfg.run_once:
        await _run_cycle(cfg)
        return

    while not stop.is_set():
        await _run_cycle(cfg)
        try:
            await asyncio.wait_for(stop.wait(), timeout=cfg.crawl_interval_s)
        except TimeoutError:
            continue


def main() -> None:
    cfg = from_env()
    logging.basicConfig(
        level=cfg.log_level,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    try:
        asyncio.run(run(cfg))
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
