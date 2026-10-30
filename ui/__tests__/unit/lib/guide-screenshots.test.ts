/**
 * The user guide describes every page a persona can reach from the menu, and
 * every feature card shows its page on mouse-over. /admin/policies and
 * /catalog/editor were in the menus with no card; nothing noticed.
 *
 * Reads the FeatureCard links from the guide's source, the menus from
 * visibleNavGroups(), and the screenshots from public/images/guide.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import path from "path";
import { visibleNavGroups } from "@/components/Navigation";
import {
  GUIDE_SCREENS,
  guideScreenshotSlug,
  guideScreenshotSrc,
} from "@/lib/guide-screenshots";

const GUIDE = path.resolve(
  __dirname,
  "../../../src/app/docs/user-guide/page.tsx",
);
const SHOTS = path.resolve(__dirname, "../../../public/images/guide");

const ROLES = [
  "PATIENT",
  "DATA_HOLDER",
  "DATA_USER",
  "HDAB_AUTHORITY",
  "TRUST_CENTER_OPERATOR",
  "EDC_ADMIN",
  "EDC_USER_PARTICIPANT",
];

const cardHrefs = [
  ...readFileSync(GUIDE, "utf8").matchAll(
    /<FeatureCard[^>]*?href=\{?["`]([^"`]+)["`]/gs,
  ),
].map((m) => m[1]);

const menuHrefs = new Set(
  ROLES.flatMap((role) =>
    visibleNavGroups([role], true)
      .filter((g) => g.label !== "Docs")
      .flatMap((g) => g.links.map((l) => l.href)),
  ),
);

describe("the user guide", () => {
  it("has a card for every page in any persona's menu", () => {
    expect(cardHrefs.length).toBeGreaterThan(30);
    const missing = [...menuHrefs].filter((h) => !cardHrefs.includes(h));
    expect(missing).toEqual([]);
  });

  it("has a screenshot for every card, and a card for every screenshot", () => {
    const listed = GUIDE_SCREENS.map((s) => s.href);
    expect(cardHrefs.filter((h) => !listed.includes(h))).toEqual([]);
    expect(listed.filter((h) => !cardHrefs.includes(h))).toEqual([]);

    const files = readdirSync(SHOTS).sort();
    expect(files).toEqual(
      listed.map((h) => `${guideScreenshotSlug(h)}.webp`).sort(),
    );
  });

  it("takes each screenshot as a persona whose menu holds the page", () => {
    const menuOf: Record<string, string[]> = {
      patient1: ["PATIENT"],
      clinicuser: ["EDC_USER_PARTICIPANT", "DATA_HOLDER"],
      researcher: ["EDC_USER_PARTICIPANT", "DATA_USER"],
      regulator: ["HDAB_AUTHORITY"],
      edcadmin: ["EDC_ADMIN"],
    };
    const wrong = GUIDE_SCREENS.filter(
      ({ href, persona }) =>
        persona !== null &&
        menuHrefs.has(href) &&
        !visibleNavGroups(menuOf[persona], true).some((g) =>
          g.links.some((l) => l.href === href),
        ),
    );
    expect(wrong).toEqual([]);
  });

  it("finds a screenshot under the page's own path", () => {
    expect(guideScreenshotSlug("/")).toBe("home");
    expect(guideScreenshotSrc("/patient/query")).toBe(
      "/images/guide/patient-query.webp",
    );
    expect(guideScreenshotSrc("https://example.org")).toBeNull();
  });
});
