"use client";

import { HardDrive, Server, Shield, Workflow } from "lucide-react";
import type { AcaAppSpec, PgFlexSpec } from "@/lib/azure-pricing";
import type { Severity } from "./types";

export const REFRESH_INTERVAL = 30_000;

export const MAX_HISTORY = 2880;

export const LAYER_META: Record<
  string,
  { label: string; icon: React.ComponentType<any>; color: string }
> = {
  "edc-core": {
    label: "EDC-V Core",
    icon: Server,
    color: "text-(--accent)",
  },
  identity: {
    label: "Identity & Trust",
    icon: Shield,
    color: "text-(--accent)",
  },
  cfm: {
    label: "Connector Fabric Manager",
    icon: Workflow,
    color: "text-(--success-text)",
  },
  infrastructure: {
    label: "Infrastructure",
    icon: HardDrive,
    color: "text-(--warning-text)",
  },
};

export const STATUS_COLORS: Record<string, string> = {
  healthy: "bg-emerald-500",
  running: "bg-blue-500",
  unhealthy: "bg-red-500",
  stopped: "bg-gray-600",
  unknown: "bg-gray-500",
};

export const SEVERITY_STYLES: Record<
  Severity,
  { dot: string; border: string; bg: string }
> = {
  critical: {
    dot: "bg-red-500 animate-pulse",
    border: "border-red-500/60",
    bg: "bg-red-900/10",
  },
  warning: {
    dot: "bg-yellow-500",
    border: "border-yellow-500/40",
    bg: "bg-yellow-900/10",
  },
  healthy: {
    dot: "bg-emerald-500",
    border: "border-(--border)",
    bg: "",
  },
  unknown: {
    dot: "bg-gray-500",
    border: "border-(--border)",
    bg: "",
  },
};

export const ROLE_COLORS: Record<string, string> = {
  DATA_HOLDER: "bg-blue-500/20 text-(--accent)",
  DATA_USER: "bg-(--badge-active-bg) text-(--badge-active-text)",
  HDAB: "bg-purple-500/20 text-(--accent)",
  "health-data-access-body": "bg-purple-500/20 text-(--accent)",
  "data-holder": "bg-blue-500/20 text-(--accent)",
  "data-user": "bg-(--badge-active-bg) text-(--badge-active-text)",
};

// Hoisted out of AzureCostEstimatorPanel so TopoComponentCard can use it too.
// Kept in sync with the diagnosis catalogue at
// /api/admin/components/[name]/diagnosis.
export const KNOWN_BROKEN_ACA_APPS = new Set<string>([
  "mvhd-controlplane",
  "mvhd-dp-fhir",
  "mvhd-dp-omop",
  "mvhd-identityhub",
  "mvhd-issuerservice",
  "mvhd-tenant-mgr",
  "mvhd-provision-mgr",
]);

// Mirrors the live Container Apps in rg-mvhd-dev (read 2026-10-03), with
// sidecars added to their app (Vault's unseal sidecar). Since ADR-053 every
// app stops outside Mon-Fri 07-20, Keycloak, Vault and the federation gateway
// included; the UI stays reachable at min=0 with the offline notice, which
// costs next to nothing. The live panel replaces memGiB with the reservation
// the API reports, so this list is the fallback for names, CPU and schedule.
export const ACA_APP_SPECS: AcaAppSpec[] = [
  { name: "mvhd-neo4j", cpu: 1.0, memGiB: 2.0, schedule: "office" },
  { name: "mvhd-controlplane", cpu: 1.0, memGiB: 2.0, schedule: "office" },
  { name: "mvhd-dp-fhir", cpu: 0.5, memGiB: 1.0, schedule: "office" },
  { name: "mvhd-dp-omop", cpu: 0.5, memGiB: 1.0, schedule: "office" },
  { name: "mvhd-identityhub", cpu: 0.5, memGiB: 1.0, schedule: "office" },
  { name: "mvhd-issuerservice", cpu: 0.5, memGiB: 1.0, schedule: "office" },
  { name: "mvhd-ui", cpu: 0.5, memGiB: 1.0, schedule: "office" },
  { name: "mvhd-tenant-mgr", cpu: 0.25, memGiB: 0.5, schedule: "office" },
  { name: "mvhd-provision-mgr", cpu: 0.25, memGiB: 0.5, schedule: "office" },
  { name: "mvhd-nats", cpu: 0.25, memGiB: 0.5, schedule: "office" },
  { name: "mvhd-neo4j-proxy", cpu: 0.25, memGiB: 0.5, schedule: "office" },
  { name: "mvhd-catalog-enricher", cpu: 0.25, memGiB: 0.5, schedule: "office" },
  { name: "mvhd-cfm-cp-shim", cpu: 0.25, memGiB: 0.5, schedule: "office" },
  { name: "mvhd-cfm-kcagent", cpu: 0.25, memGiB: 0.5, schedule: "office" },
  { name: "mvhd-cfm-edcvagent", cpu: 0.25, memGiB: 0.5, schedule: "office" },
  { name: "mvhd-cfm-regagent", cpu: 0.25, memGiB: 0.5, schedule: "office" },
  { name: "mvhd-cfm-obagent", cpu: 0.25, memGiB: 0.5, schedule: "office" },
  { name: "mvhd-keycloak", cpu: 1.0, memGiB: 2.0, schedule: "office" },
  { name: "mvhd-vault", cpu: 0.75, memGiB: 1.5, schedule: "office" },
  { name: "mvhd-claude-federation", cpu: 0.5, memGiB: 1.0, schedule: "office" },
  // mvhd-postgres is retired (ADR-041 phase 4); nothing used it after the
  // move to the Flexible Server below.
];

// ADR-041: every database lives on this Flexible Server since 2026-10-02.
// The evening stop stops it last and the morning start starts it first
// (ADR-053), so compute bills office hours and storage bills around the clock.
export const AZURE_PG_FLEX: PgFlexSpec = {
  name: "mvhd-pg-b53a0449",
  sku: "Standard_B1ms",
  storageGb: 32,
  schedule: "office",
};

// Azure Files share quotas in scripts/azure/env.sh. Standard LRS bills data
// stored, so the quotas are an upper bound. pg-data has had no reader since
// ADR-041; it is billed until someone deletes the share by hand.
export const SHARE_NEO4J_DATA_GIB = 10;

export const SHARE_NEO4J_LOGS_GIB = 5;

export const SHARE_PG_DATA_GIB = 20;

export const SHARE_VAULT_DATA_GIB = 2;

export const COMPUTED_STORAGE_GIB =
  SHARE_NEO4J_DATA_GIB +
  SHARE_NEO4J_LOGS_GIB +
  SHARE_PG_DATA_GIB +
  SHARE_VAULT_DATA_GIB;

// Billable ingestion into mvhd-logs over the 30 days to 2026-10-03 (Usage
// table).
export const LOG_ANALYTICS_GB_PER_MONTH = 18.3;

// Egress estimate per participant and month: DSP messages and transfer
// receipts (300 MB), the audit trail (150 MB) and the UI (500 MB), plus a
// baseline for Keycloak, NATS and image pulls.
export const EGRESS_PER_PARTICIPANT_MB = 300 + 150 + 500;

export const EGRESS_INFRA_BASELINE_GB = 2;
