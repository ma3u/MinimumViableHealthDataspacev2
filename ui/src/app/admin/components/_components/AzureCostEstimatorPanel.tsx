"use client";

import {
  AZURE_EGRESS_FREE_GIB,
  AZURE_EGRESS_USD_PER_GIB,
  AZURE_FILES_USD_PER_GIB,
  costForEnvironment,
  formatEur,
  formatUsd,
  USD_TO_EUR,
  type AcaAppSpec,
} from "@/lib/azure-pricing";
import { useMemo } from "react";
import { BarChart2, HardDrive, Network } from "lucide-react";
import {
  ACA_APP_SPECS,
  COMPUTED_STORAGE_GIB,
  EGRESS_INFRA_BASELINE_GB,
  EGRESS_PER_PARTICIPANT_MB,
  SHARE_NEO4J_DATA_GIB,
  SHARE_NEO4J_LOGS_GIB,
  SHARE_PG_DATA_GIB,
  SHARE_VAULT_DATA_GIB,
} from "./constants";
import { computeEgressGiB } from "./helpers";
import type { ComponentInfo } from "./types";

export function AzureCostEstimatorPanel({
  liveComponents,
  participantCount,
}: {
  liveComponents: ComponentInfo[];
  participantCount: number;
}) {
  // Storage and egress are derived from environment configuration + participant
  // count rather than slider input, so the figure shown is what the deployment
  // actually generates today. See COMPUTED_STORAGE_GIB / computeEgressGiB above.
  const storageGiB = COMPUTED_STORAGE_GIB;
  const egressGiB = computeEgressGiB(participantCount);

  // Prefer live memory reservations from the API (more accurate if ops changed them)
  const specs = useMemo<AcaAppSpec[]>(() => {
    return ACA_APP_SPECS.map((fallback) => {
      const live = liveComponents.find((c) => c.container === fallback.name);
      if (!live || live.mem.limitMB <= 0) return fallback;
      return {
        ...fallback,
        memGiB: Math.round((live.mem.limitMB / 1024) * 100) / 100,
      };
    });
  }, [liveComponents]);

  const cost = useMemo(
    () => costForEnvironment(specs, { storageGiB, egressGiB }),
    [specs, storageGiB, egressGiB],
  );

  const totalVcpu = specs.reduce((s, a) => s + a.cpu, 0);
  const totalMemGiB = specs.reduce((s, a) => s + a.memGiB, 0);

  return (
    <div className="border border-[var(--border)] rounded-xl p-5 mt-10 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="font-semibold text-sm flex items-center gap-2 text-[var(--text-primary)]">
          <BarChart2 size={16} className="text-[var(--success-text)]" />
          Monthly Cost Estimate — Azure Container Apps (Consumption, 24×7)
        </h2>
        <div className="flex items-center gap-4 text-xs text-[var(--text-secondary)]">
          <span
            className="flex items-center gap-1.5"
            title={`Sum of Azure Files share quotas: neo4j-data ${SHARE_NEO4J_DATA_GIB} + neo4j-logs ${SHARE_NEO4J_LOGS_GIB} + pg-data ${SHARE_PG_DATA_GIB} + vault-data ${SHARE_VAULT_DATA_GIB} GiB. Configured in scripts/azure/env.sh.`}
          >
            <HardDrive size={13} />
            Storage:{" "}
            <span className="font-mono font-semibold text-[var(--text-primary)]">
              {storageGiB} GiB
            </span>
          </span>
          <span
            className="flex items-center gap-1.5"
            title={`Estimated: (${EGRESS_PER_PARTICIPANT_MB} MB/participant × ${participantCount} participants) + ${EGRESS_INFRA_BASELINE_GB} GB infra baseline. Includes DSP messaging, audit log injection, and user-facing UI traffic.`}
          >
            <Network size={13} />
            Egress (est.):{" "}
            <span className="font-mono font-semibold text-[var(--text-primary)]">
              {egressGiB} GiB
            </span>
          </span>
        </div>
      </div>

      {/* App grid — sorted by cost descending */}
      <div>
        <p className="text-[11px] text-[var(--text-secondary)] mb-2 uppercase tracking-wide">
          Container Apps — Compute (vCPU + Memory, 24×7 minReplicas=1)
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
          {[...cost.apps]
            .sort((a, b) => b.totalUsd - a.totalUsd)
            .map((app) => {
              const spec = specs.find((s) => s.name === app.name)!;
              return (
                <div
                  key={app.name}
                  className="border border-[var(--border)] rounded-lg p-3 bg-[var(--surface)]/40"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-[var(--text-primary)] font-mono">
                      {app.name}
                    </span>
                    <span className="text-xs font-mono text-[var(--success-text)]">
                      {formatUsd(app.totalUsd)}/mo
                    </span>
                  </div>
                  <p className="text-[10px] text-[var(--text-secondary)] font-mono mb-1">
                    {spec.cpu} vCPU · {spec.memGiB} GiB RAM
                  </p>
                  <div className="flex gap-3 text-[9px] text-[var(--text-secondary)]">
                    <span>CPU {formatUsd(app.vcpuUsd)}</span>
                    <span>MEM {formatUsd(app.memUsd)}</span>
                  </div>
                </div>
              );
            })}
        </div>
        <p className="text-xs text-[var(--text-secondary)] mt-2 text-right">
          Gross compute:{" "}
          <span className="font-mono text-[var(--text-primary)]">
            {formatUsd(cost.grossVcpuUsd + cost.grossMemUsd)}/mo
          </span>{" "}
          · Free tier credit:{" "}
          <span className="font-mono text-[var(--success-text)]">
            −{formatUsd(cost.freeCreditUsd)}
          </span>
        </p>
      </div>

      {/* Storage + egress breakdown */}
      <div>
        <p className="text-[11px] text-[var(--text-secondary)] mb-2 uppercase tracking-wide">
          Storage & Network
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
          <div className="border border-[var(--border)] rounded-lg p-3 bg-[var(--surface)]/40">
            <div className="text-[var(--text-secondary)] mb-0.5">
              Azure Files (Premium ZRS)
            </div>
            <div className="font-mono text-[var(--text-primary)]">
              {formatUsd(cost.storageUsd)}/mo
            </div>
            <div className="text-[10px] text-[var(--text-secondary)] mt-1">
              {storageGiB} GiB · ${AZURE_FILES_USD_PER_GIB}/GiB·mo · Neo4j + PG
              + Vault volumes
            </div>
          </div>
          <div className="border border-[var(--border)] rounded-lg p-3 bg-[var(--surface)]/40">
            <div className="text-[var(--text-secondary)] mb-0.5">
              Egress (outbound)
            </div>
            <div className="font-mono text-[var(--text-primary)]">
              {formatUsd(cost.egressUsd)}/mo
            </div>
            <div className="text-[10px] text-[var(--text-secondary)] mt-1">
              {egressGiB} GiB · first {AZURE_EGRESS_FREE_GIB} GiB free · then $
              {AZURE_EGRESS_USD_PER_GIB}/GiB
            </div>
          </div>
          <div className="border border-[var(--border)] rounded-lg p-3 bg-[var(--surface)]/40">
            <div className="text-[var(--text-secondary)] mb-0.5">
              Environment totals
            </div>
            <div className="font-mono text-[var(--text-primary)]">
              {totalVcpu.toFixed(2)} vCPU · {totalMemGiB.toFixed(1)} GiB
            </div>
            <div className="text-[10px] text-[var(--text-secondary)] mt-1">
              {specs.length} Container Apps · Workaround B (no Log Analytics)
            </div>
          </div>
        </div>
      </div>

      {/* Totals */}
      <div className="border border-[var(--border)] rounded-xl p-4 bg-[var(--surface)]/60">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
          <div>
            <div className="text-[10px] text-[var(--text-secondary)] mb-1">
              Compute (net)
            </div>
            <div className="font-mono text-lg font-semibold text-[var(--text-primary)]">
              {formatUsd(cost.computeUsd)}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-[var(--text-secondary)] mb-1">
              Storage
            </div>
            <div className="font-mono text-lg font-semibold text-[var(--text-primary)]">
              {formatUsd(cost.storageUsd)}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-[var(--text-secondary)] mb-1">
              Egress
            </div>
            <div className="font-mono text-lg font-semibold text-[var(--text-primary)]">
              {formatUsd(cost.egressUsd)}
            </div>
          </div>
          <div className="border-l border-[var(--border)]">
            <div className="text-[10px] text-[var(--text-secondary)] mb-1">
              Total / month
            </div>
            <div className="font-mono text-xl font-bold text-[var(--success-text)]">
              {formatUsd(cost.totalUsd)}
            </div>
            <div className="text-[10px] text-[var(--text-secondary)] mt-0.5">
              ≈ {formatEur(cost.totalEur)} (@ {USD_TO_EUR} EUR/USD)
            </div>
          </div>
        </div>
        <p className="text-[9px] text-[var(--text-secondary)] mt-3 text-center">
          Azure Container Apps Consumption plan · West Europe list prices · 24×7
          minReplicas=1 · free tier (180 K vCPU-s + 360 K GiB-s) applied ·
          ADR-018 Workaround B (no Log Analytics Workspace)
        </p>
      </div>
    </div>
  );
}
