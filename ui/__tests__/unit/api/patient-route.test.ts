/**
 * Tests for /api/patient/route.ts, the own-record list a PATIENT session gets
 * (issue #271): the record the login owns, its stats, and the timeline the
 * page renders straight from this answer.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getServerSession } from "next-auth/next";

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
    // the timeline is embedded, end-of-life entries filtered out
    expect(data.timeline).toHaveLength(2);
    expect(data.timeline[0].display).toBe("Asthma");
    const timelineParams = mockRunQuery.mock.calls[2][1];
    expect(timelineParams).toEqual({ patientId: "P1" });
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
