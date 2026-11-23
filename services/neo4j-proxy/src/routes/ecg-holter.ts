import { type Request, type Response } from "express";
import { app } from "../app.js";
import { auditContext, logTransferEvent } from "../audit.js";
import {
  ECG_DATASET_PATH,
  holterWindow,
  parseHolterQuery,
} from "../ecg-holter.js";

// ---- A synthetic long-term ECG, window by window (ADR-095) -------------------

/**
 * GET /fhir/ecg-holter?offsetSeconds=0&seconds=60&durationSeconds=86400&stripSeconds=30
 *
 * One window of a synthetic 24 hour Holter recording as a FHIR searchset,
 * one Observation per strip with two leads as valueSampledData, `next` while
 * more follow. Computed, never read from a database (ecg-holter.ts). The
 * dataset "ecg-holter-stream" is read with it.
 */
app.get(ECG_DATASET_PATH, (req: Request, res: Response) => {
  const query = parseHolterQuery(req.query as Record<string, unknown>);
  if ("error" in query) {
    res.status(400).json({ error: query.error });
    return;
  }
  const bundle = holterWindow(query);
  res.setHeader("Content-Type", "application/fhir+json");
  res.json(bundle);
  logTransferEvent(
    ECG_DATASET_PATH,
    "GET",
    req.headers["x-participant"] as string,
    200,
    (bundle.entry as unknown[]).length,
    auditContext(req, res),
  );
});
