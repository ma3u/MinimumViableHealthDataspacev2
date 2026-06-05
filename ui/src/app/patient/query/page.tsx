"use client";

/**
 * Personal Research — a natural-language-query page over the patient's OWN data
 * (EHDS Art. 3 / GDPR Art. 15 primary use). Three predefined questions; clicking
 * one reveals a synthesised answer + trend graphs computed only from the
 * patient's own fitness / lab / nutrition records. Synthetic · illustrative.
 */
import { useState } from "react";
import {
  Sparkles,
  Activity,
  Salad,
  Wind,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import PageIntro from "@/components/PageIntro";
import { MetricTrendRow } from "@/components/charts/MetricTrendRow";
import { personalResearchQA } from "@/lib/personal-research";

const QA_ICON: Record<string, LucideIcon> = {
  sport: Activity,
  nutrition: Salad,
  breathing: Wind,
};

export default function PersonalQueryPage() {
  const [asked, setAsked] = useState<string[]>([]);
  const askedQA = asked
    .map((id) => personalResearchQA.find((q) => q.id === id))
    .filter((q): q is (typeof personalResearchQA)[number] => Boolean(q));
  const remaining = personalResearchQA.filter((q) => !asked.includes(q.id));

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <div className="max-w-3xl mx-auto px-6 py-10">
        <PageIntro
          title="Personal Research"
          icon={Sparkles}
          description="Ask predefined questions about your own health data. Answers are computed only from your own records (EHDS Art. 3 / GDPR Art. 15 — primary use). Synthetic · illustrative — not medical advice."
          prevStep={{ href: "/patient", label: "My Health Records" }}
          nextStep={{ href: "/patient/insights", label: "Research Insights" }}
          infoText="This is primary use: you query your own data. It never leaves your record and is not compared against other patients. Secondary (population) research runs separately under an HDAB data permit."
        />

        {/* Conversation */}
        <div className="space-y-5 mb-6">
          {askedQA.length === 0 && (
            <div className="text-center text-sm text-[var(--text-secondary)] py-8 rounded-xl border border-dashed border-[var(--border)]">
              Pick a question below — the answer is computed from your own data.
            </div>
          )}
          {askedQA.map((qa) => {
            const Icon = QA_ICON[qa.id] ?? Sparkles;
            return (
              <div key={qa.id} className="space-y-2">
                {/* question (patient) */}
                <div className="flex justify-end">
                  <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-[var(--accent)] text-white px-4 py-2.5 text-sm">
                    {qa.question}
                  </p>
                </div>
                {/* answer (assistant) */}
                <div className="rounded-2xl rounded-bl-sm border border-[var(--border)] bg-[var(--surface)] p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className="grid place-items-center w-8 h-8 rounded-lg text-white shrink-0"
                      style={{ background: "#7D3C98" }}
                    >
                      <Icon size={16} />
                    </span>
                    <span className="text-xs font-bold uppercase tracking-wide text-[var(--text-secondary)]">
                      Your data assistant
                    </span>
                  </div>
                  <p className="text-sm text-[var(--text-primary)] leading-relaxed mb-3">
                    {qa.answer}
                  </p>
                  <div className="grid sm:grid-cols-2 gap-2.5">
                    {qa.trends.map((t) => (
                      <MetricTrendRow key={t.label} s={t} />
                    ))}
                  </div>
                  <p className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)] mt-3">
                    <ShieldCheck size={12} /> {qa.source}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Predefined question chips */}
        {remaining.length > 0 && (
          <div>
            <p className="section-label mb-2">
              {askedQA.length ? "Ask another" : "Try a question"}
            </p>
            <div className="flex flex-col gap-2">
              {remaining.map((qa) => {
                const Icon = QA_ICON[qa.id] ?? Sparkles;
                return (
                  <button
                    key={qa.id}
                    type="button"
                    onClick={() => setAsked((a) => [...a, qa.id])}
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
          </div>
        )}
      </div>
    </div>
  );
}
