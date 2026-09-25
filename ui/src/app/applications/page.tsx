"use client";

import { fetchApi } from "@/lib/api";
import {
  APPLICANT_CATEGORIES,
  APPLICANT_CATEGORY_LABELS,
  APPLICATION_ITEMS,
  IDENTIFIABILITY,
  PURPOSES,
  PURPOSE_LABELS,
  hasApplicationItem,
  type ApplicantCategory,
  type ApplicationClock,
  type ApplicationItems,
  type Completeness,
  type Purpose,
} from "@/lib/permits";
import {
  RESULT_KINDS,
  RESULT_KIND_LABELS,
  resultsDeadline,
  type ResultKind,
} from "@/lib/results";
import { estimateFee } from "@/lib/fees";
import { useDemoPersona } from "@/lib/use-demo-persona";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { FileText, ShieldCheck, AlertCircle, Clock } from "lucide-react";

/**
 * The data user's application for a data permit, Regulation (EU) 2025/327
 * Art. 67, with the eleven items of Art. 67(2), and what became of it: the
 * access body's clock (Art. 68(4)), a notice that items are missing and the
 * four weeks to supply them, the permit or the refusal, and the results the
 * user communicates once the work is done (Art. 61(4)). Issue #206, M1, M2
 * and M6.
 */

const IS_STATIC = process.env.NEXT_PUBLIC_STATIC_EXPORT === "true";

interface Application extends ApplicationItems, ApplicationClock {
  applicationId: string;
  name: string | null;
  applicant: string | null;
  applicantName: string | null;
  applicantCategory: string | null;
  datasetId: string | null;
  datasetTitle: string | null;
  purpose: string | null;
  status: string;
  submittedAt: string | null;
  justification: string | null;
  completedAt: string | null;
  extensionReason: string | null;
  incompleteNoticeAt: string | null;
  incompleteReason: string | null;
  permitId: string | null;
  decision: string | null;
  decidedAt: string | null;
  validUntil: string | null;
  decisionJustification: string | null;
  statisticalAlternativeOffered: boolean | null;
  completeness: Completeness;
  undecided: boolean;
}

interface Draft {
  name: string;
  datasetId: string;
  purpose: string;
  justification: string;
  applicantCategory: ApplicantCategory;
  namedPersons: string;
  intendedUse: string;
  requestedData: string;
  dataTimeRange: string;
  dataFormats: string;
  identifiability: string;
  pseudonymisationJustification: string;
  datasetsBroughtIn: string;
  safeguards: string;
  processingPeriodMonths: number;
  speTools: string;
  ethicsCommitteeRef: string;
  art71Exception: boolean;
  art71ExceptionJustification: string;
}

/** A complete application a researcher can send with one click in a demo. */
const DEFAULT_DRAFT: Draft = {
  name: "Real-world outcomes of second-line type 2 diabetes therapies",
  datasetId: "dataset:synthea-fhir-r4-mvd",
  purpose: "SCIENTIFIC_RESEARCH",
  justification:
    "Real-world outcomes of second-line type 2 diabetes therapies; pseudonymised cohort analysis in the secure processing environment, aggregate output only.",
  applicantCategory: "COMMERCIAL",
  namedPersons:
    "PharmaCo Research AG (did:web:pharmaco.de:research); Dr A. Weber, principal investigator; M. Costa, data scientist",
  intendedUse:
    "Compare HbA1c trajectories and cardiovascular events between second-line therapies; expected benefit: evidence for treatment guidelines and post-marketing safety.",
  requestedData:
    "Adults with a type 2 diabetes diagnosis: encounters, conditions, HbA1c and lipid observations, medication requests; sources AlphaKlinik Berlin and Limburg Medical Centre; coverage: the full synthetic cohort.",
  dataTimeRange: "2019-01-01 to 2026-08-31",
  dataFormats: "FHIR R4 (EEHRxF laboratory results), OMOP CDM 5.4",
  identifiability: "PSEUDONYMISED",
  pseudonymisationJustification:
    "Longitudinal linkage of the same person across encounters is needed for trajectories; anonymised snapshots would break it.",
  datasetsBroughtIn: "None",
  safeguards:
    "Analysis only in the secure processing environment; no record leaves it; aggregate output with counts below five suppressed; no re-identification attempt (Art. 61(2)).",
  processingPeriodMonths: 12,
  speTools: "R 4.4 with the OHDSI HADES packages, 4 vCPU, 16 GB RAM",
  ethicsCommitteeRef: "EC-PharmaCo-2026-011",
  art71Exception: false,
  art71ExceptionJustification: "",
};

function shortDate(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : "—";
}

function purposeLabel(p: string | null): string {
  if (!p) return "—";
  return (PURPOSE_LABELS as Record<string, string>)[p as Purpose] ?? p;
}

function StatusBadge({ app }: { app: Application }) {
  const d = (app.decision ?? "").toUpperCase();
  const label =
    d === "APPROVED"
      ? "data permit issued"
      : d === "REJECTED"
        ? "refused"
        : d === "REVOKED"
          ? "permit revoked"
          : app.clockState === "paused"
            ? "incomplete, please complete"
            : app.clockState === "extended"
              ? "under decision, extended"
              : "under decision";
  const cls =
    d === "APPROVED"
      ? "bg-[var(--badge-active-bg)] text-[var(--badge-active-text)] border-[var(--badge-active-border)]"
      : d === "REJECTED" || d === "REVOKED"
        ? "bg-[var(--badge-inactive-bg)] text-[var(--badge-inactive-text)] border-[var(--badge-inactive-border)]"
        : "bg-[var(--role-hdab-bg)] text-[var(--role-hdab-text)] border-[var(--role-hdab-border)]";
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded border whitespace-nowrap ${cls}`}
      data-testid="application-status"
    >
      {d === "APPROVED" ? <ShieldCheck size={12} /> : <Clock size={12} />}
      {label}
    </span>
  );
}

const inputCls =
  "rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 w-full";

function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={id} className="flex flex-col gap-1">
      <span className="text-[var(--text-secondary)]">{label}</span>
      {children}
    </label>
  );
}

/** The eleven items as inputs; used for the application and to complete it. */
function ItemFields({
  draft,
  setDraft,
  idPrefix,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  idPrefix: string;
}) {
  const set = (k: keyof Draft, v: string | number | boolean) =>
    setDraft({ ...draft, [k]: v });
  return (
    <>
      <Field
        id={`${idPrefix}-namedPersons`}
        label="(a) Applicant and the natural persons who will access the data"
      >
        <textarea
          id={`${idPrefix}-namedPersons`}
          rows={2}
          value={draft.namedPersons}
          onChange={(e) => set("namedPersons", e.target.value)}
          className={inputCls}
        />
      </Field>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field id={`${idPrefix}-purpose`} label="(b) Purpose, Art. 53(1)">
          <select
            id={`${idPrefix}-purpose`}
            value={draft.purpose}
            onChange={(e) => set("purpose", e.target.value)}
            className={inputCls}
          >
            {PURPOSES.map((p) => (
              <option key={p} value={p}>
                {PURPOSE_LABELS[p]}
              </option>
            ))}
          </select>
        </Field>
        <Field
          id={`${idPrefix}-category`}
          label="Applicant category, for the fee (Art. 62)"
        >
          <select
            id={`${idPrefix}-category`}
            value={draft.applicantCategory}
            onChange={(e) =>
              set("applicantCategory", e.target.value as ApplicantCategory)
            }
            className={inputCls}
          >
            {APPLICANT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {APPLICANT_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field
        id={`${idPrefix}-intendedUse`}
        label="(c) Intended use and the expected benefit"
      >
        <textarea
          id={`${idPrefix}-intendedUse`}
          rows={2}
          value={draft.intendedUse}
          onChange={(e) => set("intendedUse", e.target.value)}
          className={inputCls}
        />
      </Field>
      <Field
        id={`${idPrefix}-requestedData`}
        label="(d) Requested data: scope, sources and coverage"
      >
        <textarea
          id={`${idPrefix}-requestedData`}
          rows={2}
          value={draft.requestedData}
          onChange={(e) => set("requestedData", e.target.value)}
          className={inputCls}
        />
      </Field>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Field id={`${idPrefix}-datasetId`} label="(d) Dataset">
          <input
            id={`${idPrefix}-datasetId`}
            value={draft.datasetId}
            onChange={(e) => set("datasetId", e.target.value)}
            className={`${inputCls} font-mono`}
          />
        </Field>
        <Field id={`${idPrefix}-dataTimeRange`} label="(d) Time range">
          <input
            id={`${idPrefix}-dataTimeRange`}
            value={draft.dataTimeRange}
            onChange={(e) => set("dataTimeRange", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field id={`${idPrefix}-dataFormats`} label="(d) Formats">
          <input
            id={`${idPrefix}-dataFormats`}
            value={draft.dataFormats}
            onChange={(e) => set("dataFormats", e.target.value)}
            className={inputCls}
          />
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field
          id={`${idPrefix}-identifiability`}
          label="(e) Pseudonymised or anonymised"
        >
          <select
            id={`${idPrefix}-identifiability`}
            value={draft.identifiability}
            onChange={(e) => set("identifiability", e.target.value)}
            className={inputCls}
          >
            {IDENTIFIABILITY.map((v) => (
              <option key={v} value={v}>
                {v.toLowerCase()}
              </option>
            ))}
          </select>
        </Field>
        <Field
          id={`${idPrefix}-pseudonymisationJustification`}
          label="(e) Why pseudonymised data are needed"
        >
          <input
            id={`${idPrefix}-pseudonymisationJustification`}
            value={draft.pseudonymisationJustification}
            onChange={(e) =>
              set("pseudonymisationJustification", e.target.value)
            }
            disabled={draft.identifiability !== "PSEUDONYMISED"}
            className={inputCls}
          />
        </Field>
      </div>
      <Field
        id={`${idPrefix}-datasetsBroughtIn`}
        label="(f) Datasets you bring in ('None' if none)"
      >
        <input
          id={`${idPrefix}-datasetsBroughtIn`}
          value={draft.datasetsBroughtIn}
          onChange={(e) => set("datasetsBroughtIn", e.target.value)}
          className={inputCls}
        />
      </Field>
      <Field
        id={`${idPrefix}-safeguards`}
        label="(g) Safeguards against misuse and re-identification"
      >
        <textarea
          id={`${idPrefix}-safeguards`}
          rows={2}
          value={draft.safeguards}
          onChange={(e) => set("safeguards", e.target.value)}
          className={inputCls}
        />
      </Field>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Field
          id={`${idPrefix}-processingPeriodMonths`}
          label="(h) Processing period, months"
        >
          <input
            id={`${idPrefix}-processingPeriodMonths`}
            type="number"
            min={1}
            max={60}
            value={draft.processingPeriodMonths}
            onChange={(e) =>
              set("processingPeriodMonths", Number(e.target.value))
            }
            className={inputCls}
          />
        </Field>
        <Field
          id={`${idPrefix}-speTools`}
          label="(i) Tools and computing resources in the SPE"
        >
          <input
            id={`${idPrefix}-speTools`}
            value={draft.speTools}
            onChange={(e) => set("speTools", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field
          id={`${idPrefix}-ethicsCommitteeRef`}
          label="(j) Ethics assessment reference"
        >
          <input
            id={`${idPrefix}-ethicsCommitteeRef`}
            value={draft.ethicsCommitteeRef}
            onChange={(e) => set("ethicsCommitteeRef", e.target.value)}
            className={inputCls}
          />
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="flex items-start gap-2 pt-5">
          <input
            id={`${idPrefix}-art71Exception`}
            type="checkbox"
            checked={draft.art71Exception}
            onChange={(e) => set("art71Exception", e.target.checked)}
          />
          <span>
            (k) I invoke the Art. 71(4) exception (data of persons who opted
            out, for a substantial public interest)
          </span>
        </label>
        <Field
          id={`${idPrefix}-art71ExceptionJustification`}
          label="(k) Why the exception applies"
        >
          <input
            id={`${idPrefix}-art71ExceptionJustification`}
            value={draft.art71ExceptionJustification}
            onChange={(e) => set("art71ExceptionJustification", e.target.value)}
            disabled={!draft.art71Exception}
            className={inputCls}
          />
        </Field>
      </div>
    </>
  );
}

function draftBody(d: Draft): Record<string, unknown> {
  return {
    name: d.name,
    datasetId: d.datasetId,
    purpose: d.purpose,
    justification: d.justification,
    applicantCategory: d.applicantCategory,
    namedPersons: d.namedPersons,
    intendedUse: d.intendedUse,
    requestedData: d.requestedData,
    dataTimeRange: d.dataTimeRange,
    dataFormats: d.dataFormats,
    identifiability: d.identifiability,
    pseudonymisationJustification: d.pseudonymisationJustification,
    datasetsBroughtIn: d.datasetsBroughtIn,
    safeguards: d.safeguards,
    processingPeriodMonths: d.processingPeriodMonths,
    speTools: d.speTools,
    ethicsCommitteeRef: d.ethicsCommitteeRef,
    art71Exception: d.art71Exception,
    art71ExceptionJustification: d.art71ExceptionJustification,
  };
}

function draftFrom(app: Application): Draft {
  return {
    ...DEFAULT_DRAFT,
    name: app.name ?? DEFAULT_DRAFT.name,
    datasetId: app.datasetId ?? DEFAULT_DRAFT.datasetId,
    purpose: app.purpose ?? DEFAULT_DRAFT.purpose,
    justification: app.justification ?? "",
    applicantCategory:
      (app.applicantCategory as ApplicantCategory) ??
      DEFAULT_DRAFT.applicantCategory,
    namedPersons: app.namedPersons ?? DEFAULT_DRAFT.namedPersons,
    intendedUse: app.intendedUse ?? DEFAULT_DRAFT.intendedUse,
    requestedData: app.requestedData ?? DEFAULT_DRAFT.requestedData,
    dataTimeRange: app.dataTimeRange ?? DEFAULT_DRAFT.dataTimeRange,
    dataFormats: app.dataFormats ?? DEFAULT_DRAFT.dataFormats,
    identifiability: app.identifiability ?? DEFAULT_DRAFT.identifiability,
    pseudonymisationJustification:
      app.pseudonymisationJustification ??
      DEFAULT_DRAFT.pseudonymisationJustification,
    datasetsBroughtIn: app.datasetsBroughtIn ?? DEFAULT_DRAFT.datasetsBroughtIn,
    safeguards: app.safeguards ?? DEFAULT_DRAFT.safeguards,
    processingPeriodMonths:
      app.processingPeriodMonths ?? DEFAULT_DRAFT.processingPeriodMonths,
    speTools: app.speTools ?? DEFAULT_DRAFT.speTools,
    ethicsCommitteeRef:
      app.ethicsCommitteeRef ?? DEFAULT_DRAFT.ethicsCommitteeRef,
    art71Exception: app.art71Exception ?? false,
    art71ExceptionJustification: app.art71ExceptionJustification ?? "",
  };
}

/** The applicant supplies what the access body asked for (Art. 68(4)). */
function CompleteForm({
  app,
  onDone,
}: {
  app: Application;
  onDone: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<Draft>(() => draftFrom(app));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const submit = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetchApi("/api/compliance/applications/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationId: app.applicationId,
          ...draftBody(draft),
        }),
      });
      const body = (await r.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      if (!r.ok) {
        setMsg(String(body.error ?? `HTTP ${r.status}`));
        return;
      }
      const c = body.completeness as Completeness | undefined;
      setMsg(
        c?.complete
          ? `Complete application received; the access body decides by ${shortDate(
              String(body.decisionDue ?? ""),
            )} (Art. 68(4)).`
          : `Still missing: ${(c?.missing ?? [])
              .map((m) => `(${m.item})`)
              .join(" ")}`,
      );
      await onDone();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3 space-y-3 text-xs"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      aria-label="Complete the application"
      data-testid="complete-form"
    >
      <div className="font-semibold text-[var(--text-primary)]">
        Complete the application by {shortDate(app.completeBy)}
        <span className="font-normal text-[var(--text-secondary)]">
          {" "}
          · the access body wrote: {app.incompleteReason ?? "items missing"}
        </span>
      </div>
      <ItemFields
        draft={draft}
        setDraft={setDraft}
        idPrefix={`complete-${app.applicationId}`}
      />
      <button
        type="submit"
        disabled={busy}
        className="px-3 py-1.5 rounded font-semibold bg-[var(--accent)] text-white disabled:opacity-60"
      >
        {busy ? "Sending…" : "Send the missing items"}
      </button>
      {msg && (
        <p className="text-[var(--text-primary)]" role="status">
          {msg}
        </p>
      )}
    </form>
  );
}

/** Art. 61(4): the holder of a permit reports what came of the use. */
function ResultsForm({
  app,
  onDone,
}: {
  app: Application;
  onDone: () => Promise<void>;
}) {
  const [kind, setKind] = useState<ResultKind>("PUBLICATION");
  const [title, setTitle] = useState(
    "Second-line therapies and HbA1c trajectories in a synthetic type 2 diabetes cohort",
  );
  const [summary, setSummary] = useState(
    "Aggregate comparison of HbA1c trajectories and cardiovascular events; no record left the secure processing environment.",
  );
  const [url, setUrl] = useState(
    "https://example.org/pharmaco/t2d-outcomes-2026",
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const deadline = resultsDeadline(app.validUntil);
  const submit = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetchApi("/api/compliance/results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          permitId: app.permitId,
          kind,
          title,
          summary,
          url,
        }),
      });
      const body = (await r.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      if (!r.ok) {
        setMsg(String(body.error ?? `HTTP ${r.status}`));
        return;
      }
      setMsg(
        `Result ${body.resultId} communicated${
          body.onTime === false ? " after" : " within"
        } the 18 months (Art. 61(4)); it is published on the register.`,
      );
      await onDone();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3 space-y-2 text-xs"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      aria-label="Communicate results"
      data-testid="results-form"
    >
      <div className="font-semibold text-[var(--text-primary)]">
        Communicate the results of the use, Art. 61(4)
        <span className="font-normal text-[var(--text-secondary)]">
          {" "}
          · due by {shortDate(deadline)}, 18 months after the end of the
          processing
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field id={`result-kind-${app.applicationId}`} label="Kind">
          <select
            id={`result-kind-${app.applicationId}`}
            value={kind}
            onChange={(e) => setKind(e.target.value as ResultKind)}
            className={inputCls}
          >
            {RESULT_KINDS.map((k) => (
              <option key={k} value={k}>
                {RESULT_KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field
          id={`result-url-${app.applicationId}`}
          label="Link, if published"
        >
          <input
            id={`result-url-${app.applicationId}`}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className={inputCls}
          />
        </Field>
      </div>
      <Field id={`result-title-${app.applicationId}`} label="Title">
        <input
          id={`result-title-${app.applicationId}`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={inputCls}
        />
      </Field>
      <Field id={`result-summary-${app.applicationId}`} label="Summary">
        <textarea
          id={`result-summary-${app.applicationId}`}
          rows={2}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          className={inputCls}
        />
      </Field>
      <button
        type="submit"
        disabled={busy || !title.trim()}
        className="px-3 py-1.5 rounded font-semibold bg-[var(--accent)] text-white disabled:opacity-60"
      >
        {busy ? "Sending…" : "Communicate results"}
      </button>
      {msg && (
        <p className="text-[var(--text-primary)]" role="status">
          {msg}
        </p>
      )}
    </form>
  );
}

function ApplicationCard({
  app,
  onChanged,
}: {
  app: Application;
  onChanged: () => Promise<void>;
}) {
  const c = app.completeness;
  return (
    <article
      className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-sm"
      data-testid="application-card"
      data-application-id={app.applicationId}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-semibold text-[var(--text-primary)]">
            {app.name ?? app.applicationId}
          </div>
          <div className="text-xs text-[var(--text-secondary)] font-mono">
            {app.applicationId}
          </div>
        </div>
        <StatusBadge app={app} />
      </div>
      <dl className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-xs">
        <div>
          <dt className="inline text-[var(--text-secondary)]">Dataset </dt>
          <dd className="inline">{app.datasetTitle ?? app.datasetId}</dd>
        </div>
        <div>
          <dt className="inline text-[var(--text-secondary)]">Purpose </dt>
          <dd className="inline">{purposeLabel(app.purpose)}</dd>
        </div>
        <div>
          <dt className="inline text-[var(--text-secondary)]">Submitted </dt>
          <dd className="inline">{shortDate(app.submittedAt)}</dd>
        </div>
        <div data-testid="application-clock">
          <dt className="inline text-[var(--text-secondary)]">Clock </dt>
          <dd className="inline">
            {app.clockState === "paused"
              ? `stopped; complete by ${shortDate(app.completeBy)}${
                  typeof app.daysToComplete === "number"
                    ? ` (${app.daysToComplete} days)`
                    : ""
                }`
              : app.clockState === "decided"
                ? `decided ${shortDate(app.decidedAt)}`
                : app.decisionDue
                  ? `decision due ${shortDate(app.decisionDue)}${
                      app.extended ? ", extended once" : ""
                    }${
                      typeof app.daysToDecision === "number"
                        ? ` (${app.daysToDecision} days)`
                        : ""
                    }`
                  : "—"}
          </dd>
        </div>
        <div className="md:col-span-2" data-testid="application-completeness">
          <dt className="inline text-[var(--text-secondary)]">
            Art. 67(2) items{" "}
          </dt>
          <dd className="inline">
            {c.complete
              ? `complete, ${c.present} of ${c.total}`
              : `${c.present} of ${c.total}; missing ${c.missing
                  .map((m) => `(${m.item})`)
                  .join(" ")}`}
          </dd>
        </div>
        {app.undecided && (
          <div className="md:col-span-2" data-testid="application-fee">
            <dt className="inline text-[var(--text-secondary)]">
              Fee estimate, Art. 62{" "}
            </dt>
            <dd className="inline">
              {(() => {
                const f = estimateFee(app);
                return `${f.totalEur.toLocaleString(
                  "en-GB",
                )} EUR (access body ${f.bodyEur.toLocaleString(
                  "en-GB",
                )}, data holder ${f.holderEur.toLocaleString("en-GB")}${
                  f.reduction > 0
                    ? `; reduced by ${Math.round(f.reduction * 100)}% as ${
                        f.categoryLabel
                      }`
                    : ""
                })`;
              })()}
            </dd>
          </div>
        )}
        {app.extensionReason && (
          <div className="md:col-span-2">
            <dt className="inline text-[var(--text-secondary)]">
              Extended once because{" "}
            </dt>
            <dd className="inline">{app.extensionReason}</dd>
          </div>
        )}
        {app.decision && (
          <div className="md:col-span-2">
            <dt className="inline text-[var(--text-secondary)]">Decision </dt>
            <dd className="inline">
              {app.decision === "APPROVED"
                ? `data permit ${app.permitId} issued ${shortDate(
                    app.decidedAt,
                  )}, valid until ${shortDate(app.validUntil)}`
                : app.decision === "REJECTED"
                  ? `refused ${shortDate(app.decidedAt)}: ${
                      app.decisionJustification ?? ""
                    }${
                      app.statisticalAlternativeOffered
                        ? " · the access body offers an anonymised statistical answer instead (Art. 68(3)); file it under Statistical requests"
                        : ""
                    }`
                  : `permit revoked`}
            </dd>
          </div>
        )}
      </dl>
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer text-[var(--text-secondary)]">
          The eleven items as filed
        </summary>
        <ol className="mt-1 space-y-0.5">
          {APPLICATION_ITEMS.map((i) => (
            <li key={i.item}>
              <span
                className={
                  hasApplicationItem(app, i.item)
                    ? "text-[var(--success-text)]"
                    : "text-[var(--danger-text)]"
                }
              >
                {hasApplicationItem(app, i.item) ? "✓" : "✗"}
              </span>{" "}
              ({i.item}) {i.label}
            </li>
          ))}
        </ol>
      </details>
      {app.clockState === "paused" && !IS_STATIC && (
        <CompleteForm app={app} onDone={onChanged} />
      )}
      {app.decision === "APPROVED" && app.permitId && !IS_STATIC && (
        <ResultsForm app={app} onDone={onChanged} />
      )}
    </article>
  );
}

export default function ApplicationsPage() {
  const { data: session } = useSession();
  const demoPersona = useDemoPersona();
  const roles: readonly string[] = IS_STATIC
    ? demoPersona?.roles ?? []
    : (session as { roles?: string[] } | null)?.roles ?? [];
  const canApply =
    roles.includes("DATA_USER") ||
    roles.includes("EDC_USER_PARTICIPANT") ||
    roles.includes("EDC_ADMIN");

  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(DEFAULT_DRAFT);
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetchApi("/api/compliance/applications");
      const body = await r.json();
      if (!r.ok || body?.error) {
        throw new Error(body?.detail || body?.error || `HTTP ${r.status}`);
      }
      setApplications(body.applications ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async () => {
    setSubmitting(true);
    setSubmitMsg(null);
    try {
      const r = await fetchApi("/api/compliance/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draftBody(draft)),
      });
      const body = (await r.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      if (!r.ok) {
        setSubmitMsg(String(body.error ?? `HTTP ${r.status}`));
        return;
      }
      const c = body.completeness as Completeness | undefined;
      setSubmitMsg(
        body.applicationId
          ? `Application ${body.applicationId} filed${
              c ? `, ${c.present} of ${c.total} items` : ""
            }; the access body decides by ${shortDate(
              String(body.decisionDue ?? ""),
            )} (Art. 68(4)).`
          : "Application filed.",
      );
      await load();
    } catch (e) {
      setSubmitMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="page-header flex items-center gap-2">
            <FileText size={28} />
            Data permit applications
          </h1>
          <p className="text-[var(--text-secondary)] text-lg mt-1">
            Regulation (EU) 2025/327, Art. 67 · the eleven items of Art. 67(2) ·
            decided within three months (Art. 68(4))
          </p>
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 mb-8 text-sm text-[var(--text-secondary)] space-y-2">
          <p>
            A data permit is what unlocks the data (Art. 61(1)); a contract with
            the holder is not enough. The application names who will access the
            data, why, which data, pseudonymised or anonymised, the safeguards,
            the period, the tools and the ethics assessment. The access body has
            three months from a complete application; if items are missing it
            says so and you have four weeks. Decisions are published on the{" "}
            <Link
              href="/permits"
              className="font-bold text-[var(--accent)] hover:underline"
            >
              public register
            </Link>
            .
          </p>
        </div>

        {canApply && (
          <section className="mb-10 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
            <h2 className="text-sm font-semibold mb-3 text-[var(--text-primary)]">
              Apply for a data permit
            </h2>
            <form
              className="space-y-3 text-xs"
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
              aria-label="Data permit application"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field id="apply-name" label="Title of the project">
                  <input
                    id="apply-name"
                    value={draft.name}
                    onChange={(e) =>
                      setDraft({ ...draft, name: e.target.value })
                    }
                    className={inputCls}
                  />
                </Field>
                <Field
                  id="apply-justification"
                  label="Why these data are necessary (Art. 66)"
                >
                  <input
                    id="apply-justification"
                    value={draft.justification}
                    onChange={(e) =>
                      setDraft({ ...draft, justification: e.target.value })
                    }
                    className={inputCls}
                  />
                </Field>
              </div>
              <ItemFields draft={draft} setDraft={setDraft} idPrefix="apply" />
              <button
                type="submit"
                disabled={submitting || IS_STATIC}
                className="px-3 py-1.5 rounded font-semibold bg-[var(--accent)] text-white disabled:opacity-60"
                title={
                  IS_STATIC ? "Not available in the static simulation" : ""
                }
              >
                {submitting ? "Filing…" : "File the application"}
              </button>
              {submitMsg && (
                <p className="text-[var(--text-primary)]" role="status">
                  {submitMsg}
                </p>
              )}
            </form>
          </section>
        )}

        <section>
          <h2 className="text-sm font-semibold mb-3 text-[var(--text-primary)]">
            My applications ({applications.length})
          </h2>
          {loading ? (
            <p className="text-[var(--text-secondary)] text-sm">Loading…</p>
          ) : error ? (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-sm flex items-start gap-2">
              <AlertCircle size={16} className="mt-0.5" />
              <span>{error}</span>
            </div>
          ) : applications.length === 0 ? (
            <p className="text-[var(--text-secondary)] text-sm">
              No application yet
            </p>
          ) : (
            <div className="space-y-3">
              {applications.map((a) => (
                <ApplicationCard
                  key={a.applicationId}
                  app={a}
                  onChanged={load}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
