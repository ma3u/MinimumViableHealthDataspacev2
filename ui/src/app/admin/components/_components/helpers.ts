import {
  CP_DP_TRAFFIC_MB,
  EGRESS_INFRA_BASELINE_GB,
  EGRESS_PER_PARTICIPANT_MB,
  HEALTH_DATA_STORAGE_GB,
  LOG_EUR_PER_GB,
  LOG_INJECTION_MB,
  NETWORK_EUR_PER_GB,
  PER_PARTICIPANT_COMPUTE_EUR,
  PER_PARTICIPANT_STORAGE_GB,
  STORAGE_EUR_PER_GB,
} from "./constants";

export function perParticipantEur(isDataHolder: boolean) {
  const storage =
    (PER_PARTICIPANT_STORAGE_GB + (isDataHolder ? HEALTH_DATA_STORAGE_GB : 0)) *
    STORAGE_EUR_PER_GB;
  const network = (CP_DP_TRAFFIC_MB / 1024) * NETWORK_EUR_PER_GB;
  const logs = (LOG_INJECTION_MB / 1024) * LOG_EUR_PER_GB;
  return PER_PARTICIPANT_COMPUTE_EUR + storage + network + logs;
}

export function computeEgressGiB(participantCount: number): number {
  const fromParticipants =
    (EGRESS_PER_PARTICIPANT_MB * participantCount) / 1024;
  return Math.ceil(fromParticipants + EGRESS_INFRA_BASELINE_GB);
}
