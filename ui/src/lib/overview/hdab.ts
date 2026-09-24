/**
 * The access body overview (issue #271 M2): "which operations are
 * non-compliant right now, and are my own decisions on time?"
 *
 * A pure builder over the shapes the existing routes return: the compliance
 * matrix (`/api/compliance`), the public permit register (`/api/permits`),
 * the credential wallet (`/api/credentials`), the contracts and the access
 * log of the last twelve months from the graph. Trust is computed as a
 * chain per consumer (credentials, permit, contract, log) with
 * `chainOfTrust`; the body's own duties come from `decisionClock`.
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
  type AccessEvent,
  type PermitLike,
  type Severity,
} from "./derive";
import { attachSeries, raiseStatus } from "./series";
import type {
  OverviewLayer,
  OverviewLink,
  OverviewNode,
  OverviewSignal,
  OverviewView,
} from "./types";

export interface ParticipantShape {
  id: string;
  name: string;
  type?: string | null;
}

export interface MatrixRow {
  consumerId: string;
  consumerName?: string | null;
  consumerType?: string | null;
  hasApplication?: boolean;
  applicationStatus?: string | null;
  hasApproval?: boolean;
  approvalStatus?: string | null;
  hasContract?: boolean;
  datasetId?: string | null;
  applicationId?: string | null;
  approvalId?: string | null;
  validUntil?: string | null;
}

export interface RegisterEntry {
  kind: "application" | "request";
  applicationId: string;
  applicant?: string | null;
  applicantDid?: string | null;
  accessBody?: string | null;
  purpose?: string | null;
  datasetId?: string | null;
  datasetTitle?: string | null;
  submittedAt?: string | null;
  outcome?: string | null;
  permitId?: string | null;
  decidedAt?: string | null;
  validUntil?: string | null;
  revokedAt?: string | null;
  revocationReason?: string | null;
  decisionDue?: string | null;
  justification?: string | null;
}

export interface CredentialEntry {
  credentialId: string;
  credentialType: string;
  status?: string | null;
  issuedAt?: string | null;
  expiresAt?: string | null;
  holderName?: string | null;
  holderDid?: string | null;
  participantRole?: string | null;
  datasetId?: string | null;
  conformance?: number | null;
  purpose?: string | null;
}

export interface ContractShape {
  contractId: string;
  consumerDid?: string | null;
  datasetId?: string | null;
  validUntil?: string | null;
  status?: string | null;
}

export interface HdabAccessEvent extends AccessEvent {
  consumerName?: string | null;
  providerName?: string | null;
  assetTitle?: string | null;
}

export interface HdabViewInput {
  asOf: string;
  me: { did: string; name: string };
  consumers: ParticipantShape[];
  datasets: { id: string; title: string }[];
  matrix: MatrixRow[];
  register: RegisterEntry[];
  credentials: CredentialEntry[];
  contracts: ContractShape[];
  events: HdabAccessEvent[];
}

const fmtDate = (iso?: string | null) =>
  iso ? String(iso).slice(0, 10) : "n/a";
const compact = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** The permit register's outcome words as a permit state input. */
export function registerPermit(e: RegisterEntry): PermitLike {
  const o = (e.outcome ?? "").toLowerCase();
  const status = e.revokedAt
    ? "REVOKED"
    : o.includes("refus") || o.includes("reject")
      ? "REJECTED"
      : o.includes("issued") || o.includes("approved")
        ? "APPROVED"
        : "PENDING";
  return {
    permitId: e.permitId ?? e.applicationId,
    status,
    validUntil: e.validUntil,
    revokedAt: e.revokedAt,
  };
}

/**
 * The approval the compliance matrix records for a consumer, as a permit.
 * Older approvals have no register entry and sometimes no id; the matrix's
 * word still stands, keyed by the consumer when the id is missing.
 */
export function matrixPermit(row: MatrixRow | undefined): PermitLike | null {
  if (!row?.hasApproval) return null;
  return {
    permitId: row.approvalId ?? `approval:${row.consumerId}`,
    status: row.approvalStatus ?? "APPROVED",
    validUntil: row.validUntil ?? null,
  };
}

/** The participant a credential belongs to: by holder name, else by the id's tail. */
export function holderOf(
  cred: CredentialEntry,
  participants: ParticipantShape[],
): string | null {
  if (cred.holderDid) return cred.holderDid;
  if (cred.holderName) {
    const hit = participants.find((p) => p.name === cred.holderName);
    if (hit) return hit.id;
  }
  const tail = cred.credentialId.split(":").pop() ?? "";
  const tokens = tail
    .split("-")
    .filter((t) => t.length >= 3 && !["cro", "clinic", "hdab"].includes(t));
  for (const t of tokens) {
    const hit = participants.find((p) => compact(p.id).includes(compact(t)));
    if (hit) return hit.id;
  }
  return null;
}

export const KIND: Record<string, string> = {
  DATA_USER: "Data user",
  DATA_HOLDER: "Data holder",
  HDAB: "Access body",
  CLINIC: "Data holder",
  CRO: "Data user",
};

export function buildHdabView(input: HdabViewInput): OverviewView {
  const { me, asOf } = input;
  const months = monthRange(asOf, 12);
  const layers: OverviewLayer[] = [
    { id: "me", name: "My decisions and their clocks", z: 2, color: "#fbbf24" },
    {
      id: "chain",
      name: "Credentials, permits, contracts",
      z: 1,
      color: "#f97316",
    },
    { id: "users", name: "Data users and holders", z: 0, color: "#38bdf8" },
    { id: "data", name: "Datasets", z: -1, color: "#a78bfa" },
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
    if (e.providerDid && !participants.has(e.providerDid)) {
      participants.set(e.providerDid, {
        id: e.providerDid,
        name: e.providerName ?? e.providerDid,
        type: "DATA_HOLDER",
      });
    }
  }
  const nameOf = (did: string) => participants.get(did)?.name ?? did;
  const datasetTitle = new Map(input.datasets.map((d) => [d.id, d.title]));
  for (const e of input.events) {
    if (e.datasetId && e.assetTitle && !datasetTitle.has(e.datasetId)) {
      datasetTitle.set(e.datasetId, e.assetTitle);
    }
  }

  // ── me: the body and its queue ────────────────────────────────────────────
  const mine = input.register.filter(
    (e) => !e.accessBody || e.accessBody === me.name,
  );
  const meNode = add({
    id: "me",
    label: me.name,
    layer: "me",
    kind: "Access body",
    size: 4,
    color: "#fbbf24",
    pin: [0, 0],
    title: me.name,
    sub: "health data access body, Art. 55",
    article:
      "Art. 57 tasks, Art. 68(4) decision within three months of a complete application, Art. 57(1)(j) publication, Art. 63 enforcement",
    links: [
      { href: "/compliance", text: "Applications and permits" },
      { href: "/permits", text: "Public register" },
      { href: "/activity-report", text: "Activity report (Art. 59)" },
    ],
  });
  const queue = months.map((m) => {
    const end = new Date(m);
    end.setUTCMonth(end.getUTCMonth() + 1);
    const endIso = end.toISOString();
    const open = mine.filter(
      (e) =>
        e.submittedAt &&
        e.submittedAt < endIso &&
        (!e.decidedAt || e.decidedAt >= endIso),
    ).length;
    return { date: m, value: open };
  });
  const queueSev = attachSeries(
    meNode,
    {
      series: queue,
      unit: "applications",
      measure: "Pending applications at month end",
      range: {
        low: 0,
        high: 2,
        text: "0 to 2 open applications, the load one case officer clears within the Art. 68 deadline",
      },
      higherIsWorse: true,
    },
    "time",
  );
  raiseStatus(meNode, queueSev);
  signals.push({
    severity: queueSev === "ok" ? "info" : queueSev,
    code: "pending-queue",
    nodeId: "me",
    text: `${
      queue[queue.length - 1].value
    } applications open at the end of ${months[11].slice(0, 7)}; ${
      mine.filter((e) => !e.decidedAt).length
    } undecided today.`,
    article: "Art. 68(4); click to see the queue by month",
  });

  // ── consumers and their chain of trust ────────────────────────────────────
  const consumerIds = new Set<string>();
  for (const r of input.matrix) {
    if (r.hasApplication || r.hasApproval || r.hasContract) {
      consumerIds.add(r.consumerId);
    }
  }
  for (const e of input.register) {
    if (e.applicantDid) consumerIds.add(e.applicantDid);
  }
  for (const e of input.events) consumerIds.add(e.consumerDid);
  for (const c of input.credentials) {
    const h = holderOf(c, [...participants.values()]);
    if (h) consumerIds.add(h);
  }
  consumerIds.delete(me.did);
  const credHolder = new Map<string, string | null>(
    input.credentials.map((c) => [
      c.credentialId,
      holderOf(c, [...participants.values()]),
    ]),
  );

  for (const did of [...consumerIds].sort()) {
    const p = participants.get(did) ?? { id: did, name: did };
    const id = `p:${did}`;
    const events = input.events.filter((e) => e.consumerDid === did);
    const served = events.filter((e) => (e.statusCode ?? 200) < 400);
    const refused = events.filter((e) => (e.statusCode ?? 200) >= 400);
    const row = input.matrix.find((r) => r.consumerId === did);
    const creds = input.credentials.filter(
      (c) => credHolder.get(c.credentialId) === did,
    );
    const permits = input.register
      .filter((e) => e.kind === "application" && e.applicantDid === did)
      .map(registerPermit);
    const fromMatrix = matrixPermit(row);
    if (
      fromMatrix &&
      !permits.some((x) => x.permitId === fromMatrix.permitId)
    ) {
      permits.push(fromMatrix);
    }
    const contracts = [
      ...input.contracts.filter((c) => !c.consumerDid || c.consumerDid === did),
      ...(row?.hasContract
        ? served
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
        events,
      },
      asOf,
    );
    const node = add({
      id,
      label: p.name,
      layer: "users",
      kind: KIND[p.type ?? ""] ?? "Participant",
      size: 2.4,
      status: chain.severity === "ok" ? "ok" : chain.severity,
      pulse: chain.severity === "bad",
      title: p.name,
      sub: `${KIND[p.type ?? ""] ?? "participant"}, ${
        chain.trusted ? "chain of trust intact" : "chain of trust broken"
      }`,
      facts: [
        ["did", did],
        ["credentials", `${creds.length} in the wallet`],
        [
          "permits",
          permits
            .map((x) => `${x.permitId} ${permitState(x, asOf)}`)
            .join(", ") || "none",
        ],
        [
          "accesses",
          `${served.length} served, ${refused.length} refused in 12 months`,
        ],
      ],
      article:
        "Trust is a chain: DCP credentials, an Art. 68 permit, a DSP contract, and a log that agrees with all three (Art. 61(1), 73(1)(e))",
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
    // The refusals are the series that matters once an applicant was refused
    // and keeps trying; otherwise the served accesses.
    const showRefused =
      refused.length > 0 &&
      (served.length === 0 ||
        chain.findings.some((f) => f.code === "access-attempt-after-refusal"));
    const monthly = showRefused
      ? {
          series: aggregateMonthly(refused, months, () => "x")["x"],
          unit: "refusals",
          measure: "Refused accesses per month",
          range: { low: 0, high: 0, text: "0 refusals expected" },
          higherIsWorse: true,
        }
      : served.length > 0
        ? {
            series: aggregateMonthly(served, months, () => "x")["x"],
            unit: "accesses",
            measure: "Accesses per month",
            higherIsWorse: false,
          }
        : null;
    if (monthly) raiseStatus(node, attachSeries(node, monthly, "time"));
    // flows to the datasets
    const pairs = new Map<string, { served: number; refused: number }>();
    for (const e of events) {
      if (!e.datasetId) continue;
      const k = pairs.get(e.datasetId) ?? { served: 0, refused: 0 };
      if ((e.statusCode ?? 200) < 400) k.served++;
      else k.refused++;
      pairs.set(e.datasetId, k);
    }
    for (const [ds, k] of pairs) {
      const bad = k.served === 0 && k.refused > 0;
      link(id, `ds:${ds}`, {
        kind: bad ? "refused" : "accesses",
        status: bad ? "bad" : chain.severity === "bad" ? "bad" : "ok",
        particles: 2,
        distance: 90,
      });
    }
    link("me", id, { kind: "supervises", color: "#334155", distance: 110 });
  }

  // ── applications, permits and the clocks ──────────────────────────────────
  for (const e of input.register) {
    const isMine = mine.includes(e);
    const id = `app:${e.applicationId}`;
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
    const isRequest = e.kind === "request";
    const status: Severity | "none" = clock.overdue
      ? "bad"
      : !clock.decided
        ? "info"
        : ps === "refused" || ps === "revoked"
          ? "warn"
          : "ok";
    add({
      id,
      label: `${isRequest ? "request" : "application"} ${
        e.applicant ?? nameOf(e.applicantDid ?? "")
      }`,
      layer: isMine ? "me" : "chain",
      kind: isRequest ? "Health data request" : "Access application",
      size: 1.6,
      status,
      pulse: clock.overdue,
      title: e.applicationId,
      sub: `${e.applicant ?? ""}, ${e.purpose ?? ""}, ${
        e.datasetTitle ?? e.datasetId ?? ""
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
        ["outcome", e.outcome ?? "pending"],
        ...(e.justification
          ? [["justification", e.justification] as [string, string]]
          : []),
      ],
      article: isRequest
        ? "Art. 69: a health data request is answered in anonymised statistical format within three months"
        : "Art. 67 application, Art. 68(4) decision within three months of a complete application, Art. 57(1)(j) publication",
      links: [{ href: "/compliance", text: "Decide" }],
    });
    if (e.applicantDid) {
      link(`p:${e.applicantDid}`, id, {
        kind: "applied",
        color: "#94a3b8",
        distance: 70,
        arrow: true,
      });
    }
    if (!clock.decided && isMine) {
      signals.push({
        severity: clock.overdue ? "bad" : "info",
        code: clock.overdue ? "decision-overdue" : "decision-due",
        nodeId: id,
        text: clock.overdue
          ? `${
              e.applicant ?? e.applicationId
            }: my decision is ${-clock.daysLeft} days past the Art. 68(4) deadline of ${
              clock.dueAt
            }.`
          : `${e.applicant ?? e.applicationId}: decision due ${clock.dueAt}, ${
              clock.daysLeft
            } days left.`,
        article: isRequest ? "Art. 69(4)" : "Art. 68(4), Art. 57(1)(j)",
      });
    }
    if (e.permitId && clock.decided) {
      const pid = `permit:${e.permitId}`;
      const pstatus: Severity | "none" =
        ps === "valid"
          ? "ok"
          : ps === "expiring"
            ? "warn"
            : ps === "refused"
              ? "warn"
              : ps === "revoked" || ps === "expired"
                ? "bad"
                : "info";
      add({
        id: pid,
        label: `${ps === "refused" ? "refusal" : "permit"} ${e.permitId}`,
        layer: "chain",
        kind: ps === "refused" ? "Refusal" : "Data permit",
        size: 1.6,
        status: pstatus,
        title: e.permitId,
        sub: `${e.applicant ?? ""}, ${ps}${
          e.validUntil ? `, valid until ${fmtDate(e.validUntil)}` : ""
        }`,
        facts: [
          ["decided", fmtDate(e.decidedAt)],
          ["valid until", fmtDate(e.validUntil)],
          ["state", ps],
          ...(e.revocationReason
            ? [["revoked", e.revocationReason] as [string, string]]
            : []),
        ],
        article:
          "Art. 68 data permit; Art. 61(1): access only under it; Art. 63 revocation",
        links: [{ href: "/permits", text: "Public register" }],
      });
      link(id, pid, {
        kind: "decided",
        color: "#94a3b8",
        distance: 50,
        arrow: true,
      });
      if (e.applicantDid) {
        link(pid, `p:${e.applicantDid}`, {
          kind: "issued to",
          status: pstatus,
          distance: 70,
        });
      }
      if (e.datasetId) {
        link(pid, `ds:${e.datasetId}`, {
          kind: "covers",
          color: "#a78bfa",
          distance: 80,
        });
      }
      if (ps === "expiring") {
        signals.push({
          severity: "warn",
          code: "permit-expiring",
          nodeId: pid,
          text: `${e.applicant}: permit ${e.permitId} lapses on ${fmtDate(
            e.validUntil,
          )}.`,
          article: "Art. 68(6)",
        });
      }
    }
  }

  // ── credentials in the wallets ────────────────────────────────────────────
  for (const c of input.credentials) {
    const holder = credHolder.get(c.credentialId);
    const state = credentialState(c, asOf);
    const isLabel = /quality/i.test(c.credentialType);
    const sev: Severity | "none" =
      state === "expired" || state === "revoked"
        ? isLabel
          ? "warn"
          : "bad"
        : state === "expiring"
          ? "warn"
          : "ok";
    const id = `vc:${c.credentialId}`;
    add({
      id,
      label: `${c.credentialType.replace(/Credential$/, "")} ${state}`,
      layer: "chain",
      kind: isLabel ? "Quality label" : "Credential",
      size: 1.2,
      status: sev,
      title: c.credentialType,
      sub: `${holder ? nameOf(holder) : "unknown holder"}, ${state}`,
      facts: [
        ["id", c.credentialId],
        ["issued", fmtDate(c.issuedAt)],
        ["expires", fmtDate(c.expiresAt)],
        ...(c.conformance != null
          ? [["conformance", String(c.conformance)] as [string, string]]
          : []),
        ...(c.purpose ? [["purpose", c.purpose] as [string, string]] : []),
      ],
      article: isLabel
        ? "Art. 78 data quality and utility label"
        : "DCP v1.0 credential; Art. 53 purpose, Art. 61 duties of users",
      links: [{ href: "/credentials", text: "Credential wallet" }],
    });
    link(id, holder ? `p:${holder}` : "me", {
      kind: "held by",
      status: sev,
      distance: 50,
    });
    if (isLabel && (state === "expired" || state === "revoked")) {
      signals.push({
        severity: "warn",
        code: "label-expired",
        nodeId: id,
        text: `${
          holder ? nameOf(holder) : "A holder"
        }: the quality label expired on ${fmtDate(
          c.expiresAt,
        )}; the datasets it covered carry no label.`,
        article: "Art. 78, Art. 57(1)(d)",
      });
    }
    if (isLabel && c.datasetId) {
      link(id, `ds:${c.datasetId}`, {
        kind: "labels",
        color: "#a78bfa",
        distance: 80,
      });
    }
  }

  // ── contracts on file ─────────────────────────────────────────────────────
  for (const c of input.contracts) {
    const id = `contract:${c.contractId}`;
    const expired = c.validUntil ? c.validUntil < asOf : false;
    add({
      id,
      label: `contract ${c.contractId}`,
      layer: "chain",
      kind: "Contract",
      size: 1.2,
      status: expired ? "warn" : "ok",
      title: c.contractId,
      sub: `DSP 2025-1 contract agreement${c.status ? `, ${c.status}` : ""}`,
      facts: [["valid until", fmtDate(c.validUntil)]],
      article:
        "DSP contract behind the flow; Art. 60(1) the holder makes data available under a permit",
    });
    if (c.consumerDid) {
      link(id, `p:${c.consumerDid}`, {
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

  // ── datasets and their use ────────────────────────────────────────────────
  const dsIds = new Set<string>([...input.datasets.map((d) => d.id)]);
  for (const e of input.events) if (e.datasetId) dsIds.add(e.datasetId);
  for (const l of links) {
    if (l.target.startsWith("ds:")) dsIds.add(l.target.slice(3));
  }
  const served = input.events.filter((e) => (e.statusCode ?? 200) < 400);
  const perDataset = aggregateMonthly(
    served,
    months,
    (e) => e.datasetId ?? null,
  );
  for (const dsId of [...dsIds].sort()) {
    const id = `ds:${dsId}`;
    const providers = new Set(
      input.events
        .filter((e) => e.datasetId === dsId && e.providerDid)
        .map((e) => e.providerDid!),
    );
    const node = add({
      id,
      label: datasetTitle.get(dsId) ?? dsId,
      layer: "data",
      kind: "Dataset",
      size: 1.8,
      color: "#a78bfa",
      title: datasetTitle.get(dsId) ?? dsId,
      sub:
        providers.size > 0
          ? `held by ${[...providers].map(nameOf).join(", ")}`
          : "in the national catalogue",
      facts: [["id", dsId]],
      article:
        "Art. 77 dataset description in the national catalogue; Art. 51 minimum categories",
      links: [{ href: "/catalog", text: "Catalogue" }],
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
    for (const prov of providers) {
      link(`p:${prov}`, id, {
        kind: "provides",
        color: "#38bdf8",
        distance: 70,
      });
    }
  }

  const refusedCount = input.events.length - served.length;
  signals.push({
    severity: "info",
    code: "access-log",
    nodeId: "me",
    text: `${
      served.length
    } accesses served and ${refusedCount} refused across ${
      Object.keys(perDataset).length
    } datasets in the last 12 months, all logged (Art. 73(1)(e)).`,
    article: "Art. 73(1)(e) log, Art. 59 reporting",
  });

  const known = new Set(nodes.map((n) => n.id));
  return {
    persona: "hdab",
    asOf,
    me: { id: me.did, name: me.name },
    title: "Compliance, in one view",
    question:
      "Which operations are non-compliant right now, and are my own decisions on time?",
    article: "Regulation (EU) 2025/327 Art. 57, 61, 63, 68, 73, 78",
    layers,
    nodes,
    links: links.filter((l) => known.has(l.source) && known.has(l.target)),
    signals: rankSignals(signals),
    legend: [
      { color: "#ef4444", text: "non-compliant now" },
      { color: "#f59e0b", text: "at risk / due soon" },
      { color: "#38bdf8", text: "information" },
      { color: "#22c55e", text: "in order" },
      { color: "#a78bfa", text: "dataset" },
      { color: "#93c5fd", text: "month (unfolded)" },
    ],
    dataNote: "Every organisation shown is fictional.",
  };
}
