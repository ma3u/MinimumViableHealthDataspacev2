import { type NextFunction, type Request, type Response } from "express";
import { app } from "../app.js";
import { logger } from "../logger.js";
import { speStatus, syncSpeAudit } from "../spe-status.js";

// ---- The SPE workspaces for the administration (ADR-068, ADR-069, #774) -----

/**
 * GET /spe/status
 *
 * {environment, trustee, spes: [...], residualTrust}: each SPE as its
 * workspace recorded itself (the SpeAttestation node the loader writes), its
 * live patient count, and whether it answers at all; Trustee from the
 * configuration plus a reachability probe. The UI's GET /api/admin/spe
 * forwards this.
 *
 * Before answering, every SPE event the workspaces hold and the hub's audit
 * chain does not is appended to the chain `spe` (idempotent by event id).
 * The answer does not wait on that succeeding.
 */
app.get(
  "/spe/status",
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const { status, reads } = await speStatus();
      const appended = await syncSpeAudit(reads);
      if (appended.length > 0) {
        logger.info(
          { audit: { chain: "spe", appended: appended.length } },
          "SPE events appended to the audit chain",
        );
      }
      res.json(status);
    } catch (err) {
      next(err);
    }
  },
);
