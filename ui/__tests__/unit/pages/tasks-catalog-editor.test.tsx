/**
 * Tests for Tasks page and Catalog Editor page
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

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

import TasksPage from "@/app/tasks/page";
import CatalogEditorPage from "@/app/catalog/editor/page";

function mockResponse(data: unknown) {
  return Promise.resolve({ json: () => Promise.resolve(data), ok: true });
}

describe("TasksPage", () => {
  beforeEach(() => {
    mockFetchApi.mockReset();
  });

  it("renders heading", () => {
    mockFetchApi.mockReturnValue(new Promise(() => {}));
    render(<TasksPage />);
    expect(screen.getByText("Tasks")).toBeInTheDocument();
  });

  it("shows loading state", () => {
    mockFetchApi.mockReturnValue(new Promise(() => {}));
    render(<TasksPage />);
    expect(screen.getByText(/Loading/i)).toBeInTheDocument();
  });

  it("renders task count cards after loading", async () => {
    mockFetchApi.mockReturnValue(
      mockResponse({
        tasks: [
          {
            id: "t1",
            type: "negotiation",
            participant: "AlphaKlinik Berlin",
            state: "FINALIZED",
            asset: "FHIR R4 Bundle",
            counterParty: "PharmaCo Research AG",
            timestamp: 1700000000000,
          },
        ],
        counts: { total: 1, negotiations: 1, transfers: 0, active: 0 },
      }),
    );
    render(<TasksPage />);

    await waitFor(() => {
      // Total count card shows "1"
      expect(screen.getAllByText("1").length).toBeGreaterThan(0);
    });
  });

  it("renders task items after loading", async () => {
    mockFetchApi.mockReturnValue(
      mockResponse({
        tasks: [
          {
            id: "t1",
            type: "negotiation",
            participant: "AlphaKlinik Berlin",
            state: "AGREED",
            asset: "FHIR R4 Bundle",
            counterParty: "PharmaCo Research AG",
            timestamp: 1700000000000,
          },
        ],
        counts: { total: 1, negotiations: 1, transfers: 0, active: 1 },
      }),
    );
    render(<TasksPage />);

    await waitFor(() => {
      expect(screen.getByText(/AlphaKlinik/)).toBeInTheDocument();
    });
  });

  it("handles API error gracefully", async () => {
    mockFetchApi.mockReturnValue(
      Promise.resolve({ json: () => Promise.resolve({}), ok: false }),
    );
    render(<TasksPage />);

    await waitFor(() => {
      // Should not crash — shows empty or error state
      expect(screen.getByText("Tasks")).toBeInTheDocument();
    });
  });
});

describe("CatalogEditorPage", () => {
  beforeEach(() => {
    mockFetchApi.mockReset();
  });

  it("renders heading", async () => {
    mockFetchApi.mockReturnValue(mockResponse([]));
    render(<CatalogEditorPage />);
    await waitFor(() => {
      expect(screen.getByText(/HealthDCAT-AP Editor/i)).toBeInTheDocument();
    });
  });

  it("shows loading state", () => {
    mockFetchApi.mockReturnValue(new Promise(() => {}));
    render(<CatalogEditorPage />);
    expect(screen.getByText(/Loading/i)).toBeInTheDocument();
  });

  it("renders tabs after loading", async () => {
    mockFetchApi.mockReturnValue(
      mockResponse([
        {
          id: "ds-1",
          title: "Synthetic FHIR Cohort",
          description: "Test dataset",
        },
      ]),
    );
    render(<CatalogEditorPage />);

    await waitFor(() => {
      // Should show browse tab after loading
      expect(screen.getAllByText(/Browse/i).length).toBeGreaterThan(0);
    });
  });
});
