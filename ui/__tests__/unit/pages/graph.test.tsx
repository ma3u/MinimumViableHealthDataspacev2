/**
 * Comprehensive tests for the Graph Explorer page.
 *
 * Covers: heading, loading state, data rendering, sidebar legend,
 * navigation links, API errors, empty state, layer labels, and node counts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ── Mocks ────────────────────────────────────────────────────────────
const mockFetchApi = vi.fn();
vi.mock("@/lib/api", () => ({
  fetchApi: (...args: unknown[]) => mockFetchApi(...args),
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

// Mock next/dynamic so ForceGraph2D renders a simple stub
vi.mock("next/dynamic", () => ({
  default: () => {
    const Stub = (props: Record<string, unknown>) => (
      <div data-testid="force-graph">ForceGraph</div>
    );
    Stub.displayName = "DynamicForceGraph";
    return Stub;
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

// ── Tests ────────────────────────────────────────────────────────────
describe("GraphPage", () => {
  beforeEach(() => {
    mockFetchApi.mockReset();
  });

  // 1. Renders page heading/title
  it("renders the Graph Explorer heading", () => {
    mockFetchApi.mockReturnValue(new Promise(() => {}));
    render(<GraphPage />);
    expect(screen.getByText("Knowledge Graph")).toBeInTheDocument();
  });

  it("renders the description paragraph", () => {
    mockFetchApi.mockReturnValue(new Promise(() => {}));
    render(<GraphPage />);
    expect(
      screen.getByText(/5-layer EHDS health dataspace/),
    ).toBeInTheDocument();
  });

  // 2. Shows loading state (persona-aware: EDC_ADMIN → "My Dataspace")
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

  // 3. Loads and renders graph data
  it("renders ForceGraph component after data loads", async () => {
    mockFetchApi.mockReturnValue(mockResponse(sampleGraphData));
    render(<GraphPage />);
    await waitFor(() => {
      expect(screen.getByTestId("force-graph")).toBeInTheDocument();
    });
  });

  it("shows node and edge counts after data loads", async () => {
    mockFetchApi.mockReturnValue(mockResponse(sampleGraphData));
    render(<GraphPage />);
    await waitFor(() => {
      // +1 node for injected value center, +N links for VALUE_FOCUS edges
      expect(screen.getByText(/6 nodes/)).toBeInTheDocument();
    });
  });

  it("calls fetchApi with persona-qualified graph URL", () => {
    mockFetchApi.mockReturnValue(new Promise(() => {}));
    render(<GraphPage />);
    // Global mock session has EDC_ADMIN role → persona "edc-admin"
    expect(mockFetchApi).toHaveBeenCalledWith("/api/graph?persona=edc-admin");
  });

  // 4. Shows sidebar with layer legend
  it("renders the Structural layers heading in the sidebar", () => {
    mockFetchApi.mockReturnValue(new Promise(() => {}));
    render(<GraphPage />);
    expect(screen.getByText("Structural layers")).toBeInTheDocument();
  });

  // 5. Shows navigation links in sidebar
  it("renders Dataset Catalog link pointing to /catalog", () => {
    mockFetchApi.mockReturnValue(new Promise(() => {}));
    render(<GraphPage />);
    const link = screen.getByText("Dataset Catalog");
    expect(link).toBeInTheDocument();
    expect(link.closest("a")).toHaveAttribute("href", "/catalog");
  });

  it("renders Validate graph link pointing to /api/graph/validate", () => {
    mockFetchApi.mockReturnValue(new Promise(() => {}));
    render(<GraphPage />);
    const link = screen.getByText("Validate graph");
    expect(link).toBeInTheDocument();
    expect(link.closest("a")).toHaveAttribute("href", "/api/graph/validate");
  });

  it("renders Patient Journey link pointing to /patient", () => {
    mockFetchApi.mockReturnValue(new Promise(() => {}));
    render(<GraphPage />);
    const link = screen.getByText("Patient Journey");
    expect(link).toBeInTheDocument();
    expect(link.closest("a")).toHaveAttribute("href", "/patient");
  });

  // 6. Handles API errors
  it("handles fetch rejection gracefully and shows error message", async () => {
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

  // 7. Shows empty state when no nodes (value center still injected)
  it("shows 1 node when API returns empty data (value center injected)", async () => {
    mockFetchApi.mockReturnValue(mockResponse({ nodes: [], links: [] }));
    render(<GraphPage />);
    await waitFor(() => {
      expect(screen.getByText(/1 nodes/)).toBeInTheDocument();
    });
  });

  it("shows hint text when no node is selected", async () => {
    mockFetchApi.mockReturnValue(mockResponse(sampleGraphData));
    render(<GraphPage />);
    await waitFor(() => {
      expect(screen.getByText(/Click a node to inspect/)).toBeInTheDocument();
    });
  });

  // 8. Layer filter/legend items (EDC_ADMIN persona → edc-admin labels)
  it("displays persona-specific layer labels for edc-admin", () => {
    mockFetchApi.mockReturnValue(new Promise(() => {}));
    render(<GraphPage />);
    // edc-admin persona-specific labels
    const labels = [
      "Participants & Contracts",
      "Data Offerings",
      "Clinical Layer",
      "Research Layer",
      "Events & Credentials",
    ];
    for (const label of labels) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  // Loading disappears after data arrives
  it("removes loading indicator after data loads", async () => {
    mockFetchApi.mockReturnValue(mockResponse(sampleGraphData));
    render(<GraphPage />);
    await waitFor(() => {
      expect(screen.queryByText(/Loading.*Dataspace/)).not.toBeInTheDocument();
    });
  });

  // Sidebar renders with single-node data (+1 for injected value center)
  it("updates counts with single node response", async () => {
    const oneNodeData = {
      nodes: [
        {
          id: "x1",
          name: "Only Node",
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
      expect(screen.getByText(/2 nodes/)).toBeInTheDocument();
    });
  });
});
