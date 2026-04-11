"use client";

import { signIn } from "next-auth/react";
import {
  Heart,
  FlaskConical,
  BookOpen,
  ShieldCheck,
  LayoutDashboard,
  Lock,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

const IS_STATIC = process.env.NEXT_PUBLIC_STATIC_EXPORT === "true";

interface PersonaJourney {
  role: string;
  icon: LucideIcon;
  color: string;
  border: string;
  bg: string;
  org: string;
  loginAs: string;
  steps: { page: string; action: string }[];
}

const personaJourneys: PersonaJourney[] = [
  {
    role: "Patient",
    icon: Heart,
    color: "text-[var(--role-patient-text)]",
    border: "border-[var(--role-patient-border)]",
    bg: "bg-[var(--role-patient-bg)]",
    org: "AlphaKlinik Berlin",
    loginAs: "patient1",
    steps: [
      {
        page: "/patient/profile",
        action: "View your EHR: conditions, medications, observations",
      },
      {
        page: "/patient/research",
        action: "See which research programmes use your data",
      },
      {
        page: "/patient/insights",
        action: "Review AI-generated health insights",
      },
      {
        page: "/graph",
        action: "Explore your clinical data in the knowledge graph",
      },
    ],
  },
  {
    role: "Researcher",
    icon: FlaskConical,
    color: "text-[var(--role-user-text)]",
    border: "border-[var(--role-user-border)]",
    bg: "bg-[var(--role-user-bg)]",
    org: "PharmaCo Research AG",
    loginAs: "researcher",
    steps: [
      {
        page: "/data/discover",
        action: "Search the federated HealthDCAT-AP catalogue",
      },
      {
        page: "/negotiate",
        action: "Request data access via DSP 2025-1 contract",
      },
      { page: "/data/transfer", action: "Receive approved FHIR R4 bundles" },
      { page: "/analytics", action: "Run OMOP CDM cohort analytics" },
    ],
  },
  {
    role: "Hospital",
    icon: BookOpen,
    color: "text-[var(--role-holder-text)]",
    border: "border-[var(--role-holder-border)]",
    bg: "bg-[var(--role-holder-bg)]",
    org: "AlphaKlinik Berlin",
    loginAs: "clinicuser",
    steps: [
      {
        page: "/catalog",
        action: "Publish FHIR datasets as HealthDCAT-AP entries",
      },
      {
        page: "/data/share",
        action: "Register data assets in the dataspace",
      },
      {
        page: "/negotiate",
        action: "Review and approve incoming data requests",
      },
      {
        page: "/credentials",
        action: "Manage verifiable credentials and DID identity",
      },
    ],
  },
  {
    role: "Regulator",
    icon: ShieldCheck,
    color: "text-[var(--role-hdab-text)]",
    border: "border-[var(--role-hdab-border)]",
    bg: "bg-[var(--role-hdab-bg)]",
    org: "MedReg DE (HDAB)",
    loginAs: "regulator",
    steps: [
      {
        page: "/compliance",
        action: "Review data access permit applications (Art. 46)",
      },
      {
        page: "/admin/policies",
        action: "Audit ODRL policies and compliance rules",
      },
      {
        page: "/credentials",
        action: "Issue and verify participant credentials",
      },
      {
        page: "/graph",
        action: "Inspect trust anchors in the knowledge graph",
      },
    ],
  },
  {
    role: "Admin",
    icon: LayoutDashboard,
    color: "text-[var(--role-admin-text)]",
    border: "border-[var(--role-admin-border)]",
    bg: "bg-[var(--role-admin-bg)]",
    org: "Dataspace Operator",
    loginAs: "edcadmin",
    steps: [
      {
        page: "/admin",
        action: "Manage participants, connectors, and topology",
      },
      {
        page: "/graph",
        action: "Explore all 5 architecture layers at once",
      },
      {
        page: "/onboarding",
        action: "Onboard new participants with DID:web",
      },
      {
        page: "/settings",
        action: "Configure connector endpoints and policies",
      },
    ],
  },
];

export function PersonaJourneyCards() {
  return (
    <div
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4"
      role="list"
      aria-label="Persona user journeys"
    >
      {personaJourneys.map((persona, pi) => {
        const PersonaIcon = persona.icon;
        return (
          <div
            key={persona.role}
            role="listitem"
            className={`rounded-xl border ${persona.border} ${persona.bg} p-4 sm:p-5 animate-fade-in-up flex flex-col`}
            style={{ animationDelay: `${300 + pi * 80}ms` }}
          >
            <div className="flex items-center gap-2 mb-1">
              <PersonaIcon
                size={18}
                className={persona.color}
                aria-hidden="true"
              />
              <h3 className="font-semibold text-sm sm:text-base text-gray-900 dark:text-gray-100">
                {persona.role}
              </h3>
            </div>
            <p className="text-[11px] text-gray-700 dark:text-gray-300 mb-3">
              {persona.org} · login as{" "}
              <code className="font-mono text-gray-700 dark:text-gray-300">
                {persona.loginAs}
              </code>
            </p>

            <ol
              className="space-y-2 flex-1"
              aria-label={`${persona.role} journey steps`}
            >
              {persona.steps.map((step, si) => (
                <li key={si} className="flex gap-2 items-start">
                  <span
                    className="flex-shrink-0 w-5 h-5 rounded-full bg-[var(--surface-2)] flex items-center justify-center text-[10px] font-bold text-gray-700 dark:text-gray-300 mt-0.5"
                    aria-hidden="true"
                  >
                    {si + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs text-gray-800 dark:text-gray-200 leading-relaxed">
                      {step.action}
                    </p>
                    <p className="text-[10px] text-gray-600 dark:text-gray-400 font-mono">
                      {step.page}
                    </p>
                  </div>
                </li>
              ))}
            </ol>

            {IS_STATIC ? (
              <Link
                href={persona.steps[0].page}
                className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-gray-800 dark:text-gray-200 hover:text-gray-900 dark:hover:text-white transition-colors touch-target-sm"
              >
                <span>Start journey</span>
                <ArrowRight size={12} aria-hidden="true" />
              </Link>
            ) : (
              <button
                type="button"
                onClick={() =>
                  signIn(
                    "keycloak",
                    { callbackUrl: persona.steps[0].page },
                    { login_hint: persona.loginAs },
                  )
                }
                className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-gray-800 dark:text-gray-200 hover:text-gray-900 dark:hover:text-white transition-colors touch-target-sm cursor-pointer text-left"
              >
                <Lock size={10} aria-hidden="true" />
                <span>Sign in & start</span>
                <ArrowRight size={12} aria-hidden="true" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
