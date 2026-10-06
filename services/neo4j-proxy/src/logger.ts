/**
 * Structured logs for the proxy (ADR-045 plane 1, runbook Phase B step 8, #418).
 *
 * One JSON object per line on stdout, with `trace_id` from the caller's W3C
 * `traceparent` header (or a new one), so a collector can join log lines to a
 * trace and Loki can index them without regex parsing.
 *
 * What never reaches a log line (runbook section 4): patient identifiers, NLQ
 * question text, Cypher, FHIR or OMOP payloads, tokens, cookies, Authorization
 * headers. The first defence is not passing them; `REDACT_PATHS` is the second,
 * and the collector's redaction processor the third. Errors are reduced to
 * their first line and their stack frames, because a Neo4j error quotes the
 * query it failed on, and a Text2Cypher query can carry literals.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes } from "node:crypto";
import { isSpanContextValid, trace } from "@opentelemetry/api";
import { logs, SeverityNumber } from "@opentelemetry/api-logs";
import type { NextFunction, Request, Response } from "express";
import pino, { type DestinationStream, type Logger } from "pino";

const traceContext = new AsyncLocalStorage<{
  traceId: string;
  loadTest?: string;
}>();

/** Paths pino replaces with "[redacted]", at the top level and one level down. */
const SENSITIVE_KEYS = [
  "question",
  "cypher",
  "params",
  "parameters",
  "body",
  "patientId",
  "personId",
  "name",
  "birthDate",
  "address",
  "password",
  "token",
  "accessToken",
  "refreshToken",
  "authorization",
  "cookie",
  "apiKey",
];
export const REDACT_PATHS = [
  ...SENSITIVE_KEYS,
  ...SENSITIVE_KEYS.map((key) => `*.${key}`),
  'headers["x-api-key"]',
];

const TRACEPARENT = /^[\da-f]{2}-([\da-f]{32})-[\da-f]{16}-[\da-f]{2}$/;

/** The trace id from a W3C traceparent header, or a new random one. */
export function traceIdFrom(traceparent: string | undefined): string {
  const match = traceparent?.trim().toLowerCase().match(TRACEPARENT);
  if (match && match[1] !== "0".repeat(32)) return match[1];
  return randomBytes(16).toString("hex");
}

/** An error without its message body: Neo4j errors quote the failed query. */
function serializeError(err: unknown) {
  if (!(err instanceof Error)) return { message: String(err).split("\n")[0] };
  const withCode = err as Error & { code?: string };
  return {
    type: err.name,
    code: withCode.code,
    message: err.message.split("\n")[0].slice(0, 300),
    stack: (err.stack ?? "")
      .split("\n")
      .filter((line) => line.trimStart().startsWith("at "))
      .slice(0, 8)
      .map((line) => line.trim()),
  };
}

export function createLogger(
  destination?: DestinationStream,
  level = process.env.LOG_LEVEL ?? "info",
): Logger {
  return pino(
    {
      level,
      base: { service: "neo4j-proxy" },
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: { level: (label) => ({ level: label }) },
      serializers: { err: serializeError },
      redact: { paths: REDACT_PATHS, censor: "[redacted]" },
      mixin: () => {
        const ctx = traceContext.getStore();
        return ctx ? { trace_id: ctx.traceId } : {};
      },
    },
    destination,
  );
}

const SEVERITY: Record<string, SeverityNumber> = {
  trace: SeverityNumber.TRACE,
  debug: SeverityNumber.DEBUG,
  info: SeverityNumber.INFO,
  warn: SeverityNumber.WARN,
  error: SeverityNumber.ERROR,
  fatal: SeverityNumber.FATAL,
};

type Emit = (record: {
  body: string;
  severityNumber: SeverityNumber;
  severityText: string;
  timestamp?: number;
}) => void;

/**
 * A pino destination that sends each finished line as an OTLP log record.
 * It sees the line after pino's redaction, so it can carry nothing the
 * stdout line does not. The body is that JSON line unchanged, so a Loki
 * query that parses it (`| json`) reads the same fields whether the line
 * came from a container's stdout or over OTLP.
 */
export function otlpLineStream(
  emit: Emit = (record) => logs.getLogger("neo4j-proxy").emit(record),
): DestinationStream {
  return {
    write(chunk: string) {
      for (const line of chunk.split("\n")) {
        if (!line) continue;
        let level = "info";
        let timestamp: number | undefined;
        try {
          const parsed = JSON.parse(line) as { level?: string; time?: string };
          level = parsed.level ?? level;
          timestamp = parsed.time ? Date.parse(parsed.time) : undefined;
        } catch {
          // Not JSON: send it as it is, at info.
        }
        emit({
          body: line,
          severityNumber: SEVERITY[level] ?? SeverityNumber.INFO,
          severityText: level.toUpperCase(),
          timestamp,
        });
      }
    },
  };
}

/** stdout, and OTLP as well when tracing.ts exports (OTEL_EXPORTER_OTLP_ENDPOINT). */
function defaultDestination(): DestinationStream | undefined {
  if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT) return undefined;
  return pino.multistream([
    { level: "trace", stream: pino.destination(1) },
    { level: "trace", stream: otlpLineStream() },
  ]);
}

export const logger = createLogger(defaultDestination());

const LOAD_TEST_ID = /^[A-Za-z0-9._-]{1,64}$/;

/**
 * The load test run a request belongs to, from the X-Load-Test header k6
 * sends (#519): the same id tags the k6 metrics (`testid`), so a run's log
 * lines and its latency series can be read together later. Absent otherwise.
 */
export function loadTestField(req: Request): { load_test?: string } {
  const id = req.header("x-load-test");
  return id && LOAD_TEST_ID.test(id) ? { load_test: id } : {};
}

/**
 * The load test run of the request being served, if any. The audit chains
 * stamp it on every record a run writes (#571), so an auditor can tell the
 * synthetic traffic of a k6 run from real use: the chain cannot be pruned.
 */
export function currentLoadTest(): string | undefined {
  return traceContext.getStore()?.loadTest;
}

/**
 * Express middleware: runs the request inside its trace context and writes one
 * line when it finishes. The line names the route pattern, never the URL, so
 * `/fhir/Patient/:id` does not put a patient id in the log. Health probes are
 * not logged at all: they are most of the requests and none of the signal.
 */
export function requestLogging(log: Logger = logger) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.path === "/health") return next();
    // With tracing on (tracing.ts) the server span already continues the
    // caller's trace; without it, read traceparent here.
    const span = trace.getActiveSpan()?.spanContext();
    const traceId =
      span && isSpanContextValid(span)
        ? span.traceId
        : traceIdFrom(req.header("traceparent"));
    const started = process.hrtime.bigint();
    res.on("finish", () => {
      const route = req.route?.path
        ? `${req.baseUrl}${String(req.route.path)}`
        : "unmatched";
      const fields = {
        trace_id: traceId,
        method: req.method,
        route,
        status: res.statusCode,
        duration_ms: Number(process.hrtime.bigint() - started) / 1e6,
        ...loadTestField(req),
      };
      if (res.statusCode >= 500) log.error(fields, "request failed");
      else log.info(fields, "request");
    });
    const { load_test: loadTest } = loadTestField(req);
    traceContext.run({ traceId, ...(loadTest ? { loadTest } : {}) }, next);
  };
}
