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
 * over a synthetic health record. The verified name is never shown, though:
 * the session carries the record's pseudonym (#475, 2026-10-07), because a
 * real person's PID name must not appear on a screen of the demo.
 *
 * Swap `mapPidToPatient` for a real Neo4j name+birthDate resolver later; the
 * call sites (status route, Credentials provider) depend only on this contract.
 */
import type { EudiVerifiedPatient } from "@/lib/eudi-store";
import { patientPseudonym } from "@/lib/patient-identity";

/** Normalised PID claims (mdoc eu.europa.ec.eudi.pid.1 / SD-JWT pid). */
export interface VerifiedPid {
  familyName?: string;
  givenName?: string;
  /** `age_over_18`: the hub asks for this, never for a birth date */
  ageOver18?: boolean;
}

/** Fixed demo patient every verified wallet resolves to. */
export const DEMO_EUDI_PATIENT_USERNAME = "patient1";
/** The record that login owns (`ownPatientId("patient1")`). */
export const DEMO_EUDI_PATIENT_RECORD = "P1";

export function mapPidToPatient(_pid: VerifiedPid): EudiVerifiedPatient {
  return {
    username: DEMO_EUDI_PATIENT_USERNAME,
    displayName: patientPseudonym(DEMO_EUDI_PATIENT_RECORD),
    roles: ["PATIENT"],
  };
}

/**
 * The patient a *simulated* wallet approval signs in as, when the deployment
 * allows it (`EUDI_DEMO_WALLET=true`, see the start route). Same mapping as a
 * real presentation.
 */
export function demoPatient(): EudiVerifiedPatient {
  return mapPidToPatient({});
}
