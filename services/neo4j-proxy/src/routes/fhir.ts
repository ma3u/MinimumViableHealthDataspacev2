import { type Request, type Response, type NextFunction } from "express";
import neo4j from "neo4j-driver";
import { getSession } from "../db.js";
import { app } from "../app.js";
import { auditContext, logTransferEvent } from "../audit.js";

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
    const session = getSession();
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
      OPTIONAL MATCH (enc)-[:HAS_PROCEDURE]->(proc:Procedure)
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
             collect(DISTINCT proc) AS procedures,
             collect(DISTINCT encMed) + collect(DISTINCT med)   AS medications,
             collect(DISTINCT rep)  AS reports,
             collect(DISTINCT imm)  AS immunizations,
             collect(DISTINCT stm)  AS statements
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
      // Study results beyond laboratory values (ADR-059): reports, the
      // vaccination record and the medication plan, as the hub seeds them.
      const props = (key: string) =>
        (rec.has?.(key) ? rec.get(key) : []).map((n: any) => n.properties);
      const reports = props("reports");
      const immunizations = props("immunizations");
      const statements = props("statements");

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
        ...reports.map((r: any) => ({
          resource: { resourceType: "DiagnosticReport", ...r },
        })),
        ...immunizations.map((i: any) => ({
          resource: { resourceType: "Immunization", ...i },
        })),
        ...statements.map((s: any) => ({
          resource: { resourceType: "MedicationStatement", ...s },
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
        auditContext(req, res),
      );
    } catch (err) {
      next(err);
    } finally {
      await session.close();
    }
  },
);
