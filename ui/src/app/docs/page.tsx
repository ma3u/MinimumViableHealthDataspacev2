import Link from "next/link";
import { Code2, Layers, Users, ArrowRight } from "lucide-react";

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

      {/* Main sections — horizontal 3-card layout */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-12">
        {sections.map(({ href, icon: Icon, label, desc, color }) => (
          <Link
            key={href}
            href={href}
            className={`flex flex-col border rounded-xl p-6 transition-colors group ${color}`}
          >
            <div className="flex items-center gap-2 mb-3">
              <Icon size={22} />
              <span className="font-semibold text-lg">{label}</span>
            </div>
            <p className="text-sm text-[var(--text-secondary)] mb-4 flex-1">
              {desc}
            </p>
            <span className="inline-flex items-center gap-1 text-sm text-[var(--accent)] group-hover:underline mt-auto">
              Read more <ArrowRight size={14} />
            </span>
          </Link>
        ))}
      </div>

      {/* About callout — WCAG-safe contrast in both light and dark */}
      <div className="mt-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-xl p-6">
        <h3 className="font-semibold text-[var(--text-primary)] mb-2">
          About Health Dataspace v2
        </h3>
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
          An EHDS-compliant demonstration platform built with Eclipse EDC-V,
          DCore, CFM, Neo4j, FHIR R4, and OMOP CDM. The project implements the
          European Health Data Space regulation through a 5-layer knowledge
          graph architecture — from DSP Marketplace discovery to Ontology
          alignment — enabling sovereign health data exchange between data
          holders and approved research users.{" "}
          <Link
            href="/docs/architecture"
            className="text-[var(--accent)] underline hover:opacity-80"
          >
            Explore the architecture&nbsp;&rarr;
          </Link>
        </p>
      </div>
    </div>
  );
}
