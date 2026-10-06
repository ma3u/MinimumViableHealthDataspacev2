// @vitest-environment node
/**
 * The Klarbefund app sends the person's weekly device values from Apple
 * Health into their own record (ADR-057). Every value here is invented.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const mockRunQuery = vi.fn();
vi.mock("@/lib/neo4j", () => ({
  runQuery: (...args: unknown[]) => mockRunQuery(...args),
}));

const requireAppToken = vi.fn();
vi.mock("@/lib/app-auth", async (original) => ({
  ...(await original<typeof import("@/lib/app-auth")>()),
  requireAppToken: (...args: unknown[]) => requireAppToken(...args),
}));

import { parseWearableBundle, SOURCE_KIND } from "@/lib/patient/app-wearables";

const UCUM = "http://unitsofmeasure.org";

function weekly(
  id: string,
  code: string,
  value: number,
  unit: string,
  start = "2026-09-28",
  end = "2026-10-04",
  over: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    resourceType: "Observation",
    id,
    status: "final",
    code: { coding: [{ system: "http://loinc.org", code }] },
    effectivePeriod: { start, end },
    valueQuantity: { value, unit, system: UCUM, code: unit },
    device: { display: "Fictional Watch" },
    ...over,
  };
}

const bundle = (...observations: Record<string, unknown>[]) => ({
  resourceType: "Bundle",
  type: "collection",
  entry: observations.map((resource) => ({ resource })),
});

describe("parseWearableBundle", () => {
  it("takes the four metrics as weekly means with their week", () => {
    const { rows, skipped } = parseWearableBundle(
      bundle(
        weekly("hr", "40443-4", 54.2, "/min"),
        weekly("hrv", "80404-7", 34, "ms"),
        weekly("steps", "41950-7", 9012, "/d"),
        weekly("kg", "29463-7", 67.1, "kg"),
      ),
      "KB-AB3DK7MN",
    );
    expect(skipped).toEqual([]);
    expect(rows.map((r) => [r.code, r.value, r.unit, r.category])).toEqual([
      ["40443-4", 54.2, "/min", "vital-signs"],
      ["80404-7", 34, "ms", "vital-signs"],
      ["41950-7", 9012, "/d", "activity"],
      ["29463-7", 67.1, "kg", "vital-signs"],
    ]);
    expect(rows[0]).toMatchObject({
      resourceId: "KB-AB3DK7MN-wear-40443-4-2026-09-28",
      start: "2026-09-28",
      end: "2026-10-04",
      devices: "Fictional Watch",
      display: "Resting heart rate",
    });
  });

  it("skips what is not a weekly device mean, and says why", () => {
    const { rows, skipped } = parseWearableBundle(
      bundle(
        weekly("lab", "2093-3", 190, "mg/dL"),
        weekly("unit", "40443-4", 54, "bpm"),
        weekly("odd", "40443-4", 900, "/min"),
        weekly("month", "40443-4", 54, "/min", "2026-09-01", "2026-09-30"),
        weekly("draft", "40443-4", 54, "/min", undefined, undefined, {
          status: "preliminary",
        }),
        weekly("ok", "40443-4", 54, "/min"),
        weekly("again", "40443-4", 55, "/min"),
      ),
      "KB-AB3DK7MN",
    );
    expect(rows.map((r) => r.value)).toEqual([54]);
    expect(Object.fromEntries(skipped.map((s) => [s.id, s.reason]))).toEqual({
      lab: "not one of the four device metrics",
      unit: "a number in /min (UCUM) is required",
      odd: "the value is not plausible",
      month: "a period longer than a week",
      draft: "a device value is sent as final",
      again: "the same metric and week twice",
    });
  });

  it("refuses a body that is not a Bundle", () => {
    expect(() => parseWearableBundle({ hello: 1 }, "KB-X")).toThrow(/Bundle/);
  });
});

describe("POST /api/patient/app/wearables", () => {
  const post = async (body: unknown) => {
    const { POST } = await import("@/app/api/patient/app/wearables/route");
    return POST(
      new Request("http://localhost/api/patient/app/wearables", {
        method: "POST",
        headers: { "content-type": "application/json" },
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

  it("replaces the account's device series in its own sandbox record", async () => {
    mockRunQuery.mockResolvedValue([{ stored: 2 }]);
    const res = await post(
      bundle(
        weekly("hr", "40443-4", 54.2, "/min"),
        weekly("kg", "29463-7", 67.1, "kg"),
      ),
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ stored: 2, skipped: [] });
    const [query, params] = mockRunQuery.mock.calls[0];
    expect(String(query)).toMatch(/Patient \{id: \$patientId, sandbox: true\}/);
    expect(String(query)).toMatch(/DETACH DELETE/);
    expect(params).toMatchObject({
      patientId: "KB-AB3DK7MN",
      source: "apple-health-weekly",
      kind: SOURCE_KIND,
    });
    expect(params.rows).toHaveLength(2);
  });

  it("refuses a demo persona: its record is synthetic (403)", async () => {
    requireAppToken.mockResolvedValue({
      app: { username: "patient1", roles: ["PATIENT"], deviceId: "d" },
    });
    const res = await post(bundle(weekly("hr", "40443-4", 54, "/min")));
    expect(res.status).toBe(403);
    expect(mockRunQuery).not.toHaveBeenCalled();
  });

  it("answers with the app token check's refusal", async () => {
    requireAppToken.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
    const res = await post(bundle());
    expect(res.status).toBe(401);
  });

  it("refuses a body that is not a Bundle (400)", async () => {
    const res = await post({ resourceType: "Observation" });
    expect(res.status).toBe(400);
  });
});
