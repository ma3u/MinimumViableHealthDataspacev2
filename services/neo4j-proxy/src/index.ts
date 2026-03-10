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

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env.PORT ?? "9090", 10);
const NEO4J_URI = process.env.NEO4J_URI ?? "bolt://localhost:7687";
const NEO4J_USER = process.env.NEO4J_USER ?? "neo4j";
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD ?? "healthdataspace";

// ---------------------------------------------------------------------------
// Neo4j driver (single instance, connection-pooled)
// ---------------------------------------------------------------------------

let driver: Driver;

function getSession(): Session {
  return driver.session({ database: "neo4j" });
}

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------

const app = express();
app.use(express.json());

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

  // Verify connectivity at startup
  try {
    const info = await driver.getServerInfo();
    console.log(`[neo4j-proxy] Connected to Neo4j at ${info.address}`);
  } catch (err) {
    console.error("[neo4j-proxy] Failed to connect to Neo4j:", err);
    process.exit(1);
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
  });

  // Graceful shutdown
  process.on("SIGTERM", async () => {
    console.log("[neo4j-proxy] SIGTERM received, shutting down...");
    await driver.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("[neo4j-proxy] Fatal:", err);
  process.exit(1);
});
