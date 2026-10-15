import { createHmac } from "crypto";

/**
 * Who may see who a patient is (#475, first part).
 *
 * Regulation (EU) 2025/327 keeps two uses apart. In primary use the
 * patient and the professionals treating them see a named record. In
 * secondary use a researcher works on data that is anonymised by default and
 * pseudonymised only where the purpose needs it, never named (Art. 66). This
 * hub showed every signed-in role, a researcher included, patients' names and
 * full birth dates in the graph and the patient index. This module is the one
 * rule every such route now asks.
 *
 * - **Sees identity:** `EDC_ADMIN` (operates the demo and its records) and
 *   `DATA_HOLDER` (the clinic that holds the records, primary use).
 * - **`PATIENT`:** sees their own record only, and even that under its
 *   pseudonym with an age in place of the birth date (since 2026-10-07). A
 *   wallet login carries a real person's PID, and the hub shows a patient
 *   session no name and no birth date, so nothing identifying is ever on a
 *   screen of the demo. `ownRecordView()` is that rule.
 * - **Everyone else** (`DATA_USER`, `HDAB_AUTHORITY`, `TRUST_CENTER_OPERATOR`,
 *   a bare participant) sees a stable pseudonym, the birth year instead of the
 *   birth date, and no place of residence.
 *
 * The pseudonym here is a display label, keyed so it cannot be reversed by
 * hashing known record ids. It is not the research pseudonym a trust centre
 * issues per data permit; that is #475's second part (ADR-051).
 */

const IDENTIFYING_ROLES = ["EDC_ADMIN", "DATA_HOLDER"];

/** True when these roles may see any patient's name and birth date. */
export function seesPatientIdentity(roles: readonly string[]): boolean {
  return roles.some((r) => IDENTIFYING_ROLES.includes(r));
}

function pseudonymKey(): string {
  return (
    process.env.PATIENT_PSEUDONYM_KEY ||
    process.env.NEXTAUTH_SECRET ||
    "local-development-only"
  );
}

/**
 * A stable label for one patient, the same every time for the same record,
 * and the same in the graph and in the patient index.
 */
export function patientPseudonym(recordKey: string): string {
  const tag = createHmac("sha256", pseudonymKey())
    .update(`patient-display:${recordKey}`)
    .digest("hex")
    .slice(0, 8);
  return `Patient ${tag}`;
}

/** `1965-04-12` → `1965`; anything else → null. */
export function birthYear(birthDate: unknown): string | null {
  const text =
    typeof birthDate === "string"
      ? birthDate
      : birthDate && typeof birthDate === "object" && "year" in birthDate
        ? String((birthDate as { year: unknown }).year)
        : "";
  const m = /^(\d{4})/.exec(text);
  return m ? m[1] : null;
}

/**
 * Properties of a `(:Patient)` node that say who the person is, or point at
 * their record in a way that leads there. Withheld from roles that do not see
 * identity.
 */
const IDENTIFYING_PROPERTIES = new Set([
  "name",
  "given",
  "family",
  "birthDate",
  "deathDate",
  "address",
  "city",
  "postalCode",
  "telecom",
  "email",
  "phone",
  "ssn",
  "patientId",
  "resourceId",
  "id",
]);

/**
 * A Patient node's properties as a role without identity may see them: the
 * pseudonym and birth year in place of the name and birth date, every other
 * identifying property gone, the rest (gender, country, flags) kept.
 */
export function redactPatientProperties(
  props: Record<string, unknown>,
  recordKey: string,
): Record<string, unknown> {
  const out: Record<string, unknown> = {
    pseudonym: patientPseudonym(recordKey),
  };
  const year = birthYear(props.birthDate);
  if (year) out.birthYear = year;
  for (const [key, value] of Object.entries(props)) {
    if (!IDENTIFYING_PROPERTIES.has(key)) out[key] = value;
  }
  return out;
}

/**
 * Full years between a birth date (`YYYY-MM-DD`, or Neo4j's `{year, month,
 * day}`) and `asOf`. A bare year gives the year difference. Null when unknown.
 */
export function patientAge(
  birthDate: unknown,
  asOf: Date = new Date(),
): number | null {
  const obj =
    birthDate && typeof birthDate === "object"
      ? (birthDate as { year?: unknown; month?: unknown; day?: unknown })
      : null;
  const text =
    typeof birthDate === "string"
      ? birthDate
      : obj && obj.year !== undefined
        ? `${obj.year}-${String(obj.month ?? 1).padStart(2, "0")}-${String(
            obj.day ?? 1,
          ).padStart(2, "0")}`
        : "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  let age: number;
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    age = asOf.getUTCFullYear() - y;
    const month = asOf.getUTCMonth() + 1;
    if (month < mo || (month === mo && asOf.getUTCDate() < d)) age--;
  } else {
    const y = birthYear(birthDate);
    if (!y) return null;
    age = asOf.getUTCFullYear() - Number(y);
  }
  return age >= 0 && age < 130 ? age : null;
}

/**
 * A patient's own record as the patient sees it: the pseudonym for the name,
 * the age for the birth date, which is left empty. Everything else as it is.
 */
export function ownRecordView<T extends { id: string; birthDate?: string }>(
  p: T,
): T & { name: string; age: number | null } {
  return {
    ...p,
    name: patientPseudonym(p.id),
    age: patientAge(p.birthDate),
    birthDate: "",
  };
}
