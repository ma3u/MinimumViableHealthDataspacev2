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
  Globe,
  Lock,
  ExternalLink,
  MessageCircle,
} from "lucide-react";
import { DemoPersonaCards } from "@/components/DemoPersonaCards";
import { PersonaJourneyCards } from "@/components/PersonaJourneyCards";
import {
  FeatureCardGrid,
  type FeatureCard,
} from "@/components/FeatureCardGrid";

/* ── Card data ───────────────────────────────────────────────────────────── */

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
          lifecycle, from publishing clinical datasets to negotiating access
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

      {/* ── Why EHDS Matters ─────────────────────────────────────────────── */}
      <section
        className="mb-12 sm:mb-16 animate-fade-in-up"
        style={{ animationDelay: "150ms" }}
        aria-labelledby="why-ehds-title"
      >
        <h2 id="why-ehds-title" className="text-lg sm:text-xl font-bold mb-2">
          Why the European Health Data Space Matters
        </h2>

        <p className="text-gray-400 text-sm leading-relaxed max-w-3xl mb-5">
          The{" "}
          <a
            href="https://health.ec.europa.eu/ehealth-digital-health-and-care/european-health-data-space_en"
            target="_blank"
            rel="noopener noreferrer"
            className="text-layer1 underline underline-offset-2 hover:text-white transition-colors"
          >
            EHDS regulation
          </a>{" "}
          creates a unified framework for sharing health data across EU member
          states while safeguarding patient rights under GDPR. It distinguishes
          between <strong className="text-white">primary use</strong> (patients
          accessing their own records) and{" "}
          <strong className="text-white">secondary use</strong> (research,
          policy, innovation), each with strict governance and oversight.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-xl border border-green-700/40 bg-green-950/20 p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-2">
              <FlaskConical
                size={18}
                className="text-green-300"
                aria-hidden="true"
              />
              <h3 className="font-semibold text-green-300 text-sm sm:text-base">
                For Researchers
              </h3>
            </div>
            <p className="text-sm text-gray-400 leading-relaxed">
              Cross-border access to standardised health datasets in{" "}
              <strong className="text-gray-300">FHIR R4</strong> and{" "}
              <strong className="text-gray-300">OMOP CDM</strong> format, ending
              bilateral negotiations with each hospital. The Health Data Access
              Body (HDAB) provides a single-window approval process under
              Art.&nbsp;46, cutting months of bureaucracy to weeks.
            </p>
          </div>

          <div className="rounded-xl border border-blue-700/40 bg-blue-950/20 p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-2">
              <BookOpen
                size={18}
                className="text-blue-300"
                aria-hidden="true"
              />
              <h3 className="font-semibold text-blue-300 text-sm sm:text-base">
                For Hospitals
              </h3>
            </div>
            <p className="text-sm text-gray-400 leading-relaxed">
              A clear legal basis for sharing data with researchers while
              staying GDPR-compliant. Publish datasets once via{" "}
              <strong className="text-gray-300">HealthDCAT-AP</strong>{" "}
              catalogues, manage access through standardised{" "}
              <strong className="text-gray-300">DSP contracts</strong>, and let
              the HDAB handle regulatory approval, reducing legal risk and
              administrative burden.
            </p>
          </div>

          <div className="rounded-xl border border-teal-700/40 bg-teal-950/20 p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-2">
              <Heart size={18} className="text-teal-300" aria-hidden="true" />
              <h3 className="font-semibold text-teal-300 text-sm sm:text-base">
                For Patients
              </h3>
            </div>
            <p className="text-sm text-gray-400 leading-relaxed">
              Full control over your health records across borders. Access your
              data from any EU provider via{" "}
              <strong className="text-gray-300">EEHRxF</strong> (European
              Electronic Health Record exchange Format), with{" "}
              <strong className="text-gray-300">GDPR Art.&nbsp;15-22</strong>{" "}
              rights to access, rectify, and control how your data is used for
              research.
            </p>
          </div>

          <div className="rounded-xl border border-amber-700/40 bg-amber-950/20 p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck
                size={18}
                className="text-amber-300"
                aria-hidden="true"
              />
              <h3 className="font-semibold text-amber-300 text-sm sm:text-base">
                For Regulators
              </h3>
            </div>
            <p className="text-sm text-gray-400 leading-relaxed">
              Enforce EHDS Art.&nbsp;46-51 data access permits through the{" "}
              <strong className="text-gray-300">Health Data Access Body</strong>
              . Audit compliance via{" "}
              <strong className="text-gray-300">verifiable credentials</strong>,
              ensure protocol conformance, and govern trust anchors across the
              dataspace.
            </p>
          </div>
        </div>
      </section>

      {/* ── Standards & Interoperability ──────────────────────────────────── */}
      <section
        className="mb-12 sm:mb-16 animate-fade-in-up"
        style={{ animationDelay: "180ms" }}
        aria-labelledby="standards-title"
      >
        <h2 id="standards-title" className="text-lg sm:text-xl font-bold mb-2">
          Standards & Interoperability
        </h2>
        <p className="text-gray-400 text-sm leading-relaxed max-w-3xl mb-5">
          The EHDS builds on established open standards to ensure
          interoperability across all EU member states. This demo implements
          each standard end-to-end.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[
            {
              name: "EHDS Regulation",
              abbr: "EHDS",
              desc: "EU regulation establishing rules for primary use (patient access) and secondary use (research) of electronic health data across member states.",
              href: "https://health.ec.europa.eu/ehealth-digital-health-and-care/european-health-data-space_en",
              color: "border-layer5/50 text-layer5",
            },
            {
              name: "HL7 FHIR R4",
              abbr: "FHIR",
              desc: "Fast Healthcare Interoperability Resources, the global standard for exchanging clinical data (Patient, Condition, Observation, Medication).",
              href: "https://hl7.org/fhir/R4/",
              color: "border-layer3/50 text-layer3",
            },
            {
              name: "OMOP Common Data Model",
              abbr: "OMOP",
              desc: "Observational Medical Outcomes Partnership CDM v5.4. Standardises clinical data for large-scale observational research and cohort analytics.",
              href: "https://ohdsi.github.io/CommonDataModel/",
              color: "border-layer4/50 text-layer4",
            },
            {
              name: "HealthDCAT-AP",
              abbr: "DCAT",
              desc: "Health extension of DCAT-AP, a metadata standard for publishing and discovering health datasets in federated catalogues across the EU.",
              href: "https://healthdcat-ap.github.io/",
              color: "border-layer2/50 text-layer2",
            },
            {
              name: "Dataspace Protocol",
              abbr: "DSP",
              desc: "IDSA Dataspace Protocol 2025-1. Governs catalogue federation, contract negotiation, and secure data transfer between dataspace participants.",
              href: "https://docs.internationaldataspaces.org/ids-knowledgebase/dataspace-protocol",
              color: "border-layer1/50 text-layer1",
            },
            {
              name: "Decentralised Claims Protocol",
              abbr: "DCP",
              desc: "Verifiable credential issuance and presentation. Enables trust anchors, membership credentials, and data access permits without central authority.",
              href: "https://docs.internationaldataspaces.org/ids-knowledgebase/decentralized-claims-protocol",
              color: "border-purple-500/50 text-purple-400",
            },
          ].map(({ name, abbr, desc, href, color }) => (
            <a
              key={abbr}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className={`group rounded-xl border p-4 sm:p-5 transition-colors hover:bg-gray-800/50 ${
                color.split(" ")[0]
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span
                  className={`font-semibold text-sm sm:text-base ${
                    color.split(" ")[1]
                  }`}
                >
                  {name}
                </span>
                <ExternalLink
                  size={14}
                  className="text-gray-600 group-hover:text-gray-400 transition-colors"
                  aria-hidden="true"
                />
              </div>
              <p className="text-sm text-gray-400 leading-relaxed">{desc}</p>
            </a>
          ))}
        </div>
      </section>

      {/* ── Persona Journeys ─────────────────────────────────────────────── */}
      <section
        className="mb-12 sm:mb-16 animate-fade-in-up"
        style={{ animationDelay: "200ms" }}
        aria-labelledby="workflow-title"
      >
        <h2 id="workflow-title" className="text-lg sm:text-xl font-bold mb-2">
          How the EHDS Demo Works
        </h2>
        <p className="text-gray-400 text-sm mb-6 max-w-2xl">
          Sign in as one of 5 personas and follow their journey through the
          dataspace. Each role sees different pages, data, and actions,
          mirroring real EHDS workflows.
        </p>

        <PersonaJourneyCards />
      </section>

      {/* ── Feature sections ──────────────────────────────────────────────── */}
      <section aria-labelledby="explore-title">
        <h2
          id="explore-title"
          className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-1"
        >
          Explore
        </h2>
        <p className="text-xs text-gray-500 mb-3 max-w-2xl">
          Visualise the 5-layer knowledge graph, browse FHIR clinical data,
          query OMOP analytics, and search the HealthDCAT-AP dataset catalogue.
          All publicly accessible without sign-in.
        </p>
        <FeatureCardGrid cards={exploreCards} delay={1200} />
      </section>

      <div className="my-8 sm:my-10" />

      <section aria-labelledby="exchange-title">
        <h2
          id="exchange-title"
          className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-1"
        >
          Exchange · Transfer · Negotiate
        </h2>
        <p className="text-xs text-gray-500 mb-3 max-w-2xl">
          The DSP data exchange lifecycle: hospitals publish datasets,
          researchers discover and request access, contracts are negotiated
          under ODRL policies, and approved FHIR/OMOP data is transferred
          securely.
        </p>
        <FeatureCardGrid cards={exchangeCards} delay={1400} />
      </section>

      <div className="my-8 sm:my-10" />

      <section aria-labelledby="govern-title">
        <h2
          id="govern-title"
          className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-1"
        >
          Govern · Manage · Docs
        </h2>
        <p className="text-xs text-gray-500 mb-3 max-w-2xl">
          EHDS compliance monitoring, DCP verifiable credentials, participant
          onboarding with DID:web identities, portal administration, and
          architecture documentation.
        </p>
        <FeatureCardGrid cards={governCards} delay={1600} />
      </section>

      <div className="my-8 sm:my-10" />

      {/* ── Demo personas ─────────────────────────────────────────────────── */}
      <section aria-labelledby="personas-title">
        <DemoPersonaCards />
      </section>

      {/* ── Feedback ──────────────────────────────────────────────────────── */}
      <section
        className="mt-12 sm:mt-16 animate-fade-in-up"
        style={{ animationDelay: "1800ms" }}
        aria-labelledby="feedback-title"
      >
        <div className="rounded-xl border border-gray-700 bg-gray-900/60 p-6 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <MessageCircle
              size={18}
              className="text-layer1"
              aria-hidden="true"
            />
            <h2
              id="feedback-title"
              className="text-sm sm:text-base font-semibold text-gray-200"
            >
              Feedback & Contributions
            </h2>
          </div>
          <p className="text-sm text-gray-400 mb-4 max-w-lg mx-auto">
            Found a bug, have a feature idea, or want to discuss the EHDS
            architecture? We&apos;d love to hear from you.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <a
              href="https://github.com/ma3u/MinimumViableHealthDataspacev2/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-gray-800 text-gray-300 border border-gray-600 hover:border-layer1 hover:text-white transition-colors"
            >
              <Github size={16} aria-hidden="true" />
              Report an Issue
            </a>
            <a
              href="https://github.com/ma3u/MinimumViableHealthDataspacev2/discussions"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-gray-800 text-gray-300 border border-gray-600 hover:border-layer2 hover:text-white transition-colors"
            >
              <MessageCircle size={16} aria-hidden="true" />
              Join the Discussion
            </a>
          </div>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer className="mt-8 sm:mt-10 pt-6 border-t border-gray-800 text-center text-xs text-gray-600">
        <p>
          Reference implementation. All data is synthetic. No real patient
          records.
        </p>
        <p className="mt-2 flex flex-wrap justify-center gap-x-1.5 gap-y-0.5">
          <a
            href="https://health.ec.europa.eu/ehealth-digital-health-and-care/european-health-data-space_en"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-gray-400 transition-colors"
          >
            EHDS Art.&nbsp;3-12, 46-51
          </a>
          <span>·</span>
          <a
            href="https://hl7.org/fhir/R4/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-gray-400 transition-colors"
          >
            FHIR R4
          </a>
          <span>·</span>
          <a
            href="https://ohdsi.github.io/CommonDataModel/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-gray-400 transition-colors"
          >
            OMOP CDM v5.4
          </a>
          <span>·</span>
          <a
            href="https://docs.internationaldataspaces.org/ids-knowledgebase/dataspace-protocol"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-gray-400 transition-colors"
          >
            DSP 2025-1
          </a>
          <span>·</span>
          <a
            href="https://docs.internationaldataspaces.org/ids-knowledgebase/decentralized-claims-protocol"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-gray-400 transition-colors"
          >
            DCP v1.0
          </a>
          <span>·</span>
          <span>GDPR Art.&nbsp;15-22</span>
        </p>
      </footer>
    </div>
  );
}
