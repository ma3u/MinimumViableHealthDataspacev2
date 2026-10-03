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
  OLLAMA_MODEL,
  OLLAMA_URL,
  OPENAI_API_KEY,
  OPENAI_MODEL,
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
import "./error-handler.js";

async function main() {
  setDriver(
    neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD)),
  );

  // Verify primary SPE connectivity
  try {
    const info = await driver.getServerInfo();
    console.log(`[neo4j-proxy] Connected to Neo4j SPE-1 at ${info.address}`);
  } catch (err) {
    console.error("[neo4j-proxy] Failed to connect to Neo4j SPE-1:", err);
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
      console.log(`[neo4j-proxy] Connected to Neo4j SPE-2 at ${info2.address}`);
    } catch (err) {
      console.warn(
        "[neo4j-proxy] SPE-2 not available (federated queries disabled):",
        err,
      );
      setSpe2Driver(null);
    }
  } else {
    console.log(
      "[neo4j-proxy] SPE-2 not configured (set NEO4J_SPE2_URI to enable)",
    );
  }

  startDcpDiscoveryLoop();

  app.listen(PORT, () => {
    console.log(`[neo4j-proxy] Listening on port ${PORT}`);
    console.log(`[neo4j-proxy] Endpoints:`);
    console.log(`  GET  /health`);
    console.log(`  GET  /fhir/Patient`);
    console.log(`  GET  /fhir/Patient/:id/$everything`);
    console.log(`  POST /fhir/Bundle`);
    console.log(`  POST /omop/cohort`);
    console.log(`  GET  /omop/person/:id/timeline`);
    console.log(`  GET  /catalog/datasets`);
    console.log(`  GET  /catalog/datasets/:id`);
    console.log(`  POST /federated/query           (Phase 5)`);
    console.log(`  GET  /federated/stats            (Phase 5)`);
    console.log(`  POST /nlq                        (Phase 5c — Text2Cypher)`);
    console.log(`  GET  /nlq/templates              (Phase 5c)`);
    console.log(`  GET  /tck                        (TCK compliance probes)`);
    console.log(`  POST /trust-center/resolve       (Phase 18 — HDAB only)`);
    console.log(`  GET  /trust-center/audit         (Phase 18 — audit log)`);
    console.log(
      `  DELETE /trust-center/revoke/:id  (Phase 18 — HDAB revocation)`,
    );
    console.log(`  GET  /trust-center/status        (Phase 18 — TC status)`);
    if (spe2Driver) {
      console.log(`  ✅ Federated mode: 2 SPEs connected`);
    }
    if (OPENAI_API_KEY) {
      console.log(`  ✅ LLM: OpenAI ${OPENAI_MODEL}`);
    } else if (OLLAMA_URL) {
      console.log(`  ✅ LLM: Ollama ${OLLAMA_MODEL} at ${OLLAMA_URL}`);
    } else {
      console.log(`  ℹ️  LLM: disabled (template-only mode)`);
    }
  });

  // Graceful shutdown
  process.on("SIGTERM", async () => {
    console.log("[neo4j-proxy] SIGTERM received, shutting down...");
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
    console.error("[neo4j-proxy] Fatal:", err);
    process.exit(1);
  });
}

export { app, main, dcpDiscoveryTick };
