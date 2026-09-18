/**
 * The data permit gate (Regulation (EU) 2025/327, Art. 61(1) and 68).
 * Issue #206, M3.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/neo4j", () => ({
  runQuery: vi.fn(),
}));

import { runQuery } from "@/lib/neo4j";
import {
  checkPermit,
  didFromCounterParty,
  recordPermittedTransfer,
  type PermitRow,
} from "@/lib/permit-gate";

const mockRunQuery = vi.mocked(runQuery);
const NOW = new Date("2026-09-17T12:00:00Z");
const PHARMACO = "did:web:pharmaco.de:research";
const SYNTHEA = "dataset:synthea-fhir-r4-mvd";

function permit(over: Partial<PermitRow> = {}): PermitRow {
  return {
    permitId: "permit-app-1",
    status: "APPROVED",
    datasetId: SYNTHEA,
    datasetTitle: "Synthea Synthetic FHIR R4 Patient Cohort",
    validUntil: "2027-09-17T23:59:59Z",
    purpose: "SCIENTIFIC_RESEARCH",
    applicationId: "app-1",
    ...over,
  };
}

describe("checkPermit", () => {
  beforeEach(() => mockRunQuery.mockReset());

  it("refuses when the consumer cannot be identified, without asking the graph", async () => {
    const r = await checkPermit({ consumerDid: null, now: NOW });
    expect(r.allowed).toBe(false);
    expect(r.article).toContain("Art. 61(1)");
    expect(mockRunQuery).not.toHaveBeenCalled();
  });

  it("refuses a consumer no access body has decided on", async () => {
    mockRunQuery.mockResolvedValue([]);
    const r = await checkPermit({ consumerDid: PHARMACO, now: NOW });
    expect(r.allowed).toBe(false);
    expect(r.reason).toContain("holds no data permit");
    expect(mockRunQuery.mock.calls[0][1]).toEqual({ consumerDid: PHARMACO });
  });

  it("refuses when the only decision is a refusal", async () => {
    mockRunQuery.mockResolvedValue([
      permit({ status: "REJECTED", permitId: "permit-app-1" }),
    ]);
    const r = await checkPermit({ consumerDid: PHARMACO, now: NOW });
    expect(r.allowed).toBe(false);
    expect(r.reason).toContain("refused");
    expect(r.permitId).toBe("permit-app-1");
  });

  it("refuses a revoked permit and says when and why (Art. 63(3))", async () => {
    mockRunQuery.mockResolvedValue([
      permit({
        status: "REVOKED",
        revokedAt: "2026-09-18T05:20:00Z",
        revocationReason: "Output left the SPE with direct identifiers.",
      }),
    ]);
    const r = await checkPermit({ consumerDid: PHARMACO, now: NOW });
    expect(r.allowed).toBe(false);
    expect(r.reason).toContain("revoked on 2026-09-18");
    expect(r.reason).toContain("Art. 63(3)");
    expect(r.reason).toContain("direct identifiers");
  });

  it("refuses an expired permit", async () => {
    mockRunQuery.mockResolvedValue([
      permit({ validUntil: "2026-01-01T00:00:00Z" }),
    ]);
    const r = await checkPermit({ consumerDid: PHARMACO, now: NOW });
    expect(r.allowed).toBe(false);
    expect(r.reason).toContain("expired on 2026-01-01");
  });

  it("allows a valid permit for the named dataset", async () => {
    mockRunQuery.mockResolvedValue([permit()]);
    const r = await checkPermit({
      consumerDid: PHARMACO,
      datasetId: SYNTHEA,
      now: NOW,
    });
    expect(r.allowed).toBe(true);
    expect(r.permitId).toBe("permit-app-1");
    expect(r.datasetMatched).toBe(true);
    expect(r.validUntil).toBe("2027-09-17T23:59:59Z");
  });

  it("refuses when the named dataset is not the one the permit grants", async () => {
    mockRunQuery.mockResolvedValue([permit()]);
    const r = await checkPermit({
      consumerDid: PHARMACO,
      datasetId: "dataset:omop-cdm-v54-analytics",
      now: NOW,
    });
    expect(r.allowed).toBe(false);
    expect(r.reason).toContain("none for dataset:omop-cdm-v54-analytics");
  });

  it("allows any valid permit when only an unmapped asset id is known, and says so", async () => {
    mockRunQuery.mockResolvedValue([permit()]);
    const r = await checkPermit({
      consumerDid: PHARMACO,
      assetId: "fhir-cohort-bundle",
      now: NOW,
    });
    expect(r.allowed).toBe(true);
    expect(r.datasetMatched).toBe(false);
    expect(r.reason).toContain("not mapped to a dataset");
  });

  it("prefers the permit whose dataset matches the asset", async () => {
    mockRunQuery.mockResolvedValue([
      permit({
        permitId: "permit-omop",
        datasetId: "dataset:omop-cdm-v54-analytics",
        datasetTitle: "OMOP CDM v5.4 analytics",
      }),
      permit({ permitId: "permit-synthea" }),
    ]);
    const r = await checkPermit({
      consumerDid: PHARMACO,
      assetId: "synthea-fhir-r4",
      now: NOW,
    });
    expect(r.allowed).toBe(true);
    expect(r.permitId).toBe("permit-synthea");
    expect(r.datasetMatched).toBe(true);
  });

  it("reads Neo4j's nine fractional digits", async () => {
    mockRunQuery.mockResolvedValue([
      permit({ validUntil: "2027-09-17T23:59:59.000000000Z" }),
    ]);
    const r = await checkPermit({ consumerDid: PHARMACO, now: NOW });
    expect(r.allowed).toBe(true);
  });
});

describe("didFromCounterParty", () => {
  it("maps an EDC-V identity to the participant's DID", () => {
    expect(didFromCounterParty("did:web:identityhub%3A7083:pharmaco")).toBe(
      PHARMACO,
    );
  });
  it("keeps a plain did:web", () => {
    expect(didFromCounterParty("did:web:lmc.nl:clinic")).toBe(
      "did:web:lmc.nl:clinic",
    );
  });
  it("returns null for nothing recognisable", () => {
    expect(didFromCounterParty("ctx-1")).toBeNull();
    expect(didFromCounterParty(undefined)).toBeNull();
  });
});

describe("recordPermittedTransfer", () => {
  // No mockReset() in a beforeEach here: with the console spy below, vitest 4
  // then attributes the swallowed rejection to the test and fails it.

  it("writes the transfer with its permit into the audit graph", async () => {
    mockRunQuery.mockReset();
    mockRunQuery.mockResolvedValue([]);
    await recordPermittedTransfer({
      transferId: "demo-transfer:x",
      contractId: "demo-agreement:x",
      assetId: "fhir-cohort-bundle",
      consumerDid: PHARMACO,
      permitId: "permit-app-1",
      datasetId: SYNTHEA,
      demo: true,
    });
    const [cypher, params] = mockRunQuery.mock.calls[0];
    expect(cypher).toContain("MERGE (t:DataTransfer {id: $transferId})");
    expect(cypher).toContain("UNDER_PERMIT");
    expect(params).toMatchObject({ permitId: "permit-app-1", demo: true });
  });

  it("never throws: an audit write must not undo a transfer", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockRunQuery.mockImplementation(async () => {
      throw new Error("Neo4j unavailable");
    });
    let outcome = "resolved";
    try {
      await recordPermittedTransfer({
        transferId: "t",
        contractId: "c",
        assetId: "a",
        consumerDid: PHARMACO,
        permitId: "p",
        datasetId: null,
        demo: false,
      });
    } catch (e) {
      outcome = `rejected: ${(e as Error).message}`;
    }
    expect(outcome).toBe("resolved");
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
