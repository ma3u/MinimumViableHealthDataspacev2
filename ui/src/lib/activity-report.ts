/**
 * The activity report of a health data access body.
 *
 * Regulation (EU) 2025/327, Art. 59(1): every health data access body
 * publishes an activity report every two years on its website, with at
 * least the items (a) to (k). The demo generates it from the graph for a
 * period (default: the last 24 months) and renders it as JSON and Markdown.
 * Where the graph records nothing for an item, the report says so instead
 * of inventing a figure. Issue #206, M6.
 */
import { PURPOSE_LABELS, parseGraphTime } from "@/lib/permits";

export const REPORT_ARTICLE = "Regulation (EU) 2025/327, Art. 59(1)";
export const REPORT_MONTHS = 24;

/* ── Graph rows, one shape per query ───────────────────────────── */

export interface ApplicationRow {
  applicationId: string;
  applicant: string | null;
  applicantType: string | null;
  purpose: string | null;
  submittedAt: string | null;
  permitId: string | null;
  permitStatus: string | null;
  decidedAt: string | null;
  revokedAt: string | null;
  revocationReason: string | null;
  datasetId: string | null;
  datasetTitle: string | null;
  firstAccessAt: string | null;
  /** Art. 62: the fee on the permit, EUR. */
  feeEur?: number | null;
}

export interface RequestRow {
  requestId: string;
  status: string | null;
  purpose: string | null;
  submittedAt: string | null;
  feeEur?: number | null;
}

/** Art. 61(4): a result a data user communicated. */
export interface ResultReportRow {
  resultId: string;
  permitId: string | null;
  applicant: string | null;
  kind: string | null;
  title: string | null;
  url: string | null;
  communicatedAt: string | null;
  onTime: boolean | null;
}

/** Art. 63(3), Art. 64: a measure other than a revocation, with any fine. */
export interface MeasureRow {
  findingId: string;
  party: string | null;
  measure: string | null;
  note: string | null;
  fineEur: number | null;
  closedAt: string | null;
}

export interface AccessRow {
  consumer: string | null;
  consumerName: string | null;
  events: number;
  underPermit: number;
  refused: number;
  permits: number;
}

export interface LabelRow {
  credentialId: string;
  datasetId: string | null;
  holder: string | null;
  completeness: number | null;
  conformance: number | null;
  timeliness: number | null;
  coverage: string | null;
  assessmentDate: string | null;
  status: string | null;
}

export interface BodyRow {
  name: string | null;
  did: string | null;
  country: string | null;
}

export interface ReportInput {
  bodies: BodyRow[];
  applications: ApplicationRow[];
  requests: RequestRow[];
  access: AccessRow[];
  labels: LabelRow[];
  results?: ResultReportRow[];
  measures?: MeasureRow[];
  from: Date;
  to: Date;
  now?: Date;
}

/* ── The report ─────────────────────────────────────────────────── */

export interface ActivityReport {
  article: string;
  generatedAt: string;
  period: { from: string; to: string; months: number };
  accessBodies: BodyRow[];
  items: {
    a: {
      title: string;
      applications: number;
      byApplicantType: Record<string, number>;
      permitsIssued: number;
      refused: number;
      revoked: number;
      pending: number;
      byPurpose: Record<string, number>;
      dataCategoriesAccessed: {
        datasetId: string;
        title: string | null;
        permits: number;
      }[];
      healthDataRequests: number;
      healthDataRequestsAnswered: number;
      resultsCommunicated: number;
      note: string;
    };
    b: {
      title: string;
      measures: {
        permitId: string;
        applicant: string | null;
        revokedAt: string | null;
        reason: string | null;
      }[];
      otherMeasures: MeasureRow[];
      administrativeFines: { count: number; amountEur: number };
      note: string;
    };
    c: {
      title: string;
      accessEvents: number;
      underPermit: number;
      refused: number;
      byUser: AccessRow[];
      note: string;
    };
    d: { title: string; audits: string[]; note: string };
    e: { title: string; requests: number; note: string };
    f: { title: string; activities: string[]; note: string };
    g: {
      title: string;
      amountEur: number;
      permitsEur: number;
      requestsEur: number;
      note: string;
    };
    h: {
      title: string;
      averageDays: number | null;
      basis: number;
      detail: {
        applicationId: string;
        applicant: string | null;
        submittedAt: string;
        accessAt: string;
        days: number;
      }[];
      note: string;
    };
    i: {
      title: string;
      total: number;
      byCoverage: Record<string, number>;
      labels: LabelRow[];
      note: string;
    };
    j: { title: string; entries: string[]; note: string };
    k: { title: string; entries: string[]; note: string };
  };
}

export const ITEM_TITLES: Record<keyof ActivityReport["items"], string> = {
  a: "Applications for access, permits and the data accessed",
  b: "Fulfilment of obligations by data users and holders; fines",
  c: "Audits of data users in the secure processing environment",
  d: "Audits of the secure processing environment itself",
  e: "Requests from natural persons exercising their rights",
  f: "Engagement with stakeholders",
  g: "Revenues from data permits and health data requests",
  h: "Average days between application and access",
  i: "Data quality labels issued by data holders",
  j: "Publications, policy documents and regulatory procedures using the data",
  k: "IT products developed using the data",
};

const APPLICANT_TYPE_LABELS: Record<string, string> = {
  CRO: "research organisation",
  CLINIC: "healthcare provider",
  HDAB: "health data access body",
  OPERATOR: "dataspace operator",
};

/** "SCIENTIFIC_RESEARCH" as "Scientific research"; the Art. 53(1) letter of the label is dropped. */
function purposeLabel(purpose: string | null): string {
  const key = (purpose ?? "").toUpperCase();
  if (!key || key === "NONE") return "not stated";
  const label = (PURPOSE_LABELS as Record<string, string>)[key];
  if (!label) return key;
  const plain = label.replace(/^\([a-z]\)\s*/i, "");
  return plain.charAt(0).toUpperCase() + plain.slice(1);
}

function count(map: Record<string, number>, key: string): void {
  map[key] = (map[key] ?? 0) + 1;
}

function iso(value: string | null | undefined): string | null {
  const t = parseGraphTime(value);
  return t === null ? null : new Date(t).toISOString();
}

function inPeriod(value: string | null, from: Date, to: Date): boolean {
  const t = parseGraphTime(value);
  if (t === null) return true; // undated records count rather than vanish
  return t >= from.getTime() && t <= to.getTime();
}

/** Default period: the REPORT_MONTHS months up to `to`. */
export function reportPeriod(
  fromParam: string | null,
  toParam: string | null,
  now: Date = new Date(),
): { from: Date; to: Date } {
  const to = toParam && !isNaN(Date.parse(toParam)) ? new Date(toParam) : now;
  let from: Date;
  if (fromParam && !isNaN(Date.parse(fromParam))) {
    from = new Date(fromParam);
  } else {
    from = new Date(to);
    from.setUTCMonth(from.getUTCMonth() - REPORT_MONTHS);
  }
  return { from, to };
}

/** Aggregate the graph rows into the eleven items of Art. 59(1). */
export function buildActivityReport(input: ReportInput): ActivityReport {
  const { from, to } = input;
  const now = input.now ?? new Date();
  const apps = input.applications.filter((a) =>
    inPeriod(a.submittedAt, from, to),
  );
  const requests = input.requests.filter((r) =>
    inPeriod(r.submittedAt, from, to),
  );

  const byApplicantType: Record<string, number> = {};
  const byPurpose: Record<string, number> = {};
  const datasets = new Map<
    string,
    { datasetId: string; title: string | null; permits: number }
  >();
  let permitsIssued = 0;
  let refused = 0;
  let revoked = 0;
  let pending = 0;
  const measures: ActivityReport["items"]["b"]["measures"] = [];
  const detail: ActivityReport["items"]["h"]["detail"] = [];

  for (const app of apps) {
    const type = (app.applicantType ?? "").toUpperCase();
    count(byApplicantType, APPLICANT_TYPE_LABELS[type] ?? (type || "unknown"));
    count(byPurpose, purposeLabel(app.purpose));
    const status = (app.permitStatus ?? "").toUpperCase();
    if (status === "APPROVED" || status === "REVOKED") {
      permitsIssued += 1;
      if (app.datasetId) {
        const entry = datasets.get(app.datasetId) ?? {
          datasetId: app.datasetId,
          title: app.datasetTitle,
          permits: 0,
        };
        entry.permits += 1;
        datasets.set(app.datasetId, entry);
      }
      const submitted = parseGraphTime(app.submittedAt);
      const accessed = parseGraphTime(app.firstAccessAt);
      if (submitted !== null && accessed !== null && accessed >= submitted) {
        detail.push({
          applicationId: app.applicationId,
          applicant: app.applicant,
          submittedAt: new Date(submitted).toISOString(),
          accessAt: new Date(accessed).toISOString(),
          days: Math.round((accessed - submitted) / 86_400_000),
        });
      }
    }
    if (status === "REVOKED") {
      revoked += 1;
      measures.push({
        permitId: app.permitId ?? app.applicationId,
        applicant: app.applicant,
        revokedAt: iso(app.revokedAt),
        reason: app.revocationReason,
      });
    } else if (status === "REJECTED") {
      refused += 1;
    } else if (status === "") {
      pending += 1;
    }
  }

  const access = input.access.map((r) => ({
    ...r,
    events: Number(r.events),
    underPermit: Number(r.underPermit),
    refused: Number(r.refused),
    permits: Number(r.permits),
  }));
  const accessEvents = access.reduce((n, r) => n + r.events, 0);
  const underPermit = access.reduce((n, r) => n + r.underPermit, 0);
  const refusedAccess = access.reduce((n, r) => n + r.refused, 0);

  const byCoverage: Record<string, number> = {};
  for (const label of input.labels) {
    count(byCoverage, label.coverage ?? "not assessed");
  }

  const results = (input.results ?? []).filter((r) =>
    inPeriod(r.communicatedAt, from, to),
  );
  const resultLine = (r: ResultReportRow): string =>
    `${r.title ?? r.resultId}${r.applicant ? ` (${r.applicant}` : ""}${
      r.communicatedAt
        ? `${r.applicant ? ", " : " ("}${day(r.communicatedAt)}`
        : ""
    }${r.applicant || r.communicatedAt ? ")" : ""}${r.url ? ` ${r.url}` : ""}`;
  const publications = results
    .filter((r) => r.kind !== "IT_PRODUCT")
    .map(resultLine);
  const itProducts = results
    .filter((r) => r.kind === "IT_PRODUCT")
    .map(resultLine);

  const otherMeasures = (input.measures ?? []).filter(
    (m) => inPeriod(m.closedAt, from, to) && m.measure && m.measure !== "NONE",
  );
  const fines = otherMeasures.filter((m) => m.measure === "FINE");
  const finesEur = fines.reduce((n, m) => n + Number(m.fineEur ?? 0), 0);

  const permitsEur = apps
    .filter((a) =>
      ["APPROVED", "REVOKED"].includes((a.permitStatus ?? "").toUpperCase()),
    )
    .reduce((n, a) => n + Number(a.feeEur ?? 0), 0);
  const requestsEur = requests.reduce((n, r) => n + Number(r.feeEur ?? 0), 0);

  const averageDays =
    detail.length > 0
      ? Math.round(
          (detail.reduce((n, d) => n + d.days, 0) / detail.length) * 10,
        ) / 10
      : null;

  return {
    article: REPORT_ARTICLE,
    generatedAt: now.toISOString(),
    period: {
      from: from.toISOString(),
      to: to.toISOString(),
      months: REPORT_MONTHS,
    },
    accessBodies: input.bodies,
    items: {
      a: {
        title: ITEM_TITLES.a,
        applications: apps.length,
        byApplicantType,
        permitsIssued,
        refused,
        revoked,
        pending,
        byPurpose,
        dataCategoriesAccessed: [...datasets.values()].sort(
          (x, y) => y.permits - x.permits,
        ),
        healthDataRequests: requests.length,
        healthDataRequestsAnswered: requests.filter((r) =>
          ["APPROVED", "ANSWERED"].includes((r.status ?? "").toUpperCase()),
        ).length,
        resultsCommunicated: results.length,
        note:
          results.length === 0
            ? "No data user has communicated results of its use (Art. 61(4)) in the period."
            : `Results communicated under Art. 61(4): ${
                results.length
              }, of which ${
                results.filter((r) => r.onTime === false).length
              } after the 18 months.`,
      },
      b: {
        title: ITEM_TITLES.b,
        measures,
        otherMeasures,
        administrativeFines: { count: fines.length, amountEur: finesEur },
        note: "Measures are permit revocations under Art. 63(3), and the warnings, exclusions and fines (Art. 64) recorded on closed findings of non-compliance.",
      },
      c: {
        title: ITEM_TITLES.c,
        accessEvents,
        underPermit,
        refused: refusedAccess,
        byUser: access,
        note: "Every access in the secure processing environment is recorded (Art. 73(1)(e)); the figures count the recorded events, those carrying a permit and those refused.",
      },
      d: {
        title: ITEM_TITLES.d,
        audits: [],
        note: "No internal or third-party conformity audit of the secure processing environment is recorded in the graph; the security documentation of the demo is in the repository.",
      },
      e: {
        title: ITEM_TITLES.e,
        requests: 0,
        note: "The opt-out of the patient portal (Art. 71) is exercised in the browser of the demo; no request from a natural person reaches the graph.",
      },
      f: {
        title: ITEM_TITLES.f,
        activities: [],
        note: "Stakeholder engagement is not recorded in the graph.",
      },
      g: {
        title: ITEM_TITLES.g,
        amountEur: permitsEur + requestsEur,
        permitsEur,
        requestsEur,
        note: "Fees under Art. 62 on the data permits issued and the health data requests approved in the period, reduced for the categories of Art. 62(3); the schedule is public on the information page.",
      },
      h: {
        title: ITEM_TITLES.h,
        averageDays,
        basis: detail.length,
        detail,
        note: "From the submission of the application to the first recorded access under the permit; permits without a recorded access are not counted.",
      },
      i: {
        title: ITEM_TITLES.i,
        total: input.labels.length,
        byCoverage,
        labels: input.labels,
        note: "Labels are DataQualityLabelCredential records issued to data holders (Art. 78); the breakdown is by EEHRxF coverage, the category the label records.",
      },
      j: {
        title: ITEM_TITLES.j,
        entries: publications,
        note:
          publications.length === 0
            ? "No publication, policy document or regulatory procedure has been reported by a data user."
            : "As communicated by data users under Art. 61(4).",
      },
      k: {
        title: ITEM_TITLES.k,
        entries: itProducts,
        note:
          itProducts.length === 0
            ? "No IT product has been reported by a data user."
            : "As communicated by data users under Art. 61(4).",
      },
    },
  };
}

/* ── Markdown rendering ─────────────────────────────────────────── */

function day(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : "n/a";
}

function pairs(map: Record<string, number>): string {
  const rows = Object.entries(map);
  return rows.length === 0
    ? "none"
    : rows.map(([k, v]) => `${k}: ${v}`).join(", ");
}

export function toMarkdown(report: ActivityReport): string {
  const { items } = report;
  const bodies =
    report.accessBodies.length === 0
      ? "n/a"
      : report.accessBodies
          .map(
            (b) =>
              `${b.name ?? b.did ?? "?"}${b.country ? ` (${b.country})` : ""}`,
          )
          .join(", ");
  const lines: string[] = [
    `# Activity report of the health data access body`,
    ``,
    `${report.article}. Period ${day(report.period.from)} to ${day(
      report.period.to,
    )}. Generated ${day(report.generatedAt)}. Access bodies: ${bodies}.`,
    ``,
    `## (a) ${items.a.title}`,
    ``,
    `- Applications received: ${items.a.applications} (${pairs(
      items.a.byApplicantType,
    )})`,
    `- Data permits issued: ${items.a.permitsIssued}; refused: ${items.a.refused}; revoked: ${items.a.revoked}; pending: ${items.a.pending}`,
    `- Purposes requested: ${pairs(items.a.byPurpose)}`,
    `- Categories of data accessed: ${
      items.a.dataCategoriesAccessed.length === 0
        ? "none"
        : items.a.dataCategoriesAccessed
            .map((d) => `${d.title ?? d.datasetId} (${d.permits})`)
            .join(", ")
    }`,
    `- Health data requests (Art. 69): ${items.a.healthDataRequests}, answered: ${items.a.healthDataRequestsAnswered}`,
    `- Results communicated by data users: ${items.a.resultsCommunicated}. ${items.a.note}`,
    ``,
    `## (b) ${items.b.title}`,
    ``,
    ...(items.b.measures.length === 0
      ? ["- Measures taken: none"]
      : items.b.measures.map(
          (m) =>
            `- Permit ${m.permitId} of ${m.applicant ?? "?"} revoked on ${day(
              m.revokedAt,
            )}: ${m.reason ?? "no reason recorded"}`,
        )),
    ...items.b.otherMeasures.map(
      (m) =>
        `- ${m.measure}${m.fineEur ? ` (EUR ${m.fineEur})` : ""}: ${
          m.party ?? "unknown party"
        }, ${day(m.closedAt)}${m.note ? `: ${m.note}` : ""}`,
    ),
    `- Administrative fines: ${items.b.administrativeFines.count}, EUR ${items.b.administrativeFines.amountEur}. ${items.b.note}`,
    ``,
    `## (c) ${items.c.title}`,
    ``,
    `- Access events recorded: ${items.c.accessEvents}; under a permit: ${items.c.underPermit}; refused: ${items.c.refused}`,
    ...items.c.byUser.map(
      (u) =>
        `- ${u.consumerName ?? u.consumer ?? "unknown"}: ${u.events} events, ${
          u.permits
        } permit(s), ${u.refused} refused`,
    ),
    `- ${items.c.note}`,
    ``,
    `## (d) ${items.d.title}`,
    ``,
    `- ${
      items.d.audits.length === 0 ? items.d.note : items.d.audits.join("; ")
    }`,
    ``,
    `## (e) ${items.e.title}`,
    ``,
    `- Requests handled: ${items.e.requests}. ${items.e.note}`,
    ``,
    `## (f) ${items.f.title}`,
    ``,
    `- ${
      items.f.activities.length === 0
        ? items.f.note
        : items.f.activities.join("; ")
    }`,
    ``,
    `## (g) ${items.g.title}`,
    ``,
    `- EUR ${items.g.amountEur}. ${items.g.note}`,
    ``,
    `## (h) ${items.h.title}`,
    ``,
    `- Average: ${
      items.h.averageDays === null ? "n/a" : `${items.h.averageDays} days`
    } over ${items.h.basis} permit(s). ${items.h.note}`,
    ...items.h.detail.map(
      (d) =>
        `- ${d.applicationId} (${d.applicant ?? "?"}): applied ${day(
          d.submittedAt,
        )}, first access ${day(d.accessAt)}, ${d.days} days`,
    ),
    ``,
    `## (i) ${items.i.title}`,
    ``,
    `- Labels: ${items.i.total} (by EEHRxF coverage: ${pairs(
      items.i.byCoverage,
    )})`,
    ...items.i.labels.map(
      (l) =>
        `- ${l.datasetId ?? l.credentialId} of ${
          l.holder ?? "?"
        }: completeness ${l.completeness ?? "n/a"}, conformance ${
          l.conformance ?? "n/a"
        }, timeliness ${l.timeliness ?? "n/a"}, coverage ${
          l.coverage ?? "n/a"
        }, assessed ${day(l.assessmentDate)}`,
    ),
    `- ${items.i.note}`,
    ``,
    `## (j) ${items.j.title}`,
    ``,
    `- ${
      items.j.entries.length === 0 ? items.j.note : items.j.entries.join("; ")
    }`,
    ``,
    `## (k) ${items.k.title}`,
    ``,
    `- ${
      items.k.entries.length === 0 ? items.k.note : items.k.entries.join("; ")
    }`,
    ``,
  ];
  return lines.join("\n");
}
