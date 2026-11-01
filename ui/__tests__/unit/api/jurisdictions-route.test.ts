/**
 * GET /api/jurisdictions (#782): the national implementation profiles from
 * the graph, the bundled ones when the graph has none, and the session gate.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const mockRunQuery = vi.fn();
vi.mock("@/lib/neo4j", () => ({
  runQuery: (...args: unknown[]) => mockRunQuery(...args),
}));

import { GET } from "@/app/api/jurisdictions/route";
import type { JurisdictionsResponse } from "@/lib/jurisdictions";

const row = (code: string, extra: Record<string, unknown> = {}) => ({
  code,
  name: code,
  nameNative: code,
  languages: ["de"],
  accessBodyRole: "Rolle",
  accessBodyRoleEn: "Role",
  designationStatus: "designated",
  optOutModel: "opt-out",
  fees: "fees",
  summary: "summary",
  sources: ["https://example.org"],
  reviewedOn: "2026-11-01",
  laws: [],
  milestones: [],
  accessBodies: [],
  participants: [],
  ...extra,
});

beforeEach(() => {
  mockRunQuery.mockReset();
});

describe("GET /api/jurisdictions", () => {
  it("serves the profiles from the graph, with the Regulation they implement", async () => {
    mockRunQuery.mockResolvedValue([
      row("DE", {
        accessBodies: [
          {
            participantId: "did:web:medreg.de:hdab",
            name: "MedReg DE",
            type: "HDAB_AUTHORITY",
          },
          null,
        ],
      }),
      row("AT", { reviewedOn: "2026-10-30" }),
    ]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as JurisdictionsResponse;
    expect(body.regulation.eli).toBe(
      "http://data.europa.eu/eli/reg/2025/327/oj",
    );
    expect(body.jurisdictions.map((j) => j.code)).toEqual(["DE", "AT"]);
    expect(body.jurisdictions[0].accessBodies).toEqual([
      {
        participantId: "did:web:medreg.de:hdab",
        name: "MedReg DE",
        type: "HDAB_AUTHORITY",
      },
    ]);
    // The oldest check is the one a reader should trust.
    expect(body.reviewedOn).toBe("2026-10-30");
    expect(body.jurisdictions[0]).not.toHaveProperty("reviewedOn");
  });

  it("serves the bundled profiles when the graph has none", async () => {
    mockRunQuery.mockResolvedValue([]);
    const body = (await (await GET()).json()) as JurisdictionsResponse;
    expect(body.jurisdictions.map((j) => j.code).sort()).toEqual([
      "AT",
      "BE",
      "DE",
      "ES",
      "FR",
      "NL",
    ]);
  });

  it("serves the bundled profiles when the graph is unavailable", async () => {
    mockRunQuery.mockRejectedValue(new Error("ServiceUnavailable"));
    const res = await GET();
    expect(res.status).toBe(200);
    expect(
      ((await res.json()) as JurisdictionsResponse).jurisdictions,
    ).toHaveLength(6);
  });
});

describe("the bundled profiles (ui/public/mock/jurisdictions.json)", () => {
  const mock = JSON.parse(
    readFileSync(path.resolve("public/mock/jurisdictions.json"), "utf8"),
  ) as JurisdictionsResponse;

  it("give every member state a law, a role, dates and sources", () => {
    for (const j of mock.jurisdictions) {
      expect(j.laws.length, j.code).toBeGreaterThan(0);
      expect(j.accessBodyRole, j.code).toBeTruthy();
      expect(j.milestones.length, j.code).toBeGreaterThan(0);
      expect(j.sources.length, j.code).toBeGreaterThan(0);
      for (const s of [...j.sources, ...j.laws.map((l) => l.url ?? "")]) {
        if (s) expect(s, j.code).toMatch(/^https:\/\//);
      }
    }
  });

  it("name only the hub's fictional access bodies", () => {
    const names = mock.jurisdictions.flatMap((j) =>
      j.accessBodies.map((b) => b.name),
    );
    for (const n of ["MedReg DE", "MedReg ES", "Institut de Recherche Santé"]) {
      expect(names).toContain(n);
    }
    const FICTIONAL =
      /^(MedReg (DE|ES)|Institut de Recherche Santé|HealthGov \(HDAB\))$/;
    for (const n of names) expect(n).toMatch(FICTIONAL);
  });

  it("use no em dash (house style)", () => {
    expect(JSON.stringify(mock)).not.toContain(String.fromCharCode(0x2014));
  });
});

describe("the gate", () => {
  it("refuses an anonymous caller", async () => {
    vi.resetModules();
    vi.doMock("@/lib/auth-guard", () => ({
      requireAuth: async () =>
        new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
        }),
      isAuthError: (x: unknown) => x instanceof Response,
    }));
    const { GET: gated } = await import("@/app/api/jurisdictions/route");
    const res = await gated();
    expect(res.status).toBe(401);
    vi.doUnmock("@/lib/auth-guard");
  });
});
