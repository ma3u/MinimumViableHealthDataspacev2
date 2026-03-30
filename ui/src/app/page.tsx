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
} from "lucide-react";
import { DemoPersonaCards } from "@/components/DemoPersonaCards";

const exploreCards = [
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
    desc: "FHIR R4 → OMOP CDM timeline per patient",
    color: "border-layer3 hover:bg-layer3/10",
  },
  {
    href: "/analytics",
    icon: BarChart2,
    label: "OMOP Analytics",
    desc: "Cohort-level OMOP CDM research analytics dashboard",
    color: "border-layer4 hover:bg-layer4/10",
  },
  {
    href: "/eehrxf",
    icon: Layers,
    label: "EEHRxF Profiles",
    desc: "EU FHIR profile alignment & EHDS priority coverage gap analysis",
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

const exchangeCards = [
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

const governCards = [
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

export default function Home() {
  return (
    <div className="max-w-5xl mx-auto px-6 py-16">
      <div className="flex items-center gap-3 mb-2">
        <h1 className="text-3xl font-bold">Health Dataspace v2</h1>
        <a
          href="https://github.com/ma3u/MinimumViableHealthDataspacev2"
          target="_blank"
          rel="noopener noreferrer"
          className="text-gray-400 hover:text-white transition-colors"
          aria-label="GitHub Repository"
        >
          <Github size={24} />
        </a>
      </div>
      <p className="text-gray-400 mb-10">
        EHDS-compliant demo — EDC-V · DCore · CFM · Neo4j · FHIR R4 · OMOP CDM
      </p>

      {/* Explore section */}
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
        Explore
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
        {exploreCards.map(({ href, icon: Icon, label, desc, color }) => (
          <Link
            key={href}
            href={href}
            className={`border rounded-xl p-5 transition-colors ${color}`}
          >
            <div className="flex items-center gap-2 mb-2">
              <Icon size={20} />
              <span className="font-semibold">{label}</span>
            </div>
            <p className="text-sm text-gray-400">{desc}</p>
          </Link>
        ))}
      </div>

      {/* Exchange section */}
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
        Exchange · Transfer · Negotiate
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
        {exchangeCards.map(({ href, icon: Icon, label, desc, color }) => (
          <Link
            key={href}
            href={href}
            className={`border rounded-xl p-5 transition-colors ${color}`}
          >
            <div className="flex items-center gap-2 mb-2">
              <Icon size={20} />
              <span className="font-semibold">{label}</span>
            </div>
            <p className="text-sm text-gray-400">{desc}</p>
          </Link>
        ))}
      </div>

      {/* Govern & Manage section */}
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
        Govern · Manage · Docs
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
        {governCards.map(({ href, icon: Icon, label, desc, color }) => (
          <Link
            key={href}
            href={href}
            className={`border rounded-xl p-5 transition-colors ${color}`}
          >
            <div className="flex items-center gap-2 mb-2">
              <Icon size={20} />
              <span className="font-semibold">{label}</span>
            </div>
            <p className="text-sm text-gray-400">{desc}</p>
          </Link>
        ))}
      </div>

      {/* Demo personas */}
      <DemoPersonaCards />
    </div>
  );
}
