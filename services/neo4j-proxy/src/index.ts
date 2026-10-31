/**
 * Neo4j Query Proxy — ADR-2 Implementation
 *
 * Bridges DCore data planes to the Neo4j 5-layer health knowledge graph.
 * Translates HTTP requests into Cypher queries and serialises results as:
 *   - FHIR R4 Bundle JSON      (dataplane-fhir)
 *   - OMOP CDM JSON / CSV      (dataplane-omop)
 *   - HealthDCAT-AP JSON-LD     (federated catalog)
 *
 * Security: Only accepts requests from DCore data plane containers on the
 * Docker network. Authorisation is handled upstream by the EDC-V control
 * plane's contract enforcement layer.
 */

import neo4j, { type Driver } from "neo4j-driver";
import {
  NEO4J_PASSWORD,
  NEO4J_SPE1_PASSWORD,
  NEO4J_SPE1_URI,
  NEO4J_SPE1_USER,
  NEO4J_SPE2_PASSWORD,
  NEO4J_SPE2_URI,
  NEO4J_SPE2_USER,
  NEO4J_SPE_CA_CERT,
  NEO4J_SPE_CA_FILE,
  NEO4J_URI,
  NEO4J_USER,
  OLLAMA_URL,
  OPENAI_API_KEY,
  PORT,
  SPE_CONNECT_INTERVAL_MS,
  SPE_CONNECT_MAX_INTERVAL_MS,
  SPE_CONNECT_TIMEOUT_MS,
} from "./config.js";
import {
  connectSpe,
  driver,
  setDriver,
  setSpe1Driver,
  setSpe1Workspace,
  setSpe2Driver,
  spe1Driver,
  spe2Driver,
  workspaceDriverOptions,
} from "./db.js";
import { app } from "./app.js";
import { dcpDiscoveryTick, startDcpDiscoveryLoop } from "./dcp-discovery.js";

// Route modules register on the shared app in the original order; the
// error handler comes last, as it did when everything lived in this file.
import "./routes/ops.js";
import "./routes/fhir.js";
import "./routes/omop.js";
import "./routes/catalog.js";
import "./routes/federated.js";
import "./routes/nlq.js";
import "./routes/tasks.js";
import "./routes/tck.js";
import "./routes/trust-center.js";
import "./routes/dsp-audit.js";
import "./routes/spe.js";
import "./error-handler.js";
import { logger } from "./logger.js";
import { startSpeSync } from "./spe-status.js";

async function main() {
  setDriver(
    neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD)),
  );

  // Verify primary SPE connectivity
  try {
    const info = await driver.getServerInfo();
    logger.info({ server: info.address }, "connected to Neo4j SPE-1");
  } catch (err) {
    logger.error({ err }, "Failed to connect to Neo4j SPE-1");
    process.exit(1);
  }

  // The SPE workspaces (ADR-069): SPE-1 only when NEO4J_SPE1_URI makes it one,
  // SPE-2 when NEO4J_SPE2_URI is set. Connected in the background, never
  // awaited: the proxy listens and answers from the hub whatever they do,
  // and federates over each one as soon as it answers.
  setSpe1Workspace(Boolean(NEO4J_SPE1_URI));
  startWorkspace(
    "SPE-1",
    NEO4J_SPE1_URI,
    NEO4J_SPE1_USER,
    NEO4J_SPE1_PASSWORD,
    setSpe1Driver,
  );
  startWorkspace(
    "SPE-2",
    NEO4J_SPE2_URI,
    NEO4J_SPE2_USER,
    NEO4J_SPE2_PASSWORD,
    setSpe2Driver,
  );
  startSpeSync();

  startDcpDiscoveryLoop();

  app.listen(PORT, () => {
    // One line, not the 25-line endpoint banner it replaces: every replica
    // start billed those lines, and the routes are in the OpenAPI spec.
    logger.info(
      {
        port: PORT,
        federated: Boolean(spe2Driver),
        spe1Workspace: Boolean(NEO4J_SPE1_URI),
        llm: OPENAI_API_KEY ? "openai" : OLLAMA_URL ? "ollama" : "none",
      },
      "listening",
    );
  });

  // Graceful shutdown
  process.on("SIGTERM", async () => {
    logger.info("SIGTERM received, shutting down");
    await driver.close();
    if (spe1Driver) await spe1Driver.close();
    if (spe2Driver) await spe2Driver.close();
    process.exit(0);
  });
}

/**
 * Starts connecting one workspace and returns at once. Each try gives up
 * after SPE_CONNECT_TIMEOUT_MS; the tries go on for as long as the proxy
 * runs, 15 s apart at first, up to 60 s. Logged when it fails the first time
 * and when it connects, not per try.
 */
export function startWorkspace(
  label: "SPE-1" | "SPE-2",
  uri: string | undefined,
  user: string,
  password: string,
  set: (d: Driver) => void,
): void {
  if (!uri) {
    logger.info(
      label === "SPE-1"
        ? "SPE-1 is the hub graph (set NEO4J_SPE1_URI for a workspace)"
        : "SPE-2 not configured (set NEO4J_SPE2_URI to enable)",
    );
    return;
  }
  const opts = workspaceDriverOptions(uri, {
    pem: NEO4J_SPE_CA_CERT,
    file: NEO4J_SPE_CA_FILE,
  });
  const config = { ...opts.config, connectionTimeout: SPE_CONNECT_TIMEOUT_MS };
  const create = () =>
    neo4j.driver(opts.uri, neo4j.auth.basic(user, password), config);
  void connectSpe(
    {
      create,
      attempts: Number.POSITIVE_INFINITY,
      intervalMs: SPE_CONNECT_INTERVAL_MS,
      maxIntervalMs: SPE_CONNECT_MAX_INTERVAL_MS,
      timeoutMs: SPE_CONNECT_TIMEOUT_MS,
      onConnected: (server, attempt) =>
        logger.info(
          { server, attempt, tls: Boolean(opts.config.encrypted) },
          `connected to Neo4j ${label}`,
        ),
      onFirstFailure: (err) =>
        logger.warn(
          { err },
          `${label} not answering yet; federated queries go without it, retrying in the background`,
        ),
    },
    set,
  );
}

// Only auto-start when run directly (not imported for testing)
const isMainModule =
  typeof process.env.VITEST === "undefined" && process.env.NODE_ENV !== "test";
if (isMainModule) {
  main().catch((err) => {
    logger.error({ err }, "Fatal");
    process.exit(1);
  });
}

export { app, main, dcpDiscoveryTick };
