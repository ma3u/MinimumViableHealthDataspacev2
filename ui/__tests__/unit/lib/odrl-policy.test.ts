/**
 * describePolicy() and validatePolicy(): an ODRL policy in plain language,
 * and whether it is valid ODRL 2.2 and fit for EHDS secondary use
 * (/admin/policies).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  describePolicy,
  parsePolicy,
  policyOf,
  renderPolicyText,
  type Phrase,
} from "@/lib/odrl-describe";
import {
  policyVerdict,
  validatePolicy,
  type PolicyFinding,
} from "@/lib/odrl-validate";

/** English, the dictionary's keys filled in. */
const en = (text: string, vars?: Record<string, string | number>) =>
  vars ? text.replace(/\{(\w+)\}/g, (m, k) => String(vars[k] ?? m)) : text;
const say = (x: Phrase) => renderPolicyText(x, en);
const summary = (policy: unknown) =>
  describePolicy(policy).sentences.map(say).join(" ");
const codes = (policy: unknown) => validatePolicy(policy).map((f) => f.code);

/* ── Policies ──────────────────────────────────────────────────── */

/** The live hub's research-access-policy for pharmaco. */
const BARE_USE = { "@type": "Set", permission: [{ action: "use" }] };

/** Purpose, permit, period and the prohibitions, plain keys. */
const FIT = {
  "@type": "Set",
  permission: [
    {
      action: "use",
      constraint: [
        {
          leftOperand: "purpose",
          operator: "isAnyOf",
          rightOperand: ["SCIENTIFIC_RESEARCH"],
        },
        {
          leftOperand: "dataPermit",
          operator: "eq",
          rightOperand: "hdab-decision-medreg-2025-001",
        },
        {
          leftOperand: "inForceDate",
          operator: "lteq",
          rightOperand: "contractAgreement+365d",
        },
      ],
      duty: [{ action: "secureProcessingEnvironment" }],
    },
  ],
  prohibition: [{ action: "reIdentify" }, { action: "commercialize" }],
};

/** The same policy as the page's templates write it: prefixed JSON-LD. */
const FIT_PREFIXED = {
  "@type": "edc:PolicyDefinition",
  "@id": "policy-fit",
  "edc:policy": {
    "@type": "odrl:Set",
    "odrl:permission": [
      {
        "odrl:action": { "@id": "odrl:use" },
        "odrl:constraint": [
          {
            "odrl:leftOperand": { "@id": "edc:purpose" },
            "odrl:operator": { "@id": "odrl:isAnyOf" },
            "odrl:rightOperand": ["SCIENTIFIC_RESEARCH"],
          },
          {
            "odrl:leftOperand": { "@id": "edc:dataPermit" },
            "odrl:operator": { "@id": "odrl:eq" },
            "odrl:rightOperand": "hdab-decision-medreg-2025-001",
          },
          {
            "odrl:leftOperand": { "@id": "edc:inForceDate" },
            "odrl:operator": { "@id": "odrl:lteq" },
            "odrl:rightOperand": {
              "@value": "contractAgreement+365d",
              "@type": "edc:duration",
            },
          },
        ],
        "odrl:duty": [
          { "odrl:action": { "@id": "edc:secureProcessingEnvironment" } },
        ],
      },
    ],
    "odrl:prohibition": [
      { "odrl:action": { "@id": "edc:reIdentify" } },
      { "odrl:action": { "@id": "odrl:commercialize" } },
    ],
  },
};

/** Expanded JSON-LD: full IRIs, every value in an array. */
const O = "http://www.w3.org/ns/odrl/2/";
const E = "https://w3id.org/edc/v0.0.1/ns/";
const FIT_EXPANDED = {
  [`${E}policy`]: [
    {
      "@type": [`${O}Set`],
      [`${O}permission`]: [
        {
          [`${O}action`]: [{ "@id": `${O}use` }],
          [`${O}constraint`]: [
            {
              [`${O}leftOperand`]: [{ "@id": `${E}purpose` }],
              [`${O}operator`]: [{ "@id": `${O}eq` }],
              [`${O}rightOperand`]: [{ "@value": "SCIENTIFIC_RESEARCH" }],
            },
            {
              [`${O}leftOperand`]: [{ "@id": `${E}dataPermit` }],
              [`${O}operator`]: [{ "@id": `${O}eq` }],
              [`${O}rightOperand`]: [{ "@value": "permit-1" }],
            },
            {
              [`${O}leftOperand`]: [{ "@id": `${O}dateTime` }],
              [`${O}operator`]: [{ "@id": `${O}lteq` }],
              [`${O}rightOperand`]: [{ "@value": "2027-12-31" }],
            },
          ],
          [`${O}duty`]: [
            { [`${O}action`]: [{ "@id": `${E}secureProcessingEnvironment` }] },
          ],
        },
      ],
      [`${O}prohibition`]: [
        { [`${O}action`]: [{ "@id": `${E}reIdentify` }] },
        { [`${O}action`]: [{ "@id": `${O}commercialize` }] },
      ],
    },
  ],
};

const MALFORMED = {
  "@type": "Set",
  permission: [
    {
      action: "use",
      constraint: [
        { leftOperand: "purpose", rightOperand: "SCIENTIFIC_RESEARCH" },
        { operator: "eq", rightOperand: "x" },
        { leftOperand: "kAnonymity", operator: "gteq" },
        { leftOperand: "kAnonymity", operator: "isAnyOf", rightOperand: [5] },
        { leftOperand: "kAnonymity", operator: "gteq", rightOperand: "five" },
        { leftOperand: "purpose", operator: "approximately", rightOperand: 1 },
        { leftOperand: "inForceDate", operator: "lteq", rightOperand: "soon" },
        {
          leftOperand: "dateTime",
          operator: "lteq",
          rightOperand: ["2027-01-01", "2028-01-01"],
        },
      ],
    },
  ],
};

const CONFLICT = {
  "@type": "Set",
  permission: [{ action: "distribute" }],
  prohibition: [{ action: "distribute" }],
};

/* ── describePolicy ────────────────────────────────────────────── */

describe("describePolicy", () => {
  it.each([
    [
      "the bare use policy",
      BARE_USE,
      "Anyone who has a contract may use the data, for any purpose, without time limit. No conditions, prohibitions or duties.",
    ],
    [
      "a fit policy, plain keys",
      FIT,
      'Anyone who has a contract may use the data, only for "SCIENTIFIC_RESEARCH", for 1 year after the contract is agreed. Only if: the data permit is hdab-decision-medreg-2025-001. Forbidden: re-identify persons in the data; use the data commercially. Required: process the data in a secure processing environment.',
    ],
    [
      "the same policy, prefixed JSON-LD",
      FIT_PREFIXED,
      'Anyone who has a contract may use the data, only for "SCIENTIFIC_RESEARCH", for 1 year after the contract is agreed. Only if: the data permit is hdab-decision-medreg-2025-001. Forbidden: re-identify persons in the data; use the data commercially. Required: process the data in a secure processing environment.',
    ],
    [
      "expanded JSON-LD with a date",
      FIT_EXPANDED,
      'Anyone who has a contract may use the data, only for "SCIENTIFIC_RESEARCH", until 2027-12-31. Only if: the data permit is permit-1. Forbidden: re-identify persons in the data; use the data commercially. Required: process the data in a secure processing environment.',
    ],
    [
      "prohibitions only",
      { "@type": "Set", prohibition: [{ action: "sell" }] },
      "Nothing is permitted. Forbidden: sell the data. No duties.",
    ],
    [
      "an assignee, an excluded purpose and an or",
      {
        "@type": "Set",
        permission: [
          {
            action: "read",
            assignee: "did:web:pharmaco.de:research",
            constraint: [
              {
                leftOperand: "purpose",
                operator: "isNoneOf",
                rightOperand: ["advertising"],
              },
              {
                or: [
                  {
                    leftOperand: "spatial",
                    operator: "eq",
                    rightOperand: "DE",
                  },
                  {
                    leftOperand: "spatial",
                    operator: "eq",
                    rightOperand: "NL",
                  },
                ],
              },
            ],
          },
        ],
        obligation: [{ action: "compensate" }],
      },
      'did:web:pharmaco.de:research may read the data, for any purpose except "advertising", without time limit. Only if: at least one of (the region is DE; the region is NL). Nothing is forbidden. Required: pay for the use.',
    ],
  ])("%s", (_name, policy, expected) => {
    expect(summary(policy)).toBe(expected);
  });

  it("returns the parts the page translates one by one", () => {
    const d = describePolicy(FIT);
    expect(d.permissions).toHaveLength(1);
    expect(d.permissions[0].action).toBe("use");
    expect(d.permissions[0].purposes).toEqual(["SCIENTIFIC_RESEARCH"]);
    expect(say(d.permissions[0].timeLimit!)).toBe(
      "for 1 year after the contract is agreed",
    );
    expect(d.prohibitions.map((r) => r.action)).toEqual([
      "reIdentify",
      "commercialize",
    ]);
    expect(d.duties.map((r) => r.action)).toEqual([
      "secureProcessingEnvironment",
    ]);
    // Templates and values stay apart, so a dictionary can translate them.
    expect(d.sentences[0].text).toBe("{who} may {action}, {purpose}, {time}.");
  });

  it("names a duty's conditions", () => {
    const d = describePolicy({
      permission: [
        {
          action: "use",
          duty: [
            {
              action: "anonymize",
              constraint: [
                {
                  leftOperand: "kAnonymity",
                  operator: "gteq",
                  rightOperand: 5,
                },
              ],
            },
          ],
        },
      ],
    });
    expect(say(d.duties[0].text)).toBe(
      "anonymize the data (k-anonymity is at least 5)",
    );
  });
});

/* ── policyOf: the shapes the API answers ──────────────────────── */

describe("policyOf", () => {
  it("reads the local registry's JSON string", () => {
    const entry = {
      id: "policy:local:1",
      participantId: "p",
      policyJson: JSON.stringify(FIT_PREFIXED),
    };
    expect(summary(entry)).toBe(summary(FIT));
  });

  it("rebuilds the graph seed's flattened OdrlPolicy", () => {
    const entry = {
      policyId: "policy-ehds-art53-synthetic-2026",
      odrlAction: "odrl:use",
      ehdsPermissions: ["scientific_research", "statistics"],
      ehdsProhibitions: [
        "re_identification",
        "commercial_exploitation_without_approval",
      ],
      temporalLimit: "2027-12-31T23:59:59",
    };
    expect(parsePolicy(entry).prohibitions.map((r) => r.action?.local)).toEqual(
      ["reIdentify", "commercialize"],
    );
    expect(codes(entry)).toEqual(["ehds.no-permit", "ehds.no-spe"]);
  });

  it("leaves a bare policy as it is", () => {
    expect(policyOf(BARE_USE)).toBe(BARE_USE);
  });
});

/* ── validatePolicy ────────────────────────────────────────────── */

describe("validatePolicy", () => {
  it.each([
    [
      "the bare use policy",
      BARE_USE,
      "warnings",
      [
        "ehds.no-purpose",
        "ehds.no-permit",
        "ehds.no-time-limit",
        "ehds.no-reidentification-ban",
        "ehds.no-art54-ban",
        "ehds.no-spe",
      ],
    ],
    ["a fit policy, plain keys", FIT, "valid", []],
    ["the same policy, prefixed JSON-LD", FIT_PREFIXED, "valid", []],
    ["expanded JSON-LD", FIT_EXPANDED, "valid", []],
    [
      "a malformed policy",
      MALFORMED,
      "errors",
      [
        "odrl.no-operator",
        "odrl.no-left-operand",
        "odrl.no-right-operand",
        "odrl.operator-mismatch",
        "odrl.not-a-number",
        "odrl.unknown-operator",
        "odrl.not-a-time",
        "odrl.list-for-comparison",
      ],
    ],
    ["a permit / prohibit conflict", CONFLICT, "errors", ["odrl.conflict"]],
    ["no rule at all", { "@type": "Set" }, "errors", ["odrl.no-rule"]],
    ["not an object", "use", "errors", ["odrl.not-an-object"]],
    [
      "a rule without an action and an unknown one",
      { permission: [{}, { action: "odrl:teleport" }] },
      "errors",
      ["odrl.no-action", "odrl.unknown-action"],
    ],
  ])("%s", (_name, policy, verdict, expected) => {
    const findings = validatePolicy(policy);
    expect(policyVerdict(findings)).toBe(verdict);
    const got = findings.map((f) => f.code);
    for (const code of expected as string[]) expect(got).toContain(code);
    if ((expected as string[]).length === 0) {
      expect(findings.filter((f) => f.severity !== "info")).toEqual([]);
    }
  });

  it("marks ODRL errors and EHDS recommendations apart and cites each", () => {
    const all: PolicyFinding[] = [
      ...validatePolicy(BARE_USE),
      ...validatePolicy(MALFORMED),
      ...validatePolicy(CONFLICT),
    ];
    for (const f of all) {
      expect(f.article).toMatch(f.kind === "odrl" ? /^ODRL 2\.2/ : /^EHDS /);
    }
    expect(
      validatePolicy(BARE_USE).every(
        (f) => f.kind === "ehds" && f.severity === "warning",
      ),
    ).toBe(true);
    expect(
      Object.fromEntries(
        validatePolicy(BARE_USE).map((f) => [f.code, f.article]),
      ),
    ).toEqual({
      "ehds.no-purpose": "EHDS Art. 53(1)",
      "ehds.no-permit": "EHDS Art. 68",
      "ehds.no-time-limit": "EHDS Art. 68",
      "ehds.no-reidentification-ban": "EHDS Art. 61(3)",
      "ehds.no-art54-ban": "EHDS Art. 54",
      "ehds.no-spe": "EHDS Art. 73",
    });
  });

  it("does not call a conflict when constraints tell the rules apart", () => {
    const policy = {
      permission: [
        {
          action: "distribute",
          constraint: [
            { leftOperand: "spatial", operator: "eq", rightOperand: "DE" },
          ],
        },
      ],
      prohibition: [
        {
          action: "distribute",
          constraint: [
            { leftOperand: "spatial", operator: "eq", rightOperand: "US" },
          ],
        },
      ],
    };
    expect(codes(policy)).not.toContain("odrl.conflict");
  });

  it("lets the policy's conflict strategy settle a conflict, with a warning", () => {
    const f = validatePolicy({ ...CONFLICT, conflict: "prohibit" }).find(
      (x) => x.code === "odrl.conflict",
    );
    expect(f?.severity).toBe("warning");
  });

  it("forbidding use conflicts with any permission", () => {
    expect(
      codes({
        permission: [{ action: "read" }],
        prohibition: [{ action: "use" }],
      }),
    ).toContain("odrl.conflict");
  });

  it("skips the secondary-use checks for a primary-use policy", () => {
    expect(
      codes({
        permission: [
          {
            action: "use",
            constraint: [
              {
                leftOperand: "purpose",
                operator: "eq",
                rightOperand:
                  "EHDS Article 7: cross-border treatment continuity",
              },
            ],
          },
        ],
      }),
    ).toEqual(["ehds.primary-use"]);
  });

  it("names a purpose Art. 54 forbids, and one that is no Art. 53(1) purpose", () => {
    const policy = (purpose: string) => ({
      ...FIT,
      permission: [
        {
          ...FIT.permission[0],
          constraint: [
            { leftOperand: "purpose", operator: "eq", rightOperand: purpose },
            ...FIT.permission[0].constraint.slice(1),
          ],
        },
      ],
    });
    expect(codes(policy("targeted advertising"))).toEqual([
      "ehds.forbidden-purpose",
    ]);
    expect(codes(policy("whatever we like"))).toEqual(["ehds.unknown-purpose"]);
  });

  it("notes a purpose cited under a letter the Regulation gives another one", () => {
    const f = validatePolicy({
      ...FIT,
      permission: [
        {
          ...FIT.permission[0],
          constraint: [
            {
              leftOperand: "purpose",
              operator: "eq",
              rightOperand: "EHDS Article 53(1)(c): scientific research",
            },
            ...FIT.permission[0].constraint.slice(1),
          ],
        },
      ],
    });
    expect(f.map((x) => [x.code, x.severity])).toEqual([
      ["ehds.purpose-letter", "info"],
    ]);
    expect(say(f[0].message)).toContain("Art. 53(1)(e)");
  });

  it("an extension action is a warning, not an error", () => {
    const f = validatePolicy({ permission: [{ action: "ehds:teleport" }] });
    expect(f.find((x) => x.code === "odrl.extension-action")?.severity).toBe(
      "warning",
    );
  });

  it("an Offer must name its assigner", () => {
    expect(codes({ ...FIT, "@type": "Offer" })).toContain("odrl.no-assigner");
  });

  it("puts errors first", () => {
    const severities = validatePolicy({
      permission: [{ action: "use", constraint: [{ leftOperand: "purpose" }] }],
    }).map((f) => f.severity);
    expect(severities[0]).toBe("error");
    expect(severities.indexOf("error")).toBeLessThan(
      severities.lastIndexOf("warning"),
    );
  });
});

/* ── Every policy the hub ships ────────────────────────────────── */

describe("the bundled policies", () => {
  const mock = JSON.parse(
    readFileSync(path.resolve("public/mock/admin_policies.json"), "utf8"),
  ) as { participants: { policies: { "@id": string }[] }[] };
  const policies = mock.participants.flatMap((g) => g.policies);

  it("are all valid ODRL; the open ones fall short of EHDS", () => {
    expect(policies.length).toBeGreaterThan(10);
    for (const p of policies) {
      const findings = validatePolicy(p);
      expect(
        findings.filter((f) => f.kind === "odrl"),
        p["@id"],
      ).toEqual([]);
    }
    const open = policies.filter(
      (p) =>
        (p as { policy: { permission: object[] } }).policy.permission.length &&
        !JSON.stringify(p).includes("constraint"),
    );
    expect(open.length).toBeGreaterThan(0);
    for (const p of open) expect(codes(p)).toContain("ehds.no-purpose");
  });

  it("describes each in sentences without a template left unfilled", () => {
    for (const p of policies) {
      expect(summary(p), p["@id"]).not.toMatch(/\{\w+\}/);
    }
  });
});
