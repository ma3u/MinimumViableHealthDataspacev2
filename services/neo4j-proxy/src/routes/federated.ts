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
import {
  type AuditPermit,
  appendQueryAudit,
  auditPermits,
  auditUnavailable,
} from "../audit-chain.js";
import { refusedCypher } from "../cypher-guard.js";
import { logger } from "../logger.js";
import { secondaryUseSession } from "../opt-out.js";
import {
  combineCounts,
  suppressSmallCells,
  federatedAnswer,
  isRowLevelAboutPersons,
  withheldRowLevel,
} from "../k-anonymity.js";
import { noteSpeQueried } from "../spe-status.js";

/** A refused federated query is recorded before the refusal goes out. */
async function auditFederatedRefusal(
  callerId: string | undefined,
  cypher: string,
  reason: string,
  permits?: AuditPermit[],
): Promise<void> {
  try {
    await appendQueryAudit({
      participantId: callerId,
      permits,
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
          await auditFederatedRefusal(
            callerId,
            cypher,
            "ODRL temporal limit",
            auditPermits(scope),
          );
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
            auditPermits(scope),
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

      // Safety (#779, src/cypher-guard.ts): writes meet a read-only session
      // anyway; reads outside the graph (LOAD CSV, apoc.load.*) are refused
      // only here.
      const refused = refusedCypher(cypher);
      if (refused === "outside") {
        await auditFederatedRefusal(
          callerId,
          cypher,
          "reads outside the graph (#779)",
          auditPermits(scope),
        );
        res.status(403).json({
          error:
            "Reads outside the graph (LOAD CSV, apoc.load.*, dbms.*) are not permitted on the federated endpoint",
        });
        return;
      }
      if (refused === "write") {
        res.status(403).json({
          error: "Write operations not permitted on federated endpoint",
        });
        return;
      }

      const spes = getSpeDrivers();
      // A list of records about persons is never asked for (#1236, draft
      // Art. 18(2)(g)): it would be source data leaving the SPEs.
      if (isRowLevelAboutPersons(cypher)) {
        const withheld = withheldRowLevel(minK);
        try {
          await appendQueryAudit({
            participantId: callerId,
            question: "(federated)",
            cypher,
            method: "federated",
            resultCount: 0,
            odrlEnforced: Boolean(scope),
            outcome: "success",
            permits: auditPermits(scope),
            federated: {
              contributors: [],
              aggregateSuppressed: true,
              suppressionReason: withheld.suppressionReason,
            },
          });
        } catch (err) {
          auditUnavailable(res, err);
          return;
        }
        res.json({
          results: [],
          sources: [],
          totalRows: 0,
          filtered: 0,
          speCount: spes.length,
          minKApplied: minK,
          aggregateSuppressed: true,
          suppressionReason: withheld.suppressionReason,
        });
        return;
      }
      // When each workspace was last asked, for the idle stop (ADR-072).
      noteSpeQueried(spes.map((s) => s.label));
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
          } catch (err) {
            // The caller learns which SPE failed, not why: a driver error
            // quotes the query and the address it failed on (#1029).
            logger.error({ err, spe: label }, "federated SPE query failed");
            allResults.push({
              source: label,
              records: [{ _source: label, _error: "SPE query failed" }],
            });
          } finally {
            await session.close();
          }
        }),
      );

      // Only aggregates leave the federation (#1236, draft Art. 18(2)(g)):
      // a list of records about persons is withheld, and each SPE's counts
      // are masked on their own before they are put side by side.
      const totalRows = allResults.reduce((n, r) => n + r.records.length, 0);
      allResults.sort((a, b) => a.source.localeCompare(b.source));
      const {
        rows: merged,
        filtered,
        aggregateSuppressed,
        suppressionReason,
      } = federatedAnswer(cypher, allResults, minK);

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
          permits: auditPermits(scope),
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
 *
 * Feasibility counts (ADR-094, #1123): every count below k leaves as "<k",
 * per SPE and in the totals, and a total never gives a suppressed SPE count
 * back (combineCounts). k is the server minimum (MIN_COHORT_SIZE) unless the
 * caller asks for more with ?minK=, as on /federated/query; never less.
 */
app.get(
  "/federated/stats",
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const requestedMinK = Number(_req.query.minK);
      const minK = Math.max(
        Number.isFinite(requestedMinK) ? requestedMinK : MIN_COHORT_SIZE,
        MIN_COHORT_SIZE,
      );
      const spes = getSpeDrivers();
      noteSpeQueried(spes.map((s) => s.label));
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

      // Each SPE's counts as it may release them: a count below k is "<k".
      let filtered = 0;
      const cells = (rows: Array<Record<string, unknown>>) => {
        const out = suppressSmallCells(rows, minK);
        filtered += out.filtered;
        return out.rows;
      };
      const perSpe = stats.map((s) => ({
        source: s.source,
        ...cells([
          {
            patients: s.patients,
            encounters: s.encounters,
            conditions: s.conditions,
            observations: s.observations,
          },
        ])[0],
        topConditions: cells(s.topConditions),
        genderBreakdown: cells(s.genderBreakdown),
      }));

      // The totals across SPEs, which must not give a suppressed count back.
      const combine = (counts: number[]) => {
        const c = combineCounts(counts, minK);
        if (c !== counts.reduce((n, v) => n + v, 0)) filtered += 1;
        return c;
      };
      const totals = {
        patients: combine(stats.map((s) => s.patients)),
        encounters: combine(stats.map((s) => s.encounters)),
        conditions: combine(stats.map((s) => s.conditions)),
        observations: combine(stats.map((s) => s.observations)),
      };

      // Merge top conditions across SPEs
      const condMap = new Map<string, number[]>();
      stats.forEach((s) =>
        s.topConditions.forEach(({ name, count }) =>
          condMap.set(name, [...(condMap.get(name) ?? []), count]),
        ),
      );
      const ranked = (c: number | string) => (typeof c === "number" ? c : 0);
      const aggregatedConditions = Array.from(condMap.entries())
        .map(([name, counts]) => ({ name, count: combine(counts) }))
        .sort((a, b) => ranked(b.count) - ranked(a.count))
        .slice(0, 10);

      // Merge gender breakdown
      const genderMap = new Map<string, number[]>();
      stats.forEach((s) =>
        s.genderBreakdown.forEach(({ gender, count }) =>
          genderMap.set(gender, [...(genderMap.get(gender) ?? []), count]),
        ),
      );
      const aggregatedGenders = Array.from(genderMap.entries()).map(
        ([gender, counts]) => ({ gender, count: combine(counts) }),
      );

      res.json({
        speCount: spes.length,
        totals,
        aggregatedConditions,
        aggregatedGenders,
        perSpe,
        minKApplied: minK,
        filtered,
        suppressionReason: filtered > 0 ? "small_cells" : null,
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
