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
} from "lucide-react";

interface NlqResult {
  question: string;
  cypher: string;
  method: "template" | "llm" | "none";
  templateName?: string;
  federated: boolean;
  results: Record<string, any>[];
  totalRows: number;
  error?: string;
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
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Load templates and federated stats on mount
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
      setResult(data);
      setHistory((prev) => [data, ...prev.slice(0, 9)]);
    } catch (err: any) {
      setResult({
        question: query,
        cypher: "",
        method: "none",
        federated,
        results: [],
        totalRows: 0,
        error: err.message,
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
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Header with federated stats */}
      <div className="border-b border-gray-800 bg-gray-900/50">
        <div className="max-w-6xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Search size={20} className="text-blue-400" />
                <h1 className="text-xl font-semibold">
                  Natural Language Query
                </h1>
              </div>
              <p className="text-sm text-gray-500 mt-1">
                Ask questions about the Health Dataspace knowledge graph in
                plain language. The query engine translates your question into
                Cypher and returns structured results from all five graph
                layers.
              </p>
              <div className="flex items-center gap-4 text-xs text-gray-600 mt-2">
                <a
                  href="/analytics"
                  className="hover:text-gray-400 transition-colors"
                >
                  ← OMOP Analytics
                </a>
                <span>|</span>
                <a
                  href="/eehrxf"
                  className="hover:text-gray-400 transition-colors"
                >
                  EEHRxF Profiles →
                </a>
              </div>
            </div>
            {stats?.totals && (
              <div className="flex gap-6 text-sm">
                <div className="text-center">
                  <div className="text-lg font-semibold text-blue-400">
                    {stats.speCount}
                  </div>
                  <div className="text-gray-500 text-xs">SPEs</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-semibold text-emerald-400">
                    {stats.totals.patients.toLocaleString()}
                  </div>
                  <div className="text-gray-500 text-xs">Patients</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-semibold text-amber-400">
                    {stats.totals.encounters.toLocaleString()}
                  </div>
                  <div className="text-gray-500 text-xs">Encounters</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-semibold text-purple-400">
                    {stats.totals.conditions.toLocaleString()}
                  </div>
                  <div className="text-gray-500 text-xs">Conditions</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
        {/* Query input */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
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
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ask a question about the health data..."
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
                disabled={loading}
              />
            </div>
            <button
              type="button"
              onClick={() => setFederated(!federated)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors border ${
                federated
                  ? "bg-blue-500/20 border-blue-500/50 text-blue-300"
                  : "bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-200"
              }`}
              title="Query across all Secure Processing Environments"
            >
              <Globe size={14} />
              Federated
            </button>
            <button
              type="submit"
              disabled={loading || !question.trim()}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg text-sm font-medium transition-colors"
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
                className="px-2.5 py-1 rounded-full bg-gray-800 border border-gray-700 text-xs text-gray-400 hover:text-gray-200 hover:border-gray-600 transition-colors"
                disabled={loading}
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        {/* Results */}
        {result && (
          <div className="space-y-4">
            {/* Method badge */}
            <div className="flex items-center gap-3">
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
                  result.method === "template"
                    ? "bg-emerald-500/20 text-emerald-300"
                    : result.method === "llm"
                      ? "bg-purple-500/20 text-purple-300"
                      : "bg-red-500/20 text-red-300"
                }`}
              >
                {result.method === "template" && <Database size={12} />}
                {result.method === "llm" && <Sparkles size={12} />}
                {result.method === "template"
                  ? `Template: ${result.templateName}`
                  : result.method === "llm"
                    ? "LLM Generated"
                    : "No Match"}
              </span>
              {result.federated && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-500/20 text-blue-300">
                  <Globe size={12} />
                  Federated
                </span>
              )}
              <span className="text-xs text-gray-500">
                {result.totalRows} row{result.totalRows !== 1 ? "s" : ""}
              </span>

              {/* Cypher toggle */}
              <button
                onClick={() => setShowCypher(!showCypher)}
                className="ml-auto flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors"
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
              <pre className="bg-gray-900 border border-gray-800 rounded-lg p-3 text-xs font-mono text-gray-400 overflow-x-auto whitespace-pre-wrap">
                {result.cypher}
              </pre>
            )}

            {/* Error */}
            {result.error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-300">
                {result.error}
              </div>
            )}

            {/* Results table */}
            {result.results.length > 0 && (
              <div className="border border-gray-800 rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-900 border-b border-gray-800">
                        {columns.map((col) => (
                          <th
                            key={col}
                            className="px-4 py-2.5 text-left text-xs font-medium text-gray-400 uppercase tracking-wider"
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
                          className="hover:bg-gray-900/50 transition-colors"
                        >
                          {columns.map((col) => (
                            <td
                              key={col}
                              className="px-4 py-2 text-gray-300 whitespace-nowrap"
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
          <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4">
            <h3 className="text-sm font-medium text-gray-300 mb-3 flex items-center gap-1.5">
              <Database size={14} className="text-emerald-400" />
              Available Query Templates
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {templates.map((t) => (
                <div
                  key={t.name}
                  className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-3"
                >
                  <div className="text-sm font-medium text-gray-200">
                    {t.name.replace(/_/g, " ")}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {t.description}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SPE breakdown */}
        {stats && stats.spes && (
          <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4">
            <h3 className="text-sm font-medium text-gray-300 mb-3 flex items-center gap-1.5">
              <Globe size={14} className="text-blue-400" />
              Secure Processing Environments
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {stats.spes.map((spe) => (
                <div
                  key={spe.label}
                  className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-3"
                >
                  <div className="text-sm font-semibold text-gray-200 mb-2">
                    {spe.label}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-gray-500">Patients: </span>
                      <span className="text-emerald-400">
                        {spe.patients.toLocaleString()}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">Encounters: </span>
                      <span className="text-amber-400">
                        {spe.encounters.toLocaleString()}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">Conditions: </span>
                      <span className="text-purple-400">
                        {spe.conditions.toLocaleString()}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">Observations: </span>
                      <span className="text-blue-400">
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
          <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4">
            <h3 className="text-sm font-medium text-gray-300 mb-3">
              Recent Queries
            </h3>
            <div className="space-y-2">
              {history.slice(1).map((h, i) => (
                <button
                  key={i}
                  onClick={() => handleExampleClick(h.question)}
                  className="w-full text-left px-3 py-2 rounded bg-gray-800/50 border border-gray-700/50 text-xs text-gray-400 hover:text-gray-200 hover:border-gray-600 transition-colors flex items-center justify-between"
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
