import Link from "next/link";
import {
  BookOpen,
  Code2,
  Layers,
  Users,
  ArrowRight,
  FileText,
  Network,
  ShieldCheck,
} from "lucide-react";

const sections = [
  {
    href: "/docs/user-guide",
    icon: Users,
    label: "User Guide",
    desc: "Business user guide: navigating datasets, compliance workflows, patient timelines, and analytics dashboards.",
    color: "border-layer1 hover:bg-layer1/10",
  },
  {
    href: "/docs/developer",
    icon: Code2,
    label: "Developer Guide",
    desc: "Technical docs: architecture, setup, Neo4j schema, API reference, testing, CI/CD, and ADR summaries.",
    color: "border-layer2 hover:bg-layer2/10",
  },
  {
    href: "/docs/architecture",
    icon: Layers,
    label: "Architecture",
    desc: "Interactive Mermaid diagrams: 5-layer graph model, data flows, deployment topology, and identity trust.",
    color: "border-layer3 hover:bg-layer3/10",
  },
];

const quickLinks = [
  { href: "/graph", icon: Network, label: "Graph Explorer" },
  { href: "/catalog", icon: BookOpen, label: "Dataset Catalog" },
  { href: "/compliance", icon: ShieldCheck, label: "EHDS Compliance" },
  {
    href: "/docs/developer#api-reference",
    icon: FileText,
    label: "API Reference",
  },
];

export default function DocsPage() {
  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      <div className="mb-10">
        <h1 className="text-3xl font-bold mb-2">Documentation</h1>
        <p className="text-[var(--text-secondary)] text-lg">
          Health Dataspace v2 — comprehensive guides for business users and
          developers.
        </p>
      </div>

      {/* Main sections */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-12">
        {sections.map(({ href, icon: Icon, label, desc, color }) => (
          <Link
            key={href}
            href={href}
            className={`border rounded-xl p-6 transition-colors group ${color}`}
          >
            <div className="flex items-center gap-2 mb-3">
              <Icon size={22} />
              <span className="font-semibold text-lg">{label}</span>
            </div>
            <p className="text-sm text-[var(--text-secondary)] mb-4">{desc}</p>
            <span className="inline-flex items-center gap-1 text-sm text-indigo-400 group-hover:text-indigo-300">
              Read more <ArrowRight size={14} />
            </span>
          </Link>
        ))}
      </div>

      {/* Quick links */}
      <div className="border border-[var(--border)] rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-4">Quick Links</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {quickLinks.map(({ href, icon: Icon, label }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-[var(--text-primary)] hover:bg-[var(--surface-2)] transition-colors"
            >
              <Icon size={16} className="text-[var(--text-secondary)]" />
              {label}
            </Link>
          ))}
        </div>
      </div>

      {/* About callout */}
      <div className="mt-10 bg-indigo-950/30 border border-indigo-800/40 rounded-xl p-6">
        <h3 className="font-semibold text-indigo-300 mb-2">
          About Health Dataspace v2
        </h3>
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
          An EHDS-compliant demonstration platform built with Eclipse EDC-V,
          DCore, CFM, Neo4j, FHIR R4, and OMOP CDM. The project implements the
          European Health Data Space regulation through a 5-layer knowledge
          graph architecture — from DSP Marketplace discovery to Ontology
          alignment — enabling sovereign health data exchange between data
          holders and approved research users.
        </p>
      </div>
    </div>
  );
}
