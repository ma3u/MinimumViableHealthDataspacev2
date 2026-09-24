/**
 * Tests for /api/patient/observations/route.ts (issue #271 M1)
 *
 * Art. 3 and Art. 14: a patient's laboratory results as a FHIR R4 searchset
 * Bundle with the printed reference ranges. Covers auth (401, 403), the
 * own-record rule for PATIENT, the missing id (400), the unknown patient
 * (404), the Bundle shape and the code filter.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getServerSession } from "next-auth/next";

const mockRunQuery = vi.fn();
vi.mock("@/lib/neo4j", () => ({
  runQuery: (...args: unknown[]) => mockRunQuery(...args),
}));

import { GET } from "@/app/api/patient/observations/route";

type Session = Awaited<ReturnType<typeof getServerSession>>;

function makeReq(qs = ""): Request {
  return new Request(`http://localhost/api/patient/observations${qs}`);
}

function session(roles: string[], name = "Test Admin"): Session {
  return {
    user: { name, email: "t@test.example" },
    roles,
  } as unknown as Session;
}

const ROWS = [
  {
    id: "obs-p1-4548-4-2024-09-12",
    code: "4548-4",
    display: "Hemoglobin A1c/Hemoglobin.total in Blood",
    value: 6.4,
    unit: "%",
    low: 4,
    high: 6,
    rangeText: "4.0 - 6.0 % (as printed on the report)",
    category: "laboratory",
    effective: "2024-09-12",
    performer: "AlphaKlinik Berlin, Zentrallabor (fictional)",
  },
  {
    id: "obs-p1-33914-3-2024-09-12",
    code: "33914-3",
    display: "Glomerular filtration rate/1.73 sq M.predicted",
    value: 96,
    unit: "mL/min/{1.73_m2}",
    low: 90,
    high: null,
    rangeText: "> 90 mL/min/{1.73_m2} (as printed on the report)",
    category: "laboratory",
    effective: "2024-09-12T08:30:00Z",
    performer: null,
  },
];

describe("GET /api/patient/observations", () => {
  beforeEach(() => {
    mockRunQuery.mockReset();
    vi.mocked(getServerSession).mockResolvedValue(session(["EDC_ADMIN"]));
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);
    const res = await GET(makeReq("?patientId=P1"));
    expect(res.status).toBe(401);
  });

  it("returns 403 for a researcher", async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(session(["DATA_USER"]));
    const res = await GET(makeReq("?patientId=P1"));
    expect(res.status).toBe(403);
    expect(mockRunQuery).not.toHaveBeenCalled();
  });

  it("returns 400 without a patientId", async () => {
    const res = await GET(makeReq(""));
    expect(res.status).toBe(400);
  });

  it("lets a patient read their own record only (Art. 3)", async () => {
    vi.mocked(getServerSession).mockResolvedValue(
      session(["PATIENT"], "patient1"),
    );
    const other = await GET(makeReq("?patientId=P2"));
    expect(other.status).toBe(403);
    expect((await other.json()).reason).toContain("Art. 3");
    expect(mockRunQuery).not.toHaveBeenCalled();

    mockRunQuery
      .mockResolvedValueOnce([{ id: "P1", name: "Anna Müller" }])
      .mockResolvedValueOnce(ROWS);
    const own = await GET(makeReq("?patientId=P1"));
    expect(own.status).toBe(200);
  });

  it("returns 404 for an unknown patient", async () => {
    mockRunQuery.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const res = await GET(makeReq("?patientId=nobody"));
    expect(res.status).toBe(404);
  });

  it("returns a FHIR R4 searchset with the printed reference ranges", async () => {
    mockRunQuery
      .mockResolvedValueOnce([{ id: "P1", name: "Anna Müller" }])
      .mockResolvedValueOnce(ROWS);
    const res = await GET(makeReq("?patientId=P1"));
    expect(res.status).toBe(200);
    const bundle = await res.json();
    expect(bundle.resourceType).toBe("Bundle");
    expect(bundle.type).toBe("searchset");
    expect(bundle.total).toBe(2);
    expect(bundle.link[0].url).toBe("/api/patient/observations?patientId=P1");
    const [hba1c, egfr] = bundle.entry.map(
      (e: { resource: unknown }) => e.resource,
    );
    expect(hba1c.subject).toEqual({
      reference: "Patient/P1",
      display: "Anna Müller",
    });
    expect(hba1c.code.coding[0]).toEqual({
      system: "http://loinc.org",
      code: "4548-4",
      display: "Hemoglobin A1c/Hemoglobin.total in Blood",
    });
    expect(hba1c.effectiveDateTime).toBe("2024-09-12T00:00:00Z");
    expect(hba1c.valueQuantity).toMatchObject({ value: 6.4, unit: "%" });
    expect(hba1c.referenceRange[0]).toEqual({
      low: { value: 4, unit: "%" },
      high: { value: 6, unit: "%" },
      text: "4.0 - 6.0 % (as printed on the report)",
    });
    expect(hba1c.performer[0].display).toContain("fictional");
    // an open-ended range has no high
    expect(egfr.referenceRange[0].high).toBeUndefined();
    expect(egfr.referenceRange[0].low.value).toBe(90);
    expect(egfr.performer).toBeUndefined();
    expect(egfr.effectiveDateTime).toBe("2024-09-12T08:30:00Z");
  });

  it("passes the code filter to the query", async () => {
    mockRunQuery
      .mockResolvedValueOnce([{ id: "P1", name: "Anna Müller" }])
      .mockResolvedValueOnce([ROWS[0]]);
    const res = await GET(makeReq("?patientId=P1&code=4548-4"));
    expect(res.status).toBe(200);
    const params = mockRunQuery.mock.calls[1][1];
    expect(params).toEqual({ patientId: "P1", code: "4548-4" });
  });

  it("returns 502 when Neo4j is down", async () => {
    mockRunQuery.mockRejectedValue(new Error("ECONNREFUSED"));
    const res = await GET(makeReq("?patientId=P1"));
    expect(res.status).toBe(502);
  });
});
