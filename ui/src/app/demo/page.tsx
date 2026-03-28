"use client";

/**
 * Demo Persona Hub — /demo
 *
 * Static GitHub Pages entry point. Click a persona card to:
 *   1. Store the username in localStorage (demo-persona key)
 *   2. Navigate to that persona's primary feature page
 *
 * From that point on, Navigation and UserMenu read the stored persona and
 * render the correct role-filtered view without any Keycloak session.
 */

import { useRouter } from "next/navigation";
import {
  Shield,
  User,
  BarChart2,
  ShieldCheck,
  Network,
  Heart,
  Users,
  ArrowRight,
} from "lucide-react";
import { DEMO_PERSONAS, ROLE_LABELS } from "@/lib/auth";
import { setDemoPersona } from "@/lib/use-demo-persona";

/** Where each persona lands after selection */
const PERSONA_HOME: Record<string, string> = {
  "edc-admin": "/graph?persona=edc-admin",
  hospital: "/catalog",
  researcher: "/analytics",
  hdab: "/compliance",
  patient: "/patient/profile",
  default: "/graph",
};

/** Icon per persona */
const PERSONA_ICON: Record<string, React.ReactNode> = {
  "edc-admin": <Network size={24} />,
  hospital: <Shield size={24} />,
  researcher: <BarChart2 size={24} />,
  hdab: <ShieldCheck size={24} />,
  patient: <Heart size={24} />,
  default: <User size={24} />,
};

export default function DemoHubPage() {
  const router = useRouter();

  function handleSelect(username: string, personaId: string) {
    setDemoPersona(username);
    router.push(PERSONA_HOME[personaId] ?? "/graph");
  }

  // Deduplicate by personaId to group similar roles (clinicuser + lmcuser both map to hospital)
  const seen = new Set<string>();
  const uniquePersonas = DEMO_PERSONAS.filter((p) => {
    const key = `${p.username}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return (
    <div className="max-w-4xl mx-auto px-6 py-14">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <Users size={28} className="text-layer1" />
        <h1 className="text-3xl font-bold">Demo Persona Selector</h1>
      </div>
      <p className="text-gray-400 mb-2">
        Explore the Health Dataspace as any of the 7 demo participants — no
        login required.
      </p>
      <p className="text-sm text-gray-500 mb-10">
        Select a persona below. Navigation, data, and views will update to match
        that participant&apos;s role. Switch anytime via the user menu{" "}
        <span className="text-gray-400">→</span> <em>Switch demo persona</em>.
      </p>

      {/* Persona cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {uniquePersonas.map((persona) => {
          const primaryRole = [...persona.roles].find((r) =>
            [
              "EDC_ADMIN",
              "HDAB_AUTHORITY",
              "DATA_HOLDER",
              "DATA_USER",
              "PATIENT",
            ].includes(r),
          );

          return (
            <button
              key={persona.username}
              onClick={() => handleSelect(persona.username, persona.personaId)}
              className={`group text-left rounded-2xl border p-6 transition-all hover:scale-[1.02] hover:shadow-lg ${persona.badge} bg-gray-900 hover:bg-gray-800`}
            >
              {/* Icon + username */}
              <div className={`flex items-center gap-3 mb-3 ${persona.color}`}>
                {PERSONA_ICON[persona.personaId] ?? <User size={24} />}
                <span className="font-mono font-semibold text-lg">
                  {persona.username}
                </span>
              </div>

              {/* Organisation */}
              <p className="text-sm text-gray-300 font-medium mb-1">
                {persona.organisation}
              </p>

              {/* Description */}
              <p className="text-xs text-gray-500 mb-4 leading-relaxed">
                {persona.description}
              </p>

              {/* Role badges */}
              <div className="flex flex-wrap gap-1.5 mb-4">
                {([...persona.roles] as string[])
                  .filter((r) => r !== "EDC_USER_PARTICIPANT")
                  .map((r) => (
                    <span
                      key={r}
                      className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium border ${persona.badge}`}
                    >
                      <Shield size={8} />
                      {ROLE_LABELS[r] ?? r}
                    </span>
                  ))}
                {primaryRole === undefined &&
                  ([...persona.roles] as string[]).includes(
                    "EDC_USER_PARTICIPANT",
                  ) && (
                    <span
                      className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium border ${persona.badge}`}
                    >
                      <Shield size={8} />
                      Participant
                    </span>
                  )}
              </div>

              {/* CTA */}
              <div
                className={`flex items-center gap-1 text-xs font-semibold ${persona.color} group-hover:gap-2 transition-all`}
              >
                Start demo
                <ArrowRight size={13} />
              </div>
            </button>
          );
        })}
      </div>

      {/* Footer note */}
      <p className="mt-12 text-xs text-gray-600 text-center">
        Static demo — all data is synthetic. No login, no real patient records.
        <br />
        EHDS Art. 3 · GDPR Art. 15-22 · DSP 2025-1 · FHIR R4 · OMOP CDM
      </p>
    </div>
  );
}
