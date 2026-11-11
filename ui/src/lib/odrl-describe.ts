/**
 * An ODRL 2.2 policy in plain language (/admin/policies).
 *
 * A policy definition in this hub comes in several shapes: the EDC
 * management API answers compact JSON-LD with plain keys ("permission",
 * "action": "use"), the page's templates write prefixed keys
 * ("odrl:permission", { "@id": "odrl:use" }), an expanded document uses
 * full IRIs, the Neo4j local registry stores the JSON as a string, and the
 * graph seed flattens a policy into ehdsPermissions / ehdsProhibitions.
 * parsePolicy() reads them all into one model; describePolicy() turns that
 * model into sentences; validatePolicy() (odrl-validate.ts) checks it.
 *
 * Nothing here translates. Every sentence is a PolicyText: an English
 * template, which is the key of the `admin` dictionary, and its values.
 * renderPolicyText() fills it in with the page's translator. Values that
 * are data (a purpose as the policy wrote it, a DID, an unknown action's
 * name) are plain strings and stay as they are.
 */

/* ── Texts ─────────────────────────────────────────────────────── */

/** A string is data and is shown as it is; a PolicyText is translated. */
export type Phrase = string | PolicyText;

export interface PolicyText {
  text: string;
  vars?: Record<string, number | Phrase | Phrase[]>;
}

type Translate = (
  text: string,
  vars?: Record<string, string | number>,
) => string;

const p = (text: string, vars?: PolicyText["vars"]): PolicyText => ({
  text,
  ...(vars ? { vars } : {}),
});

/** A PolicyText in the translator's language; lists are joined with "; ". */
export function renderPolicyText(phrase: Phrase, t: Translate): string {
  if (typeof phrase === "string") return phrase;
  const vars: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(phrase.vars ?? {})) {
    vars[k] = Array.isArray(v)
      ? v.map((x) => renderPolicyText(x, t)).join("; ")
      : typeof v === "number"
        ? v
        : renderPolicyText(v, t);
  }
  return t(phrase.text, phrase.vars ? vars : undefined);
}

/* ── Identifiers ───────────────────────────────────────────────── */

export type Namespace = "odrl" | "edc" | "ehds" | "other" | "none";

export interface Ident {
  ns: Namespace;
  /** The local name: "use" for odrl:use, use, or the full ODRL IRI. */
  local: string;
  raw: string;
}

const IRIS: [Namespace, string][] = [
  ["odrl", "http://www.w3.org/ns/odrl/2/"],
  ["odrl", "https://www.w3.org/ns/odrl/2/"],
  ["edc", "https://w3id.org/edc/v0.0.1/ns/"],
  ["ehds", "https://w3id.org/ehds/"],
];
const PREFIXES: Record<string, Namespace> = {
  odrl: "odrl",
  edc: "edc",
  ehds: "ehds",
};

function parseIdent(raw: string): Ident {
  for (const [ns, iri] of IRIS) {
    if (raw.startsWith(iri)) {
      const local = raw.slice(iri.length).split(/[/#]/).pop() ?? "";
      return { ns, local, raw };
    }
  }
  if (/^https?:\/\//.test(raw)) {
    return { ns: "other", local: raw.split(/[/#]/).pop() ?? raw, raw };
  }
  const m = /^([A-Za-z][\w.-]*):(.+)$/.exec(raw);
  if (m) return { ns: PREFIXES[m[1]] ?? "other", local: m[2], raw };
  return { ns: "none", local: raw, raw };
}

/* ── Reading JSON-LD in any of its shapes ──────────────────────── */

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** The value under a key whose local name is `name`, any prefix. */
function get(o: Obj, name: string): unknown {
  if (name in o) return o[name];
  for (const k of Object.keys(o)) {
    if (!k.startsWith("@") && parseIdent(k).local === name) return o[k];
  }
  return undefined;
}

function has(o: Obj, name: string): boolean {
  return get(o, name) !== undefined;
}

/** A list, whatever the shape: an array, one object, an @list. */
function list(v: unknown): unknown[] {
  if (v === undefined || v === null) return [];
  if (isObj(v) && Array.isArray(v["@list"])) return v["@list"] as unknown[];
  return Array.isArray(v) ? v : [v];
}

/** The identifier of an action, operand or operator, or null. */
function identOf(v: unknown): Ident | null {
  if (Array.isArray(v)) return v.length ? identOf(v[0]) : null;
  if (typeof v === "string") return v.trim() ? parseIdent(v.trim()) : null;
  if (isObj(v)) {
    if (typeof v["@id"] === "string") return parseIdent(v["@id"]);
    for (const k of ["value", "type", "@value"]) {
      const inner = k.startsWith("@") ? v[k] : get(v, k);
      if (inner !== undefined) return identOf(inner);
    }
  }
  return null;
}

/** A right operand value as data: a string, a number, or a list of them. */
function scalar(v: unknown): string | number | boolean {
  if (
    typeof v === "string" ||
    typeof v === "number" ||
    typeof v === "boolean"
  ) {
    return v;
  }
  if (Array.isArray(v)) return v.map(scalar).join(", ");
  if (isObj(v)) {
    if ("@value" in v) return scalar(v["@value"]);
    if (typeof v["@id"] === "string") return parseIdent(v["@id"]).local;
    const inner = get(v, "value");
    if (inner !== undefined) return scalar(inner);
  }
  return JSON.stringify(v);
}

/* ── The model ─────────────────────────────────────────────────── */

export type LogicalOp = "and" | "or" | "xone" | "andSequence";
const LOGICAL: LogicalOp[] = ["and", "or", "xone", "andSequence"];

export type Constraint =
  | {
      kind: "atomic";
      left: Ident | null;
      operator: Ident | null;
      /** undefined when the constraint has none; an array for a set. */
      right: undefined | string | number | boolean | (string | number)[];
      /** A rightOperandReference stands in for the value (ODRL 2.2). */
      rightReference: boolean;
    }
  | { kind: "logical"; op: LogicalOp; operands: Constraint[] };

export type RuleType = "permission" | "prohibition" | "obligation" | "duty";

export interface Rule {
  type: RuleType;
  /** 1-based position in its list, for the findings. */
  index: number;
  action: Ident | null;
  assignee: string | null;
  constraints: Constraint[];
  /** A permission's duties. */
  duties: Rule[];
}

export interface ParsedPolicy {
  /** false when the input was not a JSON object at all. */
  isObject: boolean;
  type: Ident | null;
  assigner: string | null;
  assignee: string | null;
  /** ODRL's conflict strategy: perm, prohibit or invalid (the default). */
  conflict: string | null;
  permissions: Rule[];
  prohibitions: Rule[];
  obligations: Rule[];
}

function parseConstraint(v: unknown): Constraint {
  const o = isObj(v) ? v : {};
  for (const op of LOGICAL) {
    if (has(o, op)) {
      return {
        kind: "logical",
        op,
        operands: list(get(o, op)).map(parseConstraint),
      };
    }
  }
  const rawRight = get(o, "rightOperand");
  let right: Extract<Constraint, { kind: "atomic" }>["right"];
  if (rawRight === undefined || rawRight === null) right = undefined;
  else if (
    Array.isArray(rawRight) ||
    (isObj(rawRight) && "@list" in rawRight)
  ) {
    right = list(rawRight).map((x) => {
      const s = scalar(x);
      return typeof s === "boolean" ? String(s) : s;
    });
  } else right = scalar(rawRight);
  // Expanded JSON-LD wraps even a single value in an array, so a list of one
  // is read as that value: ["x"] for isAnyOf and "x" for eq mean the same.
  if (Array.isArray(right) && right.length === 1) right = right[0];
  return {
    kind: "atomic",
    left: identOf(get(o, "leftOperand")),
    operator: identOf(get(o, "operator")),
    right,
    rightReference: has(o, "rightOperandReference"),
  };
}

function partyOf(v: unknown): string | null {
  const id = identOf(v) ?? (isObj(v) ? identOf(get(v, "uid")) : null);
  if (!id) return null;
  // The page's templates write { "@id": "odrl:assignee" }: a placeholder
  // for "whoever the agreement names", not a party.
  return id.local === "assignee" || id.local === "assigner" ? null : id.raw;
}

function parseRule(v: unknown, type: RuleType, index: number): Rule {
  const o = isObj(v) ? v : {};
  const action = get(o, "action");
  // An action may carry refinements: { "rdf:value": ..., refinement: [...] }.
  const refinements = isObj(action)
    ? list(get(action, "refinement")).map(parseConstraint)
    : [];
  return {
    type,
    index,
    action: identOf(action),
    assignee: partyOf(get(o, "assignee")),
    constraints: [
      ...list(get(o, "constraint")).map(parseConstraint),
      ...refinements,
    ],
    duties:
      type === "permission"
        ? list(get(o, "duty")).map((d, i) => parseRule(d, "duty", i + 1))
        : [],
  };
}

/** What the graph seed's flattened OdrlPolicy names its prohibitions. */
const FLAT_PROHIBITIONS: Record<string, string> = {
  re_identification: "reIdentify",
  commercial_exploitation_without_approval: "commercialize",
};

function textOf(v: unknown): string | null {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v === "string") return v;
  if (isObj(v) && typeof v.toString === "function") {
    const s = String(v);
    if (s !== "[object Object]") return s;
  }
  return String(scalar(v));
}

/**
 * The ODRL policy inside whatever the API returned for one entry: an EDC
 * PolicyDefinition (policy / edc:policy), a local-registry node with its
 * JSON as a string (policyJson), or the graph seed's flattened OdrlPolicy.
 */
export function policyOf(entry: unknown): unknown {
  if (typeof entry === "string") {
    try {
      return policyOf(JSON.parse(entry));
    } catch {
      return entry;
    }
  }
  if (Array.isArray(entry) && entry.length === 1) return policyOf(entry[0]);
  if (!isObj(entry)) return entry;
  const inner = get(entry, "policy");
  if (inner !== undefined && inner !== null) return policyOf(inner);
  if (typeof entry.policyJson === "string") return policyOf(entry.policyJson);
  if (
    entry.ehdsPermissions !== undefined ||
    entry.ehdsProhibitions !== undefined ||
    entry.odrlAction !== undefined
  ) {
    const purposes = list(entry.ehdsPermissions).map(String);
    const until = textOf(entry.temporalLimit);
    const constraint: Obj[] = [];
    if (purposes.length) {
      constraint.push({
        leftOperand: "purpose",
        operator: "isAnyOf",
        rightOperand: purposes,
      });
    }
    if (until) {
      constraint.push({
        leftOperand: "dateTime",
        operator: "lteq",
        rightOperand: until,
      });
    }
    return {
      "@type": "Set",
      permission: [{ action: String(entry.odrlAction ?? "use"), constraint }],
      prohibition: list(entry.ehdsProhibitions).map((x) => ({
        action: FLAT_PROHIBITIONS[String(x)] ?? String(x),
      })),
    };
  }
  return entry;
}

export function parsePolicy(entry: unknown): ParsedPolicy {
  const policy = policyOf(entry);
  if (!isObj(policy)) {
    return {
      isObject: false,
      type: null,
      assigner: null,
      assignee: null,
      conflict: null,
      permissions: [],
      prohibitions: [],
      obligations: [],
    };
  }
  const rules = (name: string, type: RuleType) =>
    list(get(policy, name)).map((r, i) => parseRule(r, type, i + 1));
  return {
    isObject: true,
    type: identOf(policy["@type"] ?? get(policy, "type")),
    assigner: partyOf(get(policy, "assigner")),
    assignee: partyOf(get(policy, "assignee")),
    conflict: identOf(get(policy, "conflict"))?.local ?? null,
    permissions: rules("permission", "permission"),
    prohibitions: rules("prohibition", "prohibition"),
    obligations: rules("obligation", "obligation"),
  };
}

/* ── Vocabulary ────────────────────────────────────────────────── */

/**
 * What an action means, as a verb phrase: the ODRL 2.2 actions a health
 * dataspace uses, and the EDC / EHDS extensions of the hub's templates and
 * seeds. The rest of ODRL's vocabulary (play, install, watermark...) is
 * known to the validator through ODRL_ACTIONS and shown by its name.
 */
const ACTION_LABELS: Record<string, string> = {
  // ODRL 2.2
  use: "use the data",
  transfer: "transfer the data",
  read: "read the data",
  display: "display the data",
  print: "print the data",
  reproduce: "copy the data",
  distribute: "distribute the data",
  modify: "modify the data",
  derive: "derive new data from the data",
  aggregate: "aggregate the data",
  anonymize: "anonymize the data",
  archive: "archive the data",
  delete: "delete the data",
  extract: "extract the data",
  transform: "transform the data",
  translate: "translate the data",
  sell: "sell the data",
  grantUse: "grant others use of the data",
  attribute: "attribute the source",
  compensate: "pay for the use",
  inform: "inform the data holder",
  obtainConsent: "obtain consent",
  commercialize: "use the data commercially",
  // EDC and EHDS extensions in the hub
  reIdentify: "re-identify persons in the data",
  pseudonymize: "pseudonymize the data",
  minimizeData: "use only the data needed",
  maintainAuditTrail: "keep an audit trail",
  logAccess: "log every access",
  notifyPatient: "notify the patient",
  aggregateOnly: "release aggregated results only",
  secureProcessingEnvironment:
    "process the data in a secure processing environment",
  extractTrainingData: "extract training data from a model",
  secondaryUse: "use the data for secondary use",
  thirdPartySharing: "share the data with third parties",
  publishIndividualLevel: "publish individual-level data",
  advertise: "use the data for advertising or marketing",
  // The standard policies' clauses (lib/standard-policies.ts, ADR-077)
  attestEnvironment: "prove the environment by remote attestation",
  publishResults: "publish the results within 18 months",
  reportIncident:
    "report incidents and significant findings to the access body",
  insuranceDecision: "use the data for decisions on insurance or credit",
  detrimentalDecision: "use the data for decisions to a person's detriment",
  transferOutsideEU: "transfer the data outside the EU/EEA",
  documentTrainingData:
    "document the training data, its origin and the examination for bias",
  prohibitedAiPractice: "use the data for an AI practice the AI Act prohibits",
  developCompetingProduct: "develop a product that competes with the device",
  shareWithGatekeeper: "make the data available to a gatekeeper",
  profile: "profile persons, unless the service needs it",
};

/** ODRL 2.2's actions; any other action in the odrl: namespace is unknown. */
export const ODRL_ACTIONS = new Set([
  "use",
  "transfer",
  "read",
  "display",
  "print",
  "reproduce",
  "distribute",
  "modify",
  "derive",
  "aggregate",
  "anonymize",
  "annotate",
  "archive",
  "delete",
  "extract",
  "index",
  "transform",
  "translate",
  "sell",
  "give",
  "present",
  "stream",
  "execute",
  "install",
  "uninstall",
  "move",
  "include",
  "concurrentUse",
  "digitize",
  "grantUse",
  "attribute",
  "compensate",
  "inform",
  "obtainConsent",
  "reviewPolicy",
  "nextPolicy",
  "acceptTracking",
  "ensureExclusivity",
  "synchronize",
  "textToSpeech",
  "watermark",
  "play",
  "commercialize",
]);

/** The action's known local name, matched without regard to case. */
export function knownAction(id: Ident): string | null {
  const lower = id.local.toLowerCase();
  return (
    [...Object.keys(ACTION_LABELS), ...ODRL_ACTIONS].find(
      (k) => k.toLowerCase() === lower,
    ) ?? null
  );
}

/** Left operands as noun phrases. */
const OPERAND_LABELS: Record<string, string> = {
  purpose: "the purpose",
  kAnonymity: "k-anonymity",
  patientConsent: "patient consent",
  inForceDate: "the period of validity",
  dateTime: "the date",
  elapsedTime: "the time of use",
  meteredTime: "the metered time",
  spatial: "the region",
  spatialCoordinates: "the location",
  count: "the number of uses",
  percentage: "the share of the data",
  recipient: "the recipient",
  industry: "the industry",
  event: "the event",
  systemDevice: "the system",
  version: "the version",
  dataPermit: "the data permit",
  permitId: "the data permit",
  hdabApproval: "the approval of the health data access body",
  MembershipCredential: "the membership credential",
  processingEnvironment: "the processing environment",
  certification: "the certification",
  legalBasis: "the legal basis",
  // Decided by the hub's connector against a DataProcessingPurposeCredential (ADR-090)
  attestedPurpose: "the purpose the recipient's credential attests",
};

/** ODRL 2.2's operators. */
export const OPERATORS = [
  "eq",
  "neq",
  "gt",
  "gteq",
  "lt",
  "lteq",
  "isA",
  "isAnyOf",
  "isAllOf",
  "isNoneOf",
  "isPartOf",
  "hasPart",
] as const;

const OPERATOR_TEXTS: Record<string, string> = {
  eq: "{operand} is {value}",
  neq: "{operand} is not {value}",
  gt: "{operand} is more than {value}",
  gteq: "{operand} is at least {value}",
  lt: "{operand} is less than {value}",
  lteq: "{operand} is at most {value}",
  isA: "{operand} is a {value}",
  isAnyOf: "{operand} is one of {value}",
  isAllOf: "{operand} includes all of {value}",
  isNoneOf: "{operand} is none of {value}",
  isPartOf: "{operand} is within {value}",
  hasPart: "{operand} includes {value}",
};

const LOGICAL_TEXTS: Record<LogicalOp, string> = {
  and: "all of ({conditions})",
  or: "at least one of ({conditions})",
  xone: "exactly one of ({conditions})",
  andSequence: "in this order ({conditions})",
};

/** camelCase as words, for an action or operand the hub has no label for. */
function words(local: string): string {
  return local
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .toLowerCase();
}

export function actionPhrase(id: Ident | null): Phrase {
  if (!id) return p("an unnamed action");
  const known = knownAction(id);
  return known && ACTION_LABELS[known]
    ? p(ACTION_LABELS[known])
    : words(known ?? id.local);
}

function operandPhrase(id: Ident | null): Phrase {
  if (!id) return p("an unnamed operand");
  const label = OPERAND_LABELS[id.local];
  return label ? p(label) : words(id.local);
}

function valueText(v: Extract<Constraint, { kind: "atomic" }>["right"]) {
  if (v === undefined) return "?";
  return Array.isArray(v) ? v.join(", ") : String(v);
}

function constraintPhrase(c: Constraint): Phrase {
  if (c.kind === "logical") {
    return p(LOGICAL_TEXTS[c.op], {
      conditions: c.operands.map(constraintPhrase),
    });
  }
  const op = c.operator?.local ?? "";
  const template = OPERATOR_TEXTS[op];
  const vars = { operand: operandPhrase(c.left), value: valueText(c.right) };
  return template
    ? p(template, vars)
    : p("{operand} {operator} {value}", { ...vars, operator: op || "?" });
}

/* ── Purpose and time, the two conditions a reader asks about first ── */

const POSITIVE_SET = new Set(["eq", "isA", "isAnyOf", "isPartOf", "isAllOf"]);
const NEGATIVE_SET = new Set(["neq", "isNoneOf"]);

export const PERMIT_OPERANDS = new Set([
  "dataPermit",
  "permitId",
  "permit",
  "hdabApproval",
  "dataPermitId",
]);

/** contractAgreement+90d: EDC's period counted from the agreement. */
const CONTRACT_PERIOD = /^contractAgreement\s*\+\s*(\d+)\s*([smhdw])$/;

export function isTimeOperand(local: string): boolean {
  return ["inForceDate", "dateTime", "elapsedTime", "meteredTime"].includes(
    local,
  );
}

function periodPhrase(n: number, unit: string): Phrase {
  if (unit === "d" && n % 365 === 0) {
    return n === 365 ? p("1 year") : p("{n} years", { n: n / 365 });
  }
  if (unit === "d") return p("{n} days", { n });
  if (unit === "w") return p("{n} days", { n: n * 7 });
  if (unit === "h") return p("{n} hours", { n });
  return `${n}${unit}`;
}

/** A time constraint as the period it allows, or null when it sets none. */
function timePhrase(c: Constraint): Phrase | null {
  if (c.kind !== "atomic" || !c.left || !isTimeOperand(c.left.local)) {
    return null;
  }
  const op = c.operator?.local;
  if (op !== "lteq" && op !== "lt" && op !== "eq") return null;
  const v = typeof c.right === "string" ? c.right.trim() : null;
  if (!v) return null;
  const period = CONTRACT_PERIOD.exec(v);
  if (period) {
    return p("for {duration} after the contract is agreed", {
      duration: periodPhrase(Number(period[1]), period[2]),
    });
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) {
    return p("until {date}", { date: v.slice(0, 10) });
  }
  if (/^P/.test(v)) return p("for {duration}", { duration: v });
  return null;
}

/** All atomic constraints, the operands of an "and" included. */
export function flatConstraints(cs: Constraint[]): Constraint[] {
  return cs.flatMap((c) =>
    c.kind === "logical" && c.op === "and" ? flatConstraints(c.operands) : [c],
  );
}

export function purposeValues(c: Constraint): string[] {
  if (c.kind !== "atomic" || c.left?.local !== "purpose") return [];
  if (c.right === undefined) return [];
  return (Array.isArray(c.right) ? c.right : [c.right]).map(String);
}

/* ── describePolicy ────────────────────────────────────────────── */

export interface ConstraintPart {
  leftOperand: string;
  operator: string;
  text: Phrase;
}

export interface RulePart {
  action: string;
  label: Phrase;
  assignee: string | null;
  constraints: ConstraintPart[];
  /** The action with its conditions, e.g. "anonymize the data (k-anonymity is at least 5)". */
  text: Phrase;
}

export interface PermissionPart extends RulePart {
  /** The purposes the permission is limited to, as the policy wrote them. */
  purposes: string[];
  /** The period it allows, or null for none. */
  timeLimit: Phrase | null;
  /** The conditions other than purpose and period. */
  conditions: Phrase[];
  duties: RulePart[];
  /** Who may do it, for which purpose and how long, as one sentence. */
  sentence: PolicyText;
}

export interface PolicyDescription {
  permissions: PermissionPart[];
  prohibitions: RulePart[];
  /** The permissions' duties and the policy's obligations, together. */
  duties: RulePart[];
  /** The policy in sentences, in reading order. */
  sentences: PolicyText[];
}

function rulePart(r: Rule): RulePart {
  const constraints = r.constraints.map((c) => ({
    leftOperand: c.kind === "atomic" ? c.left?.local ?? "" : c.op,
    operator: c.kind === "atomic" ? c.operator?.local ?? "" : c.op,
    text: constraintPhrase(c),
  }));
  const label = actionPhrase(r.action);
  return {
    action: r.action ? knownAction(r.action) ?? r.action.local : "",
    label,
    assignee: r.assignee,
    constraints,
    text: constraints.length
      ? p("{action} ({conditions})", {
          action: label,
          conditions: constraints.map((c) => c.text),
        })
      : label,
  };
}

/** Purposes are data, quoted as the policy wrote them. */
const quoted = (values: string[]) => values.map((v) => `"${v}"`).join(", ");

function permissionPart(r: Rule): PermissionPart {
  const base = rulePart(r);
  const flat = flatConstraints(r.constraints);
  const purposes: string[] = [];
  let purposeClause: Phrase = p("for any purpose");
  let timeLimit: Phrase | null = null;
  const conditions: Phrase[] = [];
  for (const c of flat) {
    const op = c.kind === "atomic" ? c.operator?.local ?? "" : "";
    const values = purposeValues(c);
    if (values.length && POSITIVE_SET.has(op) && !purposes.length) {
      purposes.push(...values);
      purposeClause = p("only for {purposes}", { purposes: quoted(values) });
      continue;
    }
    if (values.length && NEGATIVE_SET.has(op) && !purposes.length) {
      purposeClause = p("for any purpose except {purposes}", {
        purposes: quoted(values),
      });
      continue;
    }
    const time: Phrase | null = timeLimit ? null : timePhrase(c);
    if (time) {
      timeLimit = time;
      continue;
    }
    conditions.push(constraintPhrase(c));
  }
  return {
    ...base,
    purposes,
    timeLimit,
    conditions,
    duties: r.duties.map(rulePart),
    sentence: p("{who} may {action}, {purpose}, {time}.", {
      who: r.assignee ? r.assignee : p("Anyone who has a contract"),
      action: base.label,
      purpose: purposeClause,
      time: timeLimit ?? p("without time limit"),
    }),
  };
}

/**
 * The policy in plain language: who may do what, under which conditions,
 * what is forbidden, what must be done. Each part is a PolicyText for the
 * page to translate.
 */
export function describePolicy(entry: unknown): PolicyDescription {
  const policy = parsePolicy(entry);
  const permissions = policy.permissions.map(permissionPart);
  const prohibitions = policy.prohibitions.map(rulePart);
  const duties = [
    ...permissions.flatMap((pm) => pm.duties),
    ...policy.obligations.map(rulePart),
  ];

  const sentences: PolicyText[] = [];
  if (!permissions.length) sentences.push(p("Nothing is permitted."));
  for (const pm of permissions) {
    sentences.push(pm.sentence);
    if (pm.conditions.length) {
      sentences.push(
        p("Only if: {conditions}.", { conditions: pm.conditions }),
      );
    }
  }
  const anyConstraint = policy.permissions.some((r) => r.constraints.length);
  const anyCondition = permissions.some((pm) => pm.conditions.length);
  if (!anyCondition && !prohibitions.length && !duties.length) {
    sentences.push(
      anyConstraint
        ? p("No further conditions, prohibitions or duties.")
        : p("No conditions, prohibitions or duties."),
    );
  } else {
    sentences.push(
      prohibitions.length
        ? p("Forbidden: {actions}.", {
            actions: prohibitions.map((r) => r.text),
          })
        : p("Nothing is forbidden."),
    );
    sentences.push(
      duties.length
        ? p("Required: {actions}.", { actions: duties.map((r) => r.text) })
        : p("No duties."),
    );
  }
  return { permissions, prohibitions, duties, sentences };
}

/** Every template the label maps hold, for the dictionary test. */
export const ODRL_LABEL_TEXTS: string[] = [
  ...Object.values(ACTION_LABELS),
  ...Object.values(OPERAND_LABELS),
  ...Object.values(OPERATOR_TEXTS),
  ...Object.values(LOGICAL_TEXTS),
];
