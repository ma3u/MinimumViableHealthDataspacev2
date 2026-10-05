// @vitest-environment node
/**
 * The Klarbefund app sends a report's values into the patient's own record
 * (#473 phase 3). Every value here is invented.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRunQuery = vi.fn();
vi.mock("@/lib/neo4j", () => ({
  runQuery: (...args: unknown[]) => mockRunQuery(...args),
}));

const requireAppToken = vi.fn();
vi.mock("@/lib/app-auth", async (original) => ({
  ...(await original<typeof import("@/lib/app-auth")>()),
  requireAppToken: (...args: unknown[]) => requireAppToken(...args),
}));

import { parseReportBundle } from "@/lib/patient/app-observations";
import { rowsToBundle } from "@/lib/overview/observations";

const REPORT = "8d1c2b7e-3d4a-4b5c-9d8e-1a2b3c4d5e6f";
const SOURCE =
  "https://ehds.mabu.red/fhir/StructureDefinition/epa-ingest-source-kind";

function observation(
  id: string,
  over: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    resourceType: "Observation",
    id,
    status: "preliminary",
    extension: [{ url: SOURCE, valueCode: "ocr-transcribed" }],
    category: [{ coding: [{ code: "laboratory" }] }],
    code: {
      coding: [
        { system: "http://loinc.org", code: "2093-3", display: "Cholesterol" },
      ],
      text: "Cholesterin",
    },
    subject: { reference: "Patient/meinbefund-local" },
    effectiveDateTime: "2026-06-17",
    valueQuantity: {
      value: 190,
      unit: "mg/dL",
      system: "http://unitsofmeasure.org",
      code: "mg/dL",
    },
    referenceRange: [{ high: { value: 200 }, text: "< 200" }],
    ...over,
  };
}

function bundle(...observations: Record<string, unknown>[]) {
  return {
    resourceType: "Bundle",
    type: "document",
    entry: [
      { resource: { resourceType: "Patient", id: "meinbefund-local" } },
      ...observations.map((resource) => ({ resource })),
      {
        resource: {
          resourceType: "DiagnosticReport",
          performer: [{ display: "Labor Musterstadt" }],
        },
      },
    ],
  };
}

describe("reading the app's report bundle", () => {
  const ids = { patientId: "KB-AB3DK7MN", reportId: REPORT };

  it("takes a preliminary, LOINC-coded value with its unit, range, date and provenance", () => {
    const { rows, skipped } = parseReportBundle(
      bundle(observation("obs-1")),
      ids,
    );
    expect(skipped).toEqual([]);
    expect(rows[0]).toMatchObject({
      resourceId: `KB-AB3DK7MN-${REPORT}-1`,
      code: "2093-3",
      display: "Cholesterin",
      value: 190,
      unit: "mg/dL",
      high: 200,
      rangeText: "< 200",
      effective: "2026-06-17",
      sourceKind: "ocr-transcribed",
      performer: "Labor Musterstadt",
    });
  });

  it("refuses a final value, an uncoded one, one without a unit and one without a date", () => {
    const { rows, skipped } = parseReportBundle(
      bundle(
        observation("final", { status: "final" }),
        observation("uncoded", { code: { text: "Akkermansia muciniphila" } }),
        observation("unitless", { valueQuantity: { value: 7 } }),
        observation("undated", { effectiveDateTime: undefined }),
        observation("ok"),
      ),
      ids,
    );
    expect(rows.map((r) => r.code)).toEqual(["2093-3"]);
    expect(skipped.map((s) => s.id)).toEqual([
      "final",
      "uncoded",
      "unitless",
      "undated",
    ]);
  });

  it("refuses a body that is not a FHIR Bundle", () => {
    expect(() => parseReportBundle({ resourceType: "Patient" }, ids)).toThrow();
  });
});

describe("the record shows what the app sent as it was sent", () => {
  it("keeps the status and provenance, and tags a sandbox record as not synthetic", () => {
    const b = rowsToBundle(
      [
        {
          id: "o1",
          code: "2093-3",
          display: "Cholesterin",
          value: 190,
          unit: "mg/dL",
          effective: "2026-06-17",
          status: "preliminary",
          sourceKind: "ocr-transcribed",
        },
      ],
      { id: "KB-AB3DK7MN", sandbox: true },
      "/x",
    );
    expect(b.meta?.tag?.[0].code).toBe("sandbox");
    expect(b.entry[0].resource.status).toBe("preliminary");
    expect(b.entry[0].resource.extension?.[0]).toEqual({
      url: SOURCE,
      valueCode: "ocr-transcribed",
    });
  });

  it("leaves the synthetic records as they were: final and fictional", () => {
    const b = rowsToBundle(
      [
        {
          id: "o1",
          code: "2093-3",
          display: "x",
          value: 1,
          unit: "mg/dL",
          effective: "2026-01-01",
        },
      ],
      { id: "P1" },
      "/x",
    );
    expect(b.meta?.tag?.[0].code).toBe("fictional");
    expect(b.entry[0].resource.status).toBe("final");
  });
});

describe("POST /api/patient/app/record", () => {
  const post = async (body: unknown, report = REPORT) => {
    const { POST } = await import("@/app/api/patient/app/record/route");
    return POST(
      new Request("http://localhost/api/patient/app/record", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-klarbefund-report": report,
        },
        body: JSON.stringify(body),
      }),
    );
  };

  beforeEach(() => {
    mockRunQuery.mockReset();
    requireAppToken.mockReset();
    requireAppToken.mockResolvedValue({
      app: { username: "kb-ab3dk7mn", roles: ["PATIENT"], deviceId: "d" },
    });
  });

  it("stores a report's values in the account's own record, replacing what it sent before", async () => {
    mockRunQuery.mockResolvedValue([{ stored: 1 }]);
    const res = await post(
      bundle(observation("obs-1"), observation("f", { status: "final" })),
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({
      stored: 1,
      skipped: [{ id: "f" }],
    });
    const [cypher, params] = mockRunQuery.mock.calls[0];
    expect(cypher).toContain("sandbox: true");
    expect(cypher).toContain("sourceReport: $reportId");
    expect(params).toMatchObject({
      patientId: "KB-AB3DK7MN",
      reportId: REPORT,
    });
  });

  it("refuses a demo persona: a synthetic record never takes real values", async () => {
    requireAppToken.mockResolvedValue({
      app: { username: "patient1", roles: ["PATIENT"], deviceId: "d" },
    });
    expect((await post(bundle(observation("obs-1")))).status).toBe(403);
    expect(mockRunQuery).not.toHaveBeenCalled();
  });

  it("needs the report's id, and a FHIR Bundle", async () => {
    expect(
      (await post(bundle(observation("obs-1")), "not-a-uuid")).status,
    ).toBe(400);
    expect((await post({ resourceType: "Patient" })).status).toBe(400);
  });

  it("refuses without the app's token", async () => {
    const { NextResponse } = await import("next/server");
    requireAppToken.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
    expect((await post(bundle(observation("obs-1")))).status).toBe(401);
  });
});
