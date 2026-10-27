import { type Request, type Response, type NextFunction } from "express";
import { getSession } from "../db.js";
import { app } from "../app.js";
import { auditContext, logTransferEvent } from "../audit.js";
import {
  CATALOG_CYPHER,
  HEALTHDCAT_AP_CONTEXT,
  toCatalog,
  toDataset,
  type DatasetRecord,
} from "../healthdcat-ap.js";

// ---- Catalog Endpoints (HealthDCAT-AP Release 8 JSON-LD, #700) -------------

function record(r: { get: (k: string) => unknown }): DatasetRecord {
  return {
    ds: (r.get("ds") ?? {}) as DatasetRecord["ds"],
    distributions: (r.get("distributions") ??
      []) as DatasetRecord["distributions"],
    publisher: (r.get("publisher") ?? null) as DatasetRecord["publisher"],
    contact: (r.get("contact") ?? null) as DatasetRecord["contact"],
    hdab: (r.get("hdab") ?? null) as DatasetRecord["hdab"],
    variables: (r.get("variables") ?? []) as DatasetRecord["variables"],
  };
}

/**
 * GET /catalog/datasets
 * Every dataset as a dcat:Catalog in HealthDCAT-AP Release 8 JSON-LD.
 */
app.get(
  "/catalog/datasets",
  async (req: Request, res: Response, next: NextFunction) => {
    const session = getSession();
    try {
      const result = await session.run(CATALOG_CYPHER, { datasetId: null });
      const catalog = toCatalog(result.records.map(record));

      res.setHeader("Content-Type", "application/ld+json");
      res.json(catalog);
      logTransferEvent(
        "/catalog/datasets",
        "GET",
        req.headers["x-participant"] as string,
        200,
        result.records.length,
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
 * GET /catalog/datasets/:id
 * One dataset in HealthDCAT-AP Release 8 JSON-LD.
 */
app.get(
  "/catalog/datasets/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    const session = getSession();
    try {
      const datasetId = req.params.id;
      const result = await session.run(CATALOG_CYPHER, { datasetId });

      if (result.records.length === 0) {
        res.status(404).json({ error: `Dataset ${datasetId} not found` });
        return;
      }

      res.setHeader("Content-Type", "application/ld+json");
      res.json({
        "@context": HEALTHDCAT_AP_CONTEXT,
        ...toDataset(record(result.records[0])),
      });
      logTransferEvent(
        `/catalog/datasets/${datasetId}`,
        "GET",
        req.headers["x-participant"] as string,
        200,
        1,
        auditContext(req, res),
      );
    } catch (err) {
      next(err);
    } finally {
      await session.close();
    }
  },
);
