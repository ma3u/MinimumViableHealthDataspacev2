/**
 * One imported transfer as a 3D overview (#876): only the import, its
 * relations and where it came from. /overview?import=<transfer id>&spe=SPE-1
 * builds it from GET /api/spe-imports/[id]/graph, so the retired graph
 * explorer is no longer needed to look at an import.
 */
import { didToName } from "@/lib/participant-name";
import type {
  Fact,
  OverviewLayer,
  OverviewLink,
  OverviewNode,
  OverviewSignal,
  OverviewView,
} from "./types";

/** What GET /api/spe-imports/[id]/graph answers. */
export interface ImportGraph {
  dataset: Record<string, unknown>;
  nodes: Array<{
    id: string;
    label: string;
    name: string;
    group?: string;
    properties?: Record<string, string | number | boolean>;
  }>;
  links: Array<{ source: string; target: string; type: string }>;
  truncated?: boolean;
}

const LAYERS: OverviewLayer[] = [
  {
    id: "origin",
    name: "Where it came from: provider and contract",
    z: 1,
    color: "#94a3b8",
  },
  {
    id: "spe",
    name: "The secure processing environment and the import",
    z: 0,
    color: "#a78bfa",
  },
  { id: "records", name: "The imported records", z: -1, color: "#22c55e" },
];

const LINK_KIND: Record<string, string> = {
  LOADED_INTO: "loaded into",
  CONTAINS: "contains",
  REFERS_TO: "refers to",
  PROVIDED_BY: "provided by",
  UNDER_AGREEMENT: "under the contract",
};

const RECORD_COLOR: Record<string, string> = {
  Patient: "#22c55e",
  Condition: "#f59e0b",
  Observation: "#38bdf8",
  MedicationRequest: "#f472b6",
  Encounter: "#a3e635",
};

const facts = (p: Record<string, string | number | boolean> = {}): Fact[] =>
  Object.entries(p).map(([k, v]) => [k, String(v)]);

export function importOverview(graph: ImportGraph): OverviewView {
  const d = graph.dataset;
  const speId = String(d.speId ?? "");
  const importedAt = String(d.importedAt ?? "");
  const provider = String(d.provider ?? "");
  const providerName = provider ? didToName(provider) : "";
  const datasetNodeId =
    graph.nodes.find((n) => n.label === "ImportedDataset")?.id ?? "";

  const nodes: OverviewNode[] = graph.nodes.map((n) => {
    switch (n.label) {
      case "ImportedDataset":
        return {
          id: n.id,
          label: n.name,
          layer: "spe",
          kind: "Imported dataset",
          size: 4,
          color: "#2dd4bf",
          pulse: true,
          title: n.name,
          facts: facts(n.properties),
          article: "Art. 73",
        };
      case "SpeWorkspace":
        return {
          id: n.id,
          label: n.name,
          layer: "spe",
          kind: "Secure processing environment",
          size: 3,
          color: "#a78bfa",
          title: n.name,
          facts: facts(n.properties),
          article: "Art. 73",
        };
      case "Participant":
        return {
          id: n.id,
          label: providerName || n.name,
          layer: "origin",
          kind: "Provider",
          size: 3,
          color: "#f97316",
          title: providerName || n.name,
          facts: facts(n.properties),
        };
      case "Contract":
        return {
          id: n.id,
          label: n.name.slice(0, 8),
          layer: "origin",
          kind: "Contract",
          size: 2,
          color: "#94a3b8",
          title: n.name,
          facts: facts(n.properties),
        };
      default:
        return {
          id: n.id,
          label: n.name,
          layer: "records",
          kind: n.group ?? "Record",
          size: 1,
          color: RECORD_COLOR[n.group ?? ""] ?? "#93c5fd",
          title: n.name,
          facts: facts(n.properties),
        };
    }
  });

  const known = new Set(nodes.map((n) => n.id));
  const links: OverviewLink[] = graph.links
    .filter((l) => known.has(l.source) && known.has(l.target))
    .map((l) => ({
      source: l.source,
      target: l.target,
      kind: LINK_KIND[l.type] ?? l.type.toLowerCase(),
      arrow: true,
      particles: l.type === "LOADED_INTO" ? 2 : 0,
    }));

  const byType = new Map<string, number>();
  for (const n of graph.nodes) {
    if (n.label === "ImportedRecord") {
      byType.set(
        n.group ?? "Record",
        (byType.get(n.group ?? "Record") ?? 0) + 1,
      );
    }
  }
  const records = Number(d.records ?? 0);
  const refs = graph.links.filter((l) => l.type === "REFERS_TO").length;

  const signals: OverviewSignal[] = [
    {
      severity: "ok",
      nodeId: datasetNodeId,
      code: "import-done",
      text: `${records} records imported into ${speId}${
        importedAt ? ` on ${importedAt.slice(0, 10)}` : ""
      }, with ${refs} references between them.`,
      article: "Art. 73",
    },
  ];
  if (d.pseudonymised === true) {
    signals.push({
      severity: "ok",
      nodeId: datasetNodeId,
      code: "import-pseudonymised",
      text: "Patients are pseudonymised: no names, addresses or exact birth dates.",
      article: "Art. 66(3)",
    });
  }
  if (providerName) {
    signals.push({
      severity: "info",
      nodeId: nodes.find((n) => n.kind === "Provider")?.id ?? datasetNodeId,
      code: "import-provider",
      text: `Provided by ${providerName}${
        d.agreementId
          ? ` under contract ${String(d.agreementId).slice(0, 8)}…`
          : ""
      }.`,
    });
  }
  for (const [type, n] of byType) {
    signals.push({
      severity: "info",
      nodeId: nodes.find((x) => x.kind === type)?.id ?? datasetNodeId,
      code: "import-type",
      text: `${type}: ${n}`,
    });
  }
  if (graph.truncated) {
    signals.push({
      severity: "warn",
      nodeId: datasetNodeId,
      code: "import-truncated",
      text: `Showing ${
        byType.size ? [...byType.values()].reduce((a, b) => a + b, 0) : 0
      } of ${records} records.`,
    });
  }

  return {
    persona: "researcher",
    asOf: importedAt.slice(0, 10),
    me: { id: String(d.consumer ?? ""), name: "" },
    title: "My import, in one view",
    question:
      "What did this transfer bring into the SPE, from whom, and under which contract?",
    article: "Regulation (EU) 2025/327 Art. 68, 73",
    layers: LAYERS,
    nodes,
    links,
    signals,
    legend: [
      { color: "#2dd4bf", text: "the imported dataset" },
      { color: "#a78bfa", text: "the SPE it is in" },
      { color: "#f97316", text: "the provider" },
      { color: "#94a3b8", text: "the contract" },
      { color: "#22c55e", text: "patients" },
      { color: "#38bdf8", text: "observations" },
    ],
    dataNote: "Every organisation and study shown is fictional.",
  };
}
