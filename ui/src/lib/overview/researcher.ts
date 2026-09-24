/**
 * The researcher overview (issue #271 M4): "what am I allowed to use today,
 * what is pending or blocked, and what am I missing?"
 *
 * Built from the permit register, the compliance matrix, the credential
 * wallet, the catalogue, the study registry with its enrolment, and the
 * researcher's own access events. The state of every permit, application
 * and credential comes from `derive.ts`; relevance of other studies and
 * datasets is token overlap with the researcher's own data needs (the
 * first cut, Art. 77 variable-level descriptions are still missing).
 *
 * Article numbers are those of Regulation (EU) 2025/327 as adopted.
 */
import {
  aggregateMonthly,
  chainOfTrust,
  credentialState,
  decisionClock,
  monthRange,
  permitState,
  rankSignals,
  type SeriesPoint,
  type Severity,
} from "./derive";
import {
  holderOf,
  matrixPermit,
  registerPermit,
  type ContractShape,
  type CredentialEntry,
  type HdabAccessEvent,
  type MatrixRow,
  type ParticipantShape,
  type RegisterEntry,
} from "./hdab";
import {
  completenessFact,
  descriptionCompleteness,
  type CatalogEntryLike,
} from "./completeness";
import { attachSeries, raiseStatus } from "./series";
import type {
  OverviewLayer,
  OverviewLink,
  OverviewNode,
  OverviewSignal,
  OverviewView,
} from "./types";

export interface CatalogDataset extends CatalogEntryLike {
  id: string;
  title: string;
}

export interface StudyRecord {
  studyId: string;
  studyName: string;
  institution?: string | null;
  institutionDid?: string | null;
  status?: string | null;
  dataNeeded?: string | null;
  description?: string | null;
  countries?: string[] | null;
  participantCount?: number | null;
  /** Enrolment snapshots, oldest first */
  enrolment?: SeriesPoint[] | null;
}

export interface ResearcherViewInput {
  asOf: string;
  me: { did: string; name: string };
  consumers: ParticipantShape[];
  datasets: CatalogDataset[];
  matrix: MatrixRow[];
  register: RegisterEntry[];
  credentials: CredentialEntry[];
  contracts: ContractShape[];
  /** The researcher's own access events */
  events: HdabAccessEvent[];
  studies: StudyRecord[];
}

const fmtDate = (iso?: string | null) =>
  iso ? String(iso).slice(0, 10) : "n/a";

/** Five-letter stems of the words that carry meaning in a data need. */
export function stems(text: string | null | undefined): Set<string> {
  const stop = new Set([
    "fhir",
    "omop",
    "data",
    "values",
    "record",
    "records",
    "cohort",
    "study",
    "patient",
    "patients",
    "health",
    "using",
    "across",
    "with",
    "from",
  ]);
  const out = new Set<string>();
  for (const w of (text ?? "").toLowerCase().split(/[^a-z0-9]+/)) {
    if (w.length >= 5 && !stop.has(w)) out.add(w.slice(0, 5));
  }
  return out;
}

/** How many stems two texts share. */
export function overlap(a: Set<string>, b: Set<string>): string[] {
  return [...a].filter((s) => b.has(s));
}

export function buildResearcherView(input: ResearcherViewInput): OverviewView {
  const { me, asOf } = input;
  const months = monthRange(asOf, 12);
  const layers: OverviewLayer[] = [
    {
      id: "mine",
      name: "My permits, applications, requests",
      z: 2,
      color: "#fbbf24",
    },
    { id: "allowed", name: "What I may use today", z: 1, color: "#22c55e" },
    { id: "me", name: "My studies and my wallet", z: 0, color: "#38bdf8" },
    {
      id: "other",
      name: "Other studies and datasets near mine",
      z: -1,
      color: "#a78bfa",
    },
    { id: "time", name: "Over time: unfolded months", z: -2, color: "#93c5fd" },
  ];
  const nodes: OverviewNode[] = [];
  const links: OverviewLink[] = [];
  const signals: OverviewSignal[] = [];
  const byId = new Map<string, OverviewNode>();
  const add = (n: OverviewNode) => {
    const had = byId.get(n.id);
    if (had) return had;
    byId.set(n.id, n);
    nodes.push(n);
    return n;
  };
  const link = (
    source: string,
    target: string,
    o: Partial<OverviewLink> = {},
  ) => links.push({ source, target, ...o });

  const participants = new Map(input.consumers.map((p) => [p.id, p]));
  const nameOf = (did: string) => participants.get(did)?.name ?? did;
  const datasetById = new Map(input.datasets.map((d) => [d.id, d]));
  const events = input.events.filter((e) => e.consumerDid === me.did);
  const served = events.filter((e) => (e.statusCode ?? 200) < 400);
  const refused = events.filter((e) => (e.statusCode ?? 200) >= 400);
  const credHolder = new Map(
    input.credentials.map((c) => [
      c.credentialId,
      holderOf(c, [...participants.values()]),
    ]),
  );
  const myCreds = input.credentials.filter(
    (c) => credHolder.get(c.credentialId) === me.did,
  );
  const myStudies = input.studies.filter(
    (s) =>
      s.institutionDid === me.did ||
      (!s.institutionDid && s.institution === me.name) ||
      s.institution === me.name,
  );
  const otherStudies = input.studies.filter((s) => !myStudies.includes(s));
  const myNeeds = new Set<string>();
  for (const s of myStudies) {
    for (const t of stems(s.dataNeeded)) myNeeds.add(t);
  }

  // ── me ────────────────────────────────────────────────────────────────────
  const meNode = add({
    id: "me",
    label: me.name,
    layer: "me",
    kind: "Health data user",
    size: 4,
    color: "#fbbf24",
    pin: [0, 0],
    title: me.name,
    sub: `health data user, ${myStudies.length} studies, ${myCreds.length} credentials in the wallet`,
    facts: [
      ["did", me.did],
      [
        "accesses",
        `${served.length} served, ${refused.length} refused in 12 months`,
      ],
    ],
    article:
      "Art. 53 permitted purposes, Art. 54 prohibited ones, Art. 61 duties of health data users, Art. 66 minimisation",
    links: [
      { href: "/data/discover", text: "Discover datasets" },
      { href: "/tasks", text: "My applications" },
      { href: "/query", text: "Secure processing environment" },
    ],
  });
  if (served.length > 0) {
    attachSeries(
      meNode,
      {
        series: aggregateMonthly(served, months, () => "x")["x"],
        unit: "accesses",
        measure: "My accesses per month",
        higherIsWorse: false,
      },
      "time",
    );
  }

  // ── my own chain of trust ─────────────────────────────────────────────────
  const myRegister = input.register.filter((e) => e.applicantDid === me.did);
  const row = input.matrix.find((r) => r.consumerId === me.did);
  const permits = myRegister
    .filter((e) => e.kind === "application")
    .map(registerPermit);
  const fromMatrix = matrixPermit(row);
  if (fromMatrix && !permits.some((x) => x.permitId === fromMatrix.permitId)) {
    permits.push(fromMatrix);
  }
  const contracts = [
    ...input.contracts.filter(
      (c) => !c.consumerDid || c.consumerDid === me.did,
    ),
    ...(row?.hasContract
      ? served
          .filter((e) => e.contractId)
          .map((e) => ({ contractId: e.contractId! }))
      : []),
  ];
  const chain = chainOfTrust(
    {
      consumerDid: me.did,
      consumerName: "I",
      credentials: myCreds,
      permits,
      contracts,
      events,
    },
    asOf,
  );
  raiseStatus(meNode, chain.severity === "ok" ? "ok" : chain.severity);
  for (const f of chain.findings) {
    signals.push({
      severity: f.severity,
      code: f.code,
      nodeId: "me",
      text: f.text
        .replace(/^I: /, "My chain of trust: ")
        .replace(/^I presents/, "I present"),
      article: f.article,
    });
  }

  // ── my wallet ─────────────────────────────────────────────────────────────
  for (const c of myCreds) {
    const state = credentialState(c, asOf);
    const isLabel = /quality/i.test(c.credentialType);
    const sev: Severity | "none" =
      state === "expired" || state === "revoked"
        ? "bad"
        : state === "expiring"
          ? "warn"
          : "ok";
    const id = `vc:${c.credentialId}`;
    add({
      id,
      label: `${c.credentialType.replace(/Credential$/, "")} ${state}`,
      layer: "me",
      kind: isLabel ? "Quality label" : "Credential",
      size: 1.3,
      status: sev,
      pulse: sev === "bad",
      title: c.credentialType,
      sub: `${state}${
        c.expiresAt
          ? `, ${state === "expired" ? "since" : "until"} ${fmtDate(
              c.expiresAt,
            )}`
          : ""
      }`,
      facts: [
        ["id", c.credentialId],
        ["issued", fmtDate(c.issuedAt)],
        ["expires", fmtDate(c.expiresAt)],
        ...(c.purpose ? [["purpose", c.purpose] as [string, string]] : []),
      ],
      article: /purpose/i.test(c.credentialType)
        ? "Art. 53(1): the purpose I may process data for; presented before every access (DCP v1.0)"
        : "DCP v1.0 credential: who I am in the dataspace",
      links: [{ href: "/credentials", text: "My wallet" }],
    });
    link("me", id, { kind: "holds", status: sev, distance: 45 });
    if (
      sev !== "ok" &&
      !chain.findings.some(
        (f) =>
          f.code.startsWith("credential") || f.code.startsWith("access-after"),
      )
    ) {
      signals.push({
        severity: sev,
        code:
          state === "expiring" ? "credential-expiring" : "credential-expired",
        nodeId: id,
        text: `My ${c.credentialType.replace(
          /Credential$/,
          "",
        )} credential is ${state}${
          c.expiresAt ? ` (${fmtDate(c.expiresAt)})` : ""
        }.`,
        article: "Art. 53(1), Art. 61(1)",
      });
    }
  }

  // ── my permits, applications, requests ────────────────────────────────────
  const allowed = new Set<string>();
  for (const e of myRegister) {
    const isRequest = e.kind === "request";
    const clock = decisionClock(
      {
        submittedAt: e.submittedAt ?? asOf,
        decidedAt: e.decidedAt,
        decisionDue: e.decisionDue,
      },
      asOf,
    );
    const state = registerPermit(e);
    const ps = permitState(state, asOf);
    const id = `${isRequest ? "req" : "app"}:${e.applicationId}`;
    const status: Severity = !clock.decided
      ? clock.overdue
        ? "warn"
        : "info"
      : ps === "valid"
        ? "ok"
        : ps === "expiring"
          ? "warn"
          : ps === "refused" || ps === "revoked" || ps === "expired"
            ? "bad"
            : "info";
    add({
      id,
      label: `${
        isRequest
          ? "request"
          : ps === "valid" || ps === "expiring"
            ? "permit"
            : "application"
      } ${e.datasetTitle ?? e.datasetId ?? e.applicationId}`,
      layer: "mine",
      kind: isRequest
        ? "Health data request"
        : clock.decided
          ? ps === "refused"
            ? "Refusal"
            : "Data permit"
          : "Access application",
      size: 1.8,
      status,
      pulse: status === "bad",
      title: e.applicationId,
      sub: `${e.accessBody ?? "access body"}, ${e.outcome ?? "pending"}${
        e.validUntil ? `, valid until ${fmtDate(e.validUntil)}` : ""
      }`,
      facts: [
        ["submitted", fmtDate(e.submittedAt)],
        [
          "decision due",
          `${clock.dueAt} (${
            clock.decided
              ? "decided " + fmtDate(e.decidedAt)
              : clock.overdue
                ? `${-clock.daysLeft} days overdue`
                : `${clock.daysLeft} days left`
          })`,
        ],
        ["purpose", e.purpose ?? "n/a"],
        ["dataset", e.datasetTitle ?? e.datasetId ?? "n/a"],
        ...(e.justification
          ? [["justification", e.justification] as [string, string]]
          : []),
      ],
      article: isRequest
        ? "Art. 69 health data request: an anonymised statistical answer within three months"
        : "Art. 67 application, Art. 68 permit: the access body decides within three months of a complete application",
      links: [
        { href: "/tasks", text: "My applications" },
        { href: "/permits", text: "Public register" },
      ],
    });
    link("me", id, {
      kind: "applied",
      color: "#94a3b8",
      distance: 90,
      arrow: true,
    });
    if (e.datasetId) {
      const dsId = `ds:${e.datasetId}`;
      if (ps === "valid" || ps === "expiring") allowed.add(e.datasetId);
      link(id, dsId, {
        kind: ps === "valid" || ps === "expiring" ? "covers" : "requested",
        status,
        distance: 80,
      });
    }
    if (!clock.decided) {
      signals.push({
        severity: clock.overdue ? "warn" : "info",
        code: clock.overdue ? "decision-overdue" : "decision-due",
        nodeId: id,
        text: clock.overdue
          ? `${
              e.accessBody ?? "The access body"
            } is ${-clock.daysLeft} days past the deadline on my ${
              isRequest ? "request" : "application"
            } for ${e.datasetTitle ?? e.datasetId}.`
          : `My ${isRequest ? "request" : "application"} for ${
              e.datasetTitle ?? e.datasetId
            } is pending; decision due ${clock.dueAt}, ${
              clock.daysLeft
            } days left.`,
        article: isRequest ? "Art. 69(4)" : "Art. 68(4)",
      });
    } else if (ps === "expiring") {
      signals.push({
        severity: "warn",
        code: "permit-expiring",
        nodeId: id,
        text: `My permit for ${
          e.datasetTitle ?? e.datasetId
        } lapses on ${fmtDate(e.validUntil)}; apply for renewal.`,
        article: "Art. 68(6)",
      });
    } else if (ps === "refused") {
      signals.push({
        severity: "warn",
        code: "application-refused",
        nodeId: id,
        text: `My application for ${e.datasetTitle ?? e.datasetId} was refused${
          e.justification ? `: ${e.justification}` : ""
        }.`,
        article: "Art. 68(3), Art. 57(1)(j)(iii)",
      });
    }
  }
  if (
    fromMatrix &&
    row?.datasetId &&
    !myRegister.some((e) => e.permitId === fromMatrix.permitId)
  ) {
    const ps = permitState(fromMatrix, asOf);
    if (ps === "valid" || ps === "expiring") allowed.add(row.datasetId);
    const id = `permit:${fromMatrix.permitId}`;
    add({
      id,
      label: `permit ${datasetById.get(row.datasetId)?.title ?? row.datasetId}`,
      layer: "mine",
      kind: "Data permit",
      size: 1.8,
      status: ps === "valid" ? "ok" : ps === "expiring" ? "warn" : "bad",
      title: fromMatrix.permitId ?? id,
      sub: `${ps}${
        row.validUntil ? `, valid until ${fmtDate(row.validUntil)}` : ""
      }`,
      facts: [
        ["state", ps],
        ["dataset", datasetById.get(row.datasetId)?.title ?? row.datasetId],
      ],
      article: "Art. 68 data permit",
      links: [{ href: "/permits", text: "Public register" }],
    });
    link("me", id, { kind: "holds", color: "#94a3b8", distance: 90 });
    link(id, `ds:${row.datasetId}`, {
      kind: "covers",
      status: "ok",
      distance: 80,
    });
  }
  for (const e of served) {
    if (e.datasetId && e.permitId) allowed.add(e.datasetId);
  }

  // ── datasets: allowed today, and the others near my needs ─────────────────
  const perDataset = aggregateMonthly(
    served,
    months,
    (e) => e.datasetId ?? null,
  );
  const allDatasets = new Map<string, CatalogDataset>(
    input.datasets.map((d) => [d.id, d]),
  );
  for (const e of events) {
    if (e.datasetId && !allDatasets.has(e.datasetId)) {
      allDatasets.set(e.datasetId, {
        id: e.datasetId,
        title: e.assetTitle ?? e.datasetId,
      });
    }
  }
  for (const e of myRegister) {
    if (e.datasetId && !allDatasets.has(e.datasetId)) {
      allDatasets.set(e.datasetId, {
        id: e.datasetId,
        title: e.datasetTitle ?? e.datasetId,
      });
    }
  }
  const ranked: { id: string; shared: string[] }[] = [];
  for (const d of allDatasets.values()) {
    const isAllowed = allowed.has(d.id);
    const shared = overlap(
      myNeeds,
      stems(`${d.title} ${d.description ?? ""} ${d.theme ?? ""}`),
    );
    const id = `ds:${d.id}`;
    const node = add({
      id,
      label: d.title,
      layer: isAllowed ? "allowed" : "other",
      kind: "Dataset",
      size: isAllowed ? 2 : 1.4,
      color: isAllowed ? "#22c55e" : "#a78bfa",
      status: isAllowed ? "ok" : "none",
      title: d.title,
      sub: isAllowed
        ? `permitted to me today${
            d.publisher ? `, held by ${d.publisher}` : ""
          }`
        : `${d.publisher ? `held by ${d.publisher}, ` : ""}not permitted to me${
            shared.length ? `, matches ${shared.length} of my data needs` : ""
          }`,
      description: d.description ?? undefined,
      facts: [
        ["id", d.id],
        completenessFact(descriptionCompleteness(d)),
        ...(d.recordCount != null
          ? [["records", String(d.recordCount)] as [string, string]]
          : []),
        ...(shared.length
          ? [["shares", shared.join(", ")] as [string, string]]
          : []),
      ],
      article: isAllowed
        ? "Art. 61(1): I access it in the secure processing environment under my permit (Art. 73)"
        : "Art. 67: an application names the datasets; Art. 77 describes them in the national catalogue",
      links: [
        { href: "/catalog", text: "Catalogue entry" },
        { href: "/data/discover", text: "Discover" },
      ],
    });
    const series = perDataset[d.id];
    if (series) {
      raiseStatus(
        node,
        attachSeries(
          node,
          {
            series,
            unit: "accesses",
            measure: "My accesses per month",
            higherIsWorse: false,
          },
          "time",
        ),
      );
    }
    if (!isAllowed && shared.length > 0) ranked.push({ id: d.id, shared });
  }
  ranked.sort((a, b) => b.shared.length - a.shared.length);
  for (const r of ranked.slice(0, 3)) {
    link(`ds:${r.id}`, "me", {
      kind: "matches",
      color: "#a78bfa",
      distance: 140,
    });
    signals.push({
      severity: "info",
      code: "dataset-match",
      nodeId: `ds:${r.id}`,
      text: `${allDatasets.get(r.id)
        ?.title} is not permitted to me and matches my data needs (${r.shared.join(
        ", ",
      )}).`,
      article: "Art. 67 application; Art. 77 description",
    });
  }

  // ── my studies and the others near them ───────────────────────────────────
  for (const s of input.studies) {
    const mine = myStudies.includes(s);
    const id = `study:${s.studyId}`;
    const shared = mine ? [] : overlap(myNeeds, stems(s.dataNeeded));
    const node = add({
      id,
      label: s.studyName,
      layer: mine ? "me" : "other",
      kind: "Study",
      size: mine ? 2.4 : 1.6,
      status: mine ? "ok" : "none",
      color: mine ? undefined : "#c4b5fd",
      title: s.studyName,
      sub: `${s.institution ?? ""}${s.status ? `, ${s.status}` : ""}${
        s.participantCount != null
          ? `, ${s.participantCount.toLocaleString("en")} participants`
          : ""
      }${s.countries?.length ? `, ${s.countries.join(", ")}` : ""}`,
      description: s.description ?? undefined,
      facts: [
        ["needs", s.dataNeeded ?? "n/a"],
        ...(shared.length
          ? [["shares with mine", shared.join(", ")] as [string, string]]
          : []),
      ],
      article: mine
        ? "My study; Art. 61(4): I publish the results within 18 months"
        : "Another user's study in the space; Art. 57(1)(j)(v) results are published",
      links: [{ href: "/patient/research", text: "Research programmes" }],
    });
    if (s.enrolment && s.enrolment.length > 1) {
      attachSeries(
        node,
        {
          series: s.enrolment,
          unit: "participants",
          measure: "Participants enrolled",
          higherIsWorse: false,
        },
        "time",
      );
    }
    if (mine) link("me", id, { kind: "conducts", status: "ok", distance: 70 });
    else if (shared.length > 0) {
      link(id, "me", { kind: "near", color: "#a78bfa", distance: 130 });
      signals.push({
        severity: "info",
        code: "study-match",
        nodeId: id,
        text: `${s.studyName} (${s.institution}) needs ${shared.join(
          ", ",
        )} like mine; a candidate for a joint application or a shared cohort.`,
        article: "Art. 53(1)(e), Art. 67",
      });
    }
  }
  for (const s of otherStudies) {
    // studies of another institution link to that institution if it is in the space
    const inst =
      s.institutionDid ??
      [...participants.values()].find((p) => p.name === s.institution)?.id;
    if (inst && inst !== me.did) {
      const oid = `org:${inst}`;
      add({
        id: oid,
        label: nameOf(inst),
        layer: "other",
        kind: "Organisation",
        size: 1.2,
        color: "#f97316",
        title: nameOf(inst),
        sub: "another participant",
      });
      link(`study:${s.studyId}`, oid, {
        kind: "conducted by",
        color: "#f97316",
        distance: 45,
      });
    }
  }

  signals.push({
    severity: "info",
    code: "allowed-today",
    nodeId: allowed.size > 0 ? `ds:${[...allowed][0]}` : "me",
    text: `${allowed.size} datasets permitted to me today; ${served.length} accesses served in 12 months, ${refused.length} refused.`,
    article: "Art. 61(1), Art. 73(1)(e)",
  });

  const known = new Set(nodes.map((n) => n.id));
  return {
    persona: "researcher",
    asOf,
    me: { id: me.did, name: me.name },
    title: "My research, in one view",
    question:
      "What am I allowed to use today, what is pending or blocked, and what am I missing?",
    article: "Regulation (EU) 2025/327 Art. 53, 61, 67, 68, 69, 73",
    layers,
    nodes,
    links: links.filter((l) => known.has(l.source) && known.has(l.target)),
    signals: rankSignals(signals),
    legend: [
      { color: "#ef4444", text: "blocked / expired" },
      { color: "#f59e0b", text: "pending / due" },
      { color: "#38bdf8", text: "information" },
      { color: "#22c55e", text: "permitted today" },
      { color: "#a78bfa", text: "near my needs" },
      { color: "#93c5fd", text: "month (unfolded)" },
    ],
    dataNote: "Every organisation and study shown is fictional.",
  };
}
