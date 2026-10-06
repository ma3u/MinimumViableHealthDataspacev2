/**
 * Tests for /api/patient/route.ts, the own-record list a PATIENT session gets
 * (issue #271): the record the login owns, its stats, and the timeline the
 * page renders straight from this answer.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth-guard";

const mockRunQuery = vi.fn();
vi.mock("@/lib/neo4j", () => ({
  runQuery: (...args: unknown[]) => mockRunQuery(...args),
}));

import { GET } from "@/app/api/patient/route";

type Session = Awaited<ReturnType<typeof getServerSession>>;

const PATIENTS = [
  {
    id: "a-synthea-id",
    name: "Aaron697 Columbus656",
    gender: "male",
    birthDate: "1969-04-10",
  },
  {
    id: "P1",
    name: "Maria Schmidt",
    gender: "female",
    birthDate: "1979-03-15",
  },
];
const STATS = [
  {
    encounters: 6,
    conditions: 8,
    observations: 48,
    medications: 4,
    procedures: 0,
    ehrSyncedAt: "2026-09-22T18:05:00Z",
    ehrSyncSource: "ePA transfer, GesundheitsID-authenticated",
  },
];
const TIMELINE = [
  {
    fhirType: "Condition",
    fhirId: "cond-p1-195967001",
    date: "2009-02-27",
    display: "Asthma",
    omopType: null,
    omopId: null,
  },
  {
    fhirType: "Encounter",
    fhirId: "enc-p1-2026-08-21",
    date: "2026-08-21T08:00:00Z",
    display: "Laboratory visit, AlphaKlinik Berlin (fictional)",
    omopType: null,
    omopId: null,
  },
  {
    fhirType: "Observation",
    fhirId: "x",
    date: "2026-08-21T08:30:00Z",
    display: "Death Certification",
    omopType: null,
    omopId: null,
  },
];

describe("GET /api/patient as a PATIENT", () => {
  beforeEach(() => {
    mockRunQuery.mockReset();
    vi.mocked(getServerSession).mockResolvedValue({
      user: { name: "Maria Schmidt", email: "patient1@health-dataspace.local" },
      roles: ["PATIENT"],
      preferredUsername: "patient1",
    } as unknown as Session);
  });

  it("lists the record the login owns, with its stats and its timeline", async () => {
    mockRunQuery
      .mockResolvedValueOnce(PATIENTS) // all patients by name
      .mockResolvedValueOnce(STATS) // the own record's stats
      .mockResolvedValueOnce(TIMELINE); // the own record's timeline
    const res = await GET(new Request("http://localhost/api/patient"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.restricted).toBe(true);
    expect(data.patients).toEqual([PATIENTS[1]]);
    expect(data.stats.encounters).toBe(6);
    expect(data.stats).not.toHaveProperty("ehrSyncedAt");
    // when the ePA was last transferred into the portal
    expect(data.lastEhrSync).toEqual({
      at: "2026-09-22T18:05:00Z",
      source: "ePA transfer, GesundheitsID-authenticated",
    });
    // the timeline is embedded, end-of-life entries filtered out
    expect(data.timeline).toHaveLength(2);
    expect(data.timeline[0].display).toBe("Asthma");
    const timelineParams = mockRunQuery.mock.calls[2][1];
    expect(timelineParams).toEqual({ patientId: "P1" });
  });

  it("names a Klarbefund record by its account and gives observations their value, unit and date", async () => {
    mockRunQuery
      .mockResolvedValueOnce(PATIENTS)
      .mockResolvedValueOnce(STATS)
      .mockResolvedValueOnce(TIMELINE);
    await GET(new Request("http://localhost/api/patient"));
    const [ownQuery] = mockRunQuery.mock.calls[0];
    // kb-... is how a Klarbefund owner signs in; the record is otherwise
    // only "Klarbefund sandbox", like every other one.
    expect(String(ownQuery)).toMatch(
      /coalesce\(p\.appAccount, p\.name\) AS name/,
    );
    const [timelineQuery] = mockRunQuery.mock.calls[2];
    // The app stores effectiveDate and unit, Synthea dateTime and valueUnit:
    // without these every app value was undated and had no number.
    expect(String(timelineQuery)).toMatch(/fhir\.effectiveDate/);
    expect(String(timelineQuery)).toMatch(
      /toString\(fhir\.valueQuantity\)\s+AS value/,
    );
    expect(String(timelineQuery)).toMatch(
      /coalesce\(fhir\.valueUnit, fhir\.unit\)\s+AS unit/,
    );
  });

  it("says so when the record was never synced", async () => {
    mockRunQuery
      .mockResolvedValueOnce(PATIENTS)
      .mockResolvedValueOnce([
        { ...STATS[0], ehrSyncedAt: null, ehrSyncSource: null },
      ])
      .mockResolvedValueOnce([]);
    const res = await GET(new Request("http://localhost/api/patient"));
    expect((await res.json()).lastEhrSync).toBeNull();
  });

  it("serves the owned record's timeline in timeline mode too", async () => {
    mockRunQuery
      .mockResolvedValueOnce(PATIENTS.map(({ id }) => ({ id })))
      .mockResolvedValueOnce(TIMELINE);
    const res = await GET(
      new Request("http://localhost/api/patient?patientId=P1"),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).timeline).toHaveLength(2);
  });

  it("refuses another patient's timeline", async () => {
    mockRunQuery.mockResolvedValueOnce(PATIENTS.map(({ id }) => ({ id })));
    const res = await GET(
      new Request("http://localhost/api/patient?patientId=a-synthea-id"),
    );
    expect(res.status).toBe(403);
  });
});

/**
 * #357 reopened: the route is gated. It was the one route in the inventory
 * that read a session and answered anyway, so the code and the role matrix
 * disagreed. These pin the refusal, including that the graph is never touched,
 * which is the part a later refactor could quietly lose.
 */
describe("GET /api/patient with no session", () => {
  beforeEach(() => {
    mockRunQuery.mockReset();
    vi.mocked(getServerSession).mockResolvedValue(null);
    // __tests__/setup.ts mocks @/lib/auth-guard open: requireAuth always
    // returns an EDC_ADMIN and isAuthError always returns false, so route
    // tests exercise business logic rather than the guard. That also means no
    // route test can catch a missing gate unless it closes the guard itself,
    // which is what these four do.
    vi.mocked(requireAuth).mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
    vi.mocked(isAuthError).mockImplementation(
      (r): r is NextResponse => r instanceof NextResponse,
    );
  });

  afterEach(() => {
    vi.mocked(requireAuth).mockResolvedValue({
      session: {
        user: { id: "test-admin", name: "Test Admin" },
        roles: ["EDC_ADMIN"],
        accessToken: "test-token",
      },
    });
    vi.mocked(isAuthError).mockReturnValue(false);
  });

  it("refuses the anonymous caller", async () => {
    const res = await GET(new Request("http://localhost/api/patient"));
    expect(res.status).toBe(401);
  });

  it("answers the refusal in the { error } shape every route uses", async () => {
    const res = await GET(new Request("http://localhost/api/patient"));
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("does not read the graph before refusing", async () => {
    await GET(new Request("http://localhost/api/patient"));
    expect(mockRunQuery).not.toHaveBeenCalled();
  });

  it("refuses a request for one named record too", async () => {
    const res = await GET(
      new Request("http://localhost/api/patient?patientId=P1"),
    );
    expect(res.status).toBe(401);
    expect(mockRunQuery).not.toHaveBeenCalled();
  });
});
