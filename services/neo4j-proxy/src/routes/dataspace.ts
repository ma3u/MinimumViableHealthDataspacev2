import { type Request, type Response, type NextFunction } from "express";
import { app } from "../app.js";
import { logger } from "../logger.js";
import { DATASET_ROUTES, verifyDataspaceToken } from "../dataspace-token.js";

// ---- Pull transfers on EDC 1.0 (#881) --------------------------------------
// The endpoint siglet hands a consumer for an HttpData-PULL transfer
// (jad/siglet-edc1.toml). The token decides which dataset is served; a path
// after /dataspace/data is appended to that dataset's route, as the 0.18 data
// plane did with proxyPath (e.g. /dataspace/data/<id>/$everything).

app.all(
  /^\/dataspace\/data(\/.*)?$/,
  async (req: Request, res: Response, next: NextFunction) => {
    const header = req.header("authorization") ?? "";
    const token = header.replace(/^Bearer\s+/i, "");
    if (!token) {
      res.status(401).json({ error: "A dataspace access token is required" });
      return;
    }
    let grant;
    try {
      grant = await verifyDataspaceToken(token);
    } catch (err) {
      logger.warn({ err: (err as Error).message }, "dataspace token refused");
      res
        .status(401)
        .json({ error: "The dataspace access token is not valid" });
      return;
    }
    const route = DATASET_ROUTES[grant.datasetId];
    if (!route) {
      res
        .status(404)
        .json({ error: `No data is served for dataset ${grant.datasetId}` });
      return;
    }
    if (req.method !== route.method) {
      res.status(405).json({
        error: `Dataset ${grant.datasetId} is read with ${route.method}`,
      });
      return;
    }
    const suffix = req.path.slice("/dataspace/data".length);
    const query = req.originalUrl.includes("?")
      ? req.originalUrl.slice(req.originalUrl.indexOf("?"))
      : "";
    req.url = route.path + suffix + query;
    // The consumer acts for its organisation: its rate budget and audit name.
    req.headers["x-participant"] = grant.consumer;
    delete req.headers.authorization;
    (
      app as unknown as {
        handle: (q: Request, s: Response, n: NextFunction) => void;
      }
    ).handle(req, res, next);
  },
);
