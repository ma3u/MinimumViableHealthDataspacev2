/**
 * The health data user's pages (#782, ADR-070): texts the general i18n test
 * cannot see, because they reach t() as a variable or sit in a <T> with tags,
 * still have an entry in every language.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { MESSAGES } from "@/messages";

const read = (f: string) => readFileSync(path.resolve(f), "utf8");
const LANGS = ["en", "de", "fr", "nl", "es"] as const;
const missingIn = (texts: string[]) =>
  LANGS.flatMap((l) =>
    texts.filter((x) => !MESSAGES[l].research[x]).map((x) => `${l}: ${x}`),
  );

describe("the research area", () => {
  it("knows every DSP action the tasks page shows (t(action.label))", () => {
    const labels = [
      ...read("src/app/tasks/page.tsx").matchAll(/\{ label: "([^"]+)", color/g),
    ].map((m) => m[1]);
    expect(labels.length).toBeGreaterThanOrEqual(9);
    expect(missingIn(labels)).toEqual([]);
  });

  it("knows every gender the analytics fixture reports (t(g.gender))", () => {
    const mock = JSON.parse(read("public/mock/analytics.json")) as {
      genderBreakdown: { gender: string }[];
    };
    const genders = mock.genderBreakdown.map((g) => g.gender);
    expect(genders.length).toBeGreaterThan(0);
    expect(missingIn(genders)).toEqual([]);
  });

  it("knows every <T> text with markup on the exchange pages", () => {
    const texts = [
      "src/app/negotiate/page.tsx",
      "src/app/data/transfer/page.tsx",
    ].flatMap((f) =>
      [...read(f).matchAll(/<T\b[\s\S]*?>\s*\{\s*"([^"]+)"\s*\}\s*<\/T>/g)].map(
        (m) => m[1],
      ),
    );
    expect(texts.length).toBe(3);
    expect(missingIn(texts)).toEqual([]);
  });
});
