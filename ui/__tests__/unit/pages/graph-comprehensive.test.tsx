/**
 * Comprehensive tests for the Graph Explorer page.
 *
 * Covers: node selection/deselection, detail card content, contextual links,
 * neighbour list, neighbour click, ?highlight= param, window resize,
 * ForceGraph2D props, hint text, close button, canvas callbacks, and all
 * previously covered areas (heading, loading, sidebar, layer legend, nav links,
 * API errors, empty state, node counts).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  waitFor,
  fireEvent,
  act,
  within,
} from "@testing-library/react";

// ── Mocks ────────────────────────────────────────────────────────────
const mockFetchApi = vi.fn();
vi.mock("@/lib/api", () => ({
  fetchApi: (...args: unknown[]) => mockFetchApi(...args),
}));

const mockSearchParams = { get: vi.fn().mockReturnValue(null) };
vi.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams,
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// Mock ForceGraph2D (dynamically imported via next/dynamic).
// Capture all props so tests can invoke onNodeClick, inspect paintNode, etc.
const mockForceGraph = vi.fn();
vi.mock("next/dynamic", () => ({
  default: () => {
    const Component = (props: Record<string, unknown>) => {
      mockForceGraph(props);
      return <div data-testid="force-graph" />;
    };
    Component.displayName = "ForceGraph2D";
    return Component;
  },
}));

import GraphPage from "@/app/graph/page";

// ── Helpers ──────────────────────────────────────────────────────────
function mockResponse(data: unknown) {
  return Promise.resolve({ json: () => Promise.resolve(data), ok: true });
}

const sampleGraphData = {
  nodes: [
    {
      id: "n1",
      name: "DataProduct-A",
      label: "DataProduct",
      layer: 1,
      color: "#2471A3",
    },
    {
      id: "n2",
      name: "Dataset-B",
      label: "Dataset",
      layer: 2,
      color: "#148F77",
    },
    {
      id: "n3",
      name: "Patient-C",
      label: "Patient",
      layer: 3,
      color: "#1E8449",
    },
    {
      id: "n4",
      name: "Condition-D",
      label: "Condition",
      layer: 4,
      color: "#CA6F1E",
    },
    {
      id: "n5",
      name: "SNOMED-E",
      label: "Concept",
      layer: 5,
      color: "#7D3C98",
    },
  ],
  links: [
    { source: "n1", target: "n2", type: "DESCRIBES" },
    { source: "n2", target: "n3", type: "CONTAINS" },
    { source: "n3", target: "n4", type: "HAS_CONDITION" },
    { source: "n4", target: "n5", type: "MAPS_TO" },
  ],
};

/** Wait for data to load and ForceGraph to render, then return the last
 *  set of props passed to the mock ForceGraph component. */
async function renderAndGetForceGraphProps() {
  mockFetchApi.mockReturnValue(mockResponse(sampleGraphData));
  render(<GraphPage />);
  await waitFor(() => {
    expect(screen.getByTestId("force-graph")).toBeInTheDocument();
  });
  // Return the most recent props passed to ForceGraph
  return mockForceGraph.mock.calls[mockForceGraph.mock.calls.length - 1][0];
}

/** Simulate a node click by invoking the captured onNodeClick callback. */
async function clickNode(
  nodeData: (typeof sampleGraphData.nodes)[0],
): Promise<Record<string, unknown>> {
  const props = await renderAndGetForceGraphProps();
  const onNodeClick = props.onNodeClick as (node: object) => void;
  act(() => {
    onNodeClick(nodeData);
  });
  // The component re-renders after state update — grab the latest props
  await waitFor(() => {
    expect(screen.getByText(nodeData.name)).toBeInTheDocument();
  });
  return mockForceGraph.mock.calls[mockForceGraph.mock.calls.length - 1][0];
}

// ── Tests ────────────────────────────────────────────────────────────
describe("GraphPage", () => {
  beforeEach(() => {
    mockFetchApi.mockReset();
    mockForceGraph.mockReset();
    mockSearchParams.get.mockReturnValue(null);
  });

  // ────────────────────────────────────────────────────────────────────
  // Existing basic tests (heading, loading, sidebar, layers, nav links)
  // ────────────────────────────────────────────────────────────────────
  describe("basic rendering", () => {
    it("renders the Graph Explorer heading", () => {
      mockFetchApi.mockReturnValue(new Promise(() => {}));
      render(<GraphPage />);
      expect(screen.getByText("Graph Explorer")).toBeInTheDocument();
    });

    it("renders the description paragraph", () => {
      mockFetchApi.mockReturnValue(new Promise(() => {}));
      render(<GraphPage />);
      expect(
        screen.getByText(/Interactive 5-layer knowledge graph/),
      ).toBeInTheDocument();
    });

    it("shows 'Connecting to Neo4j…' while data is loading", () => {
      mockFetchApi.mockReturnValue(new Promise(() => {}));
      render(<GraphPage />);
      expect(screen.getByText(/Connecting to Neo4j/)).toBeInTheDocument();
    });

    it("does not render ForceGraph while loading", () => {
      mockFetchApi.mockReturnValue(new Promise(() => {}));
      render(<GraphPage />);
      expect(screen.queryByTestId("force-graph")).not.toBeInTheDocument();
    });

    it("renders ForceGraph after data loads", async () => {
      mockFetchApi.mockReturnValue(mockResponse(sampleGraphData));
      render(<GraphPage />);
      await waitFor(() => {
        expect(screen.getByTestId("force-graph")).toBeInTheDocument();
      });
    });

    it("removes loading indicator after data loads", async () => {
      mockFetchApi.mockReturnValue(mockResponse(sampleGraphData));
      render(<GraphPage />);
      await waitFor(() => {
        expect(
          screen.queryByText(/Connecting to Neo4j/),
        ).not.toBeInTheDocument();
      });
    });

    it("calls fetchApi with /api/graph", () => {
      mockFetchApi.mockReturnValue(new Promise(() => {}));
      render(<GraphPage />);
      expect(mockFetchApi).toHaveBeenCalledWith("/api/graph");
    });

    it("shows node and edge counts after data loads", async () => {
      mockFetchApi.mockReturnValue(mockResponse(sampleGraphData));
      render(<GraphPage />);
      await waitFor(() => {
        expect(screen.getByText(/5 nodes/)).toBeInTheDocument();
        expect(screen.getByText(/4 edges/)).toBeInTheDocument();
      });
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // Sidebar: layers, nav links
  // ────────────────────────────────────────────────────────────────────
  describe("sidebar", () => {
    it("renders Layers heading", () => {
      mockFetchApi.mockReturnValue(new Promise(() => {}));
      render(<GraphPage />);
      expect(screen.getByText("Layers")).toBeInTheDocument();
    });

    it("renders all five layer labels", () => {
      mockFetchApi.mockReturnValue(new Promise(() => {}));
      render(<GraphPage />);
      for (const label of [
        "L1 Marketplace",
        "L2 HealthDCAT-AP",
        "L3 FHIR R4",
        "L4 OMOP CDM",
        "L5 Ontology",
      ]) {
        expect(screen.getByText(label)).toBeInTheDocument();
      }
    });

    it("renders Dataset Catalog link pointing to /catalog", () => {
      mockFetchApi.mockReturnValue(new Promise(() => {}));
      render(<GraphPage />);
      const link = screen.getByText("Dataset Catalog");
      expect(link.closest("a")).toHaveAttribute("href", "/catalog");
    });

    it("renders Discover FHIR Assets link pointing to /data/discover", () => {
      mockFetchApi.mockReturnValue(new Promise(() => {}));
      render(<GraphPage />);
      const link = screen.getByText("Discover FHIR Assets");
      expect(link.closest("a")).toHaveAttribute("href", "/data/discover");
    });

    it("renders Patient Journey link pointing to /patient", () => {
      mockFetchApi.mockReturnValue(new Promise(() => {}));
      render(<GraphPage />);
      const link = screen.getByText("Patient Journey");
      expect(link.closest("a")).toHaveAttribute("href", "/patient");
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // Error handling and empty state
  // ────────────────────────────────────────────────────────────────────
  describe("error handling", () => {
    it("handles fetch rejection and still renders ForceGraph", async () => {
      mockFetchApi.mockReturnValue(Promise.reject(new Error("Network error")));
      render(<GraphPage />);
      await waitFor(() => {
        expect(screen.getByTestId("force-graph")).toBeInTheDocument();
      });
    });

    it("shows 0 nodes · 0 edges after a fetch error", async () => {
      mockFetchApi.mockReturnValue(Promise.reject(new Error("500")));
      render(<GraphPage />);
      await waitFor(() => {
        expect(screen.getByText(/0 nodes/)).toBeInTheDocument();
        expect(screen.getByText(/0 edges/)).toBeInTheDocument();
      });
    });

    it("shows 0 nodes · 0 edges for empty API response", async () => {
      mockFetchApi.mockReturnValue(mockResponse({ nodes: [], links: [] }));
      render(<GraphPage />);
      await waitFor(() => {
        expect(screen.getByText(/0 nodes/)).toBeInTheDocument();
        expect(screen.getByText(/0 edges/)).toBeInTheDocument();
      });
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // Hint text
  // ────────────────────────────────────────────────────────────────────
  describe("hint text", () => {
    it("shows hint when no node is selected", async () => {
      mockFetchApi.mockReturnValue(mockResponse(sampleGraphData));
      render(<GraphPage />);
      await waitFor(() => {
        expect(
          screen.getByText(/Click a node to see details/),
        ).toBeInTheDocument();
      });
    });

    it("hides hint once a node is selected", async () => {
      const props = await renderAndGetForceGraphProps();
      act(() => {
        (props.onNodeClick as (n: object) => void)(sampleGraphData.nodes[0]);
      });
      await waitFor(() => {
        expect(
          screen.queryByText(/Click a node to see details/),
        ).not.toBeInTheDocument();
      });
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // Node selection / deselection
  // ────────────────────────────────────────────────────────────────────
  describe("node selection", () => {
    it("shows detail card when a node is clicked", async () => {
      const props = await renderAndGetForceGraphProps();
      const node = sampleGraphData.nodes[1]; // Dataset-B, layer 2
      act(() => {
        (props.onNodeClick as (n: object) => void)(node);
      });
      await waitFor(() => {
        expect(screen.getByText("Dataset-B")).toBeInTheDocument();
      });
    });

    it("deselects node when the same node is clicked again (toggle)", async () => {
      const props = await renderAndGetForceGraphProps();
      const node = sampleGraphData.nodes[1];
      // First click — select
      act(() => {
        (props.onNodeClick as (n: object) => void)(node);
      });
      await waitFor(() => {
        expect(screen.getByText("Dataset-B")).toBeInTheDocument();
      });
      // Grab the latest onNodeClick (component re-rendered)
      const updatedProps =
        mockForceGraph.mock.calls[mockForceGraph.mock.calls.length - 1][0];
      // Second click — deselect
      act(() => {
        (updatedProps.onNodeClick as (n: object) => void)(node);
      });
      await waitFor(() => {
        expect(
          screen.getByText(/Click a node to see details/),
        ).toBeInTheDocument();
      });
    });

    it("switches selection when a different node is clicked", async () => {
      const props = await renderAndGetForceGraphProps();
      const nodeA = sampleGraphData.nodes[1]; // Dataset-B
      const nodeB = sampleGraphData.nodes[2]; // Patient-C
      act(() => {
        (props.onNodeClick as (n: object) => void)(nodeA);
      });
      await waitFor(() => {
        expect(screen.getByText("Dataset-B")).toBeInTheDocument();
      });
      const updatedProps =
        mockForceGraph.mock.calls[mockForceGraph.mock.calls.length - 1][0];
      act(() => {
        (updatedProps.onNodeClick as (n: object) => void)(nodeB);
      });
      await waitFor(() => {
        expect(screen.getByText("Patient-C")).toBeInTheDocument();
      });
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // Close button (X)
  // ────────────────────────────────────────────────────────────────────
  describe("close button", () => {
    it("removes detail card when X button is clicked", async () => {
      const props = await renderAndGetForceGraphProps();
      const node = sampleGraphData.nodes[0];
      act(() => {
        (props.onNodeClick as (n: object) => void)(node);
      });
      await waitFor(() => {
        expect(screen.getByText("DataProduct-A")).toBeInTheDocument();
      });
      // The close button renders an <X> icon from lucide-react inside a <button>
      // Find the button that renders the X icon — it sits next to the node name
      const closeButtons = screen.getAllByRole("button");
      // The close button is the one without a text child (just the icon)
      const closeBtn = closeButtons.find(
        (btn) => btn.querySelector("svg") !== null && btn.textContent === "",
      );
      expect(closeBtn).toBeDefined();
      fireEvent.click(closeBtn!);
      await waitFor(() => {
        expect(
          screen.getByText(/Click a node to see details/),
        ).toBeInTheDocument();
      });
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // Detail card content
  // ────────────────────────────────────────────────────────────────────
  describe("detail card content", () => {
    it("displays node name, label, layer, and ID", async () => {
      const props = await renderAndGetForceGraphProps();
      const node = sampleGraphData.nodes[2]; // Patient-C, layer 3
      act(() => {
        (props.onNodeClick as (n: object) => void)(node);
      });
      await waitFor(() => {
        expect(screen.getByText("Patient-C")).toBeInTheDocument();
        expect(screen.getByText("Patient")).toBeInTheDocument();
        // L3 FHIR R4 appears in both legend and detail card
        const l3Elements = screen.getAllByText("L3 FHIR R4");
        expect(l3Elements.length).toBeGreaterThanOrEqual(2);
        expect(screen.getByText("n3")).toBeInTheDocument();
      });
    });

    it("displays correct layer label for layer 1 node", async () => {
      const props = await renderAndGetForceGraphProps();
      const node = sampleGraphData.nodes[0]; // layer 1
      act(() => {
        (props.onNodeClick as (n: object) => void)(node);
      });
      await waitFor(() => {
        expect(screen.getByText("DataProduct-A")).toBeInTheDocument();
        expect(screen.getByText("DataProduct")).toBeInTheDocument();
        // L1 Marketplace appears both in the legend and in the detail card
        const l1Elements = screen.getAllByText("L1 Marketplace");
        expect(l1Elements.length).toBeGreaterThanOrEqual(2);
      });
    });

    it("displays correct layer label for layer 5 node", async () => {
      const props = await renderAndGetForceGraphProps();
      const node = sampleGraphData.nodes[4]; // SNOMED-E, layer 5
      act(() => {
        (props.onNodeClick as (n: object) => void)(node);
      });
      await waitFor(() => {
        expect(screen.getByText("SNOMED-E")).toBeInTheDocument();
        expect(screen.getByText("Concept")).toBeInTheDocument();
        expect(screen.getByText("n5")).toBeInTheDocument();
        const l5Elements = screen.getAllByText("L5 Ontology");
        expect(l5Elements.length).toBeGreaterThanOrEqual(2);
      });
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // Contextual links based on layer
  // ────────────────────────────────────────────────────────────────────
  describe("contextual links", () => {
    it("shows 'View in Catalog' link for layer 2 node", async () => {
      const props = await renderAndGetForceGraphProps();
      const node = sampleGraphData.nodes[1]; // Dataset-B, layer 2
      act(() => {
        (props.onNodeClick as (n: object) => void)(node);
      });
      await waitFor(() => {
        const catalogLink = screen.getByText("View in Catalog");
        expect(catalogLink).toBeInTheDocument();
        expect(catalogLink.closest("a")).toHaveAttribute(
          "href",
          "/catalog?search=Dataset-B",
        );
      });
    });

    it("does not show 'View in Catalog' for non-layer-2 node", async () => {
      const props = await renderAndGetForceGraphProps();
      const node = sampleGraphData.nodes[0]; // layer 1
      act(() => {
        (props.onNodeClick as (n: object) => void)(node);
      });
      await waitFor(() => {
        expect(screen.getByText("DataProduct-A")).toBeInTheDocument();
      });
      expect(screen.queryByText("View in Catalog")).not.toBeInTheDocument();
    });

    it("shows 'View FHIR Asset' link for layer 3 node", async () => {
      const props = await renderAndGetForceGraphProps();
      const node = sampleGraphData.nodes[2]; // Patient-C, layer 3
      act(() => {
        (props.onNodeClick as (n: object) => void)(node);
      });
      await waitFor(() => {
        const fhirLink = screen.getByText("View FHIR Asset");
        expect(fhirLink).toBeInTheDocument();
        expect(fhirLink.closest("a")).toHaveAttribute(
          "href",
          expect.stringContaining("/data/discover?search="),
        );
      });
    });

    it("shows 'Patient Journey' link for layer 3 node", async () => {
      const props = await renderAndGetForceGraphProps();
      const node = sampleGraphData.nodes[2]; // Patient-C, layer 3
      act(() => {
        (props.onNodeClick as (n: object) => void)(node);
      });
      await waitFor(() => {
        // There's already a Patient Journey in sidebar — look for the one in the detail card
        const journeyLinks = screen.getAllByText("Patient Journey");
        // At least two: one in sidebar, one in detail card
        expect(journeyLinks.length).toBeGreaterThanOrEqual(2);
      });
    });

    it("shows 'Patient Journey' link for layer 4 node", async () => {
      const props = await renderAndGetForceGraphProps();
      const node = sampleGraphData.nodes[3]; // Condition-D, layer 4
      act(() => {
        (props.onNodeClick as (n: object) => void)(node);
      });
      await waitFor(() => {
        const journeyLinks = screen.getAllByText("Patient Journey");
        expect(journeyLinks.length).toBeGreaterThanOrEqual(2);
      });
    });

    it("does not show contextual links for layer 1 node", async () => {
      const props = await renderAndGetForceGraphProps();
      const node = sampleGraphData.nodes[0]; // layer 1
      act(() => {
        (props.onNodeClick as (n: object) => void)(node);
      });
      await waitFor(() => {
        expect(screen.getByText("DataProduct-A")).toBeInTheDocument();
      });
      expect(screen.queryByText("View in Catalog")).not.toBeInTheDocument();
      expect(screen.queryByText("View FHIR Asset")).not.toBeInTheDocument();
      // Only the sidebar Patient Journey link should exist
      const journeyLinks = screen.getAllByText("Patient Journey");
      expect(journeyLinks).toHaveLength(1);
    });

    it("does not show contextual links for layer 5 node", async () => {
      const props = await renderAndGetForceGraphProps();
      const node = sampleGraphData.nodes[4]; // layer 5
      act(() => {
        (props.onNodeClick as (n: object) => void)(node);
      });
      await waitFor(() => {
        expect(screen.getByText("SNOMED-E")).toBeInTheDocument();
      });
      expect(screen.queryByText("View in Catalog")).not.toBeInTheDocument();
      expect(screen.queryByText("View FHIR Asset")).not.toBeInTheDocument();
      const journeyLinks = screen.getAllByText("Patient Journey");
      expect(journeyLinks).toHaveLength(1);
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // Neighbour list
  // ────────────────────────────────────────────────────────────────────
  describe("neighbour list", () => {
    it("shows relationships heading with count when node has neighbours", async () => {
      const props = await renderAndGetForceGraphProps();
      // n2 (Dataset-B) has: n1→n2 (DESCRIBES) and n2→n3 (CONTAINS)
      const node = sampleGraphData.nodes[1];
      act(() => {
        (props.onNodeClick as (n: object) => void)(node);
      });
      await waitFor(() => {
        expect(screen.getByText(/Relationships \(2\)/)).toBeInTheDocument();
      });
    });

    it("shows outgoing neighbour with relationship type", async () => {
      const props = await renderAndGetForceGraphProps();
      const node = sampleGraphData.nodes[1]; // Dataset-B
      act(() => {
        (props.onNodeClick as (n: object) => void)(node);
      });
      // n2→n3 is outgoing (CONTAINS), so we expect "→" and "CONTAINS"
      await waitFor(() => {
        expect(screen.getByText("CONTAINS")).toBeInTheDocument();
      });
    });

    it("shows incoming neighbour with relationship type", async () => {
      const props = await renderAndGetForceGraphProps();
      const node = sampleGraphData.nodes[1]; // Dataset-B
      act(() => {
        (props.onNodeClick as (n: object) => void)(node);
      });
      // n1→n2 is incoming to n2 (DESCRIBES), so we expect "←" and "DESCRIBES"
      await waitFor(() => {
        expect(screen.getByText("DESCRIBES")).toBeInTheDocument();
      });
    });

    it("shows neighbour node names", async () => {
      const props = await renderAndGetForceGraphProps();
      const node = sampleGraphData.nodes[1]; // Dataset-B
      act(() => {
        (props.onNodeClick as (n: object) => void)(node);
      });
      await waitFor(() => {
        // Neighbours of n2: n1 (DataProduct-A) via DESCRIBES, n3 (Patient-C) via CONTAINS
        expect(screen.getByText("DataProduct-A")).toBeInTheDocument();
        expect(screen.getByText("Patient-C")).toBeInTheDocument();
      });
    });

    it("shows direction arrows for neighbours", async () => {
      const props = await renderAndGetForceGraphProps();
      const node = sampleGraphData.nodes[1]; // Dataset-B
      act(() => {
        (props.onNodeClick as (n: object) => void)(node);
      });
      await waitFor(() => {
        // Outgoing arrow for CONTAINS, incoming arrow for DESCRIBES
        expect(screen.getByText("→")).toBeInTheDocument();
        expect(screen.getByText("←")).toBeInTheDocument();
      });
    });

    it("does not show relationships section for node with no neighbours", async () => {
      // Use data where a node is isolated
      const isolatedData = {
        nodes: [
          {
            id: "iso1",
            name: "Isolated",
            label: "Orphan",
            layer: 1,
            color: "#2471A3",
          },
        ],
        links: [],
      };
      mockFetchApi.mockReturnValue(mockResponse(isolatedData));
      render(<GraphPage />);
      await waitFor(() => {
        expect(screen.getByTestId("force-graph")).toBeInTheDocument();
      });
      const fgProps =
        mockForceGraph.mock.calls[mockForceGraph.mock.calls.length - 1][0];
      act(() => {
        (fgProps.onNodeClick as (n: object) => void)(isolatedData.nodes[0]);
      });
      await waitFor(() => {
        expect(screen.getByText("Isolated")).toBeInTheDocument();
      });
      expect(screen.queryByText(/Relationships/)).not.toBeInTheDocument();
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // Neighbour click → selects that node
  // ────────────────────────────────────────────────────────────────────
  describe("neighbour click", () => {
    it("selects neighbour node when its button is clicked", async () => {
      const props = await renderAndGetForceGraphProps();
      const node = sampleGraphData.nodes[1]; // Dataset-B
      act(() => {
        (props.onNodeClick as (n: object) => void)(node);
      });
      await waitFor(() => {
        expect(screen.getByText(/Relationships/)).toBeInTheDocument();
      });
      // Click on the neighbour "Patient-C" button
      const neighbourButton = screen.getByText("Patient-C").closest("button");
      expect(neighbourButton).not.toBeNull();
      fireEvent.click(neighbourButton!);
      // Now Patient-C should be the selected node with its own detail card
      await waitFor(() => {
        // Patient-C detail card shows its unique ID
        expect(screen.getByText("n3")).toBeInTheDocument();
        // L3 FHIR R4 appears in legend + detail card
        const l3Elements = screen.getAllByText("L3 FHIR R4");
        expect(l3Elements.length).toBeGreaterThanOrEqual(2);
      });
    });

    it("updates neighbour list when switching to neighbour", async () => {
      const props = await renderAndGetForceGraphProps();
      const node = sampleGraphData.nodes[1]; // Dataset-B
      act(() => {
        (props.onNodeClick as (n: object) => void)(node);
      });
      await waitFor(() => {
        expect(screen.getByText("DESCRIBES")).toBeInTheDocument();
        expect(screen.getByText("CONTAINS")).toBeInTheDocument();
      });
      // Click Patient-C neighbour
      const neighbourButton = screen.getByText("Patient-C").closest("button");
      fireEvent.click(neighbourButton!);
      // Patient-C (n3) has: n2→n3 (CONTAINS), n3→n4 (HAS_CONDITION)
      await waitFor(() => {
        expect(screen.getByText("HAS_CONDITION")).toBeInTheDocument();
        expect(screen.getByText("CONTAINS")).toBeInTheDocument();
      });
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // ?highlight= query param
  // ────────────────────────────────────────────────────────────────────
  describe("highlight query param", () => {
    it("auto-selects node matching ?highlight= by name", async () => {
      mockSearchParams.get.mockReturnValue("Dataset-B");
      mockFetchApi.mockReturnValue(mockResponse(sampleGraphData));
      render(<GraphPage />);
      await waitFor(() => {
        // Detail card for Dataset-B should appear
        expect(screen.getByText("Dataset-B")).toBeInTheDocument();
        expect(screen.getByText("Dataset")).toBeInTheDocument();
        expect(screen.getByText("n2")).toBeInTheDocument();
      });
    });

    it("auto-selects node matching ?highlight= by ID (case-insensitive)", async () => {
      mockSearchParams.get.mockReturnValue("N3");
      mockFetchApi.mockReturnValue(mockResponse(sampleGraphData));
      render(<GraphPage />);
      await waitFor(() => {
        expect(screen.getByText("Patient-C")).toBeInTheDocument();
        expect(screen.getByText("n3")).toBeInTheDocument();
      });
    });

    it("auto-selects node matching partial name", async () => {
      mockSearchParams.get.mockReturnValue("SNOMED");
      mockFetchApi.mockReturnValue(mockResponse(sampleGraphData));
      render(<GraphPage />);
      await waitFor(() => {
        expect(screen.getByText("SNOMED-E")).toBeInTheDocument();
        expect(screen.getByText("n5")).toBeInTheDocument();
      });
    });

    it("does nothing when ?highlight= matches no node", async () => {
      mockSearchParams.get.mockReturnValue("nonexistent");
      mockFetchApi.mockReturnValue(mockResponse(sampleGraphData));
      render(<GraphPage />);
      await waitFor(() => {
        expect(screen.getByTestId("force-graph")).toBeInTheDocument();
      });
      // Hint text should still be visible since nothing was selected
      expect(
        screen.getByText(/Click a node to see details/),
      ).toBeInTheDocument();
    });

    it("does nothing when highlight is null", async () => {
      mockSearchParams.get.mockReturnValue(null);
      mockFetchApi.mockReturnValue(mockResponse(sampleGraphData));
      render(<GraphPage />);
      await waitFor(() => {
        expect(screen.getByTestId("force-graph")).toBeInTheDocument();
      });
      expect(
        screen.getByText(/Click a node to see details/),
      ).toBeInTheDocument();
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // Window resize
  // ────────────────────────────────────────────────────────────────────
  describe("window resize", () => {
    it("fires resize listener without errors", async () => {
      mockFetchApi.mockReturnValue(mockResponse(sampleGraphData));
      render(<GraphPage />);
      await waitFor(() => {
        expect(screen.getByTestId("force-graph")).toBeInTheDocument();
      });
      act(() => {
        window.dispatchEvent(new Event("resize"));
      });
      // Still renders without crashing
      expect(screen.getByTestId("force-graph")).toBeInTheDocument();
    });

    it("passes width and height to ForceGraph2D", async () => {
      const props = await renderAndGetForceGraphProps();
      expect(props.width).toBeDefined();
      expect(props.height).toBeDefined();
      expect(typeof props.width).toBe("number");
      expect(typeof props.height).toBe("number");
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // ForceGraph2D props
  // ────────────────────────────────────────────────────────────────────
  describe("ForceGraph2D props", () => {
    it("passes onNodeClick callback", async () => {
      const props = await renderAndGetForceGraphProps();
      expect(typeof props.onNodeClick).toBe("function");
    });

    it("passes nodeCanvasObject callback", async () => {
      const props = await renderAndGetForceGraphProps();
      expect(typeof props.nodeCanvasObject).toBe("function");
    });

    it("passes linkCanvasObject callback", async () => {
      const props = await renderAndGetForceGraphProps();
      expect(typeof props.linkCanvasObject).toBe("function");
    });

    it("passes nodeCanvasObjectMode callback returning 'replace'", async () => {
      const props = await renderAndGetForceGraphProps();
      expect(typeof props.nodeCanvasObjectMode).toBe("function");
      expect((props.nodeCanvasObjectMode as () => string)()).toBe("replace");
    });

    it("passes linkCanvasObjectMode callback returning 'replace'", async () => {
      const props = await renderAndGetForceGraphProps();
      expect(typeof props.linkCanvasObjectMode).toBe("function");
      expect((props.linkCanvasObjectMode as () => string)()).toBe("replace");
    });

    it("passes graphData with correct nodes and links", async () => {
      const props = await renderAndGetForceGraphProps();
      const graphData = props.graphData as typeof sampleGraphData;
      expect(graphData.nodes).toHaveLength(5);
      expect(graphData.links).toHaveLength(4);
    });

    it("passes backgroundColor", async () => {
      const props = await renderAndGetForceGraphProps();
      expect(props.backgroundColor).toBe("#030712");
    });

    it("passes d3AlphaDecay", async () => {
      const props = await renderAndGetForceGraphProps();
      expect(props.d3AlphaDecay).toBe(0.02);
    });

    it("passes d3VelocityDecay", async () => {
      const props = await renderAndGetForceGraphProps();
      expect(props.d3VelocityDecay).toBe(0.3);
    });

    it("passes cooldownTicks", async () => {
      const props = await renderAndGetForceGraphProps();
      expect(props.cooldownTicks).toBe(200);
    });

    it("passes nodeRelSize", async () => {
      const props = await renderAndGetForceGraphProps();
      expect(props.nodeRelSize).toBe(6);
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // Canvas rendering callbacks (paintNode, paintLink)
  // ────────────────────────────────────────────────────────────────────
  function createMockCtx(): CanvasRenderingContext2D {
    return {
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      fillText: vi.fn(),
      fillRect: vi.fn(),
      measureText: vi.fn().mockReturnValue({ width: 50 }),
      strokeStyle: "",
      fillStyle: "",
      lineWidth: 0,
      globalAlpha: 1.0,
      textAlign: "center" as CanvasTextAlign,
      textBaseline: "alphabetic" as CanvasTextBaseline,
      font: "",
    } as unknown as CanvasRenderingContext2D;
  }

  describe("canvas rendering callbacks", () => {
    // createMockCtx is defined in outer scope so edge-case tests can use it too
    function localCreateMockCtx(): CanvasRenderingContext2D {
      return {
        beginPath: vi.fn(),
        arc: vi.fn(),
        fill: vi.fn(),
        stroke: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        fillText: vi.fn(),
        fillRect: vi.fn(),
        measureText: vi.fn().mockReturnValue({ width: 50 }),
        strokeStyle: "",
        fillStyle: "",
        lineWidth: 0,
        globalAlpha: 1.0,
        textAlign: "center" as CanvasTextAlign,
        textBaseline: "alphabetic" as CanvasTextBaseline,
        font: "",
      } as unknown as CanvasRenderingContext2D;
    }

    // Use the outer-scope helper in all tests below
    it("paintNode draws a circle for a regular node", async () => {
      const props = await renderAndGetForceGraphProps();
      const paintNode = props.nodeCanvasObject as (
        node: object,
        ctx: CanvasRenderingContext2D,
        globalScale: number,
      ) => void;
      const ctx = createMockCtx();
      const node = { ...sampleGraphData.nodes[0], x: 100, y: 200 };
      paintNode(node, ctx, 1);
      expect(ctx.beginPath).toHaveBeenCalled();
      expect(ctx.arc).toHaveBeenCalled();
      expect(ctx.fill).toHaveBeenCalled();
    });

    it("paintNode renders text label when zoom scale >= 0.6", async () => {
      const props = await renderAndGetForceGraphProps();
      const paintNode = props.nodeCanvasObject as (
        node: object,
        ctx: CanvasRenderingContext2D,
        globalScale: number,
      ) => void;
      const ctx = createMockCtx();
      const node = { ...sampleGraphData.nodes[0], x: 100, y: 200 };
      paintNode(node, ctx, 1);
      expect(ctx.fillText).toHaveBeenCalledWith(
        expect.any(String),
        100,
        expect.any(Number),
      );
    });

    it("paintNode does not render text label when zoomed out below 0.6", async () => {
      // When no node is selected and no connected nodes, low zoom hides text
      const props = await renderAndGetForceGraphProps();
      const paintNode = props.nodeCanvasObject as (
        node: object,
        ctx: CanvasRenderingContext2D,
        globalScale: number,
      ) => void;
      const ctx = createMockCtx();
      const node = { ...sampleGraphData.nodes[0], x: 100, y: 200 };
      paintNode(node, ctx, 0.3);
      // fillText should not be called for text label (only fill for the circle)
      expect(ctx.fillText).not.toHaveBeenCalled();
    });

    it("paintNode draws selection ring when the node is selected", async () => {
      const props = await renderAndGetForceGraphProps();
      // Select a node first
      act(() => {
        (props.onNodeClick as (n: object) => void)(sampleGraphData.nodes[0]);
      });
      await waitFor(() => {
        expect(screen.getByText("DataProduct-A")).toBeInTheDocument();
      });
      const updatedProps =
        mockForceGraph.mock.calls[mockForceGraph.mock.calls.length - 1][0];
      const paintNode = updatedProps.nodeCanvasObject as (
        node: object,
        ctx: CanvasRenderingContext2D,
        globalScale: number,
      ) => void;
      const ctx = createMockCtx();
      const node = { ...sampleGraphData.nodes[0], x: 50, y: 50 };
      paintNode(node, ctx, 1);
      // Selected node gets stroke() call for the white ring
      expect(ctx.stroke).toHaveBeenCalled();
    });

    it("paintLink draws a line between source and target", async () => {
      const props = await renderAndGetForceGraphProps();
      const paintLink = props.linkCanvasObject as (
        link: object,
        ctx: CanvasRenderingContext2D,
        globalScale: number,
      ) => void;
      const ctx = createMockCtx();
      const link = {
        source: { id: "n1", x: 10, y: 20 },
        target: { id: "n2", x: 30, y: 40 },
        type: "DESCRIBES",
      };
      paintLink(link, ctx, 1);
      expect(ctx.moveTo).toHaveBeenCalledWith(10, 20);
      expect(ctx.lineTo).toHaveBeenCalledWith(30, 40);
      expect(ctx.stroke).toHaveBeenCalled();
    });

    it("paintLink skips drawing when source has no coordinates", async () => {
      const props = await renderAndGetForceGraphProps();
      const paintLink = props.linkCanvasObject as (
        link: object,
        ctx: CanvasRenderingContext2D,
        globalScale: number,
      ) => void;
      const ctx = createMockCtx();
      const link = {
        source: { id: "n1" }, // no x/y
        target: { id: "n2", x: 30, y: 40 },
        type: "DESCRIBES",
      };
      paintLink(link, ctx, 1);
      expect(ctx.moveTo).not.toHaveBeenCalled();
    });

    it("paintLink draws relationship label for adjacent edge when node is selected", async () => {
      const props = await renderAndGetForceGraphProps();
      // Select n1
      act(() => {
        (props.onNodeClick as (n: object) => void)(sampleGraphData.nodes[0]);
      });
      await waitFor(() => {
        expect(screen.getByText("DataProduct-A")).toBeInTheDocument();
      });
      const updatedProps =
        mockForceGraph.mock.calls[mockForceGraph.mock.calls.length - 1][0];
      const paintLink = updatedProps.linkCanvasObject as (
        link: object,
        ctx: CanvasRenderingContext2D,
        globalScale: number,
      ) => void;
      const ctx = createMockCtx();
      const link = {
        source: { id: "n1", x: 10, y: 20 },
        target: { id: "n2", x: 30, y: 40 },
        type: "DESCRIBES",
      };
      paintLink(link, ctx, 1);
      // Should draw the relationship type text on the midpoint
      expect(ctx.fillText).toHaveBeenCalledWith("DESCRIBES", 20, 30);
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // Single-node edge case
  // ────────────────────────────────────────────────────────────────────
  describe("edge cases", () => {
    it("handles single-node graph data", async () => {
      const oneNodeData = {
        nodes: [
          {
            id: "x1",
            name: "Solo",
            label: "Thing",
            layer: 1,
            color: "#2471A3",
          },
        ],
        links: [],
      };
      mockFetchApi.mockReturnValue(mockResponse(oneNodeData));
      render(<GraphPage />);
      await waitFor(() => {
        expect(screen.getByText(/1 nodes/)).toBeInTheDocument();
        expect(screen.getByText(/0 edges/)).toBeInTheDocument();
      });
    });

    it("handles node with long name (truncated in canvas)", async () => {
      const props = await renderAndGetForceGraphProps();
      const paintNode = props.nodeCanvasObject as (
        node: object,
        ctx: CanvasRenderingContext2D,
        globalScale: number,
      ) => void;
      const ctx = createMockCtx() as CanvasRenderingContext2D;
      const longNameNode = {
        id: "long",
        name: "A very long node name that exceeds twenty-eight characters",
        label: "Test",
        layer: 1,
        color: "#333",
        x: 0,
        y: 0,
      };
      paintNode(longNameNode, ctx, 1);
      // Check that fillText was called with a truncated string
      expect(ctx.fillText).toHaveBeenCalledWith(
        expect.stringContaining("…"),
        expect.any(Number),
        expect.any(Number),
      );
    });
  });
});
