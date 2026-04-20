"""Entrypoint: subscribe to NATS subject, enrich, write to Neo4j.

Durable consumer replays unacknowledged messages on restart.
Bad messages are logged and ACKed (no poison-message loops).
"""

from __future__ import annotations

import asyncio
import json
import logging
import signal
from contextlib import suppress

import nats
from nats.aio.msg import Msg
from neo4j import Driver
from pydantic import ValidationError

from . import mapping, metrics, neo4j_writer
from .config import Config, from_env
from .models import CrawlEnvelope

log = logging.getLogger("catalog-enricher")


async def handle_message(driver: Driver, msg: Msg) -> None:
    try:
        raw = json.loads(msg.data.decode("utf-8"))
        envelope = CrawlEnvelope.model_validate(raw)
    except (json.JSONDecodeError, ValidationError) as e:
        log.warning("rejecting malformed envelope: %s", e)
        metrics.messages_total.labels(outcome="schema_error").inc()
        return

    datasets = mapping.extract_datasets(envelope)
    try:
        with metrics.merge_seconds.time():
            upserted, unknown = neo4j_writer.write_datasets(
                driver,
                envelope_ts=envelope.fetched_at.isoformat(),
                publisher_did=envelope.participant_did,
                datasets=datasets,
            )
        log.info(
            "envelope processed — publisher=%s datasets=%d unknown_themes=%d",
            envelope.participant_did,
            upserted,
            unknown,
        )
        for _ in range(unknown):
            metrics.unknown_theme_total.labels(publisher=envelope.participant_did).inc()
        metrics.messages_total.labels(outcome="ok").inc()
    except Exception:
        log.exception("neo4j write failed")
        metrics.messages_total.labels(outcome="neo4j_error").inc()


async def run(cfg: Config) -> None:
    metrics.start_metrics_server(cfg.metrics_port)
    log.info("metrics on :%d", cfg.metrics_port)

    nc = await nats.connect(cfg.nats_url)
    log.info("connected to NATS %s", cfg.nats_url)

    with neo4j_writer.bolt_driver(cfg.neo4j_uri, cfg.neo4j_user, cfg.neo4j_password) as driver:
        stop = asyncio.Event()

        async def _on_message(msg: Msg) -> None:
            await handle_message(driver, msg)

        sub = await nc.subscribe(cfg.nats_subject, cb=_on_message)
        log.info("subscribed to %s (core NATS, no persistence)", cfg.nats_subject)

        def _shutdown(*_: object) -> None:
            log.info("shutdown signal received")
            stop.set()

        loop = asyncio.get_running_loop()
        for sig in (signal.SIGINT, signal.SIGTERM):
            loop.add_signal_handler(sig, _shutdown)

        await stop.wait()
        await sub.unsubscribe()

    await nc.drain()
    log.info("shutdown complete")


def main() -> None:
    cfg = from_env()
    logging.basicConfig(
        level=cfg.log_level,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    with suppress(KeyboardInterrupt):
        asyncio.run(run(cfg))


if __name__ == "__main__":
    main()
