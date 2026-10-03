// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export const PORT = parseInt(process.env.PORT ?? "9090", 10);
export const NEO4J_URI = process.env.NEO4J_URI ?? "bolt://localhost:7687";
export const NEO4J_USER = process.env.NEO4J_USER ?? "neo4j";
export const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD ?? "healthdataspace";

// Phase 5: Second SPE for federated queries (optional)
export const NEO4J_SPE2_URI = process.env.NEO4J_SPE2_URI;
export const NEO4J_SPE2_USER = process.env.NEO4J_SPE2_USER ?? NEO4J_USER;
export const NEO4J_SPE2_PASSWORD =
  process.env.NEO4J_SPE2_PASSWORD ?? NEO4J_PASSWORD;

// GDPR / EHDS: k-anonymity minimum cohort size for federated queries.
// Callers may request a HIGHER threshold via the request body, but never lower.
// Set to 0 to disable enforcement (not recommended for production).
export const MIN_COHORT_SIZE = parseInt(process.env.MIN_COHORT_SIZE ?? "5", 10);

// Phase 5c: Optional LLM endpoint for Text2Cypher
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
export const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
export const OLLAMA_URL = process.env.OLLAMA_URL; // e.g. http://localhost:11434
export const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "llama3.1";
export const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
export const ANTHROPIC_MODEL =
  process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
export const AZURE_OPENAI_GPT4O_URL = process.env.AZURE_OPENAI_GPT4O_URL;
export const AZURE_OPENAI_API_KEY = process.env.AZURE_OPENAI_API_KEY;
