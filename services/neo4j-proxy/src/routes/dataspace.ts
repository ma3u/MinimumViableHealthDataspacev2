import { type Request, type Response, type NextFunction } from "express";
import { app, heavyLimiter } from "../app.js";
import { logger } from "../logger.js";
import { DATASET_ROUTES, verifyDataspaceToken } from "../dataspace-token.js";
import { markRedispatched } from "../redispatch.js";

// ---- Pull transfers on EDC 1.0 (#881) --------------------------------------
// The endpoint siglet hands a consumer for an HttpData-PULL transfer
// (jad/siglet-edc1.toml). The token decides which dataset is served; a path
// after /dataspace/data is appended to that dataset's route, as the 0.18 data
// plane did with proxyPath (e.g. /dataspace/data/<id>/$everything).

type DatasetRoute = (typeof DATASET_ROUTES)[string];

// The token is read before the heavy limit: the consumer it names acts for its
// organisation, so a pull counts against that participant's budget rather than
// the address it came from (every pull from the hub comes from a UI replica).
async function authorise(req: Request, res: Response, next: NextFunction) {
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
    res.status(401).json({ error: "The dataspace access token is not valid" });
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
  // The consumer's rate budget and audit name.
  req.headers["x-participant"] = grant.consumer;
  res.locals.datasetRoute = route;
  next();
}

// Runs the request through the app again at the dataset's route. The log line
// and the rate limits counted it on this pass, so the second one skips them
// (finding 15).
function handOn(req: Request, res: Response, next: NextFunction) {
  const route = res.locals.datasetRoute as DatasetRoute;
  const suffix = req.path.slice("/dataspace/data".length);
  const query = req.originalUrl.includes("?")
    ? req.originalUrl.slice(req.originalUrl.indexOf("?"))
    : "";
  req.url = route.path + suffix + query;
  delete req.headers.authorization;
  markRedispatched(res);
  (
    app as unknown as {
      handle: (q: Request, s: Response, n: NextFunction) => void;
    }
  ).handle(req, res, next);
}

app.all(/^\/dataspace\/data(\/.*)?$/, authorise, heavyLimiter, handOn);
