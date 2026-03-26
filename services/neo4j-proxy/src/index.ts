/**
 * Neo4j Query Proxy — ADR-2 Implementation
 *
 * Bridges DCore data planes to the Neo4j 5-layer health knowledge graph.
 * Translates HTTP requests into Cypher queries and serialises results as:
 *   - FHIR R4 Bundle JSON      (dataplane-fhir)
 *   - OMOP CDM JSON / CSV      (dataplane-omop)
 *   - HealthDCAT-AP JSON-LD     (federated catalog)
 *
 * Security: Only accepts requests from DCore data plane containers on the
 * Docker network. Authorisation is handled upstream by the EDC-V control
 * plane's contract enforcement layer.
 */

import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import crypto from "crypto";
import neo4j, { type Driver, type Session } from "neo4j-driver";
import pg from "pg";
import rateLimit from "express-rate-limit";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env.PORT ?? "9090", 10);
const NEO4J_URI = process.env.NEO4J_URI ?? "bolt://localhost:7687";
const NEO4J_USER = process.env.NEO4J_USER ?? "neo4j";
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD ?? "healthdataspace";

// Phase 5: Second SPE for federated queries (optional)
const NEO4J_SPE2_URI = process.env.NEO4J_SPE2_URI;
const NEO4J_SPE2_USER = process.env.NEO4J_SPE2_USER ?? NEO4J_USER;
const NEO4J_SPE2_PASSWORD = process.env.NEO4J_SPE2_PASSWORD ?? NEO4J_PASSWORD;

// GDPR / EHDS: k-anonymity minimum cohort size for federated queries.
// Callers may request a HIGHER threshold via the request body, but never lower.
// Set to 0 to disable enforcement (not recommended for production).
const MIN_COHORT_SIZE = parseInt(process.env.MIN_COHORT_SIZE ?? "5", 10);

// Phase 18: Trust Center pseudonym resolution
// HMAC key for stateless deterministic pseudonym derivation.
// In production this MUST come from a secure vault (e.g. HashiCorp Vault).
const TRUST_CENTER_HMAC_KEY =
  process.env.TRUST_CENTER_HMAC_KEY ?? "mvhds-dev-trust-center-key-change-me";

// Phase 5c: Optional LLM endpoint for Text2Cypher
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
const OLLAMA_URL = process.env.OLLAMA_URL; // e.g. http://localhost:11434
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "llama3.1";

// ---------------------------------------------------------------------------
// Neo4j drivers (primary SPE + optional secondary SPE)
// ---------------------------------------------------------------------------

let driver: Driver;
let spe2Driver: Driver | null = null;

function getSession(): Session {
  return driver.session({ database: "neo4j" });
}

function getSpe2Session(): Session | null {
  return spe2Driver?.session({ database: "neo4j" }) ?? null;
}

/** Returns all active SPE labels and their drivers */
function getSpeDrivers(): Array<{ label: string; driver: Driver }> {
  const spes = [{ label: "SPE-1", driver }];
  if (spe2Driver) spes.push({ label: "SPE-2", driver: spe2Driver });
  return spes;
}

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------

const app = express();
app.use(express.json());

// ---------------------------------------------------------------------------
// Rate Limiting (Fix #3 — P0 production blocker)
// Prevents a single participant from exhausting the proxy under load.
// Limits are configurable via env vars for K8s deployment.
// ---------------------------------------------------------------------------

const RATE_LIMIT_WINDOW_MS = parseInt(
  process.env.RATE_LIMIT_WINDOW_MS ?? "60000",
  10,
); // 1 minute

/** General limit: 100 requests per minute per IP */
const generalLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: parseInt(process.env.RATE_LIMIT_MAX ?? "100", 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests — please retry after 60 seconds." },
});

/** Strict limit for expensive query endpoints: 20 requests per minute per IP */
const heavyLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: parseInt(process.env.RATE_LIMIT_HEAVY_MAX ?? "20", 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Query rate limit exceeded — max 20 analytical requests per minute.",
  },
});

app.use(generalLimiter);

// Export app for testing (supertest)
export { app };

// ---- Audit Logging --------------------------------------------------------

/**
 * Records a data access event in Neo4j for EHDS compliance auditing.
 * Creates (:TransferEvent)-[:ACCESSED]->(:HealthDataset) and
 * (:TransferEvent)-[:REQUESTED_BY]->(:Organization) relationships.
 * Fire-and-forget: errors are logged but do not block the response.
 */
async function logTransferEvent(
  endpoint: string,
  method: string,
  participantHint: string | undefined,
  statusCode: number,
  resultCount: number | undefined,
): Promise<void> {
  const session = getSession();
  try {
    await session.run(
      `
      CREATE (te:TransferEvent {
        eventId: randomUUID(),
        timestamp: datetime(),
        endpoint: $endpoint,
        method: $method,
        participant: $participant,
        statusCode: $statusCode,
        resultCount: $resultCount
      })
      WITH te
      // Link to the dataset if identifiable from the endpoint
      OPTIONAL MATCH (ds:HealthDataset)
        WHERE $endpoint CONTAINS 'fhir' AND ds.title CONTAINS 'FHIR'
           OR $endpoint CONTAINS 'omop' AND ds.title CONTAINS 'OMOP'
           OR $endpoint CONTAINS 'catalog' AND ds.title CONTAINS 'Catalog'
      FOREACH (_ IN CASE WHEN ds IS NOT NULL THEN [1] ELSE [] END |
        MERGE (te)-[:ACCESSED]->(ds)
      )
      RETURN te.eventId AS eventId
      `,
      {
        endpoint,
        method,
        participant: participantHint ?? "unknown",
        statusCode: neo4j.int(statusCode),
        resultCount: resultCount != null ? neo4j.int(resultCount) : null,
      },
    );
  } catch (err) {
    console.error("[neo4j-proxy] Audit log failed:", err);
  } finally {
    await session.close();
  }
}

// ---- Health check ---------------------------------------------------------

app.get("/health", async (_req: Request, res: Response) => {
  try {
    const result = await driver.getServerInfo();
    res.json({ status: "ok", neo4j: result.address });
  } catch (err) {
    res.status(503).json({ status: "error", message: String(err) });
  }
});

// ---- FHIR Endpoints -------------------------------------------------------

/**
 * GET /fhir/Patient
 * Returns a FHIR R4 Bundle (searchset) of all patients.
 * Supports optional query params: ?_count=N&gender=male|female&name=...
 * This is the base route called by the DCore data plane for the
 * "fhir-patient-everything" asset (baseUrl ends at /fhir/Patient).
 */
app.get(
  "/fhir/Patient",
  async (req: Request, res: Response, next: NextFunction) => {
    const session = getSession();
    try {
      const count = Math.min(Number(req.query._count) || 100, 1000);
      const gender = req.query.gender as string | undefined;
      const name = req.query.name as string | undefined;

      let cypher = "MATCH (p:Patient)";
      const params: Record<string, any> = { limit: neo4j.int(count) };
      const filters: string[] = [];

      if (gender) {
        filters.push("p.gender = $gender");
        params.gender = gender;
      }
      if (name) {
        filters.push(
          "(p.firstName CONTAINS $name OR p.lastName CONTAINS $name)",
        );
        params.name = name;
      }
      if (filters.length > 0) {
        cypher += `\nWHERE ${filters.join(" AND ")}`;
      }
      cypher += `\nRETURN p ORDER BY p.fhirId LIMIT $limit`;

      const result = await session.run(cypher, params);

      const entries = result.records.map((r) => {
        const props = r.get("p").properties;
        return {
          fullUrl: `Patient/${props.fhirId}`,
          resource: { resourceType: "Patient", ...props },
        };
      });

      const bundle = {
        resourceType: "Bundle",
        type: "searchset",
        total: entries.length,
        entry: entries,
      };

      res.setHeader("Content-Type", "application/fhir+json");
      res.json(bundle);
      // Fire-and-forget audit log
      logTransferEvent(
        "/fhir/Patient",
        "GET",
        req.headers["x-participant"] as string,
        200,
        entries.length,
      );
    } catch (err) {
      next(err);
    } finally {
      await session.close();
    }
  },
);

/**
 * GET /fhir/Patient/:id/$everything
 * Returns a FHIR R4 Bundle containing all resources for a single patient.
 */
app.get(
  "/fhir/Patient/:id/\\$everything",
  async (req: Request, res: Response, next: NextFunction) => {
    const session = getSession();
    try {
      const patientId = req.params.id;

      // Fetch the patient node and all directly connected clinical resources.
      const result = await session.run(
        `
      MATCH (p:Patient {fhirId: $patientId})
      OPTIONAL MATCH (p)-[:HAS_ENCOUNTER]->(enc:Encounter)
      OPTIONAL MATCH (enc)-[:HAS_CONDITION]->(cond:Condition)
      OPTIONAL MATCH (enc)-[:HAS_OBSERVATION]->(obs:Observation)
      OPTIONAL MATCH (enc)-[:HAS_PROCEDURE]->(proc:Procedure)
      OPTIONAL MATCH (enc)-[:HAS_MEDICATION_REQUEST]->(med:MedicationRequest)
      RETURN p, collect(DISTINCT enc) AS encounters,
             collect(DISTINCT cond) AS conditions,
             collect(DISTINCT obs)  AS observations,
             collect(DISTINCT proc) AS procedures,
             collect(DISTINCT med)  AS medications
      `,
        { patientId },
      );

      if (result.records.length === 0) {
        res.status(404).json({
          resourceType: "OperationOutcome",
          issue: [
            {
              severity: "error",
              code: "not-found",
              diagnostics: `Patient/${patientId} not found`,
            },
          ],
        });
        return;
      }

      const rec = result.records[0];
      const patient = rec.get("p").properties;
      const encounters = rec.get("encounters").map((n: any) => n.properties);
      const conditions = rec.get("conditions").map((n: any) => n.properties);
      const observations = rec
        .get("observations")
        .map((n: any) => n.properties);
      const procedures = rec.get("procedures").map((n: any) => n.properties);
      const medications = rec.get("medications").map((n: any) => n.properties);

      const entries = [
        { resource: { resourceType: "Patient", ...patient } },
        ...encounters.map((e: any) => ({
          resource: { resourceType: "Encounter", ...e },
        })),
        ...conditions.map((c: any) => ({
          resource: { resourceType: "Condition", ...c },
        })),
        ...observations.map((o: any) => ({
          resource: { resourceType: "Observation", ...o },
        })),
        ...procedures.map((p: any) => ({
          resource: { resourceType: "Procedure", ...p },
        })),
        ...medications.map((m: any) => ({
          resource: { resourceType: "MedicationRequest", ...m },
        })),
      ];

      const bundle = {
        resourceType: "Bundle",
        type: "searchset",
        total: entries.length,
        entry: entries,
      };

      res.setHeader("Content-Type", "application/fhir+json");
      res.json(bundle);
      logTransferEvent(
        `/fhir/Patient/${patientId}/$everything`,
        "GET",
        req.headers["x-participant"] as string,
        200,
        entries.length,
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
 */
app.post(
  "/fhir/Bundle",
  async (req: Request, res: Response, next: NextFunction) => {
    const session = getSession();
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

      const entries = result.records.map((r) => ({
        resource: { resourceType: "Patient", ...r.get("p").properties },
      }));

      res.setHeader("Content-Type", "application/fhir+json");
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
      );
    } catch (err) {
      next(err);
    } finally {
      await session.close();
    }
  },
);

// ---- OMOP Endpoints --------------------------------------------------------

/**
 * POST /omop/cohort
 * Returns aggregate OMOP CDM cohort statistics.
 * Body: { concept?: string, groupBy?: "gender" | "ageDecade" | "concept", limit?: number }
 */
app.post(
  "/omop/cohort",
  heavyLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    const session = getSession();
    try {
      const { concept, groupBy = "concept", limit = 50 } = req.body ?? {};
      const params: Record<string, any> = {
        limit: neo4j.int(Math.min(Number(limit), 500)),
      };

      let cypher: string;

      if (groupBy === "gender") {
        cypher = `
        MATCH (p:OMOPPerson)
        RETURN p.genderSourceValue AS group, count(p) AS count
        ORDER BY count DESC LIMIT $limit
      `;
      } else if (groupBy === "ageDecade") {
        cypher = `
        MATCH (p:OMOPPerson)
        WITH (date().year - p.yearOfBirth) / 10 * 10 AS decade, count(*) AS count
        RETURN toString(decade) + 's' AS group, count
        ORDER BY decade LIMIT $limit
      `;
      } else {
        // Default: top conditions by concept
        cypher = `
        MATCH (co:OMOPConditionOccurrence)
        RETURN co.conditionSourceValue AS group, count(co) AS count
        ORDER BY count DESC LIMIT $limit
      `;

        if (concept) {
          cypher = `
          MATCH (co:OMOPConditionOccurrence)
          WHERE co.conditionSourceValue CONTAINS $concept
          RETURN co.conditionSourceValue AS group, count(co) AS count
          ORDER BY count DESC LIMIT $limit
        `;
          params.concept = concept;
        }
      }

      const result = await session.run(cypher, params);
      const rows = result.records.map((r) => ({
        group: r.get("group"),
        count: (r.get("count") as any).toNumber?.() ?? r.get("count"),
      }));

      res.json({
        cohort: rows,
        total: rows.reduce((sum, r) => sum + r.count, 0),
      });
      logTransferEvent(
        "/omop/cohort",
        "POST",
        req.headers["x-participant"] as string,
        200,
        rows.length,
      );
    } catch (err) {
      next(err);
    } finally {
      await session.close();
    }
  },
);

/**
 * GET /omop/person/:id/timeline
 * Returns a clinical timeline for a single OMOP person.
 */
app.get(
  "/omop/person/:id/timeline",
  async (req: Request, res: Response, next: NextFunction) => {
    const session = getSession();
    try {
      const personId = req.params.id;

      const result = await session.run(
        `
      MATCH (p:OMOPPerson {personSourceValue: $personId})
      OPTIONAL MATCH (p)<-[:MAPS_TO_OMOP_PERSON]-(pat:Patient)-[:HAS_ENCOUNTER]->(enc:Encounter)
      OPTIONAL MATCH (enc)-[:HAS_CONDITION]->(cond:Condition)
      OPTIONAL MATCH (enc)-[:HAS_OBSERVATION]->(obs:Observation)
      OPTIONAL MATCH (enc)-[:HAS_PROCEDURE]->(proc:Procedure)
      RETURN p,
             collect(DISTINCT {type: 'Encounter', date: enc.periodStart, data: enc}) AS encounters,
             collect(DISTINCT {type: 'Condition', date: cond.onsetDateTime, data: cond}) AS conditions,
             collect(DISTINCT {type: 'Observation', date: obs.effectiveDateTime, data: obs}) AS observations,
             collect(DISTINCT {type: 'Procedure', date: proc.performedDateTime, data: proc}) AS procedures
      `,
        { personId },
      );

      if (result.records.length === 0) {
        res.status(404).json({ error: `OMOP Person ${personId} not found` });
        return;
      }

      const rec = result.records[0];
      const person = rec.get("p").properties;

      // Merge and sort all events chronologically
      const events = [
        ...rec.get("encounters").map((e: any) => ({
          type: e.type,
          date: e.date,
          ...e.data?.properties,
        })),
        ...rec.get("conditions").map((e: any) => ({
          type: e.type,
          date: e.date,
          ...e.data?.properties,
        })),
        ...rec.get("observations").map((e: any) => ({
          type: e.type,
          date: e.date,
          ...e.data?.properties,
        })),
        ...rec.get("procedures").map((e: any) => ({
          type: e.type,
          date: e.date,
          ...e.data?.properties,
        })),
      ]
        .filter((e) => e.date != null)
        .sort((a, b) => String(a.date).localeCompare(String(b.date)));

      res.json({ person, timeline: events });
      logTransferEvent(
        `/omop/person/${personId}/timeline`,
        "GET",
        req.headers["x-participant"] as string,
        200,
        events.length,
      );
    } catch (err) {
      next(err);
    } finally {
      await session.close();
    }
  },
);

// ---- Catalog Endpoints (HealthDCAT-AP JSON-LD) ----------------------------

/**
 * GET /catalog/datasets
 * Returns all HealthDCAT-AP dataset entries as JSON-LD.
 */
app.get(
  "/catalog/datasets",
  async (req: Request, res: Response, next: NextFunction) => {
    const session = getSession();
    try {
      const result = await session.run(`
      MATCH (ds:HealthDataset)
      OPTIONAL MATCH (ds)-[:HAS_DISTRIBUTION]->(dist:Distribution)
      OPTIONAL MATCH (ds)-[:PUBLISHED_BY]->(pub:Organization)
      OPTIONAL MATCH (ds)-[:HAS_CONTACT_POINT]->(cp:ContactPoint)
      RETURN ds, collect(DISTINCT dist) AS distributions,
             pub, cp
    `);

      const datasets = result.records.map((r) => {
        const ds = r.get("ds").properties;
        const dists = r.get("distributions").map((d: any) => d.properties);
        const pub = r.get("pub")?.properties;
        const cp = r.get("cp")?.properties;

        return {
          "@type": "dcat:Dataset",
          "dct:identifier": ds.dctIdentifier ?? ds.datasetId,
          "dct:title": ds.title,
          "dct:description": ds.description,
          "dct:issued": ds.issued,
          "dct:modified": ds.modified,
          "dct:language": ds.language,
          "dct:spatial": ds.dctSpatial,
          "dct:temporal":
            ds.dctTemporalStart && ds.dctTemporalEnd
              ? { startDate: ds.dctTemporalStart, endDate: ds.dctTemporalEnd }
              : undefined,
          "dcat:theme": ds.themes,
          "healthdcatap:healthCategory": ds.hdcatapHealthCategory,
          "healthdcatap:healthTheme": ds.hdcatapHealthTheme,
          "healthdcatap:datasetType": ds.hdcatapDatasetType,
          "healthdcatap:personalData": ds.hdcatapPersonalData,
          "healthdcatap:sensitiveData": ds.hdcatapSensitiveData,
          "healthdcatap:numberOfRecords": ds.hdcatapNumberOfRecords,
          "healthdcatap:numberOfUniqueIndividuals":
            ds.hdcatapNumberOfUniqueIndividuals,
          "healthdcatap:minTypicalAge": ds.hdcatapMinTypicalAge,
          "healthdcatap:maxTypicalAge": ds.hdcatapMaxTypicalAge,
          "healthdcatap:legalBasisForAccess": ds.hdcatapLegalBasisForAccess,
          "healthdcatap:purpose": ds.hdcatapPurpose,
          ...(pub
            ? {
                "dct:publisher": {
                  "@type": "foaf:Organization",
                  "foaf:name": pub.name,
                },
              }
            : {}),
          ...(cp
            ? {
                "dcat:contactPoint": {
                  "@type": "vcard:Organization",
                  "vcard:fn": cp.name,
                  "vcard:hasEmail": cp.email,
                },
              }
            : {}),
          "dcat:distribution": dists.map((d: any) => ({
            "@type": "dcat:Distribution",
            "dcat:accessURL": d.accessURL,
            "dcat:downloadURL": d.downloadURL,
            "dcat:mediaType": d.mediaType,
            "dct:format": d.format,
            "dct:title": d.title,
          })),
        };
      });

      const catalog = {
        "@context": {
          dcat: "http://www.w3.org/ns/dcat#",
          dct: "http://purl.org/dc/terms/",
          foaf: "http://xmlns.com/foaf/0.1/",
          vcard: "http://www.w3.org/2006/vcard/ns#",
          healthdcatap: "http://healthdcat-ap.eu/ns#",
        },
        "@type": "dcat:Catalog",
        "dct:title": "Health Dataspace v2 — HealthDCAT-AP Catalog",
        "dct:description":
          "EHDS-compliant health dataset catalog served via Neo4j Query Proxy",
        "dcat:dataset": datasets,
      };

      res.setHeader("Content-Type", "application/ld+json");
      res.json(catalog);
      logTransferEvent(
        "/catalog/datasets",
        "GET",
        req.headers["x-participant"] as string,
        200,
        datasets.length,
      );
    } catch (err) {
      next(err);
    } finally {
      await session.close();
    }
  },
);

/**
 * GET /catalog/datasets/:id
 * Returns a single HealthDCAT-AP dataset entry as JSON-LD.
 */
app.get(
  "/catalog/datasets/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    const session = getSession();
    try {
      const datasetId = req.params.id;

      const result = await session.run(
        `
      MATCH (ds:HealthDataset)
      WHERE ds.dctIdentifier = $datasetId OR ds.datasetId = $datasetId
      OPTIONAL MATCH (ds)-[:HAS_DISTRIBUTION]->(dist:Distribution)
      OPTIONAL MATCH (ds)-[:PUBLISHED_BY]->(pub:Organization)
      OPTIONAL MATCH (ds)-[:HAS_CONTACT_POINT]->(cp:ContactPoint)
      RETURN ds, collect(DISTINCT dist) AS distributions, pub, cp
      `,
        { datasetId },
      );

      if (result.records.length === 0) {
        res.status(404).json({ error: `Dataset ${datasetId} not found` });
        return;
      }

      const r = result.records[0];
      const ds = r.get("ds").properties;
      const dists = r.get("distributions").map((d: any) => d.properties);
      const pub = r.get("pub")?.properties;
      const cp = r.get("cp")?.properties;

      const dataset = {
        "@context": {
          dcat: "http://www.w3.org/ns/dcat#",
          dct: "http://purl.org/dc/terms/",
          foaf: "http://xmlns.com/foaf/0.1/",
          vcard: "http://www.w3.org/2006/vcard/ns#",
          healthdcatap: "http://healthdcat-ap.eu/ns#",
        },
        "@type": "dcat:Dataset",
        "dct:identifier": ds.dctIdentifier ?? ds.datasetId,
        "dct:title": ds.title,
        "dct:description": ds.description,
        "dct:issued": ds.issued,
        "dct:modified": ds.modified,
        "dct:language": ds.language,
        "dct:spatial": ds.dctSpatial,
        "dct:temporal":
          ds.dctTemporalStart && ds.dctTemporalEnd
            ? { startDate: ds.dctTemporalStart, endDate: ds.dctTemporalEnd }
            : undefined,
        "dcat:theme": ds.themes,
        "healthdcatap:healthCategory": ds.hdcatapHealthCategory,
        "healthdcatap:healthTheme": ds.hdcatapHealthTheme,
        "healthdcatap:datasetType": ds.hdcatapDatasetType,
        "healthdcatap:personalData": ds.hdcatapPersonalData,
        "healthdcatap:sensitiveData": ds.hdcatapSensitiveData,
        "healthdcatap:numberOfRecords": ds.hdcatapNumberOfRecords,
        "healthdcatap:numberOfUniqueIndividuals":
          ds.hdcatapNumberOfUniqueIndividuals,
        "healthdcatap:minTypicalAge": ds.hdcatapMinTypicalAge,
        "healthdcatap:maxTypicalAge": ds.hdcatapMaxTypicalAge,
        "healthdcatap:legalBasisForAccess": ds.hdcatapLegalBasisForAccess,
        "healthdcatap:purpose": ds.hdcatapPurpose,
        ...(pub
          ? {
              "dct:publisher": {
                "@type": "foaf:Organization",
                "foaf:name": pub.name,
              },
            }
          : {}),
        ...(cp
          ? {
              "dcat:contactPoint": {
                "@type": "vcard:Organization",
                "vcard:fn": cp.name,
                "vcard:hasEmail": cp.email,
              },
            }
          : {}),
        "dcat:distribution": dists.map((d: any) => ({
          "@type": "dcat:Distribution",
          "dcat:accessURL": d.accessURL,
          "dcat:downloadURL": d.downloadURL,
          "dcat:mediaType": d.mediaType,
          "dct:format": d.format,
          "dct:title": d.title,
        })),
      };

      res.setHeader("Content-Type", "application/ld+json");
      res.json(dataset);
      logTransferEvent(
        `/catalog/datasets/${datasetId}`,
        "GET",
        req.headers["x-participant"] as string,
        200,
        1,
      );
    } catch (err) {
      next(err);
    } finally {
      await session.close();
    }
  },
);

// ---- Phase 5: Federated Query Endpoints ------------------------------------

/**
 * POST /federated/query
 * Dispatches a read-only Cypher query to all connected SPEs in parallel,
 * merges results, and optionally applies k-anonymity filtering.
 *
 * Body: { cypher: string, params?: object, minK?: number }
 * - cypher: Read-only Cypher (must start with MATCH/RETURN/CALL/WITH/UNWIND)
 * - params: Optional query parameters
 * - minK:  Minimum group size for k-anonymity (default: 0 = no filtering)
 *
 * Returns: { results: Record[], sources: string[], totalRows: number, filtered: number }
 */
app.post(
  "/federated/query",
  heavyLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Callers may request stricter k-anonymity but never below the server minimum
      const requestedMinK = req.body.minK ?? MIN_COHORT_SIZE;
      const { cypher, params = {} } = req.body;
      const minK = Math.max(requestedMinK, MIN_COHORT_SIZE);

      if (!cypher || typeof cypher !== "string") {
        res.status(400).json({ error: "Missing 'cypher' in request body" });
        return;
      }

      // Safety: reject write operations
      const trimmed = cypher.trim().toUpperCase();
      if (
        trimmed.startsWith("CREATE") ||
        trimmed.startsWith("MERGE") ||
        trimmed.startsWith("DELETE") ||
        trimmed.startsWith("SET") ||
        trimmed.startsWith("REMOVE") ||
        trimmed.startsWith("DROP")
      ) {
        res.status(403).json({
          error: "Write operations not permitted on federated endpoint",
        });
        return;
      }

      const spes = getSpeDrivers();
      const allResults: Array<{ source: string; records: any[] }> = [];

      // Dispatch to all SPEs in parallel
      await Promise.all(
        spes.map(async ({ label, driver: d }) => {
          const session = d.session({ database: "neo4j" });
          try {
            const result = await session.run(cypher, params);
            const records = result.records.map((r) => {
              const obj: Record<string, any> = { _source: label };
              r.keys.forEach((key) => {
                const val = r.get(key);
                obj[String(key)] = neo4j.isInt(val) ? val.toNumber() : val;
              });
              return obj;
            });
            allResults.push({ source: label, records });
          } catch (err: any) {
            allResults.push({
              source: label,
              records: [{ _source: label, _error: err.message }],
            });
          } finally {
            await session.close();
          }
        }),
      );

      // Merge results from all SPEs
      let merged = allResults.flatMap((r) => r.records);
      const totalRows = merged.length;
      let filtered = 0;

      // Apply k-anonymity filtering if requested
      if (minK > 0) {
        // Group by all non-_source, non-_error keys and filter groups with < minK members
        const keySet = new Set<string>();
        merged.forEach((row) =>
          Object.keys(row).forEach((k) => {
            if (k !== "_source" && k !== "_error") keySet.add(k);
          }),
        );
        const groupKey = (row: Record<string, any>) =>
          Array.from(keySet)
            .map((k) => `${k}=${row[k]}`)
            .join("|");

        const groups = new Map<string, Record<string, any>[]>();
        merged.forEach((row) => {
          const key = groupKey(row);
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key)!.push(row);
        });

        merged = [];
        for (const [, group] of groups) {
          if (group.length >= minK) {
            merged.push(...group);
          } else {
            filtered += group.length;
          }
        }
      }

      const sources = allResults.map((r) => r.source);
      res.json({
        results: merged,
        sources,
        totalRows,
        filtered,
        speCount: spes.length,
        minKApplied: minK,
      });

      logTransferEvent(
        "/federated/query",
        "POST",
        req.headers["x-participant"] as string,
        200,
        merged.length,
      );
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /federated/stats
 * Returns aggregate statistics across all connected SPEs — patient counts,
 * condition distribution, gender breakdown — suitable for a federated
 * analytics dashboard without exposing individual patient data.
 */
app.get(
  "/federated/stats",
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const spes = getSpeDrivers();
      const stats: Array<{
        source: string;
        patients: number;
        encounters: number;
        conditions: number;
        observations: number;
        topConditions: Array<{ name: string; count: number }>;
        genderBreakdown: Array<{ gender: string; count: number }>;
      }> = [];

      await Promise.all(
        spes.map(async ({ label, driver: d }) => {
          const session = d.session({ database: "neo4j" });
          try {
            // Get counts
            const counts = await session.run(`
              MATCH (p:Patient) WITH count(p) AS patients
              MATCH (e:Encounter) WITH patients, count(e) AS encounters
              MATCH (c:Condition) WITH patients, encounters, count(c) AS conditions
              MATCH (o:Observation) WITH patients, encounters, conditions, count(o) AS observations
              RETURN patients, encounters, conditions, observations
            `);

            const row = counts.records[0];
            const patients = row
              ? neo4j.integer.toNumber(row.get("patients"))
              : 0;
            const encounters = row
              ? neo4j.integer.toNumber(row.get("encounters"))
              : 0;
            const conditions = row
              ? neo4j.integer.toNumber(row.get("conditions"))
              : 0;
            const observations = row
              ? neo4j.integer.toNumber(row.get("observations"))
              : 0;

            // Top conditions
            const topCond = await session.run(`
              MATCH (c:Condition)
              RETURN c.name AS name, count(*) AS cnt
              ORDER BY cnt DESC LIMIT 10
            `);
            const topConditions = topCond.records.map((r) => ({
              name: r.get("name"),
              count: neo4j.integer.toNumber(r.get("cnt")),
            }));

            // Gender breakdown
            const genders = await session.run(`
              MATCH (p:Patient)
              RETURN p.gender AS gender, count(*) AS cnt
            `);
            const genderBreakdown = genders.records.map((r) => ({
              gender: r.get("gender"),
              count: neo4j.integer.toNumber(r.get("cnt")),
            }));

            stats.push({
              source: label,
              patients,
              encounters,
              conditions,
              observations,
              topConditions,
              genderBreakdown,
            });
          } finally {
            await session.close();
          }
        }),
      );

      // Compute aggregated totals
      const totals = {
        patients: stats.reduce((sum, s) => sum + s.patients, 0),
        encounters: stats.reduce((sum, s) => sum + s.encounters, 0),
        conditions: stats.reduce((sum, s) => sum + s.conditions, 0),
        observations: stats.reduce((sum, s) => sum + s.observations, 0),
      };

      // Merge top conditions across SPEs
      const condMap = new Map<string, number>();
      stats.forEach((s) =>
        s.topConditions.forEach(({ name, count }) =>
          condMap.set(name, (condMap.get(name) ?? 0) + count),
        ),
      );
      const aggregatedConditions = Array.from(condMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name, count]) => ({ name, count }));

      // Merge gender breakdown
      const genderMap = new Map<string, number>();
      stats.forEach((s) =>
        s.genderBreakdown.forEach(({ gender, count }) =>
          genderMap.set(gender, (genderMap.get(gender) ?? 0) + count),
        ),
      );
      const aggregatedGenders = Array.from(genderMap.entries()).map(
        ([gender, count]) => ({ gender, count }),
      );

      res.json({
        speCount: spes.length,
        totals,
        aggregatedConditions,
        aggregatedGenders,
        perSpe: stats,
      });

      logTransferEvent(
        "/federated/stats",
        "GET",
        _req.headers["x-participant"] as string,
        200,
        stats.length,
      );
    } catch (err) {
      next(err);
    }
  },
);

// ---- Phase 5c: Natural Language Query (Text2Cypher) -------------------------

/**
 * Template-based query patterns for common health data questions.
 * Each pattern has a regex matcher, a Cypher template, and a parameter extractor.
 */
interface QueryTemplate {
  name: string;
  patterns: RegExp[];
  cypher: string;
  extractParams: (
    match: RegExpMatchArray,
    question: string,
  ) => Record<string, any>;
  description: string;
}

const QUERY_TEMPLATES: QueryTemplate[] = [
  {
    name: "patient_count",
    patterns: [
      /how many patients/i,
      /(?:total|number of) patients/i,
      /patient count/i,
    ],
    cypher: "MATCH (p:Patient) RETURN count(p) AS patientCount",
    extractParams: () => ({}),
    description: "Count total patients in the knowledge graph",
  },
  {
    name: "patient_by_gender",
    patterns: [
      /patients by gender/i,
      /gender (?:breakdown|distribution|split)/i,
      /(?:male|female) patients/i,
    ],
    cypher: `MATCH (p:Patient)
             RETURN p.gender AS gender, count(p) AS count
             ORDER BY count DESC`,
    extractParams: () => ({}),
    description: "Patient count grouped by gender",
  },
  {
    name: "top_conditions",
    patterns: [
      /(?:top|most common|frequent) (?:\d+ )?conditions/i,
      /what (?:are the |)(?:most common |top |)conditions/i,
      /common diseases/i,
    ],
    cypher: `MATCH (c:Condition)
             RETURN c.name AS condition, count(*) AS count
             ORDER BY count DESC
             LIMIT $limit`,
    extractParams: (_match, question) => {
      const numMatch = question.match(/(\d+)/);
      return { limit: neo4j.int(numMatch ? parseInt(numMatch[1]) : 10) };
    },
    description: "Most common conditions/diagnoses",
  },
  {
    name: "top_medications",
    patterns: [
      /(?:top|most (?:common|prescribed)) (?:\d+ )?(?:medications|drugs|prescriptions)/i,
      /what (?:are |)(?:the )?(?:most )?(?:common |prescribed |)(?:medications|drugs)/i,
    ],
    cypher: `MATCH (m:MedicationRequest)
             RETURN m.name AS medication, count(*) AS count
             ORDER BY count DESC
             LIMIT $limit`,
    extractParams: (_match, question) => {
      const numMatch = question.match(/(\d+)/);
      return { limit: neo4j.int(numMatch ? parseInt(numMatch[1]) : 10) };
    },
    description: "Most commonly prescribed medications",
  },
  {
    name: "patient_journey",
    patterns: [
      /(?:patient|person) (?:journey|timeline|history) (?:for |of )?(.+)/i,
      /show (?:me )?(?:the )?(?:journey|timeline|history) (?:for |of )?(.+)/i,
      /what happened to (.+)/i,
    ],
    cypher: `MATCH (p:Patient)
             WHERE toLower(p.name) CONTAINS toLower($name) OR p.id = $name
             OPTIONAL MATCH (p)-[:HAS_ENCOUNTER]->(e:Encounter)
             OPTIONAL MATCH (p)-[:HAS_CONDITION]->(c:Condition)
             RETURN p.name AS patient, p.gender AS gender, p.birthDate AS birthDate,
                    collect(DISTINCT {type: 'Encounter', name: e.name, date: e.date}) AS encounters,
                    collect(DISTINCT {type: 'Condition', name: c.name, onset: c.onsetDate}) AS conditions
             LIMIT 1`,
    extractParams: (match) => ({ name: (match[1] || "").trim() }),
    description: "Patient journey with encounters and conditions",
  },
  {
    name: "condition_prevalence",
    patterns: [
      /(?:prevalence|rate) of (.+)/i,
      /how (?:common|prevalent) is (.+)/i,
      /patients with (.+)/i,
    ],
    cypher: `MATCH (p:Patient)
             WITH count(p) AS total
             MATCH (c:Condition)
             WHERE toLower(c.name) CONTAINS toLower($condition)
             WITH total, c.name AS condition, count(DISTINCT c) AS occurrences
             RETURN condition, occurrences, total,
                    round(toFloat(occurrences) / total * 100, 2) AS prevalencePercent
             ORDER BY occurrences DESC
             LIMIT 5`,
    extractParams: (match) => ({ condition: (match[1] || "").trim() }),
    description: "Prevalence of a specific condition",
  },
  {
    name: "encounters_by_type",
    patterns: [
      /encounters by (?:type|class)/i,
      /(?:type|class)(?:es)? of encounters/i,
      /encounter (?:types|classes)/i,
    ],
    cypher: `MATCH (e:Encounter)
             RETURN e.class AS encounterClass, count(*) AS count
             ORDER BY count DESC`,
    extractParams: () => ({}),
    description: "Encounters grouped by type/class",
  },
  {
    name: "omop_cohort_stats",
    patterns: [
      /omop (?:cohort |)(?:stats|statistics|overview)/i,
      /research (?:cohort |)(?:overview|stats)/i,
      /secondary use (?:data |)(?:stats|overview)/i,
    ],
    cypher: `MATCH (op:OMOPPerson) WITH count(op) AS persons
             MATCH (ov:OMOPVisitOccurrence) WITH persons, count(ov) AS visits
             MATCH (oc:OMOPConditionOccurrence) WITH persons, visits, count(oc) AS conditions
             MATCH (om:OMOPMeasurement) WITH persons, visits, conditions, count(om) AS measurements
             MATCH (od:OMOPDrugExposure) WITH persons, visits, conditions, measurements, count(od) AS drugs
             RETURN persons, visits, conditions, measurements, drugs`,
    extractParams: () => ({}),
    description: "OMOP CDM aggregate statistics",
  },
  {
    name: "age_distribution",
    patterns: [
      /age (?:distribution|breakdown|range)/i,
      /(?:patients|people) by age/i,
      /how old are (?:the |)patients/i,
    ],
    cypher: `MATCH (p:Patient)
             WHERE p.birthDate IS NOT NULL AND p.deceased IS NULL
             WITH p, duration.between(date(p.birthDate), date()).years AS age
             WITH CASE
               WHEN age < 18 THEN '0-17'
               WHEN age < 30 THEN '18-29'
               WHEN age < 45 THEN '30-44'
               WHEN age < 60 THEN '45-59'
               WHEN age < 75 THEN '60-74'
               ELSE '75+'
             END AS ageGroup, count(*) AS count
             RETURN ageGroup, count ORDER BY ageGroup`,
    extractParams: () => ({}),
    description: "Patient age distribution in ranges",
  },
];

/** Graph schema description for LLM context */
const GRAPH_SCHEMA_CONTEXT = `
Neo4j Health Knowledge Graph Schema (5 layers):

Layer 1 - DSP Marketplace:
  (:DataProduct {productId, title, provider})
  (:Contract {contractId, state, negotiatedDate})
  (:HDABApproval {approvalId, purpose, legalBasis})

Layer 2 - HealthDCAT-AP Catalog:
  (:HealthDataset {datasetId, title, description, publisher, recordCount, temporalCoverage})
  (:Distribution {distributionId, accessURL, mediaType})
  (:Catalog {catalogId, title})

Layer 3 - FHIR R4 Clinical:
  (:Patient {id, name, birthDate, gender, deceased, city, state})
  (:Encounter {id, name, date, class, type, status})
  (:Condition {id, name, code, onsetDate, clinicalStatus})
  (:Observation {id, name, value, unit, date, code})
  (:MedicationRequest {id, name, code, authoredOn, status})
  (:Procedure {id, name, code, performedStart, status})

Layer 4 - OMOP CDM Research:
  (:OMOPPerson {personId, yearOfBirth, genderConceptId})
  (:OMOPVisitOccurrence {visitId, visitStartDate})
  (:OMOPConditionOccurrence {conditionId, conditionConceptId})
  (:OMOPMeasurement {measurementId, measurementConceptId})
  (:OMOPDrugExposure {drugExposureId, drugConceptId})
  (:OMOPProcedureOccurrence {procedureOccurrenceId})

Layer 5 - Ontology:
  (:SnomedConcept {code, display})
  (:LoincConcept {code, display})

Key relationships:
  (:Patient)-[:HAS_ENCOUNTER]->(:Encounter)
  (:Patient)-[:HAS_CONDITION]->(:Condition)
  (:Patient)-[:HAS_OBSERVATION]->(:Observation)
  (:Patient)-[:HAS_MEDICATION]->(:MedicationRequest)
  (:Patient)-[:HAS_PROCEDURE]->(:Procedure)
  (:Patient)-[:FROM_DATASET]->(:HealthDataset)
  (:Condition)-[:CODED_BY]->(:SnomedConcept)
  (:OMOPPerson)-[:MAPPED_FROM]->(:Patient)
  (:OMOPConditionOccurrence)-[:CODED_BY]->(:SnomedConcept)
`;

/**
 * Match a natural language question against template patterns.
 * Returns the first matching template with extracted parameters.
 */
function matchTemplate(
  question: string,
): { template: QueryTemplate; params: Record<string, any> } | null {
  for (const template of QUERY_TEMPLATES) {
    for (const pattern of template.patterns) {
      const match = question.match(pattern);
      if (match) {
        return {
          template,
          params: template.extractParams(match, question),
        };
      }
    }
  }
  return null;
}

/**
 * Call an LLM (OpenAI API or Ollama) to generate Cypher from natural language.
 * Only used when no template matches and an LLM endpoint is configured.
 */
async function llmText2Cypher(question: string): Promise<string | null> {
  const systemPrompt = `You are a Cypher query generator for a Neo4j health knowledge graph.
Given a natural language question, generate a READ-ONLY Cypher query.
NEVER generate CREATE, MERGE, DELETE, SET, REMOVE, or DROP statements.
Return ONLY the Cypher query, no explanation or markdown.

${GRAPH_SCHEMA_CONTEXT}`;

  if (OPENAI_API_KEY) {
    try {
      const resp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: question },
          ],
          temperature: 0,
          max_tokens: 500,
        }),
      });
      const data = (await resp.json()) as any;
      const cypher = data.choices?.[0]?.message?.content?.trim();
      if (cypher)
        return cypher
          .replace(/```cypher\n?/g, "")
          .replace(/```/g, "")
          .trim();
    } catch (err) {
      console.error("[neo4j-proxy] OpenAI Text2Cypher failed:", err);
    }
  }

  if (OLLAMA_URL) {
    try {
      const resp = await fetch(`${OLLAMA_URL}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          prompt: `${systemPrompt}\n\nQuestion: ${question}\nCypher:`,
          stream: false,
        }),
      });
      const data = (await resp.json()) as any;
      const cypher = data.response?.trim();
      if (cypher)
        return cypher
          .replace(/```cypher\n?/g, "")
          .replace(/```/g, "")
          .trim();
    } catch (err) {
      console.error("[neo4j-proxy] Ollama Text2Cypher failed:", err);
    }
  }

  return null;
}

// ===========================================================================
// Phase 18: Trust Center — Federated Pseudonym Resolution (EHDS Art. 50/51)
// ===========================================================================

/**
 * GET /trust-center
 * List all registered Trust Centers with their governance relationships.
 */
app.get(
  "/trust-center",
  async (_req: Request, res: Response, next: NextFunction) => {
    const session = getSession();
    try {
      const result = await session.run(`
        MATCH (tc:TrustCenter)
        OPTIONAL MATCH (tc)-[:GOVERNED_BY]->(hdab:Participant)
        OPTIONAL MATCH (tc)-[:RESOLVES_PSEUDONYMS_FOR]->(ds:HealthDataset)
        WITH tc, hdab,
             count(DISTINCT ds) AS datasetCount,
             collect(DISTINCT ds.datasetId)[..5] AS sampleDatasets
        RETURN tc.name AS name,
               tc.operatedBy AS operatedBy,
               tc.country AS country,
               tc.status AS status,
               tc.protocol AS protocol,
               tc.createdAt AS createdAt,
               hdab.name AS hdabName,
               hdab.participantId AS hdabDid,
               datasetCount,
               sampleDatasets
        ORDER BY tc.country
      `);

      const trustCenters = result.records.map((r) => ({
        name: r.get("name"),
        operatedBy: r.get("operatedBy"),
        country: r.get("country"),
        status: r.get("status"),
        protocol: r.get("protocol"),
        createdAt: r.get("createdAt"),
        hdab: { name: r.get("hdabName"), did: r.get("hdabDid") },
        datasetCount: neo4j.integer.toNumber(r.get("datasetCount")),
        sampleDatasets: r.get("sampleDatasets"),
      }));

      res.json({ trustCenters });
    } catch (err) {
      next(err);
    } finally {
      await session.close();
    }
  },
);

/**
 * POST /trust-center/resolve
 * Map provider-specific pseudonyms to a shared research pseudonym.
 *
 * Body: {
 *   trustCenter: string,          // Trust Center name
 *   providerPseudonyms: string[], // Provider-specific PSNs to link
 *   mode?: "stateless" | "key-managed"  // Resolution mode (default: stateless)
 * }
 *
 * Security: In production, only HDAB-authority-scoped tokens may call this.
 * Data users NEVER interact with the Trust Center directly.
 */
app.post(
  "/trust-center/resolve",
  heavyLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    const session = getSession();
    try {
      const {
        trustCenter,
        providerPseudonyms,
        mode = "stateless",
      } = req.body;

      if (
        !trustCenter ||
        !Array.isArray(providerPseudonyms) ||
        providerPseudonyms.length < 2
      ) {
        res.status(400).json({
          error:
            "Provide 'trustCenter' (string) and 'providerPseudonyms' (array of ≥2 PSNs)",
        });
        return;
      }

      // Verify trust center exists and is active
      const tcCheck = await session.run(
        `MATCH (tc:TrustCenter {name: $name, status: 'active'}) RETURN tc`,
        { name: trustCenter },
      );
      if (tcCheck.records.length === 0) {
        res.status(404).json({ error: `Trust Center '${trustCenter}' not found or inactive` });
        return;
      }

      let rpsn: string;

      if (mode === "stateless") {
        // Deterministic HMAC-based derivation: HMAC(key, sorted PSNs joined)
        const sorted = [...providerPseudonyms].sort();
        const hmac = crypto.createHmac("sha256", TRUST_CENTER_HMAC_KEY);
        hmac.update(sorted.join("|"));
        const hash = hmac.digest("hex").substring(0, 12);
        rpsn = `RPSN-${hash.toUpperCase()}`;
      } else {
        // Key-managed: generate a random research pseudonym
        rpsn = `RPSN-${crypto.randomBytes(6).toString("hex").toUpperCase()}`;
      }

      // Persist the mapping in Neo4j
      await session.run(
        `
        MERGE (rp:ResearchPseudonym {rpsn: $rpsn})
        ON CREATE SET rp.status = 'active',
                      rp.mode = $mode,
                      rp.createdAt = datetime()
        WITH rp
        MATCH (tc:TrustCenter {name: $trustCenter})
        MERGE (rp)-[:RESOLVED_BY]->(tc)
        WITH rp
        UNWIND $psns AS psn
        MERGE (pp:ProviderPseudonym {psn: psn})
        ON CREATE SET pp.status = 'active'
        MERGE (rp)-[:LINKED_FROM]->(pp)
        `,
        { rpsn, mode, trustCenter, psns: providerPseudonyms },
      );

      // Audit log
      logTransferEvent(
        "/trust-center/resolve",
        "POST",
        req.headers["x-participant"] as string,
        200,
        providerPseudonyms.length,
      );

      res.json({
        researchPseudonym: rpsn,
        mode,
        trustCenter,
        linkedPseudonyms: providerPseudonyms.length,
      });
    } catch (err) {
      next(err);
    } finally {
      await session.close();
    }
  },
);

/**
 * GET /trust-center/audit
 * Resolution audit log — returns recent pseudonym resolution events.
 * Query params: ?limit=50&trustCenter=...
 */
app.get(
  "/trust-center/audit",
  async (req: Request, res: Response, next: NextFunction) => {
    const session = getSession();
    try {
      const limit = Math.min(
        parseInt((req.query.limit as string) ?? "50", 10),
        200,
      );
      const tcFilter = req.query.trustCenter as string | undefined;

      const cypher = `
        MATCH (rp:ResearchPseudonym)-[:RESOLVED_BY]->(tc:TrustCenter)
        ${tcFilter ? "WHERE tc.name = $tcFilter" : ""}
        OPTIONAL MATCH (rp)-[:LINKED_FROM]->(pp:ProviderPseudonym)
        WITH rp, tc, collect(pp.psn) AS providerPsns
        RETURN rp.rpsn AS rpsn,
               rp.status AS status,
               rp.mode AS mode,
               rp.createdAt AS createdAt,
               tc.name AS trustCenter,
               providerPsns
        ORDER BY rp.createdAt DESC
        LIMIT $limit
      `;

      const result = await session.run(cypher, {
        limit: neo4j.int(limit),
        ...(tcFilter ? { tcFilter } : {}),
      });

      const entries = result.records.map((r) => ({
        rpsn: r.get("rpsn"),
        status: r.get("status"),
        mode: r.get("mode"),
        createdAt: r.get("createdAt"),
        trustCenter: r.get("trustCenter"),
        providerPseudonyms: r.get("providerPsns"),
      }));

      res.json({ total: entries.length, entries });
    } catch (err) {
      next(err);
    } finally {
      await session.close();
    }
  },
);

/**
 * DELETE /trust-center/revoke/:rpsn
 * Revoke a research pseudonym — renders previous linkages unlinkable.
 * Only HDAB-authority-scoped tokens should be able to invoke this.
 */
app.delete(
  "/trust-center/revoke/:rpsn",
  async (req: Request, res: Response, next: NextFunction) => {
    const session = getSession();
    try {
      const { rpsn } = req.params;

      const result = await session.run(
        `
        MATCH (rp:ResearchPseudonym {rpsn: $rpsn})
        SET rp.status = 'revoked',
            rp.revokedAt = datetime()
        WITH rp
        OPTIONAL MATCH (rp)-[r:LINKED_FROM]->(pp:ProviderPseudonym)
        DELETE r
        RETURN rp.rpsn AS rpsn, rp.status AS status
        `,
        { rpsn },
      );

      if (result.records.length === 0) {
        res
          .status(404)
          .json({ error: `Research pseudonym '${rpsn}' not found` });
        return;
      }

      logTransferEvent(
        `/trust-center/revoke/${rpsn}`,
        "DELETE",
        req.headers["x-participant"] as string,
        200,
        1,
      );

      res.json({
        rpsn,
        status: "revoked",
        message: "Research pseudonym revoked — linkages removed",
      });
    } catch (err) {
      next(err);
    } finally {
      await session.close();
    }
  },
);

/**
 * GET /trust-center/spe-sessions
 * List SPE sessions with attestation details.
 */
app.get(
  "/trust-center/spe-sessions",
  async (_req: Request, res: Response, next: NextFunction) => {
    const session = getSession();
    try {
      const result = await session.run(`
        MATCH (ss:SPESession)
        OPTIONAL MATCH (ss)<-[:CREATED_BY]-(hdab:Participant)
        OPTIONAL MATCH (rp:ResearchPseudonym)-[:USED_IN]->(ss)
        WITH ss, hdab, count(rp) AS pseudonymCount
        RETURN ss.sessionId AS sessionId,
               ss.status AS status,
               ss.approvedCodeHash AS approvedCodeHash,
               ss.attestationType AS attestationType,
               ss.kAnonymityThreshold AS kAnonymityThreshold,
               ss.createdAt AS createdAt,
               hdab.name AS createdBy,
               pseudonymCount
        ORDER BY ss.createdAt DESC
      `);

      const sessions = result.records.map((r) => ({
        sessionId: r.get("sessionId"),
        status: r.get("status"),
        approvedCodeHash: r.get("approvedCodeHash"),
        attestationType: r.get("attestationType"),
        kAnonymityThreshold: r.get("kAnonymityThreshold")
          ? neo4j.integer.toNumber(r.get("kAnonymityThreshold"))
          : null,
        createdAt: r.get("createdAt"),
        createdBy: r.get("createdBy"),
        pseudonymCount: neo4j.integer.toNumber(r.get("pseudonymCount")),
      }));

      res.json({ sessions });
    } catch (err) {
      next(err);
    } finally {
      await session.close();
    }
  },
);

// ===========================================================================
// Phase 5c: Natural Language Query (Text2Cypher)
// ===========================================================================

/**
 * POST /nlq
 * Natural Language Query — translates a question to Cypher and executes it.
 *
 * Body: { question: string, federated?: boolean }
 * - question: Natural language question about the health data
 * - federated: If true, dispatch to all SPEs (default: false, primary only)
 *
 * Returns: {
 *   question, cypher, method ("template"|"llm"|"none"),
 *   templateName?, results, totalRows
 * }
 */
app.post("/nlq", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { question, federated = false } = req.body;

    if (!question || typeof question !== "string") {
      res.status(400).json({ error: "Missing 'question' in request body" });
      return;
    }

    let cypher: string | null = null;
    let method: "template" | "llm" | "none" = "none";
    let templateName: string | undefined;
    let params: Record<string, any> = {};

    // Step 1: Try template matching
    const templateMatch = matchTemplate(question);
    if (templateMatch) {
      cypher = templateMatch.template.cypher;
      params = templateMatch.params;
      method = "template";
      templateName = templateMatch.template.name;
    }

    // Step 2: Try LLM if no template matched
    if (!cypher) {
      cypher = await llmText2Cypher(question);
      if (cypher) method = "llm";
    }

    // Step 3: If still no match, return available templates
    if (!cypher) {
      res.json({
        question,
        method: "none",
        message:
          "No matching query template found. Configure OPENAI_API_KEY or OLLAMA_URL for LLM-based Text2Cypher.",
        availableTemplates: QUERY_TEMPLATES.map((t) => ({
          name: t.name,
          description: t.description,
          examplePatterns: t.patterns.map((p) => p.source),
        })),
      });
      return;
    }

    // Safety check for LLM-generated Cypher
    if (method === "llm") {
      const trimmed = cypher.trim().toUpperCase();
      if (
        trimmed.startsWith("CREATE") ||
        trimmed.startsWith("MERGE") ||
        trimmed.startsWith("DELETE") ||
        trimmed.startsWith("SET") ||
        trimmed.startsWith("REMOVE") ||
        trimmed.startsWith("DROP")
      ) {
        res.status(403).json({
          error: "LLM generated a write query — blocked for safety",
          cypher,
        });
        return;
      }
    }

    // Execute query
    let results: any[];

    if (federated && spe2Driver) {
      // Federated execution across all SPEs
      const spes = getSpeDrivers();
      const allResults: any[] = [];

      await Promise.all(
        spes.map(async ({ label, driver: d }) => {
          const session = d.session({ database: "neo4j" });
          try {
            const result = await session.run(cypher!, params);
            result.records.forEach((r) => {
              const obj: Record<string, any> = { _source: label };
              r.keys.forEach((key) => {
                const val = r.get(key);
                obj[String(key)] = neo4j.isInt(val) ? val.toNumber() : val;
              });
              allResults.push(obj);
            });
          } finally {
            await session.close();
          }
        }),
      );
      results = allResults;
    } else {
      // Single SPE execution
      const session = getSession();
      try {
        const result = await session.run(cypher, params);
        results = result.records.map((r) => {
          const obj: Record<string, any> = {};
          r.keys.forEach((key) => {
            const val = r.get(key);
            obj[String(key)] = neo4j.isInt(val) ? val.toNumber() : val;
          });
          return obj;
        });
      } finally {
        await session.close();
      }
    }

    res.json({
      question,
      cypher,
      method,
      templateName,
      federated: federated && spe2Driver != null,
      results,
      totalRows: results.length,
    });

    logTransferEvent(
      "/nlq",
      "POST",
      req.headers["x-participant"] as string,
      200,
      results.length,
    );
  } catch (err) {
    next(err);
  }
});

/**
 * GET /nlq/templates
 * Returns the list of available NLQ query templates.
 */
app.get("/nlq/templates", (_req: Request, res: Response) => {
  res.json({
    templates: QUERY_TEMPLATES.map((t) => ({
      name: t.name,
      description: t.description,
      examplePatterns: t.patterns.map((p) => p.source),
    })),
    llmAvailable: !!(OPENAI_API_KEY || OLLAMA_URL),
  });
});

// ---- Persistent Task Management (Phase 13) ---------------------------------

const TASK_DB_URL =
  process.env.TASK_DB_URL ??
  "postgresql://taskuser:taskuser@postgres:5432/taskdb";

let taskPool: pg.Pool | null = null;

function getTaskPool(): pg.Pool {
  if (!taskPool) {
    taskPool = new pg.Pool({ connectionString: TASK_DB_URL, max: 5 });
  }
  return taskPool;
}

/** Ensure the tasks table exists (idempotent). */
async function ensureTaskTable(): Promise<void> {
  const pool = getTaskPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id              TEXT PRIMARY KEY,
      type            TEXT NOT NULL CHECK (type IN ('negotiation', 'transfer')),
      participant     TEXT NOT NULL,
      participant_id  TEXT NOT NULL,
      asset           TEXT NOT NULL DEFAULT '',
      asset_id        TEXT NOT NULL DEFAULT '',
      state           TEXT NOT NULL DEFAULT 'REQUESTED',
      counter_party   TEXT NOT NULL DEFAULT '',
      timestamp_ms    BIGINT NOT NULL DEFAULT 0,
      contract_id     TEXT,
      transfer_type   TEXT,
      edr_available   BOOLEAN DEFAULT FALSE,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_tasks_participant_id ON tasks(participant_id)`,
  );
}

interface TaskRow {
  id: string;
  type: "negotiation" | "transfer";
  participant: string;
  participant_id: string;
  asset: string;
  asset_id: string;
  state: string;
  counter_party: string;
  timestamp_ms: string;
  contract_id: string | null;
  transfer_type: string | null;
  edr_available: boolean;
}

/**
 * POST /tasks/sync — Upsert tasks from EDC-V into PostgreSQL.
 * Body: { tasks: Task[] }
 */
app.post("/tasks/sync", async (req: Request, res: Response) => {
  try {
    await ensureTaskTable();
    const pool = getTaskPool();
    const tasks: TaskRow[] = req.body?.tasks ?? [];

    let upserted = 0;
    for (const t of tasks) {
      await pool.query(
        `INSERT INTO tasks (id, type, participant, participant_id, asset, asset_id, state, counter_party, timestamp_ms, contract_id, transfer_type, edr_available)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (id) DO UPDATE SET
           state = EXCLUDED.state,
           timestamp_ms = EXCLUDED.timestamp_ms,
           contract_id = EXCLUDED.contract_id,
           transfer_type = EXCLUDED.transfer_type,
           edr_available = EXCLUDED.edr_available,
           updated_at = now()`,
        [
          t.id,
          t.type,
          t.participant,
          t.participant_id,
          t.asset,
          t.asset_id,
          t.state,
          t.counter_party,
          t.timestamp_ms,
          t.contract_id,
          t.transfer_type,
          t.edr_available ?? false,
        ],
      );
      upserted++;
    }

    res.json({ upserted });
  } catch (err) {
    console.error("[tasks/sync] Error:", err);
    res.status(500).json({ error: "Failed to sync tasks" });
  }
});

/**
 * GET /tasks — Retrieve all persisted tasks from PostgreSQL.
 * Query params: ?participantId=<ctx> (optional filter)
 */
app.get("/tasks", async (req: Request, res: Response) => {
  try {
    await ensureTaskTable();
    const pool = getTaskPool();
    const participantId = req.query.participantId as string | undefined;

    let query = "SELECT * FROM tasks";
    const params: string[] = [];
    if (participantId) {
      query += " WHERE participant_id = $1";
      params.push(participantId);
    }
    query += " ORDER BY timestamp_ms DESC";

    const result = await pool.query(query, params);
    const tasks = result.rows.map((r: TaskRow) => ({
      id: r.id,
      type: r.type,
      participant: r.participant,
      participantId: r.participant_id,
      asset: r.asset,
      assetId: r.asset_id,
      state: r.state,
      counterParty: r.counter_party,
      timestamp: parseInt(r.timestamp_ms as string, 10) || 0,
      contractId: r.contract_id,
      transferType: r.transfer_type,
      edrAvailable: r.edr_available,
    }));

    const active = tasks.filter(
      (t: { state: string }) =>
        !["FINALIZED", "COMPLETED", "TERMINATED", "ERROR"].includes(
          t.state?.toUpperCase() || "",
        ),
    ).length;

    res.json({
      tasks,
      counts: {
        total: tasks.length,
        negotiations: tasks.filter(
          (t: { type: string }) => t.type === "negotiation",
        ).length,
        transfers: tasks.filter((t: { type: string }) => t.type === "transfer")
          .length,
        active,
      },
    });
  } catch (err) {
    console.error("[tasks] Error:", err);
    res.status(500).json({
      error: "Failed to retrieve tasks",
      tasks: [],
      counts: { total: 0, negotiations: 0, transfers: 0, active: 0 },
    });
  }
});

// ---- TCK Compliance Endpoint -----------------------------------------------

/**
 * GET /tck
 *
 * Runs DSP + DCP compliance checks from inside the Docker network where:
 *  - Docker hostnames (controlplane, identityhub, etc.) resolve correctly
 *  - Keycloak tokens have the correct issuer claim (keycloak:8080)
 *
 * The UI's /api/compliance/tck route calls this endpoint for DSP/DCP checks,
 * while running EHDS (Neo4j) checks directly.
 */

const TCK_KEYCLOAK_URL = process.env.TCK_KEYCLOAK_URL ?? "http://keycloak:8080";
const TCK_KEYCLOAK_REALM = process.env.TCK_KEYCLOAK_REALM ?? "edcv";
const TCK_CLIENT_ID = process.env.TCK_CLIENT_ID ?? "admin";
const TCK_CLIENT_SECRET = process.env.TCK_CLIENT_SECRET ?? "edc-v-admin-secret";

const TCK_CONTROLPLANE_DEFAULT_URL =
  process.env.TCK_CONTROLPLANE_DEFAULT_URL ?? "http://controlplane:8080";
const TCK_CONTROLPLANE_MGMT_URL =
  process.env.TCK_CONTROLPLANE_MGMT_URL ?? "http://controlplane:8081/api/mgmt";
const TCK_IDENTITY_URL =
  process.env.TCK_IDENTITY_URL ?? "http://identityhub:7081/api/identity";
const TCK_ISSUER_URL =
  process.env.TCK_ISSUER_URL ?? "http://issuerservice:10013/api/admin";

const TCK_PARTICIPANTS = ["alpha-klinik", "pharmaco", "medreg", "lmc", "irs"];

interface TckTestResult {
  id: string;
  category: string;
  suite: "DSP" | "DCP";
  name: string;
  status: "pass" | "fail" | "skip";
  detail: string;
}

async function tckGetToken(): Promise<string | null> {
  try {
    const tokenUrl = `${TCK_KEYCLOAK_URL}/realms/${TCK_KEYCLOAK_REALM}/protocol/openid-connect/token`;
    const resp = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `grant_type=client_credentials&client_id=${TCK_CLIENT_ID}&client_secret=${TCK_CLIENT_SECRET}`,
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as { access_token?: string };
    return data.access_token ?? null;
  } catch {
    return null;
  }
}

async function tckProbe(url: string, init?: RequestInit): Promise<boolean> {
  try {
    const res = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function tckProbeJson<T>(
  url: string,
  init?: RequestInit,
): Promise<T | null> {
  try {
    const res = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

app.get("/tck", async (_req: Request, res: Response) => {
  const results: TckTestResult[] = [];

  // --- Get auth token from Keycloak (Docker-internal) ---
  const token = await tckGetToken();
  const authHeaders: Record<string, string> = token
    ? { Authorization: `Bearer ${token}` }
    : {};

  // ── DSP Suite ────────────────────────────────────────────────
  // DSP-1.1: Readiness (port 8080 default web port, no auth required)
  const readiness = await tckProbe(
    `${TCK_CONTROLPLANE_DEFAULT_URL}/api/check/readiness`,
  );
  results.push({
    id: "DSP-1.1",
    category: "Schema Compliance",
    suite: "DSP",
    name: "Control Plane Readiness",
    status: readiness ? "pass" : "fail",
    detail: readiness
      ? "GET /api/check/readiness → 200"
      : "Control plane not reachable",
  });

  // DSP-1.2: Liveness (port 8080 default web port, no auth required)
  const liveness = await tckProbe(
    `${TCK_CONTROLPLANE_DEFAULT_URL}/api/check/liveness`,
  );
  results.push({
    id: "DSP-1.2",
    category: "Schema Compliance",
    suite: "DSP",
    name: "Control Plane Liveness",
    status: liveness ? "pass" : "fail",
    detail: liveness
      ? "GET /api/check/liveness → 200"
      : "Liveness probe failed",
  });

  // DSP-2.x: Catalog per participant (requires auth; need real context IDs)
  // First, list participant contexts to map friendly names → context IDs
  const participantContexts = await tckProbeJson<
    Array<{ "@id": string; identity: string }>
  >(`${TCK_CONTROLPLANE_MGMT_URL}/v5alpha/participants`, {
    headers: { ...authHeaders, "Content-Type": "application/json" },
  });

  for (const name of TCK_PARTICIPANTS) {
    const idx = TCK_PARTICIPANTS.indexOf(name) + 1;
    // Find context ID by matching the identity DID suffix
    const ctx = participantContexts?.find(
      (p) => p.identity?.includes(`:${name}`),
    );

    if (!ctx) {
      results.push({
        id: `DSP-2.${idx}`,
        category: "Catalog Protocol",
        suite: "DSP",
        name: `Catalog query — ${name}`,
        status: "fail",
        detail: `ParticipantContext '${name}' not found`,
      });
      continue;
    }

    // Query local assets for this participant (validates auth + context + mgmt API)
    const assetsBody = JSON.stringify({
      "@context": ["https://w3id.org/edc/connector/management/v2"],
      "@type": "QuerySpec",
      filterExpression: [],
    });
    const assets = await tckProbeJson<unknown[]>(
      `${TCK_CONTROLPLANE_MGMT_URL}/v5alpha/participants/${ctx["@id"]}/assets/request`,
      {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: assetsBody,
      },
    );
    results.push({
      id: `DSP-2.${idx}`,
      category: "Catalog Protocol",
      suite: "DSP",
      name: `Catalog query — ${name}`,
      status: Array.isArray(assets) ? "pass" : "fail",
      detail: Array.isArray(assets)
        ? `${assets.length} asset(s) for ${name}`
        : "Assets query failed",
    });
  }

  // ── DCP Suite ────────────────────────────────────────────────
  // DCP-1.1: IdentityHub reachable (participant list with auth)
  const ihData = await tckProbeJson<unknown[]>(
    `${TCK_IDENTITY_URL}/v1alpha/participants`,
    { headers: { ...authHeaders, "Content-Type": "application/json" } },
  );
  const ihReachable = Array.isArray(ihData);
  results.push({
    id: "DCP-1.1",
    category: "DID Resolution",
    suite: "DCP",
    name: "IdentityHub reachable",
    status: ihReachable ? "pass" : "fail",
    detail: ihReachable
      ? `IdentityHub responded with ${ihData!.length} participant(s)`
      : "IdentityHub unreachable",
  });

  // DCP-2.x: Key pairs per participant (use participantContextId from IH)
  // The IdentityHub uses its own participantContextId (UUID), same as controlplane
  const ihParticipants = Array.isArray(ihData)
    ? (ihData as Array<{ participantContextId?: string; did?: string }>)
    : [];

  for (const name of TCK_PARTICIPANTS) {
    const idx = TCK_PARTICIPANTS.indexOf(name) + 1;
    // Match IH participant by DID suffix (CP and IH may have different context IDs)
    const ihMatch = ihParticipants.find((p) => p.did?.includes(`:${name}`));
    const contextId = ihMatch?.participantContextId;

    // Fall back to Control Plane context ID if IH match not found
    const cpCtx = participantContexts?.find(
      (p) => p.identity?.includes(`:${name}`),
    );
    const finalContextId = contextId ?? cpCtx?.["@id"];

    if (!finalContextId) {
      results.push({
        id: `DCP-2.${idx}`,
        category: "Key Pair Management",
        suite: "DCP",
        name: `Key pairs — ${name}`,
        status: "fail",
        detail: `ParticipantContext for '${name}' not found`,
      });
      continue;
    }

    const data = await tckProbeJson<unknown[]>(
      `${TCK_IDENTITY_URL}/v1alpha/participants/${finalContextId}/keypairs`,
      { headers: { ...authHeaders, "Content-Type": "application/json" } },
    );
    const hasPairs = Array.isArray(data) && data.length > 0;
    results.push({
      id: `DCP-2.${idx}`,
      category: "Key Pair Management",
      suite: "DCP",
      name: `Key pairs — ${name}`,
      status: hasPairs ? "pass" : "fail",
      detail: hasPairs ? `${data!.length} key pair(s) found` : "No key pairs",
    });
  }

  // DCP-3.1: IssuerService reachable (per-participant credential definitions query)
  // Use the first available participant context ID
  const firstPcId = participantContexts?.[0]?.["@id"];
  if (firstPcId) {
    const issuerData = await tckProbeJson<unknown[]>(
      `${TCK_ISSUER_URL}/v1alpha/participants/${firstPcId}/credentialdefinitions/query`,
      {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          "@context": ["https://w3id.org/edc/connector/management/v2"],
          "@type": "QuerySpec",
          filterExpression: [],
        }),
      },
    );
    const issuerReachable = Array.isArray(issuerData);
    results.push({
      id: "DCP-3.1",
      category: "Issuer Service",
      suite: "DCP",
      name: "IssuerService reachable",
      status: issuerReachable ? "pass" : "fail",
      detail: issuerReachable
        ? `IssuerService responded with ${
            issuerData!.length
          } credential definition(s)`
        : "IssuerService unreachable",
    });
  } else {
    results.push({
      id: "DCP-3.1",
      category: "Issuer Service",
      suite: "DCP",
      name: "IssuerService reachable",
      status: "fail",
      detail: "No participant context available to query IssuerService",
    });
  }

  // ── Response ─────────────────────────────────────────────────
  const passed = results.filter((r) => r.status === "pass").length;
  const failed = results.filter((r) => r.status === "fail").length;
  const skipped = results.filter((r) => r.status === "skip").length;

  res.json({
    timestamp: new Date().toISOString(),
    summary: { total: results.length, passed, failed, skipped },
    results,
  });
});

// ---- Error handler ---------------------------------------------------------

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[neo4j-proxy] Error:", err.message);
  res
    .status(500)
    .json({ error: "Internal Server Error", message: err.message });
});

// ---- Startup ---------------------------------------------------------------

async function main() {
  driver = neo4j.driver(
    NEO4J_URI,
    neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD),
  );

  // Verify primary SPE connectivity
  try {
    const info = await driver.getServerInfo();
    console.log(`[neo4j-proxy] Connected to Neo4j SPE-1 at ${info.address}`);
  } catch (err) {
    console.error("[neo4j-proxy] Failed to connect to Neo4j SPE-1:", err);
    process.exit(1);
  }

  // Phase 5: Connect to optional second SPE
  if (NEO4J_SPE2_URI) {
    try {
      spe2Driver = neo4j.driver(
        NEO4J_SPE2_URI,
        neo4j.auth.basic(NEO4J_SPE2_USER, NEO4J_SPE2_PASSWORD),
      );
      const info2 = await spe2Driver.getServerInfo();
      console.log(`[neo4j-proxy] Connected to Neo4j SPE-2 at ${info2.address}`);
    } catch (err) {
      console.warn(
        "[neo4j-proxy] SPE-2 not available (federated queries disabled):",
        err,
      );
      spe2Driver = null;
    }
  } else {
    console.log(
      "[neo4j-proxy] SPE-2 not configured (set NEO4J_SPE2_URI to enable)",
    );
  }

  app.listen(PORT, () => {
    console.log(`[neo4j-proxy] Listening on port ${PORT}`);
    console.log(`[neo4j-proxy] Endpoints:`);
    console.log(`  GET  /health`);
    console.log(`  GET  /fhir/Patient`);
    console.log(`  GET  /fhir/Patient/:id/$everything`);
    console.log(`  POST /fhir/Bundle`);
    console.log(`  POST /omop/cohort`);
    console.log(`  GET  /omop/person/:id/timeline`);
    console.log(`  GET  /catalog/datasets`);
    console.log(`  GET  /catalog/datasets/:id`);
    console.log(`  POST /federated/query           (Phase 5)`);
    console.log(`  GET  /federated/stats            (Phase 5)`);
    console.log(`  POST /nlq                        (Phase 5c — Text2Cypher)`);
    console.log(`  GET  /nlq/templates              (Phase 5c)`);
    console.log(`  GET  /tck                        (TCK compliance probes)`);
    if (spe2Driver) {
      console.log(`  ✅ Federated mode: 2 SPEs connected`);
    }
    if (OPENAI_API_KEY) {
      console.log(`  ✅ LLM: OpenAI ${OPENAI_MODEL}`);
    } else if (OLLAMA_URL) {
      console.log(`  ✅ LLM: Ollama ${OLLAMA_MODEL} at ${OLLAMA_URL}`);
    } else {
      console.log(`  ℹ️  LLM: disabled (template-only mode)`);
    }
  });

  // Graceful shutdown
  process.on("SIGTERM", async () => {
    console.log("[neo4j-proxy] SIGTERM received, shutting down...");
    await driver.close();
    if (spe2Driver) await spe2Driver.close();
    process.exit(0);
  });
}

// Only auto-start when run directly (not imported for testing)
const isMainModule =
  typeof process.env.VITEST === "undefined" && process.env.NODE_ENV !== "test";
if (isMainModule) {
  main().catch((err) => {
    console.error("[neo4j-proxy] Fatal:", err);
    process.exit(1);
  });
}

export { main };
