"use client";

import { HardDrive, Server, Shield, Workflow } from "lucide-react";
import type { AcaAppSpec } from "@/lib/azure-pricing";
import { perParticipantEur } from "./helpers";
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
    color: "text-[var(--accent)]",
  },
  identity: {
    label: "Identity & Trust",
    icon: Shield,
    color: "text-[var(--accent)]",
  },
  cfm: {
    label: "Connector Fabric Manager",
    icon: Workflow,
    color: "text-[var(--success-text)]",
  },
  infrastructure: {
    label: "Infrastructure",
    icon: HardDrive,
    color: "text-[var(--warning-text)]",
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
    border: "border-[var(--border)]",
    bg: "",
  },
  unknown: {
    dot: "bg-gray-500",
    border: "border-[var(--border)]",
    bg: "",
  },
};

export const ROLE_COLORS: Record<string, string> = {
  DATA_HOLDER: "bg-blue-500/20 text-[var(--accent)]",
  DATA_USER: "bg-[var(--badge-active-bg)] text-[var(--badge-active-text)]",
  HDAB: "bg-purple-500/20 text-[var(--accent)]",
  "health-data-access-body": "bg-purple-500/20 text-[var(--accent)]",
  "data-holder": "bg-blue-500/20 text-[var(--accent)]",
  "data-user": "bg-[var(--badge-active-bg)] text-[var(--badge-active-text)]",
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

// StackIT-equivalent node definitions (STACKIT Compute Engine, Frankfurt DC)
// Prices in EUR/month, based on European sovereign cloud rates (GDPR-ready).
export const STACKIT_NODES = [
  {
    id: "neo4j",
    label: "Graph DB (Neo4j)",
    flavor: "4 vCPU / 8 GB RAM",
    eur: 48,
    components: ["Neo4j", "Neo4j Proxy"],
    note: "Handles 5 300+ nodes across FHIR, OMOP, SNOMED, ICD-10, LOINC layers",
  },
  {
    id: "datastore",
    label: "Data Store (PostgreSQL + NATS)",
    flavor: "2 vCPU / 4 GB RAM",
    eur: 28,
    components: ["PostgreSQL", "NATS"],
    note: "Metadata for all 19 JAD services + async event bus",
  },
  {
    id: "identity",
    label: "Identity & Secrets",
    flavor: "2 vCPU / 4 GB RAM",
    eur: 28,
    components: ["Keycloak", "Vault", "Traefik"],
    note: "OIDC/PKCE SSO, secrets management, TLS termination",
  },
  {
    id: "cfm",
    label: "CFM Platform",
    flavor: "2 vCPU / 4 GB RAM",
    eur: 28,
    components: [
      "Tenant Manager",
      "Provision Manager",
      "EDC-V Agent",
      "Keycloak Agent",
      "Onboarding Agent",
      "Registration Agent",
    ],
    note: "Connector Fabric Manager orchestrates participant onboarding & provisioning",
  },
  {
    id: "ui",
    label: "UI / API Gateway",
    flavor: "1 vCPU / 2 GB RAM",
    eur: 14,
    components: ["UI"],
    note: "Next.js frontend + Neo4j proxy API bridge",
  },
];

// Per-participant allocation: 2 GB RAM target (StackIT smallest compute tier)
export const PER_PARTICIPANT_COMPUTE_EUR = 13; // 1 vCPU / 2 GB → ~€13/month

export const PER_PARTICIPANT_STORAGE_GB = 2; // base allocation per participant

export const HEALTH_DATA_STORAGE_GB = 10; // additional for DATA_HOLDER role (avg)

export const STORAGE_EUR_PER_GB = 0.08; // StackIT block storage €0.08/GB/month

// Network: Control Plane ↔ Data Plane (DSP negotiation + transfer receipts)
export const CP_DP_TRAFFIC_MB = 300; // ~300 MB/month per participant (DSP messages + audit)

export const NETWORK_EUR_PER_GB = 0.09; // StackIT egress €0.09/GB

// Log injection: participant audit logs → centralised SIEM/Loki
export const LOG_INJECTION_MB = 150; // ~150 MB/month per participant (EHDS Article 50 audit trail)

export const LOG_EUR_PER_GB = 0.75; // log ingestion/storage (ELK/Loki service ~€0.75/GB)

export const SHARED_EUR = STACKIT_NODES.reduce((s, n) => s + n.eur, 0);

export const PER_USER_EUR = Math.round(perParticipantEur(false) * 100) / 100;

export const PER_DATA_HOLDER_EUR =
  Math.round(perParticipantEur(true) * 100) / 100;

// Hard-coded reservations mirror scripts/azure/*.sh. These are the minReplicas
// defaults under ADR-018 Workaround B (24×7, no scale-down). If Ops bumps a
// reservation, the live panel reflects it via the `snapshot.components` memLimit
// field; we keep this map as the fallback source of truth for names + memory.
export const ACA_APP_SPECS: AcaAppSpec[] = [
  { name: "mvhd-controlplane", cpu: 0.5, memGiB: 1.0, minReplicas: 1 },
  { name: "mvhd-dp-fhir", cpu: 0.5, memGiB: 1.0, minReplicas: 1 },
  { name: "mvhd-dp-omop", cpu: 0.5, memGiB: 1.0, minReplicas: 1 },
  { name: "mvhd-identityhub", cpu: 0.5, memGiB: 1.0, minReplicas: 1 },
  { name: "mvhd-issuerservice", cpu: 0.25, memGiB: 0.5, minReplicas: 1 },
  { name: "mvhd-keycloak", cpu: 1.0, memGiB: 2.0, minReplicas: 1 },
  { name: "mvhd-vault", cpu: 0.25, memGiB: 0.5, minReplicas: 1 },
  { name: "mvhd-tenant-mgr", cpu: 0.5, memGiB: 1.0, minReplicas: 1 },
  { name: "mvhd-provision-mgr", cpu: 0.5, memGiB: 1.0, minReplicas: 1 },
  { name: "mvhd-postgres", cpu: 1.0, memGiB: 2.0, minReplicas: 1 },
  { name: "mvhd-nats", cpu: 0.25, memGiB: 0.5, minReplicas: 1 },
  { name: "mvhd-neo4j", cpu: 1.0, memGiB: 4.0, minReplicas: 1 },
  { name: "mvhd-neo4j-proxy", cpu: 0.25, memGiB: 0.5, minReplicas: 1 },
  { name: "mvhd-ui", cpu: 0.5, memGiB: 1.0, minReplicas: 1 },
];

// Storage GiB — derived from the Azure Files share quotas declared in
// scripts/azure/env.sh (neo4j-data 10 + neo4j-logs 5 + pg-data 20 + vault-data
// 2 = 37 GiB). Premium tier is billed on provisioned size, so this is what
// shows up on the bill regardless of actual usage. Constants kept inline so
// the page stays renderable without an extra ARM call.
export const SHARE_NEO4J_DATA_GIB = 10;

export const SHARE_NEO4J_LOGS_GIB = 5;

export const SHARE_PG_DATA_GIB = 20;

export const SHARE_VAULT_DATA_GIB = 2;

export const COMPUTED_STORAGE_GIB =
  SHARE_NEO4J_DATA_GIB +
  SHARE_NEO4J_LOGS_GIB +
  SHARE_PG_DATA_GIB +
  SHARE_VAULT_DATA_GIB;

// Egress estimate (per participant, GB / month):
//   - CP_DP_TRAFFIC_MB + LOG_INJECTION_MB above (DSP messages + audit log
//     injection) — roughly 450 MB/participant
//   - UI traffic: ~500 MB / participant / month for typical exploratory
//     dashboard use (graph rendering, FHIR responses)
// Plus a small infra baseline (Keycloak introspection, NATS publish to
// external SIEM hooks, ACR pulls when scaling).
export const EGRESS_PER_PARTICIPANT_MB =
  CP_DP_TRAFFIC_MB + LOG_INJECTION_MB + /* user-facing UI */ 500;

export const EGRESS_INFRA_BASELINE_GB = 2;
