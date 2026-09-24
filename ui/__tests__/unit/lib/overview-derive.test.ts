/**
 * Tests for ui/src/lib/overview/derive.ts (discussion #265).
 *
 * The persona overviews show derived state: a value against its band, a
 * trend over months, a consumer's chain of trust, the Art. 68 decision clock.
 * These tests pin the derivation to the seed's stories (Maria Schmidt's HbA1c,
 * PharmaCo's expired purpose credential, Limburg's permit without a contract,
 * the refused Institut de Recherche Santé still attempting the registry).
 *
 * Article numbers are those of Regulation (EU) 2025/327 as adopted.
 */
import { describe, it, expect } from "vitest";
import {
  aggregateMonthly,
  chainOfTrust,
  credentialState,
  daysBetween,
  decisionClock,
  isOutOfRange,
  monthRange,
  permitState,
  rankSignals,
  severityMax,
  trendOf,
  type AccessEvent,
} from "@/lib/overview/derive";

const AS_OF = "2026-09-23T12:00:00Z";
const PHARMACO = "did:web:pharmaco.de:research";
const LMC = "did:web:lmc.nl:clinic";
const IRS = "did:web:irs.fr:hdab";

/** Maria Schmidt's HbA1c as the seed records it (fictional). */
const HBA1C = [
  { date: "2024-09-12", value: 6.4 },
  { date: "2025-01-20", value: 6.6 },
  { date: "2025-05-15", value: 6.9 },
  { date: "2025-09-18", value: 7.1 },
  { date: "2026-02-10", value: 7.3 },
  { date: "2026-08-21", value: 7.6 },
];

function event(
  consumerDid: string,
  accessedAt: string,
  extra: Partial<AccessEvent> = {},
): AccessEvent {
  return {
    consumerDid,
    accessedAt,
    providerDid: "did:web:alpha-klinik.de:participant",
    datasetId: "dataset:synthea-fhir-r4-mvd",
    statusCode: 200,
    ...extra,
  };
}

describe("severity helpers", () => {
  it("severityMax picks the worse of two", () => {
    expect(severityMax("ok", "warn")).toBe("warn");
    expect(severityMax("bad", "warn")).toBe("bad");
    expect(severityMax("info", "ok")).toBe("info");
  });

  it("rankSignals puts bad first and keeps the order of equals", () => {
    const ranked = rankSignals([
      { severity: "ok", id: 1 },
      { severity: "bad", id: 2 },
      { severity: "warn", id: 3 },
      { severity: "bad", id: 4 },
      { severity: "info", id: 5 },
    ] as const);
    expect(ranked.map((s) => s.id)).toEqual([2, 4, 3, 5, 1]);
  });
});

describe("isOutOfRange", () => {
  it("fails above the high and below the low end", () => {
    expect(isOutOfRange(7.6, { low: 4, high: 6 })).toBe(true);
    expect(isOutOfRange(3.2, { low: 4, high: 6 })).toBe(true);
    expect(isOutOfRange(5.5, { low: 4, high: 6 })).toBe(false);
  });

  it("treats an open end as never failing (eGFR '> 90')", () => {
    expect(isOutOfRange(96, { low: 90, high: null })).toBe(false);
    expect(isOutOfRange(88, { low: 90, high: null })).toBe(true);
    expect(isOutOfRange(88, undefined)).toBe(false);
  });
});

describe("trendOf", () => {
  it("needs two points", () => {
    expect(trendOf([])).toBeNull();
    expect(trendOf([{ date: "2026-01-01", value: 1 }])).toBeNull();
  });

  it("HbA1c rising out of the printed band is bad", () => {
    const t = trendOf(HBA1C, { range: { low: 4, high: 6 } });
    expect(t).toMatchObject({
      dir: "rising",
      severity: "bad",
      first: 6.4,
      last: 7.6,
      outOfRange: true,
    });
    expect(t!.months).toBe(23);
  });

  it("LDL falling under a statin but still above the band is warn", () => {
    const t = trendOf(
      [
        { date: "2024-09-12", value: 158 },
        { date: "2026-08-21", value: 132 },
      ],
      { range: { low: 0, high: 116 } },
    );
    expect(t).toMatchObject({ dir: "falling", severity: "warn" });
  });

  it("eGFR slipping below an open-ended band is bad when lower is worse", () => {
    const t = trendOf(
      [
        { date: "2024-09-12", value: 96 },
        { date: "2026-08-21", value: 88 },
      ],
      { range: { low: 90, high: null }, higherIsWorse: false },
    );
    expect(t).toMatchObject({ dir: "falling", severity: "bad" });
  });

  it("a stable value inside the band is ok, outside it is warn", () => {
    const inside = trendOf(
      [
        { date: "2026-01-01", value: 5.1 },
        { date: "2026-06-01", value: 5.2 },
      ],
      { range: { low: 4, high: 6 } },
    );
    expect(inside).toMatchObject({ dir: "stable", severity: "ok" });
    const outside = trendOf(
      [
        { date: "2026-01-01", value: 31.2 },
        { date: "2026-06-01", value: 31.2 },
      ],
      { range: { low: 18.5, high: 25 } },
    );
    expect(outside).toMatchObject({ dir: "stable", severity: "warn" });
  });

  it("without a band, a fifth of the first value is the yardstick", () => {
    const accesses = trendOf([
      { date: "2025-10-01", value: 4 },
      { date: "2026-09-01", value: 12 },
    ]);
    expect(accesses).toMatchObject({ dir: "rising", severity: "warn" });
    const usage = trendOf(
      [
        { date: "2025-10-01", value: 4 },
        { date: "2026-09-01", value: 12 },
      ],
      { higherIsWorse: false },
    );
    expect(usage!.severity).toBe("ok");
  });

  it("sorts unsorted input by date before judging", () => {
    const t = trendOf([...HBA1C].reverse(), { range: { low: 4, high: 6 } });
    expect(t!.first).toBe(6.4);
    expect(t!.last).toBe(7.6);
  });
});

describe("monthRange and aggregateMonthly", () => {
  it("monthRange yields the last twelve months, oldest first", () => {
    const months = monthRange(AS_OF, 12);
    expect(months).toHaveLength(12);
    expect(months[0]).toBe("2025-10-01");
    expect(months[11]).toBe("2026-09-01");
  });

  it("counts events per key and month, zero-filled", () => {
    const months = monthRange(AS_OF, 12);
    const series = aggregateMonthly(
      [
        event(PHARMACO, "2025-10-03T09:15:00Z"),
        event(PHARMACO, "2025-10-19T09:15:00Z"),
        event(PHARMACO, "2026-09-02T09:15:00Z"),
        event(LMC, "2026-03-02T09:15:00Z"),
        event(LMC, "2024-01-01T09:15:00Z"), // outside the window
      ],
      months,
      (e) => e.consumerDid,
    );
    expect(series[PHARMACO].map((p) => p.value)).toEqual([
      2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1,
    ]);
    expect(series[LMC].map((p) => p.value)).toEqual([
      0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0,
    ]);
    expect(series[LMC][5].date).toBe("2026-03-01");
  });

  it("sums a value instead of counting when asked, and drops null keys", () => {
    const months = monthRange(AS_OF, 2);
    const bytes = aggregateMonthly(
      [
        event(PHARMACO, "2026-08-10T00:00:00Z", { responseBytes: 1000 }),
        event(PHARMACO, "2026-08-11T00:00:00Z", { responseBytes: 500 }),
        event(PHARMACO, "2026-09-11T00:00:00Z", { datasetId: null }),
      ],
      months,
      (e) => e.datasetId ?? null,
      (e) => e.responseBytes ?? 0,
    );
    expect(bytes["dataset:synthea-fhir-r4-mvd"].map((p) => p.value)).toEqual([
      1500, 0,
    ]);
  });
});

describe("credentialState", () => {
  it("derives expiry from the date, not the flag", () => {
    // The fixture keeps status "active" on the expired purpose credential.
    expect(
      credentialState(
        { status: "active", expiresAt: "2026-06-20T00:06:57.104Z" },
        AS_OF,
      ),
    ).toBe("expired");
  });

  it("flags a credential expiring within 30 days", () => {
    expect(credentialState({ expiresAt: "2026-10-10T00:00:00Z" }, AS_OF)).toBe(
      "expiring",
    );
    expect(credentialState({ expiresAt: "2027-03-22T00:00:00Z" }, AS_OF)).toBe(
      "active",
    );
  });

  it("revoked wins over everything", () => {
    expect(
      credentialState(
        { revoked: true, expiresAt: "2027-03-22T00:00:00Z" },
        AS_OF,
      ),
    ).toBe("revoked");
  });
});

describe("permitState", () => {
  it("reads the outcome words the permit register uses", () => {
    expect(permitState({ status: "REJECTED" }, AS_OF)).toBe("refused");
    expect(permitState({ outcome: "refused" }, AS_OF)).toBe("refused");
    expect(permitState({ status: "PENDING" }, AS_OF)).toBe("pending");
    expect(
      permitState({ status: "APPROVED", revokedAt: "2026-09-01" }, AS_OF),
    ).toBe("revoked");
  });

  it("judges validity by validUntil", () => {
    expect(
      permitState(
        { status: "APPROVED", validUntil: "2027-02-20T23:59:59Z" },
        AS_OF,
      ),
    ).toBe("valid");
    expect(
      permitState(
        { status: "APPROVED", validUntil: "2026-10-05T23:59:59Z" },
        AS_OF,
      ),
    ).toBe("expiring");
    expect(
      permitState(
        { status: "APPROVED", validUntil: "2026-01-01T00:00:00Z" },
        AS_OF,
      ),
    ).toBe("expired");
  });
});

describe("decisionClock (Art. 68(4))", () => {
  it("is three months from a complete application", () => {
    const c = decisionClock({ submittedAt: "2026-09-01T09:00:00Z" }, AS_OF);
    expect(c.dueAt).toBe("2026-12-01");
    expect(c.overdue).toBe(false);
    expect(c.daysLeft).toBe(69);
  });

  it("is overdue when undecided past the due date", () => {
    // AlphaKlinik's public-health application, submitted 2026-03-15
    const c = decisionClock({ submittedAt: "2026-03-15T10:00:00Z" }, AS_OF);
    expect(c.dueAt).toBe("2026-06-15");
    expect(c.overdue).toBe(true);
    expect(c.daysLeft).toBeLessThan(0);
  });

  it("a decided application is never overdue and honours an explicit due date", () => {
    const c = decisionClock(
      {
        submittedAt: "2026-02-01T08:30:00Z",
        decidedAt: "2026-02-20T11:00:00Z",
        decisionDue: "2026-05-01T08:30:00Z",
      },
      AS_OF,
    );
    expect(c.decided).toBe(true);
    expect(c.overdue).toBe(false);
    expect(c.dueAt).toBe("2026-05-01");
  });

  it("daysBetween is signed", () => {
    expect(daysBetween("2026-09-23", "2026-09-30")).toBe(7);
    expect(daysBetween("2026-09-23", "2026-09-16")).toBe(-7);
  });
});

describe("chainOfTrust", () => {
  const membership = {
    credentialType: "MembershipCredential",
    expiresAt: "2027-03-22T00:00:00Z",
  };

  it("PharmaCo: accesses after the purpose credential expired are bad", () => {
    const chain = chainOfTrust(
      {
        consumerDid: PHARMACO,
        consumerName: "PharmaCo Research AG",
        credentials: [
          membership,
          {
            credentialType: "DataProcessingPurposeCredential",
            status: "active",
            expiresAt: "2026-06-20T00:06:57.104Z",
          },
        ],
        permits: [
          {
            permitId: "hdab-decision-medreg-2025-001",
            status: "APPROVED",
            validUntil: "2027-01-01T00:00:00Z",
          },
        ],
        contracts: [{ contractId: "contract-fhir-t2d-001" }],
        events: [
          event(PHARMACO, "2026-05-02T09:15:00Z", {
            permitId: "hdab-decision-medreg-2025-001",
            contractId: "contract-fhir-t2d-001",
          }),
          event(PHARMACO, "2026-07-02T09:15:00Z", {
            permitId: "hdab-decision-medreg-2025-001",
            contractId: "contract-fhir-t2d-001",
          }),
          event(PHARMACO, "2026-08-09T09:15:00Z", {
            permitId: "hdab-decision-medreg-2025-001",
            contractId: "contract-fhir-t2d-001",
          }),
        ],
      },
      AS_OF,
    );
    expect(chain.trusted).toBe(false);
    expect(chain.severity).toBe("bad");
    const codes = chain.findings.map((f) => f.code);
    expect(codes).toEqual(["access-after-credential-expiry"]);
    expect(chain.findings[0].text).toContain("2 accesses");
    expect(chain.findings[0].article).toContain("Art. 61(1)");
  });

  it("Limburg: a valid permit but no contract behind the flow is warn", () => {
    const chain = chainOfTrust(
      {
        consumerDid: LMC,
        consumerName: "Limburg Medical Centre",
        credentials: [
          membership,
          {
            credentialType: "DataProcessingPurposeCredential",
            expiresAt: "2027-01-01T00:00:00Z",
          },
        ],
        permits: [
          {
            permitId: "hdab-irs-lmc-2026-001",
            status: "APPROVED",
            validUntil: "2027-02-20T23:59:59Z",
          },
        ],
        contracts: [],
        events: [
          event(LMC, "2026-03-02T09:15:00Z", {
            permitId: "hdab-irs-lmc-2026-001",
          }),
          event(LMC, "2026-04-02T09:15:00Z", {
            permitId: "hdab-irs-lmc-2026-001",
          }),
        ],
      },
      AS_OF,
    );
    expect(chain.trusted).toBe(true);
    expect(chain.severity).toBe("warn");
    expect(chain.findings.map((f) => f.code)).toEqual([
      "transfer-without-contract",
    ]);
  });

  it("IRS: refused application and repeated attempts is a matter for Art. 63", () => {
    const chain = chainOfTrust(
      {
        consumerDid: IRS,
        consumerName: "Institut de Recherche Santé",
        credentials: [membership],
        permits: [{ permitId: "hdab-medreg-irs-2026-001", status: "REJECTED" }],
        contracts: [],
        events: [
          event(IRS, "2026-04-02T09:15:00Z", { statusCode: 403 }),
          event(IRS, "2026-08-02T09:15:00Z", { statusCode: 403 }),
          event(IRS, "2026-09-02T09:15:00Z", { statusCode: 403 }),
        ],
      },
      AS_OF,
    );
    expect(chain.trusted).toBe(false);
    expect(chain.findings.map((f) => f.code)).toEqual([
      "access-attempt-after-refusal",
    ]);
    expect(chain.findings[0].article).toContain("Art. 63");
    expect(chain.findings[0].text).toContain("3 access attempts");
  });

  it("a consumer with nothing in the wallet and data flowing is bad twice", () => {
    const chain = chainOfTrust(
      {
        consumerDid: "did:web:unknown.example:x",
        credentials: [],
        permits: [],
        contracts: [],
        events: [event("did:web:unknown.example:x", "2026-09-01T00:00:00Z")],
      },
      AS_OF,
    );
    const codes = chain.findings.map((f) => f.code);
    expect(codes).toContain("no-membership-credential");
    expect(codes).toContain("access-without-permit");
    expect(codes).toContain("transfer-without-contract");
    expect(
      chain.findings.find((f) => f.code === "transfer-without-contract")!
        .severity,
    ).toBe("bad");
  });

  it("a permit about to lapse is a warning even when everything else is in order", () => {
    const chain = chainOfTrust(
      {
        consumerDid: LMC,
        credentials: [
          membership,
          {
            credentialType: "DataProcessingPurposeCredential",
            expiresAt: "2027-01-01T00:00:00Z",
          },
        ],
        permits: [
          {
            permitId: "p-1",
            status: "APPROVED",
            validUntil: "2026-10-10T00:00:00Z",
          },
        ],
        contracts: [{ contractId: "c-1" }],
        events: [
          event(LMC, "2026-09-01T00:00:00Z", {
            permitId: "p-1",
            contractId: "c-1",
          }),
        ],
      },
      AS_OF,
    );
    expect(chain.trusted).toBe(true);
    expect(chain.findings.map((f) => f.code)).toEqual(["permit-expiring"]);
  });

  it("a consumer fully in order has no findings", () => {
    const chain = chainOfTrust(
      {
        consumerDid: PHARMACO,
        credentials: [
          membership,
          {
            credentialType: "DataProcessingPurposeCredential",
            expiresAt: "2027-06-20T00:00:00Z",
          },
        ],
        permits: [
          { permitId: "p", status: "APPROVED", validUntil: "2027-06-20" },
        ],
        contracts: [{ contractId: "c" }],
        events: [
          event(PHARMACO, "2026-09-01T00:00:00Z", {
            permitId: "p",
            contractId: "c",
          }),
        ],
      },
      AS_OF,
    );
    expect(chain).toEqual({ trusted: true, severity: "ok", findings: [] });
  });
});
