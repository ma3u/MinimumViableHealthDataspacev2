/**
 * Every contract negotiation and data transfer is on the audit trail before
 * it starts, and does not start without it (ADR-045 plane 2, #418). Refused
 * transfers are recorded too, and the connector is told where to report
 * every later state.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

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
  didFromCounterParty: () => "did:web:pharmaco.de:research",
  recordPermittedTransfer: vi.fn().mockResolvedValue(undefined),
}));

import { edcClient } from "@/lib/edc";
import { checkPermit } from "@/lib/permit-gate";
import { recordDspEvent, recordDspEventAfter } from "@/lib/dsp-audit";
import { __resetDemoRecordsForTests } from "@/lib/demo-records";
import { POST as negotiate } from "@/app/api/negotiations/route";
import { POST as transfer } from "@/app/api/transfers/route";

const mockManagement = vi.mocked(edcClient.management);
const mockCheckPermit = vi.mocked(checkPermit);
const mockRecord = vi.mocked(recordDspEvent);
const mockRecordAfter = vi.mocked(recordDspEventAfter);

const PERMIT = {
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

const post = (url: string, body: Record<string, unknown>) =>
  new NextRequest(`http://localhost${url}`, {
    method: "POST",
    body: JSON.stringify(body),
  });

const NEGOTIATION = {
  participantId: "pharmaco-ctx",
  counterPartyAddress: "http://controlplane:8082/api/dsp",
  counterPartyId: "alpha-ctx",
  providerDid: "did:web:alpha-klinik.de:participant",
  offerId: "offer-1",
  assetId: "fhir-cohort-bundle",
};
const TRANSFER = {
  participantId: "pharmaco-ctx",
  contractId: "agr-456",
  assetId: "fhir-cohort-bundle",
  counterPartyAddress: "http://controlplane:8082/api/dsp",
};

beforeEach(() => {
  __resetDemoRecordsForTests();
  mockManagement.mockReset();
  mockCheckPermit.mockReset();
  mockRecord.mockReset().mockResolvedValue(undefined);
  mockRecordAfter.mockReset().mockResolvedValue(undefined);
  mockReadFile.mockResolvedValue("[]");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/negotiations", () => {
  it("records the request before the connector is asked, then the negotiation id", async () => {
    const order: string[] = [];
    mockRecord.mockImplementation(async () => void order.push("audit"));
    mockManagement.mockImplementation(async () => {
      order.push("connector");
      return { "@id": "neg-123" };
    });
    const res = await negotiate(post("/api/negotiations", NEGOTIATION));
    expect(res.status).toBe(201);
    expect(order).toEqual(["audit", "connector"]);
    expect(mockRecord.mock.calls[0][0]).toMatchObject({
      process: "contract-negotiation",
      event: "requested",
      participantContext: "pharmaco-ctx",
      providerId: "did:web:alpha-klinik.de:participant",
      assetId: "fhir-cohort-bundle",
    });
    expect(mockRecordAfter.mock.calls[0][0]).toMatchObject({
      event: "initiated",
      processId: "neg-123",
    });
  });

  it("does not negotiate when the request cannot be recorded", async () => {
    mockRecord.mockRejectedValue(new Error("audit trail answered 503"));
    const res = await negotiate(post("/api/negotiations", NEGOTIATION));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(
      /audit record could not be written/,
    );
    expect(mockManagement).not.toHaveBeenCalled();
  });

  it("tells the connector to report every state to the audit trail", async () => {
    vi.stubEnv("AUDIT_CALLBACK_URL", "http://neo4j-proxy:9090/audit/dsp");
    mockManagement.mockResolvedValue({ "@id": "neg-123" });
    await negotiate(post("/api/negotiations", NEGOTIATION));
    expect(mockManagement.mock.calls[0][2]).toMatchObject({
      callbackAddresses: [
        {
          "@type": "CallbackAddress",
          uri: "http://neo4j-proxy:9090/audit/dsp",
          events: ["contract.negotiation"],
          transactional: false,
        },
      ],
    });
  });

  it("records a failed request as a failure", async () => {
    mockManagement.mockRejectedValue(new Error("connector refused"));
    const res = await negotiate(post("/api/negotiations", NEGOTIATION));
    expect(res.status).toBe(502);
    expect(mockRecordAfter.mock.calls[0][0]).toMatchObject({
      event: "failed",
      outcome: "failure",
      reason: "connector refused",
    });
  });
});

describe("POST /api/transfers", () => {
  it("records a refused transfer, with the reason, and asks no connector", async () => {
    mockCheckPermit.mockResolvedValue({
      ...PERMIT,
      allowed: false,
      permitId: null,
      reason: "holds no data permit",
    });
    const res = await transfer(post("/api/transfers", TRANSFER));
    expect(res.status).toBe(403);
    expect(mockManagement).not.toHaveBeenCalled();
    expect(mockRecordAfter.mock.calls[0][0]).toMatchObject({
      process: "transfer-process",
      event: "refused",
      outcome: "refused",
      consumerId: "did:web:pharmaco.de:research",
      reason: "holds no data permit",
    });
  });

  it("records the permitted request with its permit before the connector is asked", async () => {
    mockCheckPermit.mockResolvedValue(PERMIT);
    const order: string[] = [];
    mockRecord.mockImplementation(async () => void order.push("audit"));
    mockManagement.mockImplementation(async () => {
      order.push("connector");
      return { "@id": "tp-789" };
    });
    const res = await transfer(post("/api/transfers", TRANSFER));
    expect(res.status).toBe(201);
    expect(order).toEqual(["audit", "connector"]);
    expect(mockRecord.mock.calls[0][0]).toMatchObject({
      event: "requested",
      agreementId: "agr-456",
      permitId: "permit-app-pharmaco-1",
      datasetId: "dataset:synthea-fhir-r4-mvd",
      consumerId: "did:web:pharmaco.de:research",
    });
    expect(mockRecordAfter.mock.calls[0][0]).toMatchObject({
      event: "initiated",
      processId: "tp-789",
    });
  });

  it("does not transfer when the request cannot be recorded", async () => {
    mockCheckPermit.mockResolvedValue(PERMIT);
    mockRecord.mockRejectedValue(new Error("audit trail unreachable"));
    const res = await transfer(post("/api/transfers", TRANSFER));
    expect(res.status).toBe(503);
    expect(mockManagement).not.toHaveBeenCalled();
  });

  it("tells the connector to report every transfer state to the audit trail", async () => {
    vi.stubEnv("AUDIT_CALLBACK_URL", "http://neo4j-proxy:9090/audit/dsp");
    mockCheckPermit.mockResolvedValue(PERMIT);
    mockManagement.mockResolvedValue({ "@id": "tp-789" });
    await transfer(post("/api/transfers", TRANSFER));
    expect(mockManagement.mock.calls[0][2]).toMatchObject({
      callbackAddresses: [
        expect.objectContaining({ events: ["transfer.process"] }),
      ],
    });
  });
});
