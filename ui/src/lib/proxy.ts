/**
 * Base URL of services/neo4j-proxy (FHIR, OMOP, NLQ, federated, TCK).
 * The compose stack and ACA set NEO4J_PROXY_URL; the default is a proxy
 * started locally with `npm run dev` in services/neo4j-proxy.
 */
export const NEO4J_PROXY_URL =
  process.env.NEO4J_PROXY_URL ?? "http://localhost:9090";
