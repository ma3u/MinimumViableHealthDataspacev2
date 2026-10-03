import { type Request, type Response } from "express";
import neo4j from "neo4j-driver";
import { driver, getSession } from "../db.js";
import { app } from "../app.js";

// ---- Health check ---------------------------------------------------------

app.get("/health", async (_req: Request, res: Response) => {
  try {
    const result = await driver.getServerInfo();
    res.json({ status: "ok", neo4j: result.address });
  } catch (err) {
    res.status(503).json({ status: "error", message: String(err) });
  }
});

// ---- Phase 26 diagnostics ------------------------------------------------
// Public, read-only summaries so we can verify the federated-discovery
// loop (crawler targets, federated datasets, NLQ glossary rows) without
// az CLI access or cypher-shell. No sensitive data leaves Neo4j.
app.get("/debug/phase26", async (_req: Request, res: Response) => {
  const session = getSession();
  try {
    const targets = await session.run(`
      MATCH (p:Participant)
      WHERE p.source IN ['dcp','business-wallet','private-wallet','seed']
        AND p.dspCatalogUrl IS NOT NULL
        AND coalesce(p.crawlerEnabled, true) = true
      RETURN count(p) AS targetCount
    `);
    const participants = await session.run(
      "MATCH (p:Participant) RETURN count(p) AS total, count(p.source) AS withSource, count(p.dspCatalogUrl) AS withDsp",
    );
    const federated = await session.run(`
      MATCH (d:HealthDataset)
      RETURN count(d) AS totalDatasets,
             count(CASE WHEN d.source = 'federated' THEN 1 END) AS federatedDatasets
    `);
    const glossary = await session.run(
      "MATCH (g:NlqGlossary) RETURN count(g) AS total, collect(DISTINCT g.kind) AS kinds",
    );
    res.json({
      crawlerTargetCount:
        targets.records[0]?.get("targetCount")?.toNumber?.() ?? 0,
      participants: {
        total: participants.records[0]?.get("total")?.toNumber?.() ?? 0,
        withSource:
          participants.records[0]?.get("withSource")?.toNumber?.() ?? 0,
        withDspCatalogUrl:
          participants.records[0]?.get("withDsp")?.toNumber?.() ?? 0,
      },
      healthDatasets: {
        total: federated.records[0]?.get("totalDatasets")?.toNumber?.() ?? 0,
        federated:
          federated.records[0]?.get("federatedDatasets")?.toNumber?.() ?? 0,
      },
      nlqGlossary: {
        total: glossary.records[0]?.get("total")?.toNumber?.() ?? 0,
        kinds: glossary.records[0]?.get("kinds") ?? [],
      },
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  } finally {
    await session.close();
  }
});
