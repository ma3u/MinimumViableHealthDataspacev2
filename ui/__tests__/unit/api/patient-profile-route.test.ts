/**
 * Tests for /api/patient/profile/route.ts
 *
 * GDPR Art. 15 / EHDS Art. 3 — patient right to access own health data.
 * The route has two modes:
 *   - List mode (no ?patientId=): top 20 patients by condition count
 *   - Profile mode (?patientId=X): full profile + computed risk scores
 *
 * Risk scoring combines FHIR condition codes, SNOMED codes, medications and
 * SDOH (social determinants) signals. Tests pin the key thresholds so
 * accidental changes to the formula show up as failing assertions.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Run the real requireAuth() against the mocked session, so the 401/403
// cases below pin the gate (__tests__/setup.ts mocks the guard open).
vi.unmock("@/lib/auth-guard");
import { getServerSession } from "next-auth/next";

const mockRunQuery = vi.fn();
vi.mock("@/lib/neo4j", () => ({
  runQuery: (...args: unknown[]) => mockRunQuery(...args),
}));

import { GET } from "@/app/api/patient/profile/route";

function makeReq(qs = ""): Request {
  return new Request(`http://localhost/api/patient/profile${qs}`);
}

describe("GET /api/patient/profile", () => {
  beforeEach(() => {
    mockRunQuery.mockReset();
    // Reset auth mock to default EDC_ADMIN session.
    vi.mocked(getServerSession).mockResolvedValue({
      user: { name: "Test Admin", email: "admin@test.example" },
      roles: ["EDC_ADMIN"],
    } as unknown as Awaited<ReturnType<typeof getServerSession>>);
  });

  it("returns 401 when there is no session", async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);
    const res = await GET(makeReq(""));
    expect(res.status).toBe(401);
    expect(mockRunQuery).not.toHaveBeenCalled();
  });

  it("returns 403 when role is neither PATIENT nor EDC_ADMIN", async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce({
      user: { name: "Data User", email: "du@test.example" },
      roles: ["DATA_USER"],
    } as unknown as Awaited<ReturnType<typeof getServerSession>>);
    const res = await GET(makeReq(""));
    expect(res.status).toBe(403);
    expect(mockRunQuery).not.toHaveBeenCalled();
  });

  it("list mode returns top-20 patients sorted by condition count", async () => {
    mockRunQuery.mockResolvedValueOnce([
      {
        id: "p-1",
        name: "Patient One",
        gender: "female",
        birthDate: "1970-01-01",
        conditionCount: 12,
      },
      {
        id: "p-2",
        name: "Patient Two",
        gender: "male",
        birthDate: "1985-05-12",
        conditionCount: 3,
      },
    ]);
    const res = await GET(makeReq(""));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.patients).toHaveLength(2);
    expect(data.patients[0].id).toBe("p-1");
    // Only the list query should run in list mode
    expect(mockRunQuery).toHaveBeenCalledTimes(1);
  });

  it("names a Klarbefund record by its account and returns the interests the patient chose", async () => {
    mockRunQuery.mockResolvedValueOnce([
      {
        id: "KB-HH2MYGDJ",
        name: "kb-hh2mygdj",
        gender: "unknown",
        birthDate: "",
        chosenInterests: ["sleep", "fitness"],
      },
    ]);
    mockRunQuery.mockResolvedValueOnce([]); // conditions
    mockRunQuery.mockResolvedValueOnce([]); // medications
    mockRunQuery.mockResolvedValueOnce([]); // observations
    mockRunQuery.mockResolvedValueOnce([{ total: 0 }]);
    const res = await GET(
      new Request("http://localhost/api/patient/profile?patientId=KB-HH2MYGDJ"),
    );
    const data = await res.json();
    expect(String(mockRunQuery.mock.calls[0][0])).toMatch(
      /coalesce\(p\.appAccount, p\.name, 'Anonymous'\) AS name/,
    );
    expect(data.patient.name).toBe("kb-hh2mygdj");
    expect(data.patient).not.toHaveProperty("chosenInterests");
    expect(data.interests).toEqual(["sleep", "fitness"]);
    expect(data.interestsChosen).toBe(true);
    expect(data.suggestedInterests.map((i: { id: string }) => i.id)).toContain(
      "cardiology",
    );
  });

  it("suggests interests from the record while the patient chose none", async () => {
    mockRunQuery.mockResolvedValueOnce([
      {
        id: "P1",
        name: "Maria",
        gender: "female",
        birthDate: "1979-03-15",
        chosenInterests: null,
      },
    ]);
    mockRunQuery.mockResolvedValueOnce([]);
    mockRunQuery.mockResolvedValueOnce([]);
    mockRunQuery.mockResolvedValueOnce([]);
    mockRunQuery.mockResolvedValueOnce([{ total: 0 }]);
    const data = await (
      await GET(
        new Request("http://localhost/api/patient/profile?patientId=P1"),
      )
    ).json();
    expect(data.interestsChosen).toBe(false);
    expect(data.interests).toContain("preventive-care");
  });

  it("returns 404 when patient not found in profile mode", async () => {
    // 5 parallel queries — patient query returns []
    mockRunQuery.mockResolvedValueOnce([]); // patientRows
    mockRunQuery.mockResolvedValueOnce([]); // conditionRows
    mockRunQuery.mockResolvedValueOnce([]); // medicationRows
    mockRunQuery.mockResolvedValueOnce([]); // observationRows
    mockRunQuery.mockResolvedValueOnce([{ total: 0 }]); // totalCountRows

    const res = await GET(makeReq("?patientId=does-not-exist"));
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("Patient not found");
  });

  it("computes HIGH cardiovascular risk for cardio+diabetes+hypertension+SDOH", async () => {
    mockRunQuery.mockResolvedValueOnce([
      {
        id: "p-cardio",
        name: "Cardio Patient",
        gender: "male",
        birthDate: "1955-06-01",
      },
    ]);
    mockRunQuery.mockResolvedValueOnce([
      // I21 acute MI — hasCardioCondition
      {
        code: "I21.9",
        display: "Acute myocardial infarction",
        onsetDate: "2023-01-01",
      },
      // E11 diabetes — hasDiabetes
      { code: "E11.9", display: "Type 2 diabetes", onsetDate: "2020-01-01" },
      // I10 — hasHypertension (also hasCardioCondition)
      {
        code: "I10",
        display: "Essential hypertension",
        onsetDate: "2018-01-01",
      },
      // Stress — SDOH
      { code: "73595000", display: "Stress", onsetDate: "2022-01-01" },
    ]);
    mockRunQuery.mockResolvedValueOnce([]); // meds
    mockRunQuery.mockResolvedValueOnce([]); // observations
    mockRunQuery.mockResolvedValueOnce([{ total: 4 }]);

    const res = await GET(makeReq("?patientId=p-cardio"));
    expect(res.status).toBe(200);
    const data = await res.json();

    // cardio(0.4) + diabetes(0.2) + hypertension(0.2) + stress(0.15) +
    // burden<5 → 0.05 = 1.0 capped
    expect(data.riskScores.cardiovascular.score).toBeGreaterThanOrEqual(0.5);
    expect(data.riskScores.cardiovascular.level).toBe("high");
    expect(data.riskScores.cardiovascular.factors).toContain(
      "cardiovascular disease history",
    );
    expect(data.riskScores.cardiovascular.factors).toContain("diabetes");
    expect(data.riskScores.cardiovascular.factors).toContain(
      "chronic stress (SDOH)",
    );

    // Interests derived from conditions
    expect(data.interests).toContain("cardiology");
    expect(data.interests).toContain("endocrinology");
    expect(data.interests).toContain("mental-health");
  });

  it("computes LOW risk for a healthy patient with no conditions", async () => {
    mockRunQuery.mockResolvedValueOnce([
      {
        id: "p-healthy",
        name: "Healthy Patient",
        gender: "female",
        birthDate: "1990-03-15",
      },
    ]);
    mockRunQuery.mockResolvedValueOnce([]); // no conditions
    mockRunQuery.mockResolvedValueOnce([]);
    mockRunQuery.mockResolvedValueOnce([]);
    mockRunQuery.mockResolvedValueOnce([{ total: 0 }]);

    const res = await GET(makeReq("?patientId=p-healthy"));
    const data = await res.json();

    // Only burdenScore=0.05 contributes → low
    expect(data.riskScores.cardiovascular.level).toBe("low");
    expect(data.riskScores.cardiovascular.factors).toEqual([]);
    expect(data.riskScores.diabetes.level).toBe("low");
    expect(data.totalConditionCount).toBe(0);
  });

  it("returns EHDS / GDPR article references in the response", async () => {
    mockRunQuery.mockResolvedValueOnce([
      {
        id: "p-1",
        name: "Patient",
        gender: "unknown",
        birthDate: "",
      },
    ]);
    mockRunQuery.mockResolvedValueOnce([]);
    mockRunQuery.mockResolvedValueOnce([]);
    mockRunQuery.mockResolvedValueOnce([]);
    mockRunQuery.mockResolvedValueOnce([{ total: 0 }]);

    const res = await GET(makeReq("?patientId=p-1"));
    const data = await res.json();
    expect(data.gdprRights.rightToAccess).toBe("GDPR Art. 15");
    expect(data.gdprRights.rightToPortability).toBe("GDPR Art. 20");
    expect(data.gdprRights.ehdsAccess).toBe("EHDS Art. 3");
  });

  // patient1 owns P1 (#271). The session is read twice: by the role gate and
  // by the own-record check, so it is mocked for the whole test.
  const patient1 = {
    user: { name: "Patient One", email: "patient1@test.example" },
    roles: ["PATIENT"],
    preferredUsername: "patient1",
  } as unknown as Awaited<ReturnType<typeof getServerSession>>;

  it("allows a PATIENT role to read their own profile", async () => {
    vi.mocked(getServerSession).mockResolvedValue(patient1);

    mockRunQuery.mockResolvedValueOnce([
      { id: "P1", name: "Patient", gender: "female", birthDate: "1970-01-01" },
    ]);
    mockRunQuery.mockResolvedValueOnce([]);
    mockRunQuery.mockResolvedValueOnce([]);
    mockRunQuery.mockResolvedValueOnce([]);
    mockRunQuery.mockResolvedValueOnce([{ total: 0 }]);

    const res = await GET(makeReq("?patientId=P1"));
    expect(res.status).toBe(200);
  });

  it("refuses a PATIENT another patient's profile (#475)", async () => {
    vi.mocked(getServerSession).mockResolvedValue(patient1);
    const res = await GET(makeReq("?patientId=P2"));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: "Forbidden" });
    expect(mockRunQuery).not.toHaveBeenCalled();
  });

  it("lists only a PATIENT's own record (#475)", async () => {
    vi.mocked(getServerSession).mockResolvedValue(patient1);
    mockRunQuery.mockResolvedValueOnce([]);
    await GET(makeReq(""));
    expect(mockRunQuery.mock.calls[0][1]).toEqual({ own: "P1" });
  });
});
