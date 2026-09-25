/**
 * /api/compliance/applications: health data access applications (Art. 67)
 * and the access body's inbox with the Art. 68(4) clock. Issue #206, M1.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/neo4j", () => ({
  runQuery: vi.fn(),
}));

import { runQuery } from "@/lib/neo4j";
import { requireAuth } from "@/lib/auth-guard";
import { GET, POST } from "@/app/api/compliance/applications/route";

const mockRunQuery = vi.mocked(runQuery);
const mockRequireAuth = vi.mocked(requireAuth);

const RESEARCHER = {
  session: {
    user: {
      id: "researcher",
      name: "Researcher",
      email: "researcher@pharmaco.de",
    },
    roles: ["EDC_USER_PARTICIPANT", "DATA_USER"],
    accessToken: "",
  },
};

function post(body: unknown) {
  return new NextRequest("http://localhost/api/compliance/applications", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/compliance/applications", () => {
  beforeEach(() => {
    mockRunQuery.mockReset();
    mockRequireAuth.mockResolvedValue(RESEARCHER as never);
  });

  it("needs dataset, purpose and justification", async () => {
    const res = await POST(post({ datasetId: "dataset:synthea-fhir-r4-mvd" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Art. 67(2)");
  });

  it("only takes an Art. 53(1) purpose", async () => {
    const res = await POST(
      post({
        datasetId: "dataset:synthea-fhir-r4-mvd",
        purpose: "MARKETING",
        justification: "x",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("carries the eleven items of Art. 67(2) and reports what is missing", async () => {
    mockRunQuery.mockResolvedValue([
      {
        applicationId: "x",
        applicantName: "PharmaCo Research AG",
        datasetKnown: true,
      },
    ]);
    const res = await POST(
      post({
        datasetId: "dataset:synthea-fhir-r4-mvd",
        purpose: "SCIENTIFIC_RESEARCH",
        justification: "Outcomes.",
        applicantCategory: "commercial",
        namedPersons: "Dr A. Weber",
        intendedUse: "Compare trajectories",
        requestedData: "Adults with T2D",
        dataTimeRange: "2019 to 2026",
        dataFormats: "FHIR R4",
        identifiability: "pseudonymised",
        pseudonymisationJustification: "linkage",
        datasetsBroughtIn: "None",
        safeguards: "SPE only",
        processingPeriodMonths: 12,
        speTools: "R 4.4",
        ethicsCommitteeRef: "EC-1",
        art71Exception: false,
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.completeness).toEqual({
      complete: true,
      present: 11,
      total: 11,
      missing: [],
    });
    expect(body.applicantCategory).toBe("COMMERCIAL");
    const params = mockRunQuery.mock.calls[0][1] as Record<string, unknown>;
    expect(params.identifiability).toBe("PSEUDONYMISED");
    expect(params.speTools).toBe("R 4.4");
    expect(params.art71Exception).toBe(false);
    expect(params.complete).toBe(true);
  });

  it("files the application for the caller's participant with a three-month clock", async () => {
    mockRunQuery.mockResolvedValue([
      {
        applicationId: "ignored-by-route",
        applicantName: "PharmaCo Research AG",
        datasetKnown: true,
      },
    ]);
    const res = await POST(
      post({
        datasetId: "dataset:synthea-fhir-r4-mvd",
        purpose: "SCIENTIFIC_RESEARCH",
        justification: "Outcomes of second-line T2D therapies.",
        periodMonths: 12,
        ethicsCommitteeRef: "EC-PharmaCo-2026-011",
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.applicationId).toMatch(/^app-pharmaco-\d{8}-[a-z0-9]{4}$/);
    expect(body.applicant).toBe("did:web:pharmaco.de:research");
    expect(body.status).toBe("PENDING");
    const submitted = new Date(body.submittedAt);
    const due = new Date(body.decisionDue);
    expect(due.getUTCMonth()).toBe((submitted.getUTCMonth() + 3) % 12);

    const params = mockRunQuery.mock.calls[0][1] as Record<string, unknown>;
    expect(params.applicantDid).toBe("did:web:pharmaco.de:research");
    expect(params.purpose).toBe("SCIENTIFIC_RESEARCH");
    expect(params.periodMonths).toBe(12);
  });

  it("answers 404 when the caller is not a participant in the graph", async () => {
    mockRunQuery.mockResolvedValue([]);
    const res = await POST(
      post({
        datasetId: "dataset:synthea-fhir-r4-mvd",
        purpose: "SCIENTIFIC_RESEARCH",
        justification: "x",
      }),
    );
    expect(res.status).toBe(404);
  });
});

describe("GET /api/compliance/applications", () => {
  beforeEach(() => {
    mockRunQuery.mockReset();
    mockRequireAuth.mockResolvedValue({
      session: {
        user: { id: "regulator", email: "regulator@health-dataspace.local" },
        roles: ["HDAB_AUTHORITY"],
        accessToken: "",
      },
    } as never);
  });

  it("puts undecided applications first, nearest deadline on top", async () => {
    const recent = new Date();
    recent.setUTCDate(recent.getUTCDate() - 10);
    const old = new Date();
    old.setUTCDate(old.getUTCDate() - 100);
    mockRunQuery.mockResolvedValue([
      {
        applicationId: "app-decided",
        status: "APPROVED",
        submittedAt: old.toISOString(),
        permitId: "permit-app-decided",
        decision: "APPROVED",
      },
      {
        applicationId: "app-fresh",
        status: "PENDING",
        submittedAt: recent.toISOString(),
        permitId: null,
        decision: "",
      },
      {
        applicationId: "app-overdue",
        status: "PENDING",
        submittedAt: old.toISOString(),
        permitId: null,
        decision: "",
      },
    ]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    const ids = body.applications.map(
      (a: { applicationId: string }) => a.applicationId,
    );
    expect(ids).toEqual(["app-overdue", "app-fresh", "app-decided"]);
    const overdue = body.applications[0];
    expect(overdue.undecided).toBe(true);
    expect(overdue.daysToDecision).toBeLessThan(0);
    expect(body.applications[2].daysToDecision).toBeNull();
    expect(body.scope).toBe("all");
    expect(body.applications[1].completeness.complete).toBe(false);
    expect(body.applications[1].clockState).toBe("running");
    const params = mockRunQuery.mock.calls[0][1] as { all: boolean };
    expect(params.all).toBe(true);
  });

  it("shows a data user its own applications only", async () => {
    mockRequireAuth.mockResolvedValue(RESEARCHER as never);
    mockRunQuery.mockResolvedValue([]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).scope).toBe("own");
    const params = mockRunQuery.mock.calls[0][1] as {
      all: boolean;
      callerDid: string;
    };
    expect(params.all).toBe(false);
    expect(params.callerDid).toBe("did:web:pharmaco.de:research");
  });

  it("marks a stopped clock as paused with the four-week deadline", async () => {
    mockRunQuery.mockResolvedValue([
      {
        applicationId: "app-inc",
        status: "INCOMPLETE",
        submittedAt: "2026-09-10T10:00:00Z",
        incompleteNoticeAt: "2026-09-15T09:00:00Z",
        completeBy: "2026-10-13T09:00:00Z",
        permitId: null,
        decision: "",
      },
    ]);
    const body = await (await GET()).json();
    expect(body.applications[0].clockState).toBe("paused");
    expect(body.applications[0].completeBy).toBe("2026-10-13T09:00:00.000Z");
    expect(body.applications[0].undecided).toBe(true);
  });
});
