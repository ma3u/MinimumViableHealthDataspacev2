/**
 * The hub's standard data-sharing policies (ADR-077, #876).
 *
 * A minimal set: four policies, one per way health data leaves a holder,
 * built from one vocabulary of clauses. Each clause names the provisions it
 * answers, so the set can be read against the law it implements:
 *
 *   EHDS   Regulation (EU) 2025/327
 *   GDPR   Regulation (EU) 2016/679
 *   DGA    Data Governance Act, Regulation (EU) 2022/868
 *   DA     Data Act, Regulation (EU) 2023/2854
 *   AI Act Regulation (EU) 2024/1689
 *   ISO/IEC 27001, the security management standard an SPE operator holds
 *
 * "Compute in Europe" and "confidential SPE" are clauses, not policies: the
 * region of processing (GDPR Chapter V, DGA Art. 31, DA Art. 32) and the
 * processing environment (EHDS Art. 73, ADR-068) are conditions of every
 * policy that lets personal data be processed.
 *
 * jad/policies/<id>.json holds the same policies for the connector seed
 * (jad/seed-data-assets.sh); __tests__/unit/lib/standard-policies.test.ts
 * fails when the two differ, and when the hub's own check
 * (lib/odrl-validate.ts) finds anything short of "valid" in one of them.
 *
 * Which clauses the connector enforces and which bind by contract is in
 * ADR-077: the connector filters out a constraint it has no function for,
 * so most of these are terms the parties agree to, enforced by the permit
 * gate, the SPE and audit, not by the negotiation.
 */

const POLICY_CONTEXT = [
  "http://www.w3.org/ns/odrl.jsonld",
  { ehds: "https://w3id.org/ehds/", edc: "https://w3id.org/edc/v0.0.1/ns/" },
];

type Json = Record<string, unknown>;

/** One clause and the provisions it answers. */
export interface Clause {
  rule: Json;
  basis: string[];
}

export interface StandardPolicy {
  id: string;
  title: string;
  /** When a holder chooses it. */
  useWhen: string;
  regulations: string[];
  /** The policy as the connector stores it (a PolicyDefinition's policy). */
  policy: Json;
  /** Every constraint, duty and prohibition with its legal basis. */
  clauses: { kind: "constraint" | "duty" | "prohibition"; clause: Clause }[];
}

const constraint = (
  leftOperand: string,
  operator: string,
  rightOperand: unknown,
  basis: string[],
): Clause => ({ rule: { leftOperand, operator, rightOperand }, basis });

const action = (name: string, basis: string[], extra: Json = {}): Clause => ({
  rule: { action: name, ...extra },
  basis,
});

/* ── The vocabulary ────────────────────────────────────────────── */

const ART53 = [
  "EHDS Art. 53(1)(a) - public interest in public or occupational health",
  "EHDS Art. 53(1)(b) - policymaking and regulatory activities",
  "EHDS Art. 53(1)(c) - official statistics",
  "EHDS Art. 53(1)(d) - education or teaching",
  "EHDS Art. 53(1)(e) - scientific research",
  "EHDS Art. 53(1)(f) - improvement of the delivery of care",
];

const C = {
  purposeArt53: constraint("ehds:purpose", "isAnyOf", ART53, [
    "EHDS Art. 53(1)",
    "GDPR Art. 5(1)(b)",
  ]),
  dataPermit: constraint(
    "ehds:dataPermit",
    "eq",
    "issued by a health data access body for this dataset",
    ["EHDS Art. 68", "DGA Art. 5(1)"],
  ),
  dataRequest: constraint(
    "ehds:hdabApproval",
    "eq",
    "health data request answered by the access body",
    ["EHDS Art. 69"],
  ),
  oneYear: constraint("inForceDate", "lteq", "contractAgreement+365d", [
    "EHDS Art. 68(12)",
    "GDPR Art. 5(1)(e)",
  ]),
  inEurope: constraint("spatial", "isPartOf", "EU/EEA", [
    "GDPR Art. 44",
    "DGA Art. 5(10), Art. 31",
    "DA Art. 32",
  ]),
  confidentialSpe: constraint(
    "ehds:processingEnvironment",
    "eq",
    "confidential SPE with remote attestation",
    ["EHDS Art. 73", "DGA Art. 5(3)(b)", "GDPR Art. 32"],
  ),
  iso27001: constraint(
    "ehds:certification",
    "isAllOf",
    ["ISO/IEC 27001"],
    ["EHDS Art. 73(1)", "GDPR Art. 32", "NIS2 Art. 21"],
  ),
  legalBasisPermit: constraint(
    "ehds:legalBasis",
    "eq",
    "GDPR Art. 9(2)(g) to (j) with the data permit",
    ["GDPR Art. 6(1), Art. 9(2)", "EHDS Art. 68"],
  ),
  legalBasisConsent: constraint(
    "ehds:legalBasis",
    "eq",
    "GDPR Art. 6(1)(a) and Art. 9(2)(a), the user's consent",
    ["GDPR Art. 6(1)(a), Art. 9(2)(a)", "DA Art. 5(1)"],
  ),
  purposeDataAct: constraint(
    "ehds:purpose",
    "eq",
    "Data Act Art. 5 - the use the user agreed with the recipient",
    ["DA Art. 5(1), Art. 6(1)"],
  ),
} as const;

const D = {
  spe: action("ehds:secureProcessingEnvironment", ["EHDS Art. 73"]),
  attest: action("ehds:attestEnvironment", [
    "EHDS Art. 73(1)",
    "GDPR Art. 32(1)",
  ]),
  pseudonymize: action("ehds:pseudonymize", [
    "EHDS Art. 66(3)",
    "GDPR Art. 89(1)",
  ]),
  minimize: action("ehds:minimizeData", [
    "EHDS Art. 66(1)",
    "GDPR Art. 5(1)(c)",
  ]),
  audit: action("ehds:maintainAuditTrail", ["EHDS Art. 73(1)", "GDPR Art. 30"]),
  publish: action("ehds:publishResults", ["EHDS Art. 61(4)"]),
  attribute: action("attribute", ["EHDS Art. 61(4)"]),
  delete: action("delete", [
    "GDPR Art. 5(1)(e)",
    "DA Art. 6(1)",
    "EHDS Art. 68(12)",
  ]),
  reportIncident: action("ehds:reportIncident", [
    "EHDS Art. 61(5)",
    "GDPR Art. 33",
  ]),
  anonymizeK10: action("anonymize", ["EHDS Art. 69", "GDPR Recital 26"], {
    constraint: [
      { leftOperand: "ehds:kAnonymity", operator: "gteq", rightOperand: 10 },
    ],
  }),
  aggregateOnly: action("ehds:aggregateOnly", ["EHDS Art. 69(1)"]),
  documentTrainingData: action("ehds:documentTrainingData", [
    "AI Act Art. 10(2)",
    "AI Act Art. 11",
  ]),
} as const;

const P = {
  reIdentify: action("ehds:reIdentify", [
    "EHDS Art. 61(3)",
    "DGA Art. 5(5)",
    "GDPR Art. 5(1)(b)",
  ]),
  extract: action("extract", ["EHDS Art. 73(2)", "DGA Art. 5(3)(b)"]),
  advertise: action("ehds:advertise", ["EHDS Art. 54(c)"]),
  insurance: action("ehds:insuranceDecision", ["EHDS Art. 54(b)"]),
  detrimental: action("ehds:detrimentalDecision", [
    "EHDS Art. 54(a), (d), (e)",
  ]),
  outsideEurope: action("ehds:transferOutsideEU", [
    "GDPR Art. 44",
    "DGA Art. 5(10), Art. 31",
    "DA Art. 32",
  ]),
  extractTrainingData: action("ehds:extractTrainingData", [
    "EHDS Art. 61(3)",
    "AI Act Art. 10(5)",
  ]),
  prohibitedAi: action("ehds:prohibitedAiPractice", ["AI Act Art. 5"]),
  competingProduct: action("ehds:developCompetingProduct", ["DA Art. 6(2)(e)"]),
  gatekeeper: action("ehds:shareWithGatekeeper", ["DA Art. 6(2)(d)"]),
  profile: action("ehds:profile", ["DA Art. 6(2)(b)", "GDPR Art. 22"]),
} as const;

/* ── The four policies ─────────────────────────────────────────── */

function build(
  id: string,
  title: string,
  useWhen: string,
  regulations: string[],
  constraints: Clause[],
  duties: Clause[],
  prohibitions: Clause[],
): StandardPolicy {
  return {
    id,
    title,
    useWhen,
    regulations,
    policy: {
      "@context": POLICY_CONTEXT,
      "@type": "Set",
      "@id": id,
      permission: [
        {
          action: "use",
          constraint: constraints.map((c) => c.rule),
          duty: duties.map((d) => d.rule),
        },
      ],
      prohibition: prohibitions.map((p) => p.rule),
    },
    clauses: [
      ...constraints.map((clause) => ({ kind: "constraint" as const, clause })),
      ...duties.map((clause) => ({ kind: "duty" as const, clause })),
      ...prohibitions.map((clause) => ({
        kind: "prohibition" as const,
        clause,
      })),
    ],
  };
}

/** Pseudonymised record-level data under a permit, in a confidential SPE. */
const PERMIT_IN_SPE = build(
  "mvhd-ehds-permit-spe",
  "EHDS secondary use under a data permit, in a confidential SPE",
  "Record-level health data, pseudonymised, for any Art. 53(1) purpose a data permit names.",
  ["EHDS", "GDPR", "DGA", "ISO/IEC 27001"],
  [
    C.purposeArt53,
    C.dataPermit,
    C.legalBasisPermit,
    C.oneYear,
    C.inEurope,
    C.confidentialSpe,
    C.iso27001,
  ],
  [
    D.spe,
    D.attest,
    D.pseudonymize,
    D.minimize,
    D.audit,
    D.publish,
    D.attribute,
    D.reportIncident,
    D.delete,
  ],
  [
    P.reIdentify,
    P.extract,
    P.advertise,
    P.insurance,
    P.detrimental,
    P.outsideEurope,
  ],
);

/** Anonymised statistics answered to a health data request. */
const ANONYMISED_REQUEST = build(
  "mvhd-ehds-anonymised-request",
  "EHDS health data request, anonymised statistics only",
  "Aggregated, anonymised answers to a question (Art. 69); no record leaves the holder.",
  ["EHDS", "GDPR"],
  [C.purposeArt53, C.dataRequest, C.oneYear, C.inEurope],
  [D.anonymizeK10, D.aggregateOnly, D.attribute, D.publish, D.delete],
  [P.reIdentify, P.advertise, P.insurance, P.detrimental],
);

/** Training an AI system: the permit policy plus the AI Act's terms. */
const AI_TRAINING = build(
  "mvhd-ehds-ai-training",
  "EHDS secondary use for training an AI system, in a confidential SPE",
  "Scientific research that trains or validates an AI system on pseudonymised data.",
  ["EHDS", "GDPR", "DGA", "AI Act", "ISO/IEC 27001"],
  [
    constraint(
      "ehds:purpose",
      "eq",
      "EHDS Art. 53(1)(e) - scientific research: training and validating an AI system",
      ["EHDS Art. 53(1)(e)", "AI Act Art. 10"],
    ),
    C.dataPermit,
    C.legalBasisPermit,
    C.oneYear,
    C.inEurope,
    C.confidentialSpe,
    C.iso27001,
  ],
  [
    D.spe,
    D.attest,
    D.pseudonymize,
    D.minimize,
    D.audit,
    D.documentTrainingData,
    D.publish,
    D.attribute,
    D.reportIncident,
    D.delete,
  ],
  [
    P.reIdentify,
    P.extract,
    P.extractTrainingData,
    P.prohibitedAi,
    P.advertise,
    P.insurance,
    P.detrimental,
    P.outsideEurope,
  ],
);

/** Device data the user has a recipient fetch (Data Act Art. 5). */
const DEVICE_DATA = build(
  "mvhd-da-device-data",
  "Data Act: device data shared at the user's request",
  "Data a connected device generates (a glucose sensor, a wearable), shared with a recipient the user chose.",
  ["DA", "GDPR"],
  [C.purposeDataAct, C.legalBasisConsent, C.oneYear, C.inEurope],
  [D.minimize, D.audit, D.delete],
  [P.competingProduct, P.gatekeeper, P.profile, P.outsideEurope],
);

export const STANDARD_POLICIES: StandardPolicy[] = [
  PERMIT_IN_SPE,
  ANONYMISED_REQUEST,
  AI_TRAINING,
  DEVICE_DATA,
];
