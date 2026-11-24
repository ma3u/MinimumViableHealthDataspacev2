/**
 * The draft implementing regulation on secure processing environments
 * (Regulation (EU) 2025/327, Art. 73(5); draft Ares(2026)10903532, published
 * for feedback on 23 November 2026, applies from 26 March 2029), article by
 * article, with what this demo does about each requirement (#1225, #1236).
 *
 * English is the key; translations live in ui/src/messages/<lang>/compliance.json.
 * The hub is a demonstrator with synthetic data, so "met" means the mechanism
 * works in the demo, not that an operator is compliant.
 */

export type SpeActStatus = "met" | "partial" | "gap" | "na";

export interface SpeActEvidence {
  label: string;
  href: string;
}

export interface SpeActRequirement {
  id: string;
  chapter: "lifecycle" | "operations" | "federation";
  article: string;
  requirement: string;
  demo: string;
  status: SpeActStatus;
  evidence: SpeActEvidence[];
}

const REPO = "https://github.com/ma3u/MinimumViableHealthDataspacev2";
const adr = (n: string, file: string): SpeActEvidence => ({
  label: `ADR-${n}`,
  href: `${REPO}/blob/main/docs/ADRs/${file}`,
});
const issue = (n: number): SpeActEvidence => ({
  label: `#${n}`,
  href: `${REPO}/issues/${n}`,
});
const page = (label: string, href: string): SpeActEvidence => ({
  label,
  href,
});

const ADR_045 = adr(
  "045",
  "ADR-045-observability-and-regulatory-audit-trail.md",
);
const ADR_068 = adr(
  "068",
  "ADR-068-a-sovereign-confidential-spe-on-confidential-containers-and-trustee.md",
);
const ADR_069 = adr(
  "069",
  "ADR-069-two-spe-workspaces-as-aci-confidential-containers.md",
);
const ADR_072 = adr("072", "ADR-072-spe-workspaces-start-on-demand.md");
const ATTESTATION = page("SPE attestation", "/admin/attestation");
const AUDIT = page("Audit & Provenance", "/admin/audit");
const QUERY = page("Federated query", "/query");
const SPE_GUIDE = page(
  "SPE developer guide",
  "/docs/developer/secure-processing-environment",
);

export const DRAFT_ACT_URL =
  "https://ec.europa.eu/info/law/better-regulation/have-your-say/initiatives/17192-European-Health-Data-Space-requirements-for-secure-processing-environments_en";
export const DRAFT_PDF_URL =
  "https://ec.europa.eu/info/law/better-regulation/api/download/090166e53752f4ab";
export const OUR_FEEDBACK_URL =
  "https://ec.europa.eu/info/law/better-regulation/have-your-say/initiatives/17192-European-Health-Data-Space-requirements-for-secure-processing-environments/F33583920_en";

export const SPE_ACT_REQUIREMENTS: SpeActRequirement[] = [
  {
    id: "instance",
    chapter: "lifecycle",
    article: "Art. 3",
    requirement:
      "A separate instance for each data permit, cut off from other instances and networks, set up as the permit says.",
    demo: "One confidential workspace per data holder, not yet one per permit.",
    status: "partial",
    evidence: [ATTESTATION, ADR_069, issue(1132)],
  },
  {
    id: "staging",
    chapter: "lifecycle",
    article: "Art. 4",
    requirement:
      "A separate staging area where holders and users import data and code, checked and prepared by the access body first.",
    demo: "Holders' data arrives encrypted and its fingerprint is part of the permit; there is no staging area for users yet.",
    status: "partial",
    evidence: [ADR_068, issue(915)],
  },
  {
    id: "verify-instance",
    chapter: "lifecycle",
    article: "Art. 5(1), (2)",
    requirement:
      "Before access and throughout the permit, verify that the instance and its tools match the permit.",
    demo: "The processor's signed report must match the permit's policy hash before the key is released, again at every start.",
    status: "met",
    evidence: [ATTESTATION, ADR_069],
  },
  {
    id: "named-persons",
    chapter: "lifecycle",
    article: "Art. 5(3), (4)",
    requirement:
      "Only the persons named in the permit get in, through a secure interface, kept apart when one person holds several permits.",
    demo: "Access by role through the web interface; one key per workspace, not per permit.",
    status: "partial",
    evidence: [issue(1132)],
  },
  {
    id: "tools",
    chapter: "lifecycle",
    article: "Art. 6",
    requirement:
      "Data-science and statistics tools, and tools to work together, inside each instance.",
    demo: "Query only: questions in plain language or Cypher, answered with aggregates.",
    status: "gap",
    evidence: [QUERY, issue(1132)],
  },
  {
    id: "export",
    chapter: "lifecycle",
    article: "Art. 7",
    requirement:
      "Nothing leaves without the access body's approval, with automatic and manual checks that only non-personal data goes out.",
    demo: "Counts below 5 are hidden automatically; there is no export request and review yet.",
    status: "partial",
    evidence: [QUERY, issue(1133)],
  },
  {
    id: "deletion",
    chapter: "lifecycle",
    article: "Art. 8",
    requirement:
      "When the permit ends, access stops at once and the instance is deleted within six months, verifiably.",
    demo: "Data lives only in encrypted memory and is gone when a workspace stops; stopping is not yet tied to the permit's end.",
    status: "partial",
    evidence: [ADR_072, issue(833)],
  },
  {
    id: "documentation",
    chapter: "operations",
    article: "Art. 9(1), (2)",
    requirement:
      "Public documentation of how the requirements are met, and a public list of the tools offered.",
    demo: "Design, decisions and the operator's runbook are public; there is no list of tools yet.",
    status: "partial",
    evidence: [SPE_GUIDE, ADR_068],
  },
  {
    id: "outages",
    chapter: "operations",
    article: "Art. 9(3)",
    requirement: "Tell users about outages and planned maintenance.",
    demo: "The query page says when workspaces are starting and how long it takes.",
    status: "partial",
    evidence: [QUERY, ADR_072],
  },
  {
    id: "access-management",
    chapter: "operations",
    article: "Art. 10",
    requirement:
      "Role-based access derived from the permit, unique identities and strong authentication for every user.",
    demo: "Roles from the identity provider and EUDI Wallet sign-in; the demo's passwords are public on purpose.",
    status: "partial",
    evidence: [page("Sign in", "/auth/signin")],
  },
  {
    id: "security",
    chapter: "operations",
    article: "Art. 11",
    requirement:
      "Security management, incident reporting, records of where data is hosted, and the power to stop processing at once.",
    demo: "Hosting region on record (West Europe) and a stop button per workspace; no security management system, as befits a demo.",
    status: "partial",
    evidence: [ATTESTATION],
  },
  {
    id: "operator-no-access",
    chapter: "operations",
    article: "Art. 12",
    requirement:
      "A third-party operator does not access the personal data it hosts.",
    demo: "Confidential computing keeps the cloud operator out of the workspace's memory; the key broker is run for the access body, still in the hub's own subscription.",
    status: "met",
    evidence: [ATTESTATION, ADR_068],
  },
  {
    id: "encryption",
    chapter: "operations",
    article: "Art. 13",
    requirement:
      "Instances isolated from each other, data encrypted at rest and in transit.",
    demo: "Each workspace is its own confidential container group; the extract is encrypted and every connection uses TLS.",
    status: "met",
    evidence: [ADR_069, SPE_GUIDE],
  },
  {
    id: "api",
    chapter: "operations",
    article: "Art. 14(1)",
    requirement:
      "An API with standard file types, documentation, input validation, logging and versioning.",
    demo: "Documented, validated query API; no import or export of files.",
    status: "partial",
    evidence: [page("API reference", "/docs/developer/api")],
  },
  {
    id: "batch",
    chapter: "operations",
    article: "Art. 14(3)",
    requirement:
      "Batch jobs with the same output checks as interactive work, and a way to follow their status.",
    demo: "Queries run on demand with the same checks; there is no queue for long jobs.",
    status: "partial",
    evidence: [QUERY],
  },
  {
    id: "supervision",
    chapter: "operations",
    article: "Art. 15",
    requirement:
      "The access body can look into the environment to supervise it and step in.",
    demo: "The access body sees attestation, policies and the audit chain.",
    status: "met",
    evidence: [ATTESTATION, AUDIT],
  },
  {
    id: "logs",
    chapter: "operations",
    article: "Art. 16(1) to (3)",
    requirement:
      "Tamper-evident, write-once logs of sign-in, access, imports, processing, exports and administration.",
    demo: "A hash-chained audit log of attestation, key release, loading and deletion; not yet in write-once storage.",
    status: "partial",
    evidence: [AUDIT, ADR_045],
  },
  {
    id: "log-retention",
    chapter: "operations",
    article: "Art. 16(4)",
    requirement:
      "Keep logs five years, or one year after the permit ends if that is shorter.",
    demo: "Log entries are kept 12 months.",
    status: "gap",
    evidence: [issue(1236)],
  },
  {
    id: "audits",
    chapter: "operations",
    article: "Art. 17",
    requirement:
      "Records of each instance's life, and internal and external audits.",
    demo: "Start, load and deletion of each workspace are on the audit chain; there is no audit programme.",
    status: "partial",
    evidence: [AUDIT],
  },
  {
    id: "federation-members",
    chapter: "federation",
    article: "Art. 18(1)",
    requirement: "Publish which environments belong to the federation.",
    demo: "Both workspaces appear in the catalogue and on the query page; there is no formal register.",
    status: "partial",
    evidence: [QUERY, page("Catalog", "/catalog")],
  },
  {
    id: "common-models",
    chapter: "federation",
    article: "Art. 18(2)(a), (b)",
    requirement:
      "Common data models, terminologies, units and metadata, documented with their versions.",
    demo: "OMOP CDM 5.4, FHIR R4, LOINC, SNOMED CT and HealthDCAT-AP; the versions are not yet listed in one place.",
    status: "partial",
    evidence: [issue(1222)],
  },
  {
    id: "federation-identity",
    chapter: "federation",
    article: "Art. 18(2)(c), (d)",
    requirement:
      "User management that works across the federation, and encrypted, authenticated traffic between instances.",
    demo: "TLS between the coordinator and the workspaces; the workspaces do not yet authenticate each other.",
    status: "partial",
    evidence: [issue(1236)],
  },
  {
    id: "local-only",
    chapter: "federation",
    article: "Art. 18(2)(e), (g)",
    requirement:
      "Run the analysis where the data is, and never move source data between instances.",
    demo: "Each workspace runs the query itself, but row-level answers can still reach the coordinator.",
    status: "partial",
    evidence: [QUERY, issue(1236)],
  },
  {
    id: "federation-logs",
    chapter: "federation",
    article: "Art. 18(2)(f)",
    requirement: "Logging across the federation, joining each instance's logs.",
    demo: "The coordinator collects every workspace's events into one audit chain.",
    status: "met",
    evidence: [AUDIT],
  },
  {
    id: "federated-learning",
    chapter: "federation",
    article: "Art. 19",
    requirement:
      "For federated learning, train locally and exchange only model updates.",
    demo: "Not offered.",
    status: "na",
    evidence: [],
  },
  {
    id: "governance",
    chapter: "federation",
    article: "Art. 20",
    requirement:
      "A written agreement on roles, admission, exclusion and incidents in the federation.",
    demo: "One operator runs both workspaces; there is no agreement yet.",
    status: "gap",
    evidence: [issue(1236)],
  },
];

export const CHAPTER_TITLE: Record<SpeActRequirement["chapter"], string> = {
  lifecycle: "Chapter II: the instance from start to deletion",
  operations: "Chapter III: operations, security and logs",
  federation: "Chapter IV: federations of environments",
};

export const STATUS_LABEL: Record<SpeActStatus, string> = {
  met: "Met in the demo",
  partial: "Partly met",
  gap: "Not yet",
  na: "Not offered",
};

/** How many requirements have each status. */
export function countByStatus(
  rows: SpeActRequirement[] = SPE_ACT_REQUIREMENTS,
): Record<SpeActStatus, number> {
  const out: Record<SpeActStatus, number> = {
    met: 0,
    partial: 0,
    gap: 0,
    na: 0,
  };
  for (const r of rows) out[r.status] += 1;
  return out;
}

/** The interface texts of the page, for the translation test. */
export const SPE_ACT_UI_TEXTS = [
  "SPE requirements",
  "The draft implementing act on secure processing environments, article by article, against this demo",
  "In November 2026 the Commission published the draft rules that every secure processing environment must follow from 26 March 2029 (EHDS Art. 73(5)). This page lists them in plain words and shows what this demo does about each one. The demo holds synthetic data only: green means the mechanism works here, not that a real operator is compliant.",
  "Read the draft act",
  "Our feedback",
  "Requirement",
  "In the demo",
  "Evidence",
  "Show",
  "All",
  "{n} requirements",
  "Protocol TCK",
  "SPE attestation",
  "Audit & Provenance",
];

/** Every text the page shows, for the translation test. */
export function allSpeActTexts(): string[] {
  const set = new Set<string>(SPE_ACT_UI_TEXTS);
  for (const r of SPE_ACT_REQUIREMENTS) {
    set.add(r.requirement);
    set.add(r.demo);
    for (const e of r.evidence) {
      if (!e.label.startsWith("#") && !e.label.startsWith("ADR-")) {
        set.add(e.label);
      }
    }
  }
  for (const v of Object.values(CHAPTER_TITLE)) set.add(v);
  for (const v of Object.values(STATUS_LABEL)) set.add(v);
  return [...set];
}
