import Link from "next/link";
import {
  Code2,
  Layers,
  Users,
  ShieldCheck,
  Smartphone,
  Activity,
  ArrowRight,
  Scale,
} from "lucide-react";
import { DocsLastUpdated } from "@/components/docs/DocsLastUpdated";

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
  {
    href: "/docs/security",
    icon: ShieldCheck,
    label: "Security and Data Protection",
    desc: "The security test report with its findings after the fixes, both threat models, the Klarbefund self-assessment and evidence, the report for health insurers, the bills of materials.",
    color: "border-layer4 hover:bg-layer4/10",
  },
  {
    href: "/docs/klarbefund",
    icon: Smartphone,
    label: "Klarbefund",
    desc: "The iPhone app that turns a paper lab report into checkable values: the user guide and the developer guide, screen by screen with screenshots.",
    color: "border-layer5 hover:bg-layer5/10",
  },
  {
    href: "/docs/ehds",
    icon: Scale,
    label: "EHDS Regulation",
    desc: "What the hub implements of Regulation (EU) 2025/327, article by article, with the page, the code and the test for each, the gaps with their issues, and the proposal-to-adopted numbering.",
    color: "border-layer2 hover:bg-layer2/10",
  },
  {
    href: "/docs/operations",
    icon: Activity,
    label: "Operations",
    desc: "The live hub under load: every load, stress and spike run with its Grafana dashboard, what each found, and how to run the next one.",
    color: "border-layer1 hover:bg-layer1/10",
  },
];

export default function DocsPage() {
  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      <div className="mb-10">
        <h1 className="text-3xl font-bold mb-2">Documentation</h1>
        <DocsLastUpdated page="/docs" />
        <p className="text-(--text-secondary) text-lg">
          Health Dataspace v2 — comprehensive guides for business users and
          developers.
        </p>
      </div>

      {/* Main sections */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mb-12">
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
            <p className="text-sm text-(--text-secondary) mb-4 flex-1">
              {desc}
            </p>
            <span className="inline-flex items-center gap-1 text-sm text-(--accent) group-hover:underline mt-auto">
              Read more <ArrowRight size={14} />
            </span>
          </Link>
        ))}
      </div>

      {/* About callout — WCAG-safe contrast in both light and dark */}
      <div className="mt-2 bg-(--surface-2) border border-(--border) rounded-xl p-6">
        <h3 className="font-semibold text-(--text-primary) mb-2">
          About Health Dataspace v2
        </h3>
        <p className="text-sm text-(--text-secondary) leading-relaxed">
          An EHDS-compliant demonstration platform built with Eclipse EDC-V,
          DCore, CFM, Neo4j, FHIR R4, and OMOP CDM. The project implements the
          European Health Data Space regulation through a 5-layer knowledge
          graph architecture — from DSP Marketplace discovery to Ontology
          alignment — enabling sovereign health data exchange between data
          holders and approved research users.{" "}
          <Link
            href="/docs/architecture"
            className="text-(--accent) underline hover:opacity-80"
          >
            Explore the architecture&nbsp;&rarr;
          </Link>
        </p>
      </div>
    </div>
  );
}
