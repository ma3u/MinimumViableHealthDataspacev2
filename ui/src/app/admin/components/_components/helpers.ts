import {
  EGRESS_INFRA_BASELINE_GB,
  EGRESS_PER_PARTICIPANT_MB,
} from "./constants";

export function computeEgressGiB(participantCount: number): number {
  const fromParticipants =
    (EGRESS_PER_PARTICIPANT_MB * participantCount) / 1024;
  return Math.ceil(fromParticipants + EGRESS_INFRA_BASELINE_GB);
}
