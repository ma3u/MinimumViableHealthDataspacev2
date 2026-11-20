import type { SearchParamDef } from "./fhir-search.js";
import { RESULT_PARAMS } from "./fhir-search.js";

// ---------------------------------------------------------------------------
// What the FHIR facade serves, in one table (#1174)
// ---------------------------------------------------------------------------
//
// routes/fhir.ts registers its routes and reads its search parameters from
// FHIR_RESOURCES, and GET /fhir/metadata answers the CapabilityStatement
// built from the same table. __tests__/fhir-capability.test.ts compares the
// statement with the routes Express actually holds and sends every declared
// parameter to its route, so a route or a parameter added without the table
// (or the other way round) fails the suite.
//
// The facade is narrow by decision (discussion #1169): read by id, the search
// parameters below, $everything and $validate. No generic search, _include,
// _history, transactions, SMART or $export. The graph stays the source.

export type FhirOperation = "everything" | "validate";

export interface FhirResourceCapability {
  type: string;
  /** GET /fhir/{type}/{id}. */
  read: boolean;
  /** GET /fhir/{type}?..., with these parameters; null for no search. */
  search: readonly SearchParamDef[] | null;
  operations: readonly FhirOperation[];
  documentation: string;
}

const VALIDATE_ONLY =
  "Not served from the graph here; $validate only (forwarded to the validator).";

export const FHIR_RESOURCES: readonly FhirResourceCapability[] = [
  {
    type: "Patient",
    read: true,
    search: [
      {
        name: "gender",
        type: "token",
        documentation:
          "administrative-gender code, with or without the system http://hl7.org/fhir/administrative-gender",
      },
      {
        name: "name",
        type: "string",
        documentation:
          "case-insensitive, starts with, on the full name or any part of it",
      },
    ],
    operations: ["everything", "validate"],
    documentation:
      "Read by id answers a dataspace pull only (a siglet token for a patient dataset). Persons who opted out of secondary use (EHDS Art. 71) are not served.",
  },
  {
    type: "Observation",
    read: true,
    search: [
      {
        name: "patient",
        type: "reference",
        documentation: "<id>, Patient/<id> or an absolute URL ending in it",
      },
      {
        name: "code",
        type: "token",
        documentation:
          "[system]|[code]; an Observation coded by a LoincCode node has the system http://loinc.org",
      },
      {
        name: "date",
        type: "date",
        documentation:
          "the effective date or dateTime, as a range at its precision; prefixes eq, ne, gt, lt, ge, le, sa, eb (not ap)",
      },
    ],
    operations: ["validate"],
    documentation:
      "Every searchset includes the referenced Patients (search.mode include), as _include=Observation:subject would. Read by id answers a dataspace pull only (a siglet token for the observation dataset). Persons who opted out of secondary use (EHDS Art. 71) are not served.",
  },
  ...[
    "Condition",
    "DiagnosticReport",
    "Encounter",
    "MedicationRequest",
    "Procedure",
  ].map(
    (type): FhirResourceCapability => ({
      type,
      read: false,
      search: null,
      operations: ["validate"],
      documentation: VALIDATE_ONLY,
    }),
  ),
];

/** The resource types POST /fhir/{type}/$validate takes. */
export const VALIDATE_TYPES: ReadonlySet<string> = new Set(
  FHIR_RESOURCES.filter((r) => r.operations.includes("validate")).map(
    (r) => r.type,
  ),
);

export function capabilityOf(type: string): FhirResourceCapability | undefined {
  return FHIR_RESOURCES.find((r) => r.type === type);
}

/**
 * Routes under /fhir that are not FHIR interactions and so are not in the
 * statement: POST /fhir/Bundle is the cohort query of the fhir-cohort-bundle
 * dataset (a body of criteria, not a Bundle to create).
 */
export const NON_FHIR_ROUTES: ReadonlyArray<{ method: string; path: string }> =
  [{ method: "post", path: "/fhir/Bundle" }];

/** The Express routes the table stands for, as `method path`. */
export function expectedRoutes(): string[] {
  const out = ["get /fhir/metadata", "post /fhir/$validate"];
  out.push("post /fhir/:type/$validate");
  for (const r of FHIR_RESOURCES) {
    if (r.search) out.push(`get /fhir/${r.type}`);
    if (r.read) out.push(`get /fhir/${r.type}/:id`);
    if (r.operations.includes("everything")) {
      out.push(`get /fhir/${r.type}/:id/$everything`);
    }
  }
  for (const r of NON_FHIR_ROUTES) out.push(`${r.method} ${r.path}`);
  return out.sort();
}

const OPERATION_DEFINITIONS: Record<FhirOperation, string> = {
  everything: "http://hl7.org/fhir/OperationDefinition/Patient-everything",
  validate: "http://hl7.org/fhir/OperationDefinition/Resource-validate",
};

const STARTED = new Date().toISOString();

export interface CapabilityOptions {
  /** Whether $validate has a validator to forward to (MATCHBOX_URL). */
  validator: boolean;
  /** The facade's base URL, as the caller reached it. */
  baseUrl?: string;
}

/**
 * The CapabilityStatement for what the facade answers now. $validate is
 * listed only when a validator is configured: without one it answers 503,
 * and a statement that lists it would not tell the truth.
 */
export function capabilityStatement(opts: CapabilityOptions) {
  const ops = (list: readonly FhirOperation[]) =>
    list
      .filter((o) => o !== "validate" || opts.validator)
      .map((name) => ({ name, definition: OPERATION_DEFINITIONS[name] }));
  const resource = FHIR_RESOURCES.map((r) => {
    const interaction = [
      ...(r.read ? [{ code: "read" }] : []),
      ...(r.search ? [{ code: "search-type" }] : []),
    ];
    const operation = ops(r.operations);
    return {
      type: r.type,
      documentation: r.documentation,
      ...(interaction.length ? { interaction } : {}),
      ...(r.search
        ? {
            searchParam: r.search.map((p) => ({
              name: p.name,
              type: p.type,
              documentation: p.documentation,
            })),
          }
        : {}),
      ...(operation.length ? { operation } : {}),
    };
  }).filter((r) => r.interaction || r.operation);

  return {
    resourceType: "CapabilityStatement",
    id: "neo4j-proxy-fhir-facade",
    status: "active",
    date: STARTED,
    publisher: "MVHD Integration Hub",
    kind: "instance",
    software: { name: "neo4j-proxy FHIR facade" },
    implementation: {
      description:
        "A narrow FHIR R4 facade over the hub's Neo4j graph (#1169, #1174): read by id, the search parameters listed, $everything and $validate. The resources are rebuilt from graph nodes and claim no profile (meta.profile) they have not been validated against (#1144).",
      ...(opts.baseUrl ? { url: opts.baseUrl } : {}),
    },
    fhirVersion: "4.0.1",
    format: ["application/fhir+json", "json"],
    rest: [
      {
        mode: "server",
        documentation: `Searches page with ${RESULT_PARAMS.join(
          " and ",
        )}; the Bundle's next link carries both. A parameter not listed here, or a modifier on one, is not applied: it is left out of the self link and named in an OperationOutcome entry (search.mode outcome), or refused with 400 under Prefer: handling=strict. Errors are OperationOutcomes.`,
        security: {
          description:
            "No SMART. Searches, $everything and $validate rely on the container network (internal ingress on Azure; the local compose stack publishes port 9090 for debugging). The way in for a dataspace participant is the connector's pull (/dataspace/data with a siglet token), and read by id answers a pull only.",
        },
        resource,
        ...(opts.validator
          ? {
              operation: [
                {
                  name: "validate",
                  definition: OPERATION_DEFINITIONS.validate,
                },
              ],
            }
          : {}),
      },
    ],
  };
}
