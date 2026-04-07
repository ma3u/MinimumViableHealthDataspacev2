"use client";

import { fetchApi } from "@/lib/api";
import { useEffect, useState } from "react";
import { Lightbulb, Shield, TrendingUp, Activity } from "lucide-react";
import PageIntro from "@/components/PageIntro";

interface Finding {
  insightId: string;
  studyId: string;
  finding: string;
  relevantConditions: string[];
  recommendation: string;
  evidenceLevel: string;
}

interface Recommendation {
  category: string;
  action: string;
  priority: "high" | "medium" | "low";
  basedOn: string;
  ehdsArticle: string;
}

interface DonatedStudy {
  studyId: string;
  studyName: string;
  grantedAt: string;
  status: string;
}

interface Insights {
  activeDonations: number;
  activeStudies: number;
  donatedStudies: DonatedStudy[];
  findings: Finding[];
  recommendations: Recommendation[];
  privacyNote: string;
}

const PRIORITY_COLORS = {
  high: "border-red-700 bg-red-900/10",
  medium: "border-yellow-700 bg-yellow-900/10",
  low: "border-[var(--border)] bg-[var(--surface-2)]/50",
};

const EVIDENCE_BADGE: Record<string, string> = {
  high: "bg-green-900/40 text-green-400",
  moderate: "bg-yellow-900/40 text-yellow-400",
  low: "bg-[var(--surface-2)] text-[var(--text-secondary)]",
};

const DEMO_PATIENT_ID = "demo-patient-1";

export default function ResearchInsightsPage() {
  const [insights, setInsights] = useState<Insights | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchApi(`/api/patient/insights?patientId=${DEMO_PATIENT_ID}`)
      .then((r) => r.json())
      .then((d) => setInsights(d))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <div className="max-w-3xl mx-auto px-6 py-10">
        <PageIntro
          title="Research Insights & Medical Recommendations"
          icon={Lightbulb}
          description="Anonymised findings from research studies that used your donated EHR data. Personalised medical recommendations derived from aggregate results — never individual-level data."
          prevStep={{ href: "/patient/research", label: "Research Programs" }}
          nextStep={{ href: "/patient", label: "Health Records" }}
          infoText="All findings are from aggregate analyses (k ≥ 5 participants). Your data contributes to research that benefits everyone — including you."
          docLink={{ href: "/docs/user-guide", label: "Patient Rights Guide" }}
        />

        {/* Privacy guarantee */}
        <div className="mb-6 rounded-lg border border-violet-700 bg-violet-900/20 p-3 flex items-start gap-2">
          <Shield size={16} className="mt-0.5 shrink-0 text-violet-400" />
          <div className="text-xs text-violet-300">
            {insights?.privacyNote ??
              "All findings are aggregate results (k ≥ 5). Your individual data is never shared with researchers — only pseudonymised summaries reach the Secure Processing Environment (EHDS Art. 50)."}
          </div>
        </div>

        {loading ? (
          <div className="text-[var(--text-secondary)] text-sm">
            Loading insights…
          </div>
        ) : !insights ? (
          <div className="text-[var(--text-secondary)] text-sm">
            No insights available.
          </div>
        ) : (
          <div className="space-y-8">
            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
              {[
                {
                  label: "Active donations",
                  value: insights.activeDonations,
                  icon: Activity,
                  color: "text-teal-400",
                },
                {
                  label: "Active SPE studies",
                  value: insights.activeStudies,
                  icon: TrendingUp,
                  color: "text-blue-400",
                },
                {
                  label: "Research findings",
                  value: insights.findings.length,
                  icon: Lightbulb,
                  color: "text-yellow-400",
                },
              ].map(({ label, value, icon: Icon, color }) => (
                <div
                  key={label}
                  className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/50 p-3 text-center"
                >
                  <Icon size={20} className={`mx-auto mb-1 ${color}`} />
                  <div className={`text-2xl font-bold ${color}`}>{value}</div>
                  <div className="text-xs text-[var(--text-secondary)]">
                    {label}
                  </div>
                </div>
              ))}
            </div>

            {/* Research findings */}
            {insights.findings.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <TrendingUp size={18} className="text-blue-400" />
                  Aggregate Research Findings
                </h2>
                <div className="space-y-3">
                  {insights.findings.map((f) => (
                    <div
                      key={f.insightId}
                      data-testid="research-finding"
                      className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/50 p-4"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <span className="text-xs text-[var(--text-secondary)] font-mono">
                          {f.studyId}
                        </span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded font-medium ${
                            EVIDENCE_BADGE[f.evidenceLevel] ??
                            EVIDENCE_BADGE.low
                          }`}
                        >
                          {f.evidenceLevel} evidence
                        </span>
                      </div>
                      <p className="text-sm text-gray-200 mb-2">{f.finding}</p>
                      {f.recommendation && (
                        <div className="rounded bg-teal-900/20 border border-teal-800 p-2 text-xs text-teal-300">
                          <strong>For you:</strong> {f.recommendation}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Personalised recommendations */}
            {insights.recommendations.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <Lightbulb size={18} className="text-yellow-400" />
                  Personalised Recommendations
                </h2>
                <div className="space-y-3">
                  {insights.recommendations.map((rec, i) => (
                    <div
                      key={i}
                      data-testid="recommendation-card"
                      className={`rounded-xl border p-4 ${
                        PRIORITY_COLORS[rec.priority]
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-sm capitalize">
                          {rec.category}
                        </span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded font-medium ${
                            rec.priority === "high"
                              ? "bg-red-900/40 text-red-400"
                              : rec.priority === "medium"
                                ? "bg-yellow-900/40 text-yellow-400"
                                : "bg-[var(--surface-2)] text-[var(--text-secondary)]"
                          }`}
                        >
                          {rec.priority} priority
                        </span>
                      </div>
                      <p className="text-sm text-gray-200 mb-1.5">
                        {rec.action}
                      </p>
                      <div className="text-xs text-[var(--text-secondary)]">
                        Based on: {rec.basedOn} ·{" "}
                        <span className="text-gray-600">{rec.ehdsArticle}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Donated studies */}
            {insights.donatedStudies.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold mb-3">
                  Studies Using My Data
                </h2>
                <table className="text-xs w-full border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-[var(--text-secondary)]">
                      <th className="text-left pb-1">Study</th>
                      <th className="text-left pb-1">Consented</th>
                      <th className="text-left pb-1">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {insights.donatedStudies.map((s) => (
                      <tr
                        key={s.studyId}
                        className="border-b border-[var(--border)]"
                      >
                        <td className="py-1.5 pr-3">
                          {s.studyName || s.studyId}
                        </td>
                        <td className="py-1.5 pr-3 text-[var(--text-secondary)]">
                          {s.grantedAt?.slice(0, 10) || "—"}
                        </td>
                        <td className="py-1.5">
                          <span className="text-teal-400">{s.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
