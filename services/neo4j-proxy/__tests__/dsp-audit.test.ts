/**
 * Every contract negotiation and data transfer is on the audit trail
 * (ADR-045 plane 2, #418): the connector's callback events and the hub's own
 * records become FHIR AuditEvents on the "dsp" chain, and nothing from a
 * transfer's data address reaches them.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildDspAuditEvent,
  dspInputFromEdcEvent,
  type DspAuditInput,
} from "../src/dsp-audit.js";

const appendDspAudit = vi.fn();
vi.mock("../src/dsp-audit.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/dsp-audit.js")>()),
  appendDspAudit: (...args: unknown[]) => appendDspAudit(...args),
}));
vi.mock("neo4j-driver", () => ({
  default: {
    driver: vi.fn(),
    auth: { basic: vi.fn() },
    int: vi.fn((n: number) => n),
    isInt: vi.fn(() => false),
  },
}));

const { app } = await import("../src/index.js");
import supertest from "supertest";
const request = supertest(app);

const META = { id: "a1", recorded: "2026-10-04T17:00:00.000Z" };

const FINALIZED = {
  id: "evt-neg-7",
  at: 1791133200000,
  type: "ContractNegotiationFinalized",
  payload: {
    contractNegotiationId: "neg-123",
    counterPartyId: "did:web:identityhub%3A7083:alpha-klinik",
    counterPartyAddress: "http://controlplane:8082/api/dsp/alpha/2025-1",
    protocol: "dataspace-protocol-http:2025-1",
    // The shape EDC serialises (ContractAgreement: id, not @id).
    contractAgreement: {
      id: "agr-456",
      assetId: "asset-diabetes-cohort",
      consumerId: "did:web:identityhub%3A7083:pharmaco",
      providerId: "did:web:identityhub%3A7083:alpha-klinik",
      policy: { permission: [{ action: "use" }] },
    },
  },
};

const STARTED = {
  id: "evt-tp-9",
  at: 1791133260000,
  type: "TransferProcessStarted",
  payload: {
    transferProcessId: "tp-789",
    contractId: "agr-456",
    assetId: "asset-diabetes-cohort",
    type: "CONSUMER",
    dataAddress: {
      endpoint: "http://dataplane:11002/public/secret-path",
      authorization: "eyJhbGciOiJIUzI1NiJ9.eyJ0b2tlbiI6InNlY3JldCJ9.signature",
    },
  },
};

describe("connector events", () => {
  it("map a finalized negotiation to its agreement, asset and both parties", () => {
    const input = dspInputFromEdcEvent(FINALIZED) as DspAuditInput;
    expect(input).toMatchObject({
      process: "contract-negotiation",
      event: "finalized",
      outcome: "success",
      source: "edc-callback",
      processId: "neg-123",
      agreementId: "agr-456",
      assetId: "asset-diabetes-cohort",
      consumerId: "did:web:identityhub%3A7083:pharmaco",
      providerId: "did:web:identityhub%3A7083:alpha-klinik",
      edcEventId: "evt-neg-7",
    });
  });

  it("never copy a transfer's data address into the record", () => {
    const input = dspInputFromEdcEvent(STARTED) as DspAuditInput;
    const record = JSON.stringify(buildDspAuditEvent(input, META));
    expect(record).toContain("tp-789");
    expect(record).toContain("agr-456");
    expect(record).not.toContain("secret-path");
    expect(record).not.toContain("eyJ");
    expect(record).not.toContain("dataplane:11002");
  });

  it("record a terminated transfer as a failure with its reason", () => {
    const input = dspInputFromEdcEvent({
      id: "evt-tp-10",
      type: "TransferProcessTerminated",
      payload: { transferProcessId: "tp-789", reason: "provider refused" },
    }) as DspAuditInput;
    const record = buildDspAuditEvent(input, META);
    expect(record.outcome).toBe("8");
    expect(record.outcomeDesc).toBe("provider refused");
    expect(record.subtype).toEqual([
      expect.objectContaining({ code: "transfer-process.terminated" }),
    ]);
  });

  it("ignore events that are neither negotiations nor transfers", () => {
    expect(
      dspInputFromEdcEvent({ type: "AssetCreated", payload: {} }),
    ).toBeNull();
    expect(dspInputFromEdcEvent({ payload: {} })).toBeNull();
  });
});

describe("POST /audit/dsp", () => {
  beforeEach(() => {
    appendDspAudit.mockReset();
  });

  it("appends a connector event and answers with its place in the chain", async () => {
    appendDspAudit.mockResolvedValue({ chain: "dsp", seq: 3, hash: "h3" });
    const res = await request.post("/audit/dsp").send(FINALIZED);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ chain: "dsp", seq: 3, hash: "h3" });
    expect(appendDspAudit.mock.calls[0][0]).toMatchObject({
      process: "contract-negotiation",
      event: "finalized",
    });
  });

  it("appends a hub record with its named fields only", async () => {
    appendDspAudit.mockResolvedValue({ chain: "dsp", seq: 4, hash: "h4" });
    const res = await request.post("/audit/dsp").send({
      source: "hub-ui",
      process: "transfer-process",
      event: "refused",
      outcome: "refused",
      consumerId: "did:web:pharmaco.de:research",
      agreementId: "agr-456",
      reason: "No data permit covers this transfer",
      dataAddress: { authorization: "secret" },
    });
    expect(res.status).toBe(201);
    const input = appendDspAudit.mock.calls[0][0];
    expect(input).toMatchObject({ source: "hub-ui", event: "refused" });
    expect(JSON.stringify(input)).not.toContain("secret");
  });

  it("refuses what is not a negotiation or transfer event", async () => {
    const res = await request
      .post("/audit/dsp")
      .send({ type: "AssetCreated", payload: {} });
    expect(res.status).toBe(400);
    expect(appendDspAudit).not.toHaveBeenCalled();
  });

  it("answers 503 when the record cannot be written", async () => {
    appendDspAudit.mockRejectedValue(new Error("Neo4j unavailable"));
    const res = await request.post("/audit/dsp").send(STARTED);
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/audit record could not be written/);
  });
});
