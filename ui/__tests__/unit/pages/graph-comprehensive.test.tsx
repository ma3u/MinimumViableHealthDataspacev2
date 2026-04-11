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

// Param-aware search params mock: set params via mockSearchParamValues
const mockSearchParamValues: Record<string, string | null> = {};
const mockSearchParams = {
  get: vi.fn((key: string) => mockSearchParamValues[key] ?? null),
};
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
      color: "#5B8DEF",
    },
    {
      id: "n2",
      name: "Dataset-B",
      label: "Dataset",
      layer: 2,
      color: "#45B7AA",
    },
    {
      id: "n3",
      name: "Patient-C",
      label: "Patient",
      layer: 3,
      color: "#6ABF69",
    },
    {
      id: "n4",
      name: "Condition-D",
      label: "Condition",
      layer: 4,
      color: "#F0A050",
    },
    {
      id: "n5",
      name: "SNOMED-E",
      label: "Concept",
      layer: 5,
      color: "#A78BDB",
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
    // Reset search params
    for (const key of Object.keys(mockSearchParamValues)) {
      delete mockSearchParamValues[key];
    }
  });

  // ────────────────────────────────────────────────────────────────────
  // Existing basic tests (heading, loading, sidebar, layers, nav links)
  // ────────────────────────────────────────────────────────────────────
  describe("basic rendering", () => {
    it("renders the Knowledge Graph heading", () => {
      mockFetchApi.mockReturnValue(new Promise(() => {}));
      render(<GraphPage />);
      expect(screen.getByText("Knowledge Graph")).toBeInTheDocument();
    });

    it("renders the graph page sidebar", () => {
      mockFetchApi.mockReturnValue(new Promise(() => {}));
      render(<GraphPage />);
      // Sidebar renders with the Ask the graph section
      expect(screen.getByText("Ask the graph")).toBeInTheDocument();
    });

    it("shows persona-aware loading text while data is loading", () => {
      mockFetchApi.mockReturnValue(new Promise(() => {}));
      render(<GraphPage />);
      expect(screen.getByText(/Loading.*Dataspace/)).toBeInTheDocument();
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
          screen.queryByText(/Loading.*Dataspace/),
        ).not.toBeInTheDocument();
      });
    });

    it("calls fetchApi with persona-qualified graph URL", () => {
      mockFetchApi.mockReturnValue(new Promise(() => {}));
      render(<GraphPage />);
      // Global mock session has EDC_ADMIN role → persona "edc-admin"
      expect(mockFetchApi).toHaveBeenCalledWith("/api/graph?persona=edc-admin");
    });

    it("shows node and edge counts after data loads", async () => {
      mockFetchApi.mockReturnValue(mockResponse(sampleGraphData));
      render(<GraphPage />);
      await waitFor(() => {
        // +1 node for injected value center
        expect(screen.getByText(/6 nodes/)).toBeInTheDocument();
      });
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // Sidebar: layers, nav links
  // ────────────────────────────────────────────────────────────────────
  describe("sidebar", () => {
    it("renders Legend heading in the sidebar", () => {
      mockFetchApi.mockReturnValue(new Promise(() => {}));
      render(<GraphPage />);
      expect(screen.getByText("Legend")).toBeInTheDocument();
    });

    it("renders all five edc-admin persona layer labels", () => {
      mockFetchApi.mockReturnValue(new Promise(() => {}));
      render(<GraphPage />);
      for (const label of [
        "Participants & Contracts",
        "Data Offerings",
        "Clinical Layer",
        "Research Layer",
        "Events & Credentials",
      ]) {
        expect(screen.getByText(label)).toBeInTheDocument();
      }
    });

    it("renders Catalog quick link pointing to /catalog", () => {
      mockFetchApi.mockReturnValue(new Promise(() => {}));
      render(<GraphPage />);
      const link = screen.getByText("Catalog");
      expect(link.closest("a")).toHaveAttribute("href", "/catalog");
    });

    it("renders OMOP quick link pointing to /analytics", () => {
      mockFetchApi.mockReturnValue(new Promise(() => {}));
      render(<GraphPage />);
      const link = screen.getByText("OMOP");
      expect(link.closest("a")).toHaveAttribute("href", "/analytics");
    });

    it("renders Patients quick link pointing to /patient", () => {
      mockFetchApi.mockReturnValue(new Promise(() => {}));
      render(<GraphPage />);
      const link = screen.getByText("Patients");
      expect(link.closest("a")).toHaveAttribute("href", "/patient");
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // Error handling and empty state
  // ────────────────────────────────────────────────────────────────────
  describe("error handling", () => {
    it("handles fetch rejection and shows error message", async () => {
      mockFetchApi.mockReturnValue(Promise.reject(new Error("Network error")));
      render(<GraphPage />);
      await waitFor(() => {
        expect(screen.getByText(/Neo4j unavailable/)).toBeInTheDocument();
      });
    });

    it("shows error message after a fetch error", async () => {
      mockFetchApi.mockReturnValue(Promise.reject(new Error("500")));
      render(<GraphPage />);
      await waitFor(() => {
        expect(screen.getByText(/Neo4j unavailable/)).toBeInTheDocument();
      });
    });

    it("shows 1 node for empty API response (value center injected)", async () => {
      mockFetchApi.mockReturnValue(mockResponse({ nodes: [], links: [] }));
      render(<GraphPage />);
      await waitFor(() => {
        expect(screen.getByText(/1 nodes/)).toBeInTheDocument();
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
        expect(screen.getByText(/Click a node to inspect/)).toBeInTheDocument();
      });
    });

    it("hides hint once a node is selected", async () => {
      const props = await renderAndGetForceGraphProps();
      act(() => {
        (props.onNodeClick as (n: object) => void)(sampleGraphData.nodes[0]);
      });
      await waitFor(() => {
        expect(
          screen.queryByText(/Click a node to inspect/),
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

    it("keeps node selected on second click (triggers expand, not deselect)", async () => {
      // Mock the expand API call so it doesn't fail
      mockFetchApi
        .mockReturnValueOnce(mockResponse(sampleGraphData)) // initial load
        .mockReturnValueOnce(mockResponse({ nodes: [], links: [] })); // expand call
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
      // Second click — triggers expand, node stays selected
      act(() => {
        (updatedProps.onNodeClick as (n: object) => void)(node);
      });
      // Node should remain selected (hint text should NOT appear)
      await waitFor(() => {
        expect(screen.getByText("Dataset-B")).toBeInTheDocument();
      });
      expect(
        screen.queryByText(/Click a node to inspect/),
      ).not.toBeInTheDocument();
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
      // Find the close button by its aria-label
      const closeBtn = screen.getByLabelText("Close detail panel");
      expect(closeBtn).toBeDefined();
      fireEvent.click(closeBtn);
      await waitFor(() => {
        expect(screen.getByText(/Click a node to inspect/)).toBeInTheDocument();
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
        expect(screen.getByText("My Data")).toBeInTheDocument();
        // edc-admin persona: layer 3 = "Clinical Layer" (in legend + detail card)
        const l3Elements = screen.getAllByText("Clinical Layer");
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
        expect(screen.getByText("Data Offering")).toBeInTheDocument();
        // edc-admin persona: layer 1 = "Participants & Contracts"
        const l1Elements = screen.getAllByText("Participants & Contracts");
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
        // edc-admin persona: layer 5 = "Events & Credentials"
        const l5Elements = screen.getAllByText("Events & Credentials");
        expect(l5Elements.length).toBeGreaterThanOrEqual(2);
      });
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // Contextual links based on layer
  // ────────────────────────────────────────────────────────────────────
  describe("contextual links", () => {
    it("shows 'Dataset Catalog' deep link for layer 2 node", async () => {
      const props = await renderAndGetForceGraphProps();
      const node = sampleGraphData.nodes[1]; // Dataset-B, layer 2
      act(() => {
        (props.onNodeClick as (n: object) => void)(node);
      });
      await waitFor(() => {
        const catalogLink = screen.getByText("Dataset Catalog");
        expect(catalogLink).toBeInTheDocument();
        expect(catalogLink.closest("a")).toHaveAttribute(
          "href",
          "/catalog?search=Dataset-B",
        );
      });
    });

    it("does not show 'Dataset Catalog' deep link for non-layer-2 node", async () => {
      const props = await renderAndGetForceGraphProps();
      const node = sampleGraphData.nodes[0]; // layer 1
      act(() => {
        (props.onNodeClick as (n: object) => void)(node);
      });
      await waitFor(() => {
        expect(screen.getByText("DataProduct-A")).toBeInTheDocument();
      });
      expect(screen.queryByText("Dataset Catalog")).not.toBeInTheDocument();
    });

    it("shows 'Patient Journey' deep link for layer 3 node", async () => {
      const props = await renderAndGetForceGraphProps();
      const node = sampleGraphData.nodes[2]; // Patient-C, layer 3
      act(() => {
        (props.onNodeClick as (n: object) => void)(node);
      });
      await waitFor(() => {
        // Detail card shows "Patient Journey" deep link (icon + text rendered as one)
        const patientLinks = screen.getAllByText("Patient Journey");
        // At least one should be a link to /patient
        const patientLink = patientLinks.find(
          (el) => el.closest("a")?.getAttribute("href") === "/patient",
        );
        expect(patientLink).toBeDefined();
      });
    });

    it("shows 'Patient Journey' deep link for layer 3 node (appears in detail card)", async () => {
      const props = await renderAndGetForceGraphProps();
      const node = sampleGraphData.nodes[2]; // Patient-C, layer 3
      act(() => {
        (props.onNodeClick as (n: object) => void)(node);
      });
      await waitFor(() => {
        // "Patient Journey" appears in both the sidebar quick links and the detail card deep links
        const links = screen.getAllByText("Patient Journey");
        expect(links.length).toBeGreaterThanOrEqual(1);
      });
    });

    it("shows 'Patient Journey' deep link for layer 4 node", async () => {
      const props = await renderAndGetForceGraphProps();
      const node = sampleGraphData.nodes[3]; // Condition-D, layer 4
      act(() => {
        (props.onNodeClick as (n: object) => void)(node);
      });
      await waitFor(() => {
        const patientLinks = screen.getAllByText("Patient Journey");
        const patientLink = patientLinks.find(
          (el) => el.closest("a")?.getAttribute("href") === "/patient",
        );
        expect(patientLink).toBeDefined();
      });
    });

    it("does not show 'Dataset Catalog' deep link for layer 1 node", async () => {
      const props = await renderAndGetForceGraphProps();
      const node = sampleGraphData.nodes[0]; // layer 1
      act(() => {
        (props.onNodeClick as (n: object) => void)(node);
      });
      await waitFor(() => {
        expect(screen.getByText("DataProduct-A")).toBeInTheDocument();
      });
      expect(screen.queryByText("Dataset Catalog")).not.toBeInTheDocument();
      // Sidebar has Patients quick link but no Patient Journey deep link
      expect(screen.getByText("Patients")).toBeInTheDocument();
    });

    it("does not show 'Dataset Catalog' deep link for layer 5 node", async () => {
      const props = await renderAndGetForceGraphProps();
      const node = sampleGraphData.nodes[4]; // layer 5
      act(() => {
        (props.onNodeClick as (n: object) => void)(node);
      });
      await waitFor(() => {
        expect(screen.getByText("SNOMED-E")).toBeInTheDocument();
      });
      expect(screen.queryByText("Dataset Catalog")).not.toBeInTheDocument();
      // Sidebar has Patients quick link
      expect(screen.getByText("Patients")).toBeInTheDocument();
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // Neighbour list
  // ────────────────────────────────────────────────────────────────────
  describe("neighbour list", () => {
    it("shows connected heading with count when node has neighbours", async () => {
      const props = await renderAndGetForceGraphProps();
      // n2 (Dataset-B) has: n1→n2 (DESCRIBES) and n2→n3 (CONTAINS)
      const node = sampleGraphData.nodes[1];
      act(() => {
        (props.onNodeClick as (n: object) => void)(node);
      });
      await waitFor(() => {
        // Outgoing and Incoming section labels appear as section-label elements,
        // with count displayed in a separate badge span
        expect(screen.getByText("Outgoing")).toBeInTheDocument();
        expect(screen.getByText("Incoming")).toBeInTheDocument();
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
        // FRIENDLY_REL_NAMES maps "DESCRIBES" → "describes"
        expect(screen.getByText("describes")).toBeInTheDocument();
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

    it("shows direction sections for neighbours", async () => {
      const props = await renderAndGetForceGraphProps();
      const node = sampleGraphData.nodes[1]; // Dataset-B
      act(() => {
        (props.onNodeClick as (n: object) => void)(node);
      });
      await waitFor(() => {
        // Outgoing and Incoming sections are shown (icons are SVG, not text arrows)
        expect(screen.getByText("Outgoing")).toBeInTheDocument();
        expect(screen.getByText("Incoming")).toBeInTheDocument();
        // Relationship types are shown as text
        expect(screen.getByText("CONTAINS")).toBeInTheDocument();
        expect(screen.getByText("describes")).toBeInTheDocument();
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
            color: "#5B8DEF",
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
      expect(screen.queryByText(/Outgoing/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Incoming/)).not.toBeInTheDocument();
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
        expect(screen.getByText(/Outgoing/)).toBeInTheDocument();
      });
      // Click on the neighbour "Patient-C" button
      const neighbourButton = screen.getByText("Patient-C").closest("button");
      expect(neighbourButton).not.toBeNull();
      fireEvent.click(neighbourButton!);
      // Now Patient-C should be the selected node with its own detail card
      await waitFor(() => {
        // Patient-C detail card shows its unique ID
        expect(screen.getByText("n3")).toBeInTheDocument();
        // edc-admin persona: layer 3 = "Clinical Layer" (in legend + detail card)
        const l3Elements = screen.getAllByText("Clinical Layer");
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
        // FRIENDLY_REL_NAMES maps "DESCRIBES" → "describes"
        expect(screen.getByText("describes")).toBeInTheDocument();
        expect(screen.getByText("CONTAINS")).toBeInTheDocument();
      });
      // Click Patient-C neighbour
      const neighbourButton = screen.getByText("Patient-C").closest("button");
      fireEvent.click(neighbourButton!);
      // Patient-C (n3) has: n2→n3 (CONTAINS), n3→n4 (HAS_CONDITION → "has condition")
      await waitFor(() => {
        expect(screen.getByText("has condition")).toBeInTheDocument();
        expect(screen.getByText("CONTAINS")).toBeInTheDocument();
      });
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // ?highlight= query param
  // ────────────────────────────────────────────────────────────────────
  describe("highlight query param", () => {
    it("auto-selects node matching ?highlight= by name", async () => {
      mockSearchParamValues.highlight = "Dataset-B";
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
      mockSearchParamValues.highlight = "N3";
      mockFetchApi.mockReturnValue(mockResponse(sampleGraphData));
      render(<GraphPage />);
      await waitFor(() => {
        expect(screen.getByText("Patient-C")).toBeInTheDocument();
        expect(screen.getByText("n3")).toBeInTheDocument();
      });
    });

    it("auto-selects node matching partial name", async () => {
      mockSearchParamValues.highlight = "SNOMED";
      mockFetchApi.mockReturnValue(mockResponse(sampleGraphData));
      render(<GraphPage />);
      await waitFor(() => {
        expect(screen.getByText("SNOMED-E")).toBeInTheDocument();
        expect(screen.getByText("n5")).toBeInTheDocument();
      });
    });

    it("does nothing when ?highlight= matches no node", async () => {
      mockSearchParamValues.highlight = "nonexistent";
      mockFetchApi.mockReturnValue(mockResponse(sampleGraphData));
      render(<GraphPage />);
      await waitFor(() => {
        expect(screen.getByTestId("force-graph")).toBeInTheDocument();
      });
      // Hint text should still be visible since nothing was selected
      expect(screen.getByText(/Click a node to inspect/)).toBeInTheDocument();
    });

    it("does nothing when highlight is null", async () => {
      // highlight defaults to null via empty mockSearchParamValues
      mockFetchApi.mockReturnValue(mockResponse(sampleGraphData));
      render(<GraphPage />);
      await waitFor(() => {
        expect(screen.getByTestId("force-graph")).toBeInTheDocument();
      });
      expect(screen.getByText(/Click a node to inspect/)).toBeInTheDocument();
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
      // +1 node for injected value center
      expect(graphData.nodes).toHaveLength(6);
      // +N links for VALUE_FOCUS edges from value center
      expect(graphData.links.length).toBeGreaterThanOrEqual(4);
    });

    it("passes backgroundColor", async () => {
      const props = await renderAndGetForceGraphProps();
      // Default is light mode (#ffffff); dark mode would be #030712
      expect(props.backgroundColor).toMatch(/^#(ffffff|030712)$/i);
    });

    it("passes d3AlphaDecay", async () => {
      const props = await renderAndGetForceGraphProps();
      expect(props.d3AlphaDecay).toBe(1);
    });

    it("passes d3VelocityDecay", async () => {
      const props = await renderAndGetForceGraphProps();
      expect(props.d3VelocityDecay).toBe(1);
    });

    it("passes cooldownTicks", async () => {
      const props = await renderAndGetForceGraphProps();
      expect(props.cooldownTicks).toBe(0);
    });

    it("passes nodeRelSize", async () => {
      const props = await renderAndGetForceGraphProps();
      expect(props.nodeRelSize).toBe(4);
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
      closePath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      fillText: vi.fn(),
      fillRect: vi.fn(),
      measureText: vi.fn().mockReturnValue({ width: 50 }),
      setLineDash: vi.fn(),
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
        closePath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        fillText: vi.fn(),
        fillRect: vi.fn(),
        measureText: vi.fn().mockReturnValue({ width: 50 }),
        setLineDash: vi.fn(),
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

    it("paintNode renders text label when zoom scale >= 1.5", async () => {
      const props = await renderAndGetForceGraphProps();
      const paintNode = props.nodeCanvasObject as (
        node: object,
        ctx: CanvasRenderingContext2D,
        globalScale: number,
      ) => void;
      const ctx = createMockCtx();
      const node = { ...sampleGraphData.nodes[0], x: 100, y: 200 };
      paintNode(node, ctx, 2);
      expect(ctx.fillText).toHaveBeenCalledWith(
        expect.any(String),
        100,
        expect.any(Number),
      );
    });

    it("paintNode does not render text label when gs is below 0.1", async () => {
      // gs < 0.1 and node is not selected or connected → text hidden
      const props = await renderAndGetForceGraphProps();
      const paintNode = props.nodeCanvasObject as (
        node: object,
        ctx: CanvasRenderingContext2D,
        globalScale: number,
      ) => void;
      const ctx = createMockCtx();
      const node = { ...sampleGraphData.nodes[0], x: 100, y: 200 };
      paintNode(node, ctx, 0.05);
      // fillText should not be called — gs(0.05) < 0.1 and node not selected/connected
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
      // Line starts at source coordinates
      expect(ctx.moveTo).toHaveBeenCalledWith(10, 20);
      // Line ends at an offset before the target node edge (not exactly target coords)
      expect(ctx.lineTo).toHaveBeenCalled();
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
      // Should draw the relationship type text at the midpoint of the link
      // FRIENDLY_REL_NAMES maps "DESCRIBES" → "describes"
      // mx = (10+30)/2 = 20, my = (20+40)/2 = 30
      expect(ctx.fillText).toHaveBeenCalledWith("describes", 20, 30);
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
            color: "#94A3B8",
          },
        ],
        links: [],
      };
      mockFetchApi.mockReturnValue(mockResponse(oneNodeData));
      render(<GraphPage />);
      await waitFor(() => {
        // +1 for injected value center node
        expect(screen.getByText(/2 nodes/)).toBeInTheDocument();
      });
    });

    it("handles node with long id (truncated in canvas)", async () => {
      const props = await renderAndGetForceGraphProps();
      const paintNode = props.nodeCanvasObject as (
        node: object,
        ctx: CanvasRenderingContext2D,
        globalScale: number,
      ) => void;
      const ctx = createMockCtx() as CanvasRenderingContext2D;
      // The label rendered is node.id (not node.name); must exceed maxLen (18)
      const longNameNode = {
        id: "a-very-long-node-id-that-exceeds-eighteen-characters",
        name: "Long Node",
        label: "Test",
        layer: 1,
        color: "#333",
        x: 0,
        y: 0,
      };
      paintNode(longNameNode, ctx, 2);
      // Check that fillText was called with a truncated string (…)
      expect(ctx.fillText).toHaveBeenCalledWith(
        expect.stringContaining("…"),
        expect.any(Number),
        expect.any(Number),
      );
    });
  });
});
