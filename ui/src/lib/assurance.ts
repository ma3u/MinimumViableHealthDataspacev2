/**
 * The assurance level of a sign-in, as eIDAS defines them (Regulation (EU)
 * No 910/2014, Art. 8), recorded on the session (#708).
 *
 * Implementing Regulation (EU) 2026/2099 asks persons to identify at level
 * substantial from 26 March 2027 and high from 2030. The EUDI Wallet is
 * certified at high, so a sign-in with its PID is high; a password at
 * Keycloak is low, and so is the simulated wallet on the sign-in page, which
 * proves nothing about the person.
 *
 * `PATIENT_MIN_ASSURANCE` (unset, "substantial" or "high") sets the floor for
 * a patient's own session. Unset, the demo's password logins keep working;
 * a deployment that identifies real persons sets it.
 */
export type AssuranceLevel = "low" | "substantial" | "high";

const RANK: Record<AssuranceLevel, number> = {
  low: 1,
  substantial: 2,
  high: 3,
};

function isLevel(v: unknown): v is AssuranceLevel {
  return v === "low" || v === "substantial" || v === "high";
}

/** The floor for patient sessions, read at call time; null when unset. */
export function patientAssuranceFloor(): AssuranceLevel | null {
  const v = process.env.PATIENT_MIN_ASSURANCE;
  return isLevel(v) ? v : null;
}

/**
 * The level a patient-only session lacks, or null when it meets the floor.
 * A session that also holds another role is a participant's, not a person's
 * identification, and is not held to it. A session without a recorded level
 * counts as low.
 */
export function patientAssuranceShortfall(
  roles: string[],
  level: unknown,
): AssuranceLevel | null {
  const floor = patientAssuranceFloor();
  if (!floor || !roles.includes("PATIENT") || roles.length > 1) return null;
  const have = isLevel(level) ? level : "low";
  return RANK[have] < RANK[floor] ? floor : null;
}
