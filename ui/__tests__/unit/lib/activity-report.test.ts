/**
 * The activity report of the access body, Regulation (EU) 2025/327
 * Art. 59(1)(a) to (k). Issue #206, M6.
 */
import { describe, it, expect } from "vitest";
import {
  buildActivityReport,
  reportPeriod,
  toMarkdown,
  ITEM_TITLES,
  type ApplicationRow,
} from "@/lib/activity-report";

const FROM = new Date("2024-09-18T00:00:00Z");
const TO = new Date("2026-09-18T12:00:00Z");
const NOW = new Date("2026-09-18T12:34:56Z");

function app(over: Partial<ApplicationRow> = {}): ApplicationRow {
  return {
    applicationId: "app-1",
    applicant: "PharmaCo Research AG",
    applicantType: "CRO",
    purpose: "SCIENTIFIC_RESEARCH",
    submittedAt: "2026-02-01T08:30:00.000000000Z",
    permitId: "permit-app-1",
    permitStatus: "APPROVED",
    decidedAt: "2026-02-20T11:00:00Z",
    revokedAt: null,
    revocationReason: null,
    datasetId: "dataset:synthea-fhir-r4-mvd",
    datasetTitle: "Synthea cohort",
    firstAccessAt: "2026-02-15T09:30:00.000000000Z",
    ...over,
  };
}

function build(applications: ApplicationRow[] = [], extra = {}) {
  return buildActivityReport({
    bodies: [
      { name: "MedReg DE", did: "did:web:medreg.de:hdab", country: "DE" },
    ],
    applications,
    requests: [],
    access: [],
    labels: [],
    from: FROM,
    to: TO,
    now: NOW,
    ...extra,
  });
}

describe("reportPeriod", () => {
  it("defaults to the 24 months up to now", () => {
    const { from, to } = reportPeriod(null, null, NOW);
    expect(to).toEqual(NOW);
    expect(from.toISOString()).toBe("2024-09-18T12:34:56.000Z");
  });

  it("takes explicit bounds and ignores garbage", () => {
    const { from, to } = reportPeriod("2025-01-01", "not a date", NOW);
    expect(from.toISOString()).toBe("2025-01-01T00:00:00.000Z");
    expect(to).toEqual(NOW);
  });
});

describe("buildActivityReport", () => {
  it("has every item (a) to (k) with its title, even for an empty graph", () => {
    const r = build();
    expect(Object.keys(r.items)).toEqual([
      "a",
      "b",
      "c",
      "d",
      "e",
      "f",
      "g",
      "h",
      "i",
      "j",
      "k",
    ]);
    for (const k of Object.keys(ITEM_TITLES) as (keyof typeof ITEM_TITLES)[]) {
      expect(r.items[k].title).toBe(ITEM_TITLES[k]);
    }
    expect(r.article).toContain("Art. 59(1)");
    expect(r.period.months).toBe(24);
    expect(r.items.a.applications).toBe(0);
    expect(r.items.h.averageDays).toBeNull();
    expect(r.items.g.amountEur).toBe(0);
  });

  it("counts applications, permits, refusals, revocations and pending (a), and the measures (b)", () => {
    const r = build([
      app(),
      app({
        applicationId: "app-2",
        applicant: "Limburg Medical Centre",
        applicantType: "CLINIC",
        purpose: "PUBLIC_HEALTH",
        permitId: "permit-app-2",
        permitStatus: "REVOKED",
        revokedAt: "2026-09-16T08:00:00.000000000Z",
        revocationReason: "Output left the SPE with identifiers.",
        firstAccessAt: null,
      }),
      app({
        applicationId: "app-3",
        applicantType: "HDAB",
        permitStatus: "REJECTED",
        permitId: "permit-app-3",
        firstAccessAt: null,
      }),
      app({
        applicationId: "app-4",
        permitStatus: null,
        permitId: null,
        purpose: null,
        firstAccessAt: null,
      }),
    ]);
    const a = r.items.a;
    expect(a.applications).toBe(4);
    expect(a.permitsIssued).toBe(2);
    expect(a.refused).toBe(1);
    expect(a.revoked).toBe(1);
    expect(a.pending).toBe(1);
    expect(a.byApplicantType).toEqual({
      "research organisation": 2,
      "healthcare provider": 1,
      "health data access body": 1,
    });
    // The Art. 53(1) letter of the purpose label is dropped in the report.
    expect(a.byPurpose).toEqual({
      "Scientific research": 2,
      "Public interest in public or occupational health": 1,
      "not stated": 1,
    });
    expect(a.dataCategoriesAccessed).toEqual([
      {
        datasetId: "dataset:synthea-fhir-r4-mvd",
        title: "Synthea cohort",
        permits: 2,
      },
    ]);
    expect(r.items.b.measures).toEqual([
      {
        permitId: "permit-app-2",
        applicant: "Limburg Medical Centre",
        revokedAt: "2026-09-16T08:00:00.000Z",
        reason: "Output left the SPE with identifiers.",
      },
    ]);
  });

  it("leaves applications outside the period out, and keeps undated ones", () => {
    const r = build([
      app({ applicationId: "old", submittedAt: "2023-01-01T00:00:00Z" }),
      app({ applicationId: "undated", submittedAt: null }),
      app(),
    ]);
    expect(r.items.a.applications).toBe(2);
  });

  it("averages the days from application to first access (h)", () => {
    const r = build([
      app(),
      app({
        applicationId: "app-2",
        submittedAt: "2026-03-01T00:00:00Z",
        firstAccessAt: "2026-03-31T00:00:00Z",
      }),
      app({ applicationId: "app-3", firstAccessAt: null }),
    ]);
    expect(r.items.h.basis).toBe(2);
    expect(r.items.h.averageDays).toBe(22);
    expect(r.items.h.detail[0]).toMatchObject({
      applicationId: "app-1",
      days: 14,
    });
  });

  it("sums the access events and the labels (c, i), and counts requests (a)", () => {
    const r = build([], {
      requests: [
        {
          requestId: "req-1",
          status: "ANSWERED",
          purpose: "STATISTICS",
          submittedAt: "2026-09-01T09:30:00Z",
        },
        {
          requestId: "req-2",
          status: "PENDING",
          purpose: "STATISTICS",
          submittedAt: "2026-09-02T09:30:00Z",
        },
      ],
      access: [
        {
          consumer: "did:web:pharmaco.de:research",
          consumerName: "PharmaCo Research AG",
          events: 41,
          underPermit: 7,
          refused: 1,
          permits: 1,
        },
        {
          consumer: "did:web:lmc.nl:clinic",
          consumerName: null,
          events: 12,
          underPermit: 2,
          refused: 0,
          permits: 1,
        },
      ],
      labels: [
        {
          credentialId: "vc:1",
          datasetId: "ds-1",
          holder: "AlphaKlinik Berlin",
          completeness: 0.95,
          conformance: 0.92,
          timeliness: 0.98,
          coverage: "partial",
          assessmentDate: "2025-07-24",
          status: "active",
        },
        {
          credentialId: "vc:2",
          datasetId: "ds-2",
          holder: "Limburg Medical Centre",
          completeness: 0.88,
          conformance: 0.9,
          timeliness: 0.94,
          coverage: "full",
          assessmentDate: "2025-08-10",
          status: "active",
        },
        {
          credentialId: "vc:3",
          datasetId: "ds-3",
          holder: null,
          completeness: null,
          conformance: null,
          timeliness: null,
          coverage: null,
          assessmentDate: null,
          status: null,
        },
      ],
    });
    expect(r.items.a.healthDataRequests).toBe(2);
    expect(r.items.a.healthDataRequestsAnswered).toBe(1);
    expect(r.items.c.accessEvents).toBe(53);
    expect(r.items.c.underPermit).toBe(9);
    expect(r.items.c.refused).toBe(1);
    expect(r.items.i.total).toBe(3);
    expect(r.items.i.byCoverage).toEqual({
      partial: 1,
      full: 1,
      "not assessed": 1,
    });
  });
});

describe("toMarkdown", () => {
  it("renders one heading per item with the letter, and the figures", () => {
    const md = toMarkdown(
      build([app()], {
        labels: [
          {
            credentialId: "vc:1",
            datasetId: "ds-1",
            holder: "AlphaKlinik Berlin",
            completeness: 0.95,
            conformance: 0.92,
            timeliness: 0.98,
            coverage: "partial",
            assessmentDate: "2025-07-24",
            status: "active",
          },
        ],
      }),
    );
    for (const k of "abcdefghijk") {
      expect(md).toContain(`## (${k}) `);
    }
    expect(md).toContain("# Activity report of the health data access body");
    expect(md).toContain(
      "Regulation (EU) 2025/327, Art. 59(1). Period 2024-09-18 to 2026-09-18.",
    );
    expect(md).toContain("Access bodies: MedReg DE (DE)");
    expect(md).toContain(
      "- Applications received: 1 (research organisation: 1)",
    );
    expect(md).toContain(
      "- Data permits issued: 1; refused: 0; revoked: 0; pending: 0",
    );
    expect(md).toContain("- Average: 14 days over 1 permit(s).");
    expect(md).toContain("- ds-1 of AlphaKlinik Berlin: completeness 0.95");
    expect(md).not.toContain("undefined");
  });
});
