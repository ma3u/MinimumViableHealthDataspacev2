/**
 * Checks an ODRL policy (/admin/policies): is it valid ODRL 2.2, and is it
 * fit for secondary use under the EHDS Regulation (EU) 2025/327?
 *
 * Two kinds of finding, kept apart because they mean different things:
 *
 *   odrl  the policy is not valid ODRL 2.2: a rule without an action, a
 *         constraint without an operand, an operator that cannot compare
 *         what it is given, an action both permitted and prohibited. A
 *         connector may reject it or read it differently from its author.
 *   ehds  the policy is valid but does not carry what the Regulation asks
 *         of secondary use: a purpose of Art. 53(1), a data permit (Art.
 *         68) with its period, the prohibitions of Art. 54 and 61(3), the
 *         secure processing environment of Art. 73. Recommendations: the
 *         permit, not the policy, is what the hub enforces (permit-gate).
 *
 * Every finding cites the section or article it rests on. Messages are
 * PolicyTexts, English templates the page translates (odrl-describe.ts).
 */
import {
  type Constraint,
  type Ident,
  type ParsedPolicy,
  type PolicyText,
  type Rule,
  OPERATORS,
  ODRL_ACTIONS,
  PERMIT_OPERANDS,
  actionPhrase,
  flatConstraints,
  isTimeOperand,
  knownAction,
  parsePolicy,
  purposeValues,
} from "@/lib/odrl-describe";
import { PURPOSES, PURPOSE_LABELS, type Purpose } from "@/lib/permits";

export type Severity = "error" | "warning" | "info";

export interface PolicyFinding {
  /** A stable code, for tests and for anyone filtering findings. */
  code: string;
  severity: Severity;
  /** odrl: not valid ODRL 2.2. ehds: an EHDS recommendation. */
  kind: "odrl" | "ehds";
  /** The section or article the finding rests on, e.g. "EHDS Art. 68". */
  article: string;
  message: PolicyText;
  /** Which rule it is about, e.g. "Permission 1"; absent for the policy. */
  where?: PolicyText;
}

export type PolicyVerdict = "valid" | "warnings" | "errors";

const p = (text: string, vars?: PolicyText["vars"]): PolicyText => ({
  text,
  ...(vars ? { vars } : {}),
});

/* ── Operators and the operands they can compare ───────────────── */

const COMPARISON = ["eq", "neq", "gt", "gteq", "lt", "lteq"];
const SET = ["isA", "isAnyOf", "isAllOf", "isNoneOf", "isPartOf", "hasPart"];

const NUMERIC_OPERANDS = new Set([
  "kAnonymity",
  "count",
  "percentage",
  "absoluteSize",
  "relativeSize",
  "payAmount",
  "resolution",
  "lDiversity",
]);
const SET_OPERANDS = new Set([
  "purpose",
  "spatial",
  "recipient",
  "industry",
  "language",
  "media",
  "product",
  "fileFormat",
  "deliveryChannel",
  "event",
]);

/** The operators that make sense for an operand, or null for any. */
function operatorsFor(local: string): string[] | null {
  if (NUMERIC_OPERANDS.has(local)) return COMPARISON;
  if (isTimeOperand(local)) return COMPARISON.filter((o) => o !== "neq");
  if (SET_OPERANDS.has(local)) return ["eq", "neq", ...SET];
  return null;
}

/** contractAgreement+90d, or an ISO 8601 date, time or duration. */
const TIME_VALUE =
  /^(contractAgreement\s*\+\s*\d+\s*[smhdw]|\d{4}-\d{2}-\d{2}([T ][\d:.]+(Z|[+-]\d{2}:?\d{2})?)?|P(?=\d|T\d)(\d+Y)?(\d+M)?(\d+W)?(\d+D)?(T(\d+H)?(\d+M)?(\d+(\.\d+)?S)?)?)$/;

/* ── The purposes of Art. 53(1) ────────────────────────────────── */

/** Words that name each purpose; the letters come from PURPOSE_LABELS. */
const PURPOSE_WORDS: Record<Purpose, RegExp> = {
  PUBLIC_HEALTH:
    /public[ _]health|occupational health|health threat|surveillance/i,
  POLICY_MAKING:
    /polic(y|ies)[ _-]?making|policy[ _]support|regulatory|pharmacovigilance|medical device/i,
  STATISTICS: /statistic/i,
  EDUCATION: /education|teaching/i,
  SCIENTIFIC_RESEARCH:
    /research|\bai\b|ai[ _/]|machine learning|model training|algorithm/i,
  CARE_IMPROVEMENT:
    /improvement of the delivery of care|delivery of care|treatment optimi|personali[sz]ed medicine/i,
};

const LETTER: Record<Purpose, string> = Object.fromEntries(
  PURPOSES.map((k) => [k, /^\((\w)\)/.exec(PURPOSE_LABELS[k])?.[1] ?? ""]),
) as Record<Purpose, string>;

/** Art. 54: what secondary use may never be for. */
const FORBIDDEN_PURPOSE =
  /advertis|marketing|insurance|premium|credit|employment|hiring|weapon|addict|detrimental|exclude .* from (an )?insurance/i;

/** Primary use: care of the patient, Chapter II, not Art. 53. */
const PRIMARY_USE =
  /article 7\b|art\. ?7\b|primary use|cross-border treatment|treatment continuity|myhealth@eu/i;

function purposeOf(value: string): Purpose | null {
  const v = value.replace(/_/g, " ");
  const upper = value.trim().toUpperCase();
  if ((PURPOSES as readonly string[]).includes(upper)) return upper as Purpose;
  for (const k of PURPOSES) if (PURPOSE_WORDS[k].test(v)) return k;
  return null;
}

/* ── Actions that answer the EHDS checks ───────────────────────── */

const REIDENTIFY = new Set(["reIdentify", "reidentify", "reIdentification"]);
const ART54 = new Set([
  "commercialize",
  "advertise",
  "marketing",
  "sell",
  "commercialExploitation",
]);
const SPE = /secureProcessingEnvironment|processingEnvironment|^spe$/i;
const ANONYMISED_OUTPUT = new Set(["anonymize", "aggregateOnly", "aggregate"]);

/* ── The checks ────────────────────────────────────────────────── */

function where(r: Rule, parent?: Rule): PolicyText {
  if (parent) {
    return p("Permission {n}, duty {m}", { n: parent.index, m: r.index });
  }
  if (r.type === "permission") return p("Permission {n}", { n: r.index });
  if (r.type === "prohibition") return p("Prohibition {n}", { n: r.index });
  return p("Obligation {n}", { n: r.index });
}

function local(id: Ident | null): string {
  return id ? knownAction(id) ?? id.local : "";
}

function checkConstraint(
  c: Constraint,
  n: number,
  at: PolicyText,
  out: PolicyFinding[],
) {
  const odrl = (code: string, message: PolicyText) =>
    out.push({
      code,
      severity: "error",
      kind: "odrl",
      article: "ODRL 2.2, Constraint",
      message,
      where: at,
    });
  if (c.kind === "logical") {
    if (c.operands.length === 0) {
      odrl(
        "odrl.logical-empty",
        p("Constraint {c} combines no constraints.", { c: n }),
      );
    }
    c.operands.forEach((o) => checkConstraint(o, n, at, out));
    return;
  }
  if (!c.left) {
    odrl(
      "odrl.no-left-operand",
      p("Constraint {c} has no left operand.", { c: n }),
    );
  }
  if (!c.operator) {
    odrl("odrl.no-operator", p("Constraint {c} has no operator.", { c: n }));
  }
  if (c.right === undefined && !c.rightReference) {
    odrl(
      "odrl.no-right-operand",
      p("Constraint {c} has no right operand.", { c: n }),
    );
  }
  if (!c.left || !c.operator) return;
  const op = c.operator.local;
  if (!(OPERATORS as readonly string[]).includes(op)) {
    odrl(
      "odrl.unknown-operator",
      p("Constraint {c} uses the unknown operator {operator}.", {
        c: n,
        operator: c.operator.raw,
      }),
    );
    return;
  }
  const operand = c.left.local;
  const allowed = operatorsFor(operand);
  if (allowed && !allowed.includes(op)) {
    odrl(
      "odrl.operator-mismatch",
      p("Constraint {c}: {operator} cannot compare {operand}.", {
        c: n,
        operator: op,
        operand,
      }),
    );
    return;
  }
  if (c.right === undefined) return;
  if (COMPARISON.includes(op) && Array.isArray(c.right)) {
    odrl(
      "odrl.list-for-comparison",
      p("Constraint {c}: {operator} compares one value, not a list.", {
        c: n,
        operator: op,
      }),
    );
    return;
  }
  const values = Array.isArray(c.right) ? c.right : [c.right];
  if (
    NUMERIC_OPERANDS.has(operand) &&
    values.some(
      (v) => typeof v !== "number" && !/^-?\d+(\.\d+)?$/.test(String(v)),
    )
  ) {
    odrl(
      "odrl.not-a-number",
      p("Constraint {c}: {operand} needs a number, not {value}.", {
        c: n,
        operand,
        value: values.join(", "),
      }),
    );
  }
  if (
    isTimeOperand(operand) &&
    values.some((v) => !TIME_VALUE.test(String(v).trim()))
  ) {
    odrl(
      "odrl.not-a-time",
      p(
        "Constraint {c}: {value} is not a date, a duration or a period after the agreement.",
        { c: n, value: values.join(", ") },
      ),
    );
  }
}

function checkRule(r: Rule, out: PolicyFinding[], parent?: Rule) {
  const at = where(r, parent);
  if (!r.action) {
    out.push({
      code: "odrl.no-action",
      severity: "error",
      kind: "odrl",
      article: "ODRL 2.2, Action",
      message: p("The rule has no action."),
      where: at,
    });
  } else if (!knownAction(r.action)) {
    const odrlSpace = r.action.ns === "odrl" || r.action.ns === "none";
    out.push({
      code: odrlSpace ? "odrl.unknown-action" : "odrl.extension-action",
      severity: odrlSpace ? "error" : "warning",
      kind: "odrl",
      article: "ODRL 2.2, Action",
      message: odrlSpace
        ? p("{action} is not an ODRL action.", { action: r.action.raw })
        : p("{action} is an extension the hub does not know.", {
            action: r.action.raw,
          }),
      where: at,
    });
  } else if (r.action.ns === "odrl" && !ODRL_ACTIONS.has(local(r.action))) {
    out.push({
      code: "odrl.wrong-namespace",
      severity: "warning",
      kind: "odrl",
      article: "ODRL 2.2, Action",
      message: p(
        "{action} is not in the ODRL namespace; it is a hub extension.",
        {
          action: r.action.raw,
        },
      ),
      where: at,
    });
  }
  r.constraints.forEach((c, i) => checkConstraint(c, i + 1, at, out));
  r.duties.forEach((d) => checkRule(d, out, r));
}

function same(a: Constraint[], b: Constraint[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function checkConflicts(policy: ParsedPolicy, out: PolicyFinding[]) {
  const strategy = policy.conflict;
  for (const pr of policy.prohibitions) {
    const forbidden = local(pr.action);
    if (!forbidden) continue;
    for (const pm of policy.permissions) {
      const allowed = local(pm.action);
      // ODRL: every action is included in use, so forbidding use forbids all.
      if (allowed !== forbidden && forbidden !== "use") continue;
      if (!same(pm.constraints, pr.constraints)) continue;
      const resolved = strategy === "perm" || strategy === "prohibit";
      out.push({
        code: "odrl.conflict",
        severity: resolved ? "warning" : "error",
        kind: "odrl",
        article: "ODRL 2.2, Policy conflict",
        message: resolved
          ? p(
              "{action} is both permitted and prohibited under the same conditions; the conflict strategy {strategy} decides.",
              { action: actionPhrase(pm.action), strategy: strategy ?? "" },
            )
          : p(
              "{action} is both permitted and prohibited under the same conditions, so the policy is void.",
              { action: actionPhrase(pm.action) },
            ),
        where: where(pm),
      });
    }
  }
}

function checkEhds(policy: ParsedPolicy, out: PolicyFinding[]) {
  const ehds = (
    code: string,
    severity: Severity,
    article: string,
    message: PolicyText,
  ) => out.push({ code, severity, kind: "ehds", article, message });

  const allConstraints = policy.permissions.flatMap((r) =>
    flatConstraints(r.constraints),
  );
  const purposes = allConstraints.flatMap((c) =>
    c.kind === "atomic" &&
    ["eq", "isA", "isAnyOf", "isPartOf", "isAllOf"].includes(
      c.operator?.local ?? "",
    )
      ? purposeValues(c)
      : [],
  );

  if (purposes.length && purposes.every((v) => PRIMARY_USE.test(v))) {
    ehds(
      "ehds.primary-use",
      "info",
      "EHDS Chapter II",
      p(
        "A policy for primary use (care of the patient); the checks for secondary use do not apply.",
      ),
    );
    return;
  }

  if (!purposes.length) {
    ehds(
      "ehds.no-purpose",
      "warning",
      "EHDS Art. 53(1)",
      p(
        "No purpose: the data may be used for anything, but secondary use is limited to the purposes of Art. 53(1).",
      ),
    );
  }
  for (const value of purposes) {
    if (FORBIDDEN_PURPOSE.test(value)) {
      ehds(
        "ehds.forbidden-purpose",
        "error",
        "EHDS Art. 54",
        p("The purpose {purpose} is one Art. 54 forbids.", { purpose: value }),
      );
      continue;
    }
    if (PRIMARY_USE.test(value)) continue;
    const purpose = purposeOf(value);
    const cited = /53\s*\(1\)\s*\(([a-z])\)/i.exec(value)?.[1]?.toLowerCase();
    if (!purpose && !cited) {
      ehds(
        "ehds.unknown-purpose",
        "warning",
        "EHDS Art. 53(1)",
        p("The purpose {purpose} is not one of Art. 53(1).", {
          purpose: value,
        }),
      );
    } else if (purpose && cited && cited !== LETTER[purpose]) {
      ehds(
        "ehds.purpose-letter",
        "info",
        "EHDS Art. 53(1)",
        p(
          "The purpose {purpose} cites Art. 53(1)({cited}); the Regulation lists it under Art. 53(1)({letter}).",
          { purpose: value, cited, letter: LETTER[purpose] },
        ),
      );
    }
  }

  const operands = allConstraints.map((c) =>
    c.kind === "atomic" ? c.left?.local ?? "" : "",
  );
  if (!operands.some((o) => PERMIT_OPERANDS.has(o))) {
    ehds(
      "ehds.no-permit",
      "warning",
      "EHDS Art. 68",
      p(
        "No data permit: nothing ties the use to a permit of the health data access body.",
      ),
    );
  }

  const timeLimited = allConstraints.some(
    (c) =>
      c.kind === "atomic" &&
      c.left &&
      isTimeOperand(c.left.local) &&
      ["lt", "lteq", "eq"].includes(c.operator?.local ?? ""),
  );
  if (!timeLimited) {
    ehds(
      "ehds.no-time-limit",
      "warning",
      "EHDS Art. 68",
      p("No time limit: a data permit is valid for a limited period only."),
    );
  }

  const prohibited = new Set(policy.prohibitions.map((r) => local(r.action)));
  if (![...REIDENTIFY].some((a) => prohibited.has(a))) {
    ehds(
      "ehds.no-reidentification-ban",
      "warning",
      "EHDS Art. 61(3)",
      p("Re-identifying persons in the data is not forbidden."),
    );
  }
  if (![...ART54].some((a) => prohibited.has(a))) {
    ehds(
      "ehds.no-art54-ban",
      "warning",
      "EHDS Art. 54",
      p(
        "Nothing forbids the uses Art. 54 prohibits, such as advertising, marketing or commercial exploitation.",
      ),
    );
  }

  const duties = [
    ...policy.permissions.flatMap((r) => r.duties),
    ...policy.obligations,
  ];
  const dutyActions = duties.map((d) => local(d.action));
  const inSpe =
    dutyActions.some((a) => SPE.test(a)) ||
    operands.some((o) => SPE.test(o)) ||
    policy.prohibitions.some(
      (r) =>
        /^(extract|download)/i.test(local(r.action)) &&
        local(r.action) !== "extractTrainingData",
    );
  if (!inSpe) {
    const anonymisedOutput = dutyActions.some((a) => ANONYMISED_OUTPUT.has(a));
    ehds(
      anonymisedOutput ? "ehds.no-spe-anonymised" : "ehds.no-spe",
      anonymisedOutput ? "info" : "warning",
      anonymisedOutput ? "EHDS Art. 69, 73" : "EHDS Art. 73",
      anonymisedOutput
        ? p(
            "No secure processing environment; with anonymised output this can be answered as a health data request.",
          )
        : p(
            "No secure processing environment: personal data for secondary use may be processed only in one.",
          ),
    );
  }
}

const POLICY_TYPES = new Set([
  "Policy",
  "Set",
  "Offer",
  "Agreement",
  "Request",
  "Privacy",
  "Ticket",
  "Assertion",
]);

/**
 * The findings for one policy, errors first. Accepts the same shapes as
 * describePolicy(): a PolicyDefinition, a bare policy, prefixed or plain.
 */
export function validatePolicy(entry: unknown): PolicyFinding[] {
  const policy = parsePolicy(entry);
  const out: PolicyFinding[] = [];
  if (!policy.isObject) {
    return [
      {
        code: "odrl.not-an-object",
        severity: "error",
        kind: "odrl",
        article: "ODRL 2.2, Policy",
        message: p("The policy is not a JSON object."),
      },
    ];
  }
  const type = policy.type?.local;
  if (type && !POLICY_TYPES.has(type)) {
    out.push({
      code: "odrl.unknown-type",
      severity: "warning",
      kind: "odrl",
      article: "ODRL 2.2, Policy",
      message: p("{type} is not an ODRL policy type.", { type }),
    });
  }
  if ((type === "Offer" || type === "Agreement") && !policy.assigner) {
    out.push({
      code: "odrl.no-assigner",
      severity: "error",
      kind: "odrl",
      article: type === "Offer" ? "ODRL 2.2, Offer" : "ODRL 2.2, Agreement",
      message: p("An {type} must name its assigner.", { type }),
    });
  }
  if (type === "Agreement" && !policy.assignee) {
    out.push({
      code: "odrl.no-assignee",
      severity: "error",
      kind: "odrl",
      article: "ODRL 2.2, Agreement",
      message: p("An Agreement must name its assignee."),
    });
  }
  const rules = [
    ...policy.permissions,
    ...policy.prohibitions,
    ...policy.obligations,
  ];
  if (!rules.length) {
    out.push({
      code: "odrl.no-rule",
      severity: "error",
      kind: "odrl",
      article: "ODRL 2.2, Policy",
      message: p("The policy has no permission, prohibition or obligation."),
    });
  }
  rules.forEach((r) => checkRule(r, out));
  checkConflicts(policy, out);
  if (policy.permissions.length) checkEhds(policy, out);

  const rank: Record<Severity, number> = { error: 0, warning: 1, info: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

/** Valid, warnings or errors: the badge on the page. Info does not count. */
export function policyVerdict(findings: PolicyFinding[]): PolicyVerdict {
  if (findings.some((f) => f.severity === "error")) return "errors";
  if (findings.some((f) => f.severity === "warning")) return "warnings";
  return "valid";
}
