/**
 * The administration's pages (#782, ADR-070) translate texts that are not a
 * t("...") literal: labels from a library or a map in the page, status
 * values, messages kept in state as their English key. The i18n test cannot
 * see those, so this one lists them and checks that the admin area knows
 * each, in every language.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { MESSAGES } from "@/messages";
import {
  SPE_EVENT_LABELS,
  attestationVerdict,
  policyCheckDepth,
  speLabelText,
} from "@/lib/spe";
import { CITIZEN_WALLET } from "@/lib/wallet-config";
import { TABS } from "@/app/admin/audit/_components/constants";
import { LAYER_META } from "@/app/admin/components/_components/constants";

const admin = MESSAGES.en.admin;
const src = (f: string) => readFileSync(path.resolve(f), "utf8");
const all = (f: string, re: RegExp, from?: string) => {
  // from: only the block that starts there, up to its closing "};"
  let s = src(f);
  if (from) s = s.slice(s.indexOf(from), s.indexOf("};", s.indexOf(from)));
  return [...s.matchAll(re)].map((m) => m[1]);
};
const missing = (texts: string[]) => texts.filter((x) => !(x in admin));

describe("the admin area knows every label its pages take from elsewhere", () => {
  it("the SPE labels, verdicts and event names of lib/spe", () => {
    const texts = [
      ...Object.values(SPE_EVENT_LABELS),
      ...(["simulated", "node", "workload"] as const).map((scope) =>
        speLabelText({
          simulated: scope === "simulated",
          attestationScope: scope === "simulated" ? null : scope,
        }),
      ),
      attestationVerdict({}).text,
      attestationVerdict({ attestation: att("fail") }).text,
      attestationVerdict({ status: "refused", attestation: att("pass") }).text,
      attestationVerdict({ attestation: att("pass") }).text,
      attestationVerdict({ keyReleasedAt: "x", attestation: att("pass") }).text,
      policyCheckDepth({
        policyCheckedByHardware: true,
        attestationScope: "workload",
        simulated: false,
      }).text,
    ];
    expect(texts).toHaveLength(15);
    expect(missing(texts)).toEqual([]);
  });

  it("the wallet's description and footnote", () => {
    expect(
      missing([CITIZEN_WALLET.description, CITIZEN_WALLET.alternatives]),
    ).toEqual([]);
  });

  it("the audit tabs and the component layers", () => {
    expect(
      missing([
        ...TABS.map((t) => t.label),
        ...Object.values(LAYER_META).map((m) => m.label),
      ]),
    ).toEqual([]);
  });

  it("the maps inside the pages", () => {
    const texts = [
      ...all("src/app/admin/page.tsx", /\b(?:title|ago): "([^"]+)"/g),
      ...all("src/app/admin/page.tsx", /label: "([^"]+)", href/g),
      ...all(
        "src/app/admin/policies/page.tsx",
        /\b(?:label|description):\s*"([^"]+)"/g,
      ),
      ...all(
        "src/app/admin/policies/page.tsx",
        /"(?:odrl|edc):\w+": "([^"]+)"/g,
        "const FRIENDLY_NAMES",
      ),
      ...all(
        "src/app/onboarding/page.tsx",
        /\b(?:category|label|desc): "([^"]+)"/g,
      ),
      ...all("src/app/onboarding/page.tsx", /^\s+"([^"]+\.)",$/gm),
      ...all(
        "src/app/admin/attestation/_components/AttestationCard.tsx",
        /^\s+\w+:\s*"([^"]+)"/gm,
        "const SCOPE_TEXT",
      ),
      ...all("src/app/admin/attestation/page.tsx", /: "([^"]+)",/g),
      ...all("src/components/spe/SpeStatusCard.tsx", /^\s+\w+: "([^"]+)",/gm),
    ];
    expect(texts.length).toBeGreaterThan(70);
    expect(missing(texts)).toEqual([]);
  });

  it("the role names of the tenants page, from the common area or its own", () => {
    const roles = all("src/app/admin/tenants/page.tsx", /\blabel: "([^"]+)"/g);
    expect(roles.length).toBeGreaterThan(5);
    expect(
      roles.filter((r) => !(r in admin) && !(r in MESSAGES.en.common)),
    ).toEqual([]);
  });

  it("the status values, severities and messages kept in state", () => {
    const texts = [
      // SpeStatusText, StatusBadge, SeverityDot
      "ready",
      "loading",
      "refused",
      "unreachable",
      "healthy",
      "running",
      "unhealthy",
      "stopped",
      "unknown",
      "critical",
      "warning",
      // shown with t() when the state holds them
      "Failed to load participants",
      "Data Protection Officer",
      "is any of",
      ...all(
        "src/app/auth/eudi-qr/page.tsx",
        /^const [A-Z_]+ =\s*"([^"]+)";$/gm,
      ),
      // a key with double quotes inside, written in single quotes
      ...all(
        "src/app/admin/components/_components/AzureCostEstimatorPanel.tsx",
        /t\(\s*'([^']+)'/g,
      ),
    ];
    expect(texts.length).toBe(17);
    expect(missing(texts)).toEqual([]);
  });

  it("every <T> text of the admin pages, also where tags hide it from the i18n test", () => {
    const files = [
      "src/app/admin/tenants/page.tsx",
      "src/app/admin/policies/page.tsx",
      "src/app/admin/components/page.tsx",
      "src/app/admin/components/_components/SpeTopologySection.tsx",
      "src/app/admin/audit/_components/RetentionLine.tsx",
      "src/app/admin/attestation/_components/AttestationExplainer.tsx",
      "src/app/auth/eudi-qr/page.tsx",
      "src/app/auth/unauthorized/page.tsx",
      "src/app/settings/page.tsx",
      "src/components/spe/SpeStatusCard.tsx",
      "src/components/spe/SpePermitBindings.tsx",
    ];
    const texts = files.flatMap((f) =>
      all(f, /\{\s*"((?:[^"\\]|\\.)*)"\s*\}\s*<\/T>/g),
    );
    expect(texts.length).toBeGreaterThanOrEqual(files.length);
    expect(missing(texts)).toEqual([]);
  });
});

function att(result: "pass" | "fail") {
  return {
    verifier: null,
    result,
    evidenceDigest: null,
    tokenIssuedAt: null,
    tokenExpiresAt: null,
    policyId: null,
    claims: null,
    refusalReason: null,
  };
}
