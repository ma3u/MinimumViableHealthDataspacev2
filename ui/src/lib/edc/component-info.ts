/**
 * Static metadata catalog for all EDC dataspace components.
 * Used by the /admin/components page to render info popovers.
 */

export interface ComponentMeta {
  description: string;
  protocol: string;
  ports: string;
  dependsOn: string[];
  healthSource: string;
}

export const COMPONENT_INFO: Record<string, ComponentMeta> = {
  "Control Plane": {
    description:
      "Central management API for the EDC connector. Hosts the DSP (Dataspace Protocol) endpoints for catalog queries, contract negotiation, and transfer process state machines. Persists state in PostgreSQL.",
    protocol: "DSP 2025-1 (Catalog, Negotiation, Transfer)",
    ports: "11003 → 8081 (HTTP)",
    dependsOn: ["PostgreSQL", "Vault", "NATS"],
    healthSource: "Docker healthcheck (/api/check/health)",
  },
  // siglet is the data plane on EDC 1.0 (runtimes/edc/README.md,
  // jad/siglet-edc1.toml); the JAD data planes left with EDC 0.18 (#927).
  "Data Plane (siglet)": {
    description:
      "The data plane on EDC 1.0. It answers the control plane's Data Plane Signaling and issues the access token. The consumer reads the endpoint and token from it; the Neo4j Proxy checks the token against siglet's JWKS and serves the dataset the token names.",
    protocol: "DPS 1.0 (Data Plane Signaling)",
    ports:
      "8080 (JWKS, tokens), 8081 (signaling), 8082 (token refresh), 8083 (management)",
    dependsOn: ["Control Plane", "Vault"],
    healthSource: "Docker container state",
  },
  // DCP v1.0 is what the stack speaks: EDC 1.0's IdentityHub uses the
  // https://w3id.org/dspace-dcp/v1.0/ namespace and the
  // org.eclipse.dspace.dcp.vc.type scopes. A "dcp-2025-1" in a CFM dataspace
  // profile (scripts/seed-cfm.sh) is only the tag CFM stores in its
  // protocolStack; nothing negotiates on it.
  "Identity Hub": {
    description:
      "DCP v1.0 credential storage and presentation service. Stores W3C Verifiable Credentials. Creates Verifiable Presentations for DSP protocol handshake authentication.",
    protocol: "DCP v1.0 (Decentralized Claims Protocol)",
    ports: "11005 → 7081 (HTTP)",
    dependsOn: ["PostgreSQL", "Vault"],
    healthSource: "Docker healthcheck (/api/check/health)",
  },
  "Issuer Service": {
    description:
      "Trust anchor for Verifiable Credential issuance. Issues EHDSParticipantCredential, DataProcessingPurposeCredential, and DataQualityLabelCredential with StatusList2021 revocation.",
    protocol: "W3C VC / StatusList2021",
    ports: "10013 (HTTP)",
    dependsOn: ["PostgreSQL", "Vault"],
    healthSource: "Docker healthcheck",
  },
  Keycloak: {
    description:
      "OAuth2 / OIDC identity provider. Manages user authentication, SSO sessions, and client credential grants for service-to-service communication.",
    protocol: "OAuth2 / OIDC / PKCE",
    ports: "8080 (HTTP), 9000 (management)",
    dependsOn: ["PostgreSQL"],
    healthSource: "Docker healthcheck (/health/ready)",
  },
  Vault: {
    description:
      "HashiCorp Vault for secret management. Stores signing keys, STS client secrets, and transfer tokens. Provides transit engine for key operations.",
    protocol: "Vault HTTP API v1",
    ports: "8200 (HTTP)",
    dependsOn: [],
    healthSource: "Docker healthcheck (/v1/sys/health)",
  },
  "Vault Bootstrap": {
    description:
      "Idempotent initialisation sidecar that unseals Vault, enables the transit engine, and writes initial secrets required by the EDC services.",
    protocol: "Vault HTTP API v1",
    ports: "— (init job)",
    dependsOn: ["Vault"],
    healthSource: "Exit code (one-shot job)",
  },
  PostgreSQL: {
    description:
      "Shared relational database with a database per service: the control plane, IdentityHub, IssuerService and Keycloak. Each service migrates its own schema.",
    protocol: "PostgreSQL wire protocol",
    ports: "5432 (TCP)",
    dependsOn: [],
    healthSource: "Docker healthcheck (pg_isready)",
  },
  NATS: {
    description:
      "JetStream messaging broker. Carries the control plane's internal events (contract state changes, transfer signals).",
    protocol: "NATS / JetStream",
    ports: "4222 (client), 8222 (monitoring)",
    dependsOn: [],
    healthSource: "Docker healthcheck (/healthz)",
  },
  Neo4j: {
    description:
      "5-layer health knowledge graph (Marketplace, HealthDCAT-AP, FHIR, OMOP, Ontology). Stores ~57K nodes; serves Bolt queries and browser UI.",
    protocol: "Bolt / HTTP",
    ports: "7474 (browser), 7687 (Bolt)",
    dependsOn: [],
    healthSource: "Docker healthcheck (cypher-shell)",
  },
  "Neo4j Proxy": {
    description:
      "HTTP-to-Cypher bridge. Serves the FHIR and OMOP datasets a transfer reads, translating REST calls into Cypher queries against Neo4j.",
    protocol: "HTTP REST → Bolt",
    ports: "9090 (HTTP)",
    dependsOn: ["Neo4j"],
    healthSource: "Docker healthcheck",
  },
  Traefik: {
    description:
      "Reverse proxy / API gateway. Routes external traffic to internal services via path-based routing. Provides TLS termination and load balancing.",
    protocol: "HTTP / HTTPS",
    ports: "80, 8090 (dashboard)",
    dependsOn: [],
    healthSource: "Docker healthcheck (/ping)",
  },
  UI: {
    description:
      "Next.js 14 admin portal — the Graph Explorer UI you are currently using. Provides participant onboarding, data sharing, operator dashboard, and compliance views.",
    protocol: "HTTP (Next.js SSR)",
    ports: "3000 (HTTP)",
    dependsOn: ["Keycloak", "Control Plane"],
    healthSource: "Docker healthcheck (curl /api/health)",
  },
};
