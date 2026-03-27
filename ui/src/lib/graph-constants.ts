/**
 * Shared graph constants used by /api/graph, /api/graph/expand,
 * /api/graph/validate, and the graph page component.
 *
 * Single source of truth for: layer mapping, colors, sort order,
 * semantic groups, and researcher filter presets.
 */

// ── Layer mapping ─────────────────────────────────────────────────────────────

/** Maps every known Neo4j node label to a visual layer (1–5). */
export const LABEL_LAYER: Record<string, number> = {
  // L1: Dataspace Marketplace
  Participant: 1,
  DataProduct: 1,
  OdrlPolicy: 1,
  Contract: 1,
  AccessApplication: 1,
  HDABApproval: 1,
  ContractNegotiation: 1,
  DataTransfer: 1,
  Catalog: 1,
  Organization: 1,
  // L1 Phase 18: Trust Center (EHDS Art. 50/51)
  TrustCenter: 1,
  SPESession: 1,
  ResearchPseudonym: 1,
  ProviderPseudonym: 1,
  // L1 Phase 20: Patient Portal (EHDS Chapter II / GDPR Art. 15-22)
  PatientConsent: 1,
  ResearchInsight: 1,
  // L2: HealthDCAT-AP Metadata
  HealthDataset: 2,
  Distribution: 2,
  ContactPoint: 2,
  EhdsPurpose: 2,
  EEHRxFProfile: 2,
  EEHRxFCategory: 2,
  // L3: FHIR R4 Clinical
  Patient: 3,
  Encounter: 3,
  Condition: 3,
  Observation: 3,
  MedicationRequest: 3,
  Procedure: 3,
  // L4: OMOP CDM Analytics
  OMOPPerson: 4,
  OMOPVisitOccurrence: 4,
  OMOPConditionOccurrence: 4,
  OMOPMeasurement: 4,
  OMOPDrugExposure: 4,
  OMOPProcedureOccurrence: 4,
  // L5: Biomedical Ontology + Credentials
  SnomedConcept: 5,
  LoincCode: 5,
  ICD10Code: 5,
  RxNormConcept: 5,
  VerifiableCredential: 5,
  TransferEvent: 5,
};

// ── Colors ────────────────────────────────────────────────────────────────────

/** Base layer colors — used in the legend and as defaults. */
export const LAYER_COLORS: Record<number, string> = {
  1: "#2471A3", // L1 Governance — steel blue
  2: "#148F77", // L2 HealthDCAT-AP — teal
  3: "#1E8449", // L3 FHIR R4 — forest green
  4: "#CA6F1E", // L4 OMOP CDM — burnt orange
  5: "#7D3C98", // L5 Ontology — muted purple
};

/**
 * Role-specific colors that override the layer color for visually important
 * node types. Applied in toNode() BEFORE the layer fallback.
 *
 * Design rationale:
 *  - Participant (amber)   — The key actors; researchers want to see who holds data
 *  - TrustCenter (violet)  — Unique EHDS authority; visually distinct from governance
 *  - HDABApproval (red)    — Decision nodes; red signals authority
 *  - SPESession (gold)     — Active TEE sessions; bright to show operational state
 */
export const NODE_ROLE_COLORS: Record<string, string> = {
  Participant: "#E67E22", // amber  — dataspace actors
  TrustCenter: "#8E44AD", // violet — HDAB-designated pseudonym authority
  HDABApproval: "#C0392B", // red    — approval authority
  SPESession: "#D4AC0D", // gold   — active secure processing sessions
  PatientConsent: "#0E9F9F", // teal   — GDPR Art. 15-22 patient consent nodes
  ResearchInsight: "#1ABC9C", // mint   — personalised research findings
};

/** Human-readable layer labels for the legend. */
export const LAYER_LABELS: Record<number, string> = {
  1: "L1 Governance",
  2: "L2 HealthDCAT-AP",
  3: "L3 FHIR R4",
  4: "L4 OMOP CDM",
  5: "L5 Ontology",
};

// ── Sort order ────────────────────────────────────────────────────────────────

/**
 * Sort order within each concentric ring. Lower = appears first (clockwise
 * from 12 o'clock). Nodes with the same sort order are sorted alphabetically
 * by name. This groups related labels together so the ring is readable:
 *
 * L1 ring: [Participant, Organization] → [DataProduct, Contract...] →
 *          [HDABApproval] → [TrustCenter, SPESession...]
 */
export const LABEL_SORT_ORDER: Record<string, number> = {
  // L1 — participants first (they are the key actors)
  Participant: 0,
  Organization: 1,
  DataProduct: 2,
  OdrlPolicy: 3,
  Contract: 4,
  HDABApproval: 5,
  AccessApplication: 6,
  ContractNegotiation: 7,
  DataTransfer: 8,
  Catalog: 9,
  TrustCenter: 10,
  SPESession: 11,
  ResearchPseudonym: 12,
  ProviderPseudonym: 13,
  // L2 — datasets before profiles
  HealthDataset: 0,
  Distribution: 1,
  EhdsPurpose: 2,
  EEHRxFProfile: 3,
  EEHRxFCategory: 4,
  ContactPoint: 5,
  // L3 — patients → clinical events
  Patient: 0,
  Encounter: 1,
  Condition: 2,
  Observation: 3,
  Procedure: 4,
  MedicationRequest: 5,
  // L4 — persons → conditions → measurements → drugs
  OMOPPerson: 0,
  OMOPConditionOccurrence: 1,
  OMOPMeasurement: 2,
  OMOPDrugExposure: 3,
  OMOPProcedureOccurrence: 4,
  OMOPVisitOccurrence: 5,
  // L5 — clinical codes before credentials
  SnomedConcept: 0,
  ICD10Code: 1,
  LoincCode: 2,
  RxNormConcept: 3,
  VerifiableCredential: 4,
  TransferEvent: 5,
};

// ── Semantic groups ────────────────────────────────────────────────────────────

/**
 * Semantic group per label — used by filter presets to highlight
 * related nodes and dim everything else.
 */
export const LABEL_GROUP: Record<string, string> = {
  Participant: "participant",
  Organization: "participant",
  DataProduct: "governance",
  Contract: "governance",
  OdrlPolicy: "governance",
  HDABApproval: "governance",
  AccessApplication: "governance",
  ContractNegotiation: "governance",
  DataTransfer: "governance",
  Catalog: "governance",
  VerifiableCredential: "governance",
  TrustCenter: "trust-center",
  SPESession: "trust-center",
  ResearchPseudonym: "trust-center",
  ProviderPseudonym: "trust-center",
  HealthDataset: "dataset",
  Distribution: "dataset",
  EhdsPurpose: "dataset",
  EEHRxFProfile: "dataset",
  EEHRxFCategory: "dataset",
  ContactPoint: "dataset",
  Patient: "clinical",
  Encounter: "clinical",
  Condition: "clinical",
  Observation: "clinical",
  Procedure: "clinical",
  MedicationRequest: "clinical",
  OMOPPerson: "analytics",
  OMOPConditionOccurrence: "analytics",
  OMOPMeasurement: "analytics",
  OMOPDrugExposure: "analytics",
  OMOPProcedureOccurrence: "analytics",
  OMOPVisitOccurrence: "analytics",
  SnomedConcept: "ontology",
  LoincCode: "ontology",
  ICD10Code: "ontology",
  RxNormConcept: "ontology",
  TransferEvent: "ontology",
};

// ── Researcher filter presets ─────────────────────────────────────────────────

/**
 * Preset filter questions for researchers. When a preset is active, only
 * nodes whose label is in the preset's `labels` list are shown at full
 * opacity; all other nodes are dimmed to 15%.
 *
 * Ordering matters: presets are shown in the sidebar in this order.
 */
export const FILTER_PRESETS = [
  {
    id: "participants",
    icon: "Users",
    label: "Who's in the dataspace?",
    description:
      "Data holders, researchers and authorities — with their contracts and approved policies",
    labels: [
      "Participant",
      "Organization",
      "DataProduct",
      "Contract",
      "HDABApproval",
      "OdrlPolicy",
    ],
  },
  {
    id: "trust-center",
    icon: "Lock",
    label: "Pseudonym resolution chain",
    description:
      "EHDS Art. 50/51 — how provider pseudonyms are resolved to research pseudonyms inside the SPE",
    labels: [
      "TrustCenter",
      "SPESession",
      "ResearchPseudonym",
      "ProviderPseudonym",
      "HDABApproval",
      "Participant",
    ],
  },
  {
    id: "hdab-chain",
    icon: "ShieldCheck",
    label: "HDAB approval chain",
    description:
      "From access application through HDAB decision to contract and verifiable credential",
    labels: [
      "HDABApproval",
      "AccessApplication",
      "Contract",
      "DataProduct",
      "Participant",
      "VerifiableCredential",
    ],
  },
  {
    id: "datasets",
    icon: "BookOpen",
    label: "Dataset catalog",
    description:
      "HealthDCAT-AP datasets, FHIR distributions and EEHRxF conformance profiles",
    labels: [
      "HealthDataset",
      "Distribution",
      "DataProduct",
      "Catalog",
      "EEHRxFProfile",
      "EhdsPurpose",
    ],
  },
  {
    id: "clinical",
    icon: "Activity",
    label: "Clinical cohort",
    description:
      "FHIR R4 patients, conditions, observations — with SNOMED CT and ICD-10 coding",
    labels: [
      "Patient",
      "Condition",
      "Observation",
      "Encounter",
      "Procedure",
      "MedicationRequest",
      "SnomedConcept",
      "ICD10Code",
    ],
  },
  {
    id: "analytics",
    icon: "BarChart2",
    label: "OMOP analytics",
    description:
      "OMOP CDM research layer — persons, conditions, measurements, drug exposures",
    labels: [
      "OMOPPerson",
      "OMOPConditionOccurrence",
      "OMOPMeasurement",
      "OMOPDrugExposure",
      "OMOPProcedureOccurrence",
      "RxNormConcept",
      "LoincCode",
    ],
  },
] as const;

export type FilterPresetId = (typeof FILTER_PRESETS)[number]["id"];

// ── Patient / Citizen filter presets ──────────────────────────────────────────

/**
 * Patient-specific filter questions shown when the "Patient / Citizen" persona
 * is active. Mirrors FILTER_PRESETS but answers GDPR Art. 15-22 / EHDS Ch. II
 * questions from the patient's perspective.
 */
export const PATIENT_FILTER_PRESETS = [
  {
    id: "patient-data-usage",
    icon: "Eye",
    label: "Who is using my data?",
    description:
      "GDPR Art. 15 — shows your consented research programs, the pseudonym chain, and the studies that have received access to your data",
    labels: [
      "PatientConsent",
      "DataProduct",
      "ResearchPseudonym",
      "SPESession",
      "Participant",
      "HDABApproval",
    ],
  },
  {
    id: "patient-research-programs",
    icon: "FlaskConical",
    label: "Which research program is interesting for me?",
    description:
      "EHDS Art. 10 — open research programs matched to your conditions, plus personalised insights from completed studies",
    labels: [
      "DataProduct",
      "HealthDataset",
      "ResearchInsight",
      "PatientConsent",
      "EhdsPurpose",
      "Participant",
    ],
  },
  {
    id: "patient-my-data",
    icon: "Heart",
    label: "Show my data",
    description:
      "EHDS Art. 3 / GDPR Art. 15 — your full FHIR R4 clinical record: encounters, conditions, medications, observations and procedures",
    labels: [
      "Patient",
      "Encounter",
      "Condition",
      "MedicationRequest",
      "Observation",
      "Procedure",
      "OMOPPerson",
    ],
  },
  {
    id: "patient-risks",
    icon: "Activity",
    label: "Show health interests and risks",
    description:
      "Your active conditions with SNOMED/ICD-10 coding, personalised research insights, and risk-relevant ontology connections",
    labels: [
      "Patient",
      "Condition",
      "ResearchInsight",
      "SnomedConcept",
      "ICD10Code",
      "MedicationRequest",
      "RxNormConcept",
    ],
  },
] as const;

export type PatientFilterPresetId =
  (typeof PATIENT_FILTER_PRESETS)[number]["id"];

// ── Persona views ─────────────────────────────────────────────────────────────

/**
 * Persona-specific graph views — each answers the single most important
 * question a participant type has when they open the graph explorer.
 *
 * The `labels` array is used both for client-side dimming (same as filter
 * presets) and for server-side subgraph selection (?persona= query param).
 * The `focusLabels` are the "hero nodes" shown at full size at the center.
 */
export const PERSONA_VIEWS = [
  {
    id: "default",
    icon: "Eye",
    label: "Researcher overview",
    role: "ALL",
    ehdsArticle: null as string | null,
    question: "What does the full 5-layer health dataspace look like?",
    description:
      "Curated ~200-node overview: participants, datasets, top conditions, ontology",
    focusLabels: [
      "Participant",
      "HealthDataset",
      "DataProduct",
      "Condition",
      "SnomedConcept",
    ],
    labels: [] as string[], // empty = show all
  },
  {
    id: "trust-center",
    icon: "Lock",
    label: "Trust Center operator",
    role: "HDAB",
    ehdsArticle: "Art. 50/51",
    question: "Which data flows am I resolving pseudonyms for?",
    description:
      "EHDS Art. 50/51 — active SPE sessions, research pseudonyms, governed datasets, cross-border recognition",
    focusLabels: ["TrustCenter", "SPESession", "ResearchPseudonym"],
    labels: [
      "TrustCenter",
      "SPESession",
      "ResearchPseudonym",
      "ProviderPseudonym",
      "HDABApproval",
      "HealthDataset",
      "Participant",
    ],
  },
  {
    id: "hospital",
    icon: "Building2",
    label: "Hospital / Data Holder",
    role: "DATA_HOLDER",
    ehdsArticle: "Art. 33–37",
    question: "Who has approved access to my data? What contracts are active?",
    description:
      "EHDS Art. 33 — your datasets, active contracts, approved access applications, verifiable credentials",
    focusLabels: ["Participant", "HealthDataset", "Contract"],
    labels: [
      "Participant",
      "Organization",
      "HealthDataset",
      "Distribution",
      "DataProduct",
      "Contract",
      "HDABApproval",
      "VerifiableCredential",
      "AccessApplication",
      "EEHRxFProfile",
    ],
  },
  {
    id: "researcher",
    icon: "FlaskConical",
    label: "Researcher / Data User",
    role: "DATA_USER",
    ehdsArticle: "Art. 46–49",
    question: "What datasets match my study? What analytics can I run?",
    description:
      "EHDS Art. 46 — available datasets, OMOP cohort, pseudonym chain, EEHRxF profiles, clinical conditions",
    focusLabels: ["HealthDataset", "OMOPPerson", "ResearchPseudonym"],
    labels: [
      "HealthDataset",
      "Distribution",
      "DataProduct",
      "EEHRxFProfile",
      "EhdsPurpose",
      "OMOPPerson",
      "OMOPConditionOccurrence",
      "OMOPMeasurement",
      "SnomedConcept",
      "ResearchPseudonym",
      "SPESession",
    ],
  },
  {
    id: "edc-admin",
    icon: "Settings",
    label: "EDC / Dataspace Admin",
    role: "EDC_ADMIN",
    ehdsArticle: "Art. 33",
    question: "Who are my participants? What contracts and transfers are live?",
    description:
      "Operator view — all participants, active data products, contract negotiations, transfer events",
    focusLabels: ["Participant", "Contract", "DataTransfer"],
    labels: [
      "Participant",
      "Organization",
      "DataProduct",
      "OdrlPolicy",
      "Contract",
      "ContractNegotiation",
      "DataTransfer",
      "TransferEvent",
      "VerifiableCredential",
    ],
  },
  {
    id: "hdab",
    icon: "Scale",
    label: "HDAB Authority",
    role: "HDAB_AUTHORITY",
    ehdsArticle: "Art. 45–53",
    question: "What approvals are pending? Is the governance chain complete?",
    description:
      "EHDS Art. 45 — all access applications, HDAB approval decisions, verifiable credentials, trust center governance",
    focusLabels: ["HDABApproval", "TrustCenter", "VerifiableCredential"],
    labels: [
      "HDABApproval",
      "AccessApplication",
      "VerifiableCredential",
      "TrustCenter",
      "SPESession",
      "Participant",
      "DataProduct",
      "Contract",
    ],
  },
  {
    id: "patient",
    icon: "Heart",
    label: "Patient / Citizen",
    role: "PATIENT",
    ehdsArticle: "Art. 3–12",
    question:
      "What health data do I have? Who is using it? What research can I join?",
    description:
      "EHDS Chapter II / GDPR Art. 15-22 — my own health records, conditions, medications, consented research programs and personalised insights",
    focusLabels: ["Patient", "Condition", "PatientConsent"],
    labels: [
      "Patient",
      "Encounter",
      "Condition",
      "Observation",
      "MedicationRequest",
      "Procedure",
      "OMOPPerson",
      "ResearchPseudonym",
      "SPESession",
      "PatientConsent",
      "ResearchInsight",
      "DataProduct",
    ],
  },
] as const;

export type PersonaId = (typeof PERSONA_VIEWS)[number]["id"];
