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
  Info,
  Pill,
  Stethoscope,
  AlertTriangle,
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

interface PharmaRole {
  term: string;
  code: string;
  system: string;
  display: string;
  generic?: string;
  icd10?: string;
}

interface NlqInterpretation {
  drug?: PharmaRole;
  indication?: PharmaRole;
  sideEffect?: PharmaRole;
  unresolved?: {
    drug?: boolean | string;
    indication?: boolean | string;
    sideEffect?: boolean | string;
  };
  raw?: {
    drugText?: string;
    indicationText?: string;
    sideEffectText?: string;
  };
}

interface NlqDataQuality {
  snomedCoveragePct: number;
  rxnormCoveragePct: number;
  totalConditions: number;
  totalMedicationRequests: number;
  cohortSize?: number;
  cohortConditions?: number;
  cohortMedicationRequests?: number;
  cohortSnomedCoveragePct?: number;
  cohortRxnormCoveragePct?: number;
}

type GraphLayerId = "L1" | "L2" | "L3" | "L4" | "L5";

interface GraphLayerInfo {
  id: GraphLayerId;
  label: string;
  short: string;
}

interface NlqCypherSection {
  label: string;
  cypher: string;
  layer?: GraphLayerId;
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
  interpretation?: NlqInterpretation;
  dataQuality?: NlqDataQuality;
  graphLayers?: GraphLayerInfo[];
  cypherSections?: NlqCypherSection[];
}

const LAYER_ACCENT: Record<GraphLayerId, string> = {
  L1: "bg-[var(--accent-l1)]/20 text-[var(--accent-l1)] border-[var(--accent-l1)]/50",
  L2: "bg-[var(--accent-l2)]/20 text-[var(--accent-l2)] border-[var(--accent-l2)]/50",
  L3: "bg-[var(--accent-l3)]/20 text-[var(--accent-l3)] border-[var(--accent-l3)]/50",
  L4: "bg-[var(--accent-l4)]/20 text-[var(--accent-l4)] border-[var(--accent-l4)]/50",
  L5: "bg-[var(--accent-l5)]/20 text-[var(--accent-l5)] border-[var(--accent-l5)]/50",
};

const ALL_LAYERS: GraphLayerId[] = ["L1", "L2", "L3", "L4", "L5"];

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
  "Is tendon rupture frequently observed in patients treated with ciprofloxacin diagnosed with UTI?",
];

const SCORE_COLUMNS = new Set(["score", "frequencyPct"]);

function formatCellValue(col: string, value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "number" && SCORE_COLUMNS.has(col)) {
    return value.toFixed(2);
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function codeBadge(system: string | undefined): {
  label: string;
  className: string;
} {
  switch ((system ?? "").toLowerCase()) {
    case "snomed":
      return {
        label: "SNOMED",
        className: "bg-purple-500/20 text-purple-300",
      };
    case "rxnorm":
      return {
        label: "RxNorm",
        className: "bg-amber-500/20 text-amber-300",
      };
    case "loinc":
      return { label: "LOINC", className: "bg-cyan-500/20 text-cyan-300" };
    case "icd10":
      return { label: "ICD-10", className: "bg-red-500/20 text-red-300" };
    default:
      return {
        label: system ?? "?",
        className: "bg-gray-500/20 text-gray-300",
      };
  }
}

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

            {/* 5-layer graph breadcrumb — which layers answer this question */}
            {result.graphLayers && result.graphLayers.length > 0 && (
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Zap size={14} className="text-[var(--accent-l1)]" />
                  <h3 className="text-sm font-medium text-[var(--text-primary)]">
                    Graph layers traversed
                  </h3>
                  <span
                    className="text-xs text-[var(--text-secondary)] cursor-help"
                    title="The EHDS dataspace knowledge graph is built from five stacked layers. This breadcrumb shows which layers the generated Cypher reads from to answer your question."
                  >
                    (5-layer model)
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {ALL_LAYERS.map((id, i) => {
                    const active = result.graphLayers!.find((l) => l.id === id);
                    return (
                      <div key={id} className="flex items-center gap-2">
                        <div
                          className={`px-2.5 py-1 rounded-md border text-xs font-medium ${
                            active
                              ? LAYER_ACCENT[id]
                              : "bg-[var(--surface-2)] text-[var(--text-secondary)] border-[var(--border)] opacity-40"
                          }`}
                          title={
                            active
                              ? `${active.label} — touched by this query`
                              : `${id} — not touched`
                          }
                        >
                          <span className="font-mono mr-1">{id}</span>
                          <span>{active?.short ?? id}</span>
                        </div>
                        {i < ALL_LAYERS.length - 1 && (
                          <span className="text-[var(--text-secondary)]">
                            →
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Interpretation — how we parsed the question (issue #19) */}
            {result.interpretation && (
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Info size={14} className="text-[var(--accent-l1)]" />
                  <h3 className="text-sm font-medium text-[var(--text-primary)]">
                    How we interpreted your question
                  </h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* Drug */}
                  <div className="bg-[var(--surface-2)]/50 border border-[var(--border)]/50 rounded-lg p-3">
                    <div className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] mb-1">
                      <Pill size={12} className="text-amber-400" />
                      Drug / product
                    </div>
                    {result.interpretation.drug ? (
                      <div className="space-y-1">
                        <div className="text-sm font-medium text-[var(--text-primary)]">
                          {result.interpretation.drug.display}
                        </div>
                        <div className="flex items-center gap-1.5 text-xs">
                          <span
                            className={`px-1.5 py-0.5 rounded ${
                              codeBadge(result.interpretation.drug.system)
                                .className
                            }`}
                          >
                            {codeBadge(result.interpretation.drug.system).label}
                          </span>
                          <span className="text-[var(--text-secondary)] font-mono">
                            {result.interpretation.drug.code}
                          </span>
                        </div>
                        {result.interpretation.drug.generic && (
                          <div className="text-xs text-[var(--text-secondary)]">
                            generic:{" "}
                            <span className="text-[var(--text-primary)]">
                              {result.interpretation.drug.generic}
                            </span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-xs text-red-300/80 flex items-center gap-1.5">
                        <AlertTriangle size={12} />
                        {result.interpretation.raw?.drugText
                          ? `"${result.interpretation.raw.drugText}" — not in glossary`
                          : "No drug detected"}
                      </div>
                    )}
                  </div>
                  {/* Indication */}
                  <div className="bg-[var(--surface-2)]/50 border border-[var(--border)]/50 rounded-lg p-3">
                    <div className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] mb-1">
                      <Stethoscope size={12} className="text-emerald-400" />
                      Indication (diagnosis)
                    </div>
                    {result.interpretation.indication ? (
                      <div className="space-y-1">
                        <div className="text-sm font-medium text-[var(--text-primary)]">
                          {result.interpretation.indication.display}
                        </div>
                        <div className="flex items-center gap-1.5 text-xs flex-wrap">
                          <span
                            className={`px-1.5 py-0.5 rounded ${
                              codeBadge(result.interpretation.indication.system)
                                .className
                            }`}
                          >
                            {
                              codeBadge(result.interpretation.indication.system)
                                .label
                            }
                          </span>
                          <span className="text-[var(--text-secondary)] font-mono">
                            {result.interpretation.indication.code}
                          </span>
                          {result.interpretation.indication.icd10 && (
                            <>
                              <span
                                className={`px-1.5 py-0.5 rounded ${
                                  codeBadge("icd10").className
                                }`}
                              >
                                ICD-10
                              </span>
                              <span className="text-[var(--text-secondary)] font-mono">
                                {result.interpretation.indication.icd10}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-red-300/80 flex items-center gap-1.5">
                        <AlertTriangle size={12} />
                        {result.interpretation.raw?.indicationText
                          ? `"${result.interpretation.raw.indicationText}" — not in glossary`
                          : "No indication detected"}
                      </div>
                    )}
                  </div>
                  {/* Side effect */}
                  <div className="bg-[var(--surface-2)]/50 border border-[var(--border)]/50 rounded-lg p-3">
                    <div className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] mb-1">
                      <AlertTriangle size={12} className="text-red-400" />
                      Side-effect (measured)
                    </div>
                    {result.interpretation.sideEffect ? (
                      <div className="space-y-1">
                        <div className="text-sm font-medium text-[var(--text-primary)]">
                          {result.interpretation.sideEffect.display}
                        </div>
                        <div className="flex items-center gap-1.5 text-xs flex-wrap">
                          <span
                            className={`px-1.5 py-0.5 rounded ${
                              codeBadge(result.interpretation.sideEffect.system)
                                .className
                            }`}
                          >
                            {
                              codeBadge(result.interpretation.sideEffect.system)
                                .label
                            }
                          </span>
                          <span className="text-[var(--text-secondary)] font-mono">
                            {result.interpretation.sideEffect.code}
                          </span>
                          {result.interpretation.sideEffect.icd10 && (
                            <>
                              <span
                                className={`px-1.5 py-0.5 rounded ${
                                  codeBadge("icd10").className
                                }`}
                              >
                                ICD-10
                              </span>
                              <span className="text-[var(--text-secondary)] font-mono">
                                {result.interpretation.sideEffect.icd10}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-red-300/80 flex items-center gap-1.5">
                        <AlertTriangle size={12} />
                        {result.interpretation.raw?.sideEffectText
                          ? `"${result.interpretation.raw.sideEffectText}" — not in glossary`
                          : "No side-effect detected"}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Data quality snapshot (issue #19) — cohort + global */}
            {result.dataQuality && (
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Database size={14} className="text-[var(--accent-l5)]" />
                  <h3 className="text-sm font-medium text-[var(--text-primary)]">
                    Data quality for this question
                  </h3>
                  <span
                    className="text-xs text-[var(--text-secondary)] cursor-help"
                    title="Share of Condition nodes with a CODED_BY SnomedConcept link, and MedicationRequest nodes with a CODED_BY RxNormConcept link. High coverage means the cohort filter is reliable."
                  >
                    (hover for details)
                  </span>
                </div>

                {/* Cohort-scoped (preferred when we have a cohort) */}
                {result.dataQuality.cohortSize !== undefined && (
                  <div className="mb-4">
                    <div className="text-xs text-[var(--text-secondary)] mb-2 flex items-center gap-1.5">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--accent-l3)]"></span>
                      In this cohort
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
                      <div>
                        <div className="text-[var(--text-secondary)]">
                          Cohort size
                        </div>
                        <div className="text-lg font-semibold text-[var(--accent-l3)]">
                          {result.dataQuality.cohortSize.toLocaleString()}
                        </div>
                      </div>
                      <div>
                        <div className="text-[var(--text-secondary)]">
                          Conditions
                        </div>
                        <div className="text-lg font-semibold text-[var(--text-primary)]">
                          {(
                            result.dataQuality.cohortConditions ?? 0
                          ).toLocaleString()}
                        </div>
                      </div>
                      <div>
                        <div className="text-[var(--text-secondary)]">
                          Med requests
                        </div>
                        <div className="text-lg font-semibold text-[var(--text-primary)]">
                          {(
                            result.dataQuality.cohortMedicationRequests ?? 0
                          ).toLocaleString()}
                        </div>
                      </div>
                      <div>
                        <div className="text-[var(--text-secondary)]">
                          SNOMED coverage
                        </div>
                        <div className="text-lg font-semibold text-[var(--accent-l5)]">
                          {(
                            result.dataQuality.cohortSnomedCoveragePct ?? 0
                          ).toFixed(1)}
                          %
                        </div>
                      </div>
                      <div>
                        <div className="text-[var(--text-secondary)]">
                          RxNorm coverage
                        </div>
                        <div className="text-lg font-semibold text-amber-300">
                          {(
                            result.dataQuality.cohortRxnormCoveragePct ?? 0
                          ).toFixed(1)}
                          %
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Global graph coverage — baseline */}
                <div>
                  <div className="text-xs text-[var(--text-secondary)] mb-2 flex items-center gap-1.5">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--accent-l5)]"></span>
                    Across the whole graph
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    <div>
                      <div className="text-[var(--text-secondary)]">
                        SNOMED coverage
                      </div>
                      <div className="text-lg font-semibold text-[var(--accent-l5)]">
                        {result.dataQuality.snomedCoveragePct.toFixed(1)}%
                      </div>
                    </div>
                    <div>
                      <div className="text-[var(--text-secondary)]">
                        RxNorm coverage
                      </div>
                      <div className="text-lg font-semibold text-amber-300">
                        {result.dataQuality.rxnormCoveragePct.toFixed(1)}%
                      </div>
                    </div>
                    <div>
                      <div className="text-[var(--text-secondary)]">
                        Conditions
                      </div>
                      <div className="text-lg font-semibold text-[var(--text-primary)]">
                        {result.dataQuality.totalConditions.toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div className="text-[var(--text-secondary)]">
                        Medication requests
                      </div>
                      <div className="text-lg font-semibold text-[var(--text-primary)]">
                        {result.dataQuality.totalMedicationRequests.toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Cypher query — annotated sections when the template exposes
                them, otherwise the raw Cypher string. */}
            {showCypher &&
              (result.cypherSections && result.cypherSections.length > 0 ? (
                <div className="space-y-2">
                  {result.cypherSections.map((section, i) => (
                    <div
                      key={i}
                      className={`rounded-lg border p-3 ${
                        section.layer
                          ? LAYER_ACCENT[section.layer].replace(
                              "bg-",
                              "bg-opacity-10 bg-",
                            )
                          : "bg-[var(--surface)] border-[var(--border)]"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        {section.layer && (
                          <span
                            className={`px-1.5 py-0.5 rounded text-xs font-mono border ${
                              LAYER_ACCENT[section.layer]
                            }`}
                          >
                            {section.layer}
                          </span>
                        )}
                        <span className="text-xs font-medium text-[var(--text-primary)]">
                          {section.label}
                        </span>
                      </div>
                      <pre className="text-xs font-mono text-[var(--text-secondary)] overflow-x-auto whitespace-pre-wrap">
                        {section.cypher}
                      </pre>
                    </div>
                  ))}
                </div>
              ) : (
                result.cypher && (
                  <pre className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3 text-xs font-mono text-[var(--text-secondary)] overflow-x-auto whitespace-pre-wrap">
                    {result.cypher}
                  </pre>
                )
              ))}

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
                            title={
                              col === "score"
                                ? "Lucene relevance score — higher means the node's indexed text matched the query terms more strongly. Not a statistical frequency."
                                : col === "frequencyPct"
                                  ? "Percentage of the cohort that has the side-effect recorded (0–100)."
                                  : undefined
                            }
                            className="px-4 py-2.5 text-left text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider"
                          >
                            {col}
                            {(col === "score" || col === "frequencyPct") && (
                              <span className="ml-1 text-gray-500 cursor-help">
                                ⓘ
                              </span>
                            )}
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
                              {formatCellValue(col, row[col])}
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
