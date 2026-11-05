/**
 * One imported transfer as a 3D overview (#876): only the import's nodes and
 * relations, on three layers, with what happened as the list.
 */
import { describe, it, expect } from "vitest";
import { importOverview, type ImportGraph } from "@/lib/overview/import";

const GRAPH: ImportGraph = {
  dataset: {
    datasetId: "tp-1",
    speId: "SPE-1",
    records: 2,
    importedAt: "2026-11-05T20:12:36.622Z",
    pseudonymised: true,
    provider: "did:web:identityhub%3A7083:alpha-klinik",
    agreementId: "4a67569e-c7d9-4ba1-a1b8-e20eb3cf7f37",
  },
  nodes: [
    { id: "import:tp-1", label: "ImportedDataset", name: "Transfer of x" },
    { id: "spe:SPE-1", label: "SpeWorkspace", name: "SPE-1" },
    {
      id: "import-provider:did",
      label: "Participant",
      name: "did:web:identityhub%3A7083:alpha-klinik",
    },
    { id: "import-agreement:a", label: "Contract", name: "4a67569e-c7d9" },
    {
      id: "import:tp-1/Patient/p1",
      label: "ImportedRecord",
      name: "Patient p1",
      group: "Patient",
      properties: { resourceType: "Patient", resourceId: "p1" },
    },
    {
      id: "import:tp-1/Condition/c1",
      label: "ImportedRecord",
      name: "Condition: x",
      group: "Condition",
    },
  ],
  links: [
    { source: "import:tp-1", target: "spe:SPE-1", type: "LOADED_INTO" },
    {
      source: "import:tp-1",
      target: "import-provider:did",
      type: "PROVIDED_BY",
    },
    {
      source: "import:tp-1",
      target: "import:tp-1/Patient/p1",
      type: "CONTAINS",
    },
    {
      source: "import:tp-1/Condition/c1",
      target: "import:tp-1/Patient/p1",
      type: "REFERS_TO",
    },
    { source: "import:tp-1", target: "elsewhere", type: "CONTAINS" },
  ],
};

describe("importOverview", () => {
  const view = importOverview(GRAPH);

  it("draws only the import: dataset and SPE, provider and contract, records", () => {
    const layerOf = Object.fromEntries(view.nodes.map((n) => [n.id, n.layer]));
    expect(layerOf).toEqual({
      "import:tp-1": "spe",
      "spe:SPE-1": "spe",
      "import-provider:did": "origin",
      "import-agreement:a": "origin",
      "import:tp-1/Patient/p1": "records",
      "import:tp-1/Condition/c1": "records",
    });
    expect(view.layers.map((l) => l.id)).toEqual(["origin", "spe", "records"]);
  });

  it("keeps every relation between them, in words, and none to outside nodes", () => {
    expect(view.links.map((l) => l.kind)).toEqual([
      "loaded into",
      "provided by",
      "contains",
      "refers to",
    ]);
  });

  it("names the provider and lists what happened", () => {
    expect(view.nodes.find((n) => n.kind === "Provider")?.label).toBe(
      "AlphaKlinik Berlin",
    );
    const texts = view.signals.map((s) => s.text);
    expect(texts[0]).toBe(
      "2 records imported into SPE-1 on 2026-11-05, with 1 references between them.",
    );
    expect(texts).toContain(
      "Patients are pseudonymised: no names, addresses or exact birth dates.",
    );
    expect(texts).toContain("Patient: 1");
    expect(
      view.nodes.find((n) => n.id === "import:tp-1/Patient/p1")?.facts,
    ).toEqual([
      ["resourceType", "Patient"],
      ["resourceId", "p1"],
    ]);
  });
});
