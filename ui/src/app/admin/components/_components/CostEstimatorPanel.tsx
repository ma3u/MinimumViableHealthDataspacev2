"use client";

import { useState } from "react";
import { BarChart2, Database, Users } from "lucide-react";
import { formatEur, HOURS_PER_MONTH } from "@/lib/azure-pricing";
import {
  DATA_HOLDER_EXTRA_STORAGE_GB,
  PARTICIPANT_STORAGE_GB,
  STACKIT_BOOT_DISK_GB,
  STACKIT_DATA_DISK_GB,
  STACKIT_LOGS_EUR_PER_GB,
  STACKIT_PG_FLEX,
  STACKIT_SERVERS,
  stackitCost,
} from "@/lib/stackit-pricing";

/** What the same stack would cost on fixed STACKIT servers (not deployed). */
export function CostEstimatorPanel({
  participantCount,
}: {
  participantCount: number;
}) {
  const [count, setCount] = useState(participantCount);
  const cost = stackitCost(count);
  const perParticipant = count > 0 ? cost.participantsEur / count : 0;

  return (
    <div className="border border-(--border) rounded-xl p-5 mt-10 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="font-semibold text-sm flex items-center gap-2 text-(--text-primary)">
          <BarChart2 size={16} className="text-(--success-text)" />
          Monthly Cost Estimate: STACKIT (static, EU01 Germany, not deployed)
        </h2>
        <div className="flex items-center gap-3 text-xs text-(--text-secondary)">
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
            <span className="font-mono font-semibold text-(--text-primary) w-6 text-right">
              {count}
            </span>
          </label>
        </div>
      </div>

      {/* Servers */}
      <div>
        <p className="text-[11px] text-(--text-secondary) mb-2 uppercase tracking-wide">
          Servers (24×7, Docker Compose)
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
          {STACKIT_SERVERS.map((n) => (
            <div
              key={n.id}
              className="border border-(--border) rounded-lg p-3 bg-(--surface)/40"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-(--text-primary)">
                  {n.label}
                </span>
                <span className="text-xs font-mono text-(--success-text)">
                  {formatEur(n.eurPerHour * HOURS_PER_MONTH)}/mo
                </span>
              </div>
              <p className="text-[10px] text-(--text-secondary) font-mono mb-1.5">
                {n.flavor} · {n.vcpu} vCPU / {n.ramGb} GB
              </p>
              <div className="flex flex-wrap gap-1">
                {n.components.map((c) => (
                  <span
                    key={c}
                    className="text-[9px] px-1.5 py-0.5 rounded-sm bg-(--surface-2) text-(--text-secondary)"
                  >
                    {c}
                  </span>
                ))}
              </div>
              <p className="text-[9px] text-(--text-secondary) mt-1.5 leading-relaxed">
                {n.note}
              </p>
            </div>
          ))}
          <div className="border border-(--border) rounded-lg p-3 bg-(--surface)/40">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-(--text-primary) flex items-center gap-1">
                <Database size={11} />
                PostgreSQL Flex
              </span>
              <span className="text-xs font-mono text-(--success-text)">
                {formatEur(cost.pgFlexEur)}/mo
              </span>
            </div>
            <p className="text-[10px] text-(--text-secondary) font-mono mb-1.5">
              {STACKIT_PG_FLEX.flavor} · {STACKIT_PG_FLEX.storageGb} GB
            </p>
            <p className="text-[9px] text-(--text-secondary) leading-relaxed">
              Managed, like the Azure Flexible Server. The smallest flavor is 2
              vCPU / 4 GB, twice the Azure B1ms; storage pays the{" "}
              {STACKIT_PG_FLEX.performanceClass} class plus capacity and backup.
            </p>
          </div>
        </div>
      </div>

      {/* Shared extras and participants */}
      <div>
        <p className="text-[11px] text-(--text-secondary) mb-2 uppercase tracking-wide">
          Storage, network, logs and participants
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
          <div className="border border-(--border) rounded-lg p-3 bg-(--surface)/40">
            <div className="text-(--text-secondary) mb-0.5">Block storage</div>
            <div className="font-mono text-(--text-primary)">
              {formatEur(cost.disksEur)}/mo
            </div>
            <div className="text-[10px] text-(--text-secondary) mt-1">
              {STACKIT_SERVERS.length} boot disks × {STACKIT_BOOT_DISK_GB} GB +{" "}
              {STACKIT_DATA_DISK_GB} GB data · perf1 class per disk + capacity
            </div>
          </div>
          <div className="border border-(--border) rounded-lg p-3 bg-(--surface)/40">
            <div className="text-(--text-secondary) mb-0.5">
              Load balancer + public IP
            </div>
            <div className="font-mono text-(--text-primary)">
              {formatEur(cost.networkEur)}/mo
            </div>
            <div className="text-[10px] text-(--text-secondary) mt-1">
              Essential NLB · one IPv4 · no egress fee in the price list
            </div>
          </div>
          <div className="border border-(--border) rounded-lg p-3 bg-(--surface)/40">
            <div className="text-(--text-secondary) mb-0.5">Logs</div>
            <div className="font-mono text-(--text-primary)">
              {formatEur(cost.logsEur)}/mo
            </div>
            <div className="text-[10px] text-(--text-secondary) mt-1">
              The Azure stack&apos;s 18.3 GB/mo · €{STACKIT_LOGS_EUR_PER_GB}
              /GB ingest + 30 days retention
            </div>
          </div>
          <div className="border border-(--border) rounded-lg p-3 bg-(--surface)/40">
            <div className="text-(--text-secondary) mb-0.5">
              {count} participants
            </div>
            <div className="font-mono text-(--text-primary)">
              {formatEur(cost.participantsEur)}/mo
            </div>
            <div className="text-[10px] text-(--text-secondary) mt-1">
              Contexts in one EDC-V, no servers of their own ·{" "}
              {PARTICIPANT_STORAGE_GB} GB each, +{DATA_HOLDER_EXTRA_STORAGE_GB}{" "}
              GB per data holder · audit log
            </div>
          </div>
        </div>
      </div>

      {/* Totals */}
      <div className="border border-(--border) rounded-xl p-4 bg-(--surface)/60">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
          <div>
            <div className="text-[10px] text-(--text-secondary) mb-1">
              Servers
            </div>
            <div className="font-mono text-lg font-semibold text-(--text-primary)">
              {formatEur(cost.serversEur)}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-(--text-secondary) mb-1">
              PostgreSQL Flex
            </div>
            <div className="font-mono text-lg font-semibold text-(--text-primary)">
              {formatEur(cost.pgFlexEur)}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-(--text-secondary) mb-1">
              Storage, network, logs, participants
            </div>
            <div className="font-mono text-lg font-semibold text-(--text-primary)">
              {formatEur(
                cost.disksEur +
                  cost.networkEur +
                  cost.logsEur +
                  cost.participantsEur,
              )}
            </div>
          </div>
          <div className="border-l border-(--border)">
            <div className="text-[10px] text-(--text-secondary) mb-1">
              Total / month
            </div>
            <div className="font-mono text-xl font-bold text-(--success-text)">
              {formatEur(cost.totalEur)}
            </div>
            <div className="text-[10px] text-(--text-secondary) mt-0.5">
              {formatEur(perParticipant)} more per participant
            </div>
          </div>
        </div>
        <p className="text-[9px] text-(--text-secondary) mt-3 text-center">
          STACKIT public price list (pim.api.stackit.cloud, 2026-10-03) · EUR
          excl. VAT · {HOURS_PER_MONTH} h/month · 60 % data holders · no
          container registry or support plan
        </p>
      </div>
    </div>
  );
}
