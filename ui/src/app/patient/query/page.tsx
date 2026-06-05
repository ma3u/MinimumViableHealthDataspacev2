"use client";

/**
 * Personal Research — a natural-language-query page over the patient's OWN data
 * (EHDS Art. 3 / GDPR Art. 15 primary use). Type a question (or tap a
 * suggestion) and Send; the answer + trend graphs — computed only from the
 * patient's own fitness / lab / nutrition records — appear in the conversation.
 * No LLM in the static demo: free text is keyword-matched to a predefined
 * answer. Synthetic · illustrative.
 */
import { useState } from "react";
import {
  Sparkles,
  Activity,
  Salad,
  Wind,
  Bug,
  Scissors,
  Syringe,
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
  type ResearchQA,
} from "@/lib/personal-research";

const QA_ICON: Record<string, LucideIcon> = {
  sport: Activity,
  nutrition: Salad,
  breathing: Wind,
  infections: Bug,
  surgeries: Scissors,
  vaccines: Syringe,
};

/** Badge colour per ePA event type. */
const EPA_TYPE_COLOR: Record<string, string> = {
  Infection: "#CA6F1E",
  Surgery: "#2471A3",
  Vaccination: "#1E8449",
  Diagnosis: "#7D3C98",
};

interface Message {
  role: "user" | "assistant";
  text: string;
  qa?: ResearchQA;
  fallback?: boolean;
}

export default function PersonalQueryPage() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);

  function send(text: string) {
    const q = text.trim();
    if (!q) return;
    const qa = matchPersonalResearch(q);
    setMessages((m) => [
      ...m,
      { role: "user", text: q },
      qa
        ? { role: "assistant", text: qa.answer, qa }
        : {
            role: "assistant",
            fallback: true,
            text: "I can only answer from your own fitness, lab and nutrition records. Try asking about your sport routine, your nutrition, or your breathing exercises.",
          },
    ]);
    setInput("");
  }

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <div className="max-w-3xl mx-auto px-6 py-10">
        <PageIntro
          title="Personal Research"
          icon={Sparkles}
          description="Ask a question about your own health data — fitness, lab and nutrition trends, or your ePA record (infections, surgeries, vaccinations and more). Answers are computed only from your own records (EHDS Art. 3 / GDPR Art. 15 — primary use). Synthetic · illustrative — not medical advice."
          prevStep={{ href: "/patient", label: "My Health Records" }}
          nextStep={{ href: "/patient/insights", label: "Research Insights" }}
          infoText="This is primary use: you query your own data. It never leaves your record and is not compared against other patients. The static demo matches your free-text question to a predefined answer by keyword (no AI model)."
        />

        {/* Conversation */}
        <div className="space-y-4 mb-5 min-h-[80px]">
          {messages.length === 0 && (
            <div className="text-center text-sm text-[var(--text-secondary)] py-8 rounded-xl border border-dashed border-[var(--border)]">
              Type a question below — or tap a suggestion — to see an answer
              from your own data.
            </div>
          )}
          {messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="flex justify-end">
                <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-[var(--accent)] text-white px-4 py-2.5 text-sm">
                  {m.text}
                </p>
              </div>
            ) : (
              <div
                key={i}
                className="rounded-2xl rounded-bl-sm border border-[var(--border)] bg-[var(--surface)] p-4"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="grid place-items-center w-8 h-8 rounded-lg text-white shrink-0"
                    style={{ background: m.fallback ? "#64748b" : "#7D3C98" }}
                  >
                    {(() => {
                      const Icon = m.qa ? QA_ICON[m.qa.id] ?? Sparkles : Info;
                      return <Icon size={16} />;
                    })()}
                  </span>
                  <span className="text-xs font-bold uppercase tracking-wide text-[var(--text-secondary)]">
                    Your data assistant
                  </span>
                </div>
                <p className="text-sm text-[var(--text-primary)] leading-relaxed mb-3">
                  {m.text}
                </p>
                {m.qa && (
                  <>
                    {m.qa.trends && (
                      <div className="grid sm:grid-cols-2 gap-2.5">
                        {m.qa.trends.map((t) => (
                          <MetricTrendRow key={t.label} s={t} />
                        ))}
                      </div>
                    )}
                    {m.qa.events && (
                      <ul className="space-y-1.5">
                        {m.qa.events.map((e) => (
                          <li
                            key={e.label}
                            className="flex items-center gap-2.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-3 py-2"
                          >
                            <span
                              className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white shrink-0 w-[88px] text-center"
                              style={{
                                background: EPA_TYPE_COLOR[e.type] ?? "#7D3C98",
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
                      <ShieldCheck size={12} /> {m.qa.source}
                    </p>
                  </>
                )}
              </div>
            ),
          )}
        </div>

        {/* Suggestions */}
        <p className="section-label mb-2">Suggested questions</p>
        <div className="flex flex-col gap-2 mb-4">
          {personalResearchQA.map((qa) => {
            const Icon = QA_ICON[qa.id] ?? Sparkles;
            return (
              <button
                key={qa.id}
                type="button"
                onClick={() => send(qa.question)}
                className="flex items-center gap-3 text-left rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 hover:border-[var(--accent)] transition-colors"
              >
                <Icon
                  size={16}
                  className="shrink-0 text-[var(--accent)]"
                  aria-hidden="true"
                />
                <span className="text-sm text-[var(--text-primary)]">
                  {qa.question}
                </span>
              </button>
            );
          })}
        </div>

        {/* Free-text input */}
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
        <p className="text-[11px] text-[var(--text-secondary)] mt-2">
          Your own records only · synthetic · not medical advice
        </p>
      </div>
    </div>
  );
}
