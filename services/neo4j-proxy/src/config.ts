// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export const PORT = parseInt(process.env.PORT ?? "9090", 10);
export const NEO4J_URI = process.env.NEO4J_URI ?? "bolt://localhost:7687";
export const NEO4J_USER = process.env.NEO4J_USER ?? "neo4j";
export const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD ?? "healthdataspace";

// SPE-1 as a workspace of its own (ADR-068 decision 3, ADR-069). Unset, SPE-1
// is the hub graph, as it always was. Set, it changes exactly two paths: the
// federated path (POST /federated/query, GET /federated/stats, POST /nlq with
// `federated: true`) and the spe_access template ask this workspace for
// SPE-1. Everything else still reads the hub graph, including a question to
// POST /nlq without `federated`: that is the single-SPE path, and it answers
// from the hub (all patients, the catalog, permits) whether or not this is set.
// The audit chain and the access log are always the hub's.
export const NEO4J_SPE1_URI = process.env.NEO4J_SPE1_URI || undefined;
export const NEO4J_SPE1_USER = process.env.NEO4J_SPE1_USER ?? NEO4J_USER;
export const NEO4J_SPE1_PASSWORD =
  process.env.NEO4J_SPE1_PASSWORD ?? NEO4J_PASSWORD;

// Phase 5: Second SPE for federated queries (optional)
export const NEO4J_SPE2_URI = process.env.NEO4J_SPE2_URI;
export const NEO4J_SPE2_USER = process.env.NEO4J_SPE2_USER ?? NEO4J_USER;
export const NEO4J_SPE2_PASSWORD =
  process.env.NEO4J_SPE2_PASSWORD ?? NEO4J_PASSWORD;
// Bolt over TLS to the ACI workspaces (ADR-069): the CA that signed their
// server certificates, as PEM text (an ACA secret) or a file. Set, the proxy
// trusts that CA and no other for SPE-1 and SPE-2; unset, the URIs decide.
export const NEO4J_SPE_CA_CERT = process.env.NEO4J_SPE_CA_CERT || undefined;
export const NEO4J_SPE_CA_FILE = process.env.NEO4J_SPE_CA_FILE || undefined;
const int = (name: string, fallback: number) =>
  parseInt(process.env[name] ?? String(fallback), 10);
// The workspaces are connected in the background, never before the proxy
// listens (ADR-069): each try gives up after SPE_CONNECT_TIMEOUT_MS, and the
// proxy tries again for as long as it runs, 15 s apart at first, doubling up
// to SPE_CONNECT_MAX_INTERVAL_MS. A workspace that stops answering later is
// reconnected by the driver itself.
export const SPE_CONNECT_TIMEOUT_MS = int("SPE_CONNECT_TIMEOUT_MS", 5000);
export const SPE_CONNECT_INTERVAL_MS = int("SPE_CONNECT_INTERVAL_MS", 15000);
export const SPE_CONNECT_MAX_INTERVAL_MS = int(
  "SPE_CONNECT_MAX_INTERVAL_MS",
  60000,
);
/** The longest the sync waits for one workspace read before it moves on. */
export const SPE_READ_TIMEOUT_MS = int("SPE_READ_TIMEOUT_MS", 10000);

// GET /spe/status (#774): where this proxy runs and the access body's Trustee.
export const SPE_ENVIRONMENT: "local" | "azure" =
  process.env.SPE_ENVIRONMENT === "azure" ? "azure" : "local";
export const TRUSTEE_URL = process.env.TRUSTEE_URL ?? "";
/** Where the proxy itself reaches Trustee, when that is not the URL shown. */
export const TRUSTEE_PROBE_URL = process.env.TRUSTEE_PROBE_URL || TRUSTEE_URL;
export const TRUSTEE_OPERATOR =
  process.env.TRUSTEE_OPERATOR ?? "MedReg DE (access body)";
export const TRUSTEE_VERIFIER =
  process.env.TRUSTEE_VERIFIER ??
  (SPE_ENVIRONMENT === "azure" ? "snp" : "sample");
/** Where each SPE runs, for an SPE whose workspace has not said so itself. */
export const SPE1_RUNS_ON = process.env.SPE1_RUNS_ON;
export const SPE2_RUNS_ON = process.env.SPE2_RUNS_ON;
/**
 * How often the SPE sync runs (spe-status.ts): opt-outs into the workspaces,
 * their events onto the audit chain. Also once a few seconds after start.
 */
export const SPE_AUDIT_SYNC_MS = parseInt(
  process.env.SPE_AUDIT_SYNC_MS ?? "60000",
  10,
);

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
