import { type Request, type Response, type NextFunction } from "express";
import neo4j from "neo4j-driver";
import { MIN_COHORT_SIZE } from "../config.js";
import { driver, getSpeDrivers } from "../db.js";
import { app, heavyLimiter } from "../app.js";
import { auditContext, logTransferEvent } from "../audit.js";
import {
  OdrlScope,
  checkOdrlTemporal,
  checkReIdentification,
  logQueryAudit,
} from "../nlq/engine.js";

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
          res
            .status(403)
            .json({ error: temporalViolation, odrlEnforced: true });
          logQueryAudit(callerId, "(federated)", cypher, "federated", 0, true, {
            contributors: [],
            aggregateSuppressed: false,
            suppressionReason: null,
          });
          return;
        }
        if (checkReIdentification(cypher, scope)) {
          res.status(403).json({
            error:
              "Query blocked: potential re-identification prohibited by ODRL policy",
            odrlEnforced: true,
            policyIds: scope.policyIds,
          });
          logQueryAudit(callerId, "(federated)", cypher, "federated", 0, true, {
            contributors: [],
            aggregateSuppressed: false,
            suppressionReason: null,
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

      // Phase 26e (issue #8): contributor-side k-anonymity. A contributor
      // whose row count is non-zero but below minK is suppressed entirely,
      // and — because a missing contributor is itself identifying — the
      // global aggregate is suppressed with it.
      const suppressedContributors: string[] = [];
      if (minK > 0) {
        for (const r of allResults) {
          const rows = r.records.filter((rec) => !rec._error);
          if (rows.length > 0 && rows.length < minK) {
            suppressedContributors.push(r.source);
          }
        }
      }
      const aggregateSuppressed = suppressedContributors.length > 0;
      const suppressionReason = aggregateSuppressed
        ? "contributor_k_violation"
        : null;
      if (aggregateSuppressed) {
        filtered += merged.length;
        merged = [];
      }

      const sources = allResults.map((r) => r.source);
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

      logQueryAudit(
        callerId,
        "(federated)",
        cypher,
        "federated",
        merged.length,
        Boolean(scope),
        {
          contributors: sources,
          aggregateSuppressed,
          suppressionReason,
        },
      );

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
        auditContext(_req, res),
      );
    } catch (err) {
      next(err);
    }
  },
);
