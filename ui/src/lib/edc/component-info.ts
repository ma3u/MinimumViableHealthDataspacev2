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
  "Data Plane FHIR": {
    description:
      "DCore-based data plane for FHIR R4 clinical data. Implements HttpData-PUSH transfer type. Selected by DataPlaneSelectorService when allowedTransferTypes matches HttpData-PUSH.",
    protocol: "DPS (Data Plane Signaling)",
    ports: "11002 (HTTP)",
    dependsOn: ["Control Plane", "Vault"],
    healthSource: "Docker healthcheck (/api/check/health)",
  },
  "Data Plane OMOP": {
    description:
      "DCore-based data plane for OMOP CDM research analytics. Implements HttpData-PULL transfer type. Proxies Cypher queries through Neo4j Proxy.",
    protocol: "DPS (Data Plane Signaling)",
    ports: "11012 (HTTP)",
    dependsOn: ["Control Plane", "Vault", "Neo4j Proxy"],
    healthSource: "Docker healthcheck (/api/check/health)",
  },
  "Identity Hub": {
    description:
      "DCP v1.0 credential storage and presentation service. Stores W3C Verifiable Credentials. Creates Verifiable Presentations for DSP protocol handshake authentication.",
    protocol: "DCP v1.0 (Credential Protocol)",
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
      "Idempotent initialisation sidecar that unseals Vault, enables the transit engine, and writes initial secrets required by EDC-V and CFM services.",
    protocol: "Vault HTTP API v1",
    ports: "— (init job)",
    dependsOn: ["Vault"],
    healthSource: "Exit code (one-shot job)",
  },
  "Tenant Manager": {
    description:
      "CFM multi-tenant lifecycle manager. Creates tenants, deploys dataspace profiles, provisions VPAs (Virtual Participant Addresses).",
    protocol: "CFM REST API",
    ports: "11006 (HTTP)",
    dependsOn: ["PostgreSQL", "NATS"],
    healthSource: "Docker healthcheck",
  },
  "Provision Manager": {
    description:
      "CFM automated provisioning engine. Orchestrates the sequence of agents (Keycloak → EDC-V → Registration → Onboarding) to bring a participant to ACTIVE state.",
    protocol: "CFM REST API / NATS",
    ports: "11007 (HTTP)",
    dependsOn: ["PostgreSQL", "NATS", "Tenant Manager"],
    healthSource: "Docker healthcheck",
  },
  "EDC-V Agent": {
    description:
      "CFM agent that creates participant contexts in the EDC-V Control Plane.",
    protocol: "CFM Agent / EDC Management API",
    ports: "— (agent)",
    dependsOn: ["Control Plane", "NATS"],
    healthSource: "Docker container state",
  },
  "Keycloak Agent": {
    description:
      "CFM agent that provisions Keycloak realms, clients, and service accounts for new participants.",
    protocol: "CFM Agent / Keycloak Admin API",
    ports: "— (agent)",
    dependsOn: ["Keycloak", "NATS"],
    healthSource: "Docker container state",
  },
  "Registration Agent": {
    description:
      "CFM agent that registers Verifiable Credentials with the IssuerService for new participants.",
    protocol: "CFM Agent / VC Issuance API",
    ports: "— (agent)",
    dependsOn: ["Issuer Service", "NATS"],
    healthSource: "Docker container state",
  },
  "Onboarding Agent": {
    description:
      "CFM orchestration agent that chains the full onboarding sequence: DID creation → credential issuance → participant context → catalog registration.",
    protocol: "CFM Agent / Orchestration",
    ports: "— (agent)",
    dependsOn: ["Keycloak Agent", "EDC-V Agent", "Registration Agent", "NATS"],
    healthSource: "Docker container state",
  },
  PostgreSQL: {
    description:
      "Shared relational database with isolated schemas: controlplane, dataplane, identityhub, issuerservice, keycloak, cfm, redlinedb. Each service auto-migrates its own schema.",
    protocol: "PostgreSQL wire protocol",
    ports: "5432 (TCP)",
    dependsOn: [],
    healthSource: "Docker healthcheck (pg_isready)",
  },
  NATS: {
    description:
      "JetStream messaging broker. Carries EDC-V internal events (contract state changes, transfer signals) and CFM provisioning workflow messages.",
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
      "HTTP-to-Cypher bridge. Translates REST API calls from the OMOP Data Plane into Cypher queries against Neo4j. Enables pull-based OMOP data transfer.",
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
    dependsOn: ["Keycloak", "Control Plane", "Tenant Manager"],
    healthSource: "Docker healthcheck (curl /api/health)",
  },
};
