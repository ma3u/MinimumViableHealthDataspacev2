"""Target-list reader.

Cypher that returns every participant the crawler should attempt this
cycle. Uses the `source` + `crawlerEnabled` fields introduced by
`neo4j/participant-source-init.cypher` in Phase 26a, so operators can
take a participant out of rotation by setting `crawlerEnabled=false`
without deleting the row.
"""

from __future__ import annotations

from neo4j import Driver

from .models import Participant

TARGETS_CYPHER = """
MATCH (p:Participant)
WHERE p.source IN ['dcp','business-wallet','private-wallet','seed']
  AND p.dspCatalogUrl IS NOT NULL
  AND p.dspCatalogUrl <> ''
  AND coalesce(p.crawlerEnabled, true) = true
RETURN p.participantId AS participant_id,
       coalesce(p.name, p.participantId) AS name,
       p.dspCatalogUrl AS dsp_catalog_url,
       p.country AS country,
       p.walletType AS wallet_type
ORDER BY p.participantId
"""


def load_targets(driver: Driver) -> list[Participant]:
    """Return all enabled crawl targets. Returns [] if Neo4j is
    unavailable — the crawl loop logs and moves on rather than crashing."""
    with driver.session() as session:
        result = session.run(TARGETS_CYPHER)
        return [Participant(**record.data()) for record in result]
