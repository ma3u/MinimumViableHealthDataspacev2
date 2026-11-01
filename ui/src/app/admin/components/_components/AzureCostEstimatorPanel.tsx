"use client";

import {
  ACI_CONFIDENTIAL_RATES,
  AZURE_BILLED,
  AZURE_EGRESS_FREE_GIB,
  costForEnvironment,
  formatEur,
  OFFICE_HOURS_PER_MONTH,
  type AcaAppSpec,
} from "@/lib/azure-pricing";
import { useMemo } from "react";
import {
  BarChart2,
  Clock,
  Cpu,
  Database,
  HardDrive,
  Network,
} from "lucide-react";
import { ADR_068_URL } from "@/lib/spe";
import {
  ACA_APP_SPECS,
  ACI_SPE_DETAILS,
  ACI_SPE_GROUPS,
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
import { useT } from "@/lib/i18n/translate";

function Card({
  title,
  eur,
  detail,
}: {
  title: string;
  eur: number;
  detail: string;
}) {
  const t = useT("admin");
  return (
    <div className="border border-(--border) rounded-lg p-3 bg-(--surface)/40">
      <div className="text-(--text-secondary) mb-0.5">{title}</div>
      <div className="font-mono text-(--text-primary)">
        {t("{eur}/mo", { eur: formatEur(eur) })}
      </div>
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
  const t = useT("admin");
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
        aciGroups: ACI_SPE_GROUPS,
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
          {t("Monthly Cost Estimate: Azure (running, West Europe)")}
        </h2>
        <div className="flex items-center gap-4 text-xs text-(--text-secondary)">
          <span
            className="flex items-center gap-1.5"
            title={t(
              "Mon-Fri 07:00-20:00 Europe/Berlin, .github/workflows/aca-schedule.yml (ADR-053). Every app and the Flexible Server stop outside it; the UI answers with the offline notice at min=0.",
            )}
          >
            <Clock size={13} />
            {t("Schedule:")}{" "}
            <span className="font-mono font-semibold text-(--text-primary)">
              {t("{n} h/mo", { n: Math.round(OFFICE_HOURS_PER_MONTH) })}
            </span>
          </span>
          <span
            className="flex items-center gap-1.5"
            title={t(
              "Azure Files share quotas: neo4j-data {a} + neo4j-logs {b} + pg-data {c} + vault-data {d} GiB (scripts/azure/env.sh).",
              {
                a: SHARE_NEO4J_DATA_GIB,
                b: SHARE_NEO4J_LOGS_GIB,
                c: SHARE_PG_DATA_GIB,
                d: SHARE_VAULT_DATA_GIB,
              },
            )}
          >
            <HardDrive size={13} />
            {t("Files:")}{" "}
            <span className="font-mono font-semibold text-(--text-primary)">
              {storageGiB} GiB
            </span>
          </span>
          <span
            className="flex items-center gap-1.5"
            title={t(
              "Estimated: {mb} MB per participant × {n} + {gb} GB baseline.",
              {
                mb: EGRESS_PER_PARTICIPANT_MB,
                n: participantCount,
                gb: EGRESS_INFRA_BASELINE_GB,
              },
            )}
          >
            <Network size={13} />
            {t("Egress (est.):")}{" "}
            <span className="font-mono font-semibold text-(--text-primary)">
              {egressGiB} GiB
            </span>
          </span>
        </div>
      </div>

      {/* App grid, most expensive first */}
      <div>
        <p className="text-[11px] text-(--text-secondary) mb-2 uppercase tracking-wide">
          {t("Container Apps: compute (vCPU + memory reservation)")}
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
                      {t("{eur}/mo", { eur: formatEur(app.totalEur) })}
                    </span>
                  </div>
                  <p className="text-[10px] text-(--text-secondary) font-mono mb-1">
                    {spec.cpu} vCPU · {spec.memGiB} GiB RAM ·{" "}
                    {app.schedule === "always" ? "24×7" : t("office hours")}
                  </p>
                  {app.schedule === "always" && (
                    <div className="flex gap-3 text-[9px] text-(--text-secondary)">
                      <span>
                        {t("active {eur}", { eur: formatEur(app.activeEur) })}
                      </span>
                      <span>
                        {t("idle {eur}", { eur: formatEur(app.idleEur) })}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
        </div>
        <p className="text-xs text-(--text-secondary) mt-2 text-right">
          {t("Gross compute:")}{" "}
          <span className="font-mono text-(--text-primary)">
            {t("{eur}/mo", { eur: formatEur(cost.grossComputeEur) })}
          </span>{" "}
          · {t("Free grant:")}{" "}
          <span className="font-mono text-(--success-text)">
            −{formatEur(cost.freeCreditEur)}
          </span>{" "}
          · {t("{n} apps", { n: specs.length })} · {totalVcpu.toFixed(2)} vCPU ·{" "}
          {totalMemGiB.toFixed(1)} GiB
        </p>
      </div>

      {/* Database and platform services */}
      <div>
        <p className="text-[11px] text-(--text-secondary) mb-2 uppercase tracking-wide">
          {t("Database and platform")}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 text-xs">
          <div className="border border-(--border) rounded-lg p-3 bg-(--surface)/40 lg:col-span-1">
            <div className="flex items-center gap-1 text-(--text-secondary) mb-0.5">
              <Database size={11} />
              PostgreSQL Flexible Server
            </div>
            <div className="font-mono text-(--text-primary)">
              {t("{eur}/mo", { eur: formatEur(cost.pgFlexEur) })}
            </div>
            <div className="text-[10px] text-(--text-secondary) mt-1">
              {AZURE_PG_FLEX.sku} ·{" "}
              {AZURE_PG_FLEX.schedule === "always" ? "24×7" : t("office hours")}{" "}
              {formatEur(cost.pgFlexComputeEur)} · {AZURE_PG_FLEX.storageGb} GB{" "}
              {formatEur(cost.pgFlexStorageEur)} · Keycloak, EDC, CFM, Vault
              (ADR-041, ADR-046)
            </div>
          </div>
          <Card
            title="Azure Files (Standard LRS)"
            eur={cost.filesEur}
            detail={t("≤ {n} GiB stored + transactions, which are most of it", {
              n: storageGiB,
            })}
          />
          <Card
            title="Log Analytics"
            eur={cost.logsEur}
            detail={t("{n} GB/mo ingested (measured)", {
              n: LOG_ANALYTICS_GB_PER_MONTH,
            })}
          />
          <Card
            title="Container Registry"
            eur={cost.registryEur}
            detail={t("Basic tier, per day")}
          />
          <Card
            title={t("Egress")}
            eur={cost.egressEur}
            detail={t("{n} GiB · first {free} GiB free", {
              n: egressGiB,
              free: AZURE_EGRESS_FREE_GIB,
            })}
          />
        </div>
      </div>

      {/* The SPE workspaces as ACI confidential container groups (ADR-069) */}
      <div>
        <p className="text-[11px] text-(--text-secondary) mb-2 uppercase tracking-wide">
          {t("Secure processing environments (ACI confidential containers)")}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          {cost.aciGroups.map((g) => {
            const spec = ACI_SPE_GROUPS.find((x) => x.name === g.name);
            return (
              <section
                key={g.name}
                aria-label={t("{name} cost", { name: g.name })}
                className="border border-(--border) rounded-lg p-3 bg-(--surface)/40"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="flex items-center gap-1 text-(--text-primary) font-mono">
                    <Cpu size={11} aria-hidden="true" />
                    {g.name}
                  </span>
                  <span className="font-mono text-(--success-text)">
                    {t("{eur}/mo", { eur: formatEur(g.totalEur) })}
                  </span>
                </div>
                <p className="text-[10px] text-(--text-secondary) mt-1 font-mono">
                  {spec?.containers
                    .map((c) => `${c.name} ${c.cpu} vCPU ${c.memGiB} GB`)
                    .join(" + ")}{" "}
                  = {g.cpu} vCPU, {g.memGiB} GB
                </p>
                <p className="text-[10px] text-(--text-secondary) mt-1">
                  {ACI_SPE_DETAILS.tee}, sku {ACI_SPE_DETAILS.sku},{" "}
                  {ACI_SPE_DETAILS.region} ·{" "}
                  {t("{eur} an hour, billed only while running", {
                    eur: formatEur(g.hourlyEur),
                  })}{" "}
                  ·{" "}
                  {g.schedule === "always"
                    ? "24×7"
                    : t("stopped off hours (ADR-053)")}
                </p>
              </section>
            );
          })}
        </div>
        <p className="text-[10px] text-(--text-secondary) mt-2">
          {t(
            'Meters "Confidential containers ACI vCPU Duration" €{vcpu} per vCPU-hour and "Confidential containers ACI Memory Duration" €{mem} per GB-hour, westeurope, Azure retail price list read {date} · ADR-069 (proposed, #774) ·',
            {
              vcpu: ACI_CONFIDENTIAL_RATES.vcpuEurPerHour,
              mem: ACI_CONFIDENTIAL_RATES.memEurPerGbHour,
              date: ACI_CONFIDENTIAL_RATES.readOn,
            },
          )}{" "}
          <a
            href={ADR_068_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-(--accent) hover:underline"
          >
            ADR-068
          </a>
        </p>
      </div>

      {/* Totals */}
      <div className="border border-(--border) rounded-xl p-4 bg-(--surface)/60">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-center">
          <div>
            <div className="text-[10px] text-(--text-secondary) mb-1">
              {t("Compute (net)")}
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
              {t("SPE workspaces")}
            </div>
            <div className="font-mono text-lg font-semibold text-(--text-primary)">
              {formatEur(cost.aciEur)}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-(--text-secondary) mb-1">
              {t("Platform")}
            </div>
            <div className="font-mono text-lg font-semibold text-(--text-primary)">
              {formatEur(platformEur)}
            </div>
          </div>
          <div className="border-l border-(--border)">
            <div className="text-[10px] text-(--text-secondary) mb-1">
              {t("Total / month")}
            </div>
            <div className="font-mono text-xl font-bold text-(--success-text)">
              {formatEur(cost.totalEur)}
            </div>
            <div
              className="text-[10px] text-(--text-secondary) mt-0.5"
              title={t(
                "Cost Management, actual cost of rg-mvhd-dev. Higher than the estimate while crashed revisions keep replicas that the evening stop does not reach.",
              )}
            >
              {t("billed {from} to {to}: {eur}", {
                from: AZURE_BILLED.from,
                to: AZURE_BILLED.to,
                eur: formatEur(AZURE_BILLED.eur),
              })}
            </div>
          </div>
        </div>
        <p className="text-[9px] text-(--text-secondary) mt-3 text-center">
          {t(
            "EUR, as billed · Container Apps rates from the subscription's bill, the rest from the Azure retail price list (2026-10-03, the ACI confidential groups 2026-10-31) · everything stops outside Mon-Fri 07-20 (ADR-053) · Azure OpenAI, Key Vault and Communication Services are usage based and near €0",
          )}
        </p>
      </div>
    </div>
  );
}
