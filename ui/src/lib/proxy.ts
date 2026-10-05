import { createHash } from "node:crypto";

/**
 * Base URL of services/neo4j-proxy (FHIR, OMOP, NLQ, federated, TCK).
 * The compose stack and ACA set NEO4J_PROXY_URL; the default is a proxy
 * started locally with `npm run dev` in services/neo4j-proxy.
 */
export const NEO4J_PROXY_URL =
  process.env.NEO4J_PROXY_URL ?? "http://localhost:9090";

const LOAD_TEST_ID = /^[A-Za-z0-9._-]{1,64}$/;

/**
 * Headers that carry a load test's run id on to the proxy (#519). k6 sends
 * X-Load-Test on every request; the proxy logs it as `load_test`, so a run's
 * server-side latency and errors can be read later next to its k6 metrics.
 * Empty for any other request.
 */
export function loadTestHeaders(req?: Request): Record<string, string> {
  const id = req?.headers?.get("x-load-test");
  return id && LOAD_TEST_ID.test(id) ? { "X-Load-Test": id } : {};
}

/**
 * Names the person behind a proxy call, so the proxy's rate limit counts per
 * user and not per organisation (#519): a SHA-256 of the session's user id,
 * shortened, never the id, the name or the email. Empty without a session.
 */
export function callerHeaders(session?: {
  user?: { id?: string | null };
}): Record<string, string> {
  const id = session?.user?.id;
  if (!id) return {};
  return {
    "X-Caller": createHash("sha256")
      .update(id, "utf8")
      .digest("hex")
      .slice(0, 32),
  };
}
