"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useDemoPersona } from "@/lib/use-demo-persona";
import {
  Check,
  Network,
  BookOpen,
  ShieldCheck,
  User,
  BarChart2,
  Layers,
  ArrowRightLeft,
  FileJson2,
  FileText,
  LayoutDashboard,
  Search,
  Handshake,
  UserPlus,
  MessageSquare,
  ClipboardList,
  Settings,
  Award,
  type LucideIcon,
} from "lucide-react";
import { IS_STATIC } from "@/lib/static-export";

/** Routes that are most relevant for each role. */
const ROLE_PATHS: Record<string, string[]> = {
  PATIENT: ["/patient", "/overview", "/eehrxf"],
  DATA_HOLDER: [
    "/overview",
    "/catalog",
    "/eehrxf",
    "/data/share",
    "/negotiate",
    "/data/transfer",
    "/tasks",
    "/credentials",
    "/settings",
  ],
  DATA_USER: [
    "/overview",
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
  HDAB_AUTHORITY: ["/overview", "/compliance", "/credentials"],
  EDC_ADMIN: [
    "/overview",
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
  TRUST_CENTER_OPERATOR: ["/overview", "/compliance", "/credentials"],
};

type Layer = 1 | 2 | 3 | 4 | 5;

interface FeatureCard {
  href: string;
  icon: LucideIcon;
  label: string;
  desc: string;
  layer: Layer;
}

/** Full class names, so Tailwind's scanner sees every one of them. */
const LAYER_STYLE: Record<Layer, { card: string; tile: string }> = {
  1: {
    card: "border-layer1 hover:bg-layer1/10",
    tile: "bg-layer1/15 text-layer1-safe",
  },
  2: {
    card: "border-layer2 hover:bg-layer2/10",
    tile: "bg-layer2/15 text-layer2-safe",
  },
  3: {
    card: "border-layer3 hover:bg-layer3/10",
    tile: "bg-layer3/15 text-layer3-safe",
  },
  4: {
    card: "border-layer4 hover:bg-layer4/10",
    tile: "bg-layer4/15 text-layer4-safe",
  },
  5: {
    card: "border-layer5 hover:bg-layer5/10",
    tile: "bg-layer5/15 text-layer5-safe",
  },
};

const exploreCards: FeatureCard[] = [
  {
    href: "/overview",
    icon: Network,
    label: "Persona Overview",
    desc: "One view per persona: what is out of range, due, broken, and what to do next",
    layer: 1,
  },
  {
    href: "/catalog",
    icon: BookOpen,
    label: "Dataset Catalog",
    desc: "HealthDCAT-AP metadata for all published datasets",
    layer: 2,
  },
  {
    href: "/patient",
    icon: User,
    label: "Patient Journey",
    desc: "FHIR R4 clinical timeline with OMOP CDM mapping",
    layer: 3,
  },
  {
    href: "/analytics",
    icon: BarChart2,
    label: "OMOP Analytics",
    desc: "Cohort-level research analytics dashboard",
    layer: 4,
  },
  {
    href: "/eehrxf",
    icon: Layers,
    label: "EEHRxF Profiles",
    desc: "EU FHIR profile alignment and EHDS coverage gap analysis",
    layer: 2,
  },
  {
    href: "/query",
    icon: MessageSquare,
    label: "Natural Language Query",
    desc: "Federated Cypher queries via natural language interface",
    layer: 1,
  },
];

const exchangeCards: FeatureCard[] = [
  {
    href: "/data/share",
    icon: ArrowRightLeft,
    label: "Share Data",
    desc: "Publish and register health data assets for the dataspace",
    layer: 1,
  },
  {
    href: "/data/discover",
    icon: Search,
    label: "Discover Data",
    desc: "Search the federated catalog for available datasets",
    layer: 2,
  },
  {
    href: "/negotiate",
    icon: Handshake,
    label: "Contract Negotiation",
    desc: "Negotiate data usage contracts with providers via DSP",
    layer: 3,
  },
  {
    href: "/data/transfer",
    icon: FileJson2,
    label: "Data Transfer & FHIR Viewer",
    desc: "Transfer FHIR/OMOP data and inspect FHIR R4 bundles",
    layer: 4,
  },
  {
    href: "/tasks",
    icon: ClipboardList,
    label: "EHDS Tasks",
    desc: "Track data access permit tasks and approval workflows",
    layer: 5,
  },
];

const governCards: FeatureCard[] = [
  {
    href: "/compliance",
    icon: ShieldCheck,
    label: "Governance & Compliance",
    desc: "EHDS compliance, data permits, and protocol conformance testing",
    layer: 5,
  },
  {
    href: "/credentials",
    icon: Award,
    label: "Verifiable Credentials",
    desc: "Manage MembershipCredential, EHDS participant, and data permits",
    layer: 1,
  },
  {
    href: "/onboarding",
    icon: UserPlus,
    label: "Onboarding",
    desc: "Register new participants and generate DID identities",
    layer: 2,
  },
  {
    href: "/settings",
    icon: Settings,
    label: "Settings",
    desc: "Participant profile, connector endpoints, and credentials",
    layer: 3,
  },
  {
    href: "/admin",
    icon: LayoutDashboard,
    label: "Portal Admin",
    desc: "Tenant management, policies, component topology, and audit logs",
    layer: 4,
  },
  {
    href: "/docs",
    icon: FileText,
    label: "Documentation",
    desc: "User guide, developer docs, and architecture reference",
    layer: 3,
  },
];

const SECTIONS: Record<string, FeatureCard[]> = {
  explore: exploreCards,
  exchange: exchangeCards,
  govern: governCards,
};

export function FeatureCardGrid({
  section,
  delay,
}: {
  section: "explore" | "exchange" | "govern";
  delay: number;
}) {
  const { data: session } = useSession();
  const demoPersona = useDemoPersona();

  const cards = SECTIONS[section];

  // Determine active roles
  let roles: readonly string[] = [];
  if (IS_STATIC) {
    roles = demoPersona?.roles ?? [];
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
      {cards.map(({ href, icon: Icon, label, desc, layer }, i) => {
        const isRelevant = isLoggedIn && highlighted.has(href);
        const style = LAYER_STYLE[layer];
        return (
          // flex-col overrides the global a { display: inline-flex } of the
          // WCAG target-size rule, which laid the title and the text side by side.
          <Link
            key={href}
            href={href}
            className={`relative flex flex-col items-stretch gap-3 h-full border rounded-xl p-5 transition-colors ${
              style.card
            } animate-fade-in-up ${isRelevant ? "ring-2 ring-white/20" : ""}`}
            style={{ animationDelay: `${delay + i * 60}ms` }}
          >
            <div className="flex items-center gap-3">
              <span
                className={`shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${style.tile}`}
              >
                <Icon size={22} strokeWidth={1.8} aria-hidden="true" />
              </span>
              <span className="font-semibold text-base leading-snug text-gray-900 dark:text-gray-100">
                {label}
              </span>
              {isRelevant && (
                <span
                  className="ml-auto shrink-0 w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center"
                  title="Relevant for your role"
                >
                  <Check
                    size={12}
                    className="text-(--success-text)"
                    aria-hidden="true"
                  />
                </span>
              )}
            </div>
            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
              {desc}
            </p>
          </Link>
        );
      })}
    </div>
  );
}
