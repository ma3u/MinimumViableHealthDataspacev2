/**
 * The two journeys of the HL7 showcase deck (slides "Demo 1" and "Demo 2",
 * ui/public/presentations/hl7-showcase-2026/index.html) as data, so the start
 * page draws them with React rather than copying the deck's SVG.
 *
 * Coordinates are the deck's, in a 1600 x 650 viewBox: five lanes of 116 px,
 * boxes of 210 x 66. Every text is English and a key of the "home"
 * dictionary; __tests__/unit/components/JourneyFlows.test.tsx checks that.
 */

export type FlowId = "primary" | "secondary";

export type Point = readonly [number, number];

export interface FlowLane {
  /** Lines of the lane's label, top to bottom. */
  label: readonly string[];
  color: string;
}

export interface FlowNode {
  /** The step's number as the deck shows it ("1", "4b"); none for a step with no number. */
  step?: string;
  title: string;
  sub: string;
  /** Top-left corner of the box. */
  x: number;
  y: number;
  /** The lane the box sits in, by index; it gives the border colour. */
  lane: number;
  /** Seconds after the drawing starts. */
  delay: number;
  /** A page of the demo, or an anchor on the start page. */
  href?: string;
  /** How far the hub and the app implement the step; none for the starting
   *  point. The journey's page under /docs/ehds says why, step by step. */
  status?: StepStatus;
}

/** The statuses of docs/ehds/person-journey.md and researcher-journey.md:
 *  a step that is planned, not partial, has nothing to show yet. */
export type StepStatus = "implemented" | "partial" | "planned";

export interface FlowEdge {
  points: readonly Point[];
  delay: number;
  dashed?: boolean;
  label?: {
    text: string;
    x: number;
    y: number;
    anchor: "start" | "middle" | "end";
  };
}

export interface JourneyFlow {
  id: FlowId;
  eyebrow: string;
  title: string;
  tab: string;
  /** The panel's background, the deck's slide gradient. */
  background: string;
  /** Colour of the eyebrow. */
  accent: string;
  footnote: string;
  /** The flow's slide in the HL7 showcase deck. */
  deckSlide: string;
  /** The journey step by step, with what is implemented, planned and not
   *  planned: a page under /docs/ehds. */
  details: string;
  lanes: readonly FlowLane[];
  nodes: readonly FlowNode[];
  edges: readonly FlowEdge[];
}

export const FLOW_VIEWBOX = { width: 1600, height: 650 } as const;
export const BOX = { width: 210, height: 66 } as const;
export const LANE = { top: 20, height: 116, gap: 8 } as const;

/** The box's border and the lane's colour, in lane order. */
const PERSON = "#f0b27a";
const SOURCE = "#e07a5f";
const PHONE = "#7fb3e6";
const RECORD = "#7fd1bf";
const CLOUD = "#c9a0dc";

/** Where steps 2 to 6 of the first journey lead: the app, further down. */
const KLARBEFUND = "#klarbefund-title";

const PRIMARY: JourneyFlow = {
  id: "primary",
  eyebrow: "Demo 1 · primary use · the first end of the AI",
  title: "The person's journey: from a paper result to a record they control",
  tab: "Primary use: the person",
  background: "linear-gradient(135deg, #0d3b3a 0%, #14213d 70%)",
  accent: "#7fd1bf",
  footnote: "Synthetic data and invented reports; the phone app is Klarbefund.",
  deckSlide: "#/2",
  details: "/docs/ehds/person-journey",
  lanes: [
    { label: ["The person"], color: PERSON },
    { label: ["Study centre", "or laboratory"], color: SOURCE },
    { label: ["Klarbefund", "on the phone"], color: PHONE },
    { label: ["Doctor and", "patient record"], color: RECORD },
    { label: ["Dataspace", "in the cloud"], color: CLOUD },
  ],
  nodes: [
    {
      step: "1",
      title: "Result on paper",
      sub: "or as a PDF, no API",
      x: 215,
      y: 169,
      lane: 1,
      delay: 0.2,
    },
    {
      step: "2",
      title: "Scan or import",
      status: "implemented",
      sub: "read on the device",
      x: 215,
      y: 293,
      lane: 2,
      delay: 0.55,
      href: KLARBEFUND,
    },
    {
      step: "3",
      title: "Coded, checkable",
      status: "implemented",
      sub: "LOINC, UCUM, page and line",
      x: 475,
      y: 293,
      lane: 2,
      delay: 0.9,
      href: KLARBEFUND,
    },
    {
      step: "4",
      title: "Trend and band",
      status: "implemented",
      sub: "published range, sourced",
      x: 735,
      y: 293,
      lane: 2,
      delay: 1.25,
      href: KLARBEFUND,
    },
    {
      step: "5",
      title: "Export",
      status: "implemented",
      sub: "FHIR R4 bundle + PDF",
      x: 995,
      y: 293,
      lane: 2,
      delay: 1.6,
      href: KLARBEFUND,
    },
    {
      step: "6",
      title: "To the ePA, the GP",
      status: "partial",
      sub: "PDF + bundle",
      x: 995,
      y: 417,
      lane: 3,
      delay: 1.95,
      href: KLARBEFUND,
    },
    {
      step: "7",
      title: "Sign in with d-you",
      status: "partial",
      sub: "EUDI wallet, own record",
      x: 475,
      y: 45,
      lane: 0,
      delay: 2.3,
      href: "/auth/eudi-qr",
    },
    {
      step: "8",
      title: "Consent or opt out",
      status: "implemented",
      sub: "for research, revocable",
      x: 835,
      y: 45,
      lane: 0,
      delay: 2.65,
      href: "/patient/research",
    },
    {
      step: "9",
      title: "My EHDS record",
      status: "implemented",
      sub: "FHIR in the graph, coded",
      x: 1275,
      y: 541,
      lane: 4,
      delay: 3.0,
      href: "/overview",
    },
    {
      step: "10",
      title: "What came back",
      status: "implemented",
      sub: "aggregate only, k ≥ 5",
      x: 1275,
      y: 45,
      lane: 0,
      delay: 3.35,
      href: "/patient/insights",
    },
  ],
  edges: [
    {
      points: [
        [320, 235],
        [320, 285],
      ],
      delay: 0.55,
      label: { text: "hands over", x: 330, y: 254, anchor: "start" },
    },
    {
      points: [
        [425, 326],
        [467, 326],
      ],
      delay: 0.9,
    },
    {
      points: [
        [685, 326],
        [727, 326],
      ],
      delay: 1.25,
    },
    {
      points: [
        [945, 326],
        [987, 326],
      ],
      delay: 1.6,
    },
    {
      points: [
        [1100, 359],
        [1100, 409],
      ],
      delay: 1.95,
      label: { text: "the person shares", x: 1090, y: 390, anchor: "end" },
    },
    {
      points: [
        [1205, 340],
        [1228, 340],
        [1228, 592],
        [1267, 592],
      ],
      delay: 3.0,
      label: { text: "sent to my record", x: 1220, y: 503, anchor: "end" },
    },
    {
      points: [
        [685, 78],
        [827, 78],
      ],
      delay: 2.65,
    },
    {
      points: [
        [1020, 111],
        [1020, 165],
        [1250, 165],
        [1250, 556],
        [1267, 556],
      ],
      delay: 3.0,
      label: {
        text: "honoured at extraction",
        x: 1030,
        y: 190,
        anchor: "start",
      },
    },
    {
      points: [
        [1380, 541],
        [1380, 119],
      ],
      delay: 3.35,
      label: { text: "findings return", x: 1390, y: 531, anchor: "start" },
    },
  ],
};

const SECONDARY: JourneyFlow = {
  id: "secondary",
  eyebrow: "Demo 2 · secondary use · governance in the query path",
  title: "The researcher's journey: from registration to an audited result",
  tab: "Secondary use: the researcher",
  background: "linear-gradient(135deg, #3a2a10 0%, #14213d 70%)",
  accent: "#f0b27a",
  footnote:
    "Synthetic data, real protocols: DSP 2025-1 · DCP 1.0 · HealthDCAT-AP Release 8 · ODRL 2.2 · FHIR R4 · OMOP 5.4",
  deckSlide: "#/4",
  details: "/docs/ehds/researcher-journey",
  lanes: [
    { label: ["Registration", "and trust"], color: PERSON },
    { label: ["Data holder", "(hospital)"], color: SOURCE },
    { label: ["Data user", "(researcher)"], color: PHONE },
    { label: ["Health Data", "Access Body"], color: RECORD },
    { label: ["Secure processing", "environment"], color: CLOUD },
  ],
  nodes: [
    {
      step: "1a",
      title: "Hospital registers",
      status: "implemented",
      sub: "did:web + credential",
      x: 195,
      y: 45,
      lane: 0,
      delay: 0.2,
      href: "/onboarding",
    },
    {
      step: "1b",
      title: "Researcher registers",
      status: "implemented",
      sub: "did:web + credential",
      x: 515,
      y: 45,
      lane: 0,
      delay: 0.55,
      href: "/onboarding",
    },
    {
      step: "1c",
      title: "HDAB registers",
      status: "implemented",
      sub: "did:web + credential",
      x: 1135,
      y: 45,
      lane: 0,
      delay: 0.9,
      href: "/onboarding",
    },
    {
      step: "2",
      title: "Publish data",
      status: "implemented",
      sub: "HealthDCAT-AP catalogue",
      x: 195,
      y: 169,
      lane: 1,
      delay: 1.25,
      href: "/data/share",
    },
    {
      step: "3",
      title: "Discover data",
      status: "partial",
      sub: "federated catalogue",
      x: 515,
      y: 293,
      lane: 2,
      delay: 1.6,
      href: "/data/discover",
    },
    {
      step: "4",
      title: "Negotiate contract",
      status: "implemented",
      sub: "DSP offer, accept, finalise",
      x: 785,
      y: 293,
      lane: 2,
      delay: 1.95,
      href: "/negotiate",
    },
    {
      step: "4b",
      title: "Approve data permit",
      status: "implemented",
      sub: "Art. 68, opt-out checked",
      x: 875,
      y: 417,
      lane: 3,
      delay: 2.3,
      href: "/compliance",
    },
    {
      step: "5",
      title: "Extract and upload",
      status: "partial",
      sub: "FHIR, pseudonymised",
      x: 875,
      y: 169,
      lane: 1,
      delay: 2.65,
      href: "/data/transfer",
    },
    {
      title: "Provision SPE",
      status: "partial",
      sub: "and ingest the data",
      x: 1135,
      y: 541,
      lane: 4,
      delay: 3.0,
      href: "/data/transfer",
    },
    {
      step: "6",
      title: "Analyse in the SPE",
      status: "partial",
      sub: "OMOP, pseudonyms only",
      x: 1135,
      y: 293,
      lane: 2,
      delay: 3.35,
      href: "/analytics",
    },
    {
      step: "7",
      title: "Share results",
      status: "implemented",
      sub: "OMOP output, plain-language",
      x: 1375,
      y: 293,
      lane: 2,
      delay: 3.7,
      href: "/query",
    },
    {
      step: "8",
      title: "Audit report",
      status: "partial",
      sub: "FHIR AuditEvent, chained",
      x: 1375,
      y: 417,
      lane: 3,
      delay: 4.05,
      href: "/admin/audit",
    },
  ],
  edges: [
    {
      points: [
        [300, 111],
        [300, 161],
      ],
      delay: 1.25,
      label: { text: "registers", x: 310, y: 130, anchor: "start" },
    },
    {
      points: [
        [620, 111],
        [620, 285],
      ],
      delay: 1.6,
      label: { text: "registers", x: 630, y: 130, anchor: "start" },
    },
    {
      points: [
        [1240, 111],
        [1240, 403],
        [980, 403],
        [980, 409],
      ],
      delay: 2.3,
      label: { text: "registers", x: 1250, y: 130, anchor: "start" },
    },
    {
      points: [
        [300, 235],
        [300, 279],
        [620, 279],
        [620, 285],
      ],
      delay: 1.6,
      label: { text: "publishes DCAT", x: 310, y: 254, anchor: "start" },
    },
    {
      points: [
        [725, 326],
        [777, 326],
      ],
      delay: 1.95,
      label: { text: "requests access", x: 755, y: 377, anchor: "middle" },
    },
    {
      points: [
        [890, 359],
        [890, 409],
      ],
      delay: 2.3,
      label: { text: "requests permit", x: 900, y: 378, anchor: "start" },
    },
    {
      points: [
        [980, 417],
        [980, 243],
      ],
      delay: 2.65,
      label: { text: "authorises access", x: 990, y: 407, anchor: "start" },
    },
    {
      points: [
        [980, 235],
        [980, 527],
        [1240, 527],
        [1240, 533],
      ],
      delay: 3.0,
      label: { text: "uploads FHIR", x: 990, y: 254, anchor: "start" },
    },
    {
      points: [
        [980, 483],
        [980, 527],
        [1240, 527],
        [1240, 533],
      ],
      delay: 3.0,
      dashed: true,
      label: { text: "authorises SPE", x: 990, y: 502, anchor: "start" },
    },
    {
      points: [
        [1240, 541],
        [1240, 367],
      ],
      delay: 3.35,
      label: { text: "enables analysis", x: 1250, y: 531, anchor: "start" },
    },
    {
      points: [
        [1345, 326],
        [1367, 326],
      ],
      delay: 3.7,
      label: { text: "OMOP results", x: 1360, y: 377, anchor: "middle" },
    },
    {
      points: [
        [1480, 359],
        [1480, 409],
      ],
      delay: 4.05,
      dashed: true,
      label: { text: "reports use", x: 1490, y: 378, anchor: "start" },
    },
  ],
};

export const JOURNEY_FLOWS: readonly JourneyFlow[] = [PRIMARY, SECONDARY];

/** The SVG path through a polyline. */
export function pathOf(points: readonly Point[]): string {
  return points.map(([x, y], i) => `${i ? "L" : "M"}${x},${y}`).join(" ");
}

/** Where an edge ends and the angle, in degrees, of its last segment. */
export function arrowHead(points: readonly Point[]): {
  x: number;
  y: number;
  angle: number;
} {
  const [x0, y0] = points[points.length - 2];
  const [x, y] = points[points.length - 1];
  return { x, y, angle: (Math.atan2(y - y0, x - x0) * 180) / Math.PI };
}

/** Every text a flow shows, for the dictionaries. */
export function flowTexts(flow: JourneyFlow): string[] {
  return [
    flow.eyebrow,
    flow.title,
    flow.tab,
    flow.footnote,
    ...flow.lanes.flatMap((l) => l.label),
    ...flow.nodes.flatMap((n) => [n.title, n.sub]),
    ...flow.edges.flatMap((e) => (e.label ? [e.label.text] : [])),
  ];
}

/** Seconds until the last box and arrow of a flow are in. */
export function flowDuration(flow: JourneyFlow): number {
  return Math.max(
    ...flow.nodes.map((n) => n.delay + 0.5),
    ...flow.edges.map((e) => e.delay + 1.1),
  );
}
