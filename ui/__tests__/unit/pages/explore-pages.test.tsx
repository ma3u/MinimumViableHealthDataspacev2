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

import userEvent from "@testing-library/user-event";

import GraphPage from "@/app/graph/page";
import CatalogPage from "@/app/catalog/page";
import PatientPage from "@/app/patient/page";
import AnalyticsPage from "@/app/analytics/page";
import EehrxfPage from "@/app/eehrxf/page";

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
  ],
  links: [
    { source: "n1", target: "n2", type: "DESCRIBES" },
    { source: "n2", target: "n3", type: "CONTAINS" },
  ],
};

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
    expect(
      screen.getByText(/Building researcher overview/),
    ).toBeInTheDocument();
  });

  it("renders graph after data loads", async () => {
    mockFetchApi.mockReturnValue(mockResponse({ nodes: [], links: [] }));
    render(<GraphPage />);
    await waitFor(() => {
      expect(screen.getByText(/0 nodes/)).toBeInTheDocument();
    });
  });

  it("displays all five layer labels in the sidebar", () => {
    mockFetchApi.mockReturnValue(new Promise(() => {}));
    render(<GraphPage />);
    expect(screen.getByText("L1 Governance")).toBeInTheDocument();
    expect(screen.getByText("L2 HealthDCAT-AP")).toBeInTheDocument();
    expect(screen.getByText("L3 FHIR R4")).toBeInTheDocument();
    expect(screen.getByText("L4 OMOP CDM")).toBeInTheDocument();
    expect(screen.getByText("L5 Ontology")).toBeInTheDocument();
  });

  it("shows node and edge counts after data loads", async () => {
    mockFetchApi.mockReturnValue(mockResponse(sampleGraphData));
    render(<GraphPage />);
    await waitFor(() => {
      expect(screen.getByText(/3 nodes/)).toBeInTheDocument();
      expect(screen.getByText(/2 edges/)).toBeInTheDocument();
    });
  });

  it("shows hint text when no node is selected", async () => {
    mockFetchApi.mockReturnValue(mockResponse(sampleGraphData));
    render(<GraphPage />);
    await waitFor(() => {
      expect(screen.getByText(/Click a node to inspect/)).toBeInTheDocument();
    });
  });

  it("handles fetch error gracefully", async () => {
    mockFetchApi.mockReturnValue(Promise.reject(new Error("Network error")));
    render(<GraphPage />);
    // After error, loading stops and error message renders
    await waitFor(() => {
      expect(screen.getByText(/Neo4j unavailable/)).toBeInTheDocument();
    });
  });

  it("renders ForceGraph component after loading", async () => {
    mockFetchApi.mockReturnValue(mockResponse(sampleGraphData));
    render(<GraphPage />);
    await waitFor(() => {
      expect(screen.getByTestId("force-graph")).toBeInTheDocument();
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

  it("filters datasets by title", async () => {
    const user = userEvent.setup();
    mockFetchApi.mockReturnValue(
      mockResponse([
        {
          id: "ds1",
          title: "FHIR Cohort",
          description: "",
          publisher: "SPE-1",
          theme: "",
          datasetType: "",
          legalBasis: "",
          recordCount: 10,
          license: "",
          conformsTo: "",
        },
        {
          id: "ds2",
          title: "OMOP Analysis",
          description: "",
          publisher: "SPE-2",
          theme: "",
          datasetType: "",
          legalBasis: "",
          recordCount: 5,
          license: "",
          conformsTo: "",
        },
      ]),
    );
    render(<CatalogPage />);
    await waitFor(() =>
      expect(screen.getByText("FHIR Cohort")).toBeInTheDocument(),
    );
    // Both visible initially
    expect(screen.getByText("OMOP Analysis")).toBeInTheDocument();
    // Type filter
    const filterInput = screen.getByPlaceholderText(/Filter by title/);
    await user.type(filterInput, "FHIR");
    // After filter, only FHIR dataset should be visible
    expect(screen.getByText("FHIR Cohort")).toBeInTheDocument();
    expect(screen.queryByText("OMOP Analysis")).not.toBeInTheDocument();
  });

  it("expands dataset to show detail panel", async () => {
    const user = userEvent.setup();
    mockFetchApi.mockReturnValue(
      mockResponse([
        {
          id: "ds1",
          title: "Test Dataset",
          description: "Desc",
          publisher: "Pub",
          theme: "Health",
          datasetType: "FHIR",
          legalBasis: "EHDS-Art53-SecondaryUse",
          recordCount: 42,
          license: "CC-BY",
          conformsTo: "https://example.com/spec",
        },
      ]),
    );
    render(<CatalogPage />);
    await waitFor(() =>
      expect(screen.getByText("Test Dataset")).toBeInTheDocument(),
    );
    // Click to expand
    await user.click(screen.getByText("Test Dataset"));
    // Detail panel should show HealthDCAT-AP Metadata heading
    await waitFor(() => {
      expect(screen.getByText("HealthDCAT-AP Metadata")).toBeInTheDocument();
    });
    // Detail row values
    expect(screen.getByText("HealthDCAT-AP Spec")).toBeInTheDocument();
  });

  it("renders legal basis label", async () => {
    mockFetchApi.mockReturnValue(
      mockResponse([
        {
          id: "ds1",
          title: "DS",
          description: "",
          publisher: "",
          theme: "",
          datasetType: "",
          legalBasis: "EHDS-Art53-SecondaryUse",
          recordCount: 0,
          license: "",
          conformsTo: "",
        },
      ]),
    );
    render(<CatalogPage />);
    await waitFor(() => {
      expect(screen.getByText(/EHDS Art\. 53/)).toBeInTheDocument();
    });
  });

  it("handles fetch error", async () => {
    mockFetchApi.mockReturnValue(Promise.reject(new Error("fail")));
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

  const patientData = {
    patients: [
      { id: "p1", name: "John Doe", gender: "male", birthDate: "1990-01-01" },
      {
        id: "p2",
        name: "Jane Smith",
        gender: "female",
        birthDate: "1985-06-15",
      },
    ],
    stats: {
      patients: 2,
      encounters: 5,
      conditions: 3,
      observations: 10,
      medications: 2,
      procedures: 1,
    },
  };

  it("renders stats after loading", async () => {
    mockFetchApi.mockReturnValue(mockResponse(patientData));
    render(<PatientPage />);
    await waitFor(() => {
      expect(screen.getByText(/John Doe/)).toBeInTheDocument();
    });
  });

  it("displays stat badges with cohort stats", async () => {
    mockFetchApi.mockReturnValue(mockResponse(patientData));
    render(<PatientPage />);
    await waitFor(() => {
      expect(screen.getByText("5")).toBeInTheDocument(); // encounters (unique value)
    });
    expect(screen.getByText("3")).toBeInTheDocument(); // conditions
    expect(screen.getByText("10")).toBeInTheDocument(); // observations
  });

  it("renders patient selector with all patients", async () => {
    mockFetchApi.mockReturnValue(mockResponse(patientData));
    render(<PatientPage />);
    await waitFor(() => {
      expect(screen.getByText(/John Doe/)).toBeInTheDocument();
      expect(screen.getByText(/Jane Smith/)).toBeInTheDocument();
    });
  });

  it("selects patient and loads timeline", async () => {
    const user = userEvent.setup();
    // Initial load returns patient list
    mockFetchApi.mockReturnValue(mockResponse(patientData));
    render(<PatientPage />);
    await waitFor(() =>
      expect(screen.getByText(/select patient/)).toBeInTheDocument(),
    );
    // Now set up mock for patient timeline call
    mockFetchApi.mockReturnValue(
      mockResponse({
        patient: {
          id: "p1",
          name: "John Doe",
          gender: "male",
          birthDate: "1990-01-01",
        },
        timeline: [
          {
            date: "2024-01-15",
            fhirType: "Encounter",
            fhirId: "enc-1",
            display: "Office visit",
            omopType: "Visit",
            omopId: "v-1",
          },
        ],
      }),
    );
    // Select patient using the <select> element
    const select = screen.getByRole("combobox");
    await user.selectOptions(select, "p1");
    await waitFor(() => {
      expect(mockFetchApi).toHaveBeenCalledWith(
        expect.stringContaining("patientId=p1"),
      );
    });
  });

  it("handles fetch error gracefully", async () => {
    mockFetchApi.mockReturnValue(Promise.reject(new Error("network error")));
    render(<PatientPage />);
    await waitFor(() => {
      // Should not crash; finishes loading
      expect(screen.queryByText(/Loading/)).not.toBeInTheDocument();
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
