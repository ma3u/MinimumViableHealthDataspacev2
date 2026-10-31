import { type NextFunction, type Request, type Response } from "express";
import { app } from "../app.js";
import { speStatus } from "../spe-status.js";

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
 * Read only. The writes that follow from what the workspaces hold (their
 * events onto the audit chain `spe`, the hub's Art. 71 opt-outs into them)
 * are the SPE sync's, on its timer (spe-status.ts, runSpeSync), so a caller
 * of this route never waits on a write and never causes one.
 */
app.get(
  "/spe/status",
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const { status } = await speStatus();
      res.json(status);
    } catch (err) {
      next(err);
    }
  },
);
