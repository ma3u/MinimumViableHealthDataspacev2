/**
 * The patient overview (issue #271 M1): "which parameters put me at risk,
 * what should I do about them, and who is using my data?"
 *
 * A pure builder over the shapes the existing patient routes return
 * (`/api/patient/profile`, `/api/patient/insights`, `/api/patient/research`,
 * `/api/patient/observations`) plus the holder's access log. The API route
 * gathers those and calls this; the fixture generator calls it with the mock
 * files; the tests call it with both.
 *
 * Article numbers are those of Regulation (EU) 2025/327 as adopted.
 */
import {
  aggregateMonthly,
  isOutOfRange,
  monthRange,
  rankSignals,
  trendOf,
  type AccessEvent,
  type Severity,
} from "./derive";
import { bundleToParameters, type FhirBundle } from "./observations";
import type {
  OverviewLayer,
  OverviewLink,
  OverviewNode,
  OverviewSignal,
  OverviewView,
} from "./types";

export interface ProfileShape {
  patient: { id: string; name: string; gender?: string; birthDate?: string };
  conditions: { code: string; display: string; onsetDate?: string }[];
  medications: { code: string; display: string }[];
  riskScores: Record<
    string,
    { score: number; level: string; factors: string[] }
  >;
  totalConditionCount?: number;
  gdprRights?: Record<string, string>;
}

export interface InsightsShape {
  recommendations: {
    category: string;
    action: string;
    priority: string;
    basedOn: string;
    ehdsArticle?: string;
  }[];
  findings: {
    insightId: string;
    studyId: string;
    finding: string;
    relevantConditions: string[];
    recommendation: string;
    evidenceLevel: string;
  }[];
  privacyNote?: string;
}

export interface StudyShape {
  studyId: string;
  studyName: string;
  institution: string;
  purpose?: string;
  description?: string;
  dataNeeded?: string;
  status?: string;
  participantCount?: number;
  countries?: string[];
  ethicsApproval?: string;
}

export interface ConsentShape {
  consentId: string;
  studyId: string;
  grantedAt: string;
  revoked: boolean;
  revokedAt?: string | null;
  purpose?: string;
  dataScope?: string;
  trustCenterDid?: string;
  trustCenter?: string;
}

export interface ResearchShape {
  programs: StudyShape[];
  consents: ConsentShape[];
  gdprBasis?: string;
}

export interface AccessLogEntry extends AccessEvent {
  consumerName?: string | null;
  providerName?: string | null;
  assetTitle?: string | null;
}

export interface PatientViewInput {
  /** ISO date */
  asOf: string;
  profile: ProfileShape;
  insights: InsightsShape;
  research: ResearchShape;
  observations: FhirBundle;
  /** The holder's access log, last twelve months (Art. 8 until a per-record log exists) */
  accessLog?: AccessLogEntry[];
  /** The holder that treats the patient */
  holder?: { did: string; name: string } | null;
  /** The accesses that read this patient's record (Art. 8), when the log knows */
  recordLog?: AccessLogEntry[];
}

/**
 * What the eight priority parameters mean to a patient, and which risk
 * domain and factor each one drives. Descriptions in plain words; the
 * printed reference range comes from the Observation, never from here.
 */
export const PARAMETER_META: Record<
  string,
  {
    key: string;
    risk?: string;
    factor?: RegExp;
    higherIsWorse?: boolean;
    description: string;
  }
> = {
  "4548-4": {
    key: "HbA1c",
    risk: "diabetes",
    factor: /hba1c/,
    description:
      "The share of haemoglobin with glucose bound to it, which reflects the average blood glucose of the last two to three months. The parameter behind the HbA1c factor of my diabetes risk.",
  },
  "2339-0": {
    key: "Fasting glucose",
    risk: "diabetes",
    description:
      "Blood sugar at the moment of the draw. Only interpretable fasting, since it rises after any meal.",
  },
  "2089-1": {
    key: "LDL cholesterol",
    risk: "cardiovascular",
    description:
      "Cholesterol in low-density lipoproteins, the particles that deposit it in artery walls. The primary target in lipid guidelines, and what the atorvastatin is for.",
  },
  "2093-3": {
    key: "Total cholesterol",
    risk: "cardiovascular",
    description:
      "All cholesterol carried in the blood, in every particle type. A screening figure; LDL carries the risk information.",
  },
  "8480-6": {
    key: "Systolic blood pressure",
    risk: "cardiovascular",
    factor: /hypertension|blood-pressure/,
    description:
      "Pressure in the arteries when the heart contracts. The parameter behind the hypertension diagnosis, and what the lisinopril is for.",
  },
  "8462-4": {
    key: "Diastolic blood pressure",
    risk: "cardiovascular",
    factor: /hypertension|blood-pressure/,
    description: "Pressure in the arteries between heartbeats.",
  },
  "39156-5": {
    key: "BMI",
    risk: "diabetes",
    factor: /bmi|obesity/,
    description:
      "Weight divided by height squared. A population measure; it says nothing about what the weight is made of. The parameter behind the obesity factor.",
  },
  "33914-3": {
    key: "eGFR",
    risk: "diabetes",
    higherIsWorse: false,
    description:
      "The kidney's filtration rate, estimated from creatinine with age and sex. An estimate, not a measurement. Watched because diabetes and hypertension both wear on the kidney.",
  },
};

const LEVEL: Record<string, Severity> = {
  high: "bad",
  moderate: "warn",
  low: "ok",
};

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const fmtDate = (iso?: string | null) =>
  iso ? String(iso).slice(0, 10) : "n/a";

export function buildPatientView(input: PatientViewInput): OverviewView {
  const { profile, insights, research, observations } = input;
  const layers: OverviewLayer[] = [
    {
      id: "prevent",
      name: "Prevention: what to do next",
      z: 2,
      color: "#fbbf24",
    },
    {
      id: "risk",
      name: "My risks and the parameters behind them",
      z: 1,
      color: "#f97316",
    },
    { id: "me", name: "My record (FHIR R4)", z: 0, color: "#86efac" },
    {
      id: "use",
      name: "Who uses my data, under which consent",
      z: -1,
      color: "#a78bfa",
    },
  ];
  const nodes: OverviewNode[] = [];
  const links: OverviewLink[] = [];
  const signals: OverviewSignal[] = [];
  /** Measured parameters rank ahead of the risk domains at equal severity */
  const paramSignals: OverviewSignal[] = [];
  const ids = new Set<string>();
  const add = (n: OverviewNode) => {
    if (ids.has(n.id)) return n;
    ids.add(n.id);
    nodes.push(n);
    return n;
  };
  const link = (
    source: string,
    target: string,
    o: Partial<OverviewLink> = {},
  ) => links.push({ source, target, ...o });

  // ── me ────────────────────────────────────────────────────────────────────
  const me = profile.patient;
  add({
    id: "me",
    label: me.name,
    layer: "me",
    kind: "Patient",
    size: 4,
    color: "#fbbf24",
    pin: [0, 0],
    title: me.name,
    sub: `born ${fmtDate(me.birthDate)}, ${
      profile.totalConditionCount ?? profile.conditions.length
    } diagnoses on record`,
    facts: Object.entries(profile.gdprRights ?? {}).map(([k, v]) => [k, v]),
    article: "Art. 3: access to my own electronic health data",
    links: [
      { href: "/patient/profile", text: "My profile" },
      { href: "/patient/insights", text: "My insights" },
    ],
  });

  // ── risk domains and their factors ────────────────────────────────────────
  const factorNodes = new Map<string, string>(); // factor id -> factor text
  for (const [key, r] of Object.entries(profile.riskScores ?? {})) {
    const id = `risk:${key}`;
    const sev = LEVEL[r.level] ?? "info";
    add({
      id,
      label: `${key} risk ${Math.round(r.score * 100)} %`,
      layer: "risk",
      kind: "Risk",
      size: 3,
      status: sev,
      pulse: r.level === "high",
      title: `${key[0].toUpperCase()}${key.slice(1)} risk`,
      sub: `score ${r.score}, level ${r.level}`,
      facts: r.factors.map((f, i) => [`factor ${i + 1}`, f]),
      article: "Derived from my own record (primary use). Not a diagnosis.",
    });
    link("me", id, { kind: "carries", status: sev, width: 1.4, distance: 70 });
    signals.push({
      severity: sev,
      code: `risk-${key}`,
      nodeId: id,
      text: `${key} risk is ${r.level} (${Math.round(
        r.score * 100,
      )} %): ${r.factors.join(", ")}`,
      article: "Art. 3 access, Art. 14 priority data categories",
    });
    for (const f of r.factors) {
      const fid = `fac:${slug(f)}`;
      if (!factorNodes.has(fid)) {
        factorNodes.set(fid, f);
        add({
          id: fid,
          label: f,
          layer: "risk",
          kind: "Risk factor",
          size: 1.4,
          status: "warn",
          title: f,
          sub: "risk factor",
          facts: [["drives", `${key} risk`]],
        });
      }
      link(fid, id, { kind: "drives", status: "warn", distance: 40 });
    }
  }

  // ── my record: diagnoses and medications ──────────────────────────────────
  const condByWord = new Map<string, string>();
  for (const c of profile.conditions) {
    const id = `cond:${c.code}`;
    add({
      id,
      label: c.display,
      layer: "me",
      kind: "Diagnosis",
      size: 1.2,
      color: "#86efac",
      title: c.display,
      sub: `since ${fmtDate(c.onsetDate)}`,
      facts: [["code", c.code]],
      article: "FHIR R4 Condition, SNOMED CT or ICD-10 coded",
    });
    link("me", id, { kind: "diagnosis", color: "#4ade80", distance: 55 });
    condByWord.set(c.display.toLowerCase(), id);
  }
  const matchCond = (text: string): string | undefined => {
    const t = text.toLowerCase();
    for (const [w, id] of condByWord) {
      const head = w.split(" ")[0].replace(/[()]/g, "");
      if (head.length >= 4 && t.includes(head)) return id;
    }
    if (/t2d|type 2|diabetes/.test(t)) {
      return condByWord.get("diabetes mellitus type 2");
    }
    if (/bmi|obesity/.test(t)) {
      return [...condByWord.entries()].find(([w]) =>
        w.startsWith("obesity"),
      )?.[1];
    }
    return undefined;
  };
  for (const [fid, f] of factorNodes) {
    const cid = matchCond(f);
    if (cid) {
      link(cid, fid, {
        kind: "behind",
        color: "#fb923c",
        distance: 60,
        particles: 1,
      });
    }
  }
  const medTarget: [RegExp, string][] = [
    [/metformin/i, condByWord.get("diabetes mellitus type 2") ?? "me"],
    [/lisinopril|ramipril|amlodipine/i, condByWord.get("hypertension") ?? "me"],
    [/salbutamol|budesonide/i, condByWord.get("asthma") ?? "me"],
    [/statin/i, ids.has("risk:cardiovascular") ? "risk:cardiovascular" : "me"],
  ];
  for (const m of profile.medications) {
    const id = `med:${m.code}`;
    add({
      id,
      label: m.display.split(" ")[0],
      layer: "me",
      kind: "Medication",
      size: 1,
      color: "#c4b5fd",
      title: m.display,
      sub: "FHIR R4 MedicationRequest",
      facts: [["RxNorm", m.code]],
    });
    const t = medTarget.find(([re]) => re.test(m.display))?.[1] ?? "me";
    link(id, t, { kind: "treats", color: "#a78bfa", distance: 45 });
  }

  // ── prevention: recommendations and findings ──────────────────────────────
  const riskTarget = (text: string) => {
    if (
      /cardio|statin|lipid|blood pressure/i.test(text) &&
      ids.has("risk:cardiovascular")
    ) {
      return "risk:cardiovascular";
    }
    if (ids.has("risk:diabetes")) return "risk:diabetes";
    return "me";
  };
  (insights.recommendations ?? []).forEach((r, i) => {
    const id = `rec:${i}`;
    const sev: Severity = r.priority === "high" ? "warn" : "info";
    add({
      id,
      label: r.action.replace(/\.$/, ""),
      layer: "prevent",
      kind: "Recommendation",
      size: 2.4,
      status: sev,
      pulse: r.priority === "high",
      title: r.action,
      sub: `${r.category}, priority ${r.priority}`,
      facts: [["based on", r.basedOn]],
      article:
        "Aggregate finding from a secure processing environment, Art. 73",
      links: [{ href: "/patient/insights", text: "My insights" }],
    });
    link(id, riskTarget(r.basedOn + r.action), {
      kind: "addresses",
      status: sev,
      distance: 80,
      arrow: true,
    });
    signals.push({
      severity: sev,
      code: "recommendation",
      nodeId: id,
      text: `${r.priority} priority: ${r.action}`,
      article:
        "Art. 73 SPE result, Art. 58 obligations towards natural persons",
    });
  });
  for (const f of insights.findings ?? []) {
    const id = `find:${f.insightId}`;
    add({
      id,
      label: f.recommendation.replace(/\.$/, "") || f.finding.slice(0, 60),
      layer: "prevent",
      kind: "Study finding",
      size: 1.8,
      status: "info",
      title: f.finding,
      sub: `evidence ${f.evidenceLevel}, from ${f.studyId}`,
      facts: [["applies to", (f.relevantConditions ?? []).join(", ")]],
      article: insights.privacyNote,
    });
    for (const c of f.relevantConditions ?? []) {
      const cid = matchCond(c);
      if (cid) {
        link(cid, id, { kind: "informs", color: "#38bdf8", distance: 90 });
      }
    }
  }

  // ── who uses my data ──────────────────────────────────────────────────────
  const programs = new Map<string, StudyShape>();
  for (const p of research.programs ?? []) programs.set(p.studyId, p);
  for (const c of research.consents ?? []) {
    if (!programs.has(c.studyId)) {
      programs.set(c.studyId, {
        studyId: c.studyId,
        studyName: c.studyId,
        institution: "",
      });
    }
  }
  let activeConsents = 0;
  let firstConsentId: string | null = null;
  for (const p of programs.values()) {
    const id = `study:${p.studyId}`;
    const consent = (research.consents ?? []).find(
      (c) => c.studyId === p.studyId,
    );
    add({
      id,
      label: p.studyName,
      layer: "use",
      kind: "Study",
      size: 2.2,
      status: consent && !consent.revoked ? "ok" : "info",
      title: p.studyName,
      sub: [
        p.institution,
        p.participantCount != null
          ? `${p.participantCount.toLocaleString("en")} participants`
          : "",
        (p.countries ?? []).join(", "),
      ]
        .filter(Boolean)
        .join(", "),
      description: p.description,
      facts: [
        ["needs", p.dataNeeded ?? "n/a"],
        ["status", p.status ?? "n/a"],
        ["ethics", p.ethicsApproval ?? "n/a"],
      ],
      article: consent
        ? "My consent is on file and can be withdrawn (Art. 71 opt-out from secondary use)"
        : "Not joined. Art. 71: secondary use continues unless I opt out; a study invitation is a separate consent",
      links: [{ href: "/patient/research", text: "Research programmes" }],
    });
    for (const f of insights.findings ?? []) {
      if (f.studyId === p.studyId) {
        link(`find:${f.insightId}`, id, {
          kind: "from",
          color: "#a78bfa",
          distance: 120,
        });
      }
    }
    if (p.institution) {
      const org = `org:${slug(p.institution)}`;
      add({
        id: org,
        label: p.institution,
        layer: "use",
        kind: "Organisation",
        size: 1.6,
        color: "#f97316",
        title: p.institution,
        sub: "health data user",
      });
      link(id, org, { kind: "conducted by", color: "#f97316", distance: 45 });
    }
    if (consent) {
      const cid = `consent:${consent.consentId}`;
      firstConsentId ??= cid;
      if (!consent.revoked) activeConsents++;
      add({
        id: cid,
        label: consent.revoked
          ? `opted out ${fmtDate(consent.revokedAt)}`
          : `consent ${fmtDate(consent.grantedAt)}`,
        layer: "use",
        kind: "Consent",
        size: 1.2,
        status: consent.revoked ? "none" : "ok",
        title: consent.consentId,
        sub: consent.dataScope ?? consent.purpose ?? "",
        facts: [
          ["granted", fmtDate(consent.grantedAt)],
          [
            "state",
            consent.revoked
              ? `withdrawn on ${fmtDate(consent.revokedAt)} (Art. 71 opt-out)`
              : "active",
          ],
          [
            "pseudonymised by",
            consent.trustCenter ?? consent.trustCenterDid ?? "trust centre",
          ],
        ],
        article: research.gdprBasis ?? "Art. 71 opt-out; GDPR Art. 9(2)(j)",
      });
      link("me", cid, {
        kind: "consent",
        status: consent.revoked ? "none" : "ok",
        particles: consent.revoked ? 0 : 2,
        distance: 90,
      });
      link(cid, id, {
        kind: "consent",
        status: consent.revoked ? "none" : "ok",
        particles: consent.revoked ? 0 : 2,
        distance: 50,
      });
      if (consent.revoked) {
        signals.push({
          severity: "info",
          code: "opt-out",
          nodeId: cid,
          text: `I opted out of ${p.studyName} on ${fmtDate(
            consent.revokedAt,
          )}; nothing new of mine reaches it.`,
          article: "Art. 71 opt-out from secondary use",
        });
      }
      const tcName = consent.trustCenter ?? consent.trustCenterDid;
      if (tcName) {
        const tc = `tc:${slug(tcName)}`;
        add({
          id: tc,
          label: tcName,
          layer: "use",
          kind: "Trust centre",
          size: 1.1,
          color: "#ef4444",
          title: "Trust centre",
          sub: tcName,
          article: "Pseudonymisation before the SPE, Art. 73",
        });
        link(cid, tc, {
          kind: "pseudonymised by",
          color: "#ef4444",
          distance: 40,
        });
      }
    } else if (p.dataNeeded) {
      const rel = matchCond(p.dataNeeded);
      if (rel) {
        link(rel, id, { kind: "matches", status: "info", distance: 130 });
        signals.push({
          severity: "info",
          code: "study-match",
          nodeId: id,
          text: `${p.studyName} is ${p.status ?? "open"} and matches my ${
            nodes.find((n) => n.id === rel)?.label ?? "record"
          }`,
          article: "Art. 71 opt-out, GDPR Art. 9(2)(j)",
        });
      }
    }
  }
  signals.push({
    severity: "ok",
    code: "consent-summary",
    nodeId: firstConsentId ?? "me",
    text: `${activeConsents} consents active, all revocable. ${
      (insights.privacyNote ?? "").split(".")[0]
    }`.trim(),
    article: "Art. 8: who accessed my data, Art. 71 opt-out",
  });

  // ── the access log of my holder (Art. 8) ──────────────────────────────────
  const log = input.accessLog ?? [];
  const record = input.recordLog ?? [];
  const useRecord = record.length > 0;
  if (input.holder) {
    const hid = `holder:${slug(input.holder.did)}`;
    add({
      id: hid,
      label: input.holder.name,
      layer: "use",
      kind: "Health data holder",
      size: 1.8,
      color: "#38bdf8",
      title: input.holder.name,
      sub: "keeps my record and the access log",
      article:
        "Art. 60 duties of health data holders, Art. 73(1)(e) access log",
    });
    link("me", hid, { kind: "treated at", color: "#38bdf8", distance: 70 });
    const months = monthRange(input.asOf, 12);
    const served = (useRecord ? record : log).filter(
      (e) => (e.statusCode ?? 200) < 400,
    );
    const byConsumer = aggregateMonthly(served, months, (e) => e.consumerDid);
    const names = new Map(
      served.map((e) => [e.consumerDid, e.consumerName ?? e.consumerDid]),
    );
    for (const [did, series] of Object.entries(byConsumer)) {
      const id = `access:${slug(did)}`;
      const total = series.reduce((a, p) => a + p.value, 0);
      add({
        id,
        label: names.get(did) ?? did,
        layer: "use",
        kind: "Data user",
        size: 1.4,
        status: "info",
        title: names.get(did) ?? did,
        sub: useRecord
          ? `read my record ${total} times in the last 12 months`
          : `${total} accesses to my holder's data in the last 12 months`,
        series,
        unit: useRecord ? "reads" : "accesses",
        measure: useRecord
          ? "Reads of my record per month"
          : "Accesses per month",
        higherIsWorse: true,
        facts: [["did", did]],
        article: useRecord
          ? "Art. 8: information on who accessed my data, from the reads of my record in the holder's Art. 73(1)(e) log"
          : "Art. 8: information on who accessed my data. The log is the holder's, per dataset; no read of my record is on file.",
      });
      link(hid, id, {
        kind: "accessed by",
        color: "#38bdf8",
        distance: 60,
        particles: 1,
      });
    }
    const consumers = Object.keys(byConsumer).length;
    signals.push({
      severity: "info",
      code: "access-log",
      nodeId: hid,
      text: useRecord
        ? `${consumers} organisations read my record ${served.length} times in the last 12 months. Click to see who.`
        : consumers > 0
          ? `${consumers} organisations read data from ${input.holder.name} in the last 12 months (${served.length} accesses); no read of my record is on file. Click to see who.`
          : `No access to ${input.holder.name}'s data recorded in the last 12 months.`,
      article: "Art. 8 information on access, Art. 73(1)(e) log",
    });
  }

  // ── measured values over time ─────────────────────────────────────────────
  // In the order of PARAMETER_META, so HbA1c leads whatever the Bundle's order
  const byCode = new Map(
    bundleToParameters(observations).map((p) => [p.code, p]),
  );
  const params = Object.keys(PARAMETER_META)
    .map((code) => byCode.get(code))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));
  let paramCount = 0;
  let firstParam: string | null = null;
  for (const p of params) {
    const meta = PARAMETER_META[p.code];
    if (!meta || p.series.length === 0) continue;
    paramCount++;
    const trend = trendOf(p.series, {
      range: p.range,
      higherIsWorse: meta.higherIsWorse !== false,
    });
    const last = p.series[p.series.length - 1];
    const first = p.series[0];
    const sev: Severity =
      trend?.severity ?? (isOutOfRange(last.value, p.range) ? "warn" : "ok");
    const id = `param:${p.code}`;
    firstParam ??= id;
    const points = p.series.map((m) => {
      const out = isOutOfRange(m.value, p.range);
      return {
        id: `obs:${m.id}`,
        label: `${m.date.slice(0, 7)} · ${m.value}`,
        layer: "me",
        kind: "Measurement",
        size: 0.9,
        color: out ? "#f59e0b" : "#86efac",
        title: `${meta.key} on ${m.date}`,
        sub: `${m.value} ${p.unit}${
          out ? ", outside the printed range" : ", within the printed range"
        }`,
        facts: [
          ["LOINC", p.code],
          ["reference", p.range?.text ?? "n/a"],
          ["source", p.performer ?? "lab"],
          ["resource", `Observation/${m.id}`],
        ] as [string, string][],
        article:
          "One FHIR R4 Observation. Art. 3: I can read and export it; Art. 6: portable.",
      } satisfies OverviewNode;
    });
    const expandLinks: OverviewLink[] = [];
    points.forEach((x, i) => {
      expandLinks.push({
        source: id,
        target: x.id,
        kind: "measured",
        color: "#64748b",
        distance: 45,
      });
      if (i > 0) {
        expandLinks.push({
          source: points[i - 1].id,
          target: x.id,
          kind: "next",
          color: "#93c5fd",
          distance: 28,
          arrow: true,
          particles: 1,
        });
      }
    });
    add({
      id,
      label: `${meta.key} ${last.value} ${p.unit}`,
      layer: "risk",
      kind: "Parameter",
      size: 2,
      status: sev,
      pulse: sev === "bad",
      series: p.series.map(({ date, value }) => ({ date, value })),
      unit: p.unit,
      measure: meta.key,
      range: p.range,
      higherIsWorse: meta.higherIsWorse !== false,
      title: p.display,
      sub: `LOINC ${p.code}, ${p.series.length} measurements, ${
        p.performer ?? "lab"
      }`,
      description: meta.description,
      facts: [
        ["latest", `${last.value} ${p.unit} on ${last.date}`],
        ["first", `${first.value} ${p.unit} on ${first.date}`],
        ["reference", p.range?.text ?? "n/a"],
      ],
      article:
        "Art. 14 priority category: laboratory results. FHIR R4 Observation with LOINC code; the range is the one printed on the report, never app-generated.",
      links: [{ href: "/patient/profile", text: "My profile" }],
      expand: { nodes: points, links: expandLinks },
    });
    const factorId = meta.factor
      ? [...factorNodes.keys()].find((fid) => meta.factor!.test(fid))
      : undefined;
    const riskId =
      meta.risk && ids.has(`risk:${meta.risk}`)
        ? `risk:${meta.risk}`
        : undefined;
    if (factorId) {
      link(id, factorId, {
        kind: "behind",
        status: sev,
        distance: 40,
        particles: 1,
      });
    } else if (riskId) {
      link(id, riskId, {
        kind: "drives",
        status: sev,
        distance: 60,
        particles: 1,
      });
    } else link(id, "me", { kind: "measured", status: sev, distance: 60 });
    if (sev !== "ok" && trend) {
      paramSignals.push({
        severity: sev,
        code: trend.outOfRange ? "parameter-out-of-range" : "parameter-trend",
        nodeId: id,
        text: `${meta.key} ${trend.dir}${
          trend.dir === "stable"
            ? ""
            : ` from ${first.value} to ${last.value} ${p.unit}`
        }${trend.outOfRange ? ", outside the printed range" : ""}`,
        article:
          "Art. 14 laboratory results; click to see the trend and unfold the measurements",
      });
    }
  }
  if (paramCount > 0) {
    signals.push({
      severity: "info",
      code: "parameters",
      nodeId: firstParam ?? "me",
      text: `${paramCount} parameters from ${
        observations.total ?? observations.entry.length
      } FHIR Observations. Click a parameter to see its trend and unfold the single measurements.`,
      article:
        "Art. 14 priority category: laboratory results; Art. 6 portability",
    });
  }

  const known = new Set(nodes.map((n) => n.id));
  return {
    persona: "patient",
    asOf: input.asOf,
    me: { id: me.id, name: me.name },
    title: "My health, in one view",
    question:
      "Which parameters put me at risk, what should I do about them, and who is using my data?",
    article: "Regulation (EU) 2025/327 Art. 3, 8, 14, 71, 73",
    layers,
    nodes,
    links: links.filter((l) => known.has(l.source) && known.has(l.target)),
    signals: rankSignals([...paramSignals, ...signals]),
    legend: [
      { color: "#ef4444", text: "high risk / act" },
      { color: "#f59e0b", text: "moderate / watch" },
      { color: "#38bdf8", text: "information" },
      { color: "#22c55e", text: "consented, in order" },
      { color: "#86efac", text: "diagnosis" },
      { color: "#c4b5fd", text: "medication" },
    ],
    dataNote: "Every patient and organisation shown is fictional.",
  };
}

/**
 * The patient a demo login owns. The demo users patient1 and patient2 map to
 * the seeded records P1 and P2; anyone else is not a patient here.
 */
export function ownPatientId(username?: string | null): string | null {
  if (username === "patient1") return "P1";
  if (username === "patient2") return "P2";
  return null;
}
