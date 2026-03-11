/**
 * Tests for Explore pages: Graph, Catalog, Patient, Analytics, EEHRxF
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

// Mock fetchApi
const mockFetchApi = vi.fn();
vi.mock("@/lib/api", () => ({
  fetchApi: (...args: unknown[]) => mockFetchApi(...args),
}));

// Mock next/link
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

// Mock next/dynamic for ForceGraph2D
vi.mock("next/dynamic", () => ({
  default: () => {
    const Stub = () => <div data-testid="force-graph">ForceGraph</div>;
    Stub.displayName = "DynamicStub";
    return Stub;
  },
}));

import GraphPage from "@/app/graph/page";
import CatalogPage from "@/app/catalog/page";
import PatientPage from "@/app/patient/page";
import AnalyticsPage from "@/app/analytics/page";
import EehrxfPage from "@/app/eehrxf/page";

function mockResponse(data: unknown) {
  return Promise.resolve({ json: () => Promise.resolve(data), ok: true });
}

describe("GraphPage", () => {
  beforeEach(() => {
    mockFetchApi.mockReset();
  });

  it("renders sidebar with layer labels", () => {
    mockFetchApi.mockReturnValue(new Promise(() => {}));
    render(<GraphPage />);
    expect(screen.getByText("Layers")).toBeInTheDocument();
  });

  it("shows loading state", () => {
    mockFetchApi.mockReturnValue(new Promise(() => {}));
    render(<GraphPage />);
    expect(screen.getByText(/Connecting to Neo4j/)).toBeInTheDocument();
  });

  it("renders graph after data loads", async () => {
    mockFetchApi.mockReturnValue(mockResponse({ nodes: [], links: [] }));
    render(<GraphPage />);
    await waitFor(() => {
      expect(screen.getByText(/0 nodes/)).toBeInTheDocument();
    });
  });
});

describe("CatalogPage", () => {
  beforeEach(() => {
    mockFetchApi.mockReset();
  });

  it("renders heading", () => {
    mockFetchApi.mockReturnValue(new Promise(() => {}));
    render(<CatalogPage />);
    expect(screen.getByText("Dataset Catalog")).toBeInTheDocument();
  });

  it("shows loading state", () => {
    mockFetchApi.mockReturnValue(new Promise(() => {}));
    render(<CatalogPage />);
    expect(screen.getByText(/Connecting to Neo4j/)).toBeInTheDocument();
  });

  it("renders filter input", () => {
    mockFetchApi.mockReturnValue(new Promise(() => {}));
    render(<CatalogPage />);
    expect(screen.getByPlaceholderText(/Filter by title/)).toBeInTheDocument();
  });

  it("renders datasets after loading", async () => {
    mockFetchApi.mockReturnValue(
      mockResponse([
        {
          id: "ds-1",
          title: "Test Dataset",
          description: "A test",
          license: "CC-BY",
          conformsTo: "HealthDCAT-AP",
          publisher: "SPE-1",
          theme: "Health",
          datasetType: "FHIR",
          legalBasis: "EHDS-Art53",
          recordCount: 42,
        },
      ]),
    );
    render(<CatalogPage />);
    await waitFor(() => {
      expect(screen.getByText("Test Dataset")).toBeInTheDocument();
    });
  });

  it("shows empty state", async () => {
    mockFetchApi.mockReturnValue(mockResponse([]));
    render(<CatalogPage />);
    await waitFor(() => {
      expect(screen.getByText("No datasets found.")).toBeInTheDocument();
    });
  });
});

describe("PatientPage", () => {
  beforeEach(() => {
    mockFetchApi.mockReset();
  });

  it("renders heading", () => {
    mockFetchApi.mockReturnValue(new Promise(() => {}));
    render(<PatientPage />);
    expect(screen.getByText("Patient Journey")).toBeInTheDocument();
  });

  it("shows loading state", () => {
    mockFetchApi.mockReturnValue(new Promise(() => {}));
    render(<PatientPage />);
    // Component shows "Loading…" (Unicode ellipsis) when loading is true
    expect(screen.getByText(/Loading/)).toBeInTheDocument();
  });

  it("renders stats after loading", async () => {
    mockFetchApi.mockReturnValue(
      mockResponse({
        patients: [
          {
            id: "p1",
            name: "John Doe",
            gender: "male",
            birthDate: "1990-01-01",
          },
        ],
        stats: {
          patients: 1,
          encounters: 5,
          conditions: 3,
          observations: 10,
          medications: 2,
          procedures: 1,
        },
      }),
    );
    render(<PatientPage />);
    await waitFor(() => {
      expect(screen.getByText(/John Doe/)).toBeInTheDocument();
    });
  });
});

describe("AnalyticsPage", () => {
  beforeEach(() => {
    mockFetchApi.mockReset();
  });

  it("renders heading", () => {
    mockFetchApi.mockReturnValue(new Promise(() => {}));
    render(<AnalyticsPage />);
    expect(screen.getByText("OMOP Research Analytics")).toBeInTheDocument();
  });

  it("shows loading state", () => {
    mockFetchApi.mockReturnValue(new Promise(() => {}));
    render(<AnalyticsPage />);
    // BarSection components show "Loading…" when loading is true
    expect(screen.getAllByText(/Loading/).length).toBeGreaterThan(0);
  });

  it("renders analytics after loading", async () => {
    mockFetchApi.mockReturnValue(
      mockResponse({
        summary: {
          persons: 100,
          conditions: 80,
          drugs: 60,
          measurements: 150,
          procedures: 30,
          visits: 200,
        },
        topConditions: [{ label: "Diabetes", count: 20 }],
        topDrugs: [{ label: "Metformin", count: 15 }],
        topMeasurements: [{ label: "BMI", count: 50 }],
        topProcedures: [{ label: "ECG", count: 10 }],
        genderBreakdown: [
          { gender: "Male", count: 60 },
          { gender: "Female", count: 40 },
        ],
      }),
    );
    render(<AnalyticsPage />);
    await waitFor(() => {
      expect(screen.getByText("100")).toBeInTheDocument();
    });
  });
});

describe("EehrxfPage", () => {
  beforeEach(() => {
    mockFetchApi.mockReset();
  });

  it("renders heading", () => {
    mockFetchApi.mockReturnValue(new Promise(() => {}));
    render(<EehrxfPage />);
    expect(screen.getByText("EEHRxF Profile Alignment")).toBeInTheDocument();
  });

  it("shows loading state", () => {
    mockFetchApi.mockReturnValue(new Promise(() => {}));
    render(<EehrxfPage />);
    expect(screen.getByText(/Loading/i)).toBeInTheDocument();
  });

  it("renders profile data after loading", async () => {
    mockFetchApi.mockReturnValue(
      mockResponse({
        categories: [
          {
            categoryId: "cat1",
            name: "Patient Summary",
            description: "Core patient summary data",
            ehdsDeadline: "2029",
            ehdsGroup: 1,
            status: "partial",
            totalResources: 100,
            profileCount: 1,
            profiles: [
              {
                profileId: "p1",
                name: "IPS Profile",
                igName: "HL7 IPS",
                igPackage: "hl7.fhir.uv.ips",
                fhirVersion: "R4",
                status: "active",
                url: "https://example.com",
                baseResource: "Patient",
                description: "Patient summary profile",
                coverage: "full",
                resourceCount: 50,
              },
            ],
          },
        ],
        summary: {
          totalCategories: 1,
          totalProfiles: 1,
          coveredProfiles: 1,
          coveragePercent: 100,
          resourceCounts: {},
        },
      }),
    );
    render(<EehrxfPage />);
    await waitFor(() => {
      expect(screen.getByText("Patient Summary")).toBeInTheDocument();
    });
  });
});
