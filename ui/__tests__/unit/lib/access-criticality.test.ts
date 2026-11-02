/**
 * classifyAccess(): the criticality of one recorded data access, from the
 * fields the access record carries (lib/access-criticality.ts).
 */
import { describe, expect, it } from "vitest";
import {
  classifyAccess,
  CRITICALITY_REASONS,
  type AccessRecord,
  type Criticality,
} from "@/lib/access-criticality";

/** The row the live register showed on 2026-11-01, from the CI smoke. */
const FEDERATED_STATS: AccessRecord = {
  consumerDid: "did:web:unknown:Demo Participant",
  accessedAt: "2026-11-01T06:12:00Z",
  accessType: "QUERY",
  endpoint: "/federated/stats",
  statusCode: 200,
  resultCount: 1,
  bytesAccessed: 1510,
};

/** PharmaCo reads AlphaKlinik's FHIR patients under its permit. */
const FHIR_READ: AccessRecord = {
  consumerDid: "did:web:pharmaco.de:research",
  consumerCountry: "DE",
  providerCountry: "DE",
  accessedAt: "2026-09-18T03:00:00Z",
  accessType: "DATA_READ",
  endpoint: "/fhir/Patient",
  statusCode: 200,
  resultCount: 42,
  bytesAccessed: 125000,
  permitId: "hdab-decision-medreg-2025-001",
  permitStatus: "APPROVED",
  permitValidUntil: "2027-02-20T23:59:59Z",
  contractId: "contract-fhir-t2d-001",
};

const NO_PERMIT = {
  permitId: null,
  permitStatus: null,
  permitValidUntil: null,
  contractId: null,
};

const CASES: [string, AccessRecord, Criticality][] = [
  [
    "federated stats by an unknown consumer",
    FEDERATED_STATS,
    { level: "low", reasons: ["aggregate counts only", "unknown consumer"] },
  ],
  [
    "the same read by the CI smoke's test identity",
    { ...FEDERATED_STATS, consumerDid: "did:web:ci.test:participant" },
    { level: "low", reasons: ["aggregate counts only", "automated test"] },
  ],
  [
    "a record-level FHIR read under a permit",
    FHIR_READ,
    { level: "medium", reasons: ["record-level data"] },
  ],
  [
    "the same read with no permit and no contract",
    { ...FHIR_READ, ...NO_PERMIT },
    {
      level: "high",
      reasons: ["record-level data", "no data permit or contract"],
    },
  ],
  [
    "one patient's full record, identity revealed, even under a permit",
    { ...FHIR_READ, endpoint: "/fhir/Patient/P1/$everything", resultCount: 7 },
    { level: "high", reasons: ["one patient's full record"] },
  ],
  [
    "a refused record-level read without a permit",
    {
      ...FHIR_READ,
      ...NO_PERMIT,
      consumerDid: "did:web:irs.fr:hdab",
      consumerCountry: "FR",
      statusCode: 403,
      resultCount: 0,
      bytesAccessed: 180,
      errorMessage: "No data permit covers this access (Art. 61(1))",
    },
    {
      level: "medium",
      reasons: [
        "record-level data",
        "no data permit or contract",
        "cross-border",
        "request refused or failed, nothing disclosed",
      ],
    },
  ],
  [
    "a failed aggregate stays low",
    {
      ...FEDERATED_STATS,
      consumerDid: "did:web:lmc.nl:clinic",
      statusCode: 500,
    },
    {
      level: "low",
      reasons: [
        "aggregate counts only",
        "request refused or failed, nothing disclosed",
      ],
    },
  ],
  [
    "a record-level read by an unknown consumer, contract present",
    { ...FHIR_READ, consumerDid: "did:web:unknown:someone" },
    { level: "high", reasons: ["record-level data", "unknown consumer"] },
  ],
  [
    "a record-level read under a permit that had expired",
    { ...FHIR_READ, accessedAt: "2027-03-01T00:00:00Z" },
    {
      level: "high",
      reasons: ["record-level data", "data permit not valid at access time"],
    },
  ],
  [
    "an aggregate under a permit that was never granted",
    {
      ...FEDERATED_STATS,
      consumerDid: "did:web:pharmaco.de:research",
      permitId: "app-1",
      permitStatus: "PENDING",
    },
    {
      level: "medium",
      reasons: [
        "aggregate counts only",
        "data permit not valid at access time",
      ],
    },
  ],
  [
    "an aggregate with a large result",
    {
      ...FEDERATED_STATS,
      consumerDid: "did:web:pharmaco.de:research",
      resultCount: 250,
    },
    { level: "medium", reasons: ["aggregate counts only", "large result"] },
  ],
  [
    "an NLQ answer of one row is an aggregate",
    {
      ...FEDERATED_STATS,
      consumerDid: "did:web:pharmaco.de:research",
      endpoint: "/nlq",
    },
    { level: "low", reasons: ["aggregate counts only"] },
  ],
  [
    "an NLQ answer of rows is record level",
    {
      ...FHIR_READ,
      endpoint: "/nlq",
      resultCount: 12,
      bytesAccessed: 4000,
    },
    { level: "medium", reasons: ["record-level data"] },
  ],
  [
    "catalogue metadata",
    {
      consumerDid: "did:web:pharmaco.de:research",
      endpoint: "/catalog/datasets",
      statusCode: 200,
      resultCount: 9,
    },
    { level: "low", reasons: ["catalogue metadata only"] },
  ],
  [
    "a seeded transfer without an endpoint is record level",
    {
      consumerDid: "did:web:pharmaco.de:research",
      accessType: "INITIAL_TRANSFER",
      contractId: "contract-abc",
      bytesAccessed: 2_097_152,
    },
    { level: "medium", reasons: ["record-level data", "large result"] },
  ],
];

describe("classifyAccess()", () => {
  it.each(CASES)("%s", (_name, record, expected) => {
    expect(classifyAccess(record)).toEqual(expected);
  });

  it("gives only reasons the page has a translation key for", () => {
    const known = new Set<string>(CRITICALITY_REASONS);
    for (const [, record] of CASES) {
      for (const r of classifyAccess(record).reasons) {
        expect(known.has(r), r).toBe(true);
      }
    }
  });

  it("answers for a record with no fields at all", () => {
    expect(classifyAccess({})).toEqual({
      level: "high",
      reasons: [
        "record-level data",
        "no data permit or contract",
        "unknown consumer",
      ],
    });
  });
});
