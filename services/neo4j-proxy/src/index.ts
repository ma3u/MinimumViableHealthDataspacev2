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

import neo4j from "neo4j-driver";
import {
  NEO4J_PASSWORD,
  NEO4J_SPE2_PASSWORD,
  NEO4J_SPE2_URI,
  NEO4J_SPE2_USER,
  NEO4J_URI,
  NEO4J_USER,
  OLLAMA_URL,
  OPENAI_API_KEY,
  PORT,
} from "./config.js";
import { driver, setDriver, setSpe2Driver, spe2Driver } from "./db.js";
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
import "./error-handler.js";
import { logger } from "./logger.js";

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

  // Phase 5: Connect to optional second SPE
  if (NEO4J_SPE2_URI) {
    try {
      const spe2 = neo4j.driver(
        NEO4J_SPE2_URI,
        neo4j.auth.basic(NEO4J_SPE2_USER, NEO4J_SPE2_PASSWORD),
      );
      setSpe2Driver(spe2);
      const info2 = await spe2.getServerInfo();
      logger.info({ server: info2.address }, "connected to Neo4j SPE-2");
    } catch (err) {
      logger.warn({ err }, "SPE-2 not available (federated queries disabled)");
      setSpe2Driver(null);
    }
  } else {
    logger.info("SPE-2 not configured (set NEO4J_SPE2_URI to enable)");
  }

  startDcpDiscoveryLoop();

  app.listen(PORT, () => {
    // One line, not the 25-line endpoint banner it replaces: every replica
    // start billed those lines, and the routes are in the OpenAPI spec.
    logger.info(
      {
        port: PORT,
        federated: Boolean(spe2Driver),
        llm: OPENAI_API_KEY ? "openai" : OLLAMA_URL ? "ollama" : "none",
      },
      "listening",
    );
  });

  // Graceful shutdown
  process.on("SIGTERM", async () => {
    logger.info("SIGTERM received, shutting down");
    await driver.close();
    if (spe2Driver) await spe2Driver.close();
    process.exit(0);
  });
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
