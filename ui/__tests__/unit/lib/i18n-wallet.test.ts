/**
 * The simulated wallet's phone screens (#782, ADR-070) on /patient/wallet,
 * /journey and /auth/eudi-qr. Their steps are data in components/wallet/
 * flows.tsx and keep their English; WalletFlow translates the button labels
 * and the tab bar where it shows them, so the i18n test's search for
 * t("...") literals does not see them. This one lists them and finds each in
 * the patient area, in every language.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { MESSAGES } from "@/messages";
import {
  EHR_CATEGORIES,
  EHR_TRANSFER_STEPS,
  LOGIN_STEPS,
  PID_CLAIMS,
  REGISTER_STEPS,
} from "@/components/wallet/flows";

const patient = MESSAGES.en.patient as Record<string, string>;
const src = (f: string) => readFileSync(path.resolve(f), "utf8");
const all = (f: string, re: RegExp) =>
  [...src(f).matchAll(re)].map((m) => m[1]);
const missing = (texts: string[]) => texts.filter((x) => !(x in patient));

const FLOWS = "src/components/wallet/flows.tsx";
const PHONE = "src/components/wallet/PhoneFrame.tsx";

describe("the patient area knows every text of the simulated wallet", () => {
  it("the button labels of every step", () => {
    const labels = [...REGISTER_STEPS, ...LOGIN_STEPS, ...EHR_TRANSFER_STEPS]
      .flatMap((s) => [s.primary, s.secondary])
      .filter((x): x is string => Boolean(x));
    expect(new Set(labels).size).toBeGreaterThanOrEqual(10);
    expect(missing(labels)).toEqual([]);
  });

  it("the PID claims and the ePA's categories", () => {
    const texts = [...PID_CLAIMS, ...EHR_CATEGORIES];
    expect(texts).toHaveLength(8);
    expect(missing(texts)).toEqual([]);
  });

  it("the relying party and its purpose, kept as constants", () => {
    const texts = all(FLOWS, /^const [A-Z_]+ = "([^"]+)";$/gm);
    expect(texts).toEqual([
      "European Health Dataspace",
      "Sign in to the Health Dataspace patient portal",
    ]);
    expect(missing(texts)).toEqual([]);
  });

  it("the tab bar of d-you", () => {
    const tabs = all(PHONE, /\{ label: "([^"]+)"/g);
    expect(tabs).toEqual(["Overview", "Activity", "Settings"]);
    expect(missing(tabs)).toEqual([]);
  });

  it("every <T> and t() text of the wallet's components, in the patient area", () => {
    const texts = [
      ...all(FLOWS, /<T\b[^>]*>\s*\{\s*"((?:[^"\\]|\\.)*)"\s*\}/g),
      ...[
        PHONE,
        "src/components/wallet/EudiApprovalFlow.tsx",
        "src/components/wallet/EudiQrPanel.tsx",
      ].flatMap((f) => all(f, /\bt\(\s*"((?:[^"\\]|\\.)*)"/g)),
    ];
    expect(texts.length).toBeGreaterThan(30);
    expect(missing(texts)).toEqual([]);
  });

  it("leaves no English sentence in a step's body outside <T>", () => {
    // A JSX text node: after ">" and before "<" or "{", on one line or
    // starting a line, with at least two words.
    const body = src(FLOWS).replace(/\/\*[\s\S]*?\*\//g, "");
    const loose = [
      ...body.matchAll(/>\s*([A-Za-z][A-Za-z'’ ,.:·-]*[a-z]\s[a-z][^<{]*)</g),
      ...body.matchAll(/^\s+([A-Z][a-z]+(?: [a-z]+)+[.:]?)\s*$/gm),
    ].map((m) => m[1].trim());
    expect(loose).toEqual([]);
  });
});
