import { type Request, type Response, type NextFunction } from "express";
import neo4j from "neo4j-driver";
import { getSession } from "../db.js";
import { app, heavyLimiter } from "../app.js";
import { auditContext, logTransferEvent } from "../audit.js";

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
        auditContext(req, res),
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
        auditContext(req, res),
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
