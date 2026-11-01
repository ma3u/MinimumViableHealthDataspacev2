/**
 * The health data holder's pages show some texts they take from a list
 * rather than a t("...") literal, so the dictionary test cannot see them
 * (#782, ADR-070). These checks list them: a label added to one of the
 * lists without a dictionary entry shows in English in every language.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { MESSAGES } from "@/messages";
import { HEALTH_CATEGORIES } from "@/lib/healthdcat-ap";

const holder = MESSAGES.en.holder as Record<string, string>;

describe("the holder's dictionary", () => {
  it("knows every Art. 51(1) category the DCAT-AP editor offers", () => {
    const labels = HEALTH_CATEGORIES.map((c) => c.label);
    expect(labels.length).toBeGreaterThan(10);
    expect(labels.filter((l) => !(l in holder))).toEqual([]);
  });

  it("knows every milestone of the EEHRxF timeline", () => {
    const src = readFileSync(path.resolve("src/app/eehrxf/page.tsx"), "utf8");
    const block = src.split("const EHDS_MILESTONES")[1].split("];")[0];
    const labels = [...block.matchAll(/label: "([^"]+)"/g)].map((m) => m[1]);
    expect(labels.length).toBe(5);
    expect(labels.filter((l) => !(l in holder))).toEqual([]);
  });

  it("translates the categories in every language", () => {
    for (const lang of ["de", "fr", "nl", "es"] as const) {
      const dict = MESSAGES[lang].holder as Record<string, string>;
      for (const c of HEALTH_CATEGORIES) {
        expect(dict[c.label], `${lang}: ${c.label}`).toBeTruthy();
        expect(dict[c.label], `${lang}: ${c.label}`).not.toBe(c.label);
      }
    }
  });
});
