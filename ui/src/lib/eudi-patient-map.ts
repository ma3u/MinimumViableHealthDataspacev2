/**
 * Binds a verified EUDI Wallet PID to the one record it belongs to (#708).
 *
 * Until 2026-10-27 every verified wallet signed in as `patient1`. Under
 * Implementing Regulation (EU) 2026/2099 a PID identifies a person, so it may
 * open only that person's record, and a PID that belongs to nobody here is
 * refused rather than handed a demo patient.
 *
 * The hub holds no real person's data, so the only people a PID can match are
 * the fictional patient personas of the Keycloak realm (`jad/keycloak-realm.json`,
 * pinned by a unit test). A tester issues a test PID with one of their names
 * at the EU reference issuer and signs in as that patient. Matching ignores
 * case, accents and extra spaces; nothing else of the PID is stored.
 *
 * The verified name is never shown: the session carries the record's
 * pseudonym (#475, 2026-10-07).
 */
import type { EudiVerifiedPatient } from "@/lib/eudi-store";
import { patientPseudonym } from "@/lib/patient-identity";

/** Normalised PID claims (mdoc eu.europa.ec.eudi.pid.1 / SD-JWT VC urn:eudi:pid:1). */
export interface VerifiedPid {
  familyName?: string;
  givenName?: string;
  /** `age_over_18` / `age_equal_or_over.18`: the hub asks for this, never for a birth date */
  ageOver18?: boolean;
}

/** The persons a PID can belong to: the realm's patient personas and their records. */
export const PID_BINDINGS = [
  {
    givenName: "Maria",
    familyName: "Schmidt",
    username: "patient1",
    record: "P1",
  },
  {
    givenName: "Jan",
    familyName: "de Vries",
    username: "patient2",
    record: "P2",
  },
] as const;

function normalise(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function patientOf(
  b: (typeof PID_BINDINGS)[number],
  assurance: EudiVerifiedPatient["assurance"],
): EudiVerifiedPatient {
  return {
    username: b.username,
    displayName: patientPseudonym(b.record),
    roles: ["PATIENT"],
    assurance,
  };
}

/**
 * The patient this PID belongs to, or null when it belongs to nobody on this
 * hub. A PID sign-in is at assurance level high (the EUDI Wallet's).
 */
export function mapPidToPatient(pid: VerifiedPid): EudiVerifiedPatient | null {
  if (!pid.givenName || !pid.familyName) return null;
  const given = normalise(pid.givenName);
  const family = normalise(pid.familyName);
  const b = PID_BINDINGS.find(
    (x) =>
      normalise(x.givenName) === given && normalise(x.familyName) === family,
  );
  return b ? patientOf(b, "high") : null;
}

/**
 * The patient a *simulated* wallet approval signs in as, when the deployment
 * allows it (`EUDI_DEMO_WALLET=true`, see the start route). No PID is
 * presented, so the sign-in proves nothing about the person: level low.
 */
export function demoPatient(): EudiVerifiedPatient {
  return patientOf(PID_BINDINGS[0], "low");
}
