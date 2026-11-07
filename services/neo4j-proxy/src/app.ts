import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { requestLogging } from "./logger.js";
import { isRedispatched } from "./redispatch.js";

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------

export const app = express();
// The proxy sits behind one ingress (ACA's envoy, or Traefik on compose), so
// req.ip is the ingress unless the first X-Forwarded-For hop is trusted.
app.set("trust proxy", 1);
// First, so every handler runs inside the request's trace context (#418).
app.use(requestLogging());
// A transfer's FHIR bundle into an SPE (routes/spe-import.ts) is larger than
// the default 100 kB; every other route keeps the default.
const jsonDefault = express.json();
const jsonImport = express.json({ limit: "20mb" });
app.use((req: Request, res: Response, next: NextFunction) =>
  /^\/spe\/[^/]+\/import$/.test(req.path)
    ? jsonImport(req, res, next)
    : jsonDefault(req, res, next),
);

// ---------------------------------------------------------------------------
// Rate Limiting (Fix #3 — P0 production blocker)
// Prevents a single participant from exhausting the proxy under load.
// Limits are configurable via env vars for K8s deployment.
// ---------------------------------------------------------------------------

const RATE_LIMIT_WINDOW_MS = parseInt(
  process.env.RATE_LIMIT_WINDOW_MS ?? "60000",
  10,
); // 1 minute

/**
 * Who a limit counts against (#519). In order:
 *
 *   1. the user, when the UI names one in X-Caller (a hash of the session's
 *      user id, never the id itself): one person's budget;
 *   2. the participant in X-Participant, which the data planes and the
 *      crawler send and the UI sends alongside: an organisation's budget,
 *      ten times a person's, for callers that act for the whole organisation;
 *   3. the address behind the ingress.
 *
 * Until #519 the key was the client IP, and every request reaches the proxy
 * from a UI replica, so the whole platform shared one bucket of 20
 * analytical queries a minute. Per participant alone was measured next: 20
 * users of one organisation hit 100 a minute within seconds. The store is in
 * memory, per proxy replica, so each key gets its budget once per replica.
 */
const CALLER_HASH = /^[a-f0-9]{16,64}$/;

export function rateLimitKey(req: Request): string {
  const caller = req.header("x-caller");
  if (caller && CALLER_HASH.test(caller)) return `u:${caller}`;
  const participant = req.header("x-participant");
  if (participant && participant.length <= 256) return `p:${participant}`;
  return ipKeyGenerator(req.ip ?? "");
}

/** A person's budget, or an organisation's when no person is named. */
function budget(perUser: string, perParticipant: string, fallback: number) {
  const user = parseInt(process.env[perUser] ?? String(fallback), 10);
  const participant = parseInt(
    process.env[perParticipant] ?? String(fallback * 10),
    10,
  );
  return (req: Request) =>
    rateLimitKey(req).startsWith("u:") ? user : participant;
}

/** A pull's second pass through the app was counted by its first (#881). */
const countedAlready = (_req: Request, res: Response) => isRedispatched(res);

/** General limit: 100 requests per minute per user, 1,000 per participant */
export const generalLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: budget("RATE_LIMIT_MAX", "RATE_LIMIT_PARTICIPANT_MAX", 100),
  keyGenerator: rateLimitKey,
  skip: countedAlready,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests — please retry after 60 seconds." },
});

/** Strict limit for expensive query endpoints: 20 per minute per user, 200 per participant */
export const heavyLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: budget("RATE_LIMIT_HEAVY_MAX", "RATE_LIMIT_PARTICIPANT_HEAVY_MAX", 20),
  keyGenerator: rateLimitKey,
  skip: countedAlready,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Query rate limit exceeded — max 20 analytical requests per minute.",
  },
});

/**
 * The audit endpoint has its own limit: the connector reports every
 * negotiation and transfer state there, and a callback refused with 429 is an
 * audit record that may never arrive (ADR-045, #418).
 */
export const auditLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: parseInt(process.env.RATE_LIMIT_AUDIT_MAX ?? "1200", 10),
  keyGenerator: rateLimitKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Audit rate limit exceeded." },
});

/** Pull transfers on EDC 1.0 (routes/dataspace.ts). */
export const PULL_PATH = /^\/dataspace\/data(\/.*)?$/;

// The pull route applies the general limit itself, first in its chain, so that
// it visibly guards the token check; it is not counted here as well.
app.use((req: Request, res: Response, next: NextFunction) =>
  req.path === "/audit/dsp" || PULL_PATH.test(req.path)
    ? next()
    : generalLimiter(req, res, next),
);

// The audit recorder reports how much left the proxy (Art. 73(1)(e) logs say
// what was accessed and how much). res.json is wrapped once here so every
// handler's payload is measured without touching the handlers. A pull's second
// pass finds it wrapped already.
app.use((_req: Request, res: Response, next: NextFunction) => {
  if (isRedispatched(res)) return next();
  const original = res.json.bind(res);
  res.json = ((body: unknown) => {
    try {
      res.locals.responseBytes = Buffer.byteLength(JSON.stringify(body ?? ""));
    } catch {
      res.locals.responseBytes = undefined;
    }
    return original(body);
  }) as typeof res.json;
  next();
});
