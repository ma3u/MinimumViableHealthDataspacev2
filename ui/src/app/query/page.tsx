"use client";

import { fetchApi } from "@/lib/api";
import { useEffect, useState, useRef } from "react";
import {
  Search,
  Database,
  Loader2,
  Send,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Globe,
  Shield,
  Zap,
} from "lucide-react";

interface OdrlScope {
  participantId: string;
  permissions: string[];
  prohibitions: string[];
  accessibleDatasets: string[];
  temporalLimit: string | null;
  policyIds: string[];
  hasActiveContract: boolean;
  hdabApproved: boolean;
}

interface NlqResult {
  question: string;
  cypher: string;
  method: "template" | "fulltext" | "graphrag" | "llm" | "none";
  templateName?: string;
  federated: boolean;
  results: Record<string, any>[];
  totalRows: number;
  error?: string;
  message?: string;
  odrlEnforced?: boolean;
}

interface NlqTemplate {
  name: string;
  description: string;
  examplePatterns: string[];
}

interface FederatedStats {
  speCount: number;
  totals: {
    patients: number;
    encounters: number;
    conditions: number;
    observations: number;
  };
  aggregatedConditions: { name: string; count: number }[];
  aggregatedGenders: { gender: string; count: number }[];
  spes: {
    label: string;
    patients: number;
    encounters: number;
    conditions: number;
    observations: number;
  }[];
}

const EXAMPLE_QUESTIONS = [
  "How many patients are there?",
  "Show me patients by gender",
  "What are the top 10 conditions?",
  "What are the most prescribed medications?",
  "Show me encounters by type",
  "What is the age distribution?",
  "Patients with diabetes",
  "How prevalent is hypertension?",
  "Sinusitis",
];

export default function NlqPage() {
  const [question, setQuestion] = useState("");
  const [federated, setFederated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<NlqResult | null>(null);
  const [templates, setTemplates] = useState<NlqTemplate[]>([]);
  const [stats, setStats] = useState<FederatedStats | null>(null);
  const [showCypher, setShowCypher] = useState(false);
  const [history, setHistory] = useState<NlqResult[]>([]);
  const [odrlScope, setOdrlScope] = useState<OdrlScope | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Load templates, federated stats, and ODRL scope on mount
    fetchApi("/api/nlq")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setTemplates(d?.templates ?? []))
      .catch(() => {});
    fetchApi("/api/federated")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.totals) setStats(d);
      })
      .catch(() => {});
    fetchApi("/api/odrl/scope")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.participantId) setOdrlScope(d);
      })
      .catch(() => {});
  }, []);

  async function handleQuery(q?: string) {
    const query = q ?? question;
    if (!query.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const resp = await fetchApi("/api/nlq", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: query, federated }),
      });
      const data: NlqResult = await resp.json();
      // Normalize: NLQ "none" responses may lack results/totalRows
      const normalized: NlqResult = {
        ...data,
        results: data.results ?? [],
        totalRows: data.totalRows ?? 0,
        cypher: data.cypher ?? "",
      };
      setResult(normalized);
      setHistory((prev) => [normalized, ...prev.slice(0, 9)]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Query failed";
      setResult({
        question: query,
        cypher: "",
        method: "none",
        federated,
        results: [],
        totalRows: 0,
        error: message,
      });
    } finally {
      setLoading(false);
    }
  }

  function handleExampleClick(q: string) {
    setQuestion(q);
    handleQuery(q);
  }

  const columns =
    result?.results && result.results.length > 0
      ? Object.keys(result.results[0])
      : [];

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)]">
      {/* Header with federated stats */}
      <div className="border-b border-[var(--border)] bg-[var(--surface)]/50">
        <div className="max-w-6xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Search size={20} className="text-[var(--accent-l1)]" />
                <h1 className="text-xl font-semibold">
                  Natural Language Query
                </h1>
              </div>
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                Ask questions about the Health Dataspace knowledge graph in
                plain language. The query engine translates your question into
                Cypher and returns structured results from all five graph
                layers.
              </p>
              <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400 mt-2">
                <a
                  href="/analytics"
                  className="hover:text-[var(--text-secondary)] transition-colors"
                >
                  ← OMOP Analytics
                </a>
                <span>|</span>
                <a
                  href="/eehrxf"
                  className="hover:text-[var(--text-secondary)] transition-colors"
                >
                  EEHRxF Profiles →
                </a>
              </div>
            </div>
            {stats?.totals && (
              <div className="flex gap-6 text-sm">
                <div className="text-center">
                  <div className="text-lg font-semibold text-[var(--accent-l1)]">
                    {stats.speCount}
                  </div>
                  <div className="text-[var(--text-secondary)] text-xs">
                    SPEs
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-semibold text-[var(--accent-l3)]">
                    {stats.totals.patients.toLocaleString()}
                  </div>
                  <div className="text-[var(--text-secondary)] text-xs">
                    Patients
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-semibold text-[var(--accent-l4)]">
                    {stats.totals.encounters.toLocaleString()}
                  </div>
                  <div className="text-[var(--text-secondary)] text-xs">
                    Encounters
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-semibold text-[var(--accent-l5)]">
                    {stats.totals.conditions.toLocaleString()}
                  </div>
                  <div className="text-[var(--text-secondary)] text-xs">
                    Conditions
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
        {/* Query input */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleQuery();
            }}
            className="flex gap-3"
          >
            <div className="flex-1 relative">
              <input
                ref={inputRef}
                aria-label="Ask a question about the health data"
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ask a question about the health data..."
                className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
                disabled={loading}
              />
            </div>
            <button
              type="button"
              onClick={() => setFederated(!federated)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors border ${
                federated
                  ? "bg-blue-500/20 border-blue-500/50 text-[var(--accent)]"
                  : "bg-[var(--surface-2)] border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
              title="Query across all Secure Processing Environments"
            >
              <Globe size={14} />
              Federated
            </button>
            <button
              type="submit"
              disabled={loading || !question.trim()}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-[var(--text-secondary)] text-white rounded-lg text-sm font-medium transition-colors"
            >
              {loading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Send size={14} />
              )}
              Ask
            </button>
          </form>

          {/* Example questions */}
          <div className="mt-3 flex flex-wrap gap-2">
            {EXAMPLE_QUESTIONS.map((q) => (
              <button
                key={q}
                onClick={() => handleExampleClick(q)}
                className="px-3 py-1.5 rounded-full bg-[var(--surface)] border border-[var(--border)] text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-2)] hover:border-[var(--accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] transition-colors"
                disabled={loading}
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        {/* ODRL Policy Scope Indicator */}
        {odrlScope && (
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <Shield size={14} className="text-[var(--accent-l1)]" />
              <h3 className="text-sm font-medium text-[var(--text-primary)]">
                Policy Scope
              </h3>
              {odrlScope.hasActiveContract && (
                <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-500/20 text-[var(--success-text)]">
                  Active Contract
                </span>
              )}
              {odrlScope.hdabApproved && (
                <span className="px-2 py-0.5 rounded-full text-xs bg-blue-500/20 text-[var(--accent)]">
                  HDAB Approved
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div>
                <div className="text-[var(--text-secondary)] mb-1">
                  Permissions
                </div>
                <div className="flex flex-wrap gap-1">
                  {odrlScope.permissions.length > 0 ? (
                    odrlScope.permissions.map((p) => (
                      <span
                        key={p}
                        className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-[var(--success-text)]"
                      >
                        {p}
                      </span>
                    ))
                  ) : (
                    <span className="text-[var(--text-secondary)]">None</span>
                  )}
                </div>
              </div>
              <div>
                <div className="text-[var(--text-secondary)] mb-1">
                  Prohibitions
                </div>
                <div className="flex flex-wrap gap-1">
                  {odrlScope.prohibitions.length > 0 ? (
                    odrlScope.prohibitions.map((p) => (
                      <span
                        key={p}
                        className="px-1.5 py-0.5 rounded bg-red-500/10 text-red-300"
                      >
                        {p}
                      </span>
                    ))
                  ) : (
                    <span className="text-[var(--text-secondary)]">None</span>
                  )}
                </div>
              </div>
              <div>
                <div className="text-[var(--text-secondary)] mb-1">
                  Accessible Datasets
                </div>
                <div className="flex flex-wrap gap-1">
                  {odrlScope.accessibleDatasets.length > 0 ? (
                    odrlScope.accessibleDatasets.map((d) => (
                      <span
                        key={d}
                        className="px-1.5 py-0.5 rounded bg-[var(--surface-2)] text-[var(--text-primary)]"
                      >
                        {d}
                      </span>
                    ))
                  ) : (
                    <span className="text-[var(--text-secondary)]">All</span>
                  )}
                </div>
                {odrlScope.temporalLimit && (
                  <div className="mt-1 text-[var(--text-secondary)]">
                    Valid until:{" "}
                    <span className="text-[var(--text-primary)]">
                      {odrlScope.temporalLimit}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-4">
            {/* Method badge */}
            <div className="flex items-center gap-3">
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
                  result.method === "template"
                    ? "bg-emerald-500/20 text-[var(--success-text)]"
                    : result.method === "fulltext"
                      ? "bg-amber-500/20 text-amber-300"
                      : result.method === "graphrag"
                        ? "bg-cyan-500/20 text-cyan-300"
                        : result.method === "llm"
                          ? "bg-purple-500/20 text-[var(--accent)]"
                          : "bg-red-500/20 text-red-300"
                }`}
              >
                {result.method === "template" && <Database size={12} />}
                {result.method === "fulltext" && <Search size={12} />}
                {result.method === "graphrag" && <Zap size={12} />}
                {result.method === "llm" && <Sparkles size={12} />}
                {result.method === "template"
                  ? `Template: ${result.templateName}`
                  : result.method === "fulltext"
                    ? "Fulltext Search"
                    : result.method === "graphrag"
                      ? "GraphRAG"
                      : result.method === "llm"
                        ? "LLM Generated"
                        : "No Match"}
              </span>
              {result.federated && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-500/20 text-[var(--accent)]">
                  <Globe size={12} />
                  Federated
                </span>
              )}
              {result.odrlEnforced && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/20 text-amber-300">
                  <Shield size={12} />
                  ODRL Enforced
                </span>
              )}
              <span className="text-xs text-[var(--text-secondary)]">
                {result.totalRows} row{result.totalRows !== 1 ? "s" : ""}
              </span>

              {/* Cypher toggle */}
              <button
                onClick={() => setShowCypher(!showCypher)}
                className="ml-auto flex items-center gap-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              >
                {showCypher ? (
                  <ChevronUp size={12} />
                ) : (
                  <ChevronDown size={12} />
                )}
                Cypher
              </button>
            </div>

            {/* Cypher query */}
            {showCypher && result.cypher && (
              <pre className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3 text-xs font-mono text-[var(--text-secondary)] overflow-x-auto whitespace-pre-wrap">
                {result.cypher}
              </pre>
            )}

            {/* Error */}
            {result.error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-300">
                {result.error}
              </div>
            )}

            {/* No match message */}
            {!result.error && result.method === "none" && result.message && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-sm text-amber-300">
                {result.message}
              </div>
            )}

            {/* Results table */}
            {result.results && result.results.length > 0 && (
              <div className="border border-[var(--border)] rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-[var(--surface)] border-b border-[var(--border)]">
                        {columns.map((col) => (
                          <th
                            key={col}
                            className="px-4 py-2.5 text-left text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider"
                          >
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800/50">
                      {result.results.map((row, i) => (
                        <tr
                          key={i}
                          className="hover:bg-[var(--surface)]/50 transition-colors"
                        >
                          {columns.map((col) => (
                            <td
                              key={col}
                              className="px-4 py-2 text-[var(--text-primary)] whitespace-nowrap"
                            >
                              {row[col] != null
                                ? typeof row[col] === "object"
                                  ? JSON.stringify(row[col])
                                  : String(row[col])
                                : "—"}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Available templates */}
        {!result && templates.length > 0 && (
          <div className="bg-[var(--surface)]/50 border border-[var(--border)] rounded-lg p-4">
            <h3 className="text-sm font-medium text-[var(--text-primary)] mb-3 flex items-center gap-1.5">
              <Database size={14} className="text-[var(--accent-l3)]" />
              Available Query Templates
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {templates.map((t) => (
                <div
                  key={t.name}
                  className="bg-[var(--surface-2)]/50 border border-[var(--border)]/50 rounded-lg p-3"
                >
                  <div className="text-sm font-medium text-[var(--text-primary)]">
                    {t.name.replace(/_/g, " ")}
                  </div>
                  <div className="text-xs text-[var(--text-secondary)] mt-1">
                    {t.description}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SPE breakdown */}
        {stats && stats.spes && (
          <div className="bg-[var(--surface)]/50 border border-[var(--border)] rounded-lg p-4">
            <h3 className="text-sm font-medium text-[var(--text-primary)] mb-3 flex items-center gap-1.5">
              <Globe size={14} className="text-[var(--accent-l1)]" />
              Secure Processing Environments
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {stats.spes.map((spe) => (
                <div
                  key={spe.label}
                  className="bg-[var(--surface-2)]/50 border border-[var(--border)]/50 rounded-lg p-3"
                >
                  <div className="text-sm font-semibold text-[var(--text-primary)] mb-2">
                    {spe.label}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-[var(--text-secondary)]">
                        Patients:{" "}
                      </span>
                      <span className="text-[var(--accent-l3)]">
                        {spe.patients.toLocaleString()}
                      </span>
                    </div>
                    <div>
                      <span className="text-[var(--text-secondary)]">
                        Encounters:{" "}
                      </span>
                      <span className="text-[var(--accent-l4)]">
                        {spe.encounters.toLocaleString()}
                      </span>
                    </div>
                    <div>
                      <span className="text-[var(--text-secondary)]">
                        Conditions:{" "}
                      </span>
                      <span className="text-[var(--accent-l5)]">
                        {spe.conditions.toLocaleString()}
                      </span>
                    </div>
                    <div>
                      <span className="text-[var(--text-secondary)]">
                        Observations:{" "}
                      </span>
                      <span className="text-[var(--accent-l1)]">
                        {spe.observations.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Query history */}
        {history.length > 1 && (
          <div className="bg-[var(--surface)]/50 border border-[var(--border)] rounded-lg p-4">
            <h3 className="text-sm font-medium text-[var(--text-primary)] mb-3">
              Recent Queries
            </h3>
            <div className="space-y-2">
              {history.slice(1).map((h, i) => (
                <button
                  key={i}
                  onClick={() => handleExampleClick(h.question)}
                  className="w-full text-left px-3 py-2 rounded bg-[var(--surface-2)]/50 border border-[var(--border)]/50 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-gray-600 transition-colors flex items-center justify-between"
                >
                  <span className="truncate">{h.question}</span>
                  <span className="text-gray-600 shrink-0 ml-2">
                    {h.totalRows} rows
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
