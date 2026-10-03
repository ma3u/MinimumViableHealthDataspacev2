/**
 * Monthly cost model for a static STACKIT deployment (region EU01, Germany).
 *
 * Nothing runs on STACKIT yet; this is what the same stack would cost there.
 * "Static" means fixed servers running 24x7 with Docker Compose, rather
 * than Container Apps billed per second, and the database is the managed
 * PostgreSQL Flex, as on Azure (ADR-041).
 *
 * Prices are the public STACKIT price list, read from
 * https://pim.api.stackit.cloud/v1/skus on 2026-10-03 (hourly EUR, excl.
 * VAT). They are multiplied by 730 hours to match the Azure model; STACKIT's
 * own monthly figures use 720.
 */

import { HOURS_PER_MONTH } from "./azure-pricing";

export interface StackitServer {
  id: string;
  label: string;
  flavor: string; // STACKIT server flavor
  vcpu: number;
  ramGb: number;
  eurPerHour: number;
  components: string[];
  note: string;
}

// The Azure apps, grouped onto three general-purpose servers (g2i, Intel,
// CPU overprovisioned). The groups add up to more RAM than the Container
// Apps reserve today (20.5 GiB without Postgres), with room for the OS.
export const STACKIT_SERVERS: StackitServer[] = [
  {
    id: "graph",
    label: "Graph",
    flavor: "g2i.2",
    vcpu: 2,
    ramGb: 8,
    eurPerHour: 0.10229251676,
    components: ["Neo4j", "Neo4j Proxy", "Catalog Enricher"],
    note: "Neo4j reserves 2 GiB on Azure; 8 GB leaves page cache for the 5 300+ node graph",
  },
  {
    id: "edc",
    label: "EDC + CFM",
    flavor: "g2i.4",
    vcpu: 4,
    ramGb: 16,
    eurPerHour: 0.20458503352,
    components: [
      "Control Plane",
      "Data Plane FHIR",
      "Data Plane OMOP",
      "Identity Hub",
      "Issuer Service",
      "Tenant Manager",
      "Provision Manager",
      "CFM agents (4) + shim",
      "NATS",
    ],
    note: "12.5 GiB reserved on Azure across 13 apps; the JVMs idle most of the day",
  },
  {
    id: "edge",
    label: "Identity + UI",
    flavor: "g2i.2",
    vcpu: 2,
    ramGb: 8,
    eurPerHour: 0.10229251676,
    components: ["Keycloak", "Vault + unseal", "UI", "Traefik"],
    note: "OIDC, secrets and TLS termination; the only server exposed to the internet",
  },
];

export interface StackitPgFlex {
  flavor: string; // vCPU.RAM
  eurPerHour: number;
  storageGb: number;
  performanceClass: string;
  performanceClassEurPerHour: number;
}

// The smallest PostgreSQL Flex flavor in EU01 is 2.4 (2 vCPU, 4 GB), single
// node. Azure runs the same databases on a B1ms (1 vCore, 2 GiB).
export const STACKIT_PG_FLEX: StackitPgFlex = {
  flavor: "2.4 Single",
  eurPerHour: 0.12598444444,
  storageGb: 32,
  performanceClass: "premium-perf2 (1 000 IOPS)",
  performanceClassEurPerHour: 0.02013888889,
};

// Block storage: every volume pays a performance class per disk plus
// capacity per GB.
export const STACKIT_CAPACITY_EUR_PER_GB_HOUR = 0.0000907638;
export const STACKIT_PG_BACKUP_EUR_PER_GB_HOUR = 0.00003697772;
export const STACKIT_PERF1_DISK_EUR_PER_HOUR = 0.01016666667; // 500 IOPS
export const STACKIT_BOOT_DISK_GB = 50;
export const STACKIT_DATA_DISK_GB = 20; // Neo4j data and logs, Vault file backend

export const STACKIT_NLB_EUR_PER_HOUR = 0.01304166667; // Essential NLB 10
export const STACKIT_PUBLIC_IP_EUR_PER_HOUR = 0.00405555556;

export const STACKIT_LOGS_EUR_PER_GB = 1.2; // ingestion
export const STACKIT_LOGS_RETENTION_EUR_PER_GB_DAY = 0.01;
export const STACKIT_LOGS_RETENTION_DAYS = 30;

// Per participant, on top of the shared stack. Participants are contexts in
// one EDC-V deployment, so they add data and traffic, not servers.
export const PARTICIPANT_STORAGE_GB = 2;
export const DATA_HOLDER_EXTRA_STORAGE_GB = 10; // FHIR and OMOP data, average
export const PARTICIPANT_LOG_GB = 150 / 1024; // EHDS Art. 50 audit trail

export interface StackitCost {
  servers: { id: string; eur: number }[];
  serversEur: number;
  pgFlexEur: number;
  disksEur: number;
  networkEur: number;
  logsEur: number;
  sharedEur: number;
  participantsEur: number;
  totalEur: number;
}

const month = (eurPerHour: number) => eurPerHour * HOURS_PER_MONTH;

export function stackitCost(
  participants: number,
  dataHolderShare = 0.6,
  baseLogGb = 18.3, // what the Azure stack ingests per month today
): StackitCost {
  const servers = STACKIT_SERVERS.map((s) => ({
    id: s.id,
    eur: month(s.eurPerHour),
  }));
  const serversEur = servers.reduce((t, s) => t + s.eur, 0);

  const pg = STACKIT_PG_FLEX;
  const pgFlexEur =
    month(pg.eurPerHour) +
    month(pg.performanceClassEurPerHour) +
    month(pg.storageGb * STACKIT_CAPACITY_EUR_PER_GB_HOUR) +
    month(pg.storageGb * STACKIT_PG_BACKUP_EUR_PER_GB_HOUR);

  const disks = STACKIT_SERVERS.length + 1; // a boot disk each + one data disk
  const diskGb =
    STACKIT_SERVERS.length * STACKIT_BOOT_DISK_GB + STACKIT_DATA_DISK_GB;
  const disksEur =
    month(disks * STACKIT_PERF1_DISK_EUR_PER_HOUR) +
    month(diskGb * STACKIT_CAPACITY_EUR_PER_GB_HOUR);

  const networkEur =
    month(STACKIT_NLB_EUR_PER_HOUR) + month(STACKIT_PUBLIC_IP_EUR_PER_HOUR);

  const logGb = (gb: number) =>
    gb * STACKIT_LOGS_EUR_PER_GB +
    gb * STACKIT_LOGS_RETENTION_DAYS * STACKIT_LOGS_RETENTION_EUR_PER_GB_DAY;
  const logsEur = logGb(baseLogGb);

  const holders = Math.round(participants * dataHolderShare);
  const participantGb =
    participants * PARTICIPANT_STORAGE_GB +
    holders * DATA_HOLDER_EXTRA_STORAGE_GB;
  const participantsEur =
    month(participantGb * STACKIT_CAPACITY_EUR_PER_GB_HOUR) +
    logGb(participants * PARTICIPANT_LOG_GB);

  const sharedEur = serversEur + pgFlexEur + disksEur + networkEur + logsEur;
  return {
    servers,
    serversEur,
    pgFlexEur,
    disksEur,
    networkEur,
    logsEur,
    sharedEur,
    participantsEur,
    totalEur: sharedEur + participantsEur,
  };
}
