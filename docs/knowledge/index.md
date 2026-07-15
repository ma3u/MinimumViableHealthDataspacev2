# Knowledge bundle (OKF v0.1)

One concept per file; the path is the concept identity; concepts cross-link into
a graph. Change history in [log.md](log.md). Populated only from real repo
content — gaps are marked `UNKNOWN`.

## services/ — running components

[neo4j](services/neo4j.md) · [neo4j-proxy](services/neo4j-proxy.md) ·
[ui](services/ui.md) · [keycloak](services/keycloak.md) ·
[catalog-crawler](services/catalog-crawler.md) ·
[catalog-enricher](services/catalog-enricher.md) ·
[nats](services/nats.md) · [vault](services/vault.md) ·
[postgres](services/postgres.md)

## datamodels/ — graph & wire formats

[graph-5layer](datamodels/graph-5layer.md) ·
[fhir-r4-nodes](datamodels/fhir-r4-nodes.md) ·
[omop-cdm-nodes](datamodels/omop-cdm-nodes.md) ·
[dsp-contract-chain](datamodels/dsp-contract-chain.md) ·
[healthdcat-ap](datamodels/healthdcat-ap.md) ·
[participant-directory](datamodels/participant-directory.md)

## apis/ — surfaces & contracts

[nextjs-api-routes](apis/nextjs-api-routes.md) ·
[neo4j-proxy-endpoints](apis/neo4j-proxy-endpoints.md) ·
[mock-fixtures](apis/mock-fixtures.md)

## runbooks/ — operational procedures

[local-minimal-stack](runbooks/local-minimal-stack.md) ·
[jad-stack-seeding](runbooks/jad-stack-seeding.md) ·
[azure-deploy](runbooks/azure-deploy.md) ·
[keycloak-realm-drift](runbooks/keycloak-realm-drift.md) ·
[federated-discovery](runbooks/federated-discovery.md)

## decisions/

[decisions/index.md](decisions/index.md) → canonical ADR corpus in `docs/ADRs/`.
