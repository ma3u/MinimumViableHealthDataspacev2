import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import neo4j from "neo4j-driver";
import { getSession } from "../db.js";
import { app, heavyLimiter } from "../app.js";
import { auditContext, logTransferEvent } from "../audit.js";
import { matchboxUrl } from "../config.js";
import { DATASET_ROUTES, type DataspaceGrant } from "../dataspace-token.js";
import {
  capabilityOf,
  capabilityStatement,
  FHIR_RESOURCES,
  VALIDATE_TYPES,
} from "../fhir-capability.js";
import { FHIR_JSON, FhirError, sendOutcome } from "../fhir-outcome.js";
import { fhirIdOf, toFhirEntry, toFhirResource } from "../fhir-resource.js";
import {
  dateMatch,
  dateParam,
  dateRangeCypher,
  GRAPH_DATE_PATTERN,
  ignoredOutcome,
  pageQuery,
  parseSearch,
  referenceIds,
  stringValues,
  tokenMatch,
  tokenParam,
  valuesOf,
  type PagingLimits,
  type ParsedSearch,
} from "../fhir-search.js";
import { forwardValidate, validateInput } from "../fhir-validate.js";
import { logger } from "../logger.js";
import { releasable, secondaryUseSession } from "../opt-out.js";

// ---- FHIR Endpoints -------------------------------------------------------
//
// A narrow FHIR R4 facade over the graph (#1169, #1174). What it serves is the
// table in fhir-capability.ts, which GET /fhir/metadata answers as a
// CapabilityStatement. These routes are the secondary-use data plane: every
// query runs in secondaryUseSession and every node is checked with
// releasable() before it leaves (EHDS Art. 71, ADR-062).

type Entry = ReturnType<typeof toFhirEntry> & { search?: { mode: string } };

/** R4 3.1.1.5: `Prefer: handling=strict` refuses what lenient handling skips. */
function strictHandling(req: Request): boolean {
  return /\bhandling\s*=\s*strict\b/i.test(req.header("prefer") ?? "");
}

function toNumber(v: unknown): number {
  if (typeof v === "number") return v;
  const n = (v as { toNumber?: () => number } | null)?.toNumber?.();
  return typeof n === "number" ? n : Number(v);
}

/** The facade's base URL, as /metadata names it: entries' fullUrls hang off it. */
function fhirBase(req: Request): string {
  return `${req.protocol}://${req.get("host")}/fhir`;
}

/** The URL of a page of this search, at the path the caller asked on. */
function pageUrl(req: Request, query: string): string {
  // A pull (routes/dataspace.ts) rewrites req.url; originalUrl is what the
  // consumer sent, so its links lead back through /dataspace/data.
  const path = req.originalUrl.split("?")[0];
  return `${req.protocol}://${req.get("host")}${path}?${query}`;
}

/**
 * A searchset Bundle with self, next and previous links. `hasMore` is
 * whether the page query found a match beyond the page. `countMatches` runs the count query only when the total
 * cannot be read off the page.
 */
async function searchset(
  req: Request,
  search: ParsedSearch,
  matches: Entry[],
  includes: Entry[],
  hasMore: boolean,
  countMatches: () => Promise<number>,
) {
  const total = hasMore ? await countMatches() : search.offset + matches.length;
  const link = [
    {
      relation: "self",
      url: pageUrl(req, pageQuery(search, search.count, search.offset)),
    },
  ];
  if (hasMore) {
    link.push({
      relation: "next",
      url: pageUrl(
        req,
        pageQuery(search, search.count, search.offset + search.count),
      ),
    });
  }
  if (search.offset > 0) {
    link.push({
      relation: "previous",
      url: pageUrl(
        req,
        pageQuery(
          search,
          search.count,
          Math.max(0, search.offset - search.count),
        ),
      ),
    });
  }
  const outcome = ignoredOutcome(search.ignored);
  return {
    resourceType: "Bundle",
    type: "searchset",
    total,
    link,
    entry: [...matches, ...includes, ...(outcome ? [outcome] : [])],
  };
}

const searchParamsOf = (type: string) => capabilityOf(type)?.search ?? [];

// The queries are fixed text: every search value reaches them as a parameter
// (fhir-search.ts), an absent one as an empty list.

const PATIENT_MATCH = [
  "MATCH (p:Patient)",
  `WHERE ${tokenMatch(
    "gender",
    "p.gender",
    "'http://hl7.org/fhir/administrative-gender'",
  )}`,
  "  AND all(g IN $name WHERE any(n IN g WHERE",
  "    toLower(coalesce(p.name, '')) STARTS WITH n",
  "    OR any(w IN split(toLower(coalesce(p.name, '')), ' ') WHERE w STARTS WITH n)",
  "    OR toLower(coalesce(p.firstName, '')) STARTS WITH n",
  "    OR toLower(coalesce(p.lastName, '')) STARTS WITH n))",
].join("\n");
const PATIENT_PAGE = `${PATIENT_MATCH}
RETURN p ORDER BY coalesce(p.fhirId, p.id, p.resourceId)
SKIP $skip LIMIT $limit + 1`;
const PATIENT_COUNT = `${PATIENT_MATCH}\nRETURN count(p) AS total`;

/**
 * GET /fhir/Patient
 * A FHIR R4 searchset of patients: gender, name, _count (default 100, at
 * most 1000) and _offset. This is the base route called by the data plane
 * for the "fhir-patient-everything" asset (baseUrl ends at /fhir/Patient).
 */
const PATIENT_PAGING: PagingLimits = { defaultCount: 100, maxCount: 1000 };
app.get(
  "/fhir/Patient",
  async (req: Request, res: Response, next: NextFunction) => {
    // Art. 71 (ADR-062): the data plane serves research; persons who opted out are left out.
    const session = secondaryUseSession(getSession());
    try {
      const search = parseSearch(
        req.query,
        searchParamsOf("Patient"),
        PATIENT_PAGING,
        strictHandling(req),
      );
      const params = {
        gender: tokenParam(valuesOf(search, "gender")),
        name: stringValues(valuesOf(search, "name")),
      };
      const result = await session.run(PATIENT_PAGE, {
        ...params,
        skip: neo4j.int(search.offset),
        limit: neo4j.int(search.count),
      });
      const rows = result.records.slice(0, search.count);
      const base = fhirBase(req);
      const entries = rows
        .filter((r) => releasable(r.get("p")))
        .map((r) =>
          toFhirEntry(toFhirResource("Patient", r.get("p").properties), base),
        )
        .map((e) => ({ ...e, search: { mode: "match" } }));
      const bundle = await searchset(
        req,
        search,
        entries,
        [],
        result.records.length > search.count,
        async () => {
          const c = await session.run(PATIENT_COUNT, params);
          return toNumber(c.records[0]?.get("total"));
        },
      );

      res.setHeader("Content-Type", FHIR_JSON);
      res.json(bundle);
      // Fire-and-forget audit log
      logTransferEvent(
        "/fhir/Patient",
        "GET",
        req.headers["x-participant"] as string,
        200,
        entries.length,
        auditContext(req, res),
      );
    } catch (err) {
      next(err);
    } finally {
      await session.close();
    }
  },
);

/** The system of an Observation's code: its own, or LOINC for a LoincCode. */
const OBSERVATION_SYSTEM =
  "coalesce(o.codeSystem, CASE WHEN EXISTS { MATCH (o)-[:CODED_BY]->(:LoincCode) } THEN 'http://loinc.org' END)";
/** An Observation's effective date or dateTime, whichever property holds it. */
const OBSERVATION_DATE =
  "toString(coalesce(o.dateTime, o.effectiveDate, o.date, o.effectiveStart))";

const OBSERVATION_MATCH = [
  "MATCH (p:Patient)-[:HAS_OBSERVATION]->(o:Observation)",
  "WHERE all(g IN $patient WHERE p.fhirId IN g OR p.id IN g OR p.resourceId IN g)",
  `  AND ${tokenMatch("code", "o.code", OBSERVATION_SYSTEM)}`,
  dateRangeCypher(OBSERVATION_DATE, "eff", ["p", "o"]),
  `WHERE ${dateMatch("date", "effLo", "effHi")}`,
].join("\n");
const OBSERVATION_PAGE = `${OBSERVATION_MATCH}
RETURN p, o
ORDER BY coalesce(${OBSERVATION_DATE}, "") DESC, coalesce(o.fhirId, o.id, o.resourceId)
SKIP $skip LIMIT $limit + 1`;
const OBSERVATION_COUNT = `${OBSERVATION_MATCH}\nRETURN count(o) AS total`;

/**
 * GET /fhir/Observation
 * A FHIR R4 searchset of Observations, newest first, each with its subject
 * reference, and the Patients they refer to as `search.mode: include` (as
 * `_include=Observation:subject` would), so a consumer that imports the data
 * can relate every observation to its patient (#876). The dataset
 * "fhir-observation-bundle" is read with it. patient, code and date narrow
 * it (fhir-search.ts), _count (default 200, at most 2000) and _offset page it.
 */
const OBSERVATION_PAGING: PagingLimits = { defaultCount: 200, maxCount: 2000 };
app.get(
  "/fhir/Observation",
  async (req: Request, res: Response, next: NextFunction) => {
    // Art. 71 (ADR-062): the data plane serves research; persons who opted out are left out.
    const session = secondaryUseSession(getSession());
    try {
      const search = parseSearch(
        req.query,
        searchParamsOf("Observation"),
        OBSERVATION_PAGING,
        strictHandling(req),
      );
      const params = {
        patient: referenceIds(valuesOf(search, "patient"), "Patient"),
        code: tokenParam(valuesOf(search, "code")),
        date: dateParam(valuesOf(search, "date")),
        graphDatePattern: GRAPH_DATE_PATTERN,
      };
      const result = await session.run(OBSERVATION_PAGE, {
        ...params,
        skip: neo4j.int(search.offset),
        limit: neo4j.int(search.count),
      });

      const matches: Entry[] = [];
      const patients = new Map<string, Entry>();
      const base = fhirBase(req);
      for (const r of result.records.slice(0, search.count)) {
        const p = r.get("p");
        const o = r.get("o");
        if (!releasable(p) || !releasable(o)) continue;
        const pid = fhirIdOf(p.properties);
        matches.push({
          ...toFhirEntry(
            toFhirResource("Observation", o.properties, pid),
            base,
          ),
          search: { mode: "match" },
        });
        if (pid && !patients.has(pid)) {
          patients.set(pid, {
            ...toFhirEntry(toFhirResource("Patient", p.properties), base),
            search: { mode: "include" },
          });
        }
      }
      const bundle = await searchset(
        req,
        search,
        matches,
        [...patients.values()],
        result.records.length > search.count,
        async () => {
          const c = await session.run(OBSERVATION_COUNT, params);
          return toNumber(c.records[0]?.get("total"));
        },
      );

      res.setHeader("Content-Type", FHIR_JSON);
      res.json(bundle);
      logTransferEvent(
        "/fhir/Observation",
        "GET",
        req.headers["x-participant"] as string,
        200,
        matches.length,
        auditContext(req, res),
      );
    } catch (err) {
      next(err);
    } finally {
      await session.close();
    }
  },
);

/**
 * GET /fhir/metadata
 * The CapabilityStatement of what this facade answers (fhir-capability.ts).
 * No patient data, so no audit record.
 */
app.get("/fhir/metadata", (req: Request, res: Response) => {
  res.setHeader("Content-Type", FHIR_JSON);
  res.json(
    capabilityStatement({
      validator: Boolean(matchboxUrl()),
      baseUrl: fhirBase(req),
    }),
  );
});

/**
 * GET /fhir/{type}/{id}: read by id, for the types the table marks `read`.
 *
 * It answers a dataspace pull only (routes/dataspace.ts), as
 * /programmes/answers does: GET /dataspace/data/{id} with the siglet token of
 * a transfer of a dataset whose route is /fhir/{type}. The proxy's other FHIR
 * routes rely on the container network alone; a new way to read one record
 * does not, so a call that did not come through a verified token is 401.
 * The id is the FHIR id of a loaded node, or the id or resourceId of a
 * seeded one. A person who opted out is answered like one who is not there.
 */
const READ_QUERIES: Record<string, string> = {
  Patient: `MATCH (n:Patient)
            WHERE n.fhirId = $id OR n.id = $id OR n.resourceId = $id
            RETURN n, null AS p LIMIT 1`,
  Observation: `MATCH (p:Patient)-[:HAS_OBSERVATION]->(n:Observation)
                WHERE n.fhirId = $id OR n.id = $id OR n.resourceId = $id
                RETURN n, p LIMIT 1`,
};

function pullGrantCovers(res: Response, type: string): boolean {
  const grant = res.locals.dataspaceGrant as DataspaceGrant | undefined;
  if (!grant) {
    sendOutcome(
      res,
      401,
      "login",
      `${type} is read by id over a dataspace transfer only: GET /dataspace/data/{id} with the transfer's access token`,
    );
    return false;
  }
  if (DATASET_ROUTES[grant.datasetId]?.path !== `/fhir/${type}`) {
    sendOutcome(
      res,
      403,
      "forbidden",
      `The transfer of dataset ${grant.datasetId} does not cover ${type}`,
    );
    return false;
  }
  return true;
}

for (const { type } of FHIR_RESOURCES.filter((r) => r.read)) {
  const cypher = READ_QUERIES[type];
  if (!cypher)
    throw new Error(`No read query for ${type} (fhir-capability.ts)`);
  app.get(
    `/fhir/${type}/:id`,
    async (req: Request, res: Response, next: NextFunction) => {
      if (!pullGrantCovers(res, type)) return;
      // Art. 71 (ADR-062): the data plane serves research; persons who opted out are left out.
      const session = secondaryUseSession(getSession());
      try {
        const id = String(req.params.id);
        const result = await session.run(cypher, { id });
        const rec = result.records[0];
        const node = rec?.get("n");
        const patient = rec?.get("p");
        if (!node || !releasable(node) || (patient && !releasable(patient))) {
          sendOutcome(res, 404, "not-found", `${type}/${id} not found`);
          return;
        }
        const pid = patient ? fhirIdOf(patient.properties) : undefined;
        res.setHeader("Content-Type", FHIR_JSON);
        res.json(toFhirResource(type, node.properties, pid));
        logTransferEvent(
          `/fhir/${type}/${id}`,
          "GET",
          req.headers["x-participant"] as string,
          200,
          1,
          auditContext(req, res),
        );
      } catch (err) {
        next(err);
      } finally {
        await session.close();
      }
    },
  );
}

/**
 * GET /fhir/Patient/:id/$everything
 *
 * The id is the FHIR id of a loaded patient, or the id or resourceId of a
 * seeded one, so the demo record P1 answers as well. Resources hang off an
 * Encounter (the loader's shape) or directly off the Patient (the seeds'
 * shape); both are collected. Since ADR-059 the Bundle also carries the
 * record's DiagnosticReports, Immunizations and MedicationStatements.
 * Returns a FHIR R4 Bundle containing all resources for a single patient.
 */
app.get(
  "/fhir/Patient/:id/\\$everything",
  async (req: Request, res: Response, next: NextFunction) => {
    // Art. 71 (ADR-062): the data plane serves research; persons who opted out are left out.
    const session = secondaryUseSession(getSession());
    try {
      const patientId = req.params.id;

      // Fetch the patient node and all directly connected clinical resources.
      const result = await session.run(
        `
      MATCH (p:Patient)
      WHERE p.fhirId = $patientId OR p.id = $patientId OR p.resourceId = $patientId
      WITH p LIMIT 1
      OPTIONAL MATCH (p)-[:HAS_ENCOUNTER]->(enc:Encounter)
      OPTIONAL MATCH (enc)-[:HAS_CONDITION]->(encCond:Condition)
      OPTIONAL MATCH (enc)-[:HAS_OBSERVATION]->(encObs:Observation)
      OPTIONAL MATCH (enc)-[:HAS_PROCEDURE]->(encProc:Procedure)
      OPTIONAL MATCH (p)-[:HAS_PROCEDURE]->(proc:Procedure)
      OPTIONAL MATCH (enc)-[:HAS_MEDICATION_REQUEST]->(encMed:MedicationRequest)
      OPTIONAL MATCH (p)-[:HAS_CONDITION]->(cond:Condition)
      OPTIONAL MATCH (p)-[:HAS_OBSERVATION]->(obs:Observation)
      OPTIONAL MATCH (p)-[:HAS_MEDICATION_REQUEST|HAS_MEDICATION]->(med:MedicationRequest)
      OPTIONAL MATCH (p)-[:HAS_DIAGNOSTIC_REPORT]->(rep:DiagnosticReport)
      OPTIONAL MATCH (p)-[:HAS_IMMUNIZATION]->(imm:Immunization)
      OPTIONAL MATCH (p)-[:HAS_MEDICATION_STATEMENT]->(stm:MedicationStatement)
      RETURN p, collect(DISTINCT enc) AS encounters,
             collect(DISTINCT encCond) + collect(DISTINCT cond) AS conditions,
             collect(DISTINCT encObs) + collect(DISTINCT obs)   AS observations,
             collect(DISTINCT encProc) + collect(DISTINCT proc) AS procedures,
             collect(DISTINCT encMed) + collect(DISTINCT med)   AS medications,
             collect(DISTINCT rep)  AS reports,
             collect(DISTINCT imm)  AS immunizations,
             collect(DISTINCT stm)  AS statements
      `,
        { patientId },
      );

      // Checked again before release (Art. 71, ADR-062): a person who opted
      // out is answered like one who is not there.
      if (
        result.records.length === 0 ||
        !releasable(result.records[0].get("p"))
      ) {
        sendOutcome(res, 404, "not-found", `Patient/${patientId} not found`);
        return;
      }

      const rec = result.records[0];
      const patient = rec.get("p").properties;
      // A record reached both from an Encounter and from the Patient is
      // listed once: R4 wants each fullUrl once in a Bundle (bdl-7).
      // Reports, the vaccination record and the medication plan (ADR-059)
      // are absent from an answer of an older query, hence `has`.
      const props = (key: string) => {
        const seen = new Set<string>();
        return (rec.has?.(key) === false ? [] : rec.get(key) ?? [])
          .filter(releasable)
          .map((n: any) => n.properties as Record<string, unknown>)
          .filter((n: Record<string, unknown>) => {
            const id = fhirIdOf(n);
            if (id === undefined) return true;
            if (seen.has(id)) return false;
            seen.add(id);
            return true;
          });
      };

      // Every record refers to its patient, so a consumer can relate them (#876).
      const pid = fhirIdOf(patient);
      const base = fhirBase(req);
      const as = (type: string) => (n: Record<string, unknown>) =>
        toFhirEntry(toFhirResource(type, n, pid), base);
      const entries = [
        toFhirEntry(toFhirResource("Patient", patient), base),
        ...props("encounters").map(as("Encounter")),
        ...props("conditions").map(as("Condition")),
        ...props("observations").map(as("Observation")),
        ...props("procedures").map(as("Procedure")),
        ...props("medications").map(as("MedicationRequest")),
        ...props("reports").map(as("DiagnosticReport")),
        ...props("immunizations").map(as("Immunization")),
        ...props("statements").map(as("MedicationStatement")),
      ];

      const bundle = {
        resourceType: "Bundle",
        type: "searchset",
        total: entries.length,
        entry: entries,
      };

      res.setHeader("Content-Type", FHIR_JSON);
      res.json(bundle);
      logTransferEvent(
        `/fhir/Patient/${patientId}/$everything`,
        "GET",
        req.headers["x-participant"] as string,
        200,
        entries.length,
        auditContext(req, res),
      );
    } catch (err) {
      next(err);
    } finally {
      await session.close();
    }
  },
);

/**
 * POST /fhir/Bundle
 * Returns a FHIR R4 Bundle of patients matching cohort criteria.
 * Body: { gender?: string, minAge?: number, maxAge?: number, condition?: string, limit?: number }
 * Not a FHIR interaction (it creates nothing): the cohort query of the
 * fhir-cohort-bundle dataset, so /fhir/metadata does not list it.
 */
app.post(
  "/fhir/Bundle",
  async (req: Request, res: Response, next: NextFunction) => {
    // Art. 71 (ADR-062): the data plane serves research; persons who opted out are left out.
    const session = secondaryUseSession(getSession());
    try {
      const { gender, minAge, maxAge, condition, limit = 100 } = req.body ?? {};

      let cypher = "MATCH (p:Patient)";
      const params: Record<string, any> = {
        limit: neo4j.int(Math.min(Number(limit), 1000)),
      };
      const filters: string[] = [];

      if (gender) {
        filters.push("p.gender = $gender");
        params.gender = gender;
      }
      if (condition) {
        cypher += `\n  MATCH (p)-[:HAS_ENCOUNTER]->()-[:HAS_CONDITION]->(c:Condition)`;
        filters.push("c.code CONTAINS $condition");
        params.condition = condition;
      }

      if (filters.length > 0) {
        cypher += `\nWHERE ${filters.join(" AND ")}`;
      }
      cypher += `\nRETURN DISTINCT p LIMIT $limit`;

      const result = await session.run(cypher, params);

      const base = fhirBase(req);
      const entries = result.records
        .filter((r) => releasable(r.get("p")))
        .map((r) =>
          toFhirEntry(toFhirResource("Patient", r.get("p").properties), base),
        );

      res.setHeader("Content-Type", FHIR_JSON);
      res.json({
        resourceType: "Bundle",
        type: "searchset",
        total: entries.length,
        entry: entries,
      });
      logTransferEvent(
        "/fhir/Bundle",
        "POST",
        req.headers["x-participant"] as string,
        200,
        entries.length,
        auditContext(req, res),
      );
    } catch (err) {
      next(err);
    } finally {
      await session.close();
    }
  },
);

/**
 * POST /fhir/$validate and POST /fhir/{type}/$validate
 *
 * Forwarded to the validator (fhir-validate.ts); 503 without one. Reads
 * nothing from the graph, so it writes no audit record; the heavy limit
 * applies, as validation is expensive.
 */
const fhirBody = express.json({
  type: ["application/fhir+json", "application/json"],
  limit: "2mb",
});

function validateRoute(typeOf: (req: Request) => string | undefined) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const type = typeOf(req);
      if (type !== undefined && !VALIDATE_TYPES.has(type)) {
        sendOutcome(
          res,
          404,
          "not-supported",
          `$validate is not offered for ${type} here (see /fhir/metadata)`,
        );
        return;
      }
      const input = validateInput(req.body, req.query, type);
      const result = await forwardValidate(input);
      res.status(result.status);
      res.setHeader("Content-Type", FHIR_JSON);
      res.json(result.body);
    } catch (err) {
      next(err);
    }
  };
}

app.post(
  "/fhir/\\$validate",
  heavyLimiter,
  fhirBody,
  validateRoute(() => undefined),
);
app.post(
  "/fhir/:type/\\$validate",
  heavyLimiter,
  fhirBody,
  validateRoute((req) => String(req.params.type)),
);

// ---- Everything else under /fhir is an OperationOutcome --------------------
// Registered after every /fhir route above: a route added under /fhir in
// another module would be shadowed by this, so FHIR routes live here.

app.use("/fhir", (req: Request, res: Response) => {
  sendOutcome(
    res,
    404,
    "not-supported",
    `${req.method} ${
      req.originalUrl.split("?")[0]
    } is not served by this FHIR facade (see /fhir/metadata)`,
  );
});

app.use(
  "/fhir",
  (err: Error, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) return next(err);
    if (err instanceof FhirError) {
      sendOutcome(res, err.status, err.code, err.message);
      return;
    }
    // A body the parser refused (malformed JSON, too large) carries its status.
    const status = (err as { status?: number }).status;
    if (typeof status === "number" && status >= 400 && status < 500) {
      sendOutcome(
        res,
        status,
        status === 413 ? "too-costly" : "structure",
        status === 413
          ? "The request body is too large"
          : "The request body could not be read as JSON",
      );
      return;
    }
    // As the global handler: the message goes to the log, never the caller.
    logger.error({ err }, "unhandled FHIR route error");
    sendOutcome(res, 500, "exception", "Internal Server Error");
  },
);
