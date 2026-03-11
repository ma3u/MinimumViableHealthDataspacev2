import Link from "next/link";
import {
  Network,
  BookOpen,
  ShieldCheck,
  User,
  BarChart2,
  Layers,
  ArrowRightLeft,
  FileText,
  LayoutDashboard,
} from "lucide-react";

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
];

const actionCards = [
  {
    href: "/compliance",
    icon: ShieldCheck,
    label: "Governance",
    desc: "EHDS compliance, data permits, and protocol conformance testing",
    color: "border-layer5 hover:bg-layer5/10",
  },
  {
    href: "/data/share",
    icon: ArrowRightLeft,
    label: "Data Exchange",
    desc: "Share, discover, negotiate, and transfer health data between participants",
    color: "border-layer1 hover:bg-layer1/10",
  },
  {
    href: "/admin",
    icon: LayoutDashboard,
    label: "Portal Admin",
    desc: "Onboarding, tenant management, policies, and audit logs",
    color: "border-layer4 hover:bg-layer4/10",
  },
  {
    href: "/docs",
    icon: FileText,
    label: "Documentation",
    desc: "User guides, developer docs, and architecture diagrams",
    color: "border-layer3 hover:bg-layer3/10",
  },
];

export default function Home() {
  return (
    <div className="max-w-5xl mx-auto px-6 py-16">
      <h1 className="text-3xl font-bold mb-2">Health Dataspace v2</h1>
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

      {/* Actions section */}
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
        Govern · Exchange · Manage
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {actionCards.map(({ href, icon: Icon, label, desc, color }) => (
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
    </div>
  );
}
