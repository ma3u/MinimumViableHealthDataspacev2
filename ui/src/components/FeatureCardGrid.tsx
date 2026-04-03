"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useDemoPersona } from "@/lib/use-demo-persona";
import { Check, type LucideIcon } from "lucide-react";

const IS_STATIC = process.env.NEXT_PUBLIC_STATIC_EXPORT === "true";

/** Routes that are most relevant for each role. */
const ROLE_PATHS: Record<string, string[]> = {
  PATIENT: ["/patient", "/graph"],
  DATA_HOLDER: [
    "/graph",
    "/catalog",
    "/eehrxf",
    "/data/share",
    "/negotiate",
    "/credentials",
    "/settings",
  ],
  DATA_USER: [
    "/graph",
    "/catalog",
    "/analytics",
    "/query",
    "/data/discover",
    "/negotiate",
    "/data/transfer",
    "/tasks",
    "/credentials",
    "/settings",
  ],
  HDAB_AUTHORITY: ["/graph", "/compliance", "/credentials"],
  EDC_ADMIN: [
    "/graph",
    "/catalog",
    "/patient",
    "/analytics",
    "/eehrxf",
    "/query",
    "/data/share",
    "/data/discover",
    "/negotiate",
    "/data/transfer",
    "/tasks",
    "/compliance",
    "/credentials",
    "/onboarding",
    "/settings",
    "/admin",
    "/docs",
  ],
  TRUST_CENTER_OPERATOR: ["/graph", "/compliance", "/credentials"],
};

export interface FeatureCard {
  href: string;
  icon: LucideIcon;
  label: string;
  desc: string;
  color: string;
}

export function FeatureCardGrid({
  cards,
  delay,
}: {
  cards: FeatureCard[];
  delay: number;
}) {
  const { data: session } = useSession();
  const demoPersona = useDemoPersona();

  // Determine active roles
  let roles: readonly string[] = [];
  if (IS_STATIC) {
    roles = demoPersona.roles;
  } else if (session) {
    roles = (session as { roles?: string[] }).roles ?? [];
  }

  // Build set of highlighted paths
  const highlighted = new Set<string>();
  for (const role of roles) {
    for (const p of ROLE_PATHS[role] ?? []) {
      highlighted.add(p);
    }
  }

  const isLoggedIn = IS_STATIC || !!session;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
      {cards.map(({ href, icon: Icon, label, desc, color }, i) => {
        const isRelevant = isLoggedIn && highlighted.has(href);
        return (
          <Link
            key={href}
            href={href}
            className={`relative border rounded-xl p-4 sm:p-5 transition-colors ${color} animate-fade-in-up ${
              isRelevant ? "ring-2 ring-white/20" : ""
            }`}
            style={{ animationDelay: `${delay + i * 60}ms` }}
          >
            <div className="flex items-center gap-2 mb-2">
              <Icon size={20} aria-hidden="true" />
              <span className="font-semibold text-sm sm:text-base">
                {label}
              </span>
              {isRelevant && (
                <span
                  className="ml-auto flex-shrink-0 w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center"
                  title="Relevant for your role"
                >
                  <Check
                    size={12}
                    className="text-green-400"
                    aria-hidden="true"
                  />
                </span>
              )}
            </div>
            <p className="text-sm text-gray-400 leading-relaxed">{desc}</p>
          </Link>
        );
      })}
    </div>
  );
}
