"use client";

import { useState } from "react";
import { BarChart2, Network, Users } from "lucide-react";
import {
  CP_DP_TRAFFIC_MB,
  HEALTH_DATA_STORAGE_GB,
  LOG_EUR_PER_GB,
  LOG_INJECTION_MB,
  NETWORK_EUR_PER_GB,
  PER_DATA_HOLDER_EUR,
  PER_PARTICIPANT_COMPUTE_EUR,
  PER_PARTICIPANT_STORAGE_GB,
  PER_USER_EUR,
  SHARED_EUR,
  STACKIT_NODES,
  STORAGE_EUR_PER_GB,
} from "./constants";

export function CostEstimatorPanel({
  participantCount,
}: {
  participantCount: number;
}) {
  const [count, setCount] = useState(participantCount);
  // assume 60 % data holders, 40 % data users (typical EHDS mix)
  const dataHolders = Math.round(count * 0.6);
  const dataUsers = count - dataHolders;
  const participantCost =
    dataHolders * PER_DATA_HOLDER_EUR + dataUsers * PER_USER_EUR;
  const total = SHARED_EUR + participantCost;
  const perParticipant = count > 0 ? total / count : 0;

  const networkTotal = (count * CP_DP_TRAFFIC_MB) / 1024; // GB/month total
  const logTotal = (count * LOG_INJECTION_MB) / 1024; // GB/month total

  return (
    <div className="border border-[var(--border)] rounded-xl p-5 mt-10 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="font-semibold text-sm flex items-center gap-2 text-[var(--text-primary)]">
          <BarChart2 size={16} className="text-[var(--success-text)]" />
          Monthly Cost Estimate — STACKIT (Frankfurt)
        </h2>
        <div className="flex items-center gap-3 text-xs text-[var(--text-secondary)]">
          <label className="flex items-center gap-2">
            <Users size={13} />
            Participants:
            <input
              type="range"
              min={1}
              max={200}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="w-28 accent-emerald-500"
            />
            <span className="font-mono font-semibold text-[var(--text-primary)] w-6 text-right">
              {count}
            </span>
          </label>
        </div>
      </div>

      {/* StackIT node grid */}
      <div>
        <p className="text-[11px] text-[var(--text-secondary)] mb-2 uppercase tracking-wide">
          Shared Infrastructure (fixed)
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
          {STACKIT_NODES.map((n) => (
            <div
              key={n.id}
              className="border border-[var(--border)] rounded-lg p-3 bg-[var(--surface)]/40"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-[var(--text-primary)]">
                  {n.label}
                </span>
                <span className="text-xs font-mono text-[var(--success-text)]">
                  €{n.eur}/mo
                </span>
              </div>
              <p className="text-[10px] text-[var(--text-secondary)] font-mono mb-1.5">
                {n.flavor}
              </p>
              <div className="flex flex-wrap gap-1">
                {n.components.map((c) => (
                  <span
                    key={c}
                    className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--surface-2)] text-[var(--text-secondary)]"
                  >
                    {c}
                  </span>
                ))}
              </div>
              <p className="text-[9px] text-[var(--text-secondary)] mt-1.5 leading-relaxed">
                {n.note}
              </p>
            </div>
          ))}
        </div>
        <p className="text-xs text-[var(--text-secondary)] mt-2 text-right">
          Shared fixed:{" "}
          <span className="font-mono text-[var(--text-primary)]">
            €{SHARED_EUR}/mo
          </span>
        </p>
      </div>

      {/* Per-participant breakdown */}
      <div>
        <p className="text-[11px] text-[var(--text-secondary)] mb-2 uppercase tracking-wide">
          Per-Participant Cost (2 GB allocation)
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
          <div className="border border-[var(--border)] rounded-lg p-3 bg-[var(--surface)]/40">
            <div className="text-[var(--text-secondary)] mb-0.5">Compute</div>
            <div className="font-mono text-[var(--text-primary)]">
              €{PER_PARTICIPANT_COMPUTE_EUR}/mo
            </div>
            <div className="text-[10px] text-[var(--text-secondary)] mt-1">
              1 vCPU / 2 GB — Control Plane + Identity Hub + Issuer Service
            </div>
          </div>
          <div className="border border-[var(--border)] rounded-lg p-3 bg-[var(--surface)]/40">
            <div className="text-[var(--text-secondary)] mb-0.5">Storage</div>
            <div className="font-mono text-[var(--text-primary)]">
              €{(PER_PARTICIPANT_STORAGE_GB * STORAGE_EUR_PER_GB).toFixed(2)}{" "}
              <span className="text-[var(--text-secondary)] text-[10px]">
                (+€{(HEALTH_DATA_STORAGE_GB * STORAGE_EUR_PER_GB).toFixed(2)}{" "}
                data holders)
              </span>
            </div>
            <div className="text-[10px] text-[var(--text-secondary)] mt-1">
              {PER_PARTICIPANT_STORAGE_GB} GB base · {HEALTH_DATA_STORAGE_GB} GB
              health records · €{STORAGE_EUR_PER_GB}/GB/mo
            </div>
          </div>
          <div className="border border-[var(--border)] rounded-lg p-3 bg-[var(--surface)]/40">
            <div className="flex items-center gap-1 text-[var(--text-secondary)] mb-0.5">
              <Network size={11} />
              CP↔DP Network
            </div>
            <div className="font-mono text-[var(--text-primary)]">
              €{((CP_DP_TRAFFIC_MB / 1024) * NETWORK_EUR_PER_GB).toFixed(3)}/mo
            </div>
            <div className="text-[10px] text-[var(--text-secondary)] mt-1">
              {CP_DP_TRAFFIC_MB} MB/mo per participant (DSP negotiation +
              transfer receipts + audit) · €{NETWORK_EUR_PER_GB}/GB egress
            </div>
          </div>
          <div className="border border-[var(--border)] rounded-lg p-3 bg-[var(--surface)]/40">
            <div className="text-[var(--text-secondary)] mb-0.5">
              Log Injection
            </div>
            <div className="font-mono text-[var(--text-primary)]">
              €{((LOG_INJECTION_MB / 1024) * LOG_EUR_PER_GB).toFixed(3)}/mo
            </div>
            <div className="text-[10px] text-[var(--text-secondary)] mt-1">
              {LOG_INJECTION_MB} MB/mo EHDS Article 50 audit trail → SIEM/Loki ·
              €{LOG_EUR_PER_GB}/GB
            </div>
          </div>
        </div>
      </div>

      {/* Totals */}
      <div className="border border-[var(--border)] rounded-xl p-4 bg-[var(--surface)]/60">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
          <div>
            <div className="text-[10px] text-[var(--text-secondary)] mb-1">
              Shared fixed
            </div>
            <div className="font-mono text-lg font-semibold text-[var(--text-primary)]">
              €{SHARED_EUR}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-[var(--text-secondary)] mb-1">
              {count} × participants
            </div>
            <div className="font-mono text-lg font-semibold text-[var(--text-primary)]">
              €{participantCost.toFixed(0)}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-[var(--text-secondary)] mb-1">
              Network ({(networkTotal + logTotal).toFixed(1)} GB/mo)
            </div>
            <div className="font-mono text-lg font-semibold text-[var(--text-primary)]">
              €
              {(
                networkTotal * NETWORK_EUR_PER_GB +
                logTotal * LOG_EUR_PER_GB
              ).toFixed(1)}
            </div>
          </div>
          <div className="border-l border-[var(--border)]">
            <div className="text-[10px] text-[var(--text-secondary)] mb-1">
              Total / month
            </div>
            <div className="font-mono text-xl font-bold text-[var(--success-text)]">
              €{total.toFixed(0)}
            </div>
            <div className="text-[10px] text-[var(--text-secondary)] mt-0.5">
              €{perParticipant.toFixed(2)}/participant
            </div>
          </div>
        </div>
        <p className="text-[9px] text-[var(--text-secondary)] mt-3 text-center">
          Assumes 60 % DATA_HOLDER / 40 % DATA_USER mix · STACKIT Frankfurt ·
          prices excl. VAT · does not include Kubernetes management fee or
          premium support
        </p>
      </div>
    </div>
  );
}
