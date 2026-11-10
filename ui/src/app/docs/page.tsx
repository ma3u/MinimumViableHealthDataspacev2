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
  ChartGantt,
} from "lucide-react";
import { DocsLastUpdated } from "@/components/docs/DocsLastUpdated";
import { REPO, SRC, ehdsArt } from "@/lib/docs/roadmap";
import { T } from "@/lib/i18n/translate";

/** A source cited in a card or the callout, opened in a new tab. Above the
 *  card's own link (z-10), so a click on it does not open the card. */
const source = (href: string) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className="relative z-10 text-(--accent) underline hover:opacity-80"
  />
);

/** `label` is the menu's (nav area), `desc` a key of docsCommon; a part of
 *  `desc` in <tag>...</tag> links to `sources[tag]`. */
const sections: {
  href: string;
  icon: typeof Users;
  label: string;
  desc: string;
  sources?: Record<string, string>;
  color: string;
}[] = [
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
    desc: "<am>ArchiMate 3.2</am> views and sequence diagrams: 5-layer graph model, data flow, deployment topology, data permit and negotiation, and identity and trust.",
    sources: { am: "https://pubs.opengroup.org/architecture/archimate32-doc/" },
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
    desc: "What the hub implements of <e>Regulation (EU) 2025/327</e>, article by article, with the page, the code and the test for each, the gaps with their issues, and the proposal-to-adopted numbering.",
    sources: { e: SRC.ehds },
    color: "border-layer2 hover:bg-layer2/10",
  },
  {
    href: "/docs/roadmap",
    icon: ChartGantt,
    label: "Roadmap",
    desc: "The roadmap to 2031 as a clickable Gantt chart: the <e>EHDS dates</e>, the <eudi>EUDI</eudi> and <ebw>Business Wallets</ebw>, <simpl>Simpl-Open</simpl>, and the issues each one sets, with the drivers behind them.",
    sources: {
      e: ehdsArt(105),
      eudi: SRC.eidas,
      ebw: SRC.businessWallet,
      simpl: SRC.simplStatus,
    },
    color: "border-layer3 hover:bg-layer3/10",
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
        <h1 className="text-3xl font-bold mb-2">
          <T area="docsCommon">{"Documentation"}</T>
        </h1>
        <DocsLastUpdated page="/docs" />
        <p className="text-(--text-secondary) text-lg">
          <T area="docsCommon">
            {
              "Health Dataspace v2: comprehensive guides for business users and developers."
            }
          </T>
        </p>
      </div>

      {/* Main sections */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mb-12">
        {sections.map(({ href, icon: Icon, label, desc, sources, color }) => (
          // The card is one link (its title's, stretched over the card by
          // after:inset-0); a source cited in the text sits above it.
          <div
            key={href}
            className={`relative flex flex-col border rounded-xl p-6 transition-colors group ${color}`}
          >
            <div className="flex items-center gap-2 mb-3">
              <Icon size={22} />
              <Link
                href={href}
                className="font-semibold text-lg after:absolute after:inset-0 after:rounded-xl"
              >
                <T area="nav">{label}</T>
              </Link>
            </div>
            <p className="text-sm text-(--text-secondary) mb-4 flex-1">
              <T
                area="docsCommon"
                tags={
                  sources &&
                  Object.fromEntries(
                    Object.entries(sources).map(([tag, url]) => [
                      tag,
                      source(url),
                    ]),
                  )
                }
              >
                {desc}
              </T>
            </p>
            <span className="inline-flex items-center gap-1 text-sm text-(--accent) group-hover:underline mt-auto">
              <T area="docsCommon">{"Read more"}</T> <ArrowRight size={14} />
            </span>
          </div>
        ))}
      </div>

      {/* About callout — WCAG-safe contrast in both light and dark */}
      <div className="mt-2 bg-(--surface-2) border border-(--border) rounded-xl p-6">
        <h3 className="font-semibold text-(--text-primary) mb-2">
          <T area="docsCommon">{"About Health Dataspace v2"}</T>
        </h3>
        <p className="text-sm text-(--text-secondary) leading-relaxed">
          <T
            area="docsCommon"
            tags={{
              e: source(SRC.ehds),
              edc: source(SRC.edc),
              neo: source(
                "https://neo4j.com/release-notes/database/neo4j-5-26-28/",
              ),
              fhir: source(SRC.fhir),
              omop: source(SRC.omop),
              p: (
                <Link
                  href="/docs/developer#compose-profiles"
                  className="relative z-10 text-(--accent) underline hover:opacity-80"
                />
              ),
              adr: source(
                `${REPO}/blob/main/docs/ADRs/ADR-078-edc-1-on-container-apps-without-cfm.md`,
              ),
              cfm: source(
                `${REPO}/blob/main/docs/ADRs/ADR-085-cfm-stays-as-eclipse-cfm-releases.md`,
              ),
              dsp: source(SRC.dsp),
              a: (
                <Link
                  href="/docs/architecture"
                  className="text-(--accent) underline hover:opacity-80"
                />
              ),
            }}
          >
            {
              "A demonstrator aligned with the <e>European Health Data Space Regulation</e>, built on <edc>Eclipse EDC 1.0</edc>, <neo>Neo4j</neo>, <fhir>FHIR R4</fhir> and <omop>OMOP CDM</omop>. The hub provisions its participants itself (<adr>ADR-078</adr>); CFM 0.0.7 runs only in the stack's <p>cfm profile</p>, as a spike (<cfm>ADR-085</cfm>). A 5-layer knowledge graph carries the Regulation's data, from <dsp>DSP</dsp> marketplace discovery to ontology alignment, for sovereign health data exchange between data holders and approved research users. <a>Explore the architecture →</a>"
            }
          </T>
        </p>
      </div>
    </div>
  );
}
