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
import neo4j, { type Driver, type Session } from "neo4j-driver";
import pg from "pg";
import rateLimit from "express-rate-limit";
import {
  runGraphRag,
  type GraphRagTraceStage,
  type RerankCandidate,
  type RerankDecision,
} from "./graphrag.js";

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

// Phase 5c: Optional LLM endpoint for Text2Cypher
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
const OLLAMA_URL = process.env.OLLAMA_URL; // e.g. http://localhost:11434
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "llama3.1";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
const AZURE_OPENAI_GPT4O_URL = process.env.AZURE_OPENAI_GPT4O_URL;
const AZURE_OPENAI_API_KEY = process.env.AZURE_OPENAI_API_KEY;

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

// ---- Phase 26 diagnostics ------------------------------------------------
// Public, read-only summaries so we can verify the federated-discovery
// loop (crawler targets, federated datasets, NLQ glossary rows) without
// az CLI access or cypher-shell. No sensitive data leaves Neo4j.
app.get("/debug/phase26", async (_req: Request, res: Response) => {
  const session = getSession();
  try {
    const targets = await session.run(`
      MATCH (p:Participant)
      WHERE p.source IN ['dcp','business-wallet','private-wallet','seed']
        AND p.dspCatalogUrl IS NOT NULL
        AND coalesce(p.crawlerEnabled, true) = true
      RETURN count(p) AS targetCount
    `);
    const participants = await session.run(
      "MATCH (p:Participant) RETURN count(p) AS total, count(p.source) AS withSource, count(p.dspCatalogUrl) AS withDsp",
    );
    const federated = await session.run(`
      MATCH (d:HealthDataset)
      RETURN count(d) AS totalDatasets,
             count(CASE WHEN d.source = 'federated' THEN 1 END) AS federatedDatasets
    `);
    const glossary = await session.run(
      "MATCH (g:NlqGlossary) RETURN count(g) AS total, collect(DISTINCT g.kind) AS kinds",
    );
    res.json({
      crawlerTargetCount:
        targets.records[0]?.get("targetCount")?.toNumber?.() ?? 0,
      participants: {
        total: participants.records[0]?.get("total")?.toNumber?.() ?? 0,
        withSource:
          participants.records[0]?.get("withSource")?.toNumber?.() ?? 0,
        withDspCatalogUrl:
          participants.records[0]?.get("withDsp")?.toNumber?.() ?? 0,
      },
      healthDatasets: {
        total: federated.records[0]?.get("totalDatasets")?.toNumber?.() ?? 0,
        federated:
          federated.records[0]?.get("federatedDatasets")?.toNumber?.() ?? 0,
      },
      nlqGlossary: {
        total: glossary.records[0]?.get("total")?.toNumber?.() ?? 0,
        kinds: glossary.records[0]?.get("kinds") ?? [],
      },
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  } finally {
    await session.close();
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

      // Safety: reject write operations (hardened regex — catches CALL { CREATE } subqueries)
      const upperCypher = cypher.toUpperCase().replace(/\s+/g, " ").trim();
      const WRITE_PATTERN =
        /\b(CREATE|MERGE|DELETE|DETACH\s+DELETE|SET|REMOVE|DROP|CALL\s*\{[^}]*(CREATE|MERGE|DELETE|SET|REMOVE))/i;
      if (WRITE_PATTERN.test(upperCypher)) {
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
/**
 * Knowledge-graph layer identifier. See CLAUDE.md § 5-Layer Neo4j Knowledge Graph
 * for the canonical description. Used by the NLQ handler to show a researcher
 * which layers a given question traverses.
 */
type GraphLayer = "L1" | "L2" | "L3" | "L4" | "L5";

/**
 * A labelled section of the generated Cypher — the UI renders each section
 * with its own header so the researcher can see what each clause is doing
 * (e.g. "cohort: indication filter", "side-effect projection").
 */
interface CypherSection {
  label: string;
  cypher: string;
  layer?: GraphLayer;
}

interface QueryTemplate {
  name: string;
  patterns: RegExp[];
  cypher: string;
  extractParams: (
    match: RegExpMatchArray,
    question: string,
  ) => Record<string, any>;
  description: string;
  /**
   * Which of the 5 Neo4j graph layers this template traverses. Surfaced
   * in the UI so the researcher sees the business question mapped to the
   * dataspace's 5-layer model. Order is arbitrary; layers are de-duped.
   */
  graphLayers?: GraphLayer[];
  /**
   * Optional structured breakdown of the Cypher. When set, the UI renders
   * each section with a heading + colour-coded border. When absent, the
   * raw `cypher` string is shown unannotated.
   */
  cypherSections?: CypherSection[];
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
             RETURN coalesce(c.display, c.name) AS condition, count(*) AS count
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
             RETURN coalesce(m.display, m.name) AS medication, count(*) AS count
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
             WHERE toLower(coalesce(c.display, c.name, '')) CONTAINS toLower($condition)
             WITH total, coalesce(c.display, c.name) AS condition, count(DISTINCT c) AS occurrences
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
  // ── Phase 26d federated-discovery templates ────────────────────────────────
  //
  // These use the :NlqGlossary nodes seeded by neo4j/nlq-glossary.cypher to
  // expand natural-language terms into SNOMED concept IDs + ISO-2 country
  // codes, then filter across the `source: "federated"` HealthDataset rows
  // the catalog-enricher writes. The question text is the only param — the
  // Cypher does the glossary join so new terms are live as soon as ops MERGE
  // them in, without any proxy redeploy.
  {
    name: "federated_dataset_search",
    patterns: [
      // "find/show/list [all] [any words] datasets/studies"
      /(?:find|show|list) (?:all |).*?(?:datasets|studies)/i,
      /datasets (?:across|from|about|in|with)/i,
      /(?:data|studies) (?:available|about|on)/i,
    ],
    cypher: `
      OPTIONAL MATCH (gc:NlqGlossary {kind: 'concept'})
        WHERE toLower($question) CONTAINS gc.term
      WITH collect(DISTINCT gc.code) AS snomedCodes
      OPTIONAL MATCH (gg:NlqGlossary {kind: 'country'})
        WHERE toLower($question) CONTAINS gg.term
      WITH snomedCodes, collect(DISTINCT gg.code) AS countries
      OPTIONAL MATCH (gk:NlqGlossary {kind: 'credential'})
        WHERE toLower($question) CONTAINS gk.term
      WITH snomedCodes, countries, collect(DISTINCT gk.code) AS credentials
      MATCH (d:HealthDataset)
      WHERE coalesce(d.source, 'local') IN ['federated', 'local']
      OPTIONAL MATCH (d)-[:HAS_THEME]->(t)
      OPTIONAL MATCH (d)-[:PUBLISHED_BY]->(p:Participant)
      OPTIONAL MATCH (d)-[:GOVERNED_BY]->(pol:OdrlPolicy)
      WITH d, p, pol, snomedCodes, countries, credentials,
           collect(DISTINCT t.code) AS themeCodes
      WHERE (size(snomedCodes) = 0 OR any(c IN themeCodes WHERE c IN snomedCodes))
        AND (size(countries) = 0 OR coalesce(p.country, d.country) IN countries)
        AND (size(credentials) = 0 OR any(c IN credentials
             WHERE toLower(coalesce(pol.json, '')) CONTAINS toLower(c)))
      RETURN d.datasetId     AS datasetId,
             d.title          AS title,
             coalesce(p.name, d.publisherDid, 'unknown') AS publisher,
             coalesce(p.country, d.country)              AS country,
             d.source         AS source,
             themeCodes       AS themeCodes,
             d.lastSeenAt     AS lastSeenAt
      ORDER BY d.lastSeenAt DESC NULLS LAST, d.title
      LIMIT 50
    `,
    extractParams: (_match, question) => ({ question }),
    description:
      "Find datasets across the dataspace — expands NL terms via glossary (diabetes, German hospitals, DataQualityLabelCredential, ...)",
  },
  {
    name: "participant_count_by_theme",
    patterns: [
      /how many (?:hospitals|organi[sz]ations|participants|clinics|institutes) (?:offer|publish|have)/i,
      /who (?:offers|publishes|has) (?:datasets |data |)(?:about|on|for)/i,
      /(?:count|number) of (?:hospitals|organi[sz]ations|participants) (?:with|offering)/i,
    ],
    cypher: `
      OPTIONAL MATCH (gc:NlqGlossary {kind: 'concept'})
        WHERE toLower($question) CONTAINS gc.term
      WITH collect(DISTINCT gc.code) AS snomedCodes
      MATCH (p:Participant)<-[:PUBLISHED_BY]-(d:HealthDataset)
      OPTIONAL MATCH (d)-[:HAS_THEME]->(t)
      WITH p, snomedCodes, collect(DISTINCT t.code) AS themeCodes
      WHERE size(snomedCodes) = 0
         OR any(c IN themeCodes WHERE c IN snomedCodes)
      RETURN p.name            AS participant,
             p.country          AS country,
             p.walletType       AS walletType,
             count(*)           AS matchingDatasets
      ORDER BY matchingDatasets DESC, p.name
    `,
    extractParams: (_match, question) => ({ question }),
    description:
      "Count participants offering datasets matching a theme (e.g. 'how many hospitals offer oncology datasets')",
  },
  {
    name: "dataset_with_credential",
    patterns: [
      // "find/list/show datasets with/requiring/needing [a] credential|cred|DQL|quality label|DataQualityLabel"
      /(?:find|list|show) (?:datasets|data) (?:with|requiring|needing) (?:a |the |)(?:credential|cred|DQL|DataQualityLabel|quality label)/i,
      /datasets? (?:require|with|needing) (?:the |a |)(?:DataQualityLabel|DQL|quality label)/i,
      /(?:credential-gated|credential required) datasets/i,
    ],
    cypher: `
      OPTIONAL MATCH (gk:NlqGlossary {kind: 'credential'})
        WHERE toLower($question) CONTAINS gk.term
      WITH collect(DISTINCT gk.code) AS credentials
      MATCH (d:HealthDataset)-[:GOVERNED_BY]->(pol:OdrlPolicy)
      WHERE size(credentials) = 0
         OR any(c IN credentials
                WHERE toLower(coalesce(pol.json, '')) CONTAINS toLower(c))
      OPTIONAL MATCH (d)-[:PUBLISHED_BY]->(p:Participant)
      RETURN d.datasetId AS datasetId,
             d.title      AS title,
             coalesce(p.name, d.publisherDid, 'unknown') AS publisher,
             pol.policyId AS policyId
      ORDER BY d.title
      LIMIT 50
    `,
    extractParams: (_match, question) => ({ question }),
    description:
      "Datasets whose ODRL policy requires a credential (e.g. DataQualityLabelCredential)",
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
  // ── Pharmacovigilance (issue #19) ───────────────────────────────────────────
  //
  // Matches questions of the form:
  //   "Is <side-effect> frequently observed in patients treated with <drug>
  //    diagnosed with <indication>?"
  //
  // The Cypher params (drugCode, drugText, indicationCode, indicationText,
  // sideEffectCode, sideEffectText) are resolved by the handler via
  // resolveAdverseEventContext() using the :NlqGlossary kind:'drug' and
  // kind:'concept' rows — do NOT rely on extractParams here. extractParams
  // returns a stub so the generic handler can still call it; the real
  // resolution happens post-match.
  {
    name: "adverse_event_in_cohort",
    patterns: [
      // "is <X> (frequently|commonly|often) (observed|seen|reported) in patients treated with <Y> diagnosed with <Z>"
      /\bis\s+.+?\s+(?:frequently|commonly|often)?\s*(?:observed|seen|reported|prevalent|common|frequent)\s+in\s+patients\s+(?:treated|being\s+treated)\s+with\s+.+?\s+(?:diagnosed|with\s+diagnosis\s+of|who\s+have)\s+.+/i,
      // "how (often|common|frequent) is <X> in patients treated with <Y> diagnosed with <Z>"
      /\bhow\s+(?:often|common|frequent(?:ly)?)\s+(?:is|are)\s+.+?\s+in\s+patients\s+(?:treated|being\s+treated)\s+with\s+.+?\s+(?:diagnosed|with\s+diagnosis\s+of|who\s+have)\s+.+/i,
      // reordered: "is <X> (common|observed|...) in patients (with diagnosis of|who have) <Z> treated with <Y>"
      /\bis\s+.+?\s+(?:frequently|commonly|often)?\s*(?:observed|seen|reported|prevalent|common|frequent)\s+in\s+patients\s+(?:diagnosed|with\s+diagnosis\s+of|who\s+have)\s+.+?\s+(?:treated|being\s+treated)\s+with\s+.+/i,
      // "side effects of <Y> in <Z>" — lightweight alias
      /\b(?:side\s+effects?|adverse\s+events?)\s+of\s+.+?\s+(?:in|for|among)\s+.+/i,
    ],
    // Two-stage Cypher:
    //  1) resolve cohort: patients with indication ∩ patients treated with drug
    //  2) measure side-effect frequency in that cohort
    // Each role is OPTIONAL. When a role is unresolved (both its code and
    // text params are null), that sub-cohort falls back to "all patients",
    // so partial questions still return meaningful rows. The UI's
    // interpretation panel tells the researcher which terms resolved and
    // which fell back to the full population.
    cypher: `
      MATCH (p:Patient)
      WITH collect(DISTINCT p) AS allPatients, count(DISTINCT p) AS populationSize

      // Sub-cohort: patients with the indication, or all patients if
      // no indication was resolved.
      CALL {
        WITH allPatients
        UNWIND allPatients AS p
        OPTIONAL MATCH (p)-[:HAS_CONDITION]->(c:Condition)
        WHERE ($indicationCode IS NOT NULL AND c.code = $indicationCode)
           OR ($indicationText IS NOT NULL
               AND toLower(coalesce(c.display, c.name, '')) CONTAINS $indicationText)
        WITH p, count(c) AS indicationHits
        WHERE ($indicationCode IS NULL AND $indicationText IS NULL)
           OR indicationHits > 0
        RETURN collect(DISTINCT p) AS indicationCohort
      }

      // Sub-cohort: patients treated with the drug, or all patients if
      // no drug was resolved.
      CALL {
        WITH allPatients
        UNWIND allPatients AS p
        OPTIONAL MATCH (p)-[:HAS_MEDICATION_REQUEST]->(m:MedicationRequest)
        WHERE ($drugCode IS NOT NULL AND m.medicationCode = $drugCode)
           OR ($drugText IS NOT NULL
               AND toLower(coalesce(m.display, m.medicationCode, '')) CONTAINS $drugText)
        WITH p, count(m) AS drugHits
        WHERE ($drugCode IS NULL AND $drugText IS NULL)
           OR drugHits > 0
        RETURN collect(DISTINCT p) AS drugCohort
      }

      WITH populationSize, indicationCohort, drugCohort,
           [p IN indicationCohort WHERE p IN drugCohort] AS cohort
      WITH populationSize,
           size(indicationCohort) AS indicationCohortSize,
           size(drugCohort)       AS drugCohortSize,
           size(cohort)           AS cohortSize,
           cohort

      // Side-effect measurement inside the cohort. OPTIONAL MATCH + WHERE
      // keeps cohort members with no matching side-effect as (cp, se=null)
      // rows, so we count only the cps for which se actually matched
      // via a CASE-gated count below.
      UNWIND (CASE WHEN size(cohort) = 0 THEN [null] ELSE cohort END) AS cp
      OPTIONAL MATCH (cp)-[:HAS_CONDITION|HAS_OBSERVATION]->(se)
      WHERE cp IS NOT NULL
        AND (($sideEffectCode IS NOT NULL AND se.code = $sideEffectCode)
             OR ($sideEffectText IS NOT NULL
                 AND toLower(coalesce(se.display, se.name, '')) CONTAINS $sideEffectText))
      WITH populationSize, indicationCohortSize, drugCohortSize, cohortSize,
           count(DISTINCT CASE WHEN se IS NOT NULL THEN cp END) AS affected
      RETURN populationSize,
             indicationCohortSize,
             drugCohortSize,
             cohortSize        AS cohortWithIndicationAndDrug,
             affected          AS patientsWithSideEffect,
             CASE WHEN cohortSize > 0
                  THEN round(toFloat(affected) / cohortSize * 100, 2)
                  ELSE 0.0 END AS frequencyPct
    `,
    // Real params are injected by the handler after glossary resolution; this
    // stub only seeds $question for tests that bypass the handler.
    extractParams: (_match, question) => ({
      question,
      drugCode: null,
      drugText: null,
      indicationCode: null,
      indicationText: null,
      sideEffectCode: null,
      sideEffectText: null,
    }),
    description:
      "Pharmacovigilance cohort: side-effect frequency in patients treated with a drug for an indication (issue #19)",
    // L3 FHIR clinical (Patient/Condition/MedicationRequest) + L5 ontology
    // via the glossary-resolved codes; the UI renders this as a layer
    // breadcrumb so the researcher sees which layers answer the question.
    graphLayers: ["L3", "L5"],
    // Structured breakdown so the UI can colour-code each clause.
    cypherSections: [
      {
        label: "Population",
        layer: "L3",
        cypher: `MATCH (p:Patient)
WITH collect(DISTINCT p) AS allPatients, count(DISTINCT p) AS populationSize`,
      },
      {
        label: "Indication sub-cohort (or all patients if unresolved)",
        layer: "L3",
        cypher: `CALL {
  WITH allPatients
  UNWIND allPatients AS p
  OPTIONAL MATCH (p)-[:HAS_CONDITION]->(c:Condition)
  WHERE ($indicationCode IS NOT NULL AND c.code = $indicationCode)
     OR ($indicationText IS NOT NULL
         AND toLower(coalesce(c.display, c.name, '')) CONTAINS $indicationText)
  WITH p, count(c) AS indicationHits
  WHERE ($indicationCode IS NULL AND $indicationText IS NULL)
     OR indicationHits > 0
  RETURN collect(DISTINCT p) AS indicationCohort
}`,
      },
      {
        label: "Drug sub-cohort (or all patients if unresolved)",
        layer: "L3",
        cypher: `CALL {
  WITH allPatients
  UNWIND allPatients AS p
  OPTIONAL MATCH (p)-[:HAS_MEDICATION_REQUEST]->(m:MedicationRequest)
  WHERE ($drugCode IS NOT NULL AND m.medicationCode = $drugCode)
     OR ($drugText IS NOT NULL
         AND toLower(coalesce(m.display, m.medicationCode, '')) CONTAINS $drugText)
  WITH p, count(m) AS drugHits
  WHERE ($drugCode IS NULL AND $drugText IS NULL)
     OR drugHits > 0
  RETURN collect(DISTINCT p) AS drugCohort
}`,
      },
      {
        label: "Cohort intersection",
        layer: "L3",
        cypher: `WITH populationSize, indicationCohort, drugCohort,
     [p IN indicationCohort WHERE p IN drugCohort] AS cohort`,
      },
      {
        label: "Side-effect measurement",
        layer: "L3",
        cypher: `UNWIND (CASE WHEN size(cohort) = 0 THEN [null] ELSE cohort END) AS cp
OPTIONAL MATCH (cp)-[:HAS_CONDITION|HAS_OBSERVATION]->(se)
WHERE cp IS NOT NULL
  AND (($sideEffectCode IS NOT NULL AND se.code = $sideEffectCode)
       OR ($sideEffectText IS NOT NULL
           AND toLower(coalesce(se.display, se.name, '')) CONTAINS $sideEffectText))
WITH cohortSize, count(DISTINCT CASE WHEN se IS NOT NULL THEN cp END) AS affected`,
      },
      {
        label: "Aggregate + frequency",
        cypher: `RETURN populationSize,
       indicationCohortSize,
       drugCohortSize,
       cohortSize        AS cohortWithIndicationAndDrug,
       affected          AS patientsWithSideEffect,
       CASE WHEN cohortSize > 0
            THEN round(toFloat(affected) / cohortSize * 100, 2)
            ELSE 0.0 END AS frequencyPct`,
      },
    ],
  },
];

/**
 * Graph layer metadata — human labels and accent colours for the 5 layers.
 * The UI uses these to render a breadcrumb above the results.
 */
const GRAPH_LAYER_META: Record<GraphLayer, { label: string; short: string }> = {
  L1: { label: "Dataspace Marketplace", short: "DSP" },
  L2: { label: "HealthDCAT-AP Catalog", short: "DCAT-AP" },
  L3: { label: "FHIR R4 Clinical", short: "FHIR" },
  L4: { label: "OMOP CDM Analytics", short: "OMOP" },
  L5: { label: "Biomedical Ontology", short: "Ontology" },
};

/** Graph schema description for LLM context */
const GRAPH_SCHEMA_CONTEXT = `
Neo4j Health Knowledge Graph Schema (5 layers):

Layer 1 - DSP Marketplace:
  (:Participant {participantId, name, did, participantType})
  (:DataProduct {productId, title, provider, productType})
  (:Contract {contractId, status, signedAt})
  (:HDABApproval {approvalId, status, ehdsArticle, purpose, legalBasis})
  (:OdrlPolicy {policyId, ehdsPermissions, ehdsProhibitions, temporalLimit})

Layer 2 - HealthDCAT-AP Catalog:
  (:HealthDataset {datasetId, title, description, publisher, recordCount, temporalCoverage})
  (:Distribution {distributionId, accessURL, mediaType})
  (:Catalog {catalogId, title})

Layer 3 - FHIR R4 Clinical:
  (:Patient {resourceId, patientId, name, birthDate, gender, deceased, city, country})
  (:Encounter {resourceId, name, date, class, type, status})
  (:Condition {resourceId, code, display, name, onsetDate, clinicalStatus})
  (:Observation {resourceId, code, display, value, unit, effectiveDate})
  (:MedicationRequest {resourceId, medicationCode, display, status})
  (:Procedure {resourceId, code, display, performedStart, status})

Layer 4 - OMOP CDM Research:
  (:OMOPPerson {personId, yearOfBirth, genderConceptId})
  (:OMOPConditionOccurrence {conditionOccurrenceId, conditionConceptId, startDate})
  (:OMOPMeasurement {measurementId, measurementConceptId, valueAsNumber, unit})
  (:OMOPDrugExposure {drugExposureId, drugConceptId, startDate})
  (:OMOPProcedureOccurrence {procedureOccurrenceId, procedureConceptId})

Layer 5 - Ontology:
  (:SnomedConcept {conceptId, display})
  (:LoincCode {loincNumber, display})
  (:ICD10Code {code, display})
  (:RxNormConcept {rxcui, display})

Key relationships:
  (:Patient)-[:HAS_ENCOUNTER]->(:Encounter)
  (:Patient)-[:HAS_CONDITION]->(:Condition)
  (:Patient)-[:HAS_OBSERVATION]->(:Observation)
  (:Patient)-[:HAS_MEDICATION_REQUEST]->(:MedicationRequest)
  (:Patient)-[:HAS_PROCEDURE]->(:Procedure)
  (:Condition)-[:CODED_BY]->(:SnomedConcept)
  (:Observation)-[:CODED_BY]->(:LoincCode)
  (:MedicationRequest)-[:CODED_BY]->(:RxNormConcept)
  (:OMOPPerson)-[:MAPPED_FROM]->(:Patient)
  (:OMOPConditionOccurrence)-[:CODED_BY]->(:SnomedConcept)
  (:Participant)-[:OFFERS]->(:DataProduct)-[:GOVERNED_BY]->(:OdrlPolicy)
  (:DataProduct)-[:DESCRIBED_BY]->(:HealthDataset)
  (:Contract)-[:COVERS]->(:DataProduct)

Fulltext indexes (use CALL db.index.fulltext.queryNodes):
  clinical_search — Condition.display, Observation.display, MedicationRequest.display, Procedure.display
  catalog_search — HealthDataset.title, HealthDataset.description, DataProduct.name
  ontology_search — SnomedConcept.display, LoincCode.display, ICD10Code.display, RxNormConcept.display
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

  // Azure OpenAI (GPT-4o) — preferred when configured
  if (AZURE_OPENAI_GPT4O_URL && AZURE_OPENAI_API_KEY) {
    try {
      const resp = await fetch(AZURE_OPENAI_GPT4O_URL, {
        method: "POST",
        headers: {
          "api-key": AZURE_OPENAI_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
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
      console.error("[neo4j-proxy] Azure OpenAI Text2Cypher failed:", err);
    }
  }

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

  if (ANTHROPIC_API_KEY) {
    try {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: ANTHROPIC_MODEL,
          max_tokens: 500,
          system: systemPrompt,
          messages: [{ role: "user", content: question }],
        }),
      });
      const data = (await resp.json()) as any;
      const cypher = data.content?.[0]?.text?.trim();
      if (cypher)
        return cypher
          .replace(/```cypher\n?/g, "")
          .replace(/```/g, "")
          .trim();
    } catch (err) {
      console.error("[neo4j-proxy] Anthropic Text2Cypher failed:", err);
    }
  }

  return null;
}

/* ── ODRL scope type (forwarded from UI auth layer) ──────────── */
interface OdrlScope {
  participantId: string;
  participantName: string;
  permissions: string[];
  prohibitions: string[];
  accessibleDatasets: string[];
  temporalLimit: string | null;
  policyIds: string[];
  hasActiveContract: boolean;
  hdabApproved: boolean;
}

/**
 * Check ODRL temporal limits — reject if policy has expired.
 */
function checkOdrlTemporal(scope: OdrlScope): string | null {
  if (scope.temporalLimit) {
    const limit = new Date(scope.temporalLimit);
    if (limit < new Date()) {
      return `ODRL temporal limit expired: ${scope.temporalLimit}`;
    }
  }
  return null;
}

/**
 * Check ODRL re-identification prohibition.
 * Returns true if the query appears to attempt re-identification.
 */
function checkReIdentification(cypher: string, scope: OdrlScope): boolean {
  if (!scope.prohibitions.includes("re_identification")) return false;
  // Heuristic: queries selecting patient name + birthDate + city together
  const upper = cypher.toUpperCase();
  const hasName = upper.includes(".NAME") || upper.includes(".PATIENTID");
  const hasBirth =
    upper.includes(".BIRTHDATE") || upper.includes(".YEAROFBIRTH");
  const hasGeo =
    upper.includes(".CITY") ||
    upper.includes(".COUNTRY") ||
    upper.includes(".ADDRESS");
  return hasName && hasBirth && hasGeo;
}

/**
 * Log a query audit event to Neo4j (best-effort, non-blocking).
 * Creates a QueryAuditEvent node for EHDS Art. 53 compliance.
 */
function logQueryAudit(
  participantId: string | undefined,
  question: string,
  cypher: string | null,
  method: string,
  resultCount: number,
  odrlEnforced: boolean,
): void {
  if (!driver) return;
  const session = driver.session({ database: "neo4j" });
  session
    .run(
      `MERGE (qa:QueryAuditEvent {eventId: $eventId})
       ON CREATE SET
         qa.participantId = $participantId,
         qa.question = $question,
         qa.cypher = $cypher,
         qa.method = $method,
         qa.resultCount = $resultCount,
         qa.odrlEnforced = $odrlEnforced,
         qa.timestamp = datetime()`,
      {
        eventId: `qa-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        participantId: participantId ?? "anonymous",
        question: question.slice(0, 500),
        cypher: (cypher ?? "").slice(0, 2000),
        method,
        resultCount,
        odrlEnforced,
      },
    )
    .catch((err) => console.error("[neo4j-proxy] Audit log error:", err))
    .finally(() => session.close());
}

/**
 * Fulltext search — queries Neo4j native fulltext indexes for keyword matches.
 * Tier 2 in the NLQ resolution chain (between template and GraphRAG).
 * Searches clinical_search, catalog_search, and ontology_search indexes.
 */
async function fulltextSearch(
  question: string,
): Promise<{ cypher: string; params: Record<string, any> } | null> {
  if (!driver) return null;

  const session = driver.session({ database: "neo4j" });
  try {
    // Build Lucene search term: filter stop words, add wildcard for prefix matching
    const STOP_WORDS = new Set([
      "the",
      "a",
      "an",
      "is",
      "are",
      "was",
      "were",
      "be",
      "been",
      "being",
      "have",
      "has",
      "had",
      "do",
      "does",
      "did",
      "will",
      "would",
      "could",
      "should",
      "may",
      "might",
      "shall",
      "can",
      "need",
      "dare",
      "ought",
      "what",
      "which",
      "who",
      "whom",
      "this",
      "that",
      "these",
      "those",
      "how",
      "many",
      "much",
      "where",
      "when",
      "why",
      "all",
      "each",
      "every",
      "both",
      "few",
      "more",
      "most",
      "some",
      "any",
      "no",
      "not",
      "only",
      "own",
      "same",
      "so",
      "than",
      "too",
      "very",
      "just",
      "about",
      "above",
      "after",
      "again",
      "against",
      "between",
      "into",
      "through",
      "during",
      "before",
      "with",
      "from",
      "for",
      "and",
      "but",
      "or",
      "nor",
      "on",
      "at",
      "to",
      "in",
      "of",
      "by",
      "it",
      "its",
      "me",
      "my",
      "per",
      "show",
      "give",
      "get",
      "tell",
      "find",
      "list",
      "average",
      "total",
      "number",
      "count",
      "patient",
      "patients",
      "person",
      "people",
      "encounter",
      "encounters",
      "observation",
      "observations",
      "medication",
      "medications",
      "condition",
      "conditions",
      "procedure",
      "procedures",
      "dataset",
      "datasets",
      "data",
      "result",
      "results",
      "type",
      "types",
      "class",
      "classes",
      "common",
      "prescribed",
    ]);
    const words = question
      .trim()
      .split(/\s+/)
      .map((w) => w.replace(/[?.!,;:]+$/g, "")) // strip trailing punctuation
      .filter(Boolean)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w.toLowerCase()));
    if (words.length === 0) return null;
    const escaped = words
      .map((w) => w.replace(/[+\-&|!(){}[\]^"~*?:\\/]/g, "\\$&"))
      .map((w) => `${w}* ${w}~`) // wildcard + fuzzy for each word
      .join(" ");
    // Try each fulltext index in priority order
    const indexes = [
      {
        name: "clinical_search",
        query: `CALL db.index.fulltext.queryNodes('clinical_search', $term)
                YIELD node, score WHERE score > 0.5
                WITH labels(node)[0] AS label, node, score
                RETURN label, coalesce(node.display, node.name, node.code) AS name,
                       node.code AS code, score
                ORDER BY score DESC LIMIT 10`,
      },
      {
        name: "catalog_search",
        query: `CALL db.index.fulltext.queryNodes('catalog_search', $term)
                YIELD node, score WHERE score > 0.5
                WITH labels(node)[0] AS label, node, score
                RETURN label, coalesce(node.title, node.name) AS name,
                       node.description AS description, score
                ORDER BY score DESC LIMIT 10`,
      },
      {
        name: "ontology_search",
        query: `CALL db.index.fulltext.queryNodes('ontology_search', $term)
                YIELD node, score WHERE score > 0.5
                WITH labels(node)[0] AS label, node, score
                RETURN label, coalesce(node.display, node.name) AS name, score
                ORDER BY score DESC LIMIT 10`,
      },
    ];

    for (const idx of indexes) {
      try {
        const result = await session.run(idx.query, { term: escaped });
        if (result.records.length > 0) {
          const topLabel = result.records[0].get("label");
          const topName = result.records[0].get("name");

          // Build a context-expanding query based on what was found
          if (topLabel === "Condition") {
            // Fall back to a SnomedConcept lookup by conceptId / code when
            // the CODED_BY edge is missing in the synthetic seed data
            // (issue #19 — `snomedTerm` column was empty in the screenshot).
            // Same trick for ICD-10 via the :ICD10Code label.
            return {
              cypher: `CALL db.index.fulltext.queryNodes('clinical_search', $term)
                       YIELD node, score WHERE score > 0.5 AND 'Condition' IN labels(node)
                       WITH node AS c, score
                       MATCH (p:Patient)-[:HAS_CONDITION]->(c)
                       OPTIONAL MATCH (c)-[:CODED_BY]->(s:SnomedConcept)
                       OPTIONAL MATCH (sByCode:SnomedConcept)
                         WHERE s IS NULL AND sByCode.conceptId = c.code
                       OPTIONAL MATCH (c)-[:CODED_BY]->(i:ICD10Code)
                       OPTIONAL MATCH (iByCode:ICD10Code)
                         WHERE i IS NULL AND iByCode.code = c.code
                       RETURN coalesce(c.display, c.name) AS condition,
                              c.code                       AS code,
                              count(DISTINCT p)            AS patients,
                              coalesce(s.display, sByCode.display)  AS snomedTerm,
                              coalesce(i.code, iByCode.code)        AS icd10,
                              score
                       ORDER BY score DESC LIMIT 10`,
              params: { term: escaped },
            };
          } else if (
            topLabel === "Observation" ||
            topLabel === "MedicationRequest" ||
            topLabel === "Procedure"
          ) {
            return {
              cypher: `CALL db.index.fulltext.queryNodes('clinical_search', $term)
                       YIELD node, score WHERE score > 0.5
                       WITH node, score, labels(node)[0] AS label
                       RETURN label AS resourceType, coalesce(node.display, node.name) AS name,
                              node.code AS code, score
                       ORDER BY score DESC LIMIT 10`,
              params: { term: escaped },
            };
          } else if (
            topLabel === "HealthDataset" ||
            topLabel === "DataProduct"
          ) {
            return {
              cypher: `CALL db.index.fulltext.queryNodes('catalog_search', $term)
                       YIELD node, score WHERE score > 0.5
                       WITH node, score, labels(node)[0] AS label
                       RETURN label AS resourceType, coalesce(node.title, node.name) AS name,
                              node.description AS description, score
                       ORDER BY score DESC LIMIT 10`,
              params: { term: escaped },
            };
          } else {
            // Ontology or generic match
            return {
              cypher: `CALL db.index.fulltext.queryNodes('ontology_search', $term)
                       YIELD node, score WHERE score > 0.5
                       WITH node, score, labels(node)[0] AS label
                       RETURN label AS resourceType, coalesce(node.display, node.name) AS name, score
                       ORDER BY score DESC LIMIT 10`,
              params: { term: escaped },
            };
          }
        }
      } catch {
        // Index might not exist yet — continue to next
        continue;
      }
    }

    return null;
  } catch (err) {
    console.error("[neo4j-proxy] Fulltext search error:", err);
    return null;
  } finally {
    await session.close();
  }
}

/**
 * GraphRAG search — vector similarity search + graph context expansion.
 * Requires vector indexes on HealthDataset, Condition, SnomedConcept.
 * Returns a Cypher query + params if a relevant match is found.
 */
async function graphRagSearch(
  question: string,
): Promise<{ cypher: string; params: Record<string, any> } | null> {
  // GraphRAG requires embeddings. Check if vector indexes exist.
  if (!driver) return null;

  const session = driver.session({ database: "neo4j" });
  try {
    // Check if any vector index exists
    const indexResult = await session.run(
      `SHOW INDEXES WHERE type = 'VECTOR' RETURN name LIMIT 1`,
    );
    if (indexResult.records.length === 0) return null;

    // Generate embedding for the question (requires Ollama or OpenAI)
    const embedding = await generateEmbedding(question);
    if (!embedding) return null;

    // Search across all 3 vector indexes: condition, healthdataset, snomed
    const vectorIndexes = [
      {
        name: "condition_embedding",
        expandCypher: (ids: string[]) =>
          `MATCH (c:Condition) WHERE elementId(c) IN $nodeIds
           MATCH (p:Patient)-[:HAS_CONDITION]->(c)
           OPTIONAL MATCH (c)-[:CODED_BY]->(s:SnomedConcept)
           OPTIONAL MATCH (p)-[:HAS_OBSERVATION]->(o:Observation)
           RETURN coalesce(c.display, c.name) AS match, 'Condition' AS type,
                  count(DISTINCT p) AS patients, s.display AS snomedTerm,
                  collect(DISTINCT o.display)[0..5] AS relatedObservations
           ORDER BY patients DESC LIMIT 10`,
      },
      {
        name: "healthdataset_embedding",
        expandCypher: (ids: string[]) =>
          `MATCH (d:HealthDataset) WHERE elementId(d) IN $nodeIds
           OPTIONAL MATCH (d)<-[:CONTAINS]-(cat:Catalog)
           OPTIONAL MATCH (d)-[:HAS_DISTRIBUTION]->(dist:Distribution)
           RETURN d.title AS match, 'HealthDataset' AS type,
                  d.description AS description, cat.name AS catalog,
                  collect(DISTINCT dist.format) AS formats
           LIMIT 10`,
      },
      {
        name: "snomed_embedding",
        expandCypher: (ids: string[]) =>
          `MATCH (s:SnomedConcept) WHERE elementId(s) IN $nodeIds
           OPTIONAL MATCH (c:Condition)-[:CODED_BY]->(s)
           OPTIONAL MATCH (p:Patient)-[:HAS_CONDITION]->(c)
           RETURN s.display AS match, 'SnomedConcept' AS type,
                  s.conceptId AS code, count(DISTINCT p) AS patients
           ORDER BY patients DESC LIMIT 10`,
      },
    ];

    for (const idx of vectorIndexes) {
      try {
        const result = await session.run(
          `CALL db.index.vector.queryNodes($indexName, 5, $embedding)
           YIELD node, score WHERE score > 0.5
           RETURN elementId(node) AS nodeId, score
           ORDER BY score DESC LIMIT 5`,
          { indexName: idx.name, embedding },
        );

        if (result.records.length > 0) {
          const nodeIds = result.records.map((r) => r.get("nodeId"));
          return {
            cypher: idx.expandCypher(nodeIds),
            params: { nodeIds },
          };
        }
      } catch {
        // Vector index might not exist — continue to next
        continue;
      }
    }

    return null;
  } catch (err) {
    console.error("[neo4j-proxy] GraphRAG search error:", err);
    return null;
  } finally {
    await session.close();
  }
}

/**
 * Generate an embedding vector for a text string.
 * Uses Azure OpenAI, Ollama (nomic-embed-text), or OpenAI (text-embedding-3-small).
 */
async function generateEmbedding(text: string): Promise<number[] | null> {
  const AZURE_EMBEDDINGS_URL = process.env.AZURE_OPENAI_EMBEDDINGS_URL;
  if (AZURE_EMBEDDINGS_URL && AZURE_OPENAI_API_KEY) {
    try {
      const resp = await fetch(AZURE_EMBEDDINGS_URL, {
        method: "POST",
        headers: {
          "api-key": AZURE_OPENAI_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ input: text }),
      });
      const data = (await resp.json()) as any;
      return data.data?.[0]?.embedding ?? null;
    } catch (err) {
      console.error("[neo4j-proxy] Azure OpenAI embedding error:", err);
    }
  }

  if (OLLAMA_URL) {
    try {
      const resp = await fetch(`${OLLAMA_URL}/api/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "nomic-embed-text", prompt: text }),
      });
      const data = (await resp.json()) as any;
      return data.embedding ?? null;
    } catch (err) {
      console.error("[neo4j-proxy] Ollama embedding error:", err);
    }
  }

  if (OPENAI_API_KEY) {
    try {
      const resp = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "text-embedding-3-small",
          input: text,
          dimensions: 384,
        }),
      });
      const data = (await resp.json()) as any;
      return data.data?.[0]?.embedding ?? null;
    } catch (err) {
      console.error("[neo4j-proxy] OpenAI embedding error:", err);
    }
  }

  return null;
}

/**
 * Phase 25e (Issue #13) — GraphRAG rerank via gpt-5-mini (or any chat model
 * deployed behind AZURE_OPENAI_GPT4O_URL). Returns { topNodeIds, cypher } or
 * null if the endpoint is not configured. The model is instructed to return
 * READ-ONLY Cypher that references `$topIds` as the parameter name for the
 * selected element ids, so the caller can bind them safely.
 */
async function graphRagRerank(
  question: string,
  candidates: RerankCandidate[],
): Promise<RerankDecision | null> {
  if (!AZURE_OPENAI_GPT4O_URL || !AZURE_OPENAI_API_KEY) return null;

  const candidateBlock = candidates
    .slice(0, 20)
    .map(
      (c, i) =>
        `${i + 1}. [${c.label}] id=${c.nodeId} score=${c.score.toFixed(3)} :: ${
          c.text
        }`,
    )
    .join("\n");

  const systemPrompt = `You rerank Neo4j graph nodes for a health-data dataspace.
Pick the 3-5 most relevant candidates for the user's question and write a READ-ONLY
Cypher query that (a) returns those candidates with their key properties and
(b) expands 1 hop of context. The parameter name MUST be $topIds (list of elementId
strings). Forbidden keywords: CREATE, MERGE, DELETE, SET, REMOVE, DROP, CALL { ...
any write }. Return ONLY valid JSON of the form:
{"topNodeIds": ["<elementId>", ...], "cypher": "MATCH (n) WHERE elementId(n) IN $topIds ..."}`;

  try {
    const resp = await fetch(AZURE_OPENAI_GPT4O_URL, {
      method: "POST",
      headers: {
        "api-key": AZURE_OPENAI_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Question: ${question}\n\nCandidates:\n${candidateBlock}`,
          },
        ],
        temperature: 0,
        max_tokens: 600,
        response_format: { type: "json_object" },
      }),
    });
    if (!resp.ok) {
      console.warn(
        "[graphrag] rerank HTTP",
        resp.status,
        await resp.text().catch(() => ""),
      );
      return null;
    }
    const body = (await resp.json()) as {
      choices?: [{ message: { content: string } }];
    };
    const raw = body.choices?.[0]?.message?.content;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RerankDecision;
    if (!Array.isArray(parsed.topNodeIds) || typeof parsed.cypher !== "string")
      return null;
    return parsed;
  } catch (err) {
    console.warn("[graphrag] rerank error:", err);
    return null;
  }
}

/* ── Pharmacovigilance role resolver (issue #19) ─────────────────────────────
 *
 * Parses a pharmacovigilance-shaped question into three semantic roles
 * (drug / indication / side-effect) and resolves each to a NlqGlossary row
 * when one matches. Returns both the raw text spans AND the resolved codes
 * so the NLQ response can render a "how we interpreted your question" panel.
 *
 * Heuristic: regex captures the free-text span for each role, then the
 * longest matching glossary term of the expected kind wins. This keeps
 * things deterministic without an LLM.
 */
interface PharmaRole {
  term: string;
  code: string;
  system: string;
  display: string;
  generic?: string;
  icd10?: string;
}

interface AdverseEventContext {
  drug?: PharmaRole;
  indication?: PharmaRole;
  sideEffect?: PharmaRole;
  raw: {
    drugText?: string;
    indicationText?: string;
    sideEffectText?: string;
  };
}

function extractAdverseEventSpans(
  question: string,
): AdverseEventContext["raw"] {
  const q = question.toLowerCase();
  // side-effect: between "is|are|how ..." and "observed|reported|seen|..."
  const seMatch = q.match(
    /(?:is|are|how\s+(?:often|common|frequent(?:ly)?))\s+([a-z][a-z0-9\s-]{1,40}?)\s+(?:frequently\s+|commonly\s+|often\s+)?(?:observed|seen|reported|prevalent|common|frequent)/,
  );
  // drug: after "treated with" up to comma/diagnosed/who/end
  const drugMatch = q.match(
    /treated\s+with\s+([a-z0-9][a-z0-9\s-]{0,40}?)(?:\s*,|\s+diagnosed|\s+who\s+have|\s+with\s+diagnosis|\s*\?|\s*$)/,
  );
  // indication: after "diagnosed with|with diagnosis of|who have" up to end/comma
  const indMatch = q.match(
    /(?:diagnosed\s+with|with\s+diagnosis\s+of|who\s+have)\s+([a-z0-9][a-z0-9\s-]{0,40}?)(?:\s*\?|\s*$|\s*,|\s+treated)/,
  );
  return {
    sideEffectText: seMatch?.[1]?.trim(),
    drugText: drugMatch?.[1]?.trim(),
    indicationText: indMatch?.[1]?.trim(),
  };
}

async function resolveAdverseEventContext(
  question: string,
  session: ReturnType<NonNullable<typeof driver>["session"]>,
): Promise<AdverseEventContext> {
  const raw = extractAdverseEventSpans(question);

  // Fetch all drug + concept glossary rows in one round-trip (small set ≤100)
  const glossaryResult = await session.run(
    `MATCH (g:NlqGlossary)
     WHERE g.kind IN ['drug', 'concept']
     RETURN g.kind AS kind, g.term AS term, g.code AS code,
            coalesce(g.system, 'snomed') AS system,
            coalesce(g.display, g.term) AS display,
            g.generic AS generic, g.icd10 AS icd10
     ORDER BY size(g.term) DESC`,
  );
  const glossary = glossaryResult.records.map((r) => ({
    kind: r.get("kind") as string,
    term: r.get("term") as string,
    code: r.get("code") as string,
    system: r.get("system") as string,
    display: r.get("display") as string,
    generic: (r.get("generic") as string | null) ?? undefined,
    icd10: (r.get("icd10") as string | null) ?? undefined,
  }));

  const pickLongest = (
    text: string | undefined,
    wantedKind: "drug" | "concept",
  ): PharmaRole | undefined => {
    if (!text) return undefined;
    const lower = text.toLowerCase();
    // glossary is already sorted by term length desc → first hit wins
    const hit = glossary.find(
      (g) => g.kind === wantedKind && lower.includes(g.term),
    );
    return hit
      ? {
          term: hit.term,
          code: hit.code,
          system: hit.system,
          display: hit.display,
          generic: hit.generic,
          icd10: hit.icd10,
        }
      : undefined;
  };

  return {
    drug: pickLongest(raw.drugText, "drug"),
    indication: pickLongest(raw.indicationText, "concept"),
    sideEffect: pickLongest(raw.sideEffectText, "concept"),
    raw,
  };
}

interface CohortFilterParams {
  drugCode?: string | null;
  drugText?: string | null;
  indicationCode?: string | null;
  indicationText?: string | null;
}

interface DataQualityResult {
  // Global (whole graph) coverage
  snomedCoveragePct: number;
  rxnormCoveragePct: number;
  totalConditions: number;
  totalMedicationRequests: number;
  // Cohort-scoped coverage (null when no cohort filter was supplied)
  cohortSize?: number;
  cohortConditions?: number;
  cohortMedicationRequests?: number;
  cohortSnomedCoveragePct?: number;
  cohortRxnormCoveragePct?: number;
}

async function computeCohortDataQuality(
  session: ReturnType<NonNullable<typeof driver>["session"]>,
  cohort?: CohortFilterParams,
): Promise<DataQualityResult | null> {
  try {
    // Global coverage first — always computed.
    const globalResult = await session.run(`
      MATCH (c:Condition)
      OPTIONAL MATCH (c)-[:CODED_BY]->(s:SnomedConcept)
      WITH count(DISTINCT c) AS totalConditions,
           count(DISTINCT CASE WHEN s IS NOT NULL THEN c END) AS codedConditions
      MATCH (m:MedicationRequest)
      OPTIONAL MATCH (m)-[:CODED_BY]->(rx:RxNormConcept)
      WITH totalConditions, codedConditions,
           count(DISTINCT m) AS totalMeds,
           count(DISTINCT CASE WHEN rx IS NOT NULL THEN m END) AS codedMeds
      RETURN totalConditions, codedConditions, totalMeds, codedMeds,
             CASE WHEN totalConditions > 0
                  THEN round(toFloat(codedConditions) / totalConditions * 100, 1)
                  ELSE 0.0 END AS snomedCoveragePct,
             CASE WHEN totalMeds > 0
                  THEN round(toFloat(codedMeds) / totalMeds * 100, 1)
                  ELSE 0.0 END AS rxnormCoveragePct
    `);
    const gRec = globalResult.records[0];
    if (!gRec) return null;
    const toNum = (v: unknown) =>
      neo4j.isInt(v) ? (v as neo4j.Integer).toNumber() : (v as number);
    const out: DataQualityResult = {
      snomedCoveragePct: Number(gRec.get("snomedCoveragePct")) || 0,
      rxnormCoveragePct: Number(gRec.get("rxnormCoveragePct")) || 0,
      totalConditions: toNum(gRec.get("totalConditions")),
      totalMedicationRequests: toNum(gRec.get("totalMeds")),
    };

    // Cohort-scoped coverage — only when at least one role resolved.
    const hasCohort =
      !!cohort &&
      (!!cohort.drugCode ||
        !!cohort.drugText ||
        !!cohort.indicationCode ||
        !!cohort.indicationText);
    if (!hasCohort) return out;

    const cohortResult = await session.run(
      `
      // Rebuild the cohort: patients with indication ∩ patients treated with drug.
      MATCH (p:Patient)
      WITH collect(DISTINCT p) AS allPatients
      CALL {
        WITH allPatients
        UNWIND allPatients AS p
        OPTIONAL MATCH (p)-[:HAS_CONDITION]->(c:Condition)
        WHERE ($indicationCode IS NOT NULL AND c.code = $indicationCode)
           OR ($indicationText IS NOT NULL
               AND toLower(coalesce(c.display, c.name, '')) CONTAINS $indicationText)
        WITH p, count(c) AS hits
        WHERE ($indicationCode IS NULL AND $indicationText IS NULL) OR hits > 0
        RETURN collect(DISTINCT p) AS indicationCohort
      }
      CALL {
        WITH allPatients
        UNWIND allPatients AS p
        OPTIONAL MATCH (p)-[:HAS_MEDICATION_REQUEST]->(m:MedicationRequest)
        WHERE ($drugCode IS NOT NULL AND m.medicationCode = $drugCode)
           OR ($drugText IS NOT NULL
               AND toLower(coalesce(m.display, m.medicationCode, '')) CONTAINS $drugText)
        WITH p, count(m) AS hits
        WHERE ($drugCode IS NULL AND $drugText IS NULL) OR hits > 0
        RETURN collect(DISTINCT p) AS drugCohort
      }
      WITH [p IN indicationCohort WHERE p IN drugCohort] AS cohort
      UNWIND (CASE WHEN size(cohort) = 0 THEN [null] ELSE cohort END) AS cp

      // Cohort coverage: share of cohort patients' Conditions/MedRequests
      // that have a CODED_BY edge to the ontology layer.
      OPTIONAL MATCH (cp)-[:HAS_CONDITION]->(cc:Condition)
      OPTIONAL MATCH (cc)-[:CODED_BY]->(cs:SnomedConcept)
      WITH cohort, cp,
           count(DISTINCT cc) AS cpConditions,
           count(DISTINCT CASE WHEN cs IS NOT NULL THEN cc END) AS cpCodedConds
      OPTIONAL MATCH (cp)-[:HAS_MEDICATION_REQUEST]->(cm:MedicationRequest)
      OPTIONAL MATCH (cm)-[:CODED_BY]->(cr:RxNormConcept)
      WITH size(cohort) AS cohortSize,
           sum(cpConditions) AS cohortConditions,
           sum(CASE WHEN cs IS NOT NULL THEN cpConditions ELSE 0 END) AS _unused,
           sum(cpCodedConds) AS cohortSnomedConds,
           count(DISTINCT cm) AS cohortMeds,
           count(DISTINCT CASE WHEN cr IS NOT NULL THEN cm END) AS cohortCodedMeds
      RETURN cohortSize, cohortConditions, cohortSnomedConds, cohortMeds, cohortCodedMeds,
             CASE WHEN cohortConditions > 0
                  THEN round(toFloat(cohortSnomedConds) / cohortConditions * 100, 1)
                  ELSE 0.0 END AS cohortSnomedCoveragePct,
             CASE WHEN cohortMeds > 0
                  THEN round(toFloat(cohortCodedMeds) / cohortMeds * 100, 1)
                  ELSE 0.0 END AS cohortRxnormCoveragePct
      `,
      {
        drugCode: cohort.drugCode ?? null,
        drugText: cohort.drugText ?? null,
        indicationCode: cohort.indicationCode ?? null,
        indicationText: cohort.indicationText ?? null,
      },
    );
    const cRec = cohortResult.records[0];
    if (cRec) {
      out.cohortSize = toNum(cRec.get("cohortSize"));
      out.cohortConditions = toNum(cRec.get("cohortConditions"));
      out.cohortMedicationRequests = toNum(cRec.get("cohortMeds"));
      out.cohortSnomedCoveragePct =
        Number(cRec.get("cohortSnomedCoveragePct")) || 0;
      out.cohortRxnormCoveragePct =
        Number(cRec.get("cohortRxnormCoveragePct")) || 0;
    }

    return out;
  } catch (err) {
    console.warn("[neo4j-proxy] data-quality query failed:", err);
    return null;
  }
}

/**
 * POST /nlq
 * Natural Language Query — translates a question to Cypher and executes it.
 *
 * Body: { question: string, federated?: boolean, odrlScope?: OdrlScope }
 * - question: Natural language question about the health data
 * - federated: If true, dispatch to all SPEs (default: false, primary only)
 * - odrlScope: Caller's effective ODRL scope (forwarded from UI auth layer)
 *
 * Returns: {
 *   question, cypher, method ("template"|"fulltext"|"graphrag"|"llm"|"none"),
 *   templateName?, results, totalRows, odrlEnforced,
 *   interpretation? (pharmacovigilance role resolution — issue #19),
 *   dataQuality?   (cohort/coverage snapshot — issue #19)
 * }
 */
app.post("/nlq", async (req: Request, res: Response, next: NextFunction) => {
  let cypher: string | null = null;
  let method: "template" | "fulltext" | "graphrag" | "llm" | "none" = "none";

  try {
    const { question, federated = false, odrlScope } = req.body;

    if (!question || typeof question !== "string") {
      res.status(400).json({ error: "Missing 'question' in request body" });
      return;
    }

    let templateName: string | undefined;
    let params: Record<string, any> = {};
    let odrlEnforced = false;

    // ODRL enforcement: check temporal limits and prohibitions
    const scope = odrlScope as OdrlScope | undefined;
    if (scope) {
      odrlEnforced = true;
      const temporalErr = checkOdrlTemporal(scope);
      if (temporalErr) {
        res.status(403).json({ error: temporalErr, odrlEnforced: true });
        return;
      }
    }

    // Step 1: Try template matching
    const templateMatch = matchTemplate(question);
    let graphLayers: GraphLayer[] | undefined;
    let cypherSections: CypherSection[] | undefined;
    if (templateMatch) {
      cypher = templateMatch.template.cypher;
      params = templateMatch.params;
      method = "template";
      templateName = templateMatch.template.name;
      graphLayers = templateMatch.template.graphLayers;
      cypherSections = templateMatch.template.cypherSections;
    }

    // Step 1b: Pharmacovigilance template needs glossary-resolved params
    // (issue #19). The generic extractParams returns a stub; here we
    // populate drugCode/drugText/indicationCode/indicationText/sideEffect*
    // from the :NlqGlossary nodes so the Cypher filters are deterministic.
    let interpretation: AdverseEventContext | undefined;
    if (templateName === "adverse_event_in_cohort" && driver) {
      const resolverSession = driver.session({ database: "neo4j" });
      try {
        interpretation = await resolveAdverseEventContext(
          question,
          resolverSession,
        );
        params = {
          ...params,
          drugCode: interpretation.drug?.code ?? null,
          drugText: interpretation.raw.drugText?.toLowerCase() ?? null,
          indicationCode: interpretation.indication?.code ?? null,
          indicationText:
            interpretation.raw.indicationText?.toLowerCase() ?? null,
          sideEffectCode: interpretation.sideEffect?.code ?? null,
          sideEffectText:
            interpretation.raw.sideEffectText?.toLowerCase() ?? null,
        };
      } finally {
        await resolverSession.close();
      }
    }

    // Step 2: Try native fulltext search
    if (!cypher) {
      const ftResult = await fulltextSearch(question);
      if (ftResult) {
        cypher = ftResult.cypher;
        params = ftResult.params;
        method = "fulltext";
      }
    }

    // Step 3: Try GraphRAG (Phase 25e — vector search + neighbourhood
    // expansion + optional gpt-5-mini rerank). Returns null unless at least
    // one vector index is online.
    let graphragTrace: GraphRagTraceStage[] | undefined;
    if (!cypher && driver) {
      const ragResult = await runGraphRag(question, {
        driver,
        generateSemanticEmbedding: generateEmbedding,
        llmRerank:
          AZURE_OPENAI_GPT4O_URL && AZURE_OPENAI_API_KEY
            ? graphRagRerank
            : null,
      });
      if (ragResult) {
        cypher = ragResult.cypher;
        params = ragResult.params as Record<string, any>;
        method = "graphrag";
        graphragTrace = ragResult.trace;
      }
    }

    // Step 4: Try LLM if no template, fulltext, or GraphRAG matched
    if (!cypher) {
      cypher = await llmText2Cypher(question);
      if (cypher) method = "llm";
    }

    // Step 5: If still no match, return available templates
    if (!cypher) {
      res.json({
        question,
        method: "none",
        message:
          "No matching query template found. Configure ANTHROPIC_API_KEY, OPENAI_API_KEY, or OLLAMA_URL for LLM-based Text2Cypher.",
        availableTemplates: QUERY_TEMPLATES.map((t) => ({
          name: t.name,
          description: t.description,
          examplePatterns: t.patterns.map((p) => p.source),
        })),
      });
      return;
    }

    // Safety check for non-template Cypher (hardened regex)
    if (method === "llm" || method === "graphrag" || method === "fulltext") {
      const WRITE_PATTERN =
        /\b(CREATE|MERGE|DELETE|DETACH\s+DELETE|SET|REMOVE|DROP|CALL\s*\{[^}]*(CREATE|MERGE|DELETE|SET|REMOVE))/i;
      if (WRITE_PATTERN.test(cypher)) {
        res.status(403).json({
          error: "LLM generated a write query — blocked for safety",
          cypher,
        });
        return;
      }
    }

    // ODRL: check re-identification prohibition before execution
    if (scope && cypher && checkReIdentification(cypher, scope)) {
      res.status(403).json({
        error:
          "Query blocked: potential re-identification prohibited by ODRL policy",
        odrlEnforced: true,
        policyIds: scope.policyIds,
      });
      logQueryAudit(scope.participantId, question, cypher, method, 0, true);
      return;
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

    const participantId =
      (req.headers["x-participant"] as string) ?? scope?.participantId;

    // Issue #19: for the pharmacovigilance template, attach a coverage
    // snapshot so the researcher sees whether the dataset can actually
    // answer the question (before reading rows).
    let dataQuality:
      | Awaited<ReturnType<typeof computeCohortDataQuality>>
      | undefined;
    if (templateName === "adverse_event_in_cohort" && driver) {
      const dqSession = driver.session({ database: "neo4j" });
      try {
        dataQuality =
          (await computeCohortDataQuality(dqSession, {
            drugCode: interpretation?.drug?.code ?? null,
            drugText: interpretation?.raw.drugText?.toLowerCase() ?? null,
            indicationCode: interpretation?.indication?.code ?? null,
            indicationText:
              interpretation?.raw.indicationText?.toLowerCase() ?? null,
          })) ?? undefined;
      } finally {
        await dqSession.close();
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
      odrlEnforced,
      ...(graphragTrace ? { trace: graphragTrace } : {}),
      ...(graphLayers
        ? {
            graphLayers: graphLayers.map((id) => ({
              id,
              label: GRAPH_LAYER_META[id].label,
              short: GRAPH_LAYER_META[id].short,
            })),
          }
        : {}),
      ...(cypherSections ? { cypherSections } : {}),
      ...(interpretation
        ? {
            interpretation: {
              drug: interpretation.drug,
              indication: interpretation.indication,
              sideEffect: interpretation.sideEffect,
              unresolved: {
                drug: !interpretation.drug && interpretation.raw.drugText,
                indication:
                  !interpretation.indication &&
                  interpretation.raw.indicationText,
                sideEffect:
                  !interpretation.sideEffect &&
                  interpretation.raw.sideEffectText,
              },
              raw: interpretation.raw,
            },
          }
        : {}),
      ...(dataQuality ? { dataQuality } : {}),
    });

    logTransferEvent("/nlq", "POST", participantId, 200, results.length);
    logQueryAudit(
      participantId,
      question,
      cypher,
      method,
      results.length,
      odrlEnforced,
    );
  } catch (err: any) {
    // Return structured NLQ error (not generic 500) so the UI can display it
    const errMsg = err?.message ?? String(err);
    console.error("[neo4j-proxy] NLQ execution error:", errMsg);
    res.status(200).json({
      question: req.body?.question ?? "",
      cypher: cypher ?? "",
      method: method ?? "none",
      error: `Query execution failed: ${errMsg.slice(0, 300)}`,
      results: [],
      totalRows: 0,
      odrlEnforced: false,
    });
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

/**
 * GET /nlq/backend — Phase 25f (Issue #13).
 * Reports which NLP backend is currently detected from environment so the UI
 * can render a status badge on /query. Discovery is cheap and synchronous.
 */
app.get("/nlq/backend", async (_req: Request, res: Response) => {
  let vectorIndexes: string[] = [];
  if (driver) {
    const session = driver.session({ database: "neo4j" });
    try {
      const r = await session.run(
        `SHOW INDEXES YIELD name, type, state
         WHERE type = 'VECTOR' AND state = 'ONLINE'
         RETURN name`,
      );
      vectorIndexes = r.records.map((rec) => String(rec.get("name")));
    } catch {
      // GDS / vector index not present — leave list empty
    } finally {
      await session.close();
    }
  }

  let chatBackend: string;
  if (AZURE_OPENAI_GPT4O_URL && AZURE_OPENAI_API_KEY) {
    chatBackend = "azure-openai";
  } else if (OPENAI_API_KEY) {
    chatBackend = "openai";
  } else if (OLLAMA_URL) {
    chatBackend = "ollama";
  } else if (ANTHROPIC_API_KEY) {
    chatBackend = "anthropic";
  } else {
    chatBackend = "none";
  }

  const embeddingsBackend =
    process.env.AZURE_OPENAI_EMBEDDINGS_URL && AZURE_OPENAI_API_KEY
      ? "azure-openai"
      : OLLAMA_URL
        ? "ollama"
        : OPENAI_API_KEY
          ? "openai"
          : "none";

  res.json({
    chat: chatBackend,
    embeddings: embeddingsBackend,
    vectorIndexes,
    graphragReady: vectorIndexes.length > 0 && embeddingsBackend !== "none",
    cascade: ["template", "fulltext", "graphrag", "llm", "none"],
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

// When set to "true" (e.g. on Azure where ADR-012's single-port ingress can't
// host EDC's 4-port architecture), unreachable infrastructure is reported as
// "skip" instead of "fail" — distinguishing protocol non-compliance from
// "service not provisioned in this environment".
const TCK_INFRA_OPTIONAL =
  (process.env.TCK_INFRA_OPTIONAL ?? "").toLowerCase() === "true";
const UNREACHABLE_STATUS: "skip" | "fail" = TCK_INFRA_OPTIONAL
  ? "skip"
  : "fail";
const UNREACHABLE_SUFFIX = TCK_INFRA_OPTIONAL
  ? " (not provisioned in this environment)"
  : "";

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
    status: readiness ? "pass" : UNREACHABLE_STATUS,
    detail: readiness
      ? "GET /api/check/readiness → 200"
      : "Control plane not reachable" + UNREACHABLE_SUFFIX,
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
    status: liveness ? "pass" : UNREACHABLE_STATUS,
    detail: liveness
      ? "GET /api/check/liveness → 200"
      : "Liveness probe failed" + UNREACHABLE_SUFFIX,
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
        status: UNREACHABLE_STATUS,
        detail: `ParticipantContext '${name}' not found` + UNREACHABLE_SUFFIX,
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
      status: Array.isArray(assets) ? "pass" : UNREACHABLE_STATUS,
      detail: Array.isArray(assets)
        ? `${assets.length} asset(s) for ${name}`
        : "Assets query failed" + UNREACHABLE_SUFFIX,
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
    status: ihReachable ? "pass" : UNREACHABLE_STATUS,
    detail: ihReachable
      ? `IdentityHub responded with ${ihData!.length} participant(s)`
      : "IdentityHub unreachable" + UNREACHABLE_SUFFIX,
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
        status: UNREACHABLE_STATUS,
        detail:
          `ParticipantContext for '${name}' not found` + UNREACHABLE_SUFFIX,
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
      status: hasPairs ? "pass" : UNREACHABLE_STATUS,
      detail: hasPairs
        ? `${data!.length} key pair(s) found`
        : "No key pairs" + UNREACHABLE_SUFFIX,
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
      status: issuerReachable ? "pass" : UNREACHABLE_STATUS,
      detail: issuerReachable
        ? `IssuerService responded with ${
            issuerData!.length
          } credential definition(s)`
        : "IssuerService unreachable" + UNREACHABLE_SUFFIX,
    });
  } else {
    results.push({
      id: "DCP-3.1",
      category: "Issuer Service",
      suite: "DCP",
      name: "IssuerService reachable",
      status: UNREACHABLE_STATUS,
      detail:
        "No participant context available to query IssuerService" +
        UNREACHABLE_SUFFIX,
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

// ============================================================
// Phase 18: Trust Center — Pseudonym Resolution Protocol
// EHDS Art. 50/51 — HDAB-authenticated endpoints only
// ============================================================

// Trust Center HMAC key (in production: loaded from Vault / HSM)
const TC_HMAC_KEY =
  process.env.TC_HMAC_KEY ?? "dev-trust-center-hmac-key-change-in-production";

/**
 * Derives a deterministic research pseudonym (RPSN) from a provider pseudonym
 * using HMAC-SHA-256. Stateless mode: fast, no storage, but irrevocable.
 * In production the key is split between trust center and HDAB (Shamir secret sharing).
 */
function deriveResearchPsn(
  providerPsn: string,
  providerId: string,
  studyId: string,
): string {
  const { createHmac } = require("crypto") as typeof import("crypto");
  const input = `${studyId}:${providerId}:${providerPsn}`;
  return (
    "rpsn-" + createHmac("sha256", TC_HMAC_KEY).update(input).digest("hex")
  );
}

/**
 * POST /trust-center/resolve
 *
 * Maps one or more provider-specific pseudonyms to a shared research pseudonym.
 * Only HDAB-authority-scoped tokens may call this endpoint.
 * Data users never interact with the Trust Center directly.
 *
 * Body: {
 *   studyId: string,
 *   trustCenterName: string,
 *   providerPseudonyms: Array<{ psnId: string, providerId: string }>,
 *   mode?: "stateless" | "key-managed"   // default: stateless
 * }
 */
app.post(
  "/trust-center/resolve",
  heavyLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    const {
      studyId,
      trustCenterName,
      providerPseudonyms,
      mode = "stateless",
    } = req.body as {
      studyId: string;
      trustCenterName: string;
      providerPseudonyms: Array<{ psnId: string; providerId: string }>;
      mode?: "stateless" | "key-managed";
    };

    if (!studyId || !trustCenterName || !Array.isArray(providerPseudonyms)) {
      res.status(400).json({
        error: "studyId, trustCenterName, and providerPseudonyms are required",
      });
      return;
    }
    if (providerPseudonyms.length === 0) {
      res.status(400).json({ error: "providerPseudonyms must not be empty" });
      return;
    }

    const session = getSession();
    try {
      // Verify trust center exists and is active
      const tcResult = await session.run(
        `MATCH (tc:TrustCenter {name: $trustCenterName, status: "active"})
         RETURN tc.did AS did, tc.protocol AS protocol, tc.country AS country`,
        { trustCenterName },
      );
      if (tcResult.records.length === 0) {
        res.status(404).json({
          error: `Trust Center "${trustCenterName}" not found or inactive`,
        });
        return;
      }
      const tcDid = tcResult.records[0].get("did") as string;

      const rpsnId = deriveResearchPsn(
        providerPseudonyms.map((p) => p.psnId).join("|"),
        providerPseudonyms.map((p) => p.providerId).join("|"),
        studyId,
      );

      if (mode === "stateless") {
        // Stateless: derive HMAC, do not persist mapping (irrevocable by design)
        await session.run(
          `
          MERGE (tc:TrustCenter {name: $trustCenterName})
          MERGE (rp:ResearchPseudonym {rpsnId: $rpsnId})
          ON CREATE SET rp.studyId    = $studyId,
                        rp.revoked    = false,
                        rp.issuedBy   = $tcDid,
                        rp.issuedAt   = datetime(),
                        rp.mode       = "stateless"
          WITH tc, rp
          UNWIND $providerPseudonyms AS pp
          MERGE (src:ProviderPseudonym {psnId: pp.psnId})
          ON CREATE SET src.providerId = pp.providerId,
                        src.studyId    = $studyId,
                        src.createdAt  = datetime()
          MERGE (rp)-[:LINKED_FROM]->(src)
          `,
          { trustCenterName, rpsnId, studyId, tcDid, providerPseudonyms },
        );
      } else {
        // Key-managed: persist with revocation capability
        await session.run(
          `
          MERGE (tc:TrustCenter {name: $trustCenterName})
          MERGE (rp:ResearchPseudonym {rpsnId: $rpsnId})
          ON CREATE SET rp.studyId    = $studyId,
                        rp.revoked    = false,
                        rp.issuedBy   = $tcDid,
                        rp.issuedAt   = datetime(),
                        rp.mode       = "key-managed"
          WITH tc, rp
          UNWIND $providerPseudonyms AS pp
          MERGE (src:ProviderPseudonym {psnId: pp.psnId})
          ON CREATE SET src.providerId = pp.providerId,
                        src.studyId    = $studyId,
                        src.createdAt  = datetime()
          MERGE (rp)-[:LINKED_FROM]->(src)
          `,
          { trustCenterName, rpsnId, studyId, tcDid, providerPseudonyms },
        );
      }

      void logTransferEvent(
        "/trust-center/resolve",
        "POST",
        req.headers["x-participant-id"] as string | undefined,
        200,
        1,
      );

      res.json({
        rpsnId,
        studyId,
        trustCenterDid: tcDid,
        mode,
        providerPseudonymCount: providerPseudonyms.length,
        timestamp: new Date().toISOString(),
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
 *
 * Returns the pseudonym resolution audit log for HDAB operators.
 * Supports ?studyId=... and ?trustCenter=... filters.
 */
app.get(
  "/trust-center/audit",
  async (req: Request, res: Response, next: NextFunction) => {
    const studyId = req.query.studyId as string | undefined;
    const trustCenterName = req.query.trustCenter as string | undefined;
    const limit = Math.min(Number(req.query._count) || 100, 500);

    const session = getSession();
    try {
      const result = await session.run(
        `
        MATCH (rp:ResearchPseudonym)
        WHERE ($studyId IS NULL OR rp.studyId = $studyId)
        OPTIONAL MATCH (tc:TrustCenter)-[:MANAGES|GOVERNED_BY*0..2]-(rp)
        WHERE ($trustCenterName IS NULL OR tc.name = $trustCenterName)
        WITH rp, tc
        OPTIONAL MATCH (rp)-[:LINKED_FROM]->(pp:ProviderPseudonym)
        WITH rp, tc, count(pp) AS providerCount
        ORDER BY rp.issuedAt DESC
        LIMIT $limit
        RETURN rp.rpsnId        AS rpsnId,
               rp.studyId       AS studyId,
               rp.issuedAt      AS issuedAt,
               rp.issuedBy      AS issuedBy,
               rp.revoked       AS revoked,
               rp.mode          AS mode,
               tc.name          AS trustCenter,
               providerCount
        `,
        {
          studyId: studyId ?? null,
          trustCenterName: trustCenterName ?? null,
          limit: neo4j.int(limit),
        },
      );

      const entries = result.records.map((r) => ({
        rpsnId: r.get("rpsnId"),
        studyId: r.get("studyId"),
        issuedAt: r.get("issuedAt")?.toString(),
        issuedBy: r.get("issuedBy"),
        revoked: r.get("revoked"),
        mode: r.get("mode"),
        trustCenter: r.get("trustCenter"),
        providerCount: neo4j.integer.toNumber(r.get("providerCount") ?? 0),
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
 *
 * Revokes a research pseudonym (key-managed mode only).
 * HDAB-initiated unlinkability: marks the RPSN as revoked and
 * removes LINKED_FROM edges to provider pseudonyms.
 */
app.delete(
  "/trust-center/revoke/:rpsn",
  async (req: Request, res: Response, next: NextFunction) => {
    const { rpsn } = req.params;
    const session = getSession();
    try {
      const result = await session.run(
        `
        MATCH (rp:ResearchPseudonym {rpsnId: $rpsnId})
        WHERE rp.mode = "key-managed" AND rp.revoked = false
        SET rp.revoked = true,
            rp.revokedAt = datetime(),
            rp.revokedBy = $revokedBy
        WITH rp
        OPTIONAL MATCH (rp)-[lf:LINKED_FROM]->(:ProviderPseudonym)
        DELETE lf
        RETURN rp.rpsnId AS rpsnId, rp.studyId AS studyId
        `,
        {
          rpsnId: rpsn,
          revokedBy: req.headers["x-participant-id"] ?? "hdab-operator",
        },
      );

      if (result.records.length === 0) {
        res.status(404).json({
          error: `Research pseudonym "${rpsn}" not found, already revoked, or not in key-managed mode`,
        });
        return;
      }

      void logTransferEvent(
        `/trust-center/revoke/${rpsn}`,
        "DELETE",
        req.headers["x-participant-id"] as string | undefined,
        200,
        1,
      );

      res.json({
        revoked: true,
        rpsnId: result.records[0].get("rpsnId"),
        studyId: result.records[0].get("studyId"),
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    } finally {
      await session.close();
    }
  },
);

/**
 * GET /trust-center/status
 *
 * Returns all active trust centers with their governance chain and statistics.
 */
app.get(
  "/trust-center/status",
  async (_req: Request, res: Response, next: NextFunction) => {
    const session = getSession();
    try {
      const result = await session.run(
        `
        MATCH (tc:TrustCenter)
        OPTIONAL MATCH (tc)-[:GOVERNED_BY]->(ha:HDABApproval)
        OPTIONAL MATCH (tc)-[:RESOLVES_PSEUDONYMS_FOR]->(ds:HealthDataset)
        OPTIONAL MATCH (tc)-[:MUTUALLY_RECOGNISES]->(peer:TrustCenter)
        WITH tc, ha,
             count(DISTINCT ds) AS datasetCount,
             collect(DISTINCT peer.country) AS recognisedCountries
        OPTIONAL MATCH (rp:ResearchPseudonym {revoked: false})
          WHERE rp.issuedBy = tc.did
        RETURN tc.name             AS name,
               tc.operatedBy      AS operatedBy,
               tc.country         AS country,
               tc.status          AS status,
               tc.protocol        AS protocol,
               tc.did             AS did,
               ha.approvalId      AS hdabApprovalId,
               ha.status          AS hdabApprovalStatus,
               datasetCount,
               recognisedCountries,
               count(rp)          AS activeRpsnCount
        ORDER BY tc.country
        `,
      );

      const trustCenters = result.records.map((r) => ({
        name: r.get("name"),
        operatedBy: r.get("operatedBy"),
        country: r.get("country"),
        status: r.get("status"),
        protocol: r.get("protocol"),
        did: r.get("did"),
        hdabApprovalId: r.get("hdabApprovalId"),
        hdabApprovalStatus: r.get("hdabApprovalStatus"),
        datasetCount: neo4j.integer.toNumber(r.get("datasetCount") ?? 0),
        recognisedCountries: r.get("recognisedCountries") ?? [],
        activeRpsnCount: neo4j.integer.toNumber(r.get("activeRpsnCount") ?? 0),
      }));

      res.json({ trustCenters });
    } catch (err) {
      next(err);
    } finally {
      await session.close();
    }
  },
);

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
    console.log(`  POST /trust-center/resolve       (Phase 18 — HDAB only)`);
    console.log(`  GET  /trust-center/audit         (Phase 18 — audit log)`);
    console.log(
      `  DELETE /trust-center/revoke/:id  (Phase 18 — HDAB revocation)`,
    );
    console.log(`  GET  /trust-center/status        (Phase 18 — TC status)`);
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
