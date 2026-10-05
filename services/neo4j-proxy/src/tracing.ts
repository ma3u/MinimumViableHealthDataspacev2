/**
 * OpenTelemetry traces and logs for the proxy (ADR-045 plane 1 decision 1, #418).
 *
 * Loaded before the app with `node --import ./dist/tracing.js dist/index.js`,
 * because instrumenting ESM needs the loader hook in place before express and
 * node:http are imported. Off unless OTEL_EXPORTER_OTLP_ENDPOINT is set, so a
 * deployment without a collector exports nothing and pays nothing.
 *
 * The caller's W3C traceparent continues the trace (the UI, or the EDC
 * services through their Java agent), and logger.ts writes the same trace_id
 * on every log line of the request.
 *
 * URLs never leave the process: `/fhir/Patient/<id>` carries a patient id, and
 * a query string can carry anything. scrubSpanAttributes() removes them before
 * export and keeps http.route, the pattern; the collector removes them again.
 *
 * Logs go out over OTLP too, where no collector reads the container's stdout
 * (Azure Container Apps sends stdout only to Log Analytics): logger.ts hands
 * every finished, redacted line to the log provider registered here.
 */
import { register } from "node:module";
import type { Attributes } from "@opentelemetry/api";

/** Span attributes that can hold a URL, a query string or a client address. */
export const SCRUBBED_ATTRIBUTES = [
  "url.full",
  "url.path",
  "url.query",
  "http.url",
  "http.target",
  "client.address",
  "network.peer.address",
  "network.peer.port",
  "net.peer.ip",
  "http.client_ip",
  "user_agent.original",
  "http.user_agent",
];

export function scrubSpanAttributes(attributes: Attributes): void {
  for (const key of SCRUBBED_ATTRIBUTES) delete attributes[key];
}

if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
  // Only express goes through the ESM hook. Wrapping every module breaks live
  // bindings: db.ts exports `let driver` and reassigns it, and through the
  // wrapper the proxy saw `driver` stay undefined and could not start.
  // node:http needs no hook; its instrumentation patches the shared prototype.
  register("@opentelemetry/instrumentation/hook.mjs", import.meta.url, {
    data: { include: ["express"] },
  });

  const [
    { NodeSDK },
    { OTLPTraceExporter },
    { OTLPLogExporter },
    { BatchLogRecordProcessor },
    { BatchSpanProcessor },
    { HttpInstrumentation },
    { ExpressInstrumentation, ExpressLayerType },
    { resourceFromAttributes },
    { ATTR_SERVICE_NAME },
  ] = await Promise.all([
    import("@opentelemetry/sdk-node"),
    import("@opentelemetry/exporter-trace-otlp-http"),
    import("@opentelemetry/exporter-logs-otlp-http"),
    import("@opentelemetry/sdk-logs"),
    import("@opentelemetry/sdk-trace-base"),
    import("@opentelemetry/instrumentation-http"),
    import("@opentelemetry/instrumentation-express"),
    import("@opentelemetry/resources"),
    import("@opentelemetry/semantic-conventions"),
  ]);

  const batch = new BatchSpanProcessor(new OTLPTraceExporter());
  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? "neo4j-proxy",
    }),
    spanProcessors: [
      {
        onStart: (span, ctx) => batch.onStart(span, ctx),
        onEnd: (span) => {
          scrubSpanAttributes(span.attributes as Attributes);
          batch.onEnd(span);
        },
        forceFlush: () => batch.forceFlush(),
        shutdown: () => batch.shutdown(),
      },
    ],
    // Registers the global log provider that logger.ts emits to.
    logRecordProcessors: [
      new BatchLogRecordProcessor({ exporter: new OTLPLogExporter() }),
    ],
    instrumentations: [
      new HttpInstrumentation({
        // Probes are most requests and no signal, as in the logs.
        ignoreIncomingRequestHook: (req) => req.url === "/health",
      }),
      // One span for the handler, not one per middleware (seven per request).
      new ExpressInstrumentation({
        ignoreLayersType: [ExpressLayerType.MIDDLEWARE],
      }),
    ],
  });
  sdk.start();
  process.once("SIGTERM", () => void sdk.shutdown());
}
