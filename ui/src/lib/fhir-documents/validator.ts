/**
 * Profile validation of a document before it is imported (#1173).
 *
 * The hub writes no validation of its own (discussion #1169): it asks a FHIR
 * validator, through the standard `$validate` operation that Matchbox and a
 * HAPI server answer, at `FHIR_VALIDATOR_URL`. With no validator configured,
 * nothing is imported (fail closed): a document nobody checked must not
 * reach a person's record.
 *
 * Terminology follows the validator's own configuration; CI runs the HL7
 * validator without a terminology server (scripts/eehrxf/profiles.json).
 */

export class ValidatorUnavailableError extends Error {}

export interface ValidationIssue {
  severity: string;
  location: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  /** Errors and fatal issues only, at most 50. */
  issues: ValidationIssue[];
}

type Json = Record<string, unknown>;

function outcomeToResult(outcome: unknown): ValidationResult | null {
  const oo = (outcome ?? {}) as Json;
  if (oo.resourceType !== "OperationOutcome") return null;
  const issues = (Array.isArray(oo.issue) ? (oo.issue as Json[]) : [])
    .filter((i) => i.severity === "error" || i.severity === "fatal")
    .map((i) => {
      const where = [
        ...(Array.isArray(i.expression) ? i.expression : []),
        ...(Array.isArray(i.location) ? i.location : []),
      ];
      const details = (i.details ?? {}) as Json;
      return {
        severity: String(i.severity),
        location: typeof where[0] === "string" ? where[0] : "",
        message: String(details.text ?? i.diagnostics ?? i.code ?? "invalid"),
      };
    });
  return { valid: issues.length === 0, issues: issues.slice(0, 50) };
}

export async function validateDocument(
  bundle: unknown,
  profile: string,
): Promise<ValidationResult> {
  const base = process.env.FHIR_VALIDATOR_URL;
  if (!base) {
    throw new ValidatorUnavailableError(
      "no FHIR validator is configured (FHIR_VALIDATOR_URL)",
    );
  }
  const url = `${base.replace(
    /\/+$/,
    "",
  )}/$validate?profile=${encodeURIComponent(profile)}`;
  let body: unknown;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/fhir+json",
        Accept: "application/fhir+json",
      },
      body: JSON.stringify(bundle),
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
    });
    body = await res.json();
  } catch (err) {
    throw new ValidatorUnavailableError(
      `the FHIR validator did not answer: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
  // HAPI answers an invalid resource with 412, Matchbox with 200; both send
  // an OperationOutcome, and that is what counts.
  const result = outcomeToResult(body);
  if (!result) {
    throw new ValidatorUnavailableError(
      "the FHIR validator answered without an OperationOutcome",
    );
  }
  return result;
}
