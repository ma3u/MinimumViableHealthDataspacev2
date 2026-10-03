"use client";

import { ArrowRight, ArrowLeft } from "lucide-react";

export function statusBadge(status: string) {
  const map: Record<string, string> = {
    COMPLETED:
      "bg-(--role-user-bg) text-(--role-user-text) border border-(--role-user-border)",
    CONFIRMED:
      "bg-(--role-holder-bg) text-(--role-holder-text) border border-(--role-holder-border)",
    FINALIZED:
      "bg-(--role-holder-bg) text-(--role-holder-text) border border-(--role-holder-border)",
    IN_PROGRESS:
      "bg-(--role-hdab-bg) text-(--role-hdab-text) border border-(--role-hdab-border)",
    TERMINATED:
      "bg-(--role-admin-bg) text-(--role-admin-text) border border-(--role-admin-border)",
    ERROR:
      "bg-(--role-admin-bg) text-(--role-admin-text) border border-(--role-admin-border)",
  };
  return (
    <span
      className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${
        map[status] ?? "bg-(--surface-2) text-(--text-secondary)"
      }`}
    >
      {status}
    </span>
  );
}

export function ehdsArticle(policyId?: string) {
  if (!policyId) return null;
  if (policyId.includes("53c") || policyId.includes("research"))
    return <span className="text-(--role-trust-text)">Art. 53(c)</span>;
  if (policyId.includes("art7") || policyId.includes("cross-border"))
    return <span className="text-(--role-hdab-text)">Art. 7</span>;
  return <span className="text-(--text-secondary)">{policyId}</span>;
}

function shortHash(h?: string) {
  if (!h) return "—";
  return (
    <span title={h} className="font-mono text-(--text-secondary)">
      {h.slice(0, 8)}
    </span>
  );
}

export function formatBytes(b?: number) {
  if (!b) return "—";
  if (b >= 1_048_576) return `${(b / 1_048_576).toFixed(1)} MB`;
  if (b >= 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${b} B`;
}

export function directionBadge(direction?: string) {
  if (!direction) return null;
  if (direction === "OUTGOING")
    return (
      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-sm text-[10px] font-semibold bg-(--role-patient-bg) text-(--role-patient-text) border border-(--role-patient-border)">
        <ArrowRight size={9} /> OUT
      </span>
    );
  return (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-sm text-[10px] font-semibold bg-(--role-user-bg) text-(--role-user-text) border border-(--role-user-border)">
      <ArrowLeft size={9} /> IN
    </span>
  );
}

export function accessTypeBadge(t?: string) {
  if (!t) return <span className="text-(--text-secondary)">—</span>;
  const cls =
    t === "INITIAL_TRANSFER"
      ? "bg-(--role-holder-bg) text-(--role-holder-text) border border-(--role-holder-border)"
      : "bg-(--role-trust-bg) text-(--role-trust-text) border border-(--role-trust-border)";
  return (
    <span
      className={`inline-block px-1.5 py-0.5 rounded-sm text-[10px] font-semibold uppercase ${cls}`}
    >
      {t === "INITIAL_TRANSFER" ? "Transfer" : "Query"}
    </span>
  );
}

export function displayName(name?: string, did?: string, country?: string) {
  const label =
    name || did?.replace("did:web:", "").replace(/%3A/g, ":") || "—";
  return country ? `${label} (${country})` : label;
}

export function exportCSV(rows: Record<string, unknown>[], filename: string) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const header = keys.join(",");
  const body = rows
    .map((r) => keys.map((k) => JSON.stringify(r[k] ?? "")).join(","))
    .join("\n");
  const blob = new Blob([`${header}\n${body}`], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}
