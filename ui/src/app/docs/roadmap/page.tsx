import Link from "next/link";
import { ArrowLeft, ChartGantt, ExternalLink } from "lucide-react";
import { DocsLastUpdated } from "@/components/docs/DocsLastUpdated";
import { LinkedText } from "@/components/docs/LinkedText";
import RoadmapTimeline from "@/components/docs/RoadmapTimeline";
import {
  EPICS,
  ITEMS,
  LANES,
  REPO,
  ROADMAP_PLANNED_ON,
  ROADMAP_PROJECT,
  SRC,
  STATUS_LABEL,
  ehdsArt,
  epicOf,
  epicStatus,
  epicTaskId,
  epicWindow,
  issueUrl,
} from "@/lib/docs/roadmap";
import { T } from "@/lib/i18n/translate";

export const metadata = {
  title: "Roadmap",
  description:
    "The roadmap to 2031 as an interactive timeline: the dates of the EHDS Regulation and its implementing acts, the EUDI and Business Wallets, Simpl-Open, the epics every open issue belongs to, and the drivers behind them.",
};

/** A link in a text, opened in a new tab. */
function inlineLink(href: string) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-(--accent) underline"
    />
  );
}

/** The six drivers, each with the sources it rests on. Titles, texts and
 *  link labels are keys of the docsCommon dictionary (ADR-071); a part of a
 *  text in <tag>...</tag> links to tags[tag], deep to the article, section,
 *  release or file it cites. */
const DRIVERS: {
  title: string;
  text: string;
  tags: Record<string, string>;
  links: { label: string; href: string }[];
}[] = [
  {
    title: "The EHDS Regulation, to 2031",
    text: "Regulation (EU) 2025/327 applies in stages (<art>Art. 105</art>): generally from 26 March 2027, secondary use in full from 26 March 2029, further data categories from 26 March 2031. The 2026 implementing acts turn articles into specifications: dataset descriptions (<a98>2026/2098</a98>), cross-border identification and authentication of persons and health professionals, with assurance levels (<a99>2026/2099</a99>), MyHealth@EU (<a83>2026/2083</a83>).",
    tags: {
      art: ehdsArt(105),
      a98: SRC.a2098,
      a99: SRC.a2099,
      a83: SRC.a2083,
    },
    links: [
      { label: "Regulation (EU) 2025/327", href: SRC.ehds },
      { label: "2026/2098", href: SRC.a2098 },
      { label: "2026/2099", href: SRC.a2099 },
      { label: "2026/2083", href: SRC.a2083 },
      {
        label: "The Commission's EHDS page",
        href: "https://health.ec.europa.eu/ehealth-digital-health-and-care/european-health-data-space-regulation-ehds_en",
      },
      {
        label: "TEHDAS2 guidance",
        href: "https://tehdas.eu/results-by-user-group/",
      },
      { label: "What the hub implements", href: "/docs/ehds" },
    ],
  },
  {
    title: "Simpl, the EU's data space middleware",
    text: "Simpl-Open is the Commission's open-source middleware for European data spaces; the EHDS secondary-use data space is one of the six data spaces of <w1>Simpl-Live wave 1</w1>. The hub meets it as a connector outside its agent, over <dsp>DSP</dsp> and <dcp>DCP</dcp>, and keeps the health rules in its own extension (<adr>ADR-064</adr>).",
    tags: {
      w1: SRC.simplWave1,
      dsp: SRC.dsp,
      dcp: SRC.dcp,
      adr: SRC.adr064,
    },
    links: [
      {
        label: "Simpl programme",
        href: "https://simpl-programme.ec.europa.eu/",
      },
      { label: "Development status", href: SRC.simplStatus },
      {
        label: "Gap analysis",
        href: `${REPO}/blob/main/docs/simpl-ehds-gap-analysis.md`,
      },
      { label: "ADR-064", href: SRC.adr064 },
    ],
  },
  {
    title: "eIDAS 2.0: the EUDI Wallet and the Business Wallet",
    text: "<eidas>eIDAS 2.0</eidas> obliges every Member State to offer a wallet. <a99>2026/2099, Art. 4(2)</a99> asks, for an online request through MyHealth@EU, for electronic identification means under eIDAS at assurance level substantial from 26 March 2027 and high from 26 March 2030; it does not single out the EUDI Wallet. The German wallet <dyou>d-you</dyou> is to be available from early 2027. The <ebw>European Business Wallet</ebw>, still in negotiation, lets a person act for an organisation, as a researcher applying for a permit does.",
    tags: {
      eidas: SRC.eidas,
      a99: `${SRC.a2099}#004.002`,
      dyou: SRC.dyou,
      ebw: SRC.businessWallet,
    },
    links: [
      { label: "Regulation (EU) 2024/1183", href: SRC.eidas },
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
      { label: "d-you", href: SRC.dyou },
      { label: "European Business Wallet", href: SRC.businessWallet },
      { label: "ADR-065", href: SRC.adr065 },
    ],
  },
  {
    title: "Health standards: HL7 FHIR, OMOP, HealthDCAT-AP",
    text: "<fhir>HL7 FHIR R4</fhir> with the HL7 Europe guides carries the record and the European exchange format; <omop>OMOP CDM 5.4</omop> is the research model. <a98>2026/2098</a98> points dataset descriptions to the latest HealthDCAT-AP release without naming a number; the hub follows <r8>Release 8</r8>, the release that address led to when it was checked on 2026-10-27 (<adr>ADR-063</adr>).",
    tags: {
      fhir: SRC.fhir,
      omop: SRC.omop,
      a98: `${SRC.a2098}#anx_1`,
      r8: SRC.healthDcatR8,
      adr: `${SRC.adr063}?plain=1#L27-L33`,
    },
    links: [
      { label: "HL7 FHIR R4", href: SRC.fhir },
      { label: "HL7 Europe", href: "https://hl7.eu/fhir/" },
      { label: "Xt-EHR", href: "https://www.xt-ehr.eu/" },
      { label: "OMOP CDM", href: SRC.omop },
      { label: "HealthDCAT-AP Release 8", href: SRC.healthDcatR8 },
      { label: "ADR-063", href: SRC.adr063 },
    ],
  },
  {
    title: "Eclipse Dataspace: DSP, DCP and DPS",
    text: "The Dataspace Protocol came from IDSA and is standardised by the Eclipse Dataspace Working Group. <dsp>DSP</dsp> negotiates contracts and transfers, <dcp>DCP</dcp> proves identity with verifiable credentials, <dps>Data Plane Signaling</dps> lets the control plane start and stop a data plane. <simpl>Simpl-Open runs Eclipse EDC too</simpl>, so these are where the two meet.",
    tags: {
      dsp: SRC.dsp,
      dcp: SRC.dcp,
      dps: SRC.dps,
      simpl: SRC.simplArchitecture,
    },
    links: [
      { label: "Dataspace Protocol", href: SRC.dsp },
      { label: "Decentralized Claims Protocol", href: SRC.dcp },
      { label: "Data Plane Signaling", href: SRC.dps },
      { label: "Eclipse Dataspace", href: "https://dataspace.eclipse.org/" },
      { label: "IDSA", href: "https://internationaldataspaces.org/" },
      { label: "Eclipse EDC", href: SRC.edc },
    ],
  },
  {
    title: "Apache Iceberg and the lakehouse formats",
    text: "Open table formats are how the large data platforms store analytical data. In the hub they belong inside the secure processing environment: OMOP as Iceberg tables behind a REST catalog, with storage credentials handed out only under a valid agreement. That is the spike <i649>#649</i649>, under <i716>#716</i716>.",
    tags: { i649: issueUrl(649), i716: issueUrl(716) },
    links: [
      { label: "Apache Iceberg", href: "https://iceberg.apache.org/" },
      { label: "Apache Parquet", href: "https://parquet.apache.org/" },
      { label: "Apache Arrow", href: "https://arrow.apache.org/" },
      { label: "Spike #649", href: issueUrl(649) },
    ],
  },
];

export default function RoadmapDocsPage() {
  return (
    <div className="max-w-6xl mx-auto px-6 py-12">
      <Link
        href="/docs"
        className="inline-flex items-center gap-1 text-sm text-(--text-secondary) hover:text-(--text-primary) mb-6"
      >
        <ArrowLeft size={14} /> <T area="docsCommon">{"Back to Docs"}</T>
      </Link>

      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2 inline-flex items-center gap-2">
          <ChartGantt size={28} aria-hidden="true" />{" "}
          <T area="nav">{"Roadmap"}</T>
        </h1>
        <DocsLastUpdated page="/docs/roadmap" />
        <p className="text-(--text-secondary) text-lg">
          <T
            area="docsCommon"
            vars={{ date: ROADMAP_PLANNED_ON }}
            tags={{
              e: inlineLink(ehdsArt(105)),
              a: inlineLink(issueUrl(725)),
            }}
          >
            {
              "The roadmap to 2031, set by the dates of the <e>EHDS Regulation</e> and its implementing acts, the EUDI and Business Wallets and Simpl-Open. The diamonds are dates set by law or by the programmes; the bars are planning windows set on {date}. P1 is due by 26 March 2027, P2 by 26 March 2029; P3 is a comment, not a build. The plan is <a>#725</a>."
            }
          </T>
        </p>
        <p className="text-(--text-secondary) mt-2">
          <T area="docsCommon" tags={{ p: inlineLink(ROADMAP_PROJECT) }}>
            {
              "The plan is edited in the <p>GitHub Project</p>: drag a bar in its Roadmap view, or change a start, a target, a priority or a status. This page draws the same plan with its notes and sources."
            }
          </T>
        </p>
        <p className="text-(--text-secondary) mt-2">
          <T
            area="docsCommon"
            tags={{ e: inlineLink(`${ROADMAP_PROJECT}/views/6`) }}
          >
            {
              "Every open issue belongs to one of nine <e>epics</e>, a parent issue on GitHub with the work as its sub-issues. An epic's hatched bar runs from its first issue to the deadline its issues' priorities set."
            }
          </T>
        </p>
      </div>

      <section aria-labelledby="chart">
        <h2 id="chart" className="text-xl font-semibold mb-2">
          <T area="docsCommon">{"The chart"}</T>
        </h2>
        <ul className="flex flex-wrap gap-4 text-xs text-(--text-secondary) mb-2">
          <li>
            <T area="docsCommon">{"Light bar with a blue border: planned"}</T>
          </li>
          <li>
            <T area="docsCommon">{"Solid blue bar: in progress"}</T>
          </li>
          <li>
            <T area="docsCommon">{"Red bar: blocked"}</T>
          </li>
          <li>
            <T area="docsCommon">{"Grey bar: done"}</T>
          </li>
          <li>
            <T area="docsCommon">{"Hatched bar: an epic"}</T>
          </li>
          <li>
            <T area="docsCommon">{"Diamond: a fixed date"}</T>
          </li>
          <li>
            <T area="docsCommon">{"Red line: today"}</T>
          </li>
        </ul>
        <RoadmapTimeline />
      </section>

      <section aria-labelledby="epics" className="mt-10">
        <h2 id="epics" className="text-xl font-semibold mb-4">
          <T area="docsCommon">{"The epics"}</T>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {EPICS.map((e) => {
            const w = epicWindow(e);
            const open = (["P1", "P2", "P3"] as const).filter(
              (p) => e.open[p].length,
            );
            const total =
              open.reduce((n, p) => n + e.open[p].length, 0) + e.done.length;
            return (
              <article
                key={e.issue}
                id={epicTaskId(e.issue)}
                data-testid="roadmap-epic"
                className="border border-(--border) rounded-xl p-5"
              >
                <p className="text-xs text-(--text-secondary)">
                  <T area="docsCommon">{"Epic"}</T> #{e.issue} ·{" "}
                  <T area="docsCommon">
                    {LANES.find((l) => l.id === e.lane)!.label}
                  </T>
                </p>
                <h3 className="font-semibold mt-1 mb-2">
                  <T area="docsCommon">{e.title}</T>
                </h3>
                <p className="mb-2 flex flex-wrap gap-1 text-xs">
                  <span className="rounded-full border border-(--border-ui) px-2">
                    {e.priority}
                  </span>
                  <span className="rounded-full border border-(--border-ui) px-2">
                    <T area="docsCommon">{STATUS_LABEL[epicStatus(e)]}</T>
                  </span>
                  <span className="rounded-full border border-(--border-ui) px-2">
                    <T area="docsCommon" vars={w}>
                      {"{start} to {end}"}
                    </T>
                  </span>
                  <span className="rounded-full border border-(--border-ui) px-2">
                    <T area="docsCommon" vars={{ done: e.done.length, total }}>
                      {"{done} of {total} done"}
                    </T>
                  </span>
                </p>
                <p className="text-sm text-(--text-secondary) mb-3">
                  <LinkedText area="docsCommon" text={e.note} links={e.links} />
                </p>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm mb-3">
                  {open.map((p) => (
                    <div key={p} className="contents">
                      <dt className="font-medium">{p}</dt>
                      <dd className="flex flex-wrap gap-x-2">
                        {e.open[p].map((n) => (
                          <a
                            key={n}
                            href={issueUrl(n)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-(--accent) underline"
                          >
                            #{n}
                          </a>
                        ))}
                      </dd>
                    </div>
                  ))}
                  {e.done.length > 0 && (
                    <div className="contents">
                      <dt className="font-medium">
                        <T area="docsCommon">{"Done"}</T>
                      </dt>
                      <dd className="flex flex-wrap gap-x-2">
                        {e.done.map((n) => (
                          <a
                            key={n}
                            href={issueUrl(n)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-(--accent) underline line-through"
                          >
                            #{n}
                          </a>
                        ))}
                      </dd>
                    </div>
                  )}
                </dl>
                <a
                  href={issueUrl(e.issue)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-(--accent) underline inline-flex items-center gap-1"
                >
                  <T area="docsCommon" vars={{ n: e.issue }}>
                    {"Open epic #{n}"}
                  </T>{" "}
                  <ExternalLink size={11} aria-hidden="true" />
                </a>
              </article>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="drivers" className="mt-10">
        <h2 id="drivers" className="text-xl font-semibold mb-4">
          <T area="docsCommon">{"What drives it"}</T>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {DRIVERS.map((d) => (
            <article
              key={d.title}
              className="border border-(--border) rounded-xl p-5"
            >
              <h3 className="font-semibold mb-2">
                <T area="docsCommon">{d.title}</T>
              </h3>
              <p className="text-sm text-(--text-secondary) mb-3">
                <LinkedText area="docsCommon" text={d.text} links={d.tags} />
              </p>
              <ul className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
                {d.links.map((l) => (
                  <li key={l.href}>
                    {l.href.startsWith("/") ? (
                      <Link href={l.href} className="text-(--accent) underline">
                        <T area="docsCommon">{l.label}</T>
                      </Link>
                    ) : (
                      <a
                        href={l.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-(--accent) underline inline-flex items-center gap-1"
                      >
                        <T area="docsCommon">{l.label}</T>{" "}
                        <ExternalLink size={11} aria-hidden="true" />
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
          <T area="docsCommon">{"Every item"}</T>
        </h2>
        {LANES.map((lane) => {
          const items = ITEMS.filter((i) => i.lane === lane.id);
          if (items.length === 0) return null;
          return (
            <div key={lane.id} className="mb-6">
              <h3 className="font-semibold">
                <T area="docsCommon">{lane.label}</T>
              </h3>
              <p className="text-xs text-(--text-secondary) mb-2">
                <LinkedText
                  area="docsCommon"
                  text={lane.driver}
                  links={lane.links}
                />
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
                      <th className="py-1 pr-3 font-medium">
                        <T area="docsCommon">{"Issue"}</T>
                      </th>
                      <th className="py-1 pr-3 font-medium">
                        <T area="docsCommon">{"What"}</T>
                      </th>
                      <th className="py-1 pr-3 font-medium">
                        <T area="docsCommon">{"Priority"}</T>
                      </th>
                      <th className="py-1 pr-3 font-medium">
                        <T area="docsCommon">{"Status"}</T>
                      </th>
                      <th className="py-1 pr-3 font-medium">
                        <T area="docsCommon">{"Window"}</T>
                      </th>
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
                          <LinkedText
                            area="docsCommon"
                            text={i.title}
                            links={i.links}
                          />
                          <span className="block text-xs text-(--text-secondary)">
                            <LinkedText
                              area="docsCommon"
                              text={i.note}
                              links={i.links}
                            />
                          </span>
                          {epicOf(i.issue) && (
                            <a
                              href={`#${epicTaskId(epicOf(i.issue)!.issue)}`}
                              className="text-xs text-(--accent) underline"
                            >
                              <T
                                area="docsCommon"
                                vars={{ n: epicOf(i.issue)!.issue }}
                              >
                                {"Epic #{n}"}
                              </T>
                            </a>
                          )}
                        </td>
                        <td className="py-1.5 pr-3">{i.priority}</td>
                        <td className="py-1.5 pr-3">
                          <T area="docsCommon">{STATUS_LABEL[i.status]}</T>
                        </td>
                        <td className="py-1.5 pr-3 whitespace-nowrap">
                          <T
                            area="docsCommon"
                            vars={{ start: i.start, end: i.end }}
                          >
                            {"{start} to {end}"}
                          </T>
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
