/**
 * The /docs pages read their facts from docs-facts.json, which
 * scripts/gen-docs-facts.py derives from the code (the PR Gate checks it is
 * current). These tests pin the parts that live on the TypeScript side.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import facts from "@/app/docs/docs-facts.json";
import { DocsLastUpdated } from "@/components/docs/DocsLastUpdated";
import {
  API_GROUP_DESCRIPTIONS,
  groupApiRoutes,
} from "@/components/docs/api-groups";
import { visibleNavGroups } from "@/components/Navigation";

const APP = join(__dirname, "../../../../src/app");

function pageFile(route: string): string {
  return join(APP, route, "page.tsx");
}

describe("docs last-updated dates", () => {
  const pages = Object.keys(facts.lastUpdated);

  it("covers every page under /docs and nothing else", () => {
    const docsPages = facts.uiPages.filter(
      (p) => p === "/docs" || p.startsWith("/docs/"),
    );
    expect([...pages].sort()).toEqual([...docsPages].sort());
  });

  it.each(pages)("%s shows its date", (route) => {
    expect(existsSync(pageFile(route))).toBe(true);
    expect(readFileSync(pageFile(route), "utf8")).toContain(
      `<DocsLastUpdated page="${route}" />`,
    );
  });

  it.each(pages)(
    "%s links to the static site, never the live server",
    (route) => {
      // The live stack stops off hours (ADR-053); a reader following a docs
      // link should land on GitHub Pages, which is always up.
      const src = readFileSync(pageFile(route), "utf8");
      expect(src).not.toMatch(/href=\{?["'`]https:\/\/ehds\.mabu\.red/);
      expect(src).not.toMatch(/=\s*["'`]https:\/\/ehds\.mabu\.red/);
    },
  );

  it("renders the date in words with a machine-readable time", () => {
    render(<DocsLastUpdated page="/docs/architecture" />);
    const time = screen.getByText(/\d{4}$/);
    expect(time.tagName).toBe("TIME");
    expect(time).toHaveAttribute(
      "datetime",
      facts.lastUpdated["/docs/architecture"],
    );
    expect(screen.getByText(/Last updated/)).toBeInTheDocument();
  });
});

describe("API route groups in the developer guide", () => {
  const groups = groupApiRoutes(facts.apiRoutes).map(([g]) => g);

  it("describes every group", () => {
    const missing = groups.filter((g) => !API_GROUP_DESCRIPTIONS[g]);
    expect(missing).toEqual([]);
  });

  it("has no description for a group that no longer exists", () => {
    const stale = Object.keys(API_GROUP_DESCRIPTIONS).filter(
      (g) => !groups.includes(g),
    );
    expect(stale).toEqual([]);
  });

  it("groups by the first segment and sorts the groups", () => {
    const grouped = groupApiRoutes([
      { path: "/api/patient/profile", methods: ["GET"] },
      { path: "/api/catalog", methods: ["GET", "POST"] },
      { path: "/api/patient", methods: ["GET"] },
    ]);
    expect(grouped.map(([g, r]) => [g, r.length])).toEqual([
      ["catalog", 1],
      ["patient", 2],
    ]);
  });
});

describe("visibleNavGroups, which the user guide's role matrix reads", () => {
  const hrefs = (roles: string[]) =>
    visibleNavGroups(roles, true).flatMap((g) => g.links.map((l) => l.href));

  it("gives a patient their own pages and no governance", () => {
    const patient = hrefs(["PATIENT"]);
    expect(patient).toContain("/patient/query");
    expect(patient).not.toContain("/compliance");
  });

  it("gives the access body the governance pages", () => {
    expect(hrefs(["HDAB_AUTHORITY"])).toEqual(
      expect.arrayContaining(["/compliance", "/supervision", "/permits"]),
    );
  });

  it("shows a signed-out visitor no role menu", () => {
    const anon = visibleNavGroups([], false).map((g) => g.label);
    expect(anon).not.toContain("Governance");
    expect(anon).not.toContain("My Health");
  });
});
