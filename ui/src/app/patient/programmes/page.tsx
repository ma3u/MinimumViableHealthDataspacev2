"use client";

import { fetchApi } from "@/lib/api";
import { useEffect, useState } from "react";
import { Gift, ShieldCheck, Lock } from "lucide-react";
import PageIntro from "@/components/PageIntro";
import { useT } from "@/lib/i18n/translate";
import type { BonusProgramme } from "@/lib/patient/bonus-programme";

/** Why the programmes did not load: refused (401, 403) or failed (anything else). */
type LoadError =
  | { kind: "refused" }
  | { kind: "failed"; status: number | null };

/**
 * Bonus programmes from other data spaces (#934, step 3). The catalogue
 * crawler finds them as DCAT-AP offerings; this page lists them. A programme
 * receives a yes or no per year, never the data behind it (ADR-080), and it
 * is neither research nor the Art. 71 opt-out, so it has its own page.
 * Joining and withdrawing are step 4.
 */
export default function BonusProgrammesPage() {
  const t = useT("patient");
  const tn = useT("nav");
  const [programmes, setProgrammes] = useState<BonusProgramme[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<LoadError | null>(null);

  useEffect(() => {
    fetchApi("/api/patient/programmes")
      .then(async (r) => {
        if (!r.ok) {
          setLoadError(
            r.status === 401 || r.status === 403
              ? { kind: "refused" }
              : { kind: "failed", status: r.status },
          );
          return;
        }
        const d = await r.json();
        setProgrammes(Array.isArray(d.programmes) ? d.programmes : []);
      })
      .catch(() => setLoadError({ kind: "failed", status: null }))
      .finally(() => setLoading(false));
  }, []);

  const dataSpaceName = (id: string | null) =>
    id === "insurance-wellbeing"
      ? t("Insurance and wellbeing data space")
      : t("Another data space");

  return (
    <div className="min-h-screen bg-(--bg)">
      <div className="max-w-3xl mx-auto px-6 py-10">
        <PageIntro
          title={tn("Bonus Programs")}
          icon={Gift}
          description={t(
            "Offers from other data spaces that reward what you do for your health. A program receives a yes or no once a year, never the data behind it. Whether you join is your decision alone (GDPR Art. 9(2)(a)).",
          )}
          prevStep={{
            href: "/patient/research",
            label: tn("Research Programs"),
          }}
          nextStep={{
            href: "/patient/insights",
            label: tn("Research Insights"),
          }}
          infoText={t(
            "A bonus program is not research and not the opt-out. Joining one never enrolls you in a study, and your opt-out from secondary use (EHDS Art. 71) does not stop sharing you start yourself.",
          )}
        />

        {loading ? (
          <div className="text-(--text-secondary) text-sm">
            {t("Loading bonus programs…")}
          </div>
        ) : loadError ? (
          <div
            role="alert"
            data-testid="programmes-load-error"
            className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-3 text-sm text-amber-900 dark:text-amber-200"
          >
            {loadError.kind === "refused"
              ? t(
                  "You may not see the bonus programs: they are shown to patients. If your session has ended, sign in again.",
                )
              : loadError.status
                ? t(
                    "The bonus programs could not be loaded (HTTP {status}). Please try again later.",
                    { status: loadError.status },
                  )
                : t(
                    "The bonus programs could not be loaded. Please try again later.",
                  )}
          </div>
        ) : (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">
              {t("Bonus programs on offer ({n})", { n: programmes.length })}
            </h2>

            {programmes.length === 0 && (
              <div className="text-(--text-secondary) text-sm">
                {t(
                  "No bonus program is on offer. The catalogue crawler has not found one in another data space yet.",
                )}
              </div>
            )}

            {programmes.map((p) => (
              <article
                key={p.programmeId}
                data-testid="bonus-programme-card"
                aria-labelledby={`programme-${p.programmeId}`}
                className="rounded-xl border border-(--border) bg-(--surface-2)/50 p-4 space-y-3"
              >
                <header className="flex items-start justify-between gap-3">
                  <div>
                    <h3
                      id={`programme-${p.programmeId}`}
                      className="font-semibold text-sm"
                    >
                      {p.title}
                    </h3>
                    <div className="text-xs text-(--text-secondary)">
                      {p.publisherName}
                    </div>
                  </div>
                  <span className="shrink-0 text-xs text-(--text-secondary) border border-gray-600 rounded-sm px-2 py-0.5">
                    {dataSpaceName(p.dataSpace)}
                  </span>
                </header>

                {p.description && (
                  <p className="text-xs text-(--text-secondary)">
                    {p.description}
                  </p>
                )}

                {p.ruleDescription && (
                  <div className="text-xs">
                    <div className="font-medium">
                      {t("The rule, version {version}", {
                        version: p.ruleVersion ?? "",
                      })}
                    </div>
                    <p className="text-(--text-secondary)">
                      {p.ruleDescription}
                    </p>
                  </div>
                )}

                <div className="grid gap-2 sm:grid-cols-2 text-xs">
                  <div className="rounded-lg border border-teal-700 bg-teal-900/10 p-3">
                    <div className="flex items-center gap-1.5 font-medium text-teal-900 dark:text-teal-200">
                      <ShieldCheck size={14} />
                      {t("What {publisher} receives", {
                        publisher: p.publisherName,
                      })}
                    </div>
                    <p className="text-(--text-secondary) mt-1">
                      {t("The year, and goal met: yes or no.")}
                    </p>
                  </div>
                  <div className="rounded-lg border border-(--border) p-3">
                    <div className="flex items-center gap-1.5 font-medium">
                      <Lock size={14} />
                      {t("What never leaves your record")}
                    </div>
                    <p className="text-(--text-secondary) mt-1">
                      {t(
                        "Steps, heart rate, diagnoses, visit details and any date finer than the year.",
                      )}
                    </p>
                  </div>
                </div>

                <p
                  data-testid="bonus-programme-join-state"
                  className="text-xs text-(--text-secondary)"
                >
                  {t(
                    "You cannot join yet: joining and withdrawing come in the next step.",
                  )}
                </p>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
