"use client";

import Link from "next/link";
import {
  Info,
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";

export interface StepLink {
  href: string;
  label: string;
}

export interface DocLink {
  href: string;
  label: string;
  external?: boolean;
}

export interface PageIntroProps {
  /** Page title */
  title: string;
  /** Lucide icon component — unused in Stitch layout, kept for API compat */
  icon?: LucideIcon;
  /** Subtitle shown below the page-header */
  description: string;
  /** Info callout text shown in an expandable box */
  infoText?: string;
  /** Link to relevant documentation */
  docLink?: DocLink;
  /** Previous step in the user workflow */
  prevStep?: StepLink;
  /** Next step in the user workflow */
  nextStep?: StepLink;
}

/**
 * Shared page header — Stitch "Clinical Clarity" style.
 * Renders page-header utility class (text-4xl font-extrabold tracking-tight).
 */
export default function PageIntro({
  title,
  description,
  infoText,
  docLink,
  prevStep,
  nextStep,
}: PageIntroProps) {
  const [infoOpen, setInfoOpen] = useState(false);

  return (
    <div className="mb-8">
      {/* Title */}
      <h1 className="page-header">{title}</h1>

      {/* Subtitle */}
      <p className="text-[var(--text-secondary)] text-lg mt-1 max-w-3xl">
        {description}
      </p>

      {/* Workflow navigation */}
      {(prevStep || nextStep) && (
        <div className="flex items-center gap-4 text-sm mt-3 text-[var(--text-secondary)]">
          {prevStep && (
            <Link
              href={prevStep.href}
              className="flex items-center gap-1 font-bold text-[var(--accent)] hover:underline"
            >
              <ArrowLeft size={13} />
              {prevStep.label}
            </Link>
          )}
          {prevStep && nextStep && (
            <span className="text-[var(--border-ui)]" aria-hidden="true">
              ·
            </span>
          )}
          {nextStep && (
            <Link
              href={nextStep.href}
              className="flex items-center gap-1 font-bold text-[var(--accent)] hover:underline"
            >
              {nextStep.label}
              <ArrowRight size={13} />
            </Link>
          )}
        </div>
      )}

      {/* Info callout */}
      {(infoText || docLink) && (
        <div className="mt-4">
          <button
            onClick={() => setInfoOpen(!infoOpen)}
            className="flex items-center gap-1.5 text-xs font-bold text-[var(--accent)] hover:opacity-75 transition-opacity"
          >
            <Info size={13} />
            {infoOpen ? "Hide details" : "How does this work?"}
          </button>

          {infoOpen && (
            <div className="mt-2 p-4 rounded-xl bg-[var(--accent)]/5 border border-[var(--accent)]/15 text-sm text-[var(--text-primary)] max-w-3xl">
              {infoText && <p className="mb-2">{infoText}</p>}
              {docLink && (
                <Link
                  href={docLink.href}
                  target={docLink.external ? "_blank" : undefined}
                  rel={docLink.external ? "noopener noreferrer" : undefined}
                  className="inline-flex items-center gap-1 text-xs font-bold text-[var(--accent)] hover:underline"
                >
                  {docLink.external ? (
                    <ExternalLink size={11} />
                  ) : (
                    <Info size={11} />
                  )}
                  {docLink.label}
                </Link>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
