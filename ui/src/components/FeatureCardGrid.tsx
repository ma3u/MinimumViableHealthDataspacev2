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

const IS_STATIC = process.env.NEXT_PUBLIC_STATIC_EXPORT === "true";

/** Routes that are most relevant for each role. */
const ROLE_PATHS: Record<string, string[]> = {
  PATIENT: ["/patient", "/graph", "/eehrxf"],
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

interface FeatureCard {
  href: string;
  icon: LucideIcon;
  label: string;
  desc: string;
  color: string;
}

const exploreCards: FeatureCard[] = [
  {
    href: "/graph",
    icon: Network,
    label: "Graph Explorer",
    desc: "Force-directed visualisation of all 5 architecture layers",
    color: "border-layer1 hover:bg-layer1/10",
  },
  {
    href: "/catalog",
    icon: BookOpen,
    label: "Dataset Catalog",
    desc: "HealthDCAT-AP metadata for all published datasets",
    color: "border-layer2 hover:bg-layer2/10",
  },
  {
    href: "/patient",
    icon: User,
    label: "Patient Journey",
    desc: "FHIR R4 clinical timeline with OMOP CDM mapping",
    color: "border-layer3 hover:bg-layer3/10",
  },
  {
    href: "/analytics",
    icon: BarChart2,
    label: "OMOP Analytics",
    desc: "Cohort-level research analytics dashboard",
    color: "border-layer4 hover:bg-layer4/10",
  },
  {
    href: "/eehrxf",
    icon: Layers,
    label: "EEHRxF Profiles",
    desc: "EU FHIR profile alignment and EHDS coverage gap analysis",
    color: "border-layer2 hover:bg-layer2/10",
  },
  {
    href: "/query",
    icon: MessageSquare,
    label: "Natural Language Query",
    desc: "Federated Cypher queries via natural language interface",
    color: "border-layer1 hover:bg-layer1/10",
  },
];

const exchangeCards: FeatureCard[] = [
  {
    href: "/data/share",
    icon: ArrowRightLeft,
    label: "Share Data",
    desc: "Publish and register health data assets for the dataspace",
    color: "border-layer1 hover:bg-layer1/10",
  },
  {
    href: "/data/discover",
    icon: Search,
    label: "Discover Data",
    desc: "Search the federated catalog for available datasets",
    color: "border-layer2 hover:bg-layer2/10",
  },
  {
    href: "/negotiate",
    icon: Handshake,
    label: "Contract Negotiation",
    desc: "Negotiate data usage contracts with providers via DSP",
    color: "border-layer3 hover:bg-layer3/10",
  },
  {
    href: "/data/transfer",
    icon: FileJson2,
    label: "Data Transfer & FHIR Viewer",
    desc: "Transfer FHIR/OMOP data and inspect FHIR R4 bundles",
    color: "border-layer4 hover:bg-layer4/10",
  },
  {
    href: "/tasks",
    icon: ClipboardList,
    label: "EHDS Tasks",
    desc: "Track data access permit tasks and approval workflows",
    color: "border-layer5 hover:bg-layer5/10",
  },
];

const governCards: FeatureCard[] = [
  {
    href: "/compliance",
    icon: ShieldCheck,
    label: "Governance & Compliance",
    desc: "EHDS compliance, data permits, and protocol conformance testing",
    color: "border-layer5 hover:bg-layer5/10",
  },
  {
    href: "/credentials",
    icon: Award,
    label: "Verifiable Credentials",
    desc: "Manage MembershipCredential, EHDS participant, and data permits",
    color: "border-layer1 hover:bg-layer1/10",
  },
  {
    href: "/onboarding",
    icon: UserPlus,
    label: "Onboarding",
    desc: "Register new participants and generate DID identities",
    color: "border-layer2 hover:bg-layer2/10",
  },
  {
    href: "/settings",
    icon: Settings,
    label: "Settings",
    desc: "Participant profile, connector endpoints, and credentials",
    color: "border-layer3 hover:bg-layer3/10",
  },
  {
    href: "/admin",
    icon: LayoutDashboard,
    label: "Portal Admin",
    desc: "Tenant management, policies, component topology, and audit logs",
    color: "border-layer4 hover:bg-layer4/10",
  },
  {
    href: "/docs",
    icon: FileText,
    label: "Documentation",
    desc: "User guide, developer docs, and architecture reference",
    color: "border-layer3 hover:bg-layer3/10",
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
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
              {desc}
            </p>
          </Link>
        );
      })}
    </div>
  );
}
