/**
 * Findings of non-compliance (Art. 63): recorded by the access body, the
 * party's views within four weeks, closed with a measure that may revoke
 * the permit. Issue #206, M4.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("@/lib/neo4j", () => ({
  runQuery: vi.fn(),
}));

import { runQuery } from "@/lib/neo4j";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import { GET, POST } from "@/app/api/compliance/findings/route";
import { POST as respond } from "@/app/api/compliance/findings/respond/route";
import { POST as close } from "@/app/api/compliance/findings/close/route";

const mockRunQuery = vi.mocked(runQuery);
const mockRequireAuth = vi.mocked(requireAuth);
vi.mocked(isAuthError).mockImplementation((r) => r instanceof NextResponse);

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

function post(path: string, body: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/compliance/findings", () => {
  beforeEach(() => {
    mockRunQuery.mockReset();
    mockRequireAuth.mockResolvedValue(HDAB as never);
  });

  it("is the access body's action", async () => {
    mockRequireAuth.mockResolvedValueOnce(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );
    const res = await POST(
      post("/api/compliance/findings", { partyDid: "x", description: "y" }),
    );
    expect(res.status).toBe(403);
  });

  it("needs the party and a description", async () => {
    const res = await POST(post("/api/compliance/findings", { partyDid: "x" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("Art. 63(1)");
  });

  it("notifies the party with four weeks to state its views and flags a GDPR breach", async () => {
    mockRunQuery.mockResolvedValueOnce([{ partyName: "PharmaCo Research AG" }]);
    const res = await POST(
      post("/api/compliance/findings", {
        partyDid: "did:web:pharmaco.de:research",
        permitId: "permit-app-1",
        description: "Identifiers left the SPE",
        gdprBreach: true,
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.findingId).toMatch(/^finding-pharmaco-/);
    expect(body.status).toBe("OPEN");
    expect(body.supervisoryAuthorityInformed).toBe(true);
    const by = Date.parse(body.respondBy) - Date.parse(body.notifiedAt);
    expect(by).toBe(28 * 86_400_000);
    expect(body.article).toContain("supervisory authority");
    const params = mockRunQuery.mock.calls[0][1] as Record<string, unknown>;
    expect(params.foundBy).toBe("did:web:medreg.de:hdab");
    expect(params.permitId).toBe("permit-app-1");
  });

  it("404s a party that is not in the graph", async () => {
    mockRunQuery.mockResolvedValueOnce([]);
    const res = await POST(
      post("/api/compliance/findings", {
        partyDid: "did:web:nobody:x",
        description: "y",
      }),
    );
    expect(res.status).toBe(404);
  });
});

describe("GET /api/compliance/findings", () => {
  beforeEach(() => {
    mockRunQuery.mockReset();
  });

  it("shows the body everything, with the days left to respond", async () => {
    mockRequireAuth.mockResolvedValue(HDAB as never);
    const by = new Date(Date.now() + 10 * 86_400_000).toISOString();
    mockRunQuery.mockResolvedValueOnce([
      { findingId: "f1", status: "OPEN", respondBy: by },
      { findingId: "f2", status: "CLOSED", respondBy: by },
    ]);
    const body = await (await GET()).json();
    expect(body.scope).toBe("all");
    expect(body.findings[0].daysToRespond).toBe(10);
    expect(body.findings[1].daysToRespond).toBeNull();
    expect((mockRunQuery.mock.calls[0][1] as { all: boolean }).all).toBe(true);
  });

  it("shows a party only what is against it", async () => {
    mockRequireAuth.mockResolvedValue(RESEARCHER as never);
    mockRunQuery.mockResolvedValueOnce([]);
    const body = await (await GET()).json();
    expect(body.scope).toBe("own");
    const params = mockRunQuery.mock.calls[0][1] as {
      all: boolean;
      callerDid: string;
    };
    expect(params.all).toBe(false);
    expect(params.callerDid).toBe("did:web:pharmaco.de:research");
  });
});

describe("POST /api/compliance/findings/respond", () => {
  beforeEach(() => {
    mockRunQuery.mockReset();
    mockRequireAuth.mockResolvedValue(RESEARCHER as never);
  });

  it("records the party's views", async () => {
    mockRunQuery
      .mockResolvedValueOnce([
        { partyId: "did:web:pharmaco.de:research", status: "OPEN" },
      ])
      .mockResolvedValueOnce([]);
    const res = await respond(
      post("/api/compliance/findings/respond", {
        findingId: "f1",
        views: "It was a test file.",
      }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("VIEWS_RECEIVED");
  });

  it("is the party's own action", async () => {
    mockRunQuery.mockResolvedValueOnce([
      { partyId: "did:web:lmc.nl:clinic", status: "OPEN" },
    ]);
    const res = await respond(
      post("/api/compliance/findings/respond", { findingId: "f1", views: "x" }),
    );
    expect(res.status).toBe(403);
  });

  it("refuses once closed", async () => {
    mockRunQuery.mockResolvedValueOnce([
      { partyId: "did:web:pharmaco.de:research", status: "CLOSED" },
    ]);
    const res = await respond(
      post("/api/compliance/findings/respond", { findingId: "f1", views: "x" }),
    );
    expect(res.status).toBe(409);
  });
});

describe("POST /api/compliance/findings/close", () => {
  beforeEach(() => {
    mockRunQuery.mockReset();
    mockRequireAuth.mockResolvedValue(HDAB as never);
  });

  it("wants a known measure and a reason for it", async () => {
    let res = await close(
      post("/api/compliance/findings/close", {
        findingId: "f1",
        measure: "SHRUG",
      }),
    );
    expect(res.status).toBe(400);
    res = await close(
      post("/api/compliance/findings/close", {
        findingId: "f1",
        measure: "WARNING",
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("Art. 57(1)(j)(iv)");
  });

  it("revokes the permit the finding concerns", async () => {
    mockRunQuery.mockResolvedValueOnce([
      {
        findingId: "f1",
        permitId: "permit-app-1",
        permitStatus: "REVOKED",
        partyName: "PharmaCo Research AG",
        wasOpen: true,
      },
    ]);
    const res = await close(
      post("/api/compliance/findings/close", {
        findingId: "f1",
        measure: "revocation",
        note: "Identifiers left the SPE",
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.measure).toBe("REVOCATION");
    expect(body.permitRevoked).toBe(true);
    expect(body.article).toContain("Art. 63(3)");
    const cypher = mockRunQuery.mock.calls[0][0] as string;
    expect(cypher).toContain("permit.status            = 'REVOKED'");
    expect(cypher).toContain("MERGE (f)-[:LED_TO]->(permit)");
  });

  it("records a fine with its amount under Art. 64", async () => {
    mockRunQuery.mockResolvedValueOnce([
      {
        findingId: "f1",
        permitId: null,
        permitStatus: null,
        partyName: "x",
        wasOpen: true,
      },
    ]);
    const res = await close(
      post("/api/compliance/findings/close", {
        findingId: "f1",
        measure: "FINE",
        note: "Repeated late reporting",
        fineEur: 25000,
      }),
    );
    const body = await res.json();
    expect(body.fineEur).toBe(25000);
    expect(body.article).toContain("Art. 64");
    expect((mockRunQuery.mock.calls[0][1] as { fineEur: number }).fineEur).toBe(
      25000,
    );
  });

  it("caps an exclusion at five years", async () => {
    mockRunQuery.mockResolvedValueOnce([
      {
        findingId: "f1",
        permitId: null,
        permitStatus: null,
        partyName: "x",
        wasOpen: true,
      },
    ]);
    const res = await close(
      post("/api/compliance/findings/close", {
        findingId: "f1",
        measure: "EXCLUSION",
        note: "x",
        exclusionMonths: 120,
      }),
    );
    expect((await res.json()).exclusionMonths).toBe(60);
  });
});
