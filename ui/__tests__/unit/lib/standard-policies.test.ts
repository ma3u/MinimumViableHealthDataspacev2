/**
 * The standard policies (ADR-077): each passes the hub's own check, says in
 * plain language what it allows, carries the clauses its regulations need,
 * and is the same in jad/policies/, which the connector seed reads.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { STANDARD_POLICIES } from "@/lib/standard-policies";
import { policyVerdict, validatePolicy } from "@/lib/odrl-validate";
import { describePolicy, renderPolicyText } from "@/lib/odrl-describe";

const english = (text: string, vars?: Record<string, string | number>) =>
  text.replace(/\{(\w+)\}/g, (_, k) => String(vars?.[k] ?? `{${k}}`));

const byId = Object.fromEntries(STANDARD_POLICIES.map((s) => [s.id, s]));
const prohibited = (id: string) =>
  (byId[id].policy.prohibition as { action: string }[]).map((r) => r.action);
const constrained = (id: string) =>
  (
    byId[id].policy.permission as { constraint: { leftOperand: string }[] }[]
  )[0].constraint.map((c) => c.leftOperand);

describe("the standard policies", () => {
  it.each(STANDARD_POLICIES.map((s) => [s.id, s]))(
    "%s passes the hub's ODRL and EHDS check",
    (_id, s) => {
      const findings = validatePolicy(s.policy).filter(
        (f) => f.severity !== "info",
      );
      expect(findings.map((f) => f.code)).toEqual([]);
      expect(policyVerdict(findings)).toBe("valid");
    },
  );

  it.each(STANDARD_POLICIES.map((s) => [s.id, s]))(
    "%s is the same in jad/policies, which the connector seed reads",
    (id, s) => {
      const file = path.join(
        process.cwd(),
        "..",
        "jad",
        "policies",
        `${id}.json`,
      );
      expect(JSON.parse(readFileSync(file, "utf-8"))).toEqual(s.policy);
    },
  );

  it.each(STANDARD_POLICIES.map((s) => [s.id, s]))(
    "every clause of %s names its legal basis",
    (_id, s) => {
      for (const { clause } of s.clauses) {
        expect(clause.basis.length).toBeGreaterThan(0);
      }
    },
  );

  it("every policy that lets personal data be processed keeps it in the EU/EEA", () => {
    for (const id of [
      "mvhd-ehds-permit-spe",
      "mvhd-ehds-ai-training",
      "mvhd-da-device-data",
    ]) {
      expect(constrained(id)).toContain("spatial");
      expect(prohibited(id)).toContain("ehds:transferOutsideEU");
    }
  });

  it("record-level data is processed only in a confidential SPE by an ISO/IEC 27001 operator", () => {
    for (const id of ["mvhd-ehds-permit-spe", "mvhd-ehds-ai-training"]) {
      expect(constrained(id)).toEqual(
        expect.arrayContaining([
          "ehds:processingEnvironment",
          "ehds:certification",
          "ehds:dataPermit",
        ]),
      );
      expect(prohibited(id)).toEqual(
        expect.arrayContaining(["ehds:reIdentify", "extract"]),
      );
    }
  });

  it("AI training adds the AI Act's prohibited practices and data governance", () => {
    expect(prohibited("mvhd-ehds-ai-training")).toEqual(
      expect.arrayContaining([
        "ehds:prohibitedAiPractice",
        "ehds:extractTrainingData",
      ]),
    );
    const duties = (
      byId["mvhd-ehds-ai-training"].policy.permission as {
        duty: { action: string }[];
      }[]
    )[0].duty.map((d) => d.action);
    expect(duties).toContain("ehds:documentTrainingData");
  });

  it("device data under the Data Act may not build a competing product or reach a gatekeeper", () => {
    expect(prohibited("mvhd-da-device-data")).toEqual(
      expect.arrayContaining([
        "ehds:developCompetingProduct",
        "ehds:shareWithGatekeeper",
      ]),
    );
    const codes = validatePolicy(byId["mvhd-da-device-data"].policy).map(
      (f) => f.code,
    );
    expect(codes).toContain("ehds.data-act");
  });

  it("the bonus programme policy permits the payout only and forbids what a premium could be built on (ADR-080, ADR-090)", () => {
    const bonus = byId["mvhd-bonus-programme"];
    expect(prohibited("mvhd-bonus-programme").sort()).toEqual(
      [
        "ehds:advertise",
        "ehds:detrimentalDecision",
        "ehds:insuranceDecision",
        "ehds:profile",
      ].sort(),
    );
    // The term the hub's connector decides, against the recipient's
    // DataProcessingPurposeCredential (EhdsAttestedPurposeExtension).
    const constraints = (
      bonus.policy.permission as {
        constraint: {
          leftOperand: string;
          operator: string;
          rightOperand: unknown;
        }[];
        duty: { action: string; constraint?: { rightOperand: string }[] }[];
      }[]
    )[0];
    expect(constraints.constraint).toContainEqual({
      leftOperand: "ehds:attestedPurpose",
      operator: "eq",
      rightOperand: "bonus-payout",
    });
    expect(constraints.duty).toEqual([
      expect.objectContaining({
        action: "delete",
        constraint: [
          expect.objectContaining({ rightOperand: "after the bonus payout" }),
        ],
      }),
    ]);
    // Primary use the person directs, never secondary use (ADR-080, decision 1).
    const codes = validatePolicy(bonus.policy).map((f) => f.code);
    expect(codes).toContain("ehds.primary-use");
    const text = describePolicy(bonus.policy)
      .sentences.map((s) => renderPolicyText(s, english))
      .join(" ");
    expect(text).toMatch(
      /the purpose the recipient's credential attests is "?bonus-payout/,
    );
    expect(text).toMatch(/decisions on insurance or credit/);
  });

  it("reads in plain language", () => {
    const text = describePolicy(byId["mvhd-ehds-permit-spe"].policy)
      .sentences.map((s) => renderPolicyText(s, english))
      .join(" ");
    expect(text).toMatch(/may use the data/);
    expect(text).toMatch(/for 1 year after the contract is agreed/);
    expect(text).toMatch(/transfer the data outside the EU\/EEA/);
    expect(text).toMatch(/re-identify persons in the data/);
  });
});
