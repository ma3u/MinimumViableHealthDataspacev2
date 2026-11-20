import { MATCHBOX_TIMEOUT_MS, matchboxUrl } from "./config.js";
import { ALLOWED_EXTENSION_DOMAINS } from "./fhir-extension-domains.js";
import {
  FHIR_JSON,
  FhirError,
  operationOutcome,
  type OperationOutcome,
} from "./fhir-outcome.js";
import { logger } from "./logger.js";

// ---------------------------------------------------------------------------
// $validate, forwarded (#1174)
// ---------------------------------------------------------------------------
//
// The facade does not validate anything itself (discussion #1169): it reads
// the operation's input, as https://hl7.org/fhir/R4/resource-operation-validate.html
// defines it, and hands the resource to Matchbox, which runs the HL7 Java
// validator over the IG packages pinned in scripts/eehrxf/profiles.json. What
// comes back is Matchbox's OperationOutcome, unchanged.

type Json = Record<string, unknown>;

export interface ValidateInput {
  resource: Json;
  /** The profile to validate against; the base definition of the type if none. */
  profile: string;
}

const CANONICAL = /^https?:\/\/\S+$/;

function isObject(v: unknown): v is Json {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function canonical(value: unknown, where: string): string {
  if (typeof value !== "string" || !CANONICAL.test(value)) {
    throw new FhirError(
      400,
      "value",
      `${where} must be a canonical URL of a StructureDefinition`,
    );
  }
  return value;
}

/**
 * The resource and profile of a $validate call: the resource as the body, or
 * a Parameters body with `resource` and optionally `profile`; `profile` also
 * as a query parameter. `mode` (create, update, delete) is not supported.
 * `type` is the type of POST /fhir/{type}/$validate.
 */
export function validateInput(
  body: unknown,
  query: Record<string, unknown>,
  type?: string,
): ValidateInput {
  for (const name of Object.keys(query)) {
    if (name !== "profile") {
      throw new FhirError(
        400,
        "not-supported",
        `$validate parameter "${name}" is not supported here (only resource and profile)`,
      );
    }
  }
  if (!isObject(body) || typeof body.resourceType !== "string") {
    throw new FhirError(
      400,
      "structure",
      "$validate needs a FHIR resource, or a Parameters resource with one, as an application/fhir+json body",
    );
  }
  let resource: Json | undefined = body;
  let profile: string | undefined;
  if (body.resourceType === "Parameters") {
    resource = undefined;
    const parameters = Array.isArray(body.parameter) ? body.parameter : [];
    for (const p of parameters) {
      if (!isObject(p)) continue;
      if (p.name === "resource" && isObject(p.resource)) resource = p.resource;
      else if (p.name === "profile") {
        profile = canonical(
          p.valueUri ?? p.valueCanonical ?? p.valueString,
          "The profile parameter",
        );
      } else if (p.name === "mode") {
        throw new FhirError(
          400,
          "not-supported",
          "$validate mode is not supported here; resources are validated as they are",
        );
      }
    }
    if (!resource || typeof resource.resourceType !== "string") {
      throw new FhirError(
        400,
        "required",
        "The Parameters resource holds no resource to validate",
      );
    }
  }
  const resourceType = resource.resourceType as string;
  if (type && resourceType !== type) {
    throw new FhirError(
      400,
      "invalid",
      `POST /fhir/${type}/$validate takes a ${type}, got a ${resourceType}`,
    );
  }
  const q = query.profile;
  if (q !== undefined) {
    profile = canonical(Array.isArray(q) ? q[q.length - 1] : q, "profile");
  }
  return {
    resource,
    profile:
      profile ?? `http://hl7.org/fhir/StructureDefinition/${resourceType}`,
  };
}

export interface ValidateResult {
  status: number;
  body: OperationOutcome | Json;
}

/**
 * Matchbox's $validate URL: the profile, and every extension domain the CI
 * validator allows as an `extensions` parameter, so an unknown extension
 * from our own or Synthea's domain is allowed and one from any other domain
 * stays an error. Matchbox v4.1.21 reads the domains only from the request:
 * the `extensions` of its application.yaml never reaches a $validate
 * (ADR-097, scripts/eehrxf/build.py).
 */
export function matchboxValidateUrl(base: string, profile: string): string {
  const query = [`profile=${encodeURIComponent(profile)}`];
  for (const domain of ALLOWED_EXTENSION_DOMAINS) {
    query.push(`extensions=${encodeURIComponent(domain)}`);
  }
  return `${base}/$validate?${query.join("&")}`;
}

/**
 * Sends the resource to Matchbox and returns its OperationOutcome. 503 when
 * no validator is configured or it does not answer, 502 when it answers with
 * something that is not an OperationOutcome.
 */
export async function forwardValidate(
  input: ValidateInput,
  fetchImpl: typeof fetch = fetch,
): Promise<ValidateResult> {
  const base = matchboxUrl();
  if (!base) {
    return {
      status: 503,
      body: operationOutcome(
        "not-supported",
        "No validator is configured on this proxy (MATCHBOX_URL); start it with docker-compose.matchbox.yml",
      ),
    };
  }
  const url = matchboxValidateUrl(base, input.profile);
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": FHIR_JSON, Accept: FHIR_JSON },
      body: JSON.stringify(input.resource),
      signal: AbortSignal.timeout(MATCHBOX_TIMEOUT_MS),
    });
  } catch (err) {
    logger.warn({ reason: (err as Error).message }, "validator unreachable");
    return {
      status: 503,
      body: operationOutcome("transient", "The validator did not answer"),
    };
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }
  if (!isObject(body) || body.resourceType !== "OperationOutcome") {
    logger.warn({ status: response.status }, "validator answer not usable");
    return {
      status: 502,
      body: operationOutcome(
        "exception",
        "The validator did not answer with an OperationOutcome",
      ),
    };
  }
  // A validation that ran answers 200 with its issues, errors included. A
  // 4xx from the validator (an unknown profile, say) is the caller's; a 5xx
  // is the validator's own failure.
  const status =
    response.status >= 500 ? 502 : response.ok ? 200 : response.status;
  return { status, body };
}
