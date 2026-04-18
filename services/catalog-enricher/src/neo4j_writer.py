"""Idempotent MERGE-only Cypher for federated HealthDataset upserts.

All writes tag nodes with source='federated' and stamp lastSeenAt so stale
entries are visible in the audit dashboard. Ontology linking uses the same
SnomedConcept / LoincCode / ICD10Code nodes the 5-layer graph already has.
"""

from __future__ import annotations

import logging
from contextlib import contextmanager
from typing import Iterator

from neo4j import Driver, GraphDatabase

from .mapping import known_theme_system, split_theme
from .models import DatasetUpsert

log = logging.getLogger(__name__)


UPSERT_DATASET = """
MERGE (d:HealthDataset {datasetId: $datasetId})
SET d.title        = $title,
    d.description  = $description,
    d.license       = $license,
    d.country       = $country,
    d.source        = 'federated',
    d.publisherDid  = $publisherDid,
    d.lastSeenAt    = datetime($lastSeenAt)
MERGE (p:Participant {participantId: $publisherDid})
  ON CREATE SET p.source = 'dcp',
                p.walletType = 'business',
                p.name = $publisherDid
MERGE (d)-[:PUBLISHED_BY]->(p)
"""

UPSERT_DISTRIBUTION = """
MATCH (d:HealthDataset {datasetId: $datasetId})
MERGE (dist:Distribution {datasetId: $datasetId, accessUrl: $accessUrl})
  SET dist.format = $format
MERGE (d)-[:HAS_DISTRIBUTION]->(dist)
"""

LINK_KNOWN_THEME = """
MATCH (d:HealthDataset {datasetId: $datasetId})
MERGE (t:{label} {code: $code})
  ON CREATE SET t.system = $system, t.source = 'federated-crawl'
MERGE (d)-[:HAS_THEME]->(t)
"""

RECORD_UNKNOWN_THEME = """
MATCH (d:HealthDataset {datasetId: $datasetId})
SET d.unknownThemes = coalesce(d.unknownThemes, []) + $theme
"""

UPSERT_POLICY = """
MATCH (d:HealthDataset {datasetId: $datasetId})
MERGE (policy:OdrlPolicy {policyId: $policyId})
  SET policy.json = $policyJson,
      policy.source = 'federated',
      policy.publisherDid = $publisherDid
MERGE (d)-[:GOVERNED_BY]->(policy)
"""

AUDIT_EVENT = """
CREATE (e:CatalogEnrichmentEvent {
  ts: datetime($ts),
  participantDid: $participantDid,
  datasetsUpserted: $datasetsUpserted,
  themesUnknown: $themesUnknown
})
"""


@contextmanager
def bolt_driver(uri: str, user: str, password: str) -> Iterator[Driver]:
    driver = GraphDatabase.driver(uri, auth=(user, password))
    try:
        yield driver
    finally:
        driver.close()


def write_datasets(
    driver: Driver,
    envelope_ts: str,
    publisher_did: str,
    datasets: list[DatasetUpsert],
) -> tuple[int, int]:
    """Upsert datasets + distributions + themes + policies.

    Returns (datasets_upserted, themes_unknown_count).
    """
    themes_unknown = 0
    with driver.session() as session:
        for ds in datasets:
            session.run(
                UPSERT_DATASET,
                datasetId=ds.dataset_id,
                title=ds.title,
                description=ds.description,
                license=ds.license,
                country=ds.country,
                publisherDid=ds.publisher_did,
                lastSeenAt=ds.last_seen_at.isoformat(),
            )
            for dist in ds.distributions:
                session.run(
                    UPSERT_DISTRIBUTION,
                    datasetId=ds.dataset_id,
                    accessUrl=dist.get("accessUrl", ""),
                    format=dist.get("format", ""),
                )
            for theme in ds.themes:
                label = known_theme_system(theme)
                if label:
                    system, code = split_theme(theme)
                    session.run(
                        LINK_KNOWN_THEME.replace("{label}", label),
                        datasetId=ds.dataset_id,
                        code=code,
                        system=system,
                    )
                else:
                    themes_unknown += 1
                    session.run(
                        RECORD_UNKNOWN_THEME,
                        datasetId=ds.dataset_id,
                        theme=theme,
                    )
            if ds.odrl_policy:
                policy_id = (
                    (ds.odrl_policy.get("@id") if isinstance(ds.odrl_policy, dict) else None)
                    or f"policy:{ds.dataset_id}"
                )
                session.run(
                    UPSERT_POLICY,
                    datasetId=ds.dataset_id,
                    policyId=policy_id,
                    policyJson=str(ds.odrl_policy),
                    publisherDid=ds.publisher_did,
                )
        session.run(
            AUDIT_EVENT,
            ts=envelope_ts,
            participantDid=publisher_did,
            datasetsUpserted=len(datasets),
            themesUnknown=themes_unknown,
        )
    return len(datasets), themes_unknown
