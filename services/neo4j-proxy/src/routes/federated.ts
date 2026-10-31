import { type Request, type Response, type NextFunction } from "express";
import neo4j from "neo4j-driver";
import { MIN_COHORT_SIZE } from "../config.js";
import { driver, getSpeDrivers, readSession } from "../db.js";
import { app, heavyLimiter } from "../app.js";
import { auditContext, logTransferEvent } from "../audit.js";
import {
  OdrlScope,
  checkOdrlTemporal,
  checkReIdentification,
} from "../nlq/engine.js";
import { appendQueryAudit, auditUnavailable } from "../audit-chain.js";
import { logger } from "../logger.js";
import { secondaryUseSession } from "../opt-out.js";
import { suppressSmallGroups } from "../k-anonymity.js";

/** A refused federated query is recorded before the refusal goes out. */
async function auditFederatedRefusal(
  callerId: string | undefined,
  cypher: string,
  reason: string,
): Promise<void> {
  try {
    await appendQueryAudit({
      participantId: callerId,
      question: "(federated)",
      cypher,
      method: "federated",
      resultCount: 0,
      odrlEnforced: true,
      outcome: "refused",
      reason,
      federated: {
        contributors: [],
        aggregateSuppressed: false,
        suppressionReason: null,
      },
    });
  } catch (err) {
    logger.error({ err }, "audit of a refused query failed");
  }
}

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
      const callerId = req.headers["x-participant"] as string | undefined;

      if (!cypher || typeof cypher !== "string") {
        res.status(400).json({ error: "Missing 'cypher' in request body" });
        return;
      }

      // Phase 26e (issue #8): caller-side ODRL — the caller's own odrlScope
      // is evaluated against the query before any contributor is contacted.
      const scope = req.body.odrlScope as OdrlScope | undefined;
      if (scope) {
        const temporalViolation = checkOdrlTemporal(scope);
        if (temporalViolation) {
          await auditFederatedRefusal(callerId, cypher, "ODRL temporal limit");
          res
            .status(403)
            .json({ error: temporalViolation, odrlEnforced: true });
          return;
        }
        if (checkReIdentification(cypher, scope)) {
          await auditFederatedRefusal(
            callerId,
            cypher,
            "ODRL re-identification prohibition",
          );
          res.status(403).json({
            error:
              "Query blocked: potential re-identification prohibited by ODRL policy",
            odrlEnforced: true,
            policyIds: scope.policyIds,
          });
          return;
        }
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
          // Art. 71 (ADR-062): each SPE answers without the persons who opted out.
          // Read-only: the database refuses a write the regex above misses.
          const session = secondaryUseSession(readSession(d), scope);
          try {
            // nosemgrep: cypher-built-from-request-input -- caller-supplied Cypher by design, in a read-only session; WRITE_PATTERN and checkReIdentification above
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

      // k-anonymity on both sides (issue #8): small groups and a
      // contributor below minK are suppressed (src/k-anonymity.ts).
      const totalRows = allResults.reduce((n, r) => n + r.records.length, 0);
      const {
        rows: merged,
        filtered,
        aggregateSuppressed,
        suppressionReason,
      } = minK > 0
        ? suppressSmallGroups(allResults, minK)
        : {
            rows: allResults.flatMap((r) => r.records),
            filtered: 0,
            aggregateSuppressed: false,
            suppressionReason: null,
          };

      const sources = allResults.map((r) => r.source);

      // Fail closed (ADR-045, #418): no record, no answer.
      try {
        await appendQueryAudit({
          participantId: callerId,
          question: "(federated)",
          cypher,
          method: "federated",
          resultCount: merged.length,
          odrlEnforced: Boolean(scope),
          outcome: "success",
          federated: {
            contributors: sources,
            aggregateSuppressed,
            suppressionReason,
          },
        });
      } catch (err) {
        auditUnavailable(res, err);
        return;
      }

      res.json({
        results: merged,
        sources,
        totalRows,
        filtered,
        speCount: spes.length,
        minKApplied: minK,
        aggregateSuppressed,
        suppressionReason,
      });

      logTransferEvent(
        "/federated/query",
        "POST",
        req.headers["x-participant"] as string,
        200,
        merged.length,
        auditContext(req, res),
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
          // Art. 71 (ADR-062): the statistics leave out the persons who opted out.
          const session = secondaryUseSession(d.session({ database: "neo4j" }));
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
        auditContext(_req, res),
      );
    } catch (err) {
      next(err);
    }
  },
);
