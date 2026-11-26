/**
 * The register of the federation's members (ADR-100 decision 5, draft SPE
 * implementing act Art. 18(1), #1236).
 *
 * Each workspace is a HealthDCAT-AP dcat:DataService. This list is the one
 * source: `ui/public/federation/members.jsonld` is generated from it (the
 * public register, in the static documentation site and on the live hub
 * alike, so no anonymous API route is needed and ADR-044 stands), /catalog
 * shows it to a signed-in participant, and the SPE registration cyphers
 * (`neo4j/register-fhir-dataset-hdcatap-spe{1,2}.cypher`) write the same
 * node into each workspace's own graph; a unit test keeps all three equal.
 *
 * A change of status (admitted, suspended, excluded) is a decision of the
 * access body under the federation agreement
 * (docs/governance/federation-agreement.md), recorded here as a commit. The
 * attestation label a workspace must carry to be admitted is part of the
 * register; the label of its latest attestation is on /admin/attestation.
 *
 * Fictional organisations only. No server imports: client components use it.
 */

export type MembershipStatus = "admitted" | "suspended" | "excluded";

export interface FederationParty {
  name: string;
  /** A did:web for a participant; the hub operator has none, so its agent IRI. */
  id: string;
}

export interface FederationMember {
  /** `service:spe-<n>`, the DataService node's serviceId. */
  serviceId: string;
  speId: "SPE-1" | "SPE-2";
  title: string;
  publisher: FederationParty;
  /** The workspace's HealthDataset, as its registration cypher names it. */
  servesDataset: string;
  status: MembershipStatus;
  /** ISO date the access body admitted the instance. */
  admitted: string;
  /** The agreement version the member signed. */
  agreementVersion: string;
  /** The attestation label of ADR-068 decision 5 required for admission. */
  attestationRequired: string;
}

const FEDERATION_AGREEMENT_VERSION = "1.0";

export const FEDERATION_AGREEMENT_URL =
  "https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/docs/governance/federation-agreement.md";

const FEDERATION_RULES_URL =
  "https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/docs/architecture/federation.md";

/** Where the register is published, relative to the site root. */
export const FEDERATION_REGISTER_PATH = "/federation/members.jsonld";

/**
 * Until the gateway of ADR-100 decision 2 exists, a workspace answers only
 * the coordinator, so every member is reached through the coordinator's
 * federated endpoint. Step 4 replaces this with each workspace's own
 * `POST /federated/run`.
 */
export const COORDINATOR_ENDPOINT = "https://ehds.mabu.red/api/federated";

export const COORDINATOR: FederationParty = {
  name: "Health MVD Operator",
  id: "https://ehds.mabu.red/agents/operator",
};

export const ACCESS_BODY: FederationParty = {
  name: "MedReg DE",
  id: "did:web:medreg.de:hdab",
};

export const CONFORMS_TO = [
  "https://ohdsi.github.io/CommonDataModel/cdm54.html",
  "http://hl7.org/fhir/R4",
] as const;

export const FEDERATION_MEMBERS: readonly FederationMember[] = [
  {
    serviceId: "service:spe-1",
    speId: "SPE-1",
    title: "SPE-1, the secure processing environment of AlphaKlinik Berlin",
    publisher: {
      name: "AlphaKlinik Berlin",
      id: "did:web:alpha-klinik.de:participant",
    },
    servesDataset: "dataset:synthea-fhir-r4-spe1",
    status: "admitted",
    admitted: "2026-11-26",
    agreementVersion: FEDERATION_AGREEMENT_VERSION,
    attestationRequired: "Attested: confidential workload",
  },
  {
    serviceId: "service:spe-2",
    speId: "SPE-2",
    title: "SPE-2, the secure processing environment of Limburg Medical Centre",
    publisher: {
      name: "Limburg Medical Centre",
      id: "did:web:lmc.nl:clinic",
    },
    servesDataset: "dataset:synthea-fhir-r4-spe2",
    status: "admitted",
    admitted: "2026-11-26",
    agreementVersion: FEDERATION_AGREEMENT_VERSION,
    attestationRequired: "Attested: confidential workload",
  },
];

const BASE = "https://ehds.mabu.red/federation/";

/**
 * The register as HealthDCAT-AP JSON-LD: a dcat:Catalog of the coordinator
 * whose dcat:service entries are the members.
 */
export function federationRegisterJsonLd(
  members: readonly FederationMember[] = FEDERATION_MEMBERS,
): Record<string, unknown> {
  return {
    "@context": {
      dcat: "http://www.w3.org/ns/dcat#",
      dct: "http://purl.org/dc/terms/",
      foaf: "http://xmlns.com/foaf/0.1/",
      xsd: "http://www.w3.org/2001/XMLSchema#",
      dcatap: "http://data.europa.eu/r5r/",
      eli: "http://data.europa.eu/eli/ontology#",
      ehds: "https://w3id.org/ehds/",
    },
    "@id": `${BASE}members`,
    "@type": "dcat:Catalog",
    "dct:title": {
      "@value": "Members of the MVHD SPE federation",
      "@language": "en",
    },
    "dct:description": {
      "@value":
        "The secure processing environments of the federation (Regulation (EU) 2025/327, Art. 73; draft SPE implementing act Art. 18(1)), with their membership status under the federation agreement.",
      "@language": "en",
    },
    "dct:publisher": party(COORDINATOR),
    "dcatap:applicableLegislation": {
      "@id": "http://data.europa.eu/eli/reg/2025/327/oj",
      "@type": "eli:LegalResource",
    },
    "dcat:themeTaxonomy": {
      "@id": "http://publications.europa.eu/resource/authority/data-theme",
    },
    "ehds:accessBody": party(ACCESS_BODY),
    "ehds:federationAgreement": {
      "@id": FEDERATION_AGREEMENT_URL,
      "dct:hasVersion": FEDERATION_AGREEMENT_VERSION,
    },
    "dcat:service": members.map((m) => ({
      "@id": `${BASE}${m.serviceId.replace("service:", "")}`,
      "@type": "dcat:DataService",
      "dct:identifier": m.serviceId,
      "dct:title": { "@value": m.title, "@language": "en" },
      "dct:publisher": party(m.publisher),
      "dcat:endpointURL": { "@id": COORDINATOR_ENDPOINT },
      "dcat:endpointDescription": { "@id": FEDERATION_RULES_URL },
      // The dataset is held inside the workspace and described there, not in
      // the hub's catalogue; a typed dcat:servesDataset would have to repeat
      // its whole HealthDCAT-AP description here, so the register names it.
      "ehds:servesDatasetId": m.servesDataset,
      "dct:conformsTo": CONFORMS_TO.map((c) => ({
        "@id": c,
        "@type": "dct:Standard",
      })),
      "ehds:membershipStatus": m.status,
      "ehds:admitted": { "@value": m.admitted, "@type": "xsd:date" },
      "ehds:agreementVersion": m.agreementVersion,
      "ehds:attestationRequired": m.attestationRequired,
    })),
  };
}

function party(p: FederationParty): Record<string, unknown> {
  return { "@id": p.id, "@type": "foaf:Organization", "foaf:name": p.name };
}

/** The register as it is written to the public file, with a final newline. */
export function federationRegisterFile(): string {
  return `${JSON.stringify(federationRegisterJsonLd(), null, 2)}\n`;
}
