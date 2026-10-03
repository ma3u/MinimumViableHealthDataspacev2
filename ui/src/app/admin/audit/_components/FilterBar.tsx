"use client";

import { Filter, X } from "lucide-react";
import { NEGOTIATION_STATUSES, TRANSFER_STATUSES } from "./constants";
import type { AuditFilters, AuditType, Participant } from "./types";

export function FilterBar({
  filters,
  onChange,
  onClear,
  participants,
  tab,
}: {
  filters: AuditFilters;
  onChange: (f: Partial<AuditFilters>) => void;
  onClear: () => void;
  participants: Participant[];
  tab: AuditType;
}) {
  const statuses =
    tab === "transfers" ? TRANSFER_STATUSES : NEGOTIATION_STATUSES;
  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <div className="flex flex-wrap items-end gap-2 p-3 mb-4 bg-[var(--surface)] border border-[var(--border)] rounded-lg text-xs">
      <Filter
        size={13}
        className="text-[var(--text-secondary)] self-center mt-4"
      />

      {/* Date range */}
      <div className="flex flex-col gap-1">
        <label className="text-[var(--text-secondary)]">From</label>
        <input
          aria-label="From date"
          type="date"
          value={filters.dateFrom}
          onChange={(e) => onChange({ dateFrom: e.target.value })}
          className="bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1 text-[var(--text-primary)] w-32"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-[var(--text-secondary)]">To</label>
        <input
          aria-label="To date"
          type="date"
          value={filters.dateTo}
          onChange={(e) => onChange({ dateTo: e.target.value })}
          className="bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1 text-[var(--text-primary)] w-32"
        />
      </div>

      {/* Status */}
      {tab !== "all" && tab !== "credentials" && (
        <div className="flex flex-col gap-1">
          <label className="text-[var(--text-secondary)]">Status</label>
          <select
            aria-label="Status"
            value={filters.status}
            onChange={(e) => onChange({ status: e.target.value })}
            className="bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1 text-[var(--text-primary)] w-36"
          >
            <option value="">All statuses</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Consumer */}
      {tab !== "credentials" && (
        <div className="flex flex-col gap-1">
          <label className="text-[var(--text-secondary)]">Consumer</label>
          <select
            aria-label="Consumer"
            value={filters.consumerDid}
            onChange={(e) => onChange({ consumerDid: e.target.value })}
            className="bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1 text-[var(--text-primary)] w-44"
          >
            <option value="">All consumers</option>
            {participants.map((p) => (
              <option key={p.did} value={p.did}>
                {p.name} ({p.country ?? "?"})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Provider */}
      {tab !== "credentials" && (
        <div className="flex flex-col gap-1">
          <label className="text-[var(--text-secondary)]">Provider</label>
          <select
            aria-label="Provider"
            value={filters.providerDid}
            onChange={(e) => onChange({ providerDid: e.target.value })}
            className="bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1 text-[var(--text-primary)] w-44"
          >
            <option value="">All providers</option>
            {participants.map((p) => (
              <option key={p.did} value={p.did}>
                {p.name} ({p.country ?? "?"})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Cross-border */}
      {tab !== "credentials" && (
        <div className="flex flex-col gap-1">
          <label className="text-[var(--text-secondary)]">Cross-border</label>
          <select
            aria-label="Cross-border"
            value={filters.crossBorder}
            onChange={(e) => onChange({ crossBorder: e.target.value })}
            className="bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1 text-[var(--text-primary)] w-32"
          >
            <option value="">All</option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        </div>
      )}

      {hasFilters && (
        <button
          onClick={onClear}
          className="flex items-center gap-1 mt-4 px-2 py-1 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)] transition-colors"
        >
          <X size={11} /> Clear
        </button>
      )}
    </div>
  );
}
