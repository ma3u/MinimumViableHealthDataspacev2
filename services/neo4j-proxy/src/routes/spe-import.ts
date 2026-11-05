import { type NextFunction, type Request, type Response } from "express";
import { app } from "../app.js";
import { getSpeDrivers } from "../db.js";
import {
  ImportShapeError,
  readImportGraph,
  writeImport,
  type ImportRequest,
} from "../spe-import.js";

// ---- A transfer's data into an SPE workspace (#876) -------------------------

const SPE_IDS = new Set(["SPE-1", "SPE-2"]);
const DATASET_ID = /^[A-Za-z0-9._:@~-]{1,200}$/;

function workspace(speId: string) {
  return getSpeDrivers().find((s) => s.label === speId)?.driver ?? null;
}

/** 400 for a bad SPE or dataset id, 503 when that workspace is not connected. */
function checkTarget(res: Response, speId: string, datasetId: string) {
  if (!SPE_IDS.has(speId)) {
    res.status(400).json({ error: `Unknown SPE '${speId}' (SPE-1 or SPE-2)` });
    return null;
  }
  if (!DATASET_ID.test(datasetId)) {
    res.status(400).json({ error: "A plain dataset id is required" });
    return null;
  }
  const driver = workspace(speId);
  if (!driver) {
    res.status(503).json({
      error: `${speId} is not connected to the hub; start the workspace and try again`,
    });
    return null;
  }
  return driver;
}

const text = (v: unknown, max = 512) =>
  typeof v === "string" ? v.slice(0, max) : "";

/**
 * POST /spe/:speId/import
 *
 * Body {datasetId, transferId, agreementId, assetId, provider, consumer,
 * importedBy, pseudonymised, bundle}. The UI's
 * POST /api/transfers/[id]/import sends it after pulling the transfer's
 * data; answers {datasetId, speId, records, relationships, byType, importedAt}.
 */
app.post(
  "/spe/:speId/import",
  async (req: Request, res: Response, next: NextFunction) => {
    const speId = String(req.params.speId);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const datasetId = text(body.datasetId, 256);
    const driver = checkTarget(res, speId, datasetId);
    if (!driver) return;
    const meta: ImportRequest = {
      datasetId,
      speId,
      transferId: text(body.transferId),
      agreementId: text(body.agreementId),
      assetId: text(body.assetId),
      provider: text(body.provider),
      consumer: text(body.consumer),
      importedBy: text(body.importedBy),
      pseudonymised: body.pseudonymised === true,
    };
    const session = driver.session({ database: "neo4j" });
    try {
      res.json(await writeImport(session, meta, body.bundle));
    } catch (err) {
      if (err instanceof ImportShapeError) {
        res.status(422).json({ error: err.message });
        return;
      }
      next(err);
    } finally {
      await session.close();
    }
  },
);

/**
 * GET /spe/:speId/import/:datasetId/graph
 *
 * The imported dataset as the graph viewer draws it: the dataset, its
 * workspace, its records (at most GRAPH_RECORD_LIMIT) and their references.
 */
app.get(
  "/spe/:speId/import/:datasetId/graph",
  async (req: Request, res: Response, next: NextFunction) => {
    const speId = String(req.params.speId);
    const datasetId = String(req.params.datasetId);
    const driver = checkTarget(res, speId, datasetId);
    if (!driver) return;
    const session = driver.session({
      database: "neo4j",
      defaultAccessMode: "READ",
    });
    try {
      const graph = await readImportGraph(session, datasetId);
      if (!graph) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      res.json(graph);
    } catch (err) {
      next(err);
    } finally {
      await session.close();
    }
  },
);
