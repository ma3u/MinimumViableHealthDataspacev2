/**
 * Maps a cryptographically-verified EUDI Wallet PID presentation to a demo
 * patient identity in this dataspace.
 *
 * Demo semantics (decided for the hackathon): every successfully verified wallet
 * is mapped to a fixed synthetic patient (`patient1`). A real wallet's PID will
 * not match the synthetic Synthea cohort, so a name+birthDate lookup would lock
 * the holder out. The *identity* is therefore cosmetic — the point is that the
 * holder proved control of a real EUDI Wallet credential. The verified name is
 * surfaced as the display name so the demo shows "you, verified via your wallet"
 * over a synthetic health record.
 *
 * Swap `mapPidToPatient` for a real Neo4j name+birthDate resolver later; the
 * call sites (status route, Credentials provider) depend only on this contract.
 */
import type { EudiVerifiedPatient } from "@/lib/eudi-store";

/** Normalised PID claims (mdoc eu.europa.ec.eudi.pid.1 / SD-JWT pid). */
export interface VerifiedPid {
  familyName?: string;
  givenName?: string;
  birthDate?: string;
}

/** Fixed demo patient every verified wallet resolves to. */
export const DEMO_EUDI_PATIENT_USERNAME = "patient1";

export function mapPidToPatient(pid: VerifiedPid): EudiVerifiedPatient {
  const fullName = [pid.givenName, pid.familyName]
    .filter((s) => Boolean(s && s.trim()))
    .join(" ")
    .trim();
  return {
    username: DEMO_EUDI_PATIENT_USERNAME,
    displayName: fullName || "EUDI Wallet Patient",
    roles: ["PATIENT"],
  };
}
