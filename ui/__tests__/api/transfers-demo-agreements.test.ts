/**
 * A transfer under a contract the demonstrator invented is recorded, not sent.
 *
 * The step before this one records a demo negotiation when the offer came from
 * the demo catalogue, because the Azure connector has no participant context
 * (issue #25). Its agreement therefore exists nowhere but here, and so do the
 * agreements in public/mock/negotiations.json, two of which are plain UUIDs
 * left over from a seeded run and are the first two rows the transfer page
 * offers. Sending either to the connector returned a raw 502, which is the same
 * dead end as the original bug, one step further down the walkthrough.
 *
 * Its own file rather than a case in transfers.test.ts, because that file mocks
 * fs to reject every read and these tests need the negotiation fixture to load.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/edc", () => ({
  edcClient: { management: vi.fn() },
  EDC_CONTEXT: "https://w3id.org/edc/connector/management/v2",
}));

const readFile = vi.fn();
vi.mock("fs", () => ({
  default: { promises: { readFile: (...a: unknown[]) => readFile(...a) } },
  promises: { readFile: (...a: unknown[]) => readFile(...a) },
}));

vi.mock("@/lib/auth-guard", () => ({
  requireAuth: vi.fn().mockResolvedValue({ user: { name: "test" } }),
  isAuthError: () => false,
}));

// The data permit gate (issue #206) is exercised in transfers-permit-gate.test.ts;
// here it lets every transfer through.
vi.mock("@/lib/permit-gate", () => ({
  PERMIT_ARTICLE: "Regulation (EU) 2025/327, Art. 61(1) and Art. 68",
  checkPermit: vi.fn().mockResolvedValue({
    allowed: true,
    consumerDid: "did:web:pharmaco.de:research",
    permitId: "permit-test",
    datasetId: null,
    datasetMatched: false,
    validUntil: null,
    purpose: null,
    reason: "test",
    article: "test",
  }),
  didFromCounterParty: () => null,
  recordPermittedTransfer: vi.fn().mockResolvedValue(undefined),
}));

import { edcClient } from "@/lib/edc";
import { __resetDemoRecordsForTests } from "@/lib/demo-records";
import { GET, POST } from "@/app/api/transfers/route";

const mockManagement = vi.mocked(edcClient.management);

const PARTICIPANT = "24be78bf13fc4873b503844d908fcbd2";

/** One synthetic agreement and one that looks live, as the real fixture has. */
const NEGOTIATIONS = JSON.stringify([
  {
    "@id": "neg-1",
    state: "FINALIZED",
    assetId: "fhir-patient-search",
    contractAgreementId: "d8aba283-5386-4bd7-994f-f9527785f37e",
  },
  {
    "@id": "neg-2",
    state: "FINALIZED",
    assetId: "fhir-cohort-bundle",
    contractAgreementId: "agreement-fhir-cohort-bundle-001",
  },
]);

/** The route reads negotiations.json for agreements and transfers.json for rows. */
function fixtures({ transfers = "[]" }: { transfers?: string } = {}) {
  readFile.mockImplementation((p: unknown) =>
    String(p).includes("negotiations.json")
      ? Promise.resolve(NEGOTIATIONS)
      : Promise.resolve(transfers),
  );
}

function transfer(contractId: string, assetId = "fhir-patient-search") {
  return new NextRequest("http://localhost:3000/api/transfers", {
    method: "POST",
    body: JSON.stringify({
      participantId: PARTICIPANT,
      contractId,
      assetId,
      counterPartyAddress: "http://controlplane:8082/api/dsp",
    }),
  });
}

function list(participantId = PARTICIPANT) {
  return new NextRequest(
    `http://localhost:3000/api/transfers?participantId=${participantId}`,
  );
}

describe("/api/transfers demo agreements", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetDemoRecordsForTests();
    fixtures();
  });

  it("records a transfer for an agreement this demonstrator minted", async () => {
    const res = await POST(transfer("demo-agreement:fhir-patient-search"));
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.demo).toBe(true);
    expect(body.state).toBe("STARTED");
    expect(body.contractId).toBe("demo-agreement:fhir-patient-search");
    // One row per contract, and no demo-transfer:demo-agreement: nesting.
    expect(body["@id"]).toBe("demo-transfer:fhir-patient-search");
    expect(body.demoReason).toContain("demonstrator");
    // The contract cannot exist there, so the connector is never asked.
    expect(mockManagement).not.toHaveBeenCalled();
  });

  it("never asks the connector about a synthetic agreement id", async () => {
    const res = await POST(transfer("agreement-fhir-cohort-bundle-001"));

    expect(res.status).toBe(201);
    expect((await res.json()).demo).toBe(true);
    expect(mockManagement).not.toHaveBeenCalled();
  });

  it("tries the connector first for a fixture agreement that looks live", async () => {
    mockManagement.mockRejectedValue(new Error("404 Not Found"));

    const res = await POST(transfer("d8aba283-5386-4bd7-994f-f9527785f37e"));
    expect(res.status).toBe(201);

    const body = await res.json();
    // Tried, refused, then recorded, in that order, so a connector that does
    // hold the agreement keeps it.
    expect(mockManagement).toHaveBeenCalledTimes(1);
    expect(body.demo).toBe(true);
    expect(body.upstreamError).toContain("404");
  });

  it("does not invent a transfer for an agreement it has never seen", async () => {
    mockManagement.mockRejectedValue(new Error("500 Internal Server Error"));

    const res = await POST(transfer("urn:uuid:a-real-agreement"));
    expect(res.status).toBe(502);

    const body = await res.json();
    expect(body.demo).toBeUndefined();
    expect(body.error).toContain("500");
  });

  it("never labels a transfer the connector accepted as demo", async () => {
    mockManagement.mockResolvedValue({ "@id": "tp-real", state: "REQUESTED" });

    const res = await POST(transfer("d8aba283-5386-4bd7-994f-f9527785f37e"));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body["@id"]).toBe("tp-real");
    expect(body.demo).toBeUndefined();
  });

  it("keeps the recorded transfer in the list the page refetches", async () => {
    mockManagement.mockRejectedValue(new Error("no such context"));
    await POST(transfer("demo-agreement:fhir-patient-search"));

    const rows = await (await GET(list())).json();

    // The page refetches straight after starting a transfer; a row that vanished
    // there would look like the transfer had failed.
    expect(rows).toHaveLength(1);
    expect(rows[0].contractId).toBe("demo-agreement:fhir-patient-search");
    expect(rows[0].demo).toBe(true);
  });

  it("does not leak one participant's recorded transfer into another's list", async () => {
    await POST(transfer("demo-agreement:fhir-patient-search"));

    mockManagement.mockRejectedValue(new Error("no such context"));
    const rows = await (await GET(list("someone-else"))).json();

    expect(rows).toHaveLength(0);
  });

  it("records one row however often the same agreement is transferred", async () => {
    await POST(transfer("demo-agreement:fhir-patient-search"));
    await POST(transfer("demo-agreement:fhir-patient-search"));

    mockManagement.mockRejectedValue(new Error("no such context"));
    const rows = await (await GET(list())).json();

    expect(rows).toHaveLength(1);
  });
});
