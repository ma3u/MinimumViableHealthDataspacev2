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
  /** Lucide icon component for the page title */
  icon?: LucideIcon;
  /** 2-3 sentence explanation of what this page does */
  description: string;
  /** Info callout text shown in a highlighted box */
  infoText?: string;
  /** Link to relevant documentation */
  docLink?: DocLink;
  /** Previous step in the user workflow */
  prevStep?: StepLink;
  /** Next step in the user workflow */
  nextStep?: StepLink;
}

/**
 * Shared page header component providing consistent layout across all pages.
 * Displays title, description, workflow navigation (previous/next step),
 * and an expandable info callout with documentation links.
 */
export default function PageIntro({
  title,
  icon: Icon,
  description,
  infoText,
  docLink,
  prevStep,
  nextStep,
}: PageIntroProps) {
  const [infoOpen, setInfoOpen] = useState(false);

  return (
    <div className="mb-8">
      {/* Title row */}
      <div className="flex items-center gap-2 mb-1">
        {Icon && <Icon size={22} className="text-[var(--text-secondary)]" />}
        <h1 className="text-2xl font-bold">{title}</h1>
      </div>

      {/* Description */}
      <p className="text-[var(--text-secondary)] text-sm mb-4 max-w-3xl">
        {description}
      </p>

      {/* Workflow navigation: step before / step after */}
      {(prevStep || nextStep) && (
        <div className="flex items-center gap-4 text-xs text-[var(--text-secondary)] mb-4">
          {prevStep && (
            <Link
              href={prevStep.href}
              className="flex items-center gap-1 hover:text-[var(--text-primary)] transition-colors"
            >
              <ArrowLeft size={12} />
              <span>{prevStep.label}</span>
            </Link>
          )}
          {prevStep && nextStep && <span className="text-gray-700">|</span>}
          {nextStep && (
            <Link
              href={nextStep.href}
              className="flex items-center gap-1 hover:text-[var(--text-primary)] transition-colors"
            >
              <span>{nextStep.label}</span>
              <ArrowRight size={12} />
            </Link>
          )}
        </div>
      )}

      {/* Info callout with documentation link */}
      {(infoText || docLink) && (
        <div className="mb-2">
          <button
            onClick={() => setInfoOpen(!infoOpen)}
            className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            <Info size={14} />
            <span>{infoOpen ? "Hide details" : "How does this work?"}</span>
          </button>

          {infoOpen && (
            <div className="mt-2 p-3 rounded-lg bg-blue-500/5 border border-blue-500/20 text-sm text-[var(--text-primary)] max-w-3xl">
              {infoText && <p className="mb-2">{infoText}</p>}
              {docLink && (
                <Link
                  href={docLink.href}
                  target={docLink.external ? "_blank" : undefined}
                  rel={docLink.external ? "noopener noreferrer" : undefined}
                  className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 text-xs"
                >
                  {docLink.external ? (
                    <ExternalLink size={12} />
                  ) : (
                    <Info size={12} />
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
