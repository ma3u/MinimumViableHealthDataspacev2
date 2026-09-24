/**
 * Tests for /api/overview/route.ts (issue #271)
 *
 * One state-first view per persona. The patient view composes the patient
 * routes in-process and adds the holder's access log from the graph. Covers
 * auth (401), the role-to-persona rule (403), unknown (400) and not yet
 * implemented (501) personas, the own-record rule for PATIENT, and the
 * assembled view.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getServerSession } from "next-auth/next";

const MOCK = join(__dirname, "../../../public/mock");
const read = (name: string) =>
  JSON.parse(readFileSync(join(MOCK, `${name}.json`), "utf-8"));

const mockRunQuery = vi.fn();
vi.mock("@/lib/neo4j", () => ({
  runQuery: (...args: unknown[]) => mockRunQuery(...args),
}));

const calls: string[] = [];
function stub(name: string, status = 200) {
  return {
    GET: vi.fn(async (req: Request) => {
      calls.push(new URL(req.url).pathname + new URL(req.url).search);
      return new Response(
        JSON.stringify(status === 200 ? read(name) : { error: name }),
        {
          status,
          headers: { "content-type": "application/json" },
        },
      );
    }),
  };
}
vi.mock("@/app/api/patient/profile/route", () =>
  stub("patient_profile_patient1"),
);
vi.mock("@/app/api/patient/insights/route", () => stub("patient_insights"));
vi.mock("@/app/api/patient/research/route", () => stub("patient_research"));
vi.mock("@/app/api/patient/observations/route", () =>
  stub("patient_observations"),
);

import { GET } from "@/app/api/overview/route";

type Session = Awaited<ReturnType<typeof getServerSession>>;
const session = (roles: string[], name = "Test Admin"): Session =>
  ({ user: { name, email: "t@test.example" }, roles }) as unknown as Session;

const ALPHA = "did:web:alpha-klinik.de:participant";
const PHARMACO = "did:web:pharmaco.de:research";

function graphAnswers() {
  mockRunQuery.mockImplementation(async (cypher: string) => {
    if (cypher.includes("TREATED_AT"))
      return [{ did: ALPHA, name: "AlphaKlinik Berlin" }];
    if (cypher.includes("ResearchStudy")) {
      return [
        {
          studyId: "STUDY-CARDIO-2024",
          studyName: "European Cardiovascular Risk Study",
          institution: "PharmaCo Research AG",
          purpose: "secondary-use",
          description: "Multi-centre cohort study.",
          dataNeeded: "FHIR Conditions, Observations",
          status: "open",
          participantCount: 4821,
          countries: ["DE", "NL"],
          ethicsApproval: "EK-Berlin-2024-0041",
        },
      ];
    }
    if (cypher.includes("PatientConsent")) {
      return [
        {
          consentId: "CONSENT-001",
          dataScope: "FHIR Conditions + Observations",
          trustCenter: "MedReg DE Trust Centre",
        },
      ];
    }
    if (cypher.includes("TransferEvent")) {
      return [
        {
          id: "te-1",
          accessedAt: "2026-09-02T09:15:00Z",
          consumerDid: PHARMACO,
          consumerName: "PharmaCo Research AG",
          providerDid: ALPHA,
          datasetId: "dataset:synthea-fhir-r4-mvd",
          statusCode: 200,
          permitId: "p",
          contractId: "c",
          responseBytes: 100,
        },
      ];
    }
    return [];
  });
}

function makeReq(qs = ""): Request {
  return new Request(`http://localhost/api/overview${qs}`);
}

describe("GET /api/overview", () => {
  beforeEach(() => {
    mockRunQuery.mockReset();
    calls.length = 0;
    vi.mocked(getServerSession).mockResolvedValue(session(["EDC_ADMIN"]));
    graphAnswers();
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);
    expect((await GET(makeReq("?persona=patient"))).status).toBe(401);
  });

  it("lets a role open its own persona only", async () => {
    vi.mocked(getServerSession).mockResolvedValue(session(["DATA_USER"]));
    const res = await GET(makeReq("?persona=patient"));
    expect(res.status).toBe(403);
    expect((await res.json()).reason).toContain("researcher");
  });

  it("rejects an unknown persona", async () => {
    expect((await GET(makeReq("?persona=auditor"))).status).toBe(400);
  });

  it("answers 501 for the personas of later milestones", async () => {
    for (const p of ["researcher", "hdab", "hospital"]) {
      const res = await GET(makeReq(`?persona=${p}`));
      expect(res.status, p).toBe(501);
      expect((await res.json()).issue).toContain("/issues/271");
    }
  });

  it("derives the persona from the role when none is given", async () => {
    vi.mocked(getServerSession).mockResolvedValue(session(["HDAB_AUTHORITY"]));
    expect((await GET(makeReq(""))).status).toBe(501);
    vi.mocked(getServerSession).mockResolvedValue(
      session(["PATIENT"], "patient1"),
    );
    const res = await GET(makeReq(""));
    expect(res.status).toBe(200);
    expect((await res.json()).persona).toBe("patient");
  });

  it("assembles the patient view from the patient routes and the graph", async () => {
    const res = await GET(
      makeReq("?persona=patient&patientId=P1&asOf=2026-09-23"),
    );
    expect(res.status).toBe(200);
    const view = await res.json();
    expect(view.persona).toBe("patient");
    expect(view.asOf).toBe("2026-09-23");
    expect(view.me.name).toBe("Anna Müller");
    expect(calls).toEqual([
      "/api/patient/profile?patientId=P1",
      "/api/patient/insights?patientId=P1",
      "/api/patient/research?patientId=P1",
      "/api/patient/observations?patientId=P1",
    ]);
    expect(view.signals[0]).toMatchObject({
      severity: "bad",
      nodeId: "param:4548-4",
    });
    const hba1c = view.nodes.find(
      (n: { id: string }) => n.id === "param:4548-4",
    );
    expect(hba1c.series).toHaveLength(6);
    expect(hba1c.range.high).toBe(6);
    // the registry's study wins over the programme fixture, with its description
    const study = view.nodes.find(
      (n: { id: string }) => n.id === "study:STUDY-CARDIO-2024",
    );
    expect(study.description).toBe("Multi-centre cohort study.");
    // the consent carries the trust centre from the graph
    const consent = view.nodes.find(
      (n: { id: string }) => n.id === "consent:CONSENT-001",
    );
    expect(consent.facts).toContainEqual([
      "pseudonymised by",
      "MedReg DE Trust Centre",
    ]);
    // the holder and the access log are in
    expect(
      view.nodes.some((n: { kind: string }) => n.kind === "Health data holder"),
    ).toBe(true);
    const access = view.nodes.find(
      (n: { id: string }) => n.id === "access:did-web-pharmaco-de-research",
    );
    expect(access.series.at(-1)).toEqual({ date: "2026-09-01", value: 1 });
    const patients = view.nodes.filter(
      (n: { kind: string }) => n.kind === "Patient",
    );
    expect(patients).toHaveLength(1);
  });

  it("a PATIENT session sees their own record whatever patientId says", async () => {
    vi.mocked(getServerSession).mockResolvedValue(
      session(["PATIENT"], "patient1"),
    );
    const res = await GET(makeReq("?persona=patient&patientId=P2"));
    expect(res.status).toBe(200);
    expect(calls[0]).toBe("/api/patient/profile?patientId=P1");
  });

  it("passes a sub-route failure through with its status", async () => {
    const profile = await import("@/app/api/patient/profile/route");
    vi.mocked(profile.GET).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Patient not found" }), {
        status: 404,
      }),
    );
    const res = await GET(makeReq("?persona=patient&patientId=nobody"));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("Patient not found");
  });

  it("returns 502 when the graph is down", async () => {
    mockRunQuery.mockRejectedValue(new Error("ECONNREFUSED"));
    const res = await GET(makeReq("?persona=patient"));
    expect(res.status).toBe(502);
  });
});
