/**
 * /api/compliance/requests and /decide: health data requests (Art. 69).
 * Issue #206, M5.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("@/lib/neo4j", () => ({
  runQuery: vi.fn(),
}));

vi.mock("@/lib/odrl-engine", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/odrl-engine")>()),
  resolveOdrlScope: vi.fn().mockResolvedValue({ participantId: "x" }),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { runQuery } from "@/lib/neo4j";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import { GET, POST } from "@/app/api/compliance/requests/route";
import { POST as DECIDE } from "@/app/api/compliance/requests/decide/route";

const mockRunQuery = vi.mocked(runQuery);
const mockRequireAuth = vi.mocked(requireAuth);
vi.mocked(isAuthError).mockImplementation((r) => r instanceof NextResponse);

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
const HDAB = {
  session: {
    user: {
      id: "regulator",
      name: "MedReg officer",
      email: "regulator@health-dataspace.local",
    },
    roles: ["HDAB_AUTHORITY"],
    accessToken: "",
  },
};

function post(url: string, body: unknown) {
  return new NextRequest(`http://localhost${url}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/compliance/requests", () => {
  beforeEach(() => {
    mockRunQuery.mockReset();
    mockRequireAuth.mockResolvedValue(RESEARCHER as never);
  });

  it("needs a question, a purpose and the statistical content", async () => {
    const res = await POST(
      post("/api/compliance/requests", { question: "How many?" }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("Art. 69(2)");
  });

  it("files the request for the caller with the three-month clock", async () => {
    mockRunQuery.mockResolvedValue([
      { requestId: "x", applicantName: "PharmaCo Research AG" },
    ]);
    const res = await POST(
      post("/api/compliance/requests", {
        question: "How many patients are there?",
        purpose: "SCIENTIFIC_RESEARCH",
        statisticalContent: "One count.",
        datasetId: "dataset:synthea-fhir-r4-mvd",
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.requestId).toMatch(/^req-pharmaco-\d{8}-[a-z0-9]{4}$/);
    expect(body.status).toBe("PENDING");
    expect(Date.parse(body.decisionDue)).toBeGreaterThan(
      Date.parse(body.submittedAt),
    );
    const params = mockRunQuery.mock.calls[0][1] as Record<string, unknown>;
    expect(params.applicantDid).toBe("did:web:pharmaco.de:research");
    expect(params.legalBasis).toContain("GDPR Art. 6(1)(e)");
  });
});

describe("GET /api/compliance/requests", () => {
  beforeEach(() => mockRunQuery.mockReset());

  it("shows a data user only its own requests, parsing the stored answer", async () => {
    mockRequireAuth.mockResolvedValue(RESEARCHER as never);
    mockRunQuery.mockResolvedValue([
      {
        requestId: "req-1",
        status: "ANSWERED",
        submittedAt: "2026-09-01T09:00:00Z",
        answer: JSON.stringify([{ patientCount: 214 }]),
      },
    ]);
    const res = await GET();
    const body = await res.json();
    expect(body.scope).toBe("own");
    expect(mockRunQuery.mock.calls[0][1]).toEqual({
      all: false,
      callerDid: "did:web:pharmaco.de:research",
    });
    expect(body.requests[0].answer).toEqual([{ patientCount: 214 }]);
    expect(body.requests[0].undecided).toBe(false);
  });

  it("shows the access body everything, undecided first", async () => {
    mockRequireAuth.mockResolvedValue(HDAB as never);
    mockRunQuery.mockResolvedValue([
      {
        requestId: "old",
        status: "REJECTED",
        submittedAt: "2026-01-20T14:00:00Z",
        answer: null,
      },
      {
        requestId: "new",
        status: "PENDING",
        submittedAt: "2026-09-01T09:00:00Z",
        answer: null,
      },
    ]);
    const body = await (await GET()).json();
    expect(body.scope).toBe("all");
    expect(
      body.requests.map((r: { requestId: string }) => r.requestId),
    ).toEqual(["new", "old"]);
    expect(typeof body.requests[0].daysToDecision).toBe("number");
  });
});

describe("POST /api/compliance/requests/decide", () => {
  beforeEach(() => {
    mockRunQuery.mockReset();
    mockFetch.mockReset();
    mockRequireAuth.mockResolvedValue(HDAB as never);
  });

  it("is the access body's decision alone", async () => {
    mockRequireAuth.mockResolvedValueOnce(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );
    const res = await DECIDE(
      post("/api/compliance/requests/decide", {
        requestId: "r",
        decision: "APPROVED",
      }),
    );
    expect(res.status).toBe(403);
  });

  it("refuses to refuse without a justification", async () => {
    const res = await DECIDE(
      post("/api/compliance/requests/decide", {
        requestId: "r",
        decision: "REJECTED",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("on approval runs the question in the applicant's name and keeps only the statistic", async () => {
    mockRunQuery
      .mockResolvedValueOnce([
        {
          requestId: "req-1",
          applicantId: "did:web:pharmaco.de:research",
          question: "How many patients are there?",
          purpose: "SCIENTIFIC_RESEARCH",
          datasetId: "dataset:synthea-fhir-r4-mvd",
        },
      ])
      .mockResolvedValueOnce([]);
    mockFetch.mockResolvedValue({
      json: async () => ({
        method: "template",
        templateName: "patient_count",
        results: [{ patientCount: 214 }],
        totalRows: 1,
      }),
    });
    const res = await DECIDE(
      post("/api/compliance/requests/decide", {
        requestId: "req-1",
        decision: "APPROVED",
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.answered).toBe(true);
    expect(body.answer).toEqual([{ patientCount: 214 }]);
    expect(body.article).toContain("anonymised statistical format");

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/nlq");
    expect(init.headers).toMatchObject({
      "X-Participant": "did:web:pharmaco.de:research",
      "X-Request": "req-1",
      "X-Dataset": "dataset:synthea-fhir-r4-mvd",
    });
    const stored = mockRunQuery.mock.calls[1][1] as Record<string, unknown>;
    expect(stored.status).toBe("ANSWERED");
    expect(stored.answer).toBe(JSON.stringify([{ patientCount: 214 }]));
  });

  it("keeps no answer when the question yields records", async () => {
    mockRunQuery
      .mockResolvedValueOnce([
        {
          requestId: "req-2",
          applicantId: "did:web:pharmaco.de:research",
          question: "Show patient 17",
          purpose: null,
          datasetId: null,
        },
      ])
      .mockResolvedValueOnce([]);
    mockFetch.mockResolvedValue({
      json: async () => ({
        method: "template",
        templateName: "patient_journey",
        results: [{ patientId: "p-17", event: "Encounter" }],
      }),
    });
    const body = await (
      await DECIDE(
        post("/api/compliance/requests/decide", {
          requestId: "req-2",
          decision: "APPROVED",
        }),
      )
    ).json();
    expect(body.answered).toBe(false);
    expect(body.answer).toBeNull();
    expect(body.answerError).toContain("returns records");
    const stored = mockRunQuery.mock.calls[1][1] as Record<string, unknown>;
    expect(stored.status).toBe("APPROVED");
    expect(stored.answer).toBeNull();
  });

  it("records a refusal without running anything", async () => {
    mockRunQuery.mockResolvedValueOnce([
      {
        requestId: "req-3",
        applicantId: "did:web:irs.fr:hdab",
        question: "x",
        purpose: null,
        datasetId: null,
      },
    ]);
    const body = await (
      await DECIDE(
        post("/api/compliance/requests/decide", {
          requestId: "req-3",
          decision: "REJECTED",
          justification: "Not a statistic.",
        }),
      )
    ).json();
    expect(body.decision).toBe("REJECTED");
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockRunQuery).toHaveBeenCalledTimes(1);
  });

  it("answers 404 for an unknown request", async () => {
    mockRunQuery.mockResolvedValueOnce([]);
    const res = await DECIDE(
      post("/api/compliance/requests/decide", {
        requestId: "nope",
        decision: "APPROVED",
      }),
    );
    expect(res.status).toBe(404);
  });
});
