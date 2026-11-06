import { type NextFunction, type Request, type Response } from "express";
import { app } from "../app.js";
import {
  SPE_CONNECT_MAX_INTERVAL_MS,
  SPE_CONNECT_TIMEOUT_MS,
  SPE_READ_TIMEOUT_MS,
} from "../config.js";
import { getSpeDrivers } from "../db.js";
import { NoAnswerError, noteSpeQueried, withTimeout } from "../spe-status.js";
import {
  AlreadyImportedError,
  ImportShapeError,
  readExisting,
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

/**
 * When to ask again about a workspace that does not answer. The proxy cannot
 * see ARM (the UI asks it, ADR-072); within this the background connect has
 * tried again (SPE_CONNECT_MAX_INTERVAL_MS).
 */
const RETRY_AFTER = String(Math.round(SPE_CONNECT_MAX_INTERVAL_MS / 1000));

/** The driver's codes for a workspace it cannot reach: stopped, or still starting. */
const UNREACHABLE_CODES = new Set(["ServiceUnavailable", "SessionExpired"]);

function notAnswering(err: unknown): boolean {
  return (
    err instanceof NoAnswerError ||
    UNREACHABLE_CODES.has(String((err as { code?: unknown } | null)?.code))
  );
}

/** 503 with Retry-After: the caller is told to come back, not that the proxy failed. */
function unavailable(res: Response, error: string) {
  res.status(503).set("Retry-After", RETRY_AFTER).json({ error });
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
    unavailable(
      res,
      `${speId} is not connected to the hub; start the workspace and try again`,
    );
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
      const written = await writeImport(
        session,
        meta,
        body.bundle,
        undefined,
        body.overwrite === true,
      );
      // An import is use: the idle stop (ADR-072) counts it as a query.
      noteSpeQueried([speId]);
      res.json(written);
    } catch (err) {
      if (err instanceof ImportShapeError) {
        res.status(422).json({ error: err.message });
        return;
      }
      if (err instanceof AlreadyImportedError) {
        res.status(409).json({ error: err.message, existing: err.existing });
        return;
      }
      if (notAnswering(err)) {
        unavailable(res, `${speId} does not answer; it may be starting`);
        return;
      }
      next(err);
    } finally {
      await session.close();
    }
  },
);

/**
 * GET /spe/imports?datasetIds=a,b&skip=SPE-2
 *
 * The duplicate check: which of these datasets each connected SPE holds,
 * with when and how many records. {imports: [...], unreachable: [speIds]}.
 * The workspaces are asked side by side, each for at most
 * SPE_CONNECT_TIMEOUT_MS; one that does not answer by then is unreachable.
 * `skip` names workspaces the UI knows are stopped (it asks ARM, ADR-072):
 * they are reported unreachable without waiting.
 */
app.get(
  "/spe/imports",
  async (req: Request, res: Response, next: NextFunction) => {
    const datasetIds = String(req.query.datasetIds ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => DATASET_ID.test(s))
      .slice(0, 100);
    if (!datasetIds.length) {
      res.status(400).json({ error: "datasetIds is required" });
      return;
    }
    const skip = new Set(
      String(req.query.skip ?? "")
        .split(",")
        .map((s) => s.trim()),
    );
    try {
      const reads = await Promise.all(
        getSpeDrivers()
          .filter(({ label }) => SPE_IDS.has(label))
          .map(async ({ label, driver }) => {
            if (skip.has(label)) return { label, held: null };
            const session = driver.session({
              database: "neo4j",
              defaultAccessMode: "READ",
            });
            try {
              const held = await withTimeout(
                readExisting(session, label, datasetIds),
                SPE_CONNECT_TIMEOUT_MS,
                `${label} imports`,
              );
              return { label, held };
            } catch {
              return { label, held: null };
            } finally {
              // A session on a hung connection may not close either.
              await withTimeout(
                session.close(),
                2000,
                "SPE session close",
              ).catch(() => undefined);
            }
          }),
      );
      res.json({
        imports: reads.flatMap((r) => r.held ?? []),
        unreachable: reads.filter((r) => !r.held).map((r) => r.label),
      });
    } catch (err) {
      next(err);
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
      const graph = await withTimeout(
        readImportGraph(session, datasetId),
        SPE_READ_TIMEOUT_MS,
        `${speId} import graph`,
      );
      if (!graph) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      res.json(graph);
    } catch (err) {
      if (notAnswering(err)) {
        unavailable(res, `${speId} does not answer; it may be starting`);
        return;
      }
      next(err);
    } finally {
      await withTimeout(session.close(), 2000, "SPE session close").catch(
        () => undefined,
      );
    }
  },
);
