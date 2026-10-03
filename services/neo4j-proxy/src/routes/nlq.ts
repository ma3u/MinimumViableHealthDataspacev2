import { type Request, type Response, type NextFunction } from "express";
import neo4j from "neo4j-driver";
import { runGraphRag, type GraphRagTraceStage } from "../graphrag.js";
import {
  ANTHROPIC_API_KEY,
  AZURE_OPENAI_API_KEY,
  AZURE_OPENAI_GPT4O_URL,
  OLLAMA_URL,
  OPENAI_API_KEY,
} from "../config.js";
import { driver, getSession, getSpeDrivers, spe2Driver } from "../db.js";
import { app } from "../app.js";
import { auditContext, logTransferEvent } from "../audit.js";
import {
  AdverseEventContext,
  CypherSection,
  GRAPH_LAYER_META,
  GraphLayer,
  OdrlScope,
  QUERY_TEMPLATES,
  checkOdrlTemporal,
  checkReIdentification,
  revealsPatientIdentity,
  computeCohortDataQuality,
  fulltextSearch,
  generateEmbedding,
  graphRagRerank,
  llmText2Cypher,
  logQueryAudit,
  matchTemplate,
  resolveAdverseEventContext,
} from "../nlq/engine.js";

/**
 * POST /nlq
 * Natural Language Query — translates a question to Cypher and executes it.
 *
 * Body: { question: string, federated?: boolean, odrlScope?: OdrlScope }
 * - question: Natural language question about the health data
 * - federated: If true, dispatch to all SPEs (default: false, primary only)
 * - odrlScope: Caller's effective ODRL scope (forwarded from UI auth layer)
 *
 * Returns: {
 *   question, cypher, method ("template"|"fulltext"|"graphrag"|"llm"|"none"),
 *   templateName?, results, totalRows, odrlEnforced,
 *   interpretation? (pharmacovigilance role resolution — issue #19),
 *   dataQuality?   (cohort/coverage snapshot — issue #19)
 * }
 */
app.post("/nlq", async (req: Request, res: Response, next: NextFunction) => {
  let cypher: string | null = null;
  let method: "template" | "fulltext" | "graphrag" | "llm" | "none" = "none";

  try {
    const { question, federated = false, odrlScope } = req.body;

    if (!question || typeof question !== "string") {
      res.status(400).json({ error: "Missing 'question' in request body" });
      return;
    }

    let templateName: string | undefined;
    let params: Record<string, any> = {};
    let odrlEnforced = false;

    // ODRL enforcement: check temporal limits and prohibitions
    const scope = odrlScope as OdrlScope | undefined;
    if (scope) {
      odrlEnforced = true;
      const temporalErr = checkOdrlTemporal(scope);
      if (temporalErr) {
        res.status(403).json({ error: temporalErr, odrlEnforced: true });
        return;
      }
    }

    // Step 1: Try template matching
    const templateMatch = matchTemplate(question);
    let graphLayers: GraphLayer[] | undefined;
    let cypherSections: CypherSection[] | undefined;
    if (templateMatch) {
      cypher = templateMatch.template.cypher;
      params = templateMatch.params;
      method = "template";
      templateName = templateMatch.template.name;
      graphLayers = templateMatch.template.graphLayers;
      cypherSections = templateMatch.template.cypherSections;
    }

    // Step 1b: Pharmacovigilance template needs glossary-resolved params
    // (issue #19). The generic extractParams returns a stub; here we
    // populate drugCode/drugText/indicationCode/indicationText/sideEffect*
    // from the :NlqGlossary nodes so the Cypher filters are deterministic.
    //
    // For each role we prefer the longest, most-specific text the
    // researcher could have meant. The user's raw token (e.g. "uti") is
    // often a 2-3 letter abbreviation that wouldn't appear inside the
    // SNOMED display string ("Urinary tract infectious disease"); the
    // glossary `display` for the same row IS a substring of typical
    // EHR-coded display strings ("Recurrent urinary tract infection
    // (disorder)" CONTAINS "urinary tract infection"). Picking the
    // longer of the two — the raw token vs. a normalised slice of the
    // resolved display — gives the Cypher CONTAINS clause a much higher
    // hit-rate against real Synthea / FHIR seed data.
    const longerText = (raw?: string, display?: string): string | null => {
      const r = raw?.toLowerCase().trim() ?? "";
      // Strip parenthesised qualifier (e.g. "Rupture of tendon (finding)")
      // and pick the most-substring-friendly head of the resolved display.
      // SNOMED preferred terms are noun-phrase-shaped: the first two words
      // are usually the distinctive ones ("urinary tract" → matches
      // "Recurrent urinary tract infection"; "rupture of" → meh, but
      // "tendon" alone is distinctive). We pick the longer of:
      //   - the user's raw token (e.g. "uti", "tendon rupture")
      //   - the first 2 words of the cleaned glossary display
      const clean = (display ?? "")
        .toLowerCase()
        .replace(/\s*\([^)]+\)\s*$/, "")
        .trim();
      const head2 = clean.split(/\s+/).slice(0, 2).join(" ");
      const d = head2.length >= 4 ? head2 : clean;
      if (!r && !d) return null;
      if (r.length >= d.length) return r || null;
      return d || null;
    };
    let interpretation: AdverseEventContext | undefined;
    if (templateName === "adverse_event_in_cohort" && driver) {
      const resolverSession = driver.session({ database: "neo4j" });
      try {
        interpretation = await resolveAdverseEventContext(
          question,
          resolverSession,
        );
        params = {
          ...params,
          drugCode: interpretation.drug?.code ?? null,
          drugText: longerText(
            interpretation.raw.drugText,
            interpretation.drug?.generic ?? interpretation.drug?.display,
          ),
          indicationCode: interpretation.indication?.code ?? null,
          indicationText: longerText(
            interpretation.raw.indicationText,
            interpretation.indication?.display,
          ),
          sideEffectCode: interpretation.sideEffect?.code ?? null,
          sideEffectText: longerText(
            interpretation.raw.sideEffectText,
            interpretation.sideEffect?.display,
          ),
        };
      } finally {
        await resolverSession.close();
      }
    }

    // Step 2: Try native fulltext search
    if (!cypher) {
      const ftResult = await fulltextSearch(question);
      if (ftResult) {
        cypher = ftResult.cypher;
        params = ftResult.params;
        method = "fulltext";
      }
    }

    // Step 3: Try GraphRAG (Phase 25e — vector search + neighbourhood
    // expansion + optional gpt-5-mini rerank). Returns null unless at least
    // one vector index is online.
    let graphragTrace: GraphRagTraceStage[] | undefined;
    if (!cypher && driver) {
      const ragResult = await runGraphRag(question, {
        driver,
        generateSemanticEmbedding: generateEmbedding,
        llmRerank:
          AZURE_OPENAI_GPT4O_URL && AZURE_OPENAI_API_KEY
            ? graphRagRerank
            : null,
      });
      if (ragResult) {
        cypher = ragResult.cypher;
        params = ragResult.params as Record<string, any>;
        method = "graphrag";
        graphragTrace = ragResult.trace;
      }
    }

    // Step 4: Try LLM if no template, fulltext, or GraphRAG matched
    if (!cypher) {
      cypher = await llmText2Cypher(question);
      if (cypher) method = "llm";
    }

    // Step 5: If still no match, return available templates
    if (!cypher) {
      res.json({
        question,
        method: "none",
        message:
          "No matching query template found. Configure ANTHROPIC_API_KEY, OPENAI_API_KEY, or OLLAMA_URL for LLM-based Text2Cypher.",
        availableTemplates: QUERY_TEMPLATES.map((t) => ({
          name: t.name,
          description: t.description,
          examplePatterns: t.patterns.map((p) => p.source),
        })),
      });
      return;
    }

    // Safety check for non-template Cypher (hardened regex)
    if (method === "llm" || method === "graphrag" || method === "fulltext") {
      const WRITE_PATTERN =
        /\b(CREATE|MERGE|DELETE|DETACH\s+DELETE|SET|REMOVE|DROP|CALL\s*\{[^}]*(CREATE|MERGE|DELETE|SET|REMOVE))/i;
      if (WRITE_PATTERN.test(cypher)) {
        res.status(403).json({
          error: "LLM generated a write query — blocked for safety",
          cypher,
        });
        return;
      }
    }

    // Who a patient is stays out of every answer for a caller who does not
    // see patient identity (#475). The UI says which in X-Patient-Identity;
    // anything but "shown", including no header, is treated as withheld.
    const identityShown = req.headers["x-patient-identity"] === "shown";
    if (!identityShown && cypher && revealsPatientIdentity(cypher)) {
      res.status(403).json({
        error:
          "Query blocked: it would show who a patient is. Research questions are answered with aggregates and clinical values, not with names, birth dates or addresses.",
        method,
        ...(templateName ? { templateName } : {}),
      });
      logQueryAudit(scope?.participantId, question, cypher, method, 0, true);
      return;
    }

    // ODRL: check re-identification prohibition before execution
    if (scope && cypher && checkReIdentification(cypher, scope)) {
      res.status(403).json({
        error:
          "Query blocked: potential re-identification prohibited by ODRL policy",
        odrlEnforced: true,
        policyIds: scope.policyIds,
      });
      logQueryAudit(scope.participantId, question, cypher, method, 0, true);
      return;
    }

    // Execute query
    let results: any[];

    if (federated && spe2Driver) {
      // Federated execution across all SPEs
      const spes = getSpeDrivers();
      const allResults: any[] = [];

      await Promise.all(
        spes.map(async ({ label, driver: d }) => {
          const session = d.session({ database: "neo4j" });
          try {
            // nosemgrep: cypher-built-from-request-input -- generated Cypher; WRITE_PATTERN and checkReIdentification above
            const result = await session.run(cypher!, params);
            result.records.forEach((r) => {
              const obj: Record<string, any> = { _source: label };
              r.keys.forEach((key) => {
                const val = r.get(key);
                obj[String(key)] = neo4j.isInt(val) ? val.toNumber() : val;
              });
              allResults.push(obj);
            });
          } finally {
            await session.close();
          }
        }),
      );
      results = allResults;
    } else {
      // Single SPE execution
      const session = getSession();
      try {
        // nosemgrep: cypher-built-from-request-input -- generated Cypher; WRITE_PATTERN and checkReIdentification above
        const result = await session.run(cypher, params);
        results = result.records.map((r) => {
          const obj: Record<string, any> = {};
          r.keys.forEach((key) => {
            const val = r.get(key);
            obj[String(key)] = neo4j.isInt(val) ? val.toNumber() : val;
          });
          return obj;
        });
      } finally {
        await session.close();
      }
    }

    const participantId =
      (req.headers["x-participant"] as string) ?? scope?.participantId;

    // Issue #19: for the pharmacovigilance template, attach a coverage
    // snapshot so the researcher sees whether the dataset can actually
    // answer the question (before reading rows).
    let dataQuality:
      | Awaited<ReturnType<typeof computeCohortDataQuality>>
      | undefined;
    if (templateName === "adverse_event_in_cohort" && driver) {
      const dqSession = driver.session({ database: "neo4j" });
      try {
        dataQuality =
          (await computeCohortDataQuality(dqSession, {
            drugCode: interpretation?.drug?.code ?? null,
            drugText: interpretation?.raw.drugText?.toLowerCase() ?? null,
            indicationCode: interpretation?.indication?.code ?? null,
            indicationText:
              interpretation?.raw.indicationText?.toLowerCase() ?? null,
          })) ?? undefined;
      } finally {
        await dqSession.close();
      }
    }

    res.json({
      question,
      cypher,
      method,
      templateName,
      federated: federated && spe2Driver != null,
      results,
      totalRows: results.length,
      odrlEnforced,
      ...(graphragTrace ? { trace: graphragTrace } : {}),
      ...(graphLayers
        ? {
            graphLayers: graphLayers.map((id) => ({
              id,
              label: GRAPH_LAYER_META[id].label,
              short: GRAPH_LAYER_META[id].short,
            })),
          }
        : {}),
      ...(cypherSections ? { cypherSections } : {}),
      ...(interpretation
        ? {
            interpretation: {
              drug: interpretation.drug,
              indication: interpretation.indication,
              sideEffect: interpretation.sideEffect,
              unresolved: {
                drug: !interpretation.drug && interpretation.raw.drugText,
                indication:
                  !interpretation.indication &&
                  interpretation.raw.indicationText,
                sideEffect:
                  !interpretation.sideEffect &&
                  interpretation.raw.sideEffectText,
              },
              raw: interpretation.raw,
            },
          }
        : {}),
      ...(dataQuality ? { dataQuality } : {}),
    });

    logTransferEvent(
      "/nlq",
      "POST",
      participantId,
      200,
      results.length,
      auditContext(req, res),
    );
    logQueryAudit(
      participantId,
      question,
      cypher,
      method,
      results.length,
      odrlEnforced,
    );
  } catch (err: any) {
    // Return structured NLQ error (not generic 500) so the UI can display it
    const errMsg = err?.message ?? String(err);
    console.error("[neo4j-proxy] NLQ execution error:", errMsg);
    res.status(200).json({
      question: req.body?.question ?? "",
      cypher: cypher ?? "",
      method: method ?? "none",
      error: `Query execution failed: ${errMsg.slice(0, 300)}`,
      results: [],
      totalRows: 0,
      odrlEnforced: false,
    });
  }
});

/**
 * GET /nlq/templates
 * Returns the list of available NLQ query templates.
 */
app.get("/nlq/templates", (_req: Request, res: Response) => {
  res.json({
    templates: QUERY_TEMPLATES.map((t) => ({
      name: t.name,
      description: t.description,
      examplePatterns: t.patterns.map((p) => p.source),
    })),
    llmAvailable: !!(OPENAI_API_KEY || OLLAMA_URL),
  });
});

/**
 * GET /nlq/backend — Phase 25f (Issue #13).
 * Reports which NLP backend is currently detected from environment so the UI
 * can render a status badge on /query. Discovery is cheap and synchronous.
 */
app.get("/nlq/backend", async (_req: Request, res: Response) => {
  let vectorIndexes: string[] = [];
  if (driver) {
    const session = driver.session({ database: "neo4j" });
    try {
      const r = await session.run(
        `SHOW INDEXES YIELD name, type, state
         WHERE type = 'VECTOR' AND state = 'ONLINE'
         RETURN name`,
      );
      vectorIndexes = r.records.map((rec) => String(rec.get("name")));
    } catch {
      // GDS / vector index not present — leave list empty
    } finally {
      await session.close();
    }
  }

  let chatBackend: string;
  if (AZURE_OPENAI_GPT4O_URL && AZURE_OPENAI_API_KEY) {
    chatBackend = "azure-openai";
  } else if (OPENAI_API_KEY) {
    chatBackend = "openai";
  } else if (OLLAMA_URL) {
    chatBackend = "ollama";
  } else if (ANTHROPIC_API_KEY) {
    chatBackend = "anthropic";
  } else {
    chatBackend = "none";
  }

  const embeddingsBackend =
    process.env.AZURE_OPENAI_EMBEDDINGS_URL && AZURE_OPENAI_API_KEY
      ? "azure-openai"
      : OLLAMA_URL
        ? "ollama"
        : OPENAI_API_KEY
          ? "openai"
          : "none";

  res.json({
    chat: chatBackend,
    embeddings: embeddingsBackend,
    vectorIndexes,
    graphragReady: vectorIndexes.length > 0 && embeddingsBackend !== "none",
    cascade: ["template", "fulltext", "graphrag", "llm", "none"],
  });
});
