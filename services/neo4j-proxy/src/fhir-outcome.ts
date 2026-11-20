import type { Response } from "express";

// ---------------------------------------------------------------------------
// FHIR R4 OperationOutcome for the /fhir routes (#1174)
// ---------------------------------------------------------------------------
//
// Every answer under /fhir that is not a resource or a Bundle is an
// OperationOutcome, as https://hl7.org/fhir/R4/http.html asks, never the
// proxy's usual `{ error }`. The issue codes are the R4 IssueType codes
// (https://hl7.org/fhir/R4/valueset-issue-type.html).

export const FHIR_JSON = "application/fhir+json";

export type IssueCode =
  | "invalid"
  | "structure"
  | "required"
  | "value"
  | "not-found"
  | "not-supported"
  | "login"
  | "forbidden"
  | "processing"
  | "exception"
  | "transient"
  | "too-costly"
  | "informational";

export type IssueSeverity = "fatal" | "error" | "warning" | "information";

export interface OperationOutcome {
  resourceType: "OperationOutcome";
  issue: Array<{
    severity: IssueSeverity;
    code: IssueCode;
    diagnostics: string;
  }>;
}

export function operationOutcome(
  code: IssueCode,
  diagnostics: string,
  severity: IssueSeverity = "error",
): OperationOutcome {
  return {
    resourceType: "OperationOutcome",
    issue: [{ severity, code, diagnostics }],
  };
}

/** Answers `status` with an OperationOutcome of one issue. */
export function sendOutcome(
  res: Response,
  status: number,
  code: IssueCode,
  diagnostics: string,
): void {
  res.status(status);
  res.setHeader("Content-Type", FHIR_JSON);
  res.json(operationOutcome(code, diagnostics));
}

/** A request the FHIR routes refuse, with the status and issue it gets. */
export class FhirError extends Error {
  constructor(
    readonly status: number,
    readonly code: IssueCode,
    message: string,
  ) {
    super(message);
    this.name = "FhirError";
  }
}
