"use client";

/**
 * Personal Research — a natural-language-query page over the patient's OWN data
 * (EHDS Art. 3 / GDPR Art. 15 primary use). The query box is at the top; type a
 * question (or tap a suggestion, which fills the box and submits) and the answer
 * — fitness/lab/nutrition trends PLUS relevant ePA events (infections, surgery,
 * vaccinations, diagnoses) — appears below, computed only from the patient's own
 * records. No LLM in the static demo: free text is keyword-matched. Synthetic.
 */
import { useState } from "react";
import {
  Sparkles,
  Activity,
  Salad,
  Wind,
  ShieldCheck,
  Send,
  Info,
  type LucideIcon,
} from "lucide-react";
import PageIntro from "@/components/PageIntro";
import { MetricTrendRow } from "@/components/charts/MetricTrendRow";
import {
  personalResearchQA,
  matchPersonalResearch,
  eventMarkers,
  type ResearchQA,
} from "@/lib/personal-research";

const QA_ICON: Record<string, LucideIcon> = {
  sport: Activity,
  nutrition: Salad,
  breathing: Wind,
};

/** Badge colour per ePA event type. */
const EPA_TYPE_COLOR: Record<string, string> = {
  Infection: "#CA6F1E",
  Surgery: "#2471A3",
  Vaccination: "#1E8449",
  Diagnosis: "#7D3C98",
};

interface Exchange {
  question: string;
  qa: ResearchQA | null;
}

export default function PersonalQueryPage() {
  const [input, setInput] = useState("");
  const [exchanges, setExchanges] = useState<Exchange[]>([]);

  function send(text: string) {
    const q = text.trim();
    if (!q) return;
    setInput(q); // keep the query visible in the box
    // newest first — the latest answer shows directly under the field
    setExchanges((prev) => [
      { question: q, qa: matchPersonalResearch(q) },
      ...prev,
    ]);
  }

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <div className="max-w-3xl mx-auto px-6 py-10">
        <PageIntro
          title="Personal Research"
          icon={Sparkles}
          description="Ask a question about your own health data — fitness, lab and nutrition trends together with your ePA record (infections, surgeries, vaccinations and diagnoses). Answers are computed only from your own records (EHDS Art. 3 / GDPR Art. 15 — primary use). Synthetic · illustrative — not medical advice."
          prevStep={{ href: "/patient", label: "My Health Records" }}
          nextStep={{ href: "/patient/insights", label: "Research Insights" }}
          infoText="This is primary use: you query your own data. It never leaves your record and is not compared against other patients. The static demo matches your free-text question to a predefined answer by keyword (no AI model)."
        />

        {/* Query box — at the top */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            aria-label="Ask a question about your own health data"
            placeholder="Ask about your own health data…"
            className="flex-1 rounded-xl border border-[var(--border-ui)] bg-[var(--surface-card)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
          />
          <button
            type="submit"
            disabled={!input.trim()}
            aria-label="Send question"
            className="grid place-items-center w-12 h-12 rounded-xl text-white shrink-0 transition-all hover:scale-[1.03] disabled:opacity-40 disabled:hover:scale-100"
            style={{ background: "var(--accent)" }}
          >
            <Send size={18} />
          </button>
        </form>

        {/* Suggestions — click fills the box and submits */}
        <div className="flex flex-wrap gap-2 mt-3">
          {personalResearchQA.map((qa) => {
            const Icon = QA_ICON[qa.id] ?? Sparkles;
            return (
              <button
                key={qa.id}
                type="button"
                onClick={() => send(qa.question)}
                className="inline-flex items-center gap-2 text-left rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5 text-xs text-[var(--text-primary)] hover:border-[var(--accent)] transition-colors"
              >
                <Icon
                  size={13}
                  className="shrink-0 text-[var(--accent)]"
                  aria-hidden="true"
                />
                {qa.question}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-[var(--text-secondary)] mt-2">
          Your own records only · synthetic · not medical advice
        </p>

        {/* Answers — below the field, newest first */}
        <div className="space-y-4 mt-6">
          {exchanges.length === 0 && (
            <div className="text-center text-sm text-[var(--text-secondary)] py-8 rounded-xl border border-dashed border-[var(--border)]">
              Ask a question above — or tap a suggestion — to see an answer from
              your own data.
            </div>
          )}
          {exchanges.map((x, i) => {
            const Icon = x.qa ? QA_ICON[x.qa.id] ?? Sparkles : Info;
            return (
              <div key={exchanges.length - i} className="space-y-2">
                {/* question */}
                <div className="flex justify-end">
                  <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-[var(--accent)] text-white px-4 py-2.5 text-sm">
                    {x.question}
                  </p>
                </div>
                {/* answer */}
                <div className="rounded-2xl rounded-bl-sm border border-[var(--border)] bg-[var(--surface)] p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className="grid place-items-center w-8 h-8 rounded-lg text-white shrink-0"
                      style={{ background: x.qa ? "#7D3C98" : "#64748b" }}
                    >
                      <Icon size={16} />
                    </span>
                    <span className="text-xs font-bold uppercase tracking-wide text-[var(--text-secondary)]">
                      Your data assistant
                    </span>
                  </div>
                  {x.qa ? (
                    <>
                      <p className="text-sm text-[var(--text-primary)] leading-relaxed mb-3">
                        {x.qa.answer}
                      </p>
                      <div className="grid sm:grid-cols-2 gap-2.5">
                        {x.qa.trends.map((t) => (
                          <MetricTrendRow
                            key={t.label}
                            s={t}
                            markers={eventMarkers(
                              t,
                              x.qa!.events,
                              (type) => EPA_TYPE_COLOR[type] ?? "#7D3C98",
                            )}
                          />
                        ))}
                      </div>
                      {x.qa.events.length > 0 && (
                        <ul className="space-y-1.5 mt-2.5">
                          <li className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-secondary)]">
                            Related ePA events · marked on the trends
                          </li>
                          {x.qa.events.map((e) => (
                            <li
                              key={e.label}
                              className="flex items-center gap-2.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-3 py-2"
                            >
                              <span
                                className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white shrink-0 w-[88px] text-center"
                                style={{
                                  background:
                                    EPA_TYPE_COLOR[e.type] ?? "#7D3C98",
                                }}
                              >
                                {e.type}
                              </span>
                              <span className="text-xs font-mono text-[var(--text-secondary)] shrink-0">
                                {e.date}
                              </span>
                              <span className="text-sm text-[var(--text-primary)]">
                                {e.label}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                      <p className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)] mt-3">
                        <ShieldCheck size={12} /> {x.qa.source}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-[var(--text-primary)] leading-relaxed">
                      I can only answer from your own fitness, lab, nutrition
                      and ePA records. Try asking about your sport routine, your
                      nutrition, or your breathing &amp; respiratory history.
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
