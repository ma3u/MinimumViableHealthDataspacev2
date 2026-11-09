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
from .models import DatasetUpsert, ServiceUpsert

log = logging.getLogger(__name__)


# The access body that governs the dataset (healthdcatap:hdab, Release 8).
LINK_HDAB = """
MATCH (d:HealthDataset {datasetId: $datasetId})
MERGE (h:Participant {participantId: $hdabDid})
  ON CREATE SET h.source = 'federated-crawl'
MERGE (h)-[:GOVERNS]->(d)
"""

UPSERT_DATASET = """
MERGE (d:HealthDataset {datasetId: $datasetId})
SET d.title        = $title,
    d.description  = $description,
    d.license       = $license,
    d.country       = $country,
    d.source        = 'federated',
    d.publisherDid  = $publisherDid,
    d.lastSeenAt    = datetime($lastSeenAt),
    // HealthDCAT-AP Release 8 (#700): what the publisher states wins; an
    // absent value keeps what the graph has.
    d.hdcatapAccessRights          = coalesce($accessRights, d.hdcatapAccessRights),
    d.hdcatapApplicableLegislation = CASE WHEN size($applicableLegislation) > 0
                                     THEN $applicableLegislation ELSE d.hdcatapApplicableLegislation END,
    d.hdcatapHealthCategories      = CASE WHEN size($healthCategories) > 0
                                     THEN $healthCategories ELSE d.hdcatapHealthCategories END,
    d.hdcatapHealthThemes          = CASE WHEN size($healthThemes) > 0
                                     THEN $healthThemes ELSE d.hdcatapHealthThemes END,
    d.hdcatapCodingSystems         = CASE WHEN size($codingSystems) > 0
                                     THEN $codingSystems ELSE d.hdcatapCodingSystems END,
    d.hdcatapHasStructuredData     = coalesce($hasStructuredData, d.hdcatapHasStructuredData),
    d.hdcatapKeywords              = CASE WHEN size($keywords) > 0
                                     THEN $keywords ELSE d.hdcatapKeywords END
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

# A dcat:DataService of another data space (#934), e.g. a bonus programme.
UPSERT_SERVICE = """
MERGE (s:DataService {serviceId: $serviceId})
SET s.title                 = $title,
    s.description           = $description,
    s.source                = 'federated',
    s.publisherDid          = $publisherDid,
    s.publisherName         = $publisherName,
    s.endpointUrl           = $endpointUrl,
    s.themes                = $themes,
    s.keywords              = $keywords,
    s.accessRights          = $accessRights,
    s.applicableLegislation = $applicableLegislation,
    s.conformsTo            = $conformsTo,
    s.ruleId                = $ruleId,
    s.ruleTitle             = $ruleTitle,
    s.ruleDescription       = $ruleDescription,
    s.ruleVersion           = $ruleVersion,
    s.lastSeenAt            = datetime($lastSeenAt)
MERGE (p:Participant {participantId: $publisherDid})
  ON CREATE SET p.source = 'dcp',
                p.walletType = 'business',
                p.name = coalesce($publisherName, $publisherDid)
MERGE (s)-[:PUBLISHED_BY]->(p)
"""

# Labels come from mapping.KNOWN_SERVICE_KINDS only, never from the catalogue.
LABEL_SERVICE = """
MATCH (s:DataService {serviceId: $serviceId})
SET s:{label}
"""

AUDIT_EVENT = """
CREATE (e:CatalogEnrichmentEvent {
  ts: datetime($ts),
  participantDid: $participantDid,
  datasetsUpserted: $datasetsUpserted,
  servicesUpserted: $servicesUpserted,
  themesUnknown: $themesUnknown
})
"""

KNOWN_LABELS = {"BonusProgramme"}


@contextmanager
def bolt_driver(uri: str, user: str, password: str) -> Iterator[Driver]:
    driver = GraphDatabase.driver(uri, auth=(user, password))
    try:
        yield driver
    finally:
        driver.close()


def write_services(driver: Driver, services: list[ServiceUpsert]) -> int:
    """Upsert dcat:DataService nodes and their kind labels (#934). Returns the count."""
    with driver.session() as session:
        for sv in services:
            session.run(
                UPSERT_SERVICE,
                serviceId=sv.service_id,
                title=sv.title,
                description=sv.description,
                publisherDid=sv.publisher_did,
                publisherName=sv.publisher_name,
                endpointUrl=sv.endpoint_url,
                themes=sv.themes,
                keywords=sv.keywords,
                accessRights=sv.access_rights,
                applicableLegislation=sv.applicable_legislation,
                conformsTo=sv.conforms_to,
                ruleId=sv.rule_id,
                ruleTitle=sv.rule_title,
                ruleDescription=sv.rule_description,
                ruleVersion=sv.rule_version,
                lastSeenAt=sv.last_seen_at.isoformat(),
            )
            for label in sv.kinds:
                if label in KNOWN_LABELS:
                    session.run(LABEL_SERVICE.replace("{label}", label), serviceId=sv.service_id)
    return len(services)


def write_datasets(
    driver: Driver,
    envelope_ts: str,
    publisher_did: str,
    datasets: list[DatasetUpsert],
    services_upserted: int = 0,
) -> tuple[int, int]:
    """Upsert datasets + distributions + themes + policies.

    Returns (datasets_upserted, themes_unknown_count). The audit event also
    records the services write_services() wrote for the same envelope.
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
                accessRights=ds.access_rights,
                applicableLegislation=ds.applicable_legislation,
                healthCategories=ds.health_categories,
                healthThemes=ds.health_themes,
                codingSystems=ds.coding_systems,
                hasStructuredData=ds.has_structured_data,
                keywords=ds.keywords,
            )
            if ds.hdab_did:
                session.run(LINK_HDAB, datasetId=ds.dataset_id, hdabDid=ds.hdab_did)
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
            servicesUpserted=services_upserted,
            themesUnknown=themes_unknown,
        )
    return len(datasets), themes_unknown
