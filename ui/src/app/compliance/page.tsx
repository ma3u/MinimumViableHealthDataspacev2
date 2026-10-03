"use client";

import { fetchApi } from "@/lib/api";
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
import { IS_STATIC } from "@/lib/static-export";
import { ApplicationPanel } from "./_components/ApplicationPanel";
import { DecisionClock } from "./_components/DecisionClock";
import { COMPLIANCE_LABELS } from "./_components/constants";
import { complianceLevel, isUndecided, rowKey } from "./_components/helpers";
import type {
  ComplianceLevel,
  Consumer,
  Credential,
  DatasetOption,
  MatrixRow,
  Result,
  SpeSession,
  TrustCenter,
} from "./_components/types";

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
    <div className="min-h-screen bg-(--bg)">
      <div className="max-w-5xl mx-auto px-6 py-10">
        {/* ── Page header ── */}
        <div className="mb-8">
          <h1 className="page-header">EHDS Compliance Overview</h1>
          <p className="text-(--text-secondary) text-lg mt-1">
            HDAB approval chain · Regulation (EU) 2025/327, Art. 67 to 73
          </p>
          <div className="flex gap-4 mt-4 text-sm">
            <Link
              href="/eehrxf"
              className="font-bold text-(--accent) hover:underline"
            >
              ← EEHRxF Profiles
            </Link>
            <Link
              href="/compliance/tck"
              className="font-bold text-(--accent) hover:underline"
            >
              Protocol TCK →
            </Link>
            <Link
              href="/permits"
              className="font-bold text-(--accent) hover:underline"
            >
              Public register →
            </Link>
          </div>
        </div>

        {/* ── Intro description ── */}
        <div className="rounded-lg border border-(--border) bg-(--surface) p-4 mb-8 text-sm text-(--text-secondary) space-y-2">
          <p>
            The{" "}
            <strong className="text-(--text-primary)">
              EHDS Compliance Matrix
            </strong>{" "}
            shows the approval chain status for every dataspace participant.
            Under Regulation (EU) 2025/327, secondary use of health data
            requires a complete chain:
          </p>
          <ol className="list-decimal list-inside space-y-1 ml-2">
            <li>
              <strong className="text-(--text-primary)">
                Access Application
              </strong>{" "}
              · the data user applies with purpose, justification and ethics
              assessment (Art. 67)
            </li>
            <li>
              <strong className="text-(--text-primary)">HDAB decision</strong> ·
              the health data access body assesses the Art. 68(1) criteria and
              issues or refuses a data permit within three months (Art. 68)
            </li>
            <li>
              <strong className="text-(--text-primary)">Dataset Grant</strong> ·
              the permit names the dataset it grants access to (Art. 68(3))
            </li>
            <li>
              <strong className="text-(--text-primary)">Contract</strong> · the
              data user accesses the data only under that permit, in a secure
              processing environment (Art. 61(1), Art. 73)
            </li>
          </ol>
          <p>
            <strong>Decision due:</strong> the date by which the access body
            must issue or refuse the data permit: three months after it received
            the application (Art. 68(4)). <strong>Late</strong> means the body
            has done neither by that date. The applicant may not access any data
            until it decides (Art. 61(1)), and the application and the decision
            must be published (Art. 57(1)(j)). The delay is the access
            body&apos;s compliance issue, not the applicant&apos;s.
          </p>
          <p>
            Click a row for the application and the chain. Signed in as the
            access body, the row also carries the decision: a refused or missing
            permit blocks the transfer in step 5.
          </p>
        </div>

        {/* ── Compliance Matrix ── */}
        <div className="mb-8">
          <h2 className="text-sm font-semibold mb-3 text-(--text-primary)">
            Participant Compliance Matrix
          </h2>
          {optionsLoading ? (
            <div className="text-(--text-secondary) text-sm">
              Loading compliance data from graph…
            </div>
          ) : matrix.length === 0 ? (
            <div className="text-(--text-secondary) text-sm">
              No participants found in the knowledge graph.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-(--border)">
              <table className="text-xs w-full border-collapse">
                <thead>
                  <tr className="bg-(--surface) text-(--text-secondary)">
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
                        data-application-id={row.applicationId ?? undefined}
                        onClick={() => showDetail(row)}
                        className={`border-t border-(--border) cursor-pointer transition-colors ${
                          isSelected
                            ? "bg-(--accent-surface)"
                            : "hover:bg-(--surface)"
                        }`}
                      >
                        <td className="px-3 py-2 font-medium text-(--text-primary)">
                          {row.consumerName}
                        </td>
                        <td className="px-3 py-2">
                          <span className="text-(--text-secondary)">
                            {row.consumerType}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center">
                          {row.hasApplication ? (
                            <span
                              className={
                                row.applicationStatus === "APPROVED"
                                  ? "text-(--success-text)"
                                  : row.applicationStatus === "REJECTED"
                                    ? "text-(--danger-text)"
                                    : "text-(--warning-text)"
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
                                      : row.applicationStatus === "INCOMPLETE"
                                        ? "◔ Incomplete"
                                        : row.applicationStatus ?? "✓"}
                            </span>
                          ) : (
                            <span className="text-(--text-secondary)">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {row.hasApproval ? (
                            <span
                              className={
                                row.approvalStatus === "APPROVED"
                                  ? "text-(--success-text)"
                                  : row.approvalStatus === "REJECTED" ||
                                      row.approvalStatus === "REVOKED"
                                    ? "text-(--danger-text)"
                                    : "text-(--warning-text)"
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
                            <span className="text-(--text-secondary)">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <DecisionClock row={row} />
                        </td>
                        <td className="px-3 py-2 text-(--text-primary)">
                          {row.datasetTitle ? (
                            <span title={row.datasetId ?? ""}>
                              {row.datasetTitle}
                            </span>
                          ) : (
                            <span className="text-(--text-secondary)">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {row.hasContract ? (
                            <span className="text-(--success-text)">✓</span>
                          ) : (
                            <span className="text-(--text-secondary)">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center text-(--text-secondary)">
                          {row.ehdsArticle ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span
                            className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded border ${
                              level === "full"
                                ? "bg-(--badge-active-bg) text-(--badge-active-text) border-(--badge-active-border)"
                                : level === "approved"
                                  ? "bg-(--role-holder-bg) text-(--role-holder-text) border-(--role-holder-border)"
                                  : level === "pending"
                                    ? "bg-(--role-hdab-bg) text-(--role-hdab-text) border-(--role-hdab-border)"
                                    : level === "review"
                                      ? "bg-(--role-hdab-bg) text-(--role-hdab-text) border-(--role-hdab-border)"
                                      : level === "rejected" ||
                                          level === "revoked"
                                        ? "bg-(--badge-inactive-bg) text-(--badge-inactive-text) border-(--badge-inactive-border)"
                                        : level === "governance"
                                          ? "bg-(--role-trust-bg) text-(--role-trust-text) border-(--role-trust-border)"
                                          : "bg-(--surface-2) text-(--text-secondary) border-(--border)"
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
            <div className="mt-4 rounded-xl border border-(--border) bg-(--surface) p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm text-(--text-primary)">
                  {detailRow.consumerName} — Approval Chain Detail
                </h3>
                <button
                  onClick={() => {
                    setDetailRow(null);
                    setDetailResult(null);
                  }}
                  className="text-xs text-(--text-secondary) hover:text-(--text-primary)"
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
                <div className="text-(--text-secondary) text-xs">
                  Checking approval chain…
                </div>
              ) : !detailResult ? null : detailResult.compliant ? (
                <div>
                  <div className="flex items-center gap-2 mb-3 text-sm">
                    <ShieldCheck size={16} className="text-(--success-text)" />
                    <span className="text-(--success-text) font-medium">
                      Full HDAB approval chain found
                    </span>
                  </div>
                  {detailResult.chain.length > 0 && (
                    <table className="text-xs w-full border-collapse">
                      <thead>
                        <tr className="text-(--text-secondary) border-b border-(--border)">
                          <th className="text-left pb-1">Application</th>
                          <th className="text-left pb-1">Status</th>
                          <th className="text-left pb-1">Approval</th>
                          <th className="text-left pb-1">EHDS Article</th>
                          <th className="text-left pb-1">Contract</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailResult.chain.map((c, i) => (
                          <tr key={i} className="border-b border-(--border)">
                            <td className="py-1 pr-2 font-mono">
                              {c.applicationId}
                            </td>
                            <td className="py-1 pr-2 text-(--success-text)">
                              {c.applicationStatus}
                            </td>
                            <td className="py-1 pr-2 font-mono">
                              {c.approvalId}
                            </td>
                            <td className="py-1 pr-2">{c.ehdsArticle}</td>
                            <td className="py-1 font-mono text-(--text-secondary)">
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
                    <AlertCircle size={16} className="text-(--warning-text)" />
                    <span className="text-(--warning-text) font-medium">
                      Incomplete approval chain
                    </span>
                  </div>
                  <div className="text-xs text-(--text-secondary) space-y-1">
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
        <div className="mt-12 border-t border-(--border) pt-8">
          <div className="flex items-center gap-2 mb-1">
            <Key size={18} className="text-blue-800 dark:text-blue-300" />
            <h2 className="text-xl font-bold">EHDS Verifiable Credentials</h2>
          </div>
          <p className="text-(--text-secondary) text-sm mb-6">
            DCP credential definitions registered on IssuerService — presented
            during DSP negotiation
          </p>

          {credentials.length === 0 ? (
            <div className="text-(--text-secondary) text-sm">
              {optionsLoading ? "Loading…" : "No credentials found in graph."}
            </div>
          ) : (
            <div className="space-y-4">
              {credentials.map((vc) => (
                <div
                  key={vc.credentialId}
                  className="rounded-lg border border-(--border) bg-(--surface-2)/50 p-4"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <BadgeCheck
                        size={16}
                        className={
                          vc.status === "active"
                            ? "text-(--badge-active-text)"
                            : "text-(--badge-inactive-text)"
                        }
                      />
                      <span className="font-semibold text-sm">
                        {vc.credentialType}
                      </span>
                      {vc.participantRole && (
                        <span className="text-xs px-2 py-0.5 rounded-sm bg-(--layer5)/20 text-(--layer5-text)">
                          {vc.participantRole}
                        </span>
                      )}
                    </div>
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded border ${
                        vc.status === "active"
                          ? "bg-(--badge-active-bg) text-(--badge-active-text) border-(--badge-active-border)"
                          : "bg-(--badge-inactive-bg) text-(--badge-inactive-text) border-(--badge-inactive-border)"
                      }`}
                    >
                      {vc.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-(--text-secondary)">
                    <div>
                      <span className="text-(--text-secondary)">Holder:</span>{" "}
                      {vc.holderName ?? "—"}
                      {vc.holderType && (
                        <span className="text-(--text-secondary)">
                          {" "}
                          [{vc.holderType}]
                        </span>
                      )}
                    </div>
                    <div>
                      <span className="text-(--text-secondary)">Subject:</span>{" "}
                      <span className="font-mono">
                        {vc.subjectDid?.replace(
                          /did:web:identityhub%3A7083:/,
                          "",
                        )}
                      </span>
                    </div>
                    <div>
                      <span className="text-(--text-secondary)">Issuer:</span>{" "}
                      <span className="font-mono">
                        {vc.issuerDid?.replace(
                          /did:web:issuerservice%3A10016:/,
                          "",
                        )}
                      </span>
                    </div>
                    <div>
                      <span className="text-(--text-secondary)">Format:</span>{" "}
                      VC1_0_JWT
                    </div>

                    {/* Type-specific details */}
                    {vc.purpose && (
                      <div className="col-span-2">
                        <span className="text-(--text-secondary)">
                          Purpose:
                        </span>{" "}
                        {vc.purpose}
                      </div>
                    )}
                    {vc.datasetId && (
                      <div className="col-span-2">
                        <span className="text-(--text-secondary)">
                          Dataset:
                        </span>{" "}
                        <span className="font-mono">{vc.datasetId}</span>
                      </div>
                    )}
                    {vc.completeness != null && (
                      <div className="col-span-2 mt-1">
                        <span className="text-(--text-secondary)">
                          Quality:
                        </span>{" "}
                        Completeness{" "}
                        <span className="text-(--success-text)">
                          {(vc.completeness * 100).toFixed(0)}%
                        </span>
                        {" · "}Conformance{" "}
                        <span className="text-(--success-text)">
                          {((vc.conformance ?? 0) * 100).toFixed(0)}%
                        </span>
                        {" · "}Timeliness{" "}
                        <span className="text-(--success-text)">
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
          <div className="mt-6 rounded-lg border border-(--border) bg-(--surface)/50 p-4">
            <h3 className="text-sm font-semibold mb-3 text-(--text-primary)">
              DCP Trust Chain — Credential Presentation Flow
            </h3>
            <div className="flex items-center gap-2 text-xs text-(--text-secondary) flex-wrap">
              <span className="px-2 py-1 rounded-sm bg-layer1/20 text-blue-800 dark:text-blue-300 font-medium">
                IssuerService
              </span>
              <span>→ signs VC →</span>
              <span className="px-2 py-1 rounded-sm bg-layer2/20 text-teal-800 dark:text-teal-300 font-medium">
                IdentityHub
              </span>
              <span>→ stores →</span>
              <span className="px-2 py-1 rounded-sm bg-layer3/20 text-green-800 dark:text-green-300 font-medium">
                DCP Presentation
              </span>
              <span>→ verifies →</span>
              <span className="px-2 py-1 rounded-sm bg-layer5/20 text-purple-800 dark:text-purple-300 font-medium">
                Policy Engine
              </span>
              <span>→ evaluates →</span>
              <span className="px-2 py-1 rounded-sm bg-(--badge-active-bg) text-(--badge-active-text) border border-(--badge-active-border) font-medium">
                ✓ Access Granted
              </span>
            </div>
          </div>
        </div>

        {/* ── Phase 18: Trust Center Section ── */}
        <div
          id="trust-center"
          className="mt-12 border-t border-(--border) pt-8"
        >
          <div className="flex items-center gap-2 mb-1">
            <Lock size={18} className="text-blue-800 dark:text-blue-300" />
            <h2 className="text-xl font-bold">
              Trust Center — Pseudonym Resolution
            </h2>
          </div>
          <p className="text-(--text-secondary) text-sm mb-6">
            EHDS Art. 50/51 — HDAB-designated trust centers enabling
            cross-provider longitudinal patient linkage without exposing real
            identities to researchers. Provider pseudonyms are resolved to
            research pseudonyms inside the Secure Processing Environment only.
          </p>

          {optionsLoading ? (
            <div className="text-(--text-secondary) text-sm">
              Loading trust centers…
            </div>
          ) : trustCenters.length === 0 ? (
            <div className="text-(--text-secondary) text-sm">
              No trust centers found. Run{" "}
              <code className="font-mono text-xs bg-(--surface-2) px-1 py-0.5 rounded-sm">
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
                  className="rounded-lg border border-(--border) bg-(--surface-2)/50 p-4"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Globe
                        size={16}
                        className="text-blue-800 dark:text-blue-300"
                      />
                      <span className="font-semibold text-sm">{tc.name}</span>
                      <span className="text-xs px-2 py-0.5 rounded-sm bg-(--surface-2) text-(--text-primary)">
                        {tc.country}
                      </span>
                    </div>
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded border ${
                        tc.status === "active"
                          ? "bg-(--badge-active-bg) text-(--badge-active-text) border-(--badge-active-border)"
                          : "bg-(--badge-inactive-bg) text-(--badge-inactive-text) border-(--badge-inactive-border)"
                      }`}
                    >
                      {tc.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-(--text-secondary) mb-3">
                    <div>
                      <span className="text-(--text-secondary)">
                        Operated by:
                      </span>{" "}
                      {tc.operatedBy}
                    </div>
                    <div>
                      <span className="text-(--text-secondary)">Protocol:</span>{" "}
                      {tc.protocol}
                    </div>
                    <div className="col-span-2">
                      <span className="text-(--text-secondary)">DID:</span>{" "}
                      <span className="font-mono">{tc.did}</span>
                    </div>
                    {tc.hdabApprovalId && (
                      <div>
                        <span className="text-(--text-secondary)">
                          HDAB Approval:
                        </span>{" "}
                        <span className="font-mono">{tc.hdabApprovalId}</span>{" "}
                        <span
                          className={
                            tc.hdabApprovalStatus === "approved"
                              ? "text-(--success-text)"
                              : "text-(--warning-text)"
                          }
                        >
                          [{tc.hdabApprovalStatus}]
                        </span>
                      </div>
                    )}
                    <div>
                      <span className="text-(--text-secondary)">
                        Datasets covered:
                      </span>{" "}
                      {tc.datasetCount}
                    </div>
                    <div>
                      <span className="text-(--text-secondary)">
                        Active RPSNs:
                      </span>{" "}
                      <span className="text-(--success-text)">
                        {tc.activeRpsnCount}
                      </span>
                    </div>
                    {tc.recognisedCountries.length > 0 && (
                      <div className="col-span-2">
                        <span className="text-(--text-secondary)">
                          Mutual recognition (EHDS Art. 51):
                        </span>{" "}
                        {tc.recognisedCountries.join(", ")}
                      </div>
                    )}
                  </div>

                  {/* Cross-border pseudonym resolution flow */}
                  <div className="rounded-sm bg-(--surface)/60 p-3 text-xs text-(--text-secondary) flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-1 rounded-sm bg-layer1/20 text-blue-800 dark:text-blue-300 font-medium">
                      Provider PSN
                    </span>
                    <span>→ HDAB-auth resolve →</span>
                    <span className="px-2 py-1 rounded-sm bg-layer5/20 text-purple-800 dark:text-purple-300 font-medium">
                      {tc.name}
                    </span>
                    <span>→ RPSN →</span>
                    <span className="px-2 py-1 rounded-sm bg-layer3/20 text-green-800 dark:text-green-300 font-medium">
                      SPE (TEE)
                    </span>
                    <span>→ aggregate-only →</span>
                    <span className="px-2 py-1 rounded-sm bg-(--badge-active-bg) text-(--badge-active-text) border border-(--badge-active-border) font-medium">
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
              <h3 className="text-sm font-semibold mb-3 text-(--text-primary)">
                Active SPE Sessions (TEE-Attested)
              </h3>
              <table className="text-xs w-full border-collapse">
                <thead>
                  <tr className="text-(--text-secondary) border-b border-(--border)">
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
                      className="border-b border-(--border)"
                      data-testid="spe-session-row"
                    >
                      <td className="py-1 pr-2 font-mono text-(--text-primary)">
                        {s.sessionId}
                      </td>
                      <td className="py-1 pr-2">{s.studyId}</td>
                      <td className="py-1 pr-2">
                        <span
                          className={
                            s.status === "active"
                              ? "text-(--success-text)"
                              : "text-(--text-secondary)"
                          }
                        >
                          {s.status}
                        </span>
                      </td>
                      <td className="py-1 pr-2">≥ {s.kAnonymityThreshold}</td>
                      <td className="py-1 pr-2">{s.outputPolicy}</td>
                      <td className="py-1 font-mono text-(--text-secondary)">
                        {s.createdBy?.split(":").pop()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Security model summary */}
          <div className="mt-6 rounded-lg border border-(--border) bg-(--surface)/50 p-4">
            <h3 className="text-sm font-semibold mb-3 text-(--text-primary)">
              Security Model — Threat Mitigations
            </h3>
            <div className="space-y-1 text-xs text-(--text-secondary)">
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
                  <span className="text-(--warning-text) shrink-0">⚠</span>
                  <span className="text-(--text-secondary) shrink-0 w-56">
                    {threat}
                  </span>
                  <span className="text-(--success-text)">{mitigation}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
