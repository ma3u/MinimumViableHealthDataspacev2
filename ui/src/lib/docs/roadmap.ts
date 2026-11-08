/**
 * The roadmap to 2031 as data: what /docs/roadmap draws as a timeline.
 *
 * The source of truth is the plan issue #725 and the section "Roadmap to 2035:
 * EHDS, wallets and Simpl" of docs/planning-health-dataspace-v2.md. Milestones
 * are dates set by law or by the programmes; bars are planning windows set on
 * 2026-10-28, the Simpl lane's again on 2026-11-08 (#934), and move when the
 * plan does. Change both places together.
 */

export const REPO = "https://github.com/ma3u/MinimumViableHealthDataspacev2";
const issue = (n: number) => `${REPO}/issues/${n}`;

/** The sources the roadmap cites, as deep links: an article, a section, a
 *  release tag or a file and its lines. */
export const SRC = {
  /** Regulation (EU) 2025/327, the EHDS, on EUR-Lex (ELI). */
  ehds: "https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng",
  /** Implementing Regulation (EU) 2026/2098, dataset descriptions. */
  a2098: "https://eur-lex.europa.eu/eli/reg_impl/2026/2098/oj/eng",
  /** Implementing Regulation (EU) 2026/2099, cross-border identification. */
  a2099: "https://eur-lex.europa.eu/eli/reg_impl/2026/2099/oj/eng",
  /** Implementing Regulation (EU) 2026/2083, MyHealth@EU. */
  a2083: "https://eur-lex.europa.eu/eli/reg_impl/2026/2083/oj/eng",
  /** Regulation (EU) 2024/1183, eIDAS 2.0. */
  eidas: "https://eur-lex.europa.eu/eli/reg/2024/1183/oj/eng",
  /** The Commission's proposal for the European Business Wallet. */
  businessWallet:
    "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:52025PC0838",
  /** Its procedure in the Parliament's Legislative Observatory. */
  businessWalletProcedure:
    "https://oeil.secure.europarl.europa.eu/oeil/en/procedure-file?reference=2025/0358(COD)",
  dyou: "https://eudi-wallet.gov.de/",
  dsp: "https://eclipse-dataspace-protocol-base.github.io/DataspaceProtocol/2025-1/",
  dcp: "https://eclipse-dataspace-dcp.github.io/decentralized-claims-protocol/v1.0/",
  dps: "https://eclipse-dataplane-signaling.github.io/dataplane-signaling/",
  edc: "https://github.com/eclipse-edc/Connector/releases/tag/v1.0.0-RC5",
  dspTck: "https://github.com/eclipse-dataspacetck/dsp-tck/releases/tag/v1.0.2",
  fhir: "https://hl7.org/fhir/R4/",
  omop: "https://ohdsi.github.io/CommonDataModel/cdm54.html",
  healthDcatR8:
    "https://data.health.europa.eu/healthdcat-ap/releases/release-8/",
  eDelivery:
    "https://ec.europa.eu/digital-building-blocks/sites/display/DIGITAL/eDelivery",
  simplStatus:
    "https://simpl-programme.ec.europa.eu/development/development-status",
  simplWave1:
    "https://simpl-programme.ec.europa.eu/programme/simpl-live/wave-1",
  /** Simpl-Open's architecture specification, which names its EDC connector. */
  simplArchitecture:
    "https://ssg-website-ad5a79.pages.code.europa.eu/resources/architecture",
  /** Simpl's published connector: release 1.0.26 builds on EDC 0.10.1. */
  simplEdcPom:
    "https://code.europa.eu/simpl/simpl-open/development/gaia-x-edc/simpl-edc/-/blob/v1.0.26/pom.xml#L16",
  /** Simpl's own issuer: JSON-LD credentials with Ed25519 proofs, not DCP. */
  simplIssuer:
    "https://code.europa.eu/simpl/simpl-open/security/credential-management/vc-issuance-verification/issuer-service/issuer-service-be/-/blob/v1.6.0/README.md#L29-32",
  hamburg:
    "https://simpl-programme.ec.europa.eu/development/development-status/simpl-open-roadmap-items-hamburg-4.1",
  innsbruck:
    "https://simpl-programme.ec.europa.eu/development/development-status/simpl-open-roadmap-items-innsbruck-5.0",
  communityPreview:
    "https://simpl-programme.ec.europa.eu/event/simpl-open-community-preview",
  bp02e:
    "https://simpl-programme.ec.europa.eu/book-page/bp02e-governance-authority-monetisation-model-configuration",
  /** BP14 has no page of its own; the requirements changelog lists it. */
  bp14: "https://simpl-programme.ec.europa.eu/page/requirements-changelog",
  bp02f:
    "https://simpl-programme.ec.europa.eu/book-page/bp02f-governance-authority-onboards-data-space-dome-marketplace",
  bp02g:
    "https://simpl-programme.ec.europa.eu/book-page/bp02g-governance-authority-allows-dome-marketplace-discovery-its-data-space",
  sa12: "https://simpl-programme.ec.europa.eu/book-page/sa12-governance-authority-publishes-data-space-ai-services-dome-marketplace",
  adr063: `${REPO}/blob/main/docs/ADRs/ADR-063-healthdcat-ap-release-8-and-its-namespace.md`,
  adr064: `${REPO}/blob/main/docs/ADRs/ADR-064-simpl-open-through-the-outside-agent-dcp-path.md`,
  adr065: `${REPO}/blob/main/docs/ADRs/ADR-065-the-eudi-wallet-sign-in-identifies-the-person.md`,
  /** The checks that a Governance Authority is trusted for its own types only. */
  trustChecks: `${REPO}/blob/main/scripts/run-ehds-identity-checks.sh#L671-L715`,
  /** The hub's fictional health insurer. */
  alphaKasse: `${REPO}/blob/main/ui/src/lib/journey-config.ts#L36-L41`,
} as const;

/** An article of the EHDS (73), or one of its paragraphs ("073.001" is Art. 73(1)). */
export const ehdsArt = (n: number | string) =>
  typeof n === "number" ? `${SRC.ehds}#art_${n}` : `${SRC.ehds}#${n}`;

/** A text with its link tags taken out: what a chart tooltip shows. */
const untagged = (text: string) =>
  text.replace(/<(\w+)>([\s\S]*?)<\/\1>/g, "$2");

export const ROADMAP_PLANNED_ON = "2026-11-08";

/** The GitHub Project where the plan is edited: its Roadmap view draws the
 *  same bars. scripts/sync-roadmap-project.mjs carries edits between the two. */
export const ROADMAP_PROJECT = "https://github.com/users/ma3u/projects/1";

export type LaneId =
  | "regulation"
  | "identity"
  | "simpl"
  | "protocols"
  | "standards"
  | "processing";

export interface Lane {
  id: LaneId;
  label: string;
  /** The driver that sets this lane's work, in a few words. A part in
   *  <tag>...</tag> links to links[tag]. */
  driver: string;
  links?: Readonly<Record<string, string>>;
}

export const LANES: readonly Lane[] = [
  {
    id: "regulation",
    label: "EHDS regulation",
    driver: "<e>Regulation (EU) 2025/327</e> and its implementing acts",
    links: { e: SRC.ehds },
  },
  {
    id: "identity",
    label: "Identity and wallets",
    driver:
      "<eidas>eIDAS 2.0</eidas>: EUDI Wallet, <ebw>European Business Wallet</ebw>",
    links: { eidas: SRC.eidas, ebw: SRC.businessWallet },
  },
  {
    id: "simpl",
    label: "Simpl-Open",
    driver: "The EU's data space middleware",
  },
  {
    id: "protocols",
    label: "Dataspace protocols",
    driver: "Eclipse Dataspace: <dsp>DSP</dsp>, <dcp>DCP</dcp>, <dps>DPS</dps>",
    links: { dsp: SRC.dsp, dcp: SRC.dcp, dps: SRC.dps },
  },
  {
    id: "standards",
    label: "Health standards",
    driver:
      "<fhir>HL7 FHIR</fhir>, <omop>OMOP</omop>, <hdcat>HealthDCAT-AP</hdcat>",
    links: { fhir: SRC.fhir, omop: SRC.omop, hdcat: SRC.healthDcatR8 },
  },
  {
    id: "processing",
    label: "Permits and processing",
    driver: "<a68>Art. 68</a68> to <a73>73</a73>; Apache Iceberg",
    links: { a68: ehdsArt(68), a73: ehdsArt(73) },
  },
];

export type Priority = "P1" | "P2" | "P3";
export type Status = "done" | "in-progress" | "planned" | "blocked";

/** How the page and the chart's tooltips name a status. */
export const STATUS_LABEL: Record<Status, string> = {
  done: "Done",
  "in-progress": "In progress",
  planned: "Planned",
  blocked: "Blocked",
};

/** The labels in the picked language (ADR-071): the page hands in the
 *  docsCommon translator, so this file stays free of the client-side hook.
 *  Without one the labels are English. */
export type Translate = (
  text: string,
  vars?: Record<string, string | number>,
) => string;

const english: Translate = (text, vars) =>
  vars
    ? text.replace(/\{(\w+)\}/g, (m, k: string) =>
        k in vars ? String(vars[k]) : m,
      )
    : text;

export interface RoadmapItem {
  /** The GitHub issue number; also the item's id. */
  issue: number;
  lane: LaneId;
  /** The bar's label in the chart: a few words, no colon, semicolon or hash. */
  short: string;
  title: string;
  priority: Priority;
  status: Status;
  start: string;
  end: string;
  /** One sentence: where it stands or what it waits on. */
  note: string;
  /** Where a part of the title or the note in <tag>...</tag> links to. */
  links?: Readonly<Record<string, string>>;
}

export const ITEMS: readonly RoadmapItem[] = [
  // Identity and wallets
  {
    issue: 708,
    lane: "identity",
    short: "EUDI Wallet sign-in",
    title: "EUDI Wallet sign-in to <a99>2026/2099</a99>",
    priority: "P1",
    status: "in-progress",
    start: "2026-10-27",
    end: "2027-03-26",
    note: "Live since 2026-10-27 (<adr>ADR-065</adr>); <dyou>d-you</dyou> after the SPRIND sandbox registration.",
    links: { a99: SRC.a2099, adr: SRC.adr065, dyou: SRC.dyou },
  },
  {
    issue: 709,
    lane: "identity",
    short: "Business Wallet mandate",
    title:
      "<ebw>European Business Wallet</ebw>: apply for a permit on behalf of an organisation",
    priority: "P1",
    status: "planned",
    start: "2026-11-01",
    end: "2027-03-26",
    note: "ADR and spike now; built once the regulation is adopted.",
    links: { ebw: SRC.businessWallet },
  },
  {
    issue: 712,
    lane: "identity",
    short: "Healthcare attestations",
    title: "Healthcare attestations and health professionals in the wallet",
    priority: "P2",
    status: "planned",
    start: "2027-04-01",
    end: "2028-06-30",
    note: "After <i708>#708</i708>.",
    links: { i708: issue(708) },
  },
  // Simpl-Open
  {
    issue: 710,
    lane: "simpl",
    short: "Simpl issuer trust",
    title: "Trust a Simpl Governance Authority as a credential issuer",
    priority: "P1",
    status: "done",
    start: "2026-10-27",
    end: "2026-10-28",
    note: "Closed 2026-10-28: a fictional Governance Authority, trusted for its own credential types only (<adr>ADR-064, decision 2</adr>, <checks>TRUST-6.1 to 6.5</checks>).",
    links: {
      adr: `${SRC.adr064}?plain=1#L48-L51`,
      checks: SRC.trustChecks,
    },
  },
  {
    issue: 934,
    lane: "simpl",
    short: "AlphaKasse bonus on Simpl",
    title:
      "One use case across two data spaces: <ak>AlphaKasse DE</ak> rewards an active year",
    priority: "P1",
    status: "planned",
    start: "2026-11-09",
    end: "2027-03-26",
    note: "First a credential from <iss>Simpl's own issuer</iss> in the IdentityHub, then a second data space; the insurer receives a yes or no, never the data (<a54>Art. 54</a54>).",
    links: { ak: SRC.alphaKasse, iss: SRC.simplIssuer, a54: ehdsArt(54) },
  },
  {
    issue: 719,
    lane: "simpl",
    short: "HealthDCAT-AP on Simpl DCAT-AP",
    title: "HealthDCAT-AP as a profile of Simpl's DCAT-AP",
    priority: "P2",
    status: "planned",
    start: "2027-01-01",
    end: "2027-12-31",
    note: "After <inn>Innsbruck</inn>, which makes DCAT-AP Simpl's metadata model.",
    links: { inn: SRC.innsbruck },
  },
  {
    issue: 722,
    lane: "simpl",
    short: "Several access bodies",
    title: "Several access bodies as several Governance Authorities",
    priority: "P2",
    status: "planned",
    start: "2027-04-01",
    end: "2028-03-31",
    note: "After <i710>#710</i710>; the second data space of <i934>#934</i934> is the first step.",
    links: { i710: issue(710), i934: issue(934) },
  },
  {
    issue: 723,
    lane: "simpl",
    short: "Fees vs BP02E (comment)",
    title: "<a62>Art. 62</a62> fees against Simpl's monetisation model",
    priority: "P3",
    status: "planned",
    start: "2026-10-28",
    end: "2027-03-31",
    note: "Comment on <bp02e>BP02E</bp02e> and <bp14>BP14</bp14>; don't build.",
    links: { a62: ehdsArt(62), bp02e: SRC.bp02e, bp14: SRC.bp14 },
  },
  {
    issue: 724,
    lane: "simpl",
    short: "DOME and SPE (comment)",
    title: "DOME: health services findable, usable only inside an SPE",
    priority: "P3",
    status: "planned",
    start: "2026-10-28",
    end: "2027-03-31",
    note: "Comment on <bp02f>BP02F</bp02f>, <bp02g>BP02G</bp02g> and <sa12>SA12</sa12>; don't build.",
    links: { bp02f: SRC.bp02f, bp02g: SRC.bp02g, sa12: SRC.sa12 },
  },
  // Dataspace protocols
  {
    issue: 711,
    lane: "protocols",
    short: "DSP kit vs Simpl",
    title: "<tck>DSP compatibility kit</tck> against a Simpl-Open connector",
    priority: "P1",
    status: "planned",
    start: "2026-11-09",
    end: "2027-03-26",
    note: "Simpl's code is public: <pom>release 1.0.26 builds on EDC 0.10.1</pom>, older than <dsp>DSP 2025-1</dsp>; step 0b of <i934>#934</i934>.",
    links: {
      tck: SRC.dspTck,
      pom: SRC.simplEdcPom,
      dsp: SRC.dsp,
      i934: issue(934),
    },
  },
  {
    issue: 720,
    lane: "protocols",
    short: "Permit as DSP agreements",
    title:
      "One <a68>Art. 68</a68> permit, one <dsp>DSP</dsp> agreement per holder",
    priority: "P2",
    status: "planned",
    start: "2027-04-01",
    end: "2028-06-30",
    note: "A permit the access body issues, carried out as bilateral contracts.",
    links: { a68: ehdsArt(68), dsp: SRC.dsp },
  },
  {
    issue: 721,
    lane: "protocols",
    short: "Opt-out at the holder",
    title: "The <a71>Art. 71</a71> opt-out at the holder's connector",
    priority: "P2",
    status: "planned",
    start: "2027-06-01",
    end: "2028-06-30",
    note: "A person filter when data is handed over.",
    links: { a71: ehdsArt(71) },
  },
  {
    issue: 204,
    lane: "protocols",
    short: "Sealed permits",
    title: "Sealed data permits as credentials",
    priority: "P2",
    status: "planned",
    start: "2027-07-01",
    end: "2028-09-30",
    note: "Used by <i709>#709</i709> and <i720>#720</i720>.",
    links: { i709: issue(709), i720: issue(720) },
  },
  // Health standards
  {
    issue: 694,
    lane: "standards",
    short: "Adopted articles",
    title:
      "The <num>adopted article numbers</num> and the 2026 implementing acts",
    priority: "P1",
    status: "done",
    start: "2026-10-01",
    end: "2026-10-27",
    note: "Closed 2026-10-27.",
    links: { num: "/docs/ehds/article-numbering" },
  },
  {
    issue: 700,
    lane: "standards",
    short: "HealthDCAT-AP R8",
    title:
      "<r8>HealthDCAT-AP Release 8</r8>, valid against the official shapes",
    priority: "P1",
    status: "done",
    start: "2026-10-13",
    end: "2026-10-28",
    note: "On Azure since 2026-10-28 (<adr>ADR-063</adr>).",
    links: { r8: SRC.healthDcatR8, adr: SRC.adr063 },
  },
  {
    issue: 714,
    lane: "standards",
    short: "Art. 79 harvesting",
    title: "<a79>Art. 79</a79>: publish the catalogue for harvesting",
    priority: "P2",
    status: "planned",
    start: "2027-01-01",
    end: "2027-12-31",
    note: "The EU dataset catalogue reads HealthDCAT-AP.",
    links: { a79: ehdsArt(79) },
  },
  {
    issue: 715,
    lane: "standards",
    short: "Art. 78 quality label",
    title: "<a78>Art. 78</a78>: the quality and utility label in the metadata",
    priority: "P2",
    status: "planned",
    start: "2027-06-01",
    end: "2028-06-30",
    note: "In the dataset description.",
    links: { a78: ehdsArt(78) },
  },
  {
    issue: 713,
    lane: "standards",
    short: "Art. 75 NCP adapter",
    title:
      "<a75>Art. 75</a75>: a national contact point adapter over <ed>eDelivery</ed>",
    priority: "P2",
    status: "planned",
    start: "2027-03-01",
    end: "2028-12-31",
    note: "After the HealthData@EU implementing act.",
    links: { a75: ehdsArt(75), ed: SRC.eDelivery },
  },
  {
    issue: 718,
    lane: "standards",
    short: "Art. 7 portability",
    title: "<a7>Art. 7</a7> portability on the HL7 Europe guides",
    priority: "P2",
    status: "planned",
    start: "2027-09-01",
    end: "2028-12-31",
    note: "<fhir>FHIR</fhir> in the European exchange format.",
    links: { a7: ehdsArt(7), fhir: SRC.fhir },
  },
  // Permits and processing
  {
    issue: 649,
    lane: "processing",
    short: "Iceberg spike",
    title: "Spike: Apache Iceberg tables with a REST catalog inside the SPE",
    priority: "P2",
    status: "planned",
    start: "2026-11-01",
    end: "2027-02-28",
    note: "Gravitino or Polaris; credentials vended only under a valid agreement. Sub-issue of <i716>#716</i716>.",
    links: { i716: issue(716) },
  },
  {
    issue: 716,
    lane: "processing",
    short: "Art. 73 SPE workspace",
    title:
      "<a73>Art. 73</a73> secure processing environment: a workspace per permit",
    priority: "P2",
    status: "planned",
    start: "2027-03-01",
    end: "2029-03-26",
    note: "Results leave only after review.",
    links: { a73: ehdsArt(73) },
  },
  {
    issue: 717,
    lane: "processing",
    short: "Chapter IV applications",
    title:
      "Applications: <a53>Art. 53</a53> purposes, <a81>Art. 81</a81> complaints, <a70>Art. 70</a70> templates",
    priority: "P2",
    status: "planned",
    start: "2027-03-26",
    end: "2028-09-30",
    note: "Templates after their implementing act.",
    links: { a53: ehdsArt(53), a81: ehdsArt(81), a70: ehdsArt(70) },
  },
];

export interface Milestone {
  id: string;
  lane: LaneId;
  date: string;
  /** Short, shown next to the marker; no colon, semicolon or hash. */
  label: string;
  detail: string;
  href: string;
}

export const MILESTONES: readonly Milestone[] = [
  {
    id: "ehds-2027",
    lane: "regulation",
    date: "2027-03-26",
    label: "EHDS applies",
    detail:
      "The Regulation applies generally; access bodies and national contact points are designated. For an online request through MyHealth@EU, persons identify with electronic identification means under eIDAS at assurance level substantial (2026/2099, Art. 4(2)).",
    href: ehdsArt(105),
  },
  {
    id: "healthdata-eu-act",
    lane: "regulation",
    date: "2026-12-15",
    label: "HealthData@EU act",
    detail:
      "The Art. 75 implementing act on HealthData@EU, planned for adoption in Q4 2026.",
    href: `${REPO}/blob/main/docs/simpl-ehds-gap-analysis.md#1-the-regulatory-baseline`,
  },
  {
    id: "ehds-2029",
    lane: "regulation",
    date: "2029-03-26",
    label: "Secondary use in full",
    detail:
      "Chapter IV in full and Chapter II for the first priority categories; dataset descriptions under 2026/2098.",
    href: `${SRC.a2098}#art_4`,
  },
  {
    id: "assurance-high",
    lane: "regulation",
    date: "2030-03-26",
    label: "Assurance high",
    detail:
      "2026/2099, Art. 4(2): from 26 March 2030 the electronic identification means for an online request through MyHealth@EU provide assurance level high.",
    href: `${SRC.a2099}#004.002`,
  },
  {
    id: "ehds-2031",
    lane: "regulation",
    date: "2031-03-26",
    label: "More categories",
    detail:
      "Further data categories of Art. 51(1); Chapter III for EHR systems in service. Third countries follow in 2035.",
    href: ehdsArt(105),
  },
  {
    id: "business-wallet",
    lane: "identity",
    date: "2026-12-31",
    label: "Business Wallet agreement",
    detail:
      "COM(2025) 838, procedure 2025/0358(COD): Parliament confirmed on 7 October 2026 that it enters negotiations with the Council. The end of 2026 is this plan's assumption for an agreement, not a date set by the procedure.",
    href: SRC.businessWalletProcedure,
  },
  {
    id: "d-you",
    lane: "identity",
    date: "2027-01-01",
    label: "d-you early 2027",
    detail:
      "The German EUDI Wallet is to be available on smartphones from early 2027; no day is set, so the marker stands at the start of the year.",
    href: SRC.dyou,
  },
  {
    id: "hamburg",
    lane: "simpl",
    date: "2026-10-16",
    label: "Hamburg 4.1",
    detail:
      "Simpl-Open 4.1.0, planned for GitLab in the second half of October 2026; the marker stands at the start of that half.",
    href: SRC.hamburg,
  },
  {
    id: "community-preview",
    lane: "simpl",
    date: "2026-10-28",
    label: "Community Preview",
    detail:
      "Held online on 28 October 2026: the proposed DOME integration and monetisation requirements (BP02E, BP02F, BP02G, SA12). The hub's comments are #723 and #724.",
    href: SRC.communityPreview,
  },
  {
    id: "innsbruck",
    lane: "simpl",
    date: "2026-12-15",
    label: "Innsbruck 5.0",
    detail:
      "Simpl-Open release Innsbruck 5.0, targeted for Q4 2026, with SSI Tier 2 (verifiable credentials and decentralised identifiers) and DCAT-AP as the metadata model. No day is set; the marker stands in mid-December. The hub recommends DCP v1.0 and EDC 1.0 in the same step (gap analysis, section 8).",
    href: SRC.innsbruck,
  },
];

export const issueUrl = issue;

/** The chart's id for an item or a milestone, also its anchor: #i934, #m_hamburg. */
export const itemTaskId = (n: number) => `i${n}`;
export const milestoneTaskId = (id: string) =>
  `m_${id.replace(/[^a-z0-9]/gi, "_")}`;

/** Every bar and marker: its task id, where a click goes, and what it says. */
export function roadmapTargets(tr?: Translate): {
  taskId: string;
  href: string;
  label: string;
}[] {
  // English keeps the status ids ("in-progress") the tooltips always had.
  const t = tr ?? english;
  const status = (s: Status) => (tr ? tr(STATUS_LABEL[s]) : s);
  return [
    ...ITEMS.map((i) => ({
      taskId: itemTaskId(i.issue),
      href: issueUrl(i.issue),
      label: `#${i.issue} ${untagged(t(i.title))} (${i.priority}, ${status(
        i.status,
      )}, ${t("{start} to {end}", { start: i.start, end: i.end })}). ${untagged(
        t(i.note),
      )}`,
    })),
    ...MILESTONES.map((m) => ({
      taskId: milestoneTaskId(m.id),
      href: m.href,
      label: `${m.date}: ${t(m.label)}. ${t(m.detail)}`,
    })),
  ];
}
