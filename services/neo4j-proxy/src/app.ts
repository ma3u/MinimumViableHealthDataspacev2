import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { requestLogging } from "./logger.js";

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------

export const app = express();
// The proxy sits behind one ingress (ACA's envoy, or Traefik on compose), so
// req.ip is the ingress unless the first X-Forwarded-For hop is trusted.
app.set("trust proxy", 1);
// First, so every handler runs inside the request's trace context (#418).
app.use(requestLogging());
app.use(express.json());

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
 * Who a limit counts against: the participant named in X-Participant, which
 * the UI, the data planes and the crawler send on every call. Until #519
 * the key was the client IP, and every request reaches the proxy from a UI
 * replica, so all users of the platform shared one bucket of 20 analytical
 * queries a minute. A call without the header counts against the IP behind
 * the ingress. The store is in memory, per proxy replica, so a participant
 * gets the limit once per replica.
 */
export function rateLimitKey(req: Request): string {
  const participant = req.header("x-participant");
  if (participant && participant.length <= 256) return `p:${participant}`;
  return ipKeyGenerator(req.ip ?? "");
}

/** General limit: 100 requests per minute per participant */
const generalLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: parseInt(process.env.RATE_LIMIT_MAX ?? "100", 10),
  keyGenerator: rateLimitKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests — please retry after 60 seconds." },
});

/** Strict limit for expensive query endpoints: 20 requests per minute per participant */
export const heavyLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: parseInt(process.env.RATE_LIMIT_HEAVY_MAX ?? "20", 10),
  keyGenerator: rateLimitKey,
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

app.use((req: Request, res: Response, next: NextFunction) =>
  req.path === "/audit/dsp" ? next() : generalLimiter(req, res, next),
);

// The audit recorder reports how much left the proxy (Art. 73(1)(e) logs say
// what was accessed and how much). res.json is wrapped once here so every
// handler's payload is measured without touching the handlers.
app.use((_req: Request, res: Response, next: NextFunction) => {
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
