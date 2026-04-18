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
from nats.js.api import AckPolicy, ConsumerConfig, DeliverPolicy
from neo4j import Driver
from pydantic import ValidationError

from . import mapping, metrics, neo4j_writer
from .config import Config, from_env
from .models import CrawlEnvelope

log = logging.getLogger("catalog-enricher")


async def handle_message(driver: Driver, msg: nats.aio.msg.Msg) -> None:
    try:
        raw = json.loads(msg.data.decode("utf-8"))
        envelope = CrawlEnvelope.model_validate(raw)
    except (json.JSONDecodeError, ValidationError) as e:
        log.warning("rejecting malformed envelope: %s", e)
        metrics.messages_total.labels(outcome="schema_error").inc()
        await msg.ack()
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
        await msg.ack()
    except Exception:  # noqa: BLE001
        # No ack — NATS will redeliver. Don't tight-loop: sleep briefly.
        log.exception("neo4j write failed — will redeliver")
        metrics.messages_total.labels(outcome="neo4j_error").inc()
        await asyncio.sleep(2)


async def run(cfg: Config) -> None:
    metrics.start_metrics_server(cfg.metrics_port)
    log.info("metrics on :%d", cfg.metrics_port)

    nc = await nats.connect(cfg.nats_url)
    js = nc.jetstream()
    await js.add_consumer(
        stream="DATASPACE",
        config=ConsumerConfig(
            durable_name=cfg.nats_consumer,
            deliver_policy=DeliverPolicy.ALL,
            ack_policy=AckPolicy.EXPLICIT,
            filter_subject=cfg.nats_subject,
        ),
    )
    sub = await js.pull_subscribe(cfg.nats_subject, durable=cfg.nats_consumer)
    log.info("subscribed to %s (consumer=%s)", cfg.nats_subject, cfg.nats_consumer)

    with neo4j_writer.bolt_driver(cfg.neo4j_uri, cfg.neo4j_user, cfg.neo4j_password) as driver:
        stop = asyncio.Event()

        def _shutdown(*_: object) -> None:
            log.info("shutdown signal received")
            stop.set()

        loop = asyncio.get_running_loop()
        for sig in (signal.SIGINT, signal.SIGTERM):
            loop.add_signal_handler(sig, _shutdown)

        while not stop.is_set():
            try:
                msgs = await sub.fetch(batch=10, timeout=5)
            except TimeoutError:
                continue
            except Exception:  # noqa: BLE001
                log.exception("fetch error")
                await asyncio.sleep(2)
                continue
            for msg in msgs:
                await handle_message(driver, msg)

    await nc.close()
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
