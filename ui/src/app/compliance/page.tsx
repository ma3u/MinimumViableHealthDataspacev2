"use client";

import { fetchApi } from "@/lib/api";
import {
  CRITERIA,
  CRITERIA_LABELS,
  PURPOSES,
  PURPOSE_LABELS,
  type Criterion,
} from "@/lib/permits";
import { useDemoPersona } from "@/lib/use-demo-persona";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import {
  ShieldCheck,
  AlertCircle,
  BadgeCheck,
  Key,
  Globe,
  Lock,
} from "lucide-react";
import Link from "next/link";

interface TrustCenter {
  name: string;
  operatedBy: string;
  country: string;
  status: string;
  protocol: string;
  did: string;
  hdabApprovalId: string | null;
  hdabApprovalStatus: string | null;
  datasetCount: number;
  recognisedCountries: string[];
  activeRpsnCount: number;
}

interface SpeSession {
  sessionId: string;
  studyId: string;
  status: string;
  createdBy: string;
  createdAt: string;
  kAnonymityThreshold: number;
  outputPolicy: string;
}

interface Consumer {
  id: string;
  name: string;
  type: string;
}

interface DatasetOption {
  id: string;
  title: string;
}

interface MatrixRow {
  consumerId: string;
  consumerName: string;
  consumerType: string;
  hasApplication: boolean;
  applicationStatus: string | null;
  hasApproval: boolean;
  approvalStatus: string | null;
  datasetId: string | null;
  datasetTitle: string | null;
  hasContract: boolean;
  ehdsArticle: string | null;
}

/**
 * The application behind a matrix row and the Art. 68(4) clock on it. Merged
 * into MatrixRow; every field is null for a participant without an application.
 */
interface MatrixRow {
  applicationId?: string | null;
  applicationName?: string | null;
  submittedAt?: string | null;
  requestedPurpose?: string | null;
  requestedDatasetId?: string | null;
  requestedDatasetTitle?: string | null;
  justification?: string | null;
  ethicsCommitteeRef?: string | null;
  approvalId?: string | null;
  decidedAt?: string | null;
  validUntil?: string | null;
  decisionJustification?: string | null;
  decisionDue?: string | null;
  daysToDecision?: number | null;
  revokedAt?: string | null;
  revocationReason?: string | null;
}

interface DecisionResult {
  permitId: string;
  decision: "APPROVED" | "REJECTED";
  validUntil: string | null;
  publishBy: string;
  article: string;
}

const IS_STATIC = process.env.NEXT_PUBLIC_STATIC_EXPORT === "true";

function rowKey(row: Pick<MatrixRow, "applicationId" | "consumerId">): string {
  return row.applicationId ?? row.consumerId;
}

function isUndecided(row: MatrixRow): boolean {
  return (
    row.hasApplication &&
    !row.hasApproval &&
    !["APPROVED", "REJECTED", "REVOKED"].includes(
      (row.applicationStatus ?? "").toUpperCase(),
    )
  );
}

function shortDate(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : "";
}

/** The Art. 68(4) clock as the access body reads it. */
function DecisionClock({ row }: { row: MatrixRow }) {
  if (!row.hasApplication) {
    return <span className="text-[var(--text-secondary)]">—</span>;
  }
  if (isUndecided(row) && typeof row.daysToDecision === "number") {
    const overdue = row.daysToDecision < 0;
    return (
      <span
        className={
          overdue ? "text-[var(--danger-text)]" : "text-[var(--text-primary)]"
        }
        title={`Submitted ${shortDate(
          row.submittedAt,
        )}; three months to decide (Art. 68(4))`}
      >
        {shortDate(row.decisionDue)}
        {" · "}
        {overdue
          ? `${-row.daysToDecision} days overdue`
          : `${row.daysToDecision} days left`}
      </span>
    );
  }
  if (row.decidedAt) {
    return (
      <span className="text-[var(--text-secondary)]">
        decided {shortDate(row.decidedAt)}
      </span>
    );
  }
  return <span className="text-[var(--text-secondary)]">—</span>;
}

/**
 * Revocation of an issued permit (Art. 63(3)). A refusal of a later
 * application changes nothing for a permit already issued; only this stops
 * the transfers, and the public register lists it (Art. 57(1)(j)(iv)).
 */
function RevokeForm({
  permitId,
  onDone,
}: {
  permitId: string;
  onDone: () => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const revoke = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetchApi("/api/compliance/permits/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permitId, reason }),
      });
      const body = (await r.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      if (!r.ok) {
        setError(String(body.error ?? `HTTP ${r.status}`));
        return;
      }
      setDone(
        `Data permit ${permitId} revoked; transfers under it stop now and the register lists the measure (Art. 63(3)).`,
      );
      await onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="rounded-lg border border-[var(--danger-text)]/40 bg-[var(--bg)] p-3 space-y-2 text-xs"
      onSubmit={(e) => e.preventDefault()}
      aria-label="Revoke data permit"
    >
      <div className="font-semibold text-[var(--text-primary)]">
        Revoke this permit
        <span className="font-normal text-[var(--text-secondary)]">
          {" "}
          · Art. 63(3), on non-compliance by the data user
        </span>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-[var(--text-secondary)]">
          Reason (published with the measure, Art. 57(1)(j)(iv))
        </span>
        <textarea
          id={`revoke-reason-${permitId}`}
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1"
        />
      </label>
      <button
        type="button"
        disabled={busy || !reason.trim() || done !== null}
        onClick={revoke}
        className="px-3 py-1.5 rounded font-semibold border border-[var(--danger-text)] text-[var(--danger-text)] disabled:opacity-50"
        title={reason.trim() ? "" : "A revocation needs a reason"}
      >
        {busy ? "Revoking…" : "Revoke permit"}
      </button>
      {error && (
        <p className="text-[var(--danger-text)]" role="alert">
          {error}
        </p>
      )}
      {done && (
        <p className="text-[var(--success-text)]" role="status">
          {done}
        </p>
      )}
    </form>
  );
}

/**
 * The application as submitted and, for the access body, the decision form:
 * the Art. 68(1) criteria, the Art. 53(1) purpose, validity, conditions, and
 * the written justification a refusal must carry (Art. 57(1)(j)(iii)).
 */
function ApplicationPanel({
  row,
  canDecide,
  onDecided,
}: {
  row: MatrixRow;
  canDecide: boolean;
  onDecided: () => Promise<void>;
}) {
  const [purpose, setPurpose] = useState<string>(
    row.requestedPurpose &&
      (PURPOSES as readonly string[]).includes(row.requestedPurpose)
      ? row.requestedPurpose
      : "SCIENTIFIC_RESEARCH",
  );
  const [validUntil, setValidUntil] = useState<string>(() => {
    const d = new Date();
    d.setUTCFullYear(d.getUTCFullYear() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [conditions, setConditions] = useState<string>(
    "Access only in the secure processing environment (Art. 73)\nAggregate output only; no re-identification (Art. 61(3))",
  );
  const [justification, setJustification] = useState<string>("");
  const [criteria, setCriteria] = useState<Record<Criterion, boolean>>(
    () =>
      Object.fromEntries(CRITERIA.map((c) => [c, true])) as Record<
        Criterion,
        boolean
      >,
  );
  const [busy, setBusy] = useState<"APPROVED" | "REJECTED" | null>(null);
  const [result, setResult] = useState<DecisionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!row.hasApplication || !row.applicationId) {
    return null;
  }

  const decide = async (decision: "APPROVED" | "REJECTED") => {
    setBusy(decision);
    setError(null);
    try {
      const r = await fetchApi("/api/compliance/permits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationId: row.applicationId,
          decision,
          purpose,
          validUntil: `${validUntil}T23:59:59Z`,
          conditions,
          justification,
          criteria,
          datasetId: row.requestedDatasetId ?? undefined,
        }),
      });
      const body = (await r.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      if (!r.ok) {
        setError(String(body.error ?? `HTTP ${r.status}`));
        return;
      }
      setResult(body as unknown as DecisionResult);
      await onDecided();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const undecided = isUndecided(row);

  return (
    <div className="mb-4 space-y-3" data-testid="application-panel">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-xs">
        <div>
          <span className="text-[var(--text-secondary)]">Application </span>
          <span className="font-mono">{row.applicationId}</span>
        </div>
        <div>
          <span className="text-[var(--text-secondary)]">Submitted </span>
          {shortDate(row.submittedAt) || "—"}
          {row.decisionDue && (
            <span className="text-[var(--text-secondary)]">
              {" "}
              · decision due {shortDate(row.decisionDue)} (Art. 68(4))
            </span>
          )}
        </div>
        <div>
          <span className="text-[var(--text-secondary)]">Purpose </span>
          {row.requestedPurpose ?? "—"}
        </div>
        <div>
          <span className="text-[var(--text-secondary)]">Dataset </span>
          {row.requestedDatasetTitle ?? row.requestedDatasetId ?? "—"}
        </div>
        <div className="md:col-span-2">
          <span className="text-[var(--text-secondary)]">Justification </span>
          {row.justification ?? "—"}
        </div>
        {row.ethicsCommitteeRef && (
          <div>
            <span className="text-[var(--text-secondary)]">Ethics </span>
            {row.ethicsCommitteeRef}
          </div>
        )}
        {row.hasApproval && (
          <div className="md:col-span-2">
            <span className="text-[var(--text-secondary)]">Decision </span>
            {row.approvalStatus === "REJECTED"
              ? "refused"
              : row.approvalStatus === "REVOKED"
                ? "data permit revoked"
                : "data permit issued"}
            {row.decidedAt ? ` on ${shortDate(row.decidedAt)}` : ""}
            {row.validUntil ? `, valid until ${shortDate(row.validUntil)}` : ""}
            {row.decisionJustification ? ` · ${row.decisionJustification}` : ""}
            {row.revokedAt
              ? ` · revoked ${shortDate(row.revokedAt)}${
                  row.revocationReason ? `: ${row.revocationReason}` : ""
                }`
              : ""}
          </div>
        )}
      </div>

      {canDecide && (
        <form
          className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3 space-y-3 text-xs"
          onSubmit={(e) => e.preventDefault()}
          aria-label="Data permit decision"
        >
          <div className="font-semibold text-[var(--text-primary)]">
            {undecided ? "Decide this application" : "Decide again"}
            <span className="font-normal text-[var(--text-secondary)]">
              {" "}
              · Regulation (EU) 2025/327, Art. 68
            </span>
          </div>
          <fieldset className="space-y-1">
            <legend className="text-[var(--text-secondary)] mb-1">
              Criteria assessed, Art. 68(1)
            </legend>
            {CRITERIA.map((c) => (
              <label key={c} className="flex items-start gap-2">
                <input
                  id={`criterion-${row.applicationId}-${c}`}
                  type="checkbox"
                  checked={criteria[c]}
                  onChange={(e) =>
                    setCriteria({ ...criteria, [c]: e.target.checked })
                  }
                />
                <span>
                  ({c}) {CRITERIA_LABELS[c]}
                </span>
              </label>
            ))}
          </fieldset>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[var(--text-secondary)]">
                Purpose, Art. 53(1)
              </span>
              <select
                id={`purpose-${row.applicationId}`}
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                className="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1"
              >
                {PURPOSES.map((p) => (
                  <option key={p} value={p}>
                    {PURPOSE_LABELS[p]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[var(--text-secondary)]">Valid until</span>
              <input
                id={`valid-until-${row.applicationId}`}
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
                className="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1"
              />
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-[var(--text-secondary)]">
              Conditions, one per line
            </span>
            <textarea
              id={`conditions-${row.applicationId}`}
              rows={2}
              value={conditions}
              onChange={(e) => setConditions(e.target.value)}
              className="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 font-mono"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[var(--text-secondary)]">
              Justification (required for a refusal; published with the
              decision, Art. 57(1)(j)(iii))
            </span>
            <textarea
              id={`justification-${row.applicationId}`}
              rows={2}
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              className="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => decide("APPROVED")}
              className="px-3 py-1.5 rounded font-semibold bg-[var(--accent)] text-white disabled:opacity-60"
            >
              {busy === "APPROVED" ? "Issuing…" : "Issue data permit"}
            </button>
            <button
              type="button"
              disabled={busy !== null || !justification.trim()}
              onClick={() => decide("REJECTED")}
              className="px-3 py-1.5 rounded font-semibold border border-[var(--danger-text)] text-[var(--danger-text)] disabled:opacity-50"
              title={
                justification.trim() ? "" : "A refusal needs a justification"
              }
            >
              {busy === "REJECTED" ? "Refusing…" : "Refuse"}
            </button>
          </div>
          {error && (
            <p className="text-[var(--danger-text)]" role="alert">
              {error}
            </p>
          )}
          {result && (
            <p className="text-[var(--success-text)]" role="status">
              {result.decision === "APPROVED"
                ? `Data permit ${
                    result.permitId
                  } issued, valid until ${shortDate(result.validUntil)}.`
                : `Application refused; ${result.permitId} records the justification.`}{" "}
              Publish by {result.publishBy} (Art. 57(1)(j)(iii)).
            </p>
          )}
        </form>
      )}

      {canDecide &&
        row.hasApproval &&
        row.approvalStatus === "APPROVED" &&
        row.approvalId && (
          <RevokeForm permitId={row.approvalId} onDone={onDecided} />
        )}
    </div>
  );
}

interface ChainEntry {
  consumer: string;
  applicationId: string;
  applicationStatus: string;
  approvalId: string;
  approvalStatus: string;
  ehdsArticle: string;
  dataset: string;
  contract: string;
}

interface Result {
  compliant: boolean;
  chain: ChainEntry[];
}

interface Credential {
  credentialId: string;
  credentialType: string;
  subjectDid: string;
  issuerDid: string;
  status: string;
  participantRole: string | null;
  holderName: string | null;
  holderType: string | null;
  issuedAt: string;
  expiresAt: string;
  purpose: string | null;
  datasetId: string | null;
  completeness: number | null;
  conformance: number | null;
  timeliness: number | null;
}

/** Compliance status for a single participant */
type ComplianceLevel =
  | "full"
  | "approved"
  | "pending"
  | "rejected"
  | "review"
  | "governance"
  | "revoked"
  | "none";

function complianceLevel(row: MatrixRow): ComplianceLevel {
  // HDAB authorities review others — they don't submit applications
  if (row.consumerType === "HDAB" && !row.hasApplication) return "governance";
  if (row.approvalStatus === "REVOKED" || row.applicationStatus === "REVOKED") {
    return "revoked";
  }
  if (row.approvalStatus === "REJECTED" || row.applicationStatus === "REJECTED")
    return "rejected";
  if (row.applicationStatus === "UNDER_REVIEW") return "review";
  if (row.applicationStatus === "PENDING") return "pending";
  if (row.hasApproval && row.datasetId && row.hasContract) return "full";
  if (row.hasApproval && row.datasetId) return "approved";
  if (row.hasApplication) return "pending";
  return "none";
}

const COMPLIANCE_LABELS: Record<ComplianceLevel, string> = {
  full: "Compliant",
  approved: "Approved",
  pending: "Pending",
  rejected: "Rejected",
  review: "Under Review",
  governance: "HDAB Authority",
  revoked: "Revoked",
  none: "No chain",
};

export default function CompliancePage() {
  const [_consumers, setConsumers] = useState<Consumer[]>([]);
  const [_datasets, setDatasets] = useState<DatasetOption[]>([]);
  const [matrix, setMatrix] = useState<MatrixRow[]>([]);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [trustCenters, setTrustCenters] = useState<TrustCenter[]>([]);
  const [speSessions, setSpeSessions] = useState<SpeSession[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [detailRow, setDetailRow] = useState<MatrixRow | null>(null);
  const [detailResult, setDetailResult] = useState<Result | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Only the access body decides (Art. 57(1)(a)); everyone else with access
  // to this page reads. Static demo: the persona carries the roles.
  const { data: session } = useSession();
  const demoPersona = useDemoPersona();
  const roles: readonly string[] = IS_STATIC
    ? demoPersona?.roles ?? []
    : (session as { roles?: string[] } | null)?.roles ?? [];
  const canDecide = roles.includes("HDAB_AUTHORITY");

  // After a decision the matrix and the open row are re-read from the graph.
  const reloadMatrix = async () => {
    try {
      const d = await fetchApi("/api/compliance").then((r) => r.json());
      const rows: MatrixRow[] = d.matrix ?? [];
      setMatrix(rows);
      setDetailRow((current) =>
        current
          ? rows.find((r) => rowKey(r) === rowKey(current)) ?? current
          : current,
      );
    } catch {
      // keep what is on screen
    }
  };

  // Load matrix, credentials, and trust centers on mount
  useEffect(() => {
    Promise.all([
      fetchApi("/api/compliance")
        .then((r) => r.json())
        .then((d) => {
          setConsumers(d.consumers ?? []);
          setDatasets(d.datasets ?? []);
          setMatrix(d.matrix ?? []);
        }),
      fetchApi("/api/credentials")
        .then((r) => r.json())
        .then((d) => setCredentials(d.credentials ?? []))
        .catch(() => {}),
      fetchApi("/api/trust-center")
        .then((r) => r.json())
        .then((d) => {
          setTrustCenters(d.trustCenters ?? []);
          setSpeSessions(d.speSessions ?? []);
        })
        .catch(() => {}),
    ]).finally(() => setOptionsLoading(false));
  }, []);

  // Drill down into a specific participant row
  const showDetail = async (row: MatrixRow) => {
    setDetailRow(row);
    if (!row.datasetId) {
      setDetailResult({ compliant: false, chain: [] });
      return;
    }
    setDetailLoading(true);
    try {
      const r = await fetchApi(
        `/api/compliance?consumerId=${encodeURIComponent(
          row.consumerId,
        )}&datasetId=${encodeURIComponent(row.datasetId)}`,
      );
      const data = await r.json();
      setDetailResult(data);
    } catch {
      setDetailResult({ compliant: false, chain: [] });
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <div className="max-w-5xl mx-auto px-6 py-10">
        {/* ── Page header ── */}
        <div className="mb-8">
          <h1 className="page-header">EHDS Compliance Overview</h1>
          <p className="text-[var(--text-secondary)] text-lg mt-1">
            HDAB approval chain · Regulation (EU) 2025/327, Art. 67 to 73
          </p>
          <div className="flex gap-4 mt-4 text-sm">
            <Link
              href="/eehrxf"
              className="font-bold text-[var(--accent)] hover:underline"
            >
              ← EEHRxF Profiles
            </Link>
            <Link
              href="/compliance/tck"
              className="font-bold text-[var(--accent)] hover:underline"
            >
              Protocol TCK →
            </Link>
            <Link
              href="/permits"
              className="font-bold text-[var(--accent)] hover:underline"
            >
              Public register →
            </Link>
          </div>
        </div>

        {/* ── Intro description ── */}
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 mb-8 text-sm text-[var(--text-secondary)] space-y-2">
          <p>
            The{" "}
            <strong className="text-[var(--text-primary)]">
              EHDS Compliance Matrix
            </strong>{" "}
            shows the approval chain status for every dataspace participant.
            Under Regulation (EU) 2025/327, secondary use of health data
            requires a complete chain:
          </p>
          <ol className="list-decimal list-inside space-y-1 ml-2">
            <li>
              <strong className="text-[var(--text-primary)]">
                Access Application
              </strong>{" "}
              · the data user applies with purpose, justification and ethics
              assessment (Art. 67)
            </li>
            <li>
              <strong className="text-[var(--text-primary)]">
                HDAB decision
              </strong>{" "}
              · the health data access body assesses the Art. 68(1) criteria and
              issues or refuses a data permit within three months (Art. 68)
            </li>
            <li>
              <strong className="text-[var(--text-primary)]">
                Dataset Grant
              </strong>{" "}
              · the permit names the dataset it grants access to (Art. 68(3))
            </li>
            <li>
              <strong className="text-[var(--text-primary)]">Contract</strong> ·
              the data user accesses the data only under that permit, in a
              secure processing environment (Art. 61(1), Art. 73)
            </li>
          </ol>
          <p>
            Click a row for the application and the chain. Signed in as the
            access body, the row also carries the decision: a refused or missing
            permit blocks the transfer in step 5.
          </p>
        </div>

        {/* ── Compliance Matrix ── */}
        <div className="mb-8">
          <h2 className="text-sm font-semibold mb-3 text-[var(--text-primary)]">
            Participant Compliance Matrix
          </h2>
          {optionsLoading ? (
            <div className="text-[var(--text-secondary)] text-sm">
              Loading compliance data from graph…
            </div>
          ) : matrix.length === 0 ? (
            <div className="text-[var(--text-secondary)] text-sm">
              No participants found in the knowledge graph.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
              <table className="text-xs w-full border-collapse">
                <thead>
                  <tr className="bg-[var(--surface)] text-[var(--text-secondary)]">
                    <th className="text-left px-3 py-2 font-medium">
                      Participant
                    </th>
                    <th className="text-left px-3 py-2 font-medium">Role</th>
                    <th className="text-center px-3 py-2 font-medium">
                      Application
                    </th>
                    <th className="text-center px-3 py-2 font-medium">
                      HDAB Approval
                    </th>
                    <th className="text-left px-3 py-2 font-medium">
                      Decision due
                    </th>
                    <th className="text-left px-3 py-2 font-medium">Dataset</th>
                    <th className="text-center px-3 py-2 font-medium">
                      Contract
                    </th>
                    <th className="text-center px-3 py-2 font-medium">
                      EHDS Art.
                    </th>
                    <th className="text-center px-3 py-2 font-medium">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {/* One row per application, one per participant without any.
                      The access body's inbox: undecided applications first,
                      the nearest Art. 68(4) deadline on top. */}
                  {(() => {
                    const LEVEL_RANK: Record<ComplianceLevel, number> = {
                      full: 6,
                      approved: 5,
                      review: 4,
                      pending: 3,
                      governance: 2,
                      none: 1,
                      rejected: 0,
                      revoked: 0,
                    };
                    const seen = new Map<string, MatrixRow>();
                    for (const row of matrix) {
                      const key = rowKey(row);
                      const existing = seen.get(key);
                      if (
                        !existing ||
                        LEVEL_RANK[complianceLevel(row)] >
                          LEVEL_RANK[complianceLevel(existing)]
                      ) {
                        seen.set(key, row);
                      }
                    }
                    return [...seen.values()].sort((a, b) => {
                      const ua = isUndecided(a);
                      const ub = isUndecided(b);
                      if (ua !== ub) return ua ? -1 : 1;
                      if (ua && ub) {
                        return (
                          (a.daysToDecision ?? Infinity) -
                          (b.daysToDecision ?? Infinity)
                        );
                      }
                      return a.consumerName.localeCompare(b.consumerName);
                    });
                  })().map((row) => {
                    const level = complianceLevel(row);
                    const isSelected =
                      detailRow !== null && rowKey(detailRow) === rowKey(row);
                    return (
                      <tr
                        key={rowKey(row)}
                        onClick={() => showDetail(row)}
                        className={`border-t border-[var(--border)] cursor-pointer transition-colors ${
                          isSelected
                            ? "bg-[var(--accent-surface)]"
                            : "hover:bg-[var(--surface)]"
                        }`}
                      >
                        <td className="px-3 py-2 font-medium text-[var(--text-primary)]">
                          {row.consumerName}
                        </td>
                        <td className="px-3 py-2">
                          <span className="text-[var(--text-secondary)]">
                            {row.consumerType}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center">
                          {row.hasApplication ? (
                            <span
                              className={
                                row.applicationStatus === "APPROVED"
                                  ? "text-[var(--success-text)]"
                                  : row.applicationStatus === "REJECTED"
                                    ? "text-[var(--danger-text)]"
                                    : "text-[var(--warning-text)]"
                              }
                              title={row.applicationStatus ?? ""}
                            >
                              {row.applicationStatus === "APPROVED"
                                ? "✓ Approved"
                                : row.applicationStatus === "REJECTED"
                                  ? "✗ Rejected"
                                  : row.applicationStatus === "UNDER_REVIEW"
                                    ? "◔ Under Review"
                                    : row.applicationStatus === "PENDING"
                                      ? "◔ Pending"
                                      : row.applicationStatus ?? "✓"}
                            </span>
                          ) : (
                            <span className="text-[var(--text-secondary)]">
                              —
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {row.hasApproval ? (
                            <span
                              className={
                                row.approvalStatus === "APPROVED"
                                  ? "text-[var(--success-text)]"
                                  : row.approvalStatus === "REJECTED" ||
                                      row.approvalStatus === "REVOKED"
                                    ? "text-[var(--danger-text)]"
                                    : "text-[var(--warning-text)]"
                              }
                              title={row.approvalStatus ?? ""}
                            >
                              {row.approvalStatus === "APPROVED"
                                ? "✓ Approved"
                                : row.approvalStatus === "REJECTED"
                                  ? "✗ Denied"
                                  : row.approvalStatus === "REVOKED"
                                    ? "✗ Revoked"
                                    : row.approvalStatus ?? "—"}
                            </span>
                          ) : (
                            <span className="text-[var(--text-secondary)]">
                              —
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <DecisionClock row={row} />
                        </td>
                        <td className="px-3 py-2 text-[var(--text-primary)]">
                          {row.datasetTitle ? (
                            <span title={row.datasetId ?? ""}>
                              {row.datasetTitle}
                            </span>
                          ) : (
                            <span className="text-[var(--text-secondary)]">
                              —
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {row.hasContract ? (
                            <span className="text-[var(--success-text)]">
                              ✓
                            </span>
                          ) : (
                            <span className="text-[var(--text-secondary)]">
                              —
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center text-[var(--text-secondary)]">
                          {row.ehdsArticle ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span
                            className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded border ${
                              level === "full"
                                ? "bg-[var(--badge-active-bg)] text-[var(--badge-active-text)] border-[var(--badge-active-border)]"
                                : level === "approved"
                                  ? "bg-[var(--role-holder-bg)] text-[var(--role-holder-text)] border-[var(--role-holder-border)]"
                                  : level === "pending"
                                    ? "bg-[var(--role-hdab-bg)] text-[var(--role-hdab-text)] border-[var(--role-hdab-border)]"
                                    : level === "review"
                                      ? "bg-[var(--role-hdab-bg)] text-[var(--role-hdab-text)] border-[var(--role-hdab-border)]"
                                      : level === "rejected" ||
                                          level === "revoked"
                                        ? "bg-[var(--badge-inactive-bg)] text-[var(--badge-inactive-text)] border-[var(--badge-inactive-border)]"
                                        : level === "governance"
                                          ? "bg-[var(--role-trust-bg)] text-[var(--role-trust-text)] border-[var(--role-trust-border)]"
                                          : "bg-[var(--surface-2)] text-[var(--text-secondary)] border-[var(--border)]"
                            }`}
                          >
                            {level === "full" && <ShieldCheck size={12} />}
                            {(level === "pending" || level === "review") && (
                              <AlertCircle size={12} />
                            )}
                            {(level === "rejected" || level === "revoked") && (
                              <AlertCircle size={12} />
                            )}
                            {level === "governance" && (
                              <ShieldCheck size={12} />
                            )}
                            {level === "approved" && <ShieldCheck size={12} />}
                            {COMPLIANCE_LABELS[level]}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Detail panel — shows when a row is clicked */}
          {detailRow && (
            <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm text-[var(--text-primary)]">
                  {detailRow.consumerName} — Approval Chain Detail
                </h3>
                <button
                  onClick={() => {
                    setDetailRow(null);
                    setDetailResult(null);
                  }}
                  className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  Close
                </button>
              </div>

              <ApplicationPanel
                key={rowKey(detailRow)}
                row={detailRow}
                canDecide={canDecide}
                onDecided={reloadMatrix}
              />

              {detailLoading ? (
                <div className="text-[var(--text-secondary)] text-xs">
                  Checking approval chain…
                </div>
              ) : !detailResult ? null : detailResult.compliant ? (
                <div>
                  <div className="flex items-center gap-2 mb-3 text-sm">
                    <ShieldCheck
                      size={16}
                      className="text-[var(--success-text)]"
                    />
                    <span className="text-[var(--success-text)] font-medium">
                      Full HDAB approval chain found
                    </span>
                  </div>
                  {detailResult.chain.length > 0 && (
                    <table className="text-xs w-full border-collapse">
                      <thead>
                        <tr className="text-[var(--text-secondary)] border-b border-[var(--border)]">
                          <th className="text-left pb-1">Application</th>
                          <th className="text-left pb-1">Status</th>
                          <th className="text-left pb-1">Approval</th>
                          <th className="text-left pb-1">EHDS Article</th>
                          <th className="text-left pb-1">Contract</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailResult.chain.map((c, i) => (
                          <tr
                            key={i}
                            className="border-b border-[var(--border)]"
                          >
                            <td className="py-1 pr-2 font-mono">
                              {c.applicationId}
                            </td>
                            <td className="py-1 pr-2 text-[var(--success-text)]">
                              {c.applicationStatus}
                            </td>
                            <td className="py-1 pr-2 font-mono">
                              {c.approvalId}
                            </td>
                            <td className="py-1 pr-2">{c.ehdsArticle}</td>
                            <td className="py-1 font-mono text-[var(--text-secondary)]">
                              {c.contract ?? "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              ) : (
                <div>
                  <div className="flex items-center gap-2 mb-2 text-sm">
                    <AlertCircle
                      size={16}
                      className="text-[var(--warning-text)]"
                    />
                    <span className="text-[var(--warning-text)] font-medium">
                      Incomplete approval chain
                    </span>
                  </div>
                  <div className="text-xs text-[var(--text-secondary)] space-y-1">
                    <p>
                      <strong>Application:</strong>{" "}
                      {detailRow.hasApplication
                        ? `✓ ${detailRow.applicationStatus ?? "submitted"}`
                        : "✗ No AccessApplication submitted"}
                    </p>
                    <p>
                      <strong>HDAB Approval:</strong>{" "}
                      {detailRow.hasApproval
                        ? `✓ ${detailRow.approvalStatus ?? "exists"}`
                        : "✗ No HDABApproval linked"}
                    </p>
                    <p>
                      <strong>Dataset grant:</strong>{" "}
                      {detailRow.datasetId
                        ? `✓ ${detailRow.datasetTitle}`
                        : "✗ No GRANTS_ACCESS_TO relationship to a dataset"}
                    </p>
                    <p>
                      <strong>Contract:</strong>{" "}
                      {detailRow.hasContract
                        ? "✓ Contract governs DataProduct"
                        : "✗ No Contract → DataProduct → Dataset chain"}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Verifiable Credentials Trust Section ── */}
        <div className="mt-12 border-t border-[var(--border)] pt-8">
          <div className="flex items-center gap-2 mb-1">
            <Key size={18} className="text-blue-800 dark:text-blue-300" />
            <h2 className="text-xl font-bold">EHDS Verifiable Credentials</h2>
          </div>
          <p className="text-[var(--text-secondary)] text-sm mb-6">
            DCP credential definitions registered on IssuerService — presented
            during DSP negotiation
          </p>

          {credentials.length === 0 ? (
            <div className="text-[var(--text-secondary)] text-sm">
              {optionsLoading ? "Loading…" : "No credentials found in graph."}
            </div>
          ) : (
            <div className="space-y-4">
              {credentials.map((vc) => (
                <div
                  key={vc.credentialId}
                  className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)]/50 p-4"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <BadgeCheck
                        size={16}
                        className={
                          vc.status === "active"
                            ? "text-[var(--badge-active-text)]"
                            : "text-[var(--badge-inactive-text)]"
                        }
                      />
                      <span className="font-semibold text-sm">
                        {vc.credentialType}
                      </span>
                      {vc.participantRole && (
                        <span className="text-xs px-2 py-0.5 rounded bg-[var(--layer5)]/20 text-[var(--layer5-text)]">
                          {vc.participantRole}
                        </span>
                      )}
                    </div>
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded border ${
                        vc.status === "active"
                          ? "bg-[var(--badge-active-bg)] text-[var(--badge-active-text)] border-[var(--badge-active-border)]"
                          : "bg-[var(--badge-inactive-bg)] text-[var(--badge-inactive-text)] border-[var(--badge-inactive-border)]"
                      }`}
                    >
                      {vc.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-[var(--text-secondary)]">
                    <div>
                      <span className="text-[var(--text-secondary)]">
                        Holder:
                      </span>{" "}
                      {vc.holderName ?? "—"}
                      {vc.holderType && (
                        <span className="text-[var(--text-secondary)]">
                          {" "}
                          [{vc.holderType}]
                        </span>
                      )}
                    </div>
                    <div>
                      <span className="text-[var(--text-secondary)]">
                        Subject:
                      </span>{" "}
                      <span className="font-mono">
                        {vc.subjectDid?.replace(
                          /did:web:identityhub%3A7083:/,
                          "",
                        )}
                      </span>
                    </div>
                    <div>
                      <span className="text-[var(--text-secondary)]">
                        Issuer:
                      </span>{" "}
                      <span className="font-mono">
                        {vc.issuerDid?.replace(
                          /did:web:issuerservice%3A10016:/,
                          "",
                        )}
                      </span>
                    </div>
                    <div>
                      <span className="text-[var(--text-secondary)]">
                        Format:
                      </span>{" "}
                      VC1_0_JWT
                    </div>

                    {/* Type-specific details */}
                    {vc.purpose && (
                      <div className="col-span-2">
                        <span className="text-[var(--text-secondary)]">
                          Purpose:
                        </span>{" "}
                        {vc.purpose}
                      </div>
                    )}
                    {vc.datasetId && (
                      <div className="col-span-2">
                        <span className="text-[var(--text-secondary)]">
                          Dataset:
                        </span>{" "}
                        <span className="font-mono">{vc.datasetId}</span>
                      </div>
                    )}
                    {vc.completeness != null && (
                      <div className="col-span-2 mt-1">
                        <span className="text-[var(--text-secondary)]">
                          Quality:
                        </span>{" "}
                        Completeness{" "}
                        <span className="text-[var(--success-text)]">
                          {(vc.completeness * 100).toFixed(0)}%
                        </span>
                        {" · "}Conformance{" "}
                        <span className="text-[var(--success-text)]">
                          {((vc.conformance ?? 0) * 100).toFixed(0)}%
                        </span>
                        {" · "}Timeliness{" "}
                        <span className="text-[var(--success-text)]">
                          {((vc.timeliness ?? 0) * 100).toFixed(0)}%
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Trust chain diagram */}
          <div className="mt-6 rounded-lg border border-[var(--border)] bg-[var(--surface)]/50 p-4">
            <h3 className="text-sm font-semibold mb-3 text-[var(--text-primary)]">
              DCP Trust Chain — Credential Presentation Flow
            </h3>
            <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)] flex-wrap">
              <span className="px-2 py-1 rounded bg-layer1/20 text-blue-800 dark:text-blue-300 font-medium">
                IssuerService
              </span>
              <span>→ signs VC →</span>
              <span className="px-2 py-1 rounded bg-layer2/20 text-teal-800 dark:text-teal-300 font-medium">
                IdentityHub
              </span>
              <span>→ stores →</span>
              <span className="px-2 py-1 rounded bg-layer3/20 text-green-800 dark:text-green-300 font-medium">
                DCP Presentation
              </span>
              <span>→ verifies →</span>
              <span className="px-2 py-1 rounded bg-layer5/20 text-purple-800 dark:text-purple-300 font-medium">
                Policy Engine
              </span>
              <span>→ evaluates →</span>
              <span className="px-2 py-1 rounded bg-[var(--badge-active-bg)] text-[var(--badge-active-text)] border border-[var(--badge-active-border)] font-medium">
                ✓ Access Granted
              </span>
            </div>
          </div>
        </div>

        {/* ── Phase 18: Trust Center Section ── */}
        <div
          id="trust-center"
          className="mt-12 border-t border-[var(--border)] pt-8"
        >
          <div className="flex items-center gap-2 mb-1">
            <Lock size={18} className="text-blue-800 dark:text-blue-300" />
            <h2 className="text-xl font-bold">
              Trust Center — Pseudonym Resolution
            </h2>
          </div>
          <p className="text-[var(--text-secondary)] text-sm mb-6">
            EHDS Art. 50/51 — HDAB-designated trust centers enabling
            cross-provider longitudinal patient linkage without exposing real
            identities to researchers. Provider pseudonyms are resolved to
            research pseudonyms inside the Secure Processing Environment only.
          </p>

          {optionsLoading ? (
            <div className="text-[var(--text-secondary)] text-sm">
              Loading trust centers…
            </div>
          ) : trustCenters.length === 0 ? (
            <div className="text-[var(--text-secondary)] text-sm">
              No trust centers found. Run{" "}
              <code className="font-mono text-xs bg-[var(--surface-2)] px-1 py-0.5 rounded">
                neo4j/seed-trust-center.cypher
              </code>{" "}
              to seed demo data.
            </div>
          ) : (
            <div className="space-y-4">
              {trustCenters.map((tc) => (
                <div
                  key={tc.name}
                  data-testid="trust-center-card"
                  className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)]/50 p-4"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Globe
                        size={16}
                        className="text-blue-800 dark:text-blue-300"
                      />
                      <span className="font-semibold text-sm">{tc.name}</span>
                      <span className="text-xs px-2 py-0.5 rounded bg-[var(--surface-2)] text-[var(--text-primary)]">
                        {tc.country}
                      </span>
                    </div>
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded border ${
                        tc.status === "active"
                          ? "bg-[var(--badge-active-bg)] text-[var(--badge-active-text)] border-[var(--badge-active-border)]"
                          : "bg-[var(--badge-inactive-bg)] text-[var(--badge-inactive-text)] border-[var(--badge-inactive-border)]"
                      }`}
                    >
                      {tc.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-[var(--text-secondary)] mb-3">
                    <div>
                      <span className="text-[var(--text-secondary)]">
                        Operated by:
                      </span>{" "}
                      {tc.operatedBy}
                    </div>
                    <div>
                      <span className="text-[var(--text-secondary)]">
                        Protocol:
                      </span>{" "}
                      {tc.protocol}
                    </div>
                    <div className="col-span-2">
                      <span className="text-[var(--text-secondary)]">DID:</span>{" "}
                      <span className="font-mono">{tc.did}</span>
                    </div>
                    {tc.hdabApprovalId && (
                      <div>
                        <span className="text-[var(--text-secondary)]">
                          HDAB Approval:
                        </span>{" "}
                        <span className="font-mono">{tc.hdabApprovalId}</span>{" "}
                        <span
                          className={
                            tc.hdabApprovalStatus === "approved"
                              ? "text-[var(--success-text)]"
                              : "text-[var(--warning-text)]"
                          }
                        >
                          [{tc.hdabApprovalStatus}]
                        </span>
                      </div>
                    )}
                    <div>
                      <span className="text-[var(--text-secondary)]">
                        Datasets covered:
                      </span>{" "}
                      {tc.datasetCount}
                    </div>
                    <div>
                      <span className="text-[var(--text-secondary)]">
                        Active RPSNs:
                      </span>{" "}
                      <span className="text-[var(--success-text)]">
                        {tc.activeRpsnCount}
                      </span>
                    </div>
                    {tc.recognisedCountries.length > 0 && (
                      <div className="col-span-2">
                        <span className="text-[var(--text-secondary)]">
                          Mutual recognition (EHDS Art. 51):
                        </span>{" "}
                        {tc.recognisedCountries.join(", ")}
                      </div>
                    )}
                  </div>

                  {/* Cross-border pseudonym resolution flow */}
                  <div className="rounded bg-[var(--surface)]/60 p-3 text-xs text-[var(--text-secondary)] flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-1 rounded bg-layer1/20 text-blue-800 dark:text-blue-300 font-medium">
                      Provider PSN
                    </span>
                    <span>→ HDAB-auth resolve →</span>
                    <span className="px-2 py-1 rounded bg-layer5/20 text-purple-800 dark:text-purple-300 font-medium">
                      {tc.name}
                    </span>
                    <span>→ RPSN →</span>
                    <span className="px-2 py-1 rounded bg-layer3/20 text-green-800 dark:text-green-300 font-medium">
                      SPE (TEE)
                    </span>
                    <span>→ aggregate-only →</span>
                    <span className="px-2 py-1 rounded bg-[var(--badge-active-bg)] text-[var(--badge-active-text)] border border-[var(--badge-active-border)] font-medium">
                      Researcher
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* SPE Sessions */}
          {speSessions.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-semibold mb-3 text-[var(--text-primary)]">
                Active SPE Sessions (TEE-Attested)
              </h3>
              <table className="text-xs w-full border-collapse">
                <thead>
                  <tr className="text-[var(--text-secondary)] border-b border-[var(--border)]">
                    <th className="text-left pb-1">Session ID</th>
                    <th className="text-left pb-1">Study</th>
                    <th className="text-left pb-1">Status</th>
                    <th className="text-left pb-1">k-anon</th>
                    <th className="text-left pb-1">Output Policy</th>
                    <th className="text-left pb-1">Created by</th>
                  </tr>
                </thead>
                <tbody>
                  {speSessions.map((s) => (
                    <tr
                      key={s.sessionId}
                      className="border-b border-[var(--border)]"
                      data-testid="spe-session-row"
                    >
                      <td className="py-1 pr-2 font-mono text-[var(--text-primary)]">
                        {s.sessionId}
                      </td>
                      <td className="py-1 pr-2">{s.studyId}</td>
                      <td className="py-1 pr-2">
                        <span
                          className={
                            s.status === "active"
                              ? "text-[var(--success-text)]"
                              : "text-[var(--text-secondary)]"
                          }
                        >
                          {s.status}
                        </span>
                      </td>
                      <td className="py-1 pr-2">≥ {s.kAnonymityThreshold}</td>
                      <td className="py-1 pr-2">{s.outputPolicy}</td>
                      <td className="py-1 font-mono text-[var(--text-secondary)]">
                        {s.createdBy?.split(":").pop()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Security model summary */}
          <div className="mt-6 rounded-lg border border-[var(--border)] bg-[var(--surface)]/50 p-4">
            <h3 className="text-sm font-semibold mb-3 text-[var(--text-primary)]">
              Security Model — Threat Mitigations
            </h3>
            <div className="space-y-1 text-xs text-[var(--text-secondary)]">
              {[
                [
                  "Researcher accesses raw data",
                  "SPE + TEE enforce aggregate-only output (k ≥ 5)",
                ],
                [
                  "Provider re-identification",
                  "Provider-specific pseudonyms (local key per provider)",
                ],
                [
                  "Cross-provider linkage leak",
                  "Trust Center under HDAB authority only",
                ],
                [
                  "Trust Center collusion",
                  "Stateless or key-split design; full audit trail",
                ],
                [
                  "Pseudonym reversal",
                  "One-way HMAC mapping; revocable by HDAB",
                ],
              ].map(([threat, mitigation]) => (
                <div key={threat} className="flex gap-2">
                  <span className="text-[var(--warning-text)] shrink-0">
                    ⚠
                  </span>
                  <span className="text-[var(--text-secondary)] shrink-0 w-56">
                    {threat}
                  </span>
                  <span className="text-[var(--success-text)]">
                    {mitigation}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
