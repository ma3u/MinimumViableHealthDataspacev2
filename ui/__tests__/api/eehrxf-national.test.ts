/**
 * API route tests for GET /api/eehrxf/national: the German profiles (gematik
 * ePA, KBV MIO, MII Kerndatensatz) with their validation results and the
 * EEHRxF profile each one corresponds to. They are grouped by guide and kept
 * apart from /api/eehrxf, so they never count as EEHRxF coverage (#1172).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

vi.mock("@/lib/neo4j", () => ({
  runQuery: vi.fn(),
}));

import { runQuery } from "@/lib/neo4j";
import { GET } from "@/app/api/eehrxf/national/route";

const mockRunQuery = vi.mocked(runQuery);

const guide = {
  guideId: "mii-kds-base",
  guideName: "MII Kerndatensatz Basis",
  publisher: "Medizininformatik-Initiative (MII)",
  igPackage: "de.medizininformatikinitiative.kerndatensatz.base#2026.0.1",
  status: "published",
  home: "https://medizininformatik-initiative.github.io/kerndatensatz-basis/2026.0.1/",
  gate: true,
  checkedOn: "2026-11-25",
};

const row = (
  profileId: string,
  tested: number,
  passed: number,
  counterpart: string | null,
) => ({
  ...guide,
  profileId,
  name: profileId,
  canonical: `https://www.medizininformatik-initiative.de/fhir/core/${profileId}`,
  baseResource: "Patient",
  tested,
  passed,
  failed: tested - passed,
  coverage: passed === tested ? "full" : passed > 0 ? "partial" : "none",
  topIssues: tested > passed ? ["1x Patient.name: max allowed = 0"] : [],
  counterpartId: counterpart,
  counterpartName: counterpart ? `${counterpart} name` : null,
});

describe("GET /api/eehrxf/national", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("groups the profiles by guide with their EEHRxF counterpart", async () => {
    mockRunQuery.mockResolvedValueOnce([
      row("kds-condition-de", 32, 20, "condition-eu-core"),
      row("kds-procedure-de", 24, 23, null),
    ]);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.guides).toHaveLength(1);
    expect(data.guides[0]).toMatchObject({
      guideId: "mii-kds-base",
      publisher: "Medizininformatik-Initiative (MII)",
      gate: true,
    });
    expect(data.guides[0].profiles).toHaveLength(2);
    expect(data.guides[0].profiles[0].eehrxfCounterpart).toEqual({
      profileId: "condition-eu-core",
      name: "condition-eu-core name",
    });
    expect(data.guides[0].profiles[1].eehrxfCounterpart).toBeNull();
    expect(data.summary).toEqual({
      guides: 1,
      profiles: 2,
      resourcesTested: 56,
      resourcesPassed: 43,
      passRatePercent: 77,
    });
  });

  it("keeps a guide whose profiles are not seeded yet", async () => {
    mockRunQuery.mockResolvedValueOnce([
      {
        ...guide,
        profileId: null,
        name: null,
        canonical: null,
        baseResource: null,
        tested: null,
        passed: null,
        failed: null,
        coverage: null,
        topIssues: null,
        counterpartId: null,
        counterpartName: null,
      },
    ]);

    const data = await (await GET()).json();
    expect(data.guides[0].profiles).toEqual([]);
    expect(data.summary.passRatePercent).toBe(0);
  });

  it("has a static mock of the same shape with the MII Kerndatensatz in it", () => {
    const mock = JSON.parse(
      readFileSync(
        path.resolve(__dirname, "../../public/mock/eehrxf_national.json"),
        "utf8",
      ),
    );
    const packages = mock.guides.map(
      (g: { igPackage: string }) => g.igPackage.split("#")[0],
    );
    expect(packages).toContain(
      "de.medizininformatikinitiative.kerndatensatz.base",
    );
    for (const g of mock.guides) {
      for (const p of g.profiles) {
        expect(p.passed + p.failed).toBe(p.tested);
        expect(["full", "partial", "none", "untested"]).toContain(p.coverage);
      }
    }
  });
});
