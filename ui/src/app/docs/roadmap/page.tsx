import Link from "next/link";
import { ArrowLeft, ChartGantt, ExternalLink } from "lucide-react";
import { DocsLastUpdated } from "@/components/docs/DocsLastUpdated";
import RoadmapGantt from "@/components/docs/RoadmapGantt";
import {
  ITEMS,
  LANES,
  REPO,
  ROADMAP_PLANNED_ON,
  issueUrl,
} from "@/lib/docs/roadmap";

export const metadata = {
  title: "Roadmap",
  description:
    "The roadmap to 2031 as a Gantt chart: the dates of the EHDS Regulation and its implementing acts, the EUDI and Business Wallets, Simpl-Open, and the issues each one sets, with the drivers behind them.",
};

const EURLEX = "https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=";

/** The six drivers, each with the sources it rests on. */
const DRIVERS: {
  title: string;
  text: string;
  links: { label: string; href: string }[];
}[] = [
  {
    title: "The EHDS Regulation, to 2031",
    text: "Regulation (EU) 2025/327 applies in stages (Art. 105): generally from 26 March 2027, secondary use in full from 26 March 2029, further data categories from 26 March 2031. The 2026 implementing acts turn articles into specifications: dataset descriptions (2026/2098), health data in the EUDI Wallet with assurance levels (2026/2099), MyHealth@EU (2026/2083).",
    links: [
      { label: "Regulation (EU) 2025/327", href: `${EURLEX}CELEX:32025R0327` },
      { label: "2026/2098", href: `${EURLEX}OJ:L_202602098` },
      { label: "2026/2099", href: `${EURLEX}OJ:L_202602099` },
      { label: "2026/2083", href: `${EURLEX}OJ:L_202602083` },
      {
        label: "The Commission's EHDS page",
        href: "https://health.ec.europa.eu/ehealth-digital-health-and-care/european-health-data-space-regulation-ehds_en",
      },
      { label: "TEHDAS2 guidance", href: "https://tehdas.eu/" },
      { label: "What the hub implements", href: "/docs/ehds" },
    ],
  },
  {
    title: "Simpl, the EU's data space middleware",
    text: "Simpl-Open is the Commission's open-source middleware for European data spaces; the EHDS secondary-use data space is in its first wave. The hub meets it as a connector outside its agent, over DSP and DCP, and keeps the health rules in its own extension (ADR-064).",
    links: [
      {
        label: "Simpl programme",
        href: "https://simpl-programme.ec.europa.eu/",
      },
      {
        label: "Development status",
        href: "https://simpl-programme.ec.europa.eu/development/development-status",
      },
      {
        label: "Gap analysis",
        href: `${REPO}/blob/main/docs/simpl-ehds-gap-analysis.md`,
      },
      {
        label: "ADR-064",
        href: `${REPO}/blob/main/docs/ADRs/ADR-064-simpl-open-through-the-outside-agent-dcp-path.md`,
      },
    ],
  },
  {
    title: "eIDAS 2.0: the EUDI Wallet and the Business Wallet",
    text: "eIDAS 2.0 obliges every Member State to offer a wallet; 2026/2099 makes it how persons identify for the EHDS, at assurance level substantial from 2027 and high from 2030. The German wallet d-you goes into production on 2 January 2027. The European Business Wallet, still in negotiation, lets a person act for an organisation, as a researcher applying for a permit does.",
    links: [
      {
        label: "Regulation (EU) 2024/1183",
        href: "https://eur-lex.europa.eu/eli/reg/2024/1183/oj",
      },
      {
        label: "Architecture and Reference Framework",
        href: "https://github.com/eu-digital-identity-wallet/eudi-doc-architecture-and-reference-framework",
      },
      {
        label: "OpenID4VP 1.0",
        href: "https://openid.net/specs/openid-4-verifiable-presentations-1_0.html",
      },
      {
        label: "HAIP 1.0",
        href: "https://openid.net/specs/openid4vc-high-assurance-interoperability-profile-1_0.html",
      },
      { label: "d-you", href: "https://eudi-wallet.gov.de/" },
      {
        label: "European Business Wallet",
        href: "https://digital-strategy.ec.europa.eu/en/policies/european-business-wallet",
      },
      {
        label: "ADR-065",
        href: `${REPO}/blob/main/docs/ADRs/ADR-065-the-eudi-wallet-sign-in-identifies-the-person.md`,
      },
    ],
  },
  {
    title: "Health standards: HL7 FHIR, OMOP, HealthDCAT-AP",
    text: "HL7 FHIR R4 with the HL7 Europe guides carries the record and the European exchange format; OMOP CDM 5.4 is the research model; HealthDCAT-AP Release 8 describes datasets as 2026/2098 requires. The hub follows the version each act names, never an older one.",
    links: [
      { label: "HL7 FHIR R4", href: "https://hl7.org/fhir/R4/" },
      { label: "HL7 Europe", href: "https://hl7.eu/fhir/" },
      { label: "Xt-EHR", href: "https://www.xt-ehr.eu/" },
      { label: "OMOP CDM", href: "https://ohdsi.github.io/CommonDataModel/" },
      {
        label: "HealthDCAT-AP Release 8",
        href: "https://data.health.europa.eu/healthdcat-ap/releases/release-8/",
      },
      {
        label: "ADR-063",
        href: `${REPO}/blob/main/docs/ADRs/ADR-063-healthdcat-ap-release-8-and-its-namespace.md`,
      },
    ],
  },
  {
    title: "Eclipse Dataspace: DSP, DCP and DPS",
    text: "The Dataspace Protocol came from IDSA and is standardised by the Eclipse Dataspace Working Group. DSP negotiates contracts and transfers, DCP proves identity with verifiable credentials, Data Plane Signaling lets the control plane start and stop a data plane. Simpl-Open runs Eclipse EDC too, so these are where the two meet.",
    links: [
      {
        label: "Dataspace Protocol",
        href: "https://eclipse-dataspace-protocol-base.github.io/DataspaceProtocol/",
      },
      {
        label: "Decentralized Claims Protocol",
        href: "https://eclipse-dataspace-dcp.github.io/decentralized-claims-protocol/",
      },
      {
        label: "Data Plane Signaling",
        href: "https://eclipse-dataplane-signaling.github.io/dataplane-signaling/",
      },
      { label: "Eclipse Dataspace", href: "https://dataspace.eclipse.org/" },
      { label: "IDSA", href: "https://internationaldataspaces.org/" },
      { label: "Eclipse EDC", href: "https://github.com/eclipse-edc" },
    ],
  },
  {
    title: "Apache Iceberg and the lakehouse formats",
    text: "Open table formats are how the large data platforms store analytical data. In the hub they belong inside the secure processing environment: OMOP as Iceberg tables behind a REST catalog, with storage credentials handed out only under a valid agreement. That is the spike #649, under #716.",
    links: [
      { label: "Apache Iceberg", href: "https://iceberg.apache.org/" },
      { label: "Apache Parquet", href: "https://parquet.apache.org/" },
      { label: "Apache Arrow", href: "https://arrow.apache.org/" },
      { label: "Spike #649", href: issueUrl(649) },
    ],
  },
];

const STATUS_LABEL = {
  done: "Done",
  "in-progress": "In progress",
  planned: "Planned",
  blocked: "Blocked",
} as const;

export default function RoadmapDocsPage() {
  return (
    <div className="max-w-6xl mx-auto px-6 py-12">
      <Link
        href="/docs"
        className="inline-flex items-center gap-1 text-sm text-(--text-secondary) hover:text-(--text-primary) mb-6"
      >
        <ArrowLeft size={14} /> Back to Docs
      </Link>

      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2 inline-flex items-center gap-2">
          <ChartGantt size={28} aria-hidden="true" /> Roadmap
        </h1>
        <DocsLastUpdated page="/docs/roadmap" />
        <p className="text-(--text-secondary) text-lg">
          The roadmap to 2031, set by the dates of the EHDS Regulation and its
          implementing acts, the EUDI and Business Wallets and Simpl-Open. The
          diamonds are dates set by law or by the programmes; the bars are
          planning windows set on {ROADMAP_PLANNED_ON}. P1 is due by 26 March
          2027, P2 by 26 March 2029; P3 is a comment, not a build. The plan is{" "}
          <a
            href={issueUrl(725)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-(--accent) underline"
          >
            #725
          </a>
          .
        </p>
      </div>

      <section aria-labelledby="chart">
        <h2 id="chart" className="text-xl font-semibold mb-2">
          The chart
        </h2>
        <ul className="flex flex-wrap gap-4 text-xs text-(--text-secondary) mb-2">
          <li>Light bar with a blue border: planned</li>
          <li>Solid blue bar: in progress</li>
          <li>Red bar: blocked</li>
          <li>Grey bar: done</li>
          <li>Diamond: a fixed date</li>
          <li>Red line: today</li>
        </ul>
        <RoadmapGantt />
      </section>

      <section aria-labelledby="drivers" className="mt-10">
        <h2 id="drivers" className="text-xl font-semibold mb-4">
          What drives it
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {DRIVERS.map((d) => (
            <article
              key={d.title}
              className="border border-(--border) rounded-xl p-5"
            >
              <h3 className="font-semibold mb-2">{d.title}</h3>
              <p className="text-sm text-(--text-secondary) mb-3">{d.text}</p>
              <ul className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
                {d.links.map((l) => (
                  <li key={l.href}>
                    {l.href.startsWith("/") ? (
                      <Link href={l.href} className="text-(--accent) underline">
                        {l.label}
                      </Link>
                    ) : (
                      <a
                        href={l.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-(--accent) underline inline-flex items-center gap-1"
                      >
                        {l.label} <ExternalLink size={11} aria-hidden="true" />
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="items" className="mt-10">
        <h2 id="items" className="text-xl font-semibold mb-4">
          Every item
        </h2>
        {LANES.map((lane) => {
          const items = ITEMS.filter((i) => i.lane === lane.id);
          if (items.length === 0) return null;
          return (
            <div key={lane.id} className="mb-6">
              <h3 className="font-semibold">{lane.label}</h3>
              <p className="text-xs text-(--text-secondary) mb-2">
                {lane.driver}
              </p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[40rem] table-fixed text-sm">
                  <colgroup>
                    <col className="w-16" />
                    <col />
                    <col className="w-20" />
                    <col className="w-28" />
                    <col className="w-56" />
                  </colgroup>
                  <thead>
                    <tr className="text-left text-(--text-secondary) border-b border-(--border)">
                      <th className="py-1 pr-3 font-medium">Issue</th>
                      <th className="py-1 pr-3 font-medium">What</th>
                      <th className="py-1 pr-3 font-medium">Priority</th>
                      <th className="py-1 pr-3 font-medium">Status</th>
                      <th className="py-1 pr-3 font-medium">Window</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((i) => (
                      <tr
                        key={i.issue}
                        className="border-b border-(--border) align-top"
                      >
                        <td className="py-1.5 pr-3">
                          <a
                            href={issueUrl(i.issue)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-(--accent) underline"
                          >
                            #{i.issue}
                          </a>
                        </td>
                        <td className="py-1.5 pr-3">
                          {i.title}
                          <span className="block text-xs text-(--text-secondary)">
                            {i.note}
                          </span>
                        </td>
                        <td className="py-1.5 pr-3">{i.priority}</td>
                        <td className="py-1.5 pr-3">
                          {STATUS_LABEL[i.status]}
                        </td>
                        <td className="py-1.5 pr-3 whitespace-nowrap">
                          {i.start} to {i.end}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
