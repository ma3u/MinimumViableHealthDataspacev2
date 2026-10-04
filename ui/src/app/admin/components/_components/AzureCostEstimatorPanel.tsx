"use client";

import {
  AZURE_BILLED,
  AZURE_EGRESS_FREE_GIB,
  costForEnvironment,
  formatEur,
  OFFICE_HOURS_PER_MONTH,
  type AcaAppSpec,
} from "@/lib/azure-pricing";
import { useMemo } from "react";
import { BarChart2, Clock, Database, HardDrive, Network } from "lucide-react";
import {
  ACA_APP_SPECS,
  AZURE_PG_FLEX,
  COMPUTED_STORAGE_GIB,
  EGRESS_INFRA_BASELINE_GB,
  EGRESS_PER_PARTICIPANT_MB,
  LOG_ANALYTICS_GB_PER_MONTH,
  SHARE_NEO4J_DATA_GIB,
  SHARE_NEO4J_LOGS_GIB,
  SHARE_PG_DATA_GIB,
  SHARE_VAULT_DATA_GIB,
} from "./constants";
import { computeEgressGiB } from "./helpers";
import type { ComponentInfo } from "./types";

function Card({
  title,
  eur,
  detail,
}: {
  title: string;
  eur: number;
  detail: string;
}) {
  return (
    <div className="border border-(--border) rounded-lg p-3 bg-(--surface)/40">
      <div className="text-(--text-secondary) mb-0.5">{title}</div>
      <div className="font-mono text-(--text-primary)">{formatEur(eur)}/mo</div>
      <div className="text-[10px] text-(--text-secondary) mt-1">{detail}</div>
    </div>
  );
}

export function AzureCostEstimatorPanel({
  liveComponents,
  participantCount,
}: {
  liveComponents: ComponentInfo[];
  participantCount: number;
}) {
  const storageGiB = COMPUTED_STORAGE_GIB;
  const egressGiB = computeEgressGiB(participantCount);

  // Prefer the live memory reservation from the API, in case ops changed it.
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
    () =>
      costForEnvironment(specs, {
        pgFlex: AZURE_PG_FLEX,
        fileSharesGib: storageGiB,
        logAnalyticsGb: LOG_ANALYTICS_GB_PER_MONTH,
        egressGiB,
      }),
    [specs, storageGiB, egressGiB],
  );

  const totalVcpu = specs.reduce((s, a) => s + a.cpu, 0);
  const totalMemGiB = specs.reduce((s, a) => s + a.memGiB, 0);
  const platformEur =
    cost.filesEur + cost.logsEur + cost.registryEur + cost.egressEur;

  return (
    <div className="border border-(--border) rounded-xl p-5 mt-10 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="font-semibold text-sm flex items-center gap-2 text-(--text-primary)">
          <BarChart2 size={16} className="text-(--success-text)" />
          Monthly Cost Estimate: Azure (running, West Europe)
        </h2>
        <div className="flex items-center gap-4 text-xs text-(--text-secondary)">
          <span
            className="flex items-center gap-1.5"
            title="Mon-Fri 07:00-20:00 Europe/Berlin, .github/workflows/aca-schedule.yml (ADR-053). Every app and the Flexible Server stop outside it; the UI answers with the offline notice at min=0."
          >
            <Clock size={13} />
            Schedule:{" "}
            <span className="font-mono font-semibold text-(--text-primary)">
              {Math.round(OFFICE_HOURS_PER_MONTH)} h/mo
            </span>
          </span>
          <span
            className="flex items-center gap-1.5"
            title={`Azure Files share quotas: neo4j-data ${SHARE_NEO4J_DATA_GIB} + neo4j-logs ${SHARE_NEO4J_LOGS_GIB} + pg-data ${SHARE_PG_DATA_GIB} + vault-data ${SHARE_VAULT_DATA_GIB} GiB (scripts/azure/env.sh).`}
          >
            <HardDrive size={13} />
            Files:{" "}
            <span className="font-mono font-semibold text-(--text-primary)">
              {storageGiB} GiB
            </span>
          </span>
          <span
            className="flex items-center gap-1.5"
            title={`Estimated: ${EGRESS_PER_PARTICIPANT_MB} MB per participant × ${participantCount} + ${EGRESS_INFRA_BASELINE_GB} GB baseline.`}
          >
            <Network size={13} />
            Egress (est.):{" "}
            <span className="font-mono font-semibold text-(--text-primary)">
              {egressGiB} GiB
            </span>
          </span>
        </div>
      </div>

      {/* App grid, most expensive first */}
      <div>
        <p className="text-[11px] text-(--text-secondary) mb-2 uppercase tracking-wide">
          Container Apps: compute (vCPU + memory reservation)
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
          {[...cost.apps]
            .sort((a, b) => b.totalEur - a.totalEur)
            .map((app) => {
              const spec = specs.find((s) => s.name === app.name)!;
              return (
                <div
                  key={app.name}
                  className="border border-(--border) rounded-lg p-3 bg-(--surface)/40"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-(--text-primary) font-mono">
                      {app.name}
                    </span>
                    <span className="text-xs font-mono text-(--success-text)">
                      {formatEur(app.totalEur)}/mo
                    </span>
                  </div>
                  <p className="text-[10px] text-(--text-secondary) font-mono mb-1">
                    {spec.cpu} vCPU · {spec.memGiB} GiB RAM ·{" "}
                    {app.schedule === "always" ? "24×7" : "office hours"}
                  </p>
                  {app.schedule === "always" && (
                    <div className="flex gap-3 text-[9px] text-(--text-secondary)">
                      <span>active {formatEur(app.activeEur)}</span>
                      <span>idle {formatEur(app.idleEur)}</span>
                    </div>
                  )}
                </div>
              );
            })}
        </div>
        <p className="text-xs text-(--text-secondary) mt-2 text-right">
          Gross compute:{" "}
          <span className="font-mono text-(--text-primary)">
            {formatEur(cost.grossComputeEur)}/mo
          </span>{" "}
          · Free grant:{" "}
          <span className="font-mono text-(--success-text)">
            −{formatEur(cost.freeCreditEur)}
          </span>{" "}
          · {specs.length} apps · {totalVcpu.toFixed(2)} vCPU ·{" "}
          {totalMemGiB.toFixed(1)} GiB
        </p>
      </div>

      {/* Database and platform services */}
      <div>
        <p className="text-[11px] text-(--text-secondary) mb-2 uppercase tracking-wide">
          Database and platform
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 text-xs">
          <div className="border border-(--border) rounded-lg p-3 bg-(--surface)/40 lg:col-span-1">
            <div className="flex items-center gap-1 text-(--text-secondary) mb-0.5">
              <Database size={11} />
              PostgreSQL Flexible Server
            </div>
            <div className="font-mono text-(--text-primary)">
              {formatEur(cost.pgFlexEur)}/mo
            </div>
            <div className="text-[10px] text-(--text-secondary) mt-1">
              {AZURE_PG_FLEX.sku} ·{" "}
              {AZURE_PG_FLEX.schedule === "always" ? "24×7" : "office hours"}{" "}
              {formatEur(cost.pgFlexComputeEur)} · {AZURE_PG_FLEX.storageGb} GB{" "}
              {formatEur(cost.pgFlexStorageEur)} · Keycloak, EDC, CFM, Vault
              (ADR-041, ADR-046)
            </div>
          </div>
          <Card
            title="Azure Files (Standard LRS)"
            eur={cost.filesEur}
            detail={`≤ ${storageGiB} GiB stored + transactions, which are most of it`}
          />
          <Card
            title="Log Analytics"
            eur={cost.logsEur}
            detail={`${LOG_ANALYTICS_GB_PER_MONTH} GB/mo ingested (measured)`}
          />
          <Card
            title="Container Registry"
            eur={cost.registryEur}
            detail="Basic tier, per day"
          />
          <Card
            title="Egress"
            eur={cost.egressEur}
            detail={`${egressGiB} GiB · first ${AZURE_EGRESS_FREE_GIB} GiB free`}
          />
        </div>
      </div>

      {/* Totals */}
      <div className="border border-(--border) rounded-xl p-4 bg-(--surface)/60">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
          <div>
            <div className="text-[10px] text-(--text-secondary) mb-1">
              Compute (net)
            </div>
            <div className="font-mono text-lg font-semibold text-(--text-primary)">
              {formatEur(cost.computeEur)}
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
              Platform
            </div>
            <div className="font-mono text-lg font-semibold text-(--text-primary)">
              {formatEur(platformEur)}
            </div>
          </div>
          <div className="border-l border-(--border)">
            <div className="text-[10px] text-(--text-secondary) mb-1">
              Total / month
            </div>
            <div className="font-mono text-xl font-bold text-(--success-text)">
              {formatEur(cost.totalEur)}
            </div>
            <div
              className="text-[10px] text-(--text-secondary) mt-0.5"
              title="Cost Management, actual cost of rg-mvhd-dev. Higher than the estimate while crashed revisions keep replicas that the evening stop does not reach."
            >
              billed {AZURE_BILLED.from} to {AZURE_BILLED.to}:{" "}
              {formatEur(AZURE_BILLED.eur)}
            </div>
          </div>
        </div>
        <p className="text-[9px] text-(--text-secondary) mt-3 text-center">
          EUR, as billed · Container Apps rates from the subscription&apos;s
          bill, the rest from the Azure retail price list (2026-10-03) ·
          everything stops outside Mon-Fri 07-20 (ADR-053) · Azure OpenAI, Key
          Vault and Communication Services are usage based and near €0
        </p>
      </div>
    </div>
  );
}
