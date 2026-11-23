import { type Request, type Response, type NextFunction } from "express";
import {
  app,
  generalLimiter,
  heavyLimiter,
  PULL_PATH,
  PUSH_SOURCE_PATH,
} from "../app.js";
import { logger } from "../logger.js";
import {
  DATASET_ROUTES,
  verifyDataspaceToken,
  type DataspaceGrant,
} from "../dataspace-token.js";
import {
  DataplaneNotConfiguredError,
  requireDataplane,
  verifyDatasetReadToken,
} from "../dataplane-token.js";
import {
  holdsPatientOrReference,
  pseudonymiseFhir,
  pseudonymKey,
} from "../pseudonymise.js";
import { markRedispatched } from "../redispatch.js";

// ---- Pull transfers on EDC 1.0 (#881) --------------------------------------
// The endpoint siglet hands a consumer for an HttpData-PULL transfer
// (jad/siglet-edc1.toml). The token decides which dataset is served; a path
// after /dataspace/data is appended to that dataset's route, as the 0.18 data
// plane did with proxyPath (e.g. /dataspace/data/<id>/$everything).
//
// ---- The dataset a push carries (ADR-095) -----------------------------------
// /dataspace/push-source is the same thing for the push data plane's
// dataset:read token: same route table, same limits, same hand-on. Only the
// issuer differs, so only the verifier differs.

type DatasetRoute = (typeof DATASET_ROUTES)[string];

// The general limit, by caller, comes first and guards the token check. The
// token is read before the heavy limit: the consumer it names acts for its
// organisation, so a pull counts against that participant's budget rather than
// the address it came from (every pull from the hub comes from a UI replica).
function authorise(verify: (token: string) => Promise<DataspaceGrant>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const header = req.header("authorization") ?? "";
    const token = header.replace(/^Bearer\s+/i, "");
    if (!token) {
      res.status(401).json({ error: "A dataspace access token is required" });
      return;
    }
    let grant;
    try {
      grant = await verify(token);
    } catch (err) {
      if (err instanceof DataplaneNotConfiguredError) {
        res.status(503).json({ error: err.message });
        return;
      }
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
    // The consumer's rate budget and audit name.
    req.headers["x-participant"] = grant.consumer;
    res.locals.datasetRoute = route;
    // What the token grants, for a route that answers a pull only and decides
    // by the consumer (routes/programmes.ts). res.locals is the server's own:
    // no header a caller sends can set it.
    res.locals.dataspaceGrant = grant;
    next();
  };
}

// Runs the request through the app again at the dataset's route. The log line
// and the rate limits counted it on this pass, so the second one skips them
// (finding 15).
function handOn(prefix: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const route = res.locals.datasetRoute as DatasetRoute;
    const suffix = req.path.slice(prefix.length);
    let query = req.originalUrl.includes("?")
      ? req.originalUrl.slice(req.originalUrl.indexOf("?"))
      : "";
    // A dataset that fixes parameters of its route: added when absent,
    // refused when the caller asks for another value. Without them the query
    // goes on exactly as it came.
    if (route.query) {
      const params = new URLSearchParams(query);
      for (const [name, value] of Object.entries(route.query)) {
        const asked = params.get(name);
        if (asked !== null && asked !== value) {
          const grant = res.locals.dataspaceGrant as DataspaceGrant;
          res.status(400).json({
            error: `Dataset ${grant.datasetId} is read with ${name}=${value}`,
          });
          return;
        }
        params.set(name, value);
      }
      query = `?${params.toString()}`;
    }
    req.url = route.path + suffix + query;
    delete req.headers.authorization;
    markRedispatched(res);
    (
      app as unknown as {
        handle: (q: Request, s: Response, n: NextFunction) => void;
      }
    ).handle(req, res, next);
  };
}

app.all(
  PULL_PATH,
  generalLimiter,
  authorise((token) => verifyDataspaceToken(token)),
  heavyLimiter,
  handOn("/dataspace/data"),
);

// Unset DATAPLANE_JWKS_URL answers 503 before any token is read
// (requireDataplane). A push is secondary use into an SPE whoever the
// consumer is, so what push-source answers is always pseudonymised here, on
// the holder's side (pseudonymise.ts, the UI's rule ported); the SPE inbox's
// identity refusal (spe-inbox.ts) stays as the second line. The pull above
// is not touched: the UI pseudonymises it by role.

/** In production without PATIENT_PSEUDONYM_KEY nothing is served (fail closed). */
function requirePseudonymKey(_req: Request, res: Response, next: NextFunction) {
  if (!pseudonymKey()) {
    res.status(503).json({ error: "no pseudonym key configured" });
    return;
  }
  next();
}

/**
 * A paged dataset's links point at its own route (/fhir/ecg-holter?...). The
 * data plane follows `next` relative to the proxy with a fresh token, so on
 * push-source they point at push-source, with the same query.
 */
export function linksToPushSource(body: unknown, routePath: string): unknown {
  const b = body as { resourceType?: unknown; link?: unknown } | null;
  if (!b || b.resourceType !== "Bundle" || !Array.isArray(b.link)) return body;
  const own = (url: unknown) =>
    typeof url === "string" &&
    (url === routePath ||
      url.startsWith(`${routePath}?`) ||
      url.startsWith(`${routePath}/`));
  if (!b.link.some((l: { url?: unknown }) => own(l?.url))) return body;
  return {
    ...b,
    link: b.link.map((l: { url?: unknown }) =>
      own(l?.url)
        ? {
            ...l,
            url: `/dataspace/push-source${String(l.url).slice(
              routePath.length,
            )}`,
          }
        : l,
    ),
  };
}

/**
 * Pseudonymises the dataset route's JSON answer before it leaves, every
 * Patient and every reference to one, a window without the Patient too. An
 * answer with neither goes out as the route made it; one that is not JSON
 * (res.send) is not touched. Its paging links are turned to push-source.
 */
function pseudonymiseAnswer(_req: Request, res: Response, next: NextFunction) {
  const json = res.json.bind(res);
  const route = res.locals.datasetRoute as DatasetRoute;
  res.json = ((body: unknown) => {
    const shown = holdsPatientOrReference(body)
      ? pseudonymiseFhir(body, { absentPatients: true })
      : body;
    return json(linksToPushSource(shown, route.path));
  }) as typeof res.json;
  next();
}

app.all(
  PUSH_SOURCE_PATH,
  generalLimiter,
  requireDataplane,
  requirePseudonymKey,
  authorise((token) => verifyDatasetReadToken(token)),
  heavyLimiter,
  pseudonymiseAnswer,
  handOn("/dataspace/push-source"),
);
