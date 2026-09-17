/**
 * POST /api/transfers runs the data permit gate first (Regulation (EU)
 * 2025/327, Art. 61(1)): no permit, no transfer. Issue #206, M3.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("@/lib/edc", () => ({
  edcClient: { management: vi.fn() },
  EDC_CONTEXT: "https://w3id.org/edc/connector/management/v2",
}));

const mockReadFile = vi.fn();
vi.mock("fs", () => ({
  default: { promises: { readFile: (...a: unknown[]) => mockReadFile(...a) } },
  promises: { readFile: (...a: unknown[]) => mockReadFile(...a) },
}));

vi.mock("@/lib/permit-gate", () => ({
  PERMIT_ARTICLE: "Regulation (EU) 2025/327, Art. 61(1) and Art. 68",
  checkPermit: vi.fn(),
  didFromCounterParty: (id?: string) =>
    id && id.includes("pharmaco") ? "did:web:pharmaco.de:research" : null,
  recordPermittedTransfer: vi.fn().mockResolvedValue(undefined),
}));

import { edcClient } from "@/lib/edc";
import { requireAuth } from "@/lib/auth-guard";
import { checkPermit, recordPermittedTransfer } from "@/lib/permit-gate";
import { __resetDemoRecordsForTests } from "@/lib/demo-records";
import { GET, POST } from "@/app/api/transfers/route";

const mockManagement = vi.mocked(edcClient.management);
const mockCheckPermit = vi.mocked(checkPermit);
const mockRecord = vi.mocked(recordPermittedTransfer);
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
const ADMIN = {
  session: {
    user: { id: "test-admin", name: "Test Admin", email: "admin@test.example" },
    roles: ["EDC_ADMIN"],
    accessToken: "",
  },
};

const ALLOWED = {
  allowed: true,
  consumerDid: "did:web:pharmaco.de:research",
  permitId: "permit-app-pharmaco-1",
  datasetId: "dataset:synthea-fhir-r4-mvd",
  datasetMatched: true,
  validUntil: "2027-09-17T23:59:59Z",
  purpose: "SCIENTIFIC_RESEARCH",
  reason: "Covered by data permit permit-app-pharmaco-1.",
  article: "Regulation (EU) 2025/327, Art. 61(1) and Art. 68",
};
const REFUSED = {
  ...ALLOWED,
  allowed: false,
  permitId: null,
  datasetMatched: false,
  reason:
    "did:web:pharmaco.de:research holds no data permit: no health data access body has decided on an access application for this participant.",
};

function postTransfer(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/transfers", {
    method: "POST",
    body: JSON.stringify({
      participantId: "pharmaco-ctx",
      contractId: "demo-agreement:fhir-cohort-bundle",
      assetId: "fhir-cohort-bundle",
      counterPartyAddress: "https://alpha-klinik.de/dsp/2025-1",
      ...body,
    }),
  });
}

describe("POST /api/transfers: the data permit gate", () => {
  beforeEach(() => {
    __resetDemoRecordsForTests();
    mockManagement.mockReset();
    mockCheckPermit.mockReset();
    mockRecord.mockClear();
    mockReadFile.mockResolvedValue("[]");
    mockRequireAuth.mockResolvedValue(RESEARCHER as never);
  });

  it("refuses a transfer without a permit, naming the article, and touches no connector", async () => {
    mockCheckPermit.mockResolvedValue(REFUSED);
    const res = await POST(postTransfer({}));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("No data permit covers this transfer");
    expect(body.article).toContain("Art. 61(1)");
    expect(body.reason).toContain("holds no data permit");
    expect(mockManagement).not.toHaveBeenCalled();
    expect(mockRecord).not.toHaveBeenCalled();

    const list = await GET(
      new NextRequest(
        "http://localhost/api/transfers?participantId=pharmaco-ctx",
      ),
    );
    const rows = (await list.json()) as { "@id": string }[];
    expect(rows.some((r) => r["@id"].startsWith("demo-transfer:"))).toBe(false);
  });

  it("checks the data user's own permit for the named dataset", async () => {
    mockCheckPermit.mockResolvedValue(ALLOWED);
    await POST(postTransfer({ datasetId: "dataset:synthea-fhir-r4-mvd" }));
    expect(mockCheckPermit).toHaveBeenCalledWith({
      consumerDid: "did:web:pharmaco.de:research",
      datasetId: "dataset:synthea-fhir-r4-mvd",
      assetId: "fhir-cohort-bundle",
    });
  });

  it("stamps the permit on a permitted demo transfer and records it for the audit trail", async () => {
    mockCheckPermit.mockResolvedValue(ALLOWED);
    const res = await POST(postTransfer({}));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.demo).toBe(true);
    expect(body.permitId).toBe("permit-app-pharmaco-1");
    expect(body.permitArticle).toContain("Art. 68");
    expect(mockRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        transferId: "demo-transfer:fhir-cohort-bundle",
        permitId: "permit-app-pharmaco-1",
        consumerDid: "did:web:pharmaco.de:research",
        demo: true,
      }),
    );
  });

  it("resolves the consumer from the agreement when a data holder transfers", async () => {
    mockRequireAuth.mockResolvedValue(ADMIN as never);
    mockReadFile.mockResolvedValue(
      JSON.stringify([
        {
          "@id": "neg-1",
          contractAgreementId: "agreement-live-0001",
          assetId: "fhir-patient-search",
          type: "PROVIDER",
          counterPartyId: "did:web:identityhub%3A7083:pharmaco",
        },
      ]),
    );
    mockCheckPermit.mockResolvedValue(ALLOWED);
    mockManagement.mockResolvedValue({ "@id": "tp-1", state: "STARTED" });
    const res = await POST(
      postTransfer({
        participantId: "alpha-ctx",
        contractId: "agreement-live-0001",
        assetId: "fhir-patient-search",
      }),
    );
    expect(res.status).toBe(201);
    expect(mockCheckPermit.mock.calls[0][0].consumerDid).toBe(
      "did:web:pharmaco.de:research",
    );
    expect(mockRecord).toHaveBeenCalledWith(
      expect.objectContaining({ transferId: "tp-1", demo: false }),
    );
  });

  it("answers 503 when the permit register cannot be reached", async () => {
    mockCheckPermit.mockRejectedValue(new Error("Neo4j unavailable"));
    const res = await POST(postTransfer({}));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.article).toContain("Art. 61(1)");
    expect(mockManagement).not.toHaveBeenCalled();
  });

  it("still validates the request before the gate", async () => {
    const res = await POST(
      new NextRequest("http://localhost/api/transfers", {
        method: "POST",
        body: JSON.stringify({ participantId: "x" }),
      }),
    );
    expect(res.status).toBe(400);
    expect(mockCheckPermit).not.toHaveBeenCalled();
    expect(res).toBeInstanceOf(NextResponse);
  });
});
