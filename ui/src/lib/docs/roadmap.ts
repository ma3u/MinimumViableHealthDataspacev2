/**
 * The roadmap to 2031 as data: what /docs/roadmap draws as a Gantt chart.
 *
 * The source of truth is the plan issue #725 and the section "Roadmap to 2035:
 * EHDS, wallets and Simpl" of docs/planning-health-dataspace-v2.md. Milestones
 * are dates set by law or by the programmes; bars are planning windows set on
 * 2026-10-28 and move when the plan does. Change both places together.
 */

export const REPO = "https://github.com/ma3u/MinimumViableHealthDataspacev2";
const issue = (n: number) => `${REPO}/issues/${n}`;

export const ROADMAP_PLANNED_ON = "2026-10-28";

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
  /** The driver that sets this lane's work, in a few words. */
  driver: string;
}

export const LANES: readonly Lane[] = [
  {
    id: "regulation",
    label: "EHDS regulation",
    driver: "Regulation (EU) 2025/327 and its implementing acts",
  },
  {
    id: "identity",
    label: "Identity and wallets",
    driver: "eIDAS 2.0: EUDI Wallet, European Business Wallet",
  },
  {
    id: "simpl",
    label: "Simpl-Open",
    driver: "The EU's data space middleware",
  },
  {
    id: "protocols",
    label: "Dataspace protocols",
    driver: "Eclipse Dataspace: DSP, DCP, DPS",
  },
  {
    id: "standards",
    label: "Health standards",
    driver: "HL7 FHIR, OMOP, HealthDCAT-AP",
  },
  {
    id: "processing",
    label: "Permits and processing",
    driver: "Art. 68 to 73; Apache Iceberg",
  },
];

export type Priority = "P1" | "P2" | "P3";
export type Status = "done" | "in-progress" | "planned" | "blocked";

export interface RoadmapItem {
  /** The GitHub issue number; also the item's id. */
  issue: number;
  lane: LaneId;
  /** The bar's label in the chart: no colon, semicolon or hash (Mermaid syntax). */
  short: string;
  title: string;
  priority: Priority;
  status: Status;
  start: string;
  end: string;
  /** One sentence: where it stands or what it waits on. */
  note: string;
}

export const ITEMS: readonly RoadmapItem[] = [
  // Identity and wallets
  {
    issue: 708,
    lane: "identity",
    short: "EUDI Wallet sign-in",
    title: "EUDI Wallet sign-in to 2026/2099",
    priority: "P1",
    status: "in-progress",
    start: "2026-10-27",
    end: "2027-03-26",
    note: "Live since 2026-10-27 (ADR-065); d-you after the SPRIND sandbox registration.",
  },
  {
    issue: 709,
    lane: "identity",
    short: "Business Wallet mandate",
    title:
      "European Business Wallet: apply for a permit on behalf of an organisation",
    priority: "P1",
    status: "planned",
    start: "2026-11-01",
    end: "2027-03-26",
    note: "ADR and spike now; built once the regulation is adopted.",
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
    note: "After #708.",
  },
  // Simpl-Open
  {
    issue: 710,
    lane: "simpl",
    short: "Simpl issuer trust",
    title: "Trust a Simpl Governance Authority as a credential issuer",
    priority: "P1",
    status: "planned",
    start: "2026-11-01",
    end: "2027-03-26",
    note: "ADR-064, decision 2.",
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
    note: "After the Innsbruck schema.",
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
    note: "After #710.",
  },
  {
    issue: 723,
    lane: "simpl",
    short: "Fees vs BP02E (comment)",
    title: "Art. 62 fees against Simpl's monetisation model",
    priority: "P3",
    status: "planned",
    start: "2026-10-28",
    end: "2027-03-31",
    note: "Comment on BP02E and BP14; don't build.",
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
    note: "Comment on BP02F, BP02G and SA12; don't build.",
  },
  // Dataspace protocols
  {
    issue: 711,
    lane: "protocols",
    short: "DSP kit vs Simpl",
    title: "DSP compatibility kit against a Simpl-Open connector",
    priority: "P1",
    status: "blocked",
    start: "2026-11-01",
    end: "2027-03-26",
    note: "Blocked until the Hamburg 4.1 code is public.",
  },
  {
    issue: 720,
    lane: "protocols",
    short: "Permit as DSP agreements",
    title: "One Art. 68 permit, one DSP agreement per holder",
    priority: "P2",
    status: "planned",
    start: "2027-04-01",
    end: "2028-06-30",
    note: "A permit the access body issues, carried out as bilateral contracts.",
  },
  {
    issue: 721,
    lane: "protocols",
    short: "Opt-out at the holder",
    title: "The Art. 71 opt-out at the holder's connector",
    priority: "P2",
    status: "planned",
    start: "2027-06-01",
    end: "2028-06-30",
    note: "A person filter when data is handed over.",
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
    note: "Used by #709 and #720.",
  },
  // Health standards
  {
    issue: 694,
    lane: "standards",
    short: "Adopted articles",
    title: "The adopted article numbers and the 2026 implementing acts",
    priority: "P1",
    status: "done",
    start: "2026-10-01",
    end: "2026-10-27",
    note: "Closed 2026-10-27.",
  },
  {
    issue: 700,
    lane: "standards",
    short: "HealthDCAT-AP R8",
    title: "HealthDCAT-AP Release 8, valid against the official shapes",
    priority: "P1",
    status: "done",
    start: "2026-10-13",
    end: "2026-10-28",
    note: "On Azure since 2026-10-28 (ADR-063).",
  },
  {
    issue: 714,
    lane: "standards",
    short: "Art. 79 harvesting",
    title: "Art. 79: publish the catalogue for harvesting",
    priority: "P2",
    status: "planned",
    start: "2027-01-01",
    end: "2027-12-31",
    note: "The EU dataset catalogue reads HealthDCAT-AP.",
  },
  {
    issue: 715,
    lane: "standards",
    short: "Art. 78 quality label",
    title: "Art. 78: the quality and utility label in the metadata",
    priority: "P2",
    status: "planned",
    start: "2027-06-01",
    end: "2028-06-30",
    note: "In the dataset description.",
  },
  {
    issue: 713,
    lane: "standards",
    short: "Art. 75 NCP adapter",
    title: "Art. 75: a national contact point adapter over eDelivery",
    priority: "P2",
    status: "planned",
    start: "2027-03-01",
    end: "2028-12-31",
    note: "After the HealthData@EU implementing act.",
  },
  {
    issue: 718,
    lane: "standards",
    short: "Art. 7 portability",
    title: "Art. 7 portability on the HL7 Europe guides",
    priority: "P2",
    status: "planned",
    start: "2027-09-01",
    end: "2028-12-31",
    note: "FHIR in the European exchange format.",
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
    note: "Gravitino or Polaris; credentials vended only under a valid agreement. Sub-issue of #716.",
  },
  {
    issue: 716,
    lane: "processing",
    short: "Art. 73 SPE workspace",
    title: "Art. 73 secure processing environment: a workspace per permit",
    priority: "P2",
    status: "planned",
    start: "2027-03-01",
    end: "2029-03-26",
    note: "Results leave only after review.",
  },
  {
    issue: 717,
    lane: "processing",
    short: "Chapter IV applications",
    title:
      "Applications: Art. 54 purposes, Art. 81 complaints, Art. 70 templates",
    priority: "P2",
    status: "planned",
    start: "2027-03-26",
    end: "2028-09-30",
    note: "Templates after their implementing act.",
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

const EURLEX = "https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=";

export const MILESTONES: readonly Milestone[] = [
  {
    id: "ehds-2027",
    lane: "regulation",
    date: "2027-03-26",
    label: "EHDS applies",
    detail:
      "The Regulation applies generally; access bodies and national contact points are designated. Persons identify with the EUDI Wallet at assurance level substantial (2026/2099).",
    href: `${EURLEX}CELEX:32025R0327`,
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
    href: `${EURLEX}OJ:L_202602098`,
  },
  {
    id: "assurance-high",
    lane: "regulation",
    date: "2030-01-01",
    label: "Assurance high",
    detail: "2026/2099: assurance level high from 2030.",
    href: `${EURLEX}OJ:L_202602099`,
  },
  {
    id: "ehds-2031",
    lane: "regulation",
    date: "2031-03-26",
    label: "More categories",
    detail:
      "Further data categories of Art. 51(1); Chapter III for EHR systems in service. Third countries follow in 2035.",
    href: `${EURLEX}CELEX:32025R0327`,
  },
  {
    id: "business-wallet",
    lane: "identity",
    date: "2026-12-31",
    label: "Business Wallet agreement",
    detail:
      "COM(2025) 838: the Council's position of 9 June 2026; Parliament and Council aim to agree by the end of 2026.",
    href: "https://digital-strategy.ec.europa.eu/en/policies/european-business-wallet",
  },
  {
    id: "d-you",
    lane: "identity",
    date: "2027-01-02",
    label: "d-you in production",
    detail: "The German EUDI Wallet goes into production.",
    href: "https://eudi-wallet.gov.de/",
  },
  {
    id: "hamburg",
    lane: "simpl",
    date: "2026-10-15",
    label: "Hamburg 4.1",
    detail: "Simpl-Open release Hamburg 4.1, targeted for October 2026.",
    href: "https://simpl-programme.ec.europa.eu/development/development-status",
  },
  {
    id: "community-preview",
    lane: "simpl",
    date: "2026-10-28",
    label: "Community Preview",
    detail:
      "The proposed DOME integration and monetisation requirements (BP02E, BP02F, BP02G, SA12), open for comment.",
    href: "https://simpl-programme.ec.europa.eu/event/simpl-open-community-preview",
  },
  {
    id: "innsbruck",
    lane: "simpl",
    date: "2026-12-15",
    label: "Innsbruck 5.0",
    detail: "Simpl-Open release Innsbruck 5.0, targeted for Q4 2026.",
    href: "https://simpl-programme.ec.europa.eu/development/development-status",
  },
];

export const issueUrl = issue;

/** The chart's task id for an item or a milestone (Mermaid ids: letters, digits, _). */
const itemTaskId = (n: number) => `i${n}`;
const milestoneTaskId = (id: string) => `m_${id.replace(/[^a-z0-9]/gi, "_")}`;

/** Every bar and marker: its task id, where a click goes, and what it says. */
export function roadmapTargets(): {
  taskId: string;
  href: string;
  label: string;
}[] {
  return [
    ...ITEMS.map((i) => ({
      taskId: itemTaskId(i.issue),
      href: issueUrl(i.issue),
      label: `#${i.issue} ${i.title} (${i.priority}, ${i.status}, ${i.start} to ${i.end}). ${i.note}`,
    })),
    ...MILESTONES.map((m) => ({
      taskId: milestoneTaskId(m.id),
      href: m.href,
      label: `${m.date}: ${m.label}. ${m.detail}`,
    })),
  ];
}

const TAG: Record<Status, string> = {
  done: "done, ",
  "in-progress": "active, ",
  blocked: "crit, ",
  planned: "",
};

/** The width the chart is drawn at, in SVG units, before it is scaled to the page. */
const GANTT_WIDTH = 1400;

/** The roadmap as a Mermaid Gantt chart, one section per lane. */
export function roadmapGantt(): string {
  const lines = [
    // Mermaid measures the width of its temporary render element, which is 0
    // in the browser; a fixed drawing width that useMaxWidth scales to the page
    // avoids an empty chart. leftPadding makes room for the lane names.
    "---",
    "config:",
    "  gantt:",
    `    useWidth: ${GANTT_WIDTH}`,
    "    useMaxWidth: true",
    "    leftPadding: 170",
    "    barHeight: 22",
    "    fontSize: 12",
    "    sectionFontSize: 13",
    "---",
    "gantt",
    "  dateFormat YYYY-MM-DD",
    "  axisFormat %Y-%m",
    "  tickInterval 6month",
    `  todayMarker stroke-width:3px,stroke:#e11d48,opacity:0.8`,
  ];
  for (const lane of LANES) {
    lines.push(`  section ${lane.label}`);
    for (const m of MILESTONES.filter((x) => x.lane === lane.id)) {
      lines.push(
        `    ${m.label} :milestone, ${milestoneTaskId(m.id)}, ${m.date}, 0d`,
      );
    }
    for (const i of ITEMS.filter((x) => x.lane === lane.id)) {
      lines.push(
        `    ${i.issue} ${i.short} :${TAG[i.status]}${itemTaskId(i.issue)}, ${
          i.start
        }, ${i.end}`,
      );
    }
  }
  return lines.join("\n");
}
