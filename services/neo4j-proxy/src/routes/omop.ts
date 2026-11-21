import { type Request, type Response, type NextFunction } from "express";
import neo4j from "neo4j-driver";
import { getSession } from "../db.js";
import { app, heavyLimiter } from "../app.js";
import { auditContext, logTransferEvent } from "../audit.js";
import { secondaryUseSession } from "../opt-out.js";

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
    // Art. 71 (ADR-062): the data plane serves research; persons who opted out are left out.
    const session = secondaryUseSession(getSession());
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
 * The OMOP rows a person's timeline is built from, each with the CDM column
 * that holds its key, its date and its source code (ADR-098).
 */
const TIMELINE_CYPHER = `
MATCH (p:OMOPPerson {personId: $personId})
OPTIONAL MATCH (p)-[:HAS_VISIT_OCCURRENCE|HAS_CONDITION_OCCURRENCE|HAS_MEASUREMENT|HAS_DRUG_EXPOSURE|HAS_PROCEDURE_OCCURRENCE]->
  (x:OMOPVisitOccurrence|OMOPConditionOccurrence|OMOPMeasurement|OMOPDrugExposure|OMOPProcedureOccurrence)
WITH p, x
ORDER BY coalesce(x.visitStartDate, x.conditionStartDate, x.measurementDate,
                  x.drugExposureStart, x.procedureDate)
RETURN p.personId AS personId, p.yearOfBirth AS yearOfBirth,
       p.genderConceptId AS genderConceptId,
       collect(CASE WHEN x IS NULL THEN null ELSE {
         type: [l IN labels(x) WHERE l STARTS WITH 'OMOP'][0],
         id: coalesce(x.visitOccurrenceId, x.conditionOccurrenceId, x.measurementId,
                      x.drugExposureId, x.procedureOccurrenceId),
         date: coalesce(x.visitStartDate, x.conditionStartDate, x.measurementDate,
                        x.drugExposureStart, x.procedureDate),
         name: x.name,
         conceptId: coalesce(x.visitConceptId, x.conditionConceptId,
                             x.measurementConceptId, x.drugConceptId, x.procedureConceptId),
         sourceValue: coalesce(x.conditionSourceValue, x.measurementSourceValue,
                               x.drugSourceValue, x.procedureSourceValue),
         valueAsNumber: x.valueAsNumber,
         unit: x.unit
       } END) AS events`;

/** A Neo4j integer as a number; the CDM keys are 52 bits, so none loses precision. */
function plain(v: unknown): unknown {
  if (neo4j.isInt(v)) return (v as { toNumber(): number }).toNumber();
  if (Array.isArray(v)) return v.map(plain);
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>).map(([k, x]) => [
        k,
        plain(x),
      ]),
    );
  }
  return v;
}

/**
 * GET /omop/person/:id/timeline
 *
 * One OMOP person's rows in date order: visits, conditions, measurements,
 * drug exposures and procedures. `:id` is the person's `personId`, the CDM
 * key (ADR-098). The timeline is read from the OMOP layer only, never from the
 * FHIR records behind it: this is the research view.
 */
app.get(
  "/omop/person/:id/timeline",
  async (req: Request, res: Response, next: NextFunction) => {
    const personId = String(req.params.id);
    if (
      !/^\d{1,16}$/.test(personId) ||
      !Number.isSafeInteger(Number(personId))
    ) {
      res.status(400).json({
        error: "The person id is the OMOP personId, an integer (ADR-098)",
      });
      return;
    }
    // Art. 71 (ADR-062): the data plane serves research; persons who opted out are left out.
    const session = secondaryUseSession(getSession());
    try {
      const result = await session.run(TIMELINE_CYPHER, {
        personId: neo4j.int(personId),
      });

      if (result.records.length === 0) {
        res.status(404).json({ error: `OMOP Person ${personId} not found` });
        return;
      }

      const rec = result.records[0];
      const person = {
        personId: plain(rec.get("personId")),
        yearOfBirth: plain(rec.get("yearOfBirth")),
        genderConceptId: plain(rec.get("genderConceptId")),
      };
      const events = plain(rec.get("events")) as unknown[];

      res.json({ person, timeline: events });
      logTransferEvent(
        `/omop/person/${personId}/timeline`,
        "GET",
        req.headers["x-participant"] as string,
        200,
        events.length,
        auditContext(req, res),
      );
    } catch (err) {
      next(err);
    } finally {
      await session.close();
    }
  },
);
