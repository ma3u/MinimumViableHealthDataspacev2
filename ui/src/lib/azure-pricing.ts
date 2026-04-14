/**
 * Azure Container Apps — Consumption plan pricing model.
 *
 * Based on publicly listed West Europe rates (Nov 2025):
 *   - vCPU active time:   $0.000024 / vCPU-second      → $62.21 / vCPU-month
 *   - Memory active time: $0.000003 / GiB-second       → $7.78  / GiB-month
 *   - Requests:           $0.40 / million requests     (first 2M free / month / app)
 *   - Free tier:          180 000 vCPU-s + 360 000 GiB-s per subscription / month
 *
 * The model assumes 24×7 operation (no scale-to-zero) under ADR-018 Workaround B.
 *
 * Storage (Azure Files for persistent volumes):
 *   - Premium ZRS:        $0.16 / GiB-month
 *
 * Egress:
 *   - First 100 GiB / month free
 *   - Then $0.087 / GiB (zone 1)
 *
 * These figures are deliberately conservative; actual billing may be lower due
 * to reservations or scale-down. The panel surfaces them as "estimate" only.
 */

// ─── Public rate constants ───────────────────────────────────────────────────

export const ACA_VCPU_USD_PER_SEC = 0.000024;
export const ACA_MEM_USD_PER_GIB_SEC = 0.000003;
export const ACA_REQUEST_USD_PER_M = 0.4;

export const ACA_FREE_VCPU_SECONDS = 180_000;
export const ACA_FREE_MEM_GIB_SECONDS = 360_000;
export const ACA_FREE_REQUESTS_PER_APP = 2_000_000;

export const AZURE_FILES_USD_PER_GIB = 0.16;
export const AZURE_EGRESS_FREE_GIB = 100;
export const AZURE_EGRESS_USD_PER_GIB = 0.087;

// EUR conversion — billing is USD, displayed in EUR for consistency with the
// StackIT panel. Updated manually; kept as a constant so it's auditable.
export const USD_TO_EUR = 0.92;

const SECONDS_PER_MONTH = 30 * 24 * 3600; // 2 592 000

// ─── App-level compute cost ──────────────────────────────────────────────────

export interface AcaAppSpec {
  name: string;
  cpu: number; // vCPU reservation (fractional allowed)
  memGiB: number; // memory reservation in GiB
  minReplicas: number; // assumed always running (24×7 under ADR-018)
}

export interface AcaAppCost {
  name: string;
  vcpuSeconds: number;
  memGiBSeconds: number;
  vcpuUsd: number;
  memUsd: number;
  totalUsd: number;
}

/**
 * Compute the monthly USD cost for a single Container App assuming
 * `minReplicas` replicas running 24×7 at their full reservation.
 */
export function costForApp(spec: AcaAppSpec): AcaAppCost {
  const replicas = Math.max(1, spec.minReplicas);
  const vcpuSeconds = spec.cpu * replicas * SECONDS_PER_MONTH;
  const memGiBSeconds = spec.memGiB * replicas * SECONDS_PER_MONTH;
  const vcpuUsd = vcpuSeconds * ACA_VCPU_USD_PER_SEC;
  const memUsd = memGiBSeconds * ACA_MEM_USD_PER_GIB_SEC;
  return {
    name: spec.name,
    vcpuSeconds,
    memGiBSeconds,
    vcpuUsd,
    memUsd,
    totalUsd: vcpuUsd + memUsd,
  };
}

// ─── Environment-wide aggregation ────────────────────────────────────────────

export interface AcaEnvironmentCost {
  apps: AcaAppCost[];
  totalVcpuSeconds: number;
  totalMemGiBSeconds: number;
  grossVcpuUsd: number;
  grossMemUsd: number;
  freeCreditUsd: number;
  computeUsd: number;
  storageUsd: number;
  egressUsd: number;
  totalUsd: number;
  totalEur: number;
}

export interface AcaEnvironmentInputs {
  storageGiB: number; // total Azure Files volumes (Neo4j + PG + Vault)
  egressGiB: number; // monthly outbound traffic estimate
}

/**
 * Aggregate monthly cost across a list of Container Apps with the free tier
 * applied at the subscription level and storage/egress added on top.
 */
export function costForEnvironment(
  specs: AcaAppSpec[],
  inputs: AcaEnvironmentInputs,
): AcaEnvironmentCost {
  const apps = specs.map(costForApp);

  const totalVcpuSeconds = apps.reduce((s, a) => s + a.vcpuSeconds, 0);
  const totalMemGiBSeconds = apps.reduce((s, a) => s + a.memGiBSeconds, 0);
  const grossVcpuUsd = totalVcpuSeconds * ACA_VCPU_USD_PER_SEC;
  const grossMemUsd = totalMemGiBSeconds * ACA_MEM_USD_PER_GIB_SEC;

  // Apply free tier at subscription scope (one-time deduction per month).
  const freeVcpuUsd =
    Math.min(totalVcpuSeconds, ACA_FREE_VCPU_SECONDS) * ACA_VCPU_USD_PER_SEC;
  const freeMemUsd =
    Math.min(totalMemGiBSeconds, ACA_FREE_MEM_GIB_SECONDS) *
    ACA_MEM_USD_PER_GIB_SEC;
  const freeCreditUsd = freeVcpuUsd + freeMemUsd;

  const computeUsd = Math.max(0, grossVcpuUsd + grossMemUsd - freeCreditUsd);
  const storageUsd = inputs.storageGiB * AZURE_FILES_USD_PER_GIB;
  const egressUsd =
    Math.max(0, inputs.egressGiB - AZURE_EGRESS_FREE_GIB) *
    AZURE_EGRESS_USD_PER_GIB;
  const totalUsd = computeUsd + storageUsd + egressUsd;

  return {
    apps,
    totalVcpuSeconds,
    totalMemGiBSeconds,
    grossVcpuUsd,
    grossMemUsd,
    freeCreditUsd,
    computeUsd,
    storageUsd,
    egressUsd,
    totalUsd,
    totalEur: totalUsd * USD_TO_EUR,
  };
}

// ─── Formatting helpers ──────────────────────────────────────────────────────

export function formatUsd(n: number): string {
  return `$${n.toFixed(n >= 100 ? 0 : 2)}`;
}

export function formatEur(n: number): string {
  return `€${n.toFixed(n >= 100 ? 0 : 2)}`;
}
