# Gotchas

Non-obvious pitfalls across the stack. Ordered newest first; add a new
entry at the top when you hit something that cost you more than 30 minutes.

## 2026-04 — Neo4j 5 vector indexes are single-label only

`CREATE VECTOR INDEX foo FOR (n:A|B|C) ON (n.embedding)` **does not
parse** in Neo4j 5 community — the `|` multi-label syntax is reserved for
graph patterns, not index definitions. You get:

```
Invalid input '|': expected ')' (line 2, column 15)
"FOR (n:Patient|Encounter|Condition|..."
              ^
```

**Workaround (ADR-019):** apply a shared marker label to every node you
want in the index, then index that one label.

```cypher
MATCH (n) WHERE n.embedding IS NOT NULL SET n:Embedded;

CREATE VECTOR INDEX node_fastrp_index IF NOT EXISTS
FOR (n:Embedded) ON n.embedding
OPTIONS { indexConfig: {
  `vector.dimensions`: 256,
  `vector.similarity_function`: 'cosine'
}};
```

See `neo4j/register-embeddings-fastrp.cypher`. The existing schema label
(`:Patient`, `:HealthDataset`, etc.) is preserved; `:Embedded` is
additional and carries no semantic meaning beyond "this node has an
embedding and lives in the vector index."

## 2026-04 — `gds.graph.project.cypher` fails on dangling relationships

When the Cypher relationship-query returns edges whose target node is
not in the node-query (e.g. a `TransferEvent` linked out to an audit
node that isn't part of the curated label set), GDS throws:

```
Failed to load a relationship because its target-node with id 33174
is not part of the node query or projection.
```

**Fix:** pass `validateRelationships: false` as the fourth argument:

```cypher
CALL gds.graph.project.cypher(
  'health-dataspace-rp',
  'MATCH (n) WHERE any(l IN labels(n) WHERE l IN [...]) RETURN id(n), labels(n)',
  'MATCH (a)-[r]->(b) WHERE type(r) IN [...] RETURN id(a), id(b), type(r)',
  { validateRelationships: false }
)
```

The out-of-projection relationships are silently skipped; only edges
between projected nodes contribute to the FastRP walk. Acceptable for
our use — we pick the label set deliberately.

## 2026-04 — GDS heap is greedy: bump Neo4j memory before enabling

`NEO4J_PLUGINS=["apoc","graph-data-science"]` on a 512m-heap container
boots fine but dies the moment `gds.graph.project.cypher` runs:

```
Java heap space
```

**Settings that work locally (`docker-compose.yml`):**

```yaml
NEO4J_server_memory_heap_initial__size: 1G
NEO4J_server_memory_heap_max__size: 2G
NEO4J_server_memory_pagecache_size: 1G
```

**Settings that work on Azure (`scripts/azure/graphrag-deploy.yml`):**

```yaml
NEO4J_server_memory_heap_initial__size: 2G
NEO4J_server_memory_heap_max__size: 4G
NEO4J_server_memory_pagecache_size: 2G
```

The full 5300+ node 5-layer graph is small (FastRP finishes in
~300 ms), but GDS's working set is still heap-hungry — give it room.

## 2026-04 — `AZURE_OPENAI_GPT4O_URL` is a misleading env-var name

`services/neo4j-proxy/src/index.ts` reads
`process.env.AZURE_OPENAI_GPT4O_URL` for the chat-completions endpoint.
The name dates from the ADR-019 draft, which assumed a `gpt-4o-mini`
deployment. The deployed model on this project is **`gpt-5-mini`**; the
env var is still `AZURE_OPENAI_GPT4O_URL` for back-compat.

The URL it points to is the full deployment-specific chat-completions
URL, e.g.

```
https://oai-mvhd-5f53b7.openai.azure.com/openai/deployments/gpt-5-mini/chat/completions?api-version=2024-10-21
```

Do not rename the env var without also updating every consumer — see
`scripts/azure/07-ai-foundry.sh` for the Azure wiring and
`.github/workflows/graphrag-deploy.yml` for how it's refreshed.

## 2026-04 — ACA `:latest` tag is cached; job won't re-pull on start

Pushing a new `mvhd-neo4j-seed:latest` to ACR and calling
`az containerapp job start` re-runs the **old** image. ACA pulls
`:latest` only when the container-app spec changes — a simple tag push
doesn't.

**Fix:** `az containerapp job update --image ... --set-env-vars
"SEED_DEPLOY_TS=$(date)"` before starting. The env-var change forces a
spec update, and the `:latest` pull happens on the next execution.

See `.github/workflows/graphrag-deploy.yml` "Force seed job to pull
fresh :latest image" step.

## 2026-04 — Personal `az` CLI loses ACA write perms after ~1 hour

On subscription `INF-STG-EU_EHDS` the personal account holds
`Microsoft.App/*` through a time-limited PIM activation that silently
expires. `az account get-access-token` keeps succeeding; only the
write-side operations fail with:

```
AuthorizationFailed: does not have authorization to perform action
'Microsoft.App/jobs/start/action'
```

**Use the CI service principal for any ACA write.** Every ACA-writing
operation is available via GitHub Actions (`deploy-azure.yml`,
`reset-demo.yml`, `graphrag-deploy.yml`, `fhir-loader.yml`). The SP has
Contributor on `rg-mvhd-dev` + Reader on the subscription, which is
stable.

Memory entry: `project_aca_job_write_via_ci.md`.

## 2025 — Neo4j short service name required on ACA TCP ingress

Connecting to `mvhd-neo4j` from another ACA container must use the short
service name **`bolt://mvhd-neo4j:7687`** — the `*.internal.<domain>`
FQDN used for HTTP ingress silently times out on the Bolt TCP port.

This applies to every Bolt client: `neo4j-proxy`, the `mvhd-neo4j-seed`
job, the forthcoming `mvhd-catalog-enricher`.

See ADR-018 / memory `project_aca_tcp_ingress_shortname.md`.
