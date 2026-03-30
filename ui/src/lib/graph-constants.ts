/**
 * Shared graph constants used by /api/graph, /api/graph/expand,
 * /api/graph/validate, and the graph page component.
 *
 * Single source of truth for: layer mapping, colors, sort order,
 * semantic groups, and researcher filter presets.
 */

// ── Persona ID type (defined early so it can be used throughout) ─────────────

/** All valid persona identifiers — matches PERSONA_VIEWS[].id below. */
export type PersonaId =
  | "default"
  | "trust-center"
  | "hospital"
  | "researcher"
  | "edc-admin"
  | "hdab"
  | "patient";

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

/**
 * Base layer colors — cool/muted/pastel for structural tiers.
 * All hues stay in the cool/desaturated quadrant so they recede visually.
 * Deliberately distinct from NODE_ROLE_COLORS (warm/vivid accents).
 */
export const LAYER_COLORS: Record<number, string> = {
  0: "#FBBF24", // Value center — warm gold (special)
  1: "#94A3B8", // Marketplace — slate-400 (muted blue-gray)
  2: "#7DD3C8", // Catalog — teal-300 (muted teal)
  3: "#86EFAC", // Clinical — green-300 (muted mint)
  4: "#A5B4FC", // Research — indigo-300 (muted lavender)
  5: "#D4D4D8", // Terminology — zinc-300 (neutral gray)
};

/**
 * Role-specific colors — warm/vivid accents for visually important node types.
 * Applied in toNode() BEFORE the layer fallback.
 * All warm/saturated — pops against the cool/muted layer palette.
 */
export const NODE_ROLE_COLORS: Record<string, string> = {
  Participant: "#F97316", // orange-500  — dataspace actors
  TrustCenter: "#EF4444", // red-500     — HDAB-designated pseudonym authority
  HDABApproval: "#EC4899", // pink-500    — approval authority
  SPESession: "#F59E0B", // amber-500   — active secure processing sessions
  PatientConsent: "#A855F7", // purple-500  — GDPR Art. 15-22 patient consent
  ResearchInsight: "#06B6D4", // cyan-500    — personalised research findings
  ValueCenter: "#FBBF24", // gold        — persona value center node
};

/** User-friendly layer labels for the legend (default/fallback). */
export const LAYER_LABELS: Record<number, string> = {
  0: "Your Purpose",
  1: "Marketplace & Access",
  2: "Data Catalog",
  3: "My Health Records",
  4: "Research Data",
  5: "Medical Terminology",
};

/** Persona-specific layer labels — overrides LAYER_LABELS in sidebar legend. */
export const PERSONA_LAYER_LABELS: Partial<
  Record<PersonaId, Record<number, string>>
> = {
  patient: {
    0: "My Health",
    1: "Who Uses My Data",
    2: "Available Datasets",
    3: "My Health Records",
    4: "Research Anonymization",
    5: "Medical Codes",
  },
  researcher: {
    0: "My Researches",
    1: "Dataspace Access",
    2: "Dataset Catalog",
    3: "Clinical Sources",
    4: "Analytics Data",
    5: "Standard Codes",
  },
  hospital: {
    0: "Our Data Offerings",
    1: "Contracts & Access",
    2: "Published Datasets",
    3: "Clinical Records",
    4: "Research Use",
    5: "Compliance",
  },
  hdab: {
    0: "Govern the Dataspace",
    1: "Approvals & Oversight",
    2: "Regulated Datasets",
    3: "Clinical Sources",
    4: "Research Pipeline",
    5: "Credentials & Codes",
  },
  "edc-admin": {
    0: "Manage Dataspace",
    1: "Participants & Contracts",
    2: "Data Offerings",
    3: "Clinical Layer",
    4: "Research Layer",
    5: "Events & Credentials",
  },
  "trust-center": {
    0: "Privacy Operations",
    1: "Pseudonym Chains",
    2: "Governed Datasets",
    3: "Clinical Sources",
    4: "Research Subjects",
    5: "Credentials",
  },
};

/** Technical tooltip for each layer (shown on hover). */
export const LAYER_TOOLTIPS: Record<number, string> = {
  0: "Your starting point — the central value this dataspace provides for your role",
  1: "IDS/EHDS Governance Layer — participants, contracts, approvals, trust centers",
  2: "HealthDCAT-AP Metadata — dataset descriptions, distributions, conformance profiles",
  3: "FHIR R4 Clinical Data — patients, encounters, conditions, observations, medications",
  4: "OMOP CDM Analytics — research subjects, condition occurrences, measurements, drug exposures",
  5: "Biomedical Ontology & Credentials — SNOMED CT, ICD-10, LOINC, RxNorm codes",
};

/** User-friendly display names for Neo4j node labels. */
export const NODE_DISPLAY_NAMES: Record<string, string> = {
  // Value center
  ValueCenter: "Your Purpose",
  // L1 Marketplace
  Participant: "Organization",
  Organization: "Organization",
  DataProduct: "Data Offering",
  OdrlPolicy: "Usage Policy",
  Contract: "Access Agreement",
  AccessApplication: "Access Request",
  HDABApproval: "Access Decision",
  ContractNegotiation: "Negotiation",
  DataTransfer: "Data Transfer",
  Catalog: "Catalog",
  TrustCenter: "Privacy Service",
  SPESession: "Secure Processing",
  ResearchPseudonym: "Research Pseudonym",
  ProviderPseudonym: "Provider Pseudonym",
  PatientConsent: "My Consent",
  ResearchInsight: "Research Finding",
  // L2 Catalog
  HealthDataset: "Dataset Description",
  Distribution: "Data Format",
  ContactPoint: "Contact",
  EhdsPurpose: "Research Purpose",
  EEHRxFProfile: "Data Profile",
  EEHRxFCategory: "Profile Category",
  // L3 Clinical
  Patient: "My Data",
  Encounter: "Visit",
  Condition: "Diagnosis",
  Observation: "Health Measurement",
  MedicationRequest: "Medication",
  Procedure: "Medical Procedure",
  // L4 Research
  OMOPPerson: "Research Subject",
  OMOPVisitOccurrence: "Research Visit",
  OMOPConditionOccurrence: "Research Diagnosis",
  OMOPMeasurement: "Research Measurement",
  OMOPDrugExposure: "Drug Record",
  OMOPProcedureOccurrence: "Research Procedure",
  // L5 Terminology
  SnomedConcept: "Medical Term (SNOMED)",
  LoincCode: "Lab Code (LOINC)",
  ICD10Code: "Diagnosis Code (ICD-10)",
  RxNormConcept: "Drug Term (RxNorm)",
  VerifiableCredential: "Digital Credential",
  TransferEvent: "Transfer Event",
};

/** Technical tooltip for each node type (shown on hover in detail panel). */
export const NODE_TOOLTIPS: Record<string, string> = {
  ValueCenter:
    "Your starting point — the central value and purpose this health dataspace provides for your role",
  Participant:
    "DSP Participant — a registered dataspace actor (hospital, researcher, authority)",
  DataProduct:
    "DSP DataProduct — a dataset offered for sharing under usage policies",
  Contract:
    "DSP Contract — a signed data access agreement between two participants",
  HDABApproval: "EHDS Art. 46 — Health Data Access Body approval decision",
  TrustCenter:
    "EHDS Art. 50/51 — pseudonymisation authority for secure processing",
  SPESession: "EHDS Art. 50 — an active Secure Processing Environment session",
  PatientConsent:
    "GDPR Art. 15-22 — patient consent for secondary use of health data",
  ResearchInsight:
    "EHDS Art. 50 — personalised finding from aggregate research",
  Patient: "FHIR R4 Patient — the patient's complete health record",
  Condition: "FHIR R4 Condition — a diagnosed medical condition",
  Observation: "FHIR R4 Observation — a clinical measurement or lab result",
  MedicationRequest: "FHIR R4 MedicationRequest — a prescribed medication",
  OMOPPerson: "OMOP CDM Person — pseudonymised research subject record",
  OMOPConditionOccurrence: "OMOP CDM — condition mapped for research analytics",
  OMOPMeasurement: "OMOP CDM — measurement mapped for research analytics",
  HealthDataset:
    "HealthDCAT-AP Dataset — metadata describing a shareable dataset",
  SnomedConcept: "SNOMED CT — standardised clinical terminology concept",
  ICD10Code: "ICD-10 — international classification of diseases code",
  LoincCode: "LOINC — logical observation identifiers for lab tests",
  RxNormConcept: "RxNorm — normalised drug name and ingredient code",
  VerifiableCredential: "W3C VC — cryptographically signed digital credential",
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

// ── Hospital / Data Holder filter presets ────────────────────────────────────

/**
 * Hospital-specific filter questions shown when the "Hospital / Data Holder"
 * persona is active. Answers data provider questions about what they offer
 * and who uses their data.
 */
export const HOSPITAL_FILTER_PRESETS = [
  {
    id: "hospital-data-offerings",
    icon: "BookOpen",
    label: "Which data do we offer?",
    description:
      "Our published datasets, data products, distributions, and EEHRxF conformance profiles",
    labels: [
      "HealthDataset",
      "Distribution",
      "DataProduct",
      "EEHRxFProfile",
      "EhdsPurpose",
      "Catalog",
    ],
  },
  {
    id: "hospital-data-consumers",
    icon: "Eye",
    label: "Who is using our data?",
    description:
      "Researchers and authorities who have contracts to access our datasets — with their approved purposes",
    labels: [
      "Participant",
      "Organization",
      "Contract",
      "DataTransfer",
      "TransferEvent",
      "HDABApproval",
    ],
  },
  {
    id: "hospital-contracts",
    icon: "ShieldCheck",
    label: "What contracts are active?",
    description:
      "Active data access agreements, HDAB approvals, and usage policies governing our data",
    labels: [
      "Contract",
      "HDABApproval",
      "AccessApplication",
      "OdrlPolicy",
      "DataProduct",
      "Participant",
    ],
  },
  {
    id: "hospital-compliance",
    icon: "Scale",
    label: "Are we compliant?",
    description:
      "Verifiable credentials, HDAB approval chain, and trust center governance for our data sharing",
    labels: [
      "VerifiableCredential",
      "HDABApproval",
      "TrustCenter",
      "AccessApplication",
      "Contract",
      "Participant",
    ],
  },
  {
    id: "hospital-clinical",
    icon: "Heart",
    label: "What clinical data do we hold?",
    description:
      "Our FHIR R4 patient records, conditions, observations, and their SNOMED/ICD-10 coding",
    labels: [
      "Patient",
      "Condition",
      "Observation",
      "Encounter",
      "MedicationRequest",
      "SnomedConcept",
      "ICD10Code",
    ],
  },
] as const;

export type HospitalFilterPresetId =
  (typeof HOSPITAL_FILTER_PRESETS)[number]["id"];

// ── HDAB Authority filter presets ────────────────────────────────────────────

/**
 * HDAB-specific filter questions for the Health Data Access Body persona.
 * Focused on governance, approvals, policies, and compliance oversight.
 */
export const HDAB_FILTER_PRESETS = [
  {
    id: "hdab-approvals",
    icon: "ShieldCheck",
    label: "What approvals are pending?",
    description:
      "Access applications, HDAB approval decisions, and their status across all participants",
    labels: [
      "HDABApproval",
      "AccessApplication",
      "Participant",
      "DataProduct",
      "HealthDataset",
    ],
  },
  {
    id: "hdab-policies",
    icon: "Scale",
    label: "Which policies govern data use?",
    description:
      "ODRL usage policies, data products they govern, and the contracts that reference them",
    labels: [
      "OdrlPolicy",
      "DataProduct",
      "Contract",
      "Participant",
      "HDABApproval",
    ],
  },
  {
    id: "hdab-contracts",
    icon: "BookOpen",
    label: "What contracts are active?",
    description:
      "Active data access agreements between participants, the datasets they cover, and transfer events",
    labels: [
      "Contract",
      "DataProduct",
      "DataTransfer",
      "TransferEvent",
      "Participant",
      "HealthDataset",
    ],
  },
  {
    id: "hdab-credentials",
    icon: "Lock",
    label: "Are credentials valid?",
    description:
      "Verifiable credentials issued to participants — membership, data quality, processing purpose attestations",
    labels: [
      "VerifiableCredential",
      "Participant",
      "HDABApproval",
      "TrustCenter",
    ],
  },
  {
    id: "hdab-trust-center",
    icon: "Eye",
    label: "How is the Trust Center operating?",
    description:
      "Trust center governance, pseudonym resolution chains, SPE sessions, and cross-border recognition",
    labels: [
      "TrustCenter",
      "SPESession",
      "ResearchPseudonym",
      "ProviderPseudonym",
      "HDABApproval",
      "Participant",
    ],
  },
] as const;

export type HdabFilterPresetId = (typeof HDAB_FILTER_PRESETS)[number]["id"];

// ── Researcher / Data User filter presets ────────────────────────────────────

/**
 * Researcher-specific filter questions for the Data User persona.
 * Focused on discovering datasets, requesting access, and running analytics.
 */
export const RESEARCHER_FILTER_PRESETS = [
  {
    id: "researcher-discover",
    icon: "BookOpen",
    label: "Which datasets can I use?",
    description:
      "Discover available datasets across data catalogs — with their formats, profiles, and purposes",
    labels: [
      "HealthDataset",
      "Distribution",
      "DataProduct",
      "EEHRxFProfile",
      "EhdsPurpose",
      "Catalog",
    ],
  },
  {
    id: "researcher-access",
    icon: "ShieldCheck",
    label: "How do I get access?",
    description:
      "Access applications, HDAB approval decisions, contracts, and usage policies for the datasets I need",
    labels: [
      "AccessApplication",
      "HDABApproval",
      "Contract",
      "OdrlPolicy",
      "DataProduct",
      "Participant",
    ],
  },
  {
    id: "researcher-analytics",
    icon: "BarChart2",
    label: "What analytics can I run?",
    description:
      "OMOP CDM research subjects, conditions, measurements, drug exposures — ready for cohort analytics",
    labels: [
      "OMOPPerson",
      "OMOPConditionOccurrence",
      "OMOPMeasurement",
      "OMOPDrugExposure",
      "OMOPProcedureOccurrence",
      "LoincCode",
      "RxNormConcept",
    ],
  },
  {
    id: "researcher-clinical",
    icon: "Heart",
    label: "What clinical data is available?",
    description:
      "FHIR R4 clinical records — patients, conditions, observations, medications with SNOMED/ICD-10 coding",
    labels: [
      "Patient",
      "Condition",
      "Observation",
      "Encounter",
      "MedicationRequest",
      "SnomedConcept",
      "ICD10Code",
    ],
  },
  {
    id: "researcher-spe",
    icon: "Lock",
    label: "Where is my data processed?",
    description:
      "Secure Processing Environments, research pseudonyms, trust center governance for your studies",
    labels: [
      "SPESession",
      "ResearchPseudonym",
      "ProviderPseudonym",
      "TrustCenter",
      "HDABApproval",
      "Participant",
    ],
  },
] as const;

export type ResearcherFilterPresetId =
  (typeof RESEARCHER_FILTER_PRESETS)[number]["id"];

// ── Ring layout ──────────────────────────────────────────────────────────────

/** Radii for the persona-driven concentric rings (0 = center value node). */
export const RING_RADII: Record<number, number> = {
  0: 0, // value center
  1: 120, // innermost real nodes
  2: 260, // mid ring
  3: 420, // outer ring
  4: 580, // outermost ring
};

/**
 * Persona-specific ring assignment — maps each label to a ring (1-4)
 * based on relevance to that user's journey. Labels not listed fall to ring 4.
 */
export const PERSONA_RING_ASSIGNMENT: Record<
  PersonaId,
  Record<string, number>
> = {
  patient: {
    Patient: 1,
    Condition: 1,
    PatientConsent: 1,
    Encounter: 2,
    Observation: 2,
    MedicationRequest: 2,
    Procedure: 2,
    ResearchInsight: 2,
    OMOPPerson: 3,
    ResearchPseudonym: 3,
    SPESession: 3,
    DataProduct: 3,
    Participant: 4,
    HDABApproval: 4,
    TrustCenter: 4,
    HealthDataset: 4,
  },
  researcher: {
    HealthDataset: 1,
    OMOPPerson: 1,
    ResearchPseudonym: 1,
    OMOPConditionOccurrence: 2,
    OMOPMeasurement: 2,
    OMOPDrugExposure: 2,
    Distribution: 2,
    EEHRxFProfile: 2,
    EhdsPurpose: 2,
    SnomedConcept: 3,
    LoincCode: 3,
    RxNormConcept: 3,
    SPESession: 3,
    DataProduct: 3,
    Participant: 4,
    Condition: 4,
    Patient: 4,
  },
  hospital: {
    Participant: 1,
    HealthDataset: 1,
    Contract: 1,
    DataProduct: 2,
    Distribution: 2,
    HDABApproval: 2,
    AccessApplication: 2,
    EEHRxFProfile: 2,
    VerifiableCredential: 3,
    Organization: 3,
    OdrlPolicy: 3,
  },
  hdab: {
    HDABApproval: 1,
    OdrlPolicy: 1,
    Contract: 1,
    TrustCenter: 1,
    VerifiableCredential: 2,
    AccessApplication: 2,
    SPESession: 2,
    Participant: 2,
    DataProduct: 3,
    HealthDataset: 3,
    Organization: 3,
  },
  "edc-admin": {
    Participant: 1,
    Contract: 1,
    DataTransfer: 1,
    DataProduct: 2,
    OdrlPolicy: 2,
    ContractNegotiation: 2,
    TransferEvent: 2,
    Organization: 3,
    VerifiableCredential: 3,
  },
  "trust-center": {
    TrustCenter: 1,
    SPESession: 1,
    ResearchPseudonym: 1,
    ProviderPseudonym: 2,
    HDABApproval: 2,
    HealthDataset: 2,
    Participant: 3,
    DataProduct: 3,
  },
  default: {
    Participant: 1,
    DataProduct: 1,
    HealthDataset: 1,
    Contract: 1,
    HDABApproval: 1,
    TrustCenter: 1,
    Distribution: 2,
    Patient: 2,
    Condition: 2,
    Encounter: 2,
    OMOPPerson: 3,
    OMOPConditionOccurrence: 3,
    SnomedConcept: 3,
    ICD10Code: 3,
    LoincCode: 4,
    RxNormConcept: 4,
    VerifiableCredential: 4,
    TransferEvent: 4,
  },
};

// ── Value center nodes ───────────────────────────────────────────────────────

/** Synthetic center node injected per persona — the user's purpose/value. */
export const PERSONA_VALUE_NODES: Record<
  PersonaId,
  {
    id: string;
    name: string;
    tooltip: string;
    connectedLabels: string[];
  }
> = {
  patient: {
    id: "__value__patient",
    name: "My Health",
    tooltip:
      "Your health journey: risks, longevity, prevention, treatments — and who uses your data",
    connectedLabels: ["Patient", "Condition", "PatientConsent"],
  },
  researcher: {
    id: "__value__researcher",
    name: "My Researches",
    tooltip:
      "Your studies: discover datasets across catalogs, request access, run analytics in secure environments",
    connectedLabels: [
      "HealthDataset",
      "DataProduct",
      "OMOPPerson",
      "SPESession",
      "AccessApplication",
      "ResearchPseudonym",
    ],
  },
  hospital: {
    id: "__value__hospital",
    name: "Our Data Offerings",
    tooltip:
      "Datasets we publish, who accesses them, active contracts, compliance status",
    connectedLabels: [
      "HealthDataset",
      "Distribution",
      "DataProduct",
      "Contract",
      "Participant",
    ],
  },
  hdab: {
    id: "__value__hdab",
    name: "Govern the Dataspace",
    tooltip:
      "Approval decisions, policies, contracts, trust center oversight, credential verification",
    connectedLabels: [
      "HDABApproval",
      "OdrlPolicy",
      "Contract",
      "TrustCenter",
      "VerifiableCredential",
      "AccessApplication",
      "DataProduct",
    ],
  },
  "edc-admin": {
    id: "__value__edc-admin",
    name: "Manage Dataspace",
    tooltip:
      "Participants, contracts, data transfers, negotiation workflows, dataspace operations",
    connectedLabels: ["Participant", "Contract", "DataTransfer"],
  },
  "trust-center": {
    id: "__value__trust-center",
    name: "Privacy Operations",
    tooltip:
      "Pseudonym resolution chains, SPE sessions, governed data flows, cross-border recognition",
    connectedLabels: ["TrustCenter", "SPESession", "ResearchPseudonym"],
  },
  default: {
    id: "__value__default",
    name: "Health Dataspace",
    tooltip:
      "Full 5-layer EHDS dataspace overview: governance, catalog, clinical, research, ontology",
    connectedLabels: [
      "Participant",
      "HealthDataset",
      "DataProduct",
      "Condition",
      "SnomedConcept",
    ],
  },
};

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
    question:
      "What data do we offer? Who is using it? What contracts are active?",
    description:
      "EHDS Art. 33–37 — our published datasets, active contracts, data consumers, compliance status",
    focusLabels: ["HealthDataset", "Contract", "Participant"],
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
    question:
      "Which datasets can I use? How do I get access? What analytics can I run?",
    description:
      "EHDS Art. 46–49 — discover datasets, request access, OMOP analytics, pseudonym chain, secure processing",
    focusLabels: [
      "HealthDataset",
      "DataProduct",
      "OMOPPerson",
      "AccessApplication",
    ],
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
    question:
      "What approvals are pending? Which policies govern data use? Are contracts compliant?",
    description:
      "EHDS Art. 45–53 — approvals, usage policies, contracts, credentials, trust center governance",
    focusLabels: ["HDABApproval", "OdrlPolicy", "Contract", "TrustCenter"],
    labels: [
      "HDABApproval",
      "AccessApplication",
      "OdrlPolicy",
      "Contract",
      "VerifiableCredential",
      "TrustCenter",
      "SPESession",
      "Participant",
      "DataProduct",
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
