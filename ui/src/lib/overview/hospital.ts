/**
 * The holder overview (issue #271 M3): "which consumers are trusted, what
 * is flowing without cover, and are my own duties in order?"
 *
 * The same composition as the access body view (compliance matrix, permit
 * register, credential wallet, contracts, access log), seen from one
 * holder: only the events on its data, only the consumers that read it,
 * its own datasets, its own quality label with the assessor's quarterly
 * scores against the renewal band. Trust per consumer is `chainOfTrust`.
 *
 * Article numbers are those of Regulation (EU) 2025/327 as adopted.
 */
import {
  aggregateMonthly,
  chainOfTrust,
  credentialState,
  monthRange,
  permitState,
  rankSignals,
  type SeriesPoint,
  type Severity,
} from "./derive";
import {
  holderOf,
  KIND,
  registerPermit,
  type ContractShape,
  type CredentialEntry,
  type HdabAccessEvent,
  type MatrixRow,
  type ParticipantShape,
  type RegisterEntry,
} from "./hdab";
import { attachSeries, raiseStatus } from "./series";
import type {
  OverviewLayer,
  OverviewLink,
  OverviewNode,
  OverviewSignal,
  OverviewView,
} from "./types";

export interface LabelAssessment {
  credentialId: string;
  /** ISO date of the assessment */
  date: string;
  conformance: number;
  completeness?: number | null;
  timeliness?: number | null;
  period?: string | null;
}

export interface HospitalViewInput {
  asOf: string;
  me: { did: string; name: string };
  consumers: ParticipantShape[];
  datasets: { id: string; title: string; publisherDid?: string | null }[];
  matrix: MatrixRow[];
  register: RegisterEntry[];
  credentials: CredentialEntry[];
  contracts: ContractShape[];
  /** Access events on this holder's data */
  events: HdabAccessEvent[];
  /** The assessor's quarterly scores behind the holder's quality labels */
  assessments: LabelAssessment[];
}

const fmtDate = (iso?: string | null) =>
  iso ? String(iso).slice(0, 10) : "n/a";

/** The renewal band of a quality label: the assessor renews within it. */
export const LABEL_BAND = {
  low: 0.9,
  high: 1.0,
  text: "0.90 to 1.00, the band the assessor renews the label in",
};

export function buildHospitalView(input: HospitalViewInput): OverviewView {
  const { me, asOf } = input;
  const months = monthRange(asOf, 12);
  const layers: OverviewLayer[] = [
    {
      id: "me",
      name: "My duties: catalogue, label, log",
      z: 2,
      color: "#fbbf24",
    },
    {
      id: "chain",
      name: "Permits, contracts, credentials",
      z: 1,
      color: "#f97316",
    },
    { id: "consumers", name: "Who reads my data", z: 0, color: "#38bdf8" },
    { id: "data", name: "My datasets", z: -1, color: "#a78bfa" },
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

  const participants = new Map<string, ParticipantShape>();
  for (const p of input.consumers) participants.set(p.id, p);
  for (const e of input.events) {
    if (!participants.has(e.consumerDid)) {
      participants.set(e.consumerDid, {
        id: e.consumerDid,
        name: e.consumerName ?? e.consumerDid,
      });
    }
  }
  const nameOf = (did: string) => participants.get(did)?.name ?? did;
  const events = input.events.filter(
    (e) => !e.providerDid || e.providerDid === me.did,
  );
  const served = events.filter((e) => (e.statusCode ?? 200) < 400);
  const refused = events.filter((e) => (e.statusCode ?? 200) >= 400);
  const datasetTitle = new Map(input.datasets.map((d) => [d.id, d.title]));
  for (const e of events) {
    if (e.datasetId && e.assetTitle && !datasetTitle.has(e.datasetId)) {
      datasetTitle.set(e.datasetId, e.assetTitle);
    }
  }
  const credHolder = new Map<string, string | null>(
    input.credentials.map((c) => [
      c.credentialId,
      holderOf(c, [...participants.values()]),
    ]),
  );

  // ── my datasets ───────────────────────────────────────────────────────────
  const myDatasets = new Set<string>();
  for (const d of input.datasets) {
    if (d.publisherDid === me.did) myDatasets.add(d.id);
  }
  for (const e of events) if (e.datasetId) myDatasets.add(e.datasetId);
  for (const c of input.credentials) {
    if (
      /quality/i.test(c.credentialType) &&
      credHolder.get(c.credentialId) === me.did &&
      c.datasetId
    ) {
      myDatasets.add(c.datasetId);
    }
  }

  // ── me: the holder and its duties ─────────────────────────────────────────
  const myLabels = input.credentials.filter(
    (c) =>
      /quality/i.test(c.credentialType) &&
      credHolder.get(c.credentialId) === me.did,
  );
  const meNode = add({
    id: "me",
    label: me.name,
    layer: "me",
    kind: "Health data holder",
    size: 4,
    color: "#fbbf24",
    pin: [0, 0],
    title: me.name,
    sub: `health data holder, ${myDatasets.size} datasets in the catalogue, ${
      myLabels.length
    } quality label${myLabels.length === 1 ? "" : "s"}`,
    facts: [
      ["did", me.did],
      [
        "datasets",
        [...myDatasets].map((d) => datasetTitle.get(d) ?? d).join(", ") ||
          "none",
      ],
      [
        "log",
        `${served.length} accesses served, ${refused.length} refused in 12 months`,
      ],
    ],
    article:
      "Art. 60 duties of health data holders: make data available under a permit, describe the datasets (Art. 77), keep the access log (Art. 73(1)(e)), carry the quality label (Art. 78)",
    links: [
      { href: "/catalog", text: "My catalogue entries" },
      { href: "/credentials", text: "My credentials" },
      { href: "/admin/audit", text: "Access log" },
    ],
  });
  const bytes =
    aggregateMonthly(
      served,
      months,
      () => "x",
      (e) => (e.responseBytes ?? 0) / 1e6,
    )["x"] ?? months.map((date) => ({ date, value: 0 }));
  attachSeries(
    meNode,
    {
      series: bytes.map((p) => ({
        date: p.date,
        value: Math.round(p.value * 100) / 100,
      })),
      unit: "MB",
      measure: "Data made available per month",
      higherIsWorse: false,
    },
    "time",
  );
  const consumerIds = new Set(events.map((e) => e.consumerDid));
  consumerIds.delete(me.did);

  // ── consumers and their chain of trust, on my data ────────────────────────
  for (const did of [...consumerIds].sort()) {
    const p = participants.get(did) ?? { id: did, name: did };
    const id = `c:${did}`;
    const mine = events.filter((e) => e.consumerDid === did);
    const mineServed = mine.filter((e) => (e.statusCode ?? 200) < 400);
    const mineRefused = mine.filter((e) => (e.statusCode ?? 200) >= 400);
    const row = input.matrix.find((r) => r.consumerId === did);
    const creds = input.credentials.filter(
      (c) => credHolder.get(c.credentialId) === did,
    );
    const permits = input.register
      .filter((e) => e.kind === "application" && e.applicantDid === did)
      .map(registerPermit);
    if (
      row?.hasApproval &&
      row.approvalId &&
      !permits.some((x) => x.permitId === row.approvalId)
    ) {
      permits.push({
        permitId: row.approvalId,
        status: row.approvalStatus ?? "APPROVED",
        validUntil: row.validUntil ?? null,
      });
    }
    const contracts = [
      ...input.contracts.filter((c) => !c.consumerDid || c.consumerDid === did),
      ...(row?.hasContract
        ? mineServed
            .filter((e) => e.contractId)
            .map((e) => ({ contractId: e.contractId! }))
        : []),
    ];
    const chain = chainOfTrust(
      {
        consumerDid: did,
        consumerName: p.name,
        credentials: creds,
        permits,
        contracts,
        events: mine,
      },
      asOf,
    );
    const node = add({
      id,
      label: p.name,
      layer: "consumers",
      kind: KIND[p.type ?? ""] ?? "Data user",
      size: 2.4,
      status: chain.severity === "ok" ? "ok" : chain.severity,
      pulse: chain.severity === "bad",
      title: p.name,
      sub: chain.trusted
        ? "trusted: credentials, permit, contract and log agree"
        : "not trusted: the chain of trust is broken",
      facts: [
        ["did", did],
        ["credentials", `${creds.length} presented`],
        [
          "permits",
          permits
            .map((x) => `${x.permitId} ${permitState(x, asOf)}`)
            .join(", ") || "none",
        ],
        [
          "on my data",
          `${mineServed.length} accesses served, ${mineRefused.length} refused`,
        ],
      ],
      article:
        "Art. 60(1): I make data available only under a permit; Art. 61(1): the user accesses only under it; the DSP contract carries the terms",
      links: [
        {
          href: `/admin/audit?consumerDid=${encodeURIComponent(did)}`,
          text: "Access log",
        },
      ],
    });
    for (const f of chain.findings) {
      signals.push({
        severity: f.severity,
        code: f.code,
        nodeId: id,
        text: f.text,
        article: f.article,
      });
    }
    const showRefused =
      mineRefused.length > 0 &&
      (mineServed.length === 0 ||
        chain.findings.some((f) => f.code === "access-attempt-after-refusal"));
    const monthly = showRefused
      ? {
          series: aggregateMonthly(mineRefused, months, () => "x")["x"],
          unit: "refusals",
          measure: "Refused attempts per month",
          range: { low: 0, high: 0, text: "0 refusals expected" },
          higherIsWorse: true,
        }
      : mineServed.length > 0
        ? {
            series: aggregateMonthly(mineServed, months, () => "x")["x"],
            unit: "accesses",
            measure: "Accesses per month",
            higherIsWorse: false,
          }
        : null;
    if (monthly) raiseStatus(node, attachSeries(node, monthly, "time"));
    const pairs = new Map<string, { served: number; refused: number }>();
    for (const e of mine) {
      if (!e.datasetId) continue;
      const k = pairs.get(e.datasetId) ?? { served: 0, refused: 0 };
      if ((e.statusCode ?? 200) < 400) k.served++;
      else k.refused++;
      pairs.set(e.datasetId, k);
    }
    for (const [ds, k] of pairs) {
      const bad = k.served === 0 && k.refused > 0;
      link(id, `ds:${ds}`, {
        kind: bad ? "refused" : "reads",
        status:
          bad || chain.severity === "bad"
            ? "bad"
            : chain.severity === "warn"
              ? "warn"
              : "ok",
        particles: 2,
        distance: 90,
      });
    }
    // the chain elements behind this consumer
    for (const x of permits) {
      const ps = permitState(x, asOf);
      const pid = `permit:${x.permitId}`;
      add({
        id: pid,
        label: `${ps === "refused" ? "refusal" : "permit"} ${x.permitId}`,
        layer: "chain",
        kind: ps === "refused" ? "Refusal" : "Data permit",
        size: 1.4,
        status:
          ps === "valid"
            ? "ok"
            : ps === "expiring" || ps === "refused"
              ? "warn"
              : ps === "pending"
                ? "info"
                : "bad",
        title: x.permitId ?? "",
        sub: `${p.name}, ${ps}${
          x.validUntil ? `, valid until ${fmtDate(x.validUntil)}` : ""
        }`,
        facts: [["state", ps]],
        article:
          "Art. 68 data permit issued by the access body; Art. 61(1) access only under it",
        links: [{ href: "/permits", text: "Public register" }],
      });
      link(pid, id, { kind: "issued to", color: "#94a3b8", distance: 60 });
    }
    for (const c of creds) {
      const state = credentialState(c, asOf);
      const isLabel = /quality/i.test(c.credentialType);
      const sev: Severity | "none" =
        state === "expired" || state === "revoked"
          ? "bad"
          : state === "expiring"
            ? "warn"
            : "ok";
      if (isLabel) continue;
      const vid = `vc:${c.credentialId}`;
      add({
        id: vid,
        label: `${c.credentialType.replace(/Credential$/, "")} ${state}`,
        layer: "chain",
        kind: "Credential",
        size: 1.1,
        status: sev,
        title: c.credentialType,
        sub: `${p.name}, ${state}`,
        facts: [
          ["id", c.credentialId],
          ["expires", fmtDate(c.expiresAt)],
          ...(c.purpose ? [["purpose", c.purpose] as [string, string]] : []),
        ],
        article: "DCP v1.0 credential presented before access; Art. 53 purpose",
      });
      link(vid, id, { kind: "presented by", status: sev, distance: 45 });
    }
  }
  for (const c of input.contracts) {
    const id = `contract:${c.contractId}`;
    add({
      id,
      label: `contract ${c.contractId}`,
      layer: "chain",
      kind: "Contract",
      size: 1.2,
      status: c.validUntil && c.validUntil < asOf ? "warn" : "ok",
      title: c.contractId,
      sub: "DSP 2025-1 contract agreement",
      facts: [["valid until", fmtDate(c.validUntil)]],
      article:
        "The DSP contract behind the flow; without it, data moves on trust alone",
    });
    if (c.consumerDid) {
      link(id, `c:${c.consumerDid}`, {
        kind: "party",
        color: "#94a3b8",
        distance: 60,
      });
    }
    if (c.datasetId) {
      link(id, `ds:${c.datasetId}`, {
        kind: "covers",
        color: "#a78bfa",
        distance: 80,
      });
    }
  }

  // ── my quality labels with the assessor's scores ──────────────────────────
  let labelSignalled = false;
  for (const c of myLabels) {
    const id = `vc:${c.credentialId}`;
    const state = credentialState(c, asOf);
    const scores: SeriesPoint[] = input.assessments
      .filter((a) => a.credentialId === c.credentialId)
      .map((a) => ({ date: a.date.slice(0, 10), value: a.conformance }))
      .sort((a, b) => a.date.localeCompare(b.date));
    const node = add({
      id,
      label: `quality label ${state}`,
      layer: "me",
      kind: "Quality label",
      size: 2,
      status:
        state === "expired" || state === "revoked"
          ? "bad"
          : state === "expiring"
            ? "warn"
            : "ok",
      pulse: state === "expired",
      title: "Data quality and utility label",
      sub: `${state}${
        c.expiresAt
          ? `, ${state === "expired" ? "since" : "until"} ${fmtDate(
              c.expiresAt,
            )}`
          : ""
      }${c.conformance != null ? `, conformance ${c.conformance}` : ""}`,
      description:
        "The label the access body's assessor issues for a dataset's quality and utility: conformance to the eEHRxF profiles, completeness and timeliness. It is renewed while the conformance score stays within the band; below it the assessor withholds renewal and the dataset is offered without a label.",
      facts: [
        ["id", c.credentialId],
        ["issued", fmtDate(c.issuedAt)],
        ["expires", fmtDate(c.expiresAt)],
        [
          "dataset",
          c.datasetId ? datasetTitle.get(c.datasetId) ?? c.datasetId : "n/a",
        ],
      ],
      article:
        "Art. 78 data quality and utility label; Art. 57(1)(d) the access body's assessment",
      links: [{ href: "/credentials", text: "My credentials" }],
    });
    if (scores.length > 1) {
      raiseStatus(
        node,
        attachSeries(
          node,
          {
            series: scores,
            unit: "",
            measure: "Label conformance score",
            range: LABEL_BAND,
            higherIsWorse: false,
          },
          "time",
        ),
      );
    }
    link("me", id, { kind: "carries", status: node.status, distance: 60 });
    if (c.datasetId) {
      link(id, `ds:${c.datasetId}`, {
        kind: "labels",
        color: "#a78bfa",
        distance: 80,
      });
    }
    const last = scores.at(-1);
    if (state === "expired" || state === "revoked") {
      labelSignalled = true;
      signals.push({
        severity: "bad",
        code: "label-expired",
        nodeId: id,
        text: `My quality label expired on ${fmtDate(c.expiresAt)}${
          last
            ? `; the last conformance score was ${last.value}, below the renewal band`
            : ""
        }. My datasets are offered without a label.`,
        article:
          "Art. 78, Art. 60; click to see the assessor's scores by quarter",
      });
    } else if (last && last.value < LABEL_BAND.low) {
      labelSignalled = true;
      signals.push({
        severity: "warn",
        code: "label-below-band",
        nodeId: id,
        text: `My conformance score is ${last.value}, below the renewal band; the label will not be renewed as it stands.`,
        article: "Art. 78",
      });
    }
  }
  if (myLabels.length === 0) {
    labelSignalled = true;
    signals.push({
      severity: "warn",
      code: "label-missing",
      nodeId: "me",
      text: "I carry no data quality and utility label; my datasets are offered without one.",
      article: "Art. 78, Art. 60",
    });
  }

  // ── my datasets and their use ─────────────────────────────────────────────
  const perDataset = aggregateMonthly(
    served,
    months,
    (e) => e.datasetId ?? null,
  );
  for (const dsId of [...myDatasets].sort()) {
    const id = `ds:${dsId}`;
    const node = add({
      id,
      label: datasetTitle.get(dsId) ?? dsId,
      layer: "data",
      kind: "Dataset",
      size: 1.8,
      color: "#a78bfa",
      title: datasetTitle.get(dsId) ?? dsId,
      sub: "described in the national catalogue",
      facts: [["id", dsId]],
      article:
        "Art. 77 dataset description; Art. 60(1) available under a permit; Art. 51 minimum categories",
      links: [{ href: "/catalog", text: "Catalogue entry" }],
    });
    const series = perDataset[dsId];
    if (series) {
      raiseStatus(
        node,
        attachSeries(
          node,
          {
            series,
            unit: "accesses",
            measure: "Accesses per month",
            higherIsWorse: false,
          },
          "time",
        ),
      );
    }
    link("me", id, { kind: "provides", color: "#a78bfa", distance: 70 });
  }

  signals.push({
    severity: "info",
    code: "access-log",
    nodeId: "me",
    text: `${served.length} accesses served and ${refused.length} refused on my data in the last 12 months, by ${consumerIds.size} organisations, all logged.`,
    article: "Art. 73(1)(e) log; Art. 8 what my patients may ask to see",
  });
  signals.push({
    severity: "info",
    code: "catalogue",
    nodeId: "me",
    text: `${myDatasets.size} datasets of mine in the national catalogue${
      labelSignalled ? "" : ", labelled"
    }. A description completeness score (Art. 77) is still missing (#271).`,
    article: "Art. 77, Art. 79",
  });

  const known = new Set(nodes.map((n) => n.id));
  return {
    persona: "hospital",
    asOf,
    me: { id: me.did, name: me.name },
    title: "My data, in one view",
    question:
      "Which consumers are trusted, what is flowing without cover, and are my own duties in order?",
    article: "Regulation (EU) 2025/327 Art. 60, 61, 73, 77, 78",
    layers,
    nodes,
    links: links.filter((l) => known.has(l.source) && known.has(l.target)),
    signals: rankSignals(signals),
    legend: [
      { color: "#ef4444", text: "untrusted / duty broken" },
      { color: "#f59e0b", text: "at risk / uncovered" },
      { color: "#38bdf8", text: "information" },
      { color: "#22c55e", text: "trusted, in order" },
      { color: "#a78bfa", text: "my dataset" },
      { color: "#93c5fd", text: "month (unfolded)" },
    ],
    dataNote: "Every organisation shown is fictional.",
  };
}
