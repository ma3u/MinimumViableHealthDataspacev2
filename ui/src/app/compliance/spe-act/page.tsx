"use client";

import Link from "next/link";
import { useState } from "react";
import { ExternalLink, Scale } from "lucide-react";
import PageIntro from "@/components/PageIntro";
import { useT } from "@/lib/i18n/translate";
import {
  CHAPTER_TITLE,
  DRAFT_ACT_URL,
  OUR_FEEDBACK_URL,
  SPE_ACT_REQUIREMENTS,
  STATUS_LABEL,
  countByStatus,
  type SpeActRequirement,
  type SpeActStatus,
} from "@/lib/spe-act-requirements";

const DOT: Record<SpeActStatus, string> = {
  met: "bg-emerald-500",
  partial: "bg-amber-400",
  gap: "bg-red-500",
  na: "bg-gray-400",
};

const CHIP: Record<SpeActStatus, string> = {
  met: "text-(--success-text) border-(--success)/40 bg-(--success)/10",
  partial: "text-(--warning-text) border-(--warning)/40 bg-(--warning)/10",
  gap: "text-(--danger-text) border-(--danger)/40 bg-(--danger)/10",
  na: "text-(--text-secondary) border-(--border) bg-(--surface-2)",
};

const ORDER: SpeActStatus[] = ["met", "partial", "gap", "na"];
const CHAPTERS: SpeActRequirement["chapter"][] = [
  "lifecycle",
  "operations",
  "federation",
];

function Evidence({ href, label }: { href: string; label: string }) {
  const t = useT("compliance");
  const external = href.startsWith("http");
  const text =
    label.startsWith("#") || label.startsWith("ADR-") ? label : t(label);
  return external ? (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-0.5 text-(--accent) hover:underline"
    >
      {text}
      <ExternalLink size={10} aria-hidden="true" />
    </a>
  ) : (
    <Link href={href} className="text-(--accent) hover:underline">
      {text}
    </Link>
  );
}

/**
 * The draft Art. 73(5) implementing act on secure processing environments,
 * requirement by requirement, against this demo (#1225, #1236).
 */
export default function SpeActPage() {
  const t = useT("compliance");
  const [filter, setFilter] = useState<SpeActStatus | "all">("all");
  const counts = countByStatus();
  const rows = SPE_ACT_REQUIREMENTS.filter(
    (r) => filter === "all" || r.status === filter,
  );

  return (
    <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <PageIntro
        title={t("SPE requirements")}
        icon={Scale}
        description={t(
          "The draft implementing act on secure processing environments, article by article, against this demo",
        )}
        infoText={t(
          "In November 2026 the Commission published the draft rules that every secure processing environment must follow from 26 March 2029 (EHDS Art. 73(5)). This page lists them in plain words and shows what this demo does about each one. The demo holds synthetic data only: green means the mechanism works here, not that a real operator is compliant.",
        )}
        prevStep={{ href: "/compliance/tck", label: t("Protocol TCK") }}
        nextStep={{ href: "/admin/audit", label: t("Audit & Provenance") }}
      />

      <div className="flex flex-wrap items-center gap-3 text-xs">
        <a
          href={DRAFT_ACT_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-(--accent) hover:underline"
        >
          {t("Read the draft act")}
          <ExternalLink size={11} aria-hidden="true" />
        </a>
        <a
          href={OUR_FEEDBACK_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-(--accent) hover:underline"
        >
          {t("Our feedback")}
          <ExternalLink size={11} aria-hidden="true" />
        </a>
      </div>

      <div
        role="group"
        aria-label={t("Show")}
        className="flex flex-wrap items-center gap-2"
      >
        <button
          type="button"
          aria-pressed={filter === "all"}
          onClick={() => setFilter("all")}
          className={`px-3 py-1 rounded-full text-xs font-semibold border ${
            filter === "all"
              ? "border-(--accent) text-(--accent)"
              : "border-(--border) text-(--text-secondary)"
          }`}
        >
          {t("All")} · {SPE_ACT_REQUIREMENTS.length}
        </button>
        {ORDER.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={filter === s}
            data-testid={`spe-act-count-${s}`}
            onClick={() => setFilter(s)}
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${
              filter === s
                ? CHIP[s]
                : "border-(--border) text-(--text-secondary)"
            }`}
          >
            <span
              aria-hidden="true"
              className={`block h-2.5 w-2.5 rounded-full ${DOT[s]}`}
            />
            {t(STATUS_LABEL[s])} · {counts[s]}
          </button>
        ))}
      </div>

      {CHAPTERS.map((chapter) => {
        const inChapter = rows.filter((r) => r.chapter === chapter);
        if (inChapter.length === 0) return null;
        return (
          <section
            key={chapter}
            aria-labelledby={`spe-act-${chapter}`}
            className="bg-(--surface) border border-(--border) rounded-xl p-5"
          >
            <h2
              id={`spe-act-${chapter}`}
              className="text-base font-semibold text-(--text-primary) mb-3"
            >
              {t(CHAPTER_TITLE[chapter])}
              <span className="ml-2 text-xs font-normal text-(--text-secondary)">
                {t("{n} requirements", { n: inChapter.length })}
              </span>
            </h2>
            <ul className="divide-y divide-(--border)">
              {inChapter.map((r) => (
                <li
                  key={r.id}
                  data-testid={`spe-act-${r.id}`}
                  data-status={r.status}
                  className="py-3 grid grid-cols-1 md:grid-cols-[7rem_1fr_1fr] gap-x-4 gap-y-1"
                >
                  <div className="flex items-start gap-2">
                    <span
                      aria-hidden="true"
                      className={`mt-1 block h-3 w-3 shrink-0 rounded-full ${
                        DOT[r.status]
                      }`}
                    />
                    <div>
                      <p className="text-xs font-semibold text-(--text-primary)">
                        {r.article}
                      </p>
                      <p className="text-[11px] text-(--text-secondary)">
                        {t(STATUS_LABEL[r.status])}
                      </p>
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-(--text-secondary) md:hidden">
                      {t("Requirement")}
                    </p>
                    <p className="text-sm text-(--text-primary)">
                      {t(r.requirement)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-(--text-secondary) md:hidden">
                      {t("In the demo")}
                    </p>
                    <p className="text-sm text-(--text-secondary)">
                      {t(r.demo)}
                    </p>
                    {r.evidence.length > 0 && (
                      <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                        <span className="sr-only">{t("Evidence")}</span>
                        {r.evidence.map((e) => (
                          <Evidence
                            key={e.href}
                            href={e.href}
                            label={e.label}
                          />
                        ))}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </main>
  );
}
