import Link from "next/link";
import {
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
  Github,
  Search,
  Handshake,
  UserPlus,
  MessageSquare,
  ClipboardList,
  Settings,
  Award,
  Heart,
  FlaskConical,
  Database,
  ArrowRight,
  Globe,
  Lock,
  type LucideIcon,
} from "lucide-react";
import { DemoPersonaCards } from "@/components/DemoPersonaCards";

/* ── Card data ───────────────────────────────────────────────────────────── */

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

/* ── Guided workflow steps ───────────────────────────────────────────────── */

const workflowSteps = [
  {
    num: "1",
    icon: User,
    title: "Choose a Persona",
    desc: "Select one of 7 demo participants — patient, hospital, researcher, regulator, or admin. Each persona sees only the data and menus relevant to their EHDS role.",
    color: "text-layer1",
    border: "border-layer1/30",
  },
  {
    num: "2",
    icon: BookOpen,
    title: "Browse the Catalog",
    desc: "Hospitals publish HealthDCAT-AP datasets. Researchers discover them via federated search. Patients see their own health records.",
    color: "text-layer2",
    border: "border-layer2/30",
  },
  {
    num: "3",
    icon: Handshake,
    title: "Negotiate Access",
    desc: "Researchers request data via DSP 2025-1 contracts. The HDAB authority reviews and approves data access permits under EHDS Art. 46.",
    color: "text-layer3",
    border: "border-layer3/30",
  },
  {
    num: "4",
    icon: Database,
    title: "Transfer & Analyze",
    desc: "Approved data flows as FHIR R4 bundles into a secure processing environment. OMOP CDM transforms enable cross-border cohort analytics.",
    color: "text-layer4",
    border: "border-layer4/30",
  },
  {
    num: "5",
    icon: ShieldCheck,
    title: "Verify Compliance",
    desc: "Every step is auditable. DSP protocol conformance, verifiable credentials, and EHDS compliance checks ensure trust across all participants.",
    color: "text-layer5",
    border: "border-layer5/30",
  },
];

/* ── Card grid renderer ─────────────────────────────────────────────────── */

function CardGrid({ cards, delay }: { cards: FeatureCard[]; delay: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
      {cards.map(({ href, icon: Icon, label, desc, color }, i) => (
        <Link
          key={href}
          href={href}
          className={`border rounded-xl p-4 sm:p-5 transition-colors ${color} animate-fade-in-up`}
          style={{ animationDelay: `${delay + i * 60}ms` }}
        >
          <div className="flex items-center gap-2 mb-2">
            <Icon size={20} aria-hidden="true" />
            <span className="font-semibold text-sm sm:text-base">{label}</span>
          </div>
          <p className="text-sm text-gray-400 leading-relaxed">{desc}</p>
        </Link>
      ))}
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────────── */

export default function Home() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-16">
      {/* ── Hero section ──────────────────────────────────────────────────── */}
      <section
        className="mb-12 sm:mb-16 animate-fade-in-up"
        aria-labelledby="hero-title"
      >
        <div className="flex items-center gap-3 mb-3">
          <h1
            id="hero-title"
            className="text-2xl sm:text-3xl lg:text-4xl font-bold"
          >
            European Health Data Space
          </h1>
          <a
            href="https://github.com/ma3u/MinimumViableHealthDataspacev2"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-400 hover:text-white transition-colors touch-target-sm"
            aria-label="View source on GitHub"
          >
            <Github size={24} aria-hidden="true" />
          </a>
        </div>

        <p className="text-gray-300 text-base sm:text-lg leading-relaxed max-w-3xl mb-4">
          This interactive demo shows how the{" "}
          <strong className="text-white">EHDS regulation</strong> enables secure
          cross-border health data sharing across Europe. Explore the full
          lifecycle — from publishing clinical datasets to negotiating access
          contracts and running privacy-preserving analytics.
        </p>

        <div className="flex flex-wrap gap-3 text-sm text-gray-400">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-800/60 border border-gray-700">
            <Heart size={14} className="text-layer3" aria-hidden="true" />
            <span>127 synthetic patients</span>
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-800/60 border border-gray-700">
            <Network size={14} className="text-layer1" aria-hidden="true" />
            <span>5,300+ graph nodes</span>
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-800/60 border border-gray-700">
            <Globe size={14} className="text-layer2" aria-hidden="true" />
            <span>7 demo personas</span>
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-800/60 border border-gray-700">
            <Lock size={14} className="text-layer5" aria-hidden="true" />
            <span>All data is synthetic</span>
          </span>
        </div>
      </section>

      {/* ── How It Works ──────────────────────────────────────────────────── */}
      <section
        className="mb-12 sm:mb-16 animate-fade-in-up"
        style={{ animationDelay: "200ms" }}
        aria-labelledby="workflow-title"
      >
        <h2 id="workflow-title" className="text-lg sm:text-xl font-bold mb-2">
          How the EHDS Demo Works
        </h2>
        <p className="text-gray-400 text-sm mb-6 max-w-2xl">
          Walk through the data sharing lifecycle — each step mirrors a real
          EHDS workflow with the standards and protocols used in production.
        </p>

        <ol className="space-y-3 sm:space-y-4" aria-label="Demo workflow steps">
          {workflowSteps.map((step, i) => {
            const StepIcon = step.icon;
            return (
              <li
                key={step.num}
                className={`flex gap-3 sm:gap-4 items-start p-4 sm:p-5 rounded-xl border ${step.border} bg-gray-900/50 animate-fade-in-up`}
                style={{ animationDelay: `${300 + i * 100}ms` }}
              >
                <div
                  className={`flex-shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gray-800 flex items-center justify-center font-bold text-sm ${step.color}`}
                  aria-hidden="true"
                >
                  {step.num}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <StepIcon
                      size={16}
                      className={step.color}
                      aria-hidden="true"
                    />
                    <h3 className="font-semibold text-sm sm:text-base">
                      {step.title}
                    </h3>
                  </div>
                  <p className="text-sm text-gray-400 leading-relaxed">
                    {step.desc}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      {/* ── Quick Start by Role ───────────────────────────────────────────── */}
      <section
        className="mb-12 sm:mb-16 animate-fade-in-up"
        style={{ animationDelay: "800ms" }}
        aria-labelledby="quickstart-title"
      >
        <h2 id="quickstart-title" className="text-lg sm:text-xl font-bold mb-2">
          Quick Start by Role
        </h2>
        <p className="text-gray-400 text-sm mb-6 max-w-2xl">
          Not sure where to begin? Pick the role closest to yours and follow the
          suggested starting point.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[
            {
              role: "Patient",
              icon: Heart,
              desc: "View your health records, opt into research, see how your data is used",
              href: "/patient/profile",
              color: "text-teal-300",
              border: "border-teal-700/50 hover:bg-teal-900/20",
            },
            {
              role: "Researcher",
              icon: FlaskConical,
              desc: "Discover datasets, request HDAB approval, run OMOP cohort analytics",
              href: "/analytics",
              color: "text-green-300",
              border: "border-green-700/50 hover:bg-green-900/20",
            },
            {
              role: "Hospital",
              icon: BookOpen,
              desc: "Publish FHIR datasets, manage access contracts with researchers",
              href: "/catalog",
              color: "text-blue-300",
              border: "border-blue-700/50 hover:bg-blue-900/20",
            },
            {
              role: "Regulator (HDAB)",
              icon: ShieldCheck,
              desc: "Review access applications, audit compliance, govern trust anchors",
              href: "/compliance",
              color: "text-amber-300",
              border: "border-amber-700/50 hover:bg-amber-900/20",
            },
            {
              role: "Dataspace Admin",
              icon: LayoutDashboard,
              desc: "Manage participants, policies, component topology, and audit logs",
              href: "/graph",
              color: "text-red-300",
              border: "border-red-700/50 hover:bg-red-900/20",
            },
            {
              role: "Explore Everything",
              icon: Network,
              desc: "Start with the Knowledge Graph to see all 5 architecture layers at once",
              href: "/graph",
              color: "text-layer1",
              border: "border-layer1/50 hover:bg-layer1/10",
            },
          ].map(({ role, icon: RoleIcon, desc, href, color, border }, i) => (
            <Link
              key={role}
              href={href}
              className={`group flex flex-col p-4 sm:p-5 rounded-xl border transition-colors ${border} animate-fade-in-up`}
              style={{ animationDelay: `${900 + i * 80}ms` }}
            >
              <div className="flex items-center gap-2 mb-2">
                <RoleIcon size={18} className={color} aria-hidden="true" />
                <span className={`font-semibold text-sm sm:text-base ${color}`}>
                  {role}
                </span>
              </div>
              <p className="text-sm text-gray-400 leading-relaxed flex-1">
                {desc}
              </p>
              <div className="flex items-center gap-1 mt-3 text-xs text-gray-500 group-hover:text-gray-300 transition-colors">
                <span>Get started</span>
                <ArrowRight size={12} aria-hidden="true" />
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Feature sections ──────────────────────────────────────────────── */}
      <section aria-labelledby="explore-title">
        <h2
          id="explore-title"
          className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3"
        >
          Explore
        </h2>
        <CardGrid cards={exploreCards} delay={1200} />
      </section>

      <div className="my-8 sm:my-10" />

      <section aria-labelledby="exchange-title">
        <h2
          id="exchange-title"
          className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3"
        >
          Exchange · Transfer · Negotiate
        </h2>
        <CardGrid cards={exchangeCards} delay={1400} />
      </section>

      <div className="my-8 sm:my-10" />

      <section aria-labelledby="govern-title">
        <h2
          id="govern-title"
          className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3"
        >
          Govern · Manage · Docs
        </h2>
        <CardGrid cards={governCards} delay={1600} />
      </section>

      <div className="my-8 sm:my-10" />

      {/* ── Demo personas ─────────────────────────────────────────────────── */}
      <section aria-labelledby="personas-title">
        <DemoPersonaCards />
      </section>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer className="mt-12 sm:mt-16 pt-6 border-t border-gray-800 text-center text-xs text-gray-600">
        <p>
          Reference implementation — all data is synthetic. No real patient
          records.
        </p>
        <p className="mt-1">
          EHDS Art. 3-12, 46-51 · GDPR Art. 15-22 · DSP 2025-1 · DCP v1.0 · FHIR
          R4 · OMOP CDM v5.4
        </p>
      </footer>
    </div>
  );
}
