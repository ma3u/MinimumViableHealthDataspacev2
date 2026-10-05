/**
 * Monthly cost model for the Azure deployment (rg-mvhd-dev, West Europe).
 *
 * Everything is in EUR, the currency the subscription is billed in. Sources,
 * read on 2026-10-03:
 *
 *   - Container Apps compute: the effective rates on the bill for
 *     2026-09-03 to 2026-10-02 (Cost Management, grouped by meter). The retail
 *     price API rounds the per-second EUR prices to 0, so the bill is the
 *     only EUR source; it agrees with the USD list ($0.000034 vCPU-s,
 *     $0.000004 GiB-s) within the exchange rate.
 *   - PostgreSQL Flexible Server, Azure Files, Container Registry, egress:
 *     the Azure Retail Prices API (prices.azure.com, currencyCode=EUR).
 *   - Log Analytics: the bill (EUR 43.57 for 18.3 GB ingested).
 *
 * Off-hours: `.github/workflows/aca-schedule.yml` stops every app and the
 * Flexible Server outside Mon-Fri 07:00-20:00 Europe/Berlin (ADR-053). A
 * stopped app bills nothing. The "always" schedule stays in the model for an
 * app that is kept up: it bills the idle rate when the office is closed.
 */

// ─── Rates (EUR) ─────────────────────────────────────────────────────────────

const ACA_VCPU_EUR_PER_SEC = 0.0000259;
const ACA_MEM_EUR_PER_GIB_SEC = 0.00000304;
const ACA_IDLE_EUR_PER_UNIT_SEC = 0.00000301; // per vCPU-s and per GiB-s

const ACA_FREE_VCPU_SECONDS = 180_000;
const ACA_FREE_MEM_GIB_SECONDS = 360_000;

// Azure Database for PostgreSQL Flexible Server (ADR-041)
const PG_FLEX_SKU_EUR_PER_HOUR: Record<string, number> = {
  Standard_B1ms: 0.0175,
  Standard_B2s: 0.07,
  Standard_B2ms: 0.1401,
};
const PG_FLEX_STORAGE_EUR_PER_GB = 0.1205;

// Azure Files, Standard LRS (stmvhddev3e2079), pay-as-you-go on data stored
const AZURE_FILES_EUR_PER_GB = 0.0528;
// Transactions, which dominate on Standard Files: the bill above showed
// EUR 11.13 for Files against at most EUR 1.95 of stored data.
const AZURE_FILES_TRANSACTIONS_EUR = 9.2;

const ACR_BASIC_EUR_PER_DAY = 0.1466;
const LOG_ANALYTICS_EUR_PER_GB = 2.38;

export const AZURE_EGRESS_FREE_GIB = 100;
const AZURE_EGRESS_EUR_PER_GIB = 0.0704;

export const HOURS_PER_MONTH = 730;
// Mon-Fri 07:00-20:00: 13 h x 5 days x 52 weeks / 12 months
export const OFFICE_HOURS_PER_MONTH = (13 * 5 * 52) / 12;

// What the resource group was actually billed, for comparison on the page.
export const AZURE_BILLED = {
  from: "2026-09-03",
  to: "2026-10-02",
  eur: 741.38,
};

// ─── Inputs ──────────────────────────────────────────────────────────────────

export type AcaSchedule = "office" | "always";

export interface AcaAppSpec {
  name: string;
  cpu: number; // vCPU reservation, all containers incl. sidecars
  memGiB: number; // memory reservation, all containers incl. sidecars
  schedule: AcaSchedule;
}

export interface PgFlexSpec {
  name: string;
  sku: string; // key of PG_FLEX_SKU_EUR_PER_HOUR
  storageGb: number;
  // "office": stopped off hours, so compute bills office hours only; a
  // stopped server still pays for its storage.
  schedule: AcaSchedule;
}

export interface AzureEnvironmentInputs {
  pgFlex: PgFlexSpec;
  fileSharesGib: number; // sum of share quotas, an upper bound on data stored
  logAnalyticsGb: number;
  egressGiB: number;
}

// ─── Results ─────────────────────────────────────────────────────────────────

export interface AcaAppCost {
  name: string;
  schedule: AcaSchedule;
  activeEur: number;
  idleEur: number;
  totalEur: number;
}

export interface AzureEnvironmentCost {
  apps: AcaAppCost[];
  grossComputeEur: number;
  freeCreditEur: number;
  computeEur: number;
  pgFlexEur: number;
  pgFlexComputeEur: number;
  pgFlexStorageEur: number;
  filesEur: number;
  registryEur: number;
  logsEur: number;
  egressEur: number;
  totalEur: number;
}

export function costForApp(spec: AcaAppSpec): AcaAppCost & {
  vcpuSeconds: number;
  memGiBSeconds: number;
} {
  const activeSec = OFFICE_HOURS_PER_MONTH * 3600;
  const idleSec =
    spec.schedule === "always"
      ? (HOURS_PER_MONTH - OFFICE_HOURS_PER_MONTH) * 3600
      : 0;
  const activeEur =
    activeSec *
    (spec.cpu * ACA_VCPU_EUR_PER_SEC + spec.memGiB * ACA_MEM_EUR_PER_GIB_SEC);
  const idleEur =
    idleSec * (spec.cpu + spec.memGiB) * ACA_IDLE_EUR_PER_UNIT_SEC;
  return {
    name: spec.name,
    schedule: spec.schedule,
    activeEur,
    idleEur,
    totalEur: activeEur + idleEur,
    vcpuSeconds: spec.cpu * activeSec,
    memGiBSeconds: spec.memGiB * activeSec,
  };
}

export function pgFlexMonthlyEur(pg: PgFlexSpec) {
  const hourly = PG_FLEX_SKU_EUR_PER_HOUR[pg.sku] ?? 0;
  const computeHours =
    pg.schedule === "office" ? OFFICE_HOURS_PER_MONTH : HOURS_PER_MONTH;
  const computeEur = hourly * computeHours;
  // Backup storage up to 100 % of the provisioned size is included; seven
  // days of retention on a database this small stays under it. Beyond it,
  // backup costs EUR 0.0906 per GB-month.
  const storageEur = pg.storageGb * PG_FLEX_STORAGE_EUR_PER_GB;
  return { computeEur, storageEur, totalEur: computeEur + storageEur };
}

/**
 * Monthly cost of the environment: Container Apps on the off-hours schedule
 * with the subscription's free grant taken off, plus the managed Postgres and
 * the services every deployment pays for.
 */
export function costForEnvironment(
  specs: AcaAppSpec[],
  inputs: AzureEnvironmentInputs,
): AzureEnvironmentCost {
  const detailed = specs.map(costForApp);
  const grossComputeEur = detailed.reduce((s, a) => s + a.totalEur, 0);

  // The free grant is consumed by active usage first.
  const vcpuSeconds = detailed.reduce((s, a) => s + a.vcpuSeconds, 0);
  const memGiBSeconds = detailed.reduce((s, a) => s + a.memGiBSeconds, 0);
  const freeCreditEur =
    Math.min(vcpuSeconds, ACA_FREE_VCPU_SECONDS) * ACA_VCPU_EUR_PER_SEC +
    Math.min(memGiBSeconds, ACA_FREE_MEM_GIB_SECONDS) * ACA_MEM_EUR_PER_GIB_SEC;
  const computeEur = Math.max(0, grossComputeEur - freeCreditEur);

  const pg = pgFlexMonthlyEur(inputs.pgFlex);
  const filesEur =
    inputs.fileSharesGib * AZURE_FILES_EUR_PER_GB +
    AZURE_FILES_TRANSACTIONS_EUR;
  const registryEur = ACR_BASIC_EUR_PER_DAY * (HOURS_PER_MONTH / 24);
  const logsEur = inputs.logAnalyticsGb * LOG_ANALYTICS_EUR_PER_GB;
  const egressEur =
    Math.max(0, inputs.egressGiB - AZURE_EGRESS_FREE_GIB) *
    AZURE_EGRESS_EUR_PER_GIB;

  return {
    apps: detailed.map(({ vcpuSeconds: _v, memGiBSeconds: _m, ...a }) => a),
    grossComputeEur,
    freeCreditEur,
    computeEur,
    pgFlexEur: pg.totalEur,
    pgFlexComputeEur: pg.computeEur,
    pgFlexStorageEur: pg.storageEur,
    filesEur,
    registryEur,
    logsEur,
    egressEur,
    totalEur:
      computeEur + pg.totalEur + filesEur + registryEur + logsEur + egressEur,
  };
}

// ─── Formatting ──────────────────────────────────────────────────────────────

export function formatEur(n: number): string {
  return `€${n.toFixed(n >= 100 ? 0 : 2)}`;
}
