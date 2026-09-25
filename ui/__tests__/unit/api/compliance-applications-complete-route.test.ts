/**
 * POST /api/compliance/applications/complete: the applicant supplies the
 * missing Art. 67(2) items and the Art. 68(4) clock runs again. Issue
 * #206, M1 and M2.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/neo4j", () => ({
  runQuery: vi.fn(),
}));

import { runQuery } from "@/lib/neo4j";
import { requireAuth } from "@/lib/auth-guard";
import { POST } from "@/app/api/compliance/applications/complete/route";

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

const INCOMPLETE = {
  applicationId: "app-1",
  applicantId: "did:web:pharmaco.de:research",
  status: "INCOMPLETE",
  decided: false,
  submittedAt: "2026-09-10T10:00:00Z",
  completedAt: null,
  extendedAt: null,
  incompleteNoticeAt: "2026-09-15T09:00:00Z",
  completeBy: "2026-10-13T09:00:00Z",
  namedPersons: null,
  requestedPurpose: "SCIENTIFIC_RESEARCH",
  intendedUse: "LDL outcomes",
  requestedData: "statin exposures",
  dataTimeRange: "2021 to 2026",
  dataFormats: "OMOP CDM 5.4",
  identifiability: "PSEUDONYMISED",
  pseudonymisationJustification: "adherence series",
  datasetsBroughtIn: "None",
  safeguards: "SPE only",
  processingPeriodMonths: 18,
  speTools: null,
  ethicsCommitteeRef: "EC-PharmaCo-2026-014",
  art71Exception: false,
  art71ExceptionJustification: null,
};

function post(body: unknown) {
  return new NextRequest(
    "http://localhost/api/compliance/applications/complete",
    { method: "POST", body: JSON.stringify(body) },
  );
}

describe("POST /api/compliance/applications/complete", () => {
  beforeEach(() => {
    mockRunQuery.mockReset();
    mockRequireAuth.mockResolvedValue(RESEARCHER as never);
  });

  it("restarts the three months once every item is there", async () => {
    mockRunQuery.mockResolvedValueOnce([INCOMPLETE]).mockResolvedValueOnce([]);
    const res = await POST(
      post({
        applicationId: "app-1",
        namedPersons: "Dr A. Weber",
        speTools: "R 4.4",
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.completeness.complete).toBe(true);
    expect(body.restarted).toBe(true);
    expect(body.clockState).toBe("running");
    const due = Date.parse(body.decisionDue) - Date.now();
    expect(due).toBeGreaterThan(85 * 86_400_000);
    expect(due).toBeLessThan(95 * 86_400_000);
    const params = mockRunQuery.mock.calls[1][1] as Record<string, unknown>;
    expect(params.restart).toBe(true);
    expect(params.namedPersons).toBe("Dr A. Weber");
    // what was not sent stays
    expect(params.safeguards).toBe("SPE only");
  });

  it("keeps the clock stopped while items are still missing", async () => {
    mockRunQuery.mockResolvedValueOnce([INCOMPLETE]).mockResolvedValueOnce([]);
    const res = await POST(
      post({ applicationId: "app-1", namedPersons: "Dr A. Weber" }),
    );
    const body = await res.json();
    expect(body.completeness.complete).toBe(false);
    expect(
      body.completeness.missing.map((m: { item: string }) => m.item),
    ).toEqual(["i"]);
    expect(body.restarted).toBe(false);
    expect(body.clockState).toBe("paused");
  });

  it("is the applicant's own action", async () => {
    mockRunQuery.mockResolvedValueOnce([
      { ...INCOMPLETE, applicantId: "did:web:lmc.nl:clinic" },
    ]);
    const res = await POST(post({ applicationId: "app-1", speTools: "R" }));
    expect(res.status).toBe(403);
  });

  it("refuses once decided", async () => {
    mockRunQuery.mockResolvedValueOnce([{ ...INCOMPLETE, decided: true }]);
    const res = await POST(post({ applicationId: "app-1", speTools: "R" }));
    expect(res.status).toBe(409);
  });
});
