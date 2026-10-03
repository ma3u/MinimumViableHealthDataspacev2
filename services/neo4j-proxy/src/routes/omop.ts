import { type Request, type Response, type NextFunction } from "express";
import neo4j from "neo4j-driver";
import { getSession } from "../db.js";
import { app, heavyLimiter } from "../app.js";
import { auditContext, logTransferEvent } from "../audit.js";

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
        auditContext(req, res),
      );
    } catch (err) {
      next(err);
    } finally {
      await session.close();
    }
  },
);
