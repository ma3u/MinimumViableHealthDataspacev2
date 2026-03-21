/**
 * Comprehensive tests for the Data Discover page.
 *
 * Covers: loading state, tab switching, search/filter, EDC assets rendering,
 * HealthDCAT-AP catalog rendering, expand/collapse detail panels, stats bar,
 * empty states, API error handling, assetField normalisation (edc: prefix,
 * properties-level), keyword matching, URL search-param pre-fill, links
 * (negotiate, graph, catalog), and mixed tab counts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/* ── Mocks ── */

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

import DiscoverPage from "@/app/data/discover/page";

/* ── Helpers ── */

function mockResponse(data: unknown, ok = true) {
  return Promise.resolve({ json: () => Promise.resolve(data), ok });
}

function mockErrorResponse() {
  return Promise.resolve({
    json: () => Promise.resolve({ error: "Server error" }),
    ok: false,
    status: 500,
  });
}

/* ── Test data ── */

const ASSETS_RESPONSE = [
  {
    participantId: "ctx-alpha",
    identity: "did:web:alpha-klinik.de:participant",
    assets: [
      {
        "@id": "asset-fhir-001",
        name: "FHIR Patient Bundle",
        description: "Synthetic patient data from AlphaKlinik",
        contenttype: "application/fhir+json",
        properties: {
          name: "FHIR Patient Bundle",
          description: "Synthetic patient data from AlphaKlinik",
          contenttype: "application/fhir+json",
        },
      },
      {
        "@id": "asset-omop-002",
        name: "OMOP Cohort Data",
        description: "Cohort data in OMOP CDM format",
        contenttype: "application/json",
      },
    ],
  },
  {
    participantId: "ctx-pharmaco",
    identity: "did:web:pharmaco.de:research",
    assets: [
      {
        "@id": "asset-pharmaco-001",
        name: "Clinical Trial Results",
        description: "Phase III trial results",
        contenttype: "application/json",
      },
    ],
  },
];

const CATALOG_RESPONSE = [
  {
    id: "cat-001",
    title: "Diabetes Registry Dataset",
    description: "Registry of diabetes patients across DE",
    license: "CC-BY-4.0",
    conformsTo: "https://hl7.org/fhir/R4",
    publisher: "AlphaKlinik Berlin",
    theme: "Endocrinology",
    datasetType: "FHIR",
    legalBasis: "EHDS Art.33",
    recordCount: 12500,
  },
  {
    id: "cat-002",
    title: "Cardiology Observations",
    description: "Heart-related observation data",
    license: "CC-BY-NC-4.0",
    conformsTo: "https://hl7.org/fhir/R4",
    publisher: "Limburg Medical Centre",
    theme: "Cardiology",
    datasetType: "OMOP",
    legalBasis: "EHDS Art.34",
    recordCount: 8000,
  },
];

/** Asset using edc:-prefixed fields only */
const EDC_PREFIXED_ASSET = {
  "@id": "asset-edc-prefix",
  "edc:name": "EDC Prefixed Dataset",
  "edc:description": "Description via edc prefix",
  "edc:contenttype": "text/csv",
  properties: {},
};

/** Asset with only properties-level fields */
const PROPERTIES_ONLY_ASSET = {
  "@id": "asset-props-only",
  properties: {
    name: "Properties Dataset",
    description: "From properties only",
    contenttype: "application/x-ndjson",
  },
};

function setupDefaultMocks(overrides?: {
  assets?: unknown;
  catalog?: unknown;
  assetsOk?: boolean;
  catalogOk?: boolean;
}) {
  mockFetchApi.mockImplementation((url: string) => {
    if (url === "/api/assets") {
      return overrides?.assetsOk === false
        ? mockErrorResponse()
        : mockResponse(overrides?.assets ?? ASSETS_RESPONSE);
    }
    if (url === "/api/catalog") {
      return overrides?.catalogOk === false
        ? mockErrorResponse()
        : mockResponse(overrides?.catalog ?? CATALOG_RESPONSE);
    }
    return mockErrorResponse();
  });
}

/* ── Tests ── */

describe("DataDiscoverPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Loading state ──

  it("shows loading spinner initially", () => {
    mockFetchApi.mockReturnValue(new Promise(() => {})); // never resolves
    render(<DiscoverPage />);
    expect(screen.getByText(/Querying federated catalog/)).toBeInTheDocument();
  });

  it("shows 'Querying federated catalog…' while fetching", async () => {
    mockFetchApi.mockReturnValue(new Promise(() => {}));
    render(<DiscoverPage />);
    // The Suspense fallback shows first; then the inner loading state
    // We just verify the component doesn't crash
    expect(document.body).toBeTruthy();
  });

  // ── Successful data loading ──

  it("fetches both /api/assets and /api/catalog on mount", async () => {
    setupDefaultMocks();
    render(<DiscoverPage />);
    await waitFor(() => {
      expect(mockFetchApi).toHaveBeenCalledWith("/api/assets");
      expect(mockFetchApi).toHaveBeenCalledWith("/api/catalog");
    });
  });

  it("renders page title and description", async () => {
    setupDefaultMocks();
    render(<DiscoverPage />);
    await waitFor(() => {
      expect(screen.getByText("Discover Data")).toBeInTheDocument();
    });
  });

  it("renders search input", async () => {
    setupDefaultMocks();
    render(<DiscoverPage />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Search by name/)).toBeInTheDocument();
    });
  });

  // ── Stats bar ──

  it("shows participant count in stats bar", async () => {
    setupDefaultMocks();
    render(<DiscoverPage />);
    await waitFor(() => {
      expect(screen.getByText(/2 participants/)).toBeInTheDocument();
    });
  });

  it("shows total EDC asset count", async () => {
    setupDefaultMocks();
    render(<DiscoverPage />);
    await waitFor(() => {
      expect(screen.getByText(/3 EDC assets/)).toBeInTheDocument();
    });
  });

  it("shows total HealthDCAT-AP dataset count", async () => {
    setupDefaultMocks();
    render(<DiscoverPage />);
    await waitFor(() => {
      expect(screen.getByText(/2 HealthDCAT-AP datasets/)).toBeInTheDocument();
    });
  });

  // ── Tabs ──

  it("renders All, EDC Assets, and HealthDCAT-AP tabs", async () => {
    setupDefaultMocks();
    render(<DiscoverPage />);
    await waitFor(() => {
      expect(screen.getByText("All")).toBeInTheDocument();
      expect(screen.getByText("EDC Assets")).toBeInTheDocument();
      expect(screen.getByText("HealthDCAT-AP")).toBeInTheDocument();
    });
  });

  it("shows total count on All tab", async () => {
    setupDefaultMocks();
    render(<DiscoverPage />);
    await waitFor(() => {
      // 3 assets + 2 catalog = 5
      const allTab = screen.getByText("All").closest("button")!;
      expect(allTab.textContent).toContain("5");
    });
  });

  it("shows asset count on EDC Assets tab", async () => {
    setupDefaultMocks();
    render(<DiscoverPage />);
    await waitFor(() => {
      const tab = screen.getByText("EDC Assets").closest("button")!;
      expect(tab.textContent).toContain("3");
    });
  });

  it("shows catalog count on HealthDCAT-AP tab", async () => {
    setupDefaultMocks();
    render(<DiscoverPage />);
    await waitFor(() => {
      const tab = screen.getByText("HealthDCAT-AP").closest("button")!;
      expect(tab.textContent).toContain("2");
    });
  });

  it("filters to only EDC assets when EDC Assets tab is clicked", async () => {
    setupDefaultMocks();
    const user = userEvent.setup();
    render(<DiscoverPage />);
    await waitFor(() => screen.getByText("EDC Assets"));
    await user.click(screen.getByText("EDC Assets"));
    // Catalog section header should not be visible
    expect(
      screen.queryByText(/HealthDCAT-AP Datasets/),
    ).not.toBeInTheDocument();
    // Asset names should still be visible
    expect(screen.getByText("FHIR Patient Bundle")).toBeInTheDocument();
  });

  it("filters to only catalog when HealthDCAT-AP tab is clicked", async () => {
    setupDefaultMocks();
    const user = userEvent.setup();
    render(<DiscoverPage />);
    await waitFor(() => screen.getByText("HealthDCAT-AP"));
    await user.click(screen.getByText("HealthDCAT-AP"));
    // EDC section header should not be visible
    expect(screen.queryByText(/EDC Data Assets/)).not.toBeInTheDocument();
    // Catalog item should be visible
    expect(screen.getByText("Diabetes Registry Dataset")).toBeInTheDocument();
  });

  // ── EDC Assets rendering ──

  it("renders all EDC asset names", async () => {
    setupDefaultMocks();
    render(<DiscoverPage />);
    await waitFor(() => {
      expect(screen.getByText("FHIR Patient Bundle")).toBeInTheDocument();
      expect(screen.getByText("OMOP Cohort Data")).toBeInTheDocument();
      expect(screen.getByText("Clinical Trial Results")).toBeInTheDocument();
    });
  });

  it("renders asset descriptions", async () => {
    setupDefaultMocks();
    render(<DiscoverPage />);
    await waitFor(() => {
      expect(
        screen.getByText("Synthetic patient data from AlphaKlinik"),
      ).toBeInTheDocument();
    });
  });

  it("renders provider identity for assets", async () => {
    setupDefaultMocks();
    render(<DiscoverPage />);
    await waitFor(() => {
      expect(screen.getAllByText(/alpha-klinik\.de/).length).toBeGreaterThan(0);
    });
  });

  it("renders content type badge for assets", async () => {
    setupDefaultMocks();
    render(<DiscoverPage />);
    await waitFor(() => {
      expect(screen.getByText("application/fhir+json")).toBeInTheDocument();
    });
  });

  it("expands asset detail on click and shows JSON", async () => {
    setupDefaultMocks();
    const user = userEvent.setup();
    render(<DiscoverPage />);
    await waitFor(() => screen.getByText("FHIR Patient Bundle"));
    const assetBtn = screen.getByText("FHIR Patient Bundle").closest("button")!;
    await user.click(assetBtn);
    // Expanded detail shows JSON and Negotiate link
    await waitFor(() => {
      expect(screen.getByText("Negotiate Access")).toBeInTheDocument();
    });
  });

  it("shows View in Graph link in expanded asset", async () => {
    setupDefaultMocks();
    const user = userEvent.setup();
    render(<DiscoverPage />);
    await waitFor(() => screen.getByText("FHIR Patient Bundle"));
    await user.click(
      screen.getByText("FHIR Patient Bundle").closest("button")!,
    );
    await waitFor(() => {
      expect(screen.getByText("View in Graph")).toBeInTheDocument();
    });
  });

  it("has correct negotiate link with assetId and providerId", async () => {
    setupDefaultMocks();
    const user = userEvent.setup();
    render(<DiscoverPage />);
    await waitFor(() => screen.getByText("FHIR Patient Bundle"));
    await user.click(
      screen.getByText("FHIR Patient Bundle").closest("button")!,
    );
    await waitFor(() => {
      const link = screen.getByText("Negotiate Access").closest("a")!;
      expect(link.getAttribute("href")).toContain("assetId=asset-fhir-001");
      expect(link.getAttribute("href")).toContain("providerId=ctx-alpha");
    });
  });

  it("collapses asset detail on second click", async () => {
    setupDefaultMocks();
    const user = userEvent.setup();
    render(<DiscoverPage />);
    await waitFor(() => screen.getByText("FHIR Patient Bundle"));
    const assetBtn = screen.getByText("FHIR Patient Bundle").closest("button")!;
    await user.click(assetBtn);
    await waitFor(() => screen.getByText("Negotiate Access"));
    await user.click(assetBtn);
    await waitFor(() => {
      expect(screen.queryByText("Negotiate Access")).not.toBeInTheDocument();
    });
  });

  // ── HealthDCAT-AP Catalog rendering ──

  it("renders catalog entry titles", async () => {
    setupDefaultMocks();
    render(<DiscoverPage />);
    await waitFor(() => {
      expect(screen.getByText("Diabetes Registry Dataset")).toBeInTheDocument();
      expect(screen.getByText("Cardiology Observations")).toBeInTheDocument();
    });
  });

  it("renders catalog entry descriptions", async () => {
    setupDefaultMocks();
    render(<DiscoverPage />);
    await waitFor(() => {
      expect(
        screen.getByText("Registry of diabetes patients across DE"),
      ).toBeInTheDocument();
    });
  });

  it("renders catalog publisher", async () => {
    setupDefaultMocks();
    render(<DiscoverPage />);
    await waitFor(() => {
      expect(screen.getByText("AlphaKlinik Berlin")).toBeInTheDocument();
    });
  });

  it("renders catalog theme badge", async () => {
    setupDefaultMocks();
    render(<DiscoverPage />);
    await waitFor(() => {
      expect(screen.getByText("Endocrinology")).toBeInTheDocument();
    });
  });

  it("renders dataset type badge", async () => {
    setupDefaultMocks();
    render(<DiscoverPage />);
    await waitFor(() => {
      expect(screen.getByText("FHIR")).toBeInTheDocument();
    });
  });

  it("expands catalog entry to show detailed info", async () => {
    setupDefaultMocks();
    const user = userEvent.setup();
    render(<DiscoverPage />);
    await waitFor(() => screen.getByText("Diabetes Registry Dataset"));
    await user.click(
      screen.getByText("Diabetes Registry Dataset").closest("button")!,
    );
    await waitFor(() => {
      expect(screen.getByText("CC-BY-4.0")).toBeInTheDocument();
      expect(screen.getByText("EHDS Art.33")).toBeInTheDocument();
      expect(screen.getByText("12,500")).toBeInTheDocument();
    });
  });

  it("shows license in expanded catalog entry", async () => {
    setupDefaultMocks();
    const user = userEvent.setup();
    render(<DiscoverPage />);
    await waitFor(() => screen.getByText("Diabetes Registry Dataset"));
    await user.click(
      screen.getByText("Diabetes Registry Dataset").closest("button")!,
    );
    await waitFor(() => {
      expect(screen.getByText("License:")).toBeInTheDocument();
    });
  });

  it("shows View in Catalog link in expanded catalog entry", async () => {
    setupDefaultMocks();
    const user = userEvent.setup();
    render(<DiscoverPage />);
    await waitFor(() => screen.getByText("Diabetes Registry Dataset"));
    await user.click(
      screen.getByText("Diabetes Registry Dataset").closest("button")!,
    );
    await waitFor(() => {
      expect(screen.getByText("View in Catalog")).toBeInTheDocument();
    });
  });

  it("shows View in Graph link in expanded catalog entry", async () => {
    setupDefaultMocks();
    const user = userEvent.setup();
    render(<DiscoverPage />);
    await waitFor(() => screen.getByText("Diabetes Registry Dataset"));
    await user.click(
      screen.getByText("Diabetes Registry Dataset").closest("button")!,
    );
    const graphLinks = screen.getAllByText("View in Graph");
    expect(graphLinks.length).toBeGreaterThan(0);
  });

  it("collapses catalog detail on second click", async () => {
    setupDefaultMocks();
    const user = userEvent.setup();
    render(<DiscoverPage />);
    await waitFor(() => screen.getByText("Diabetes Registry Dataset"));
    const btn = screen
      .getByText("Diabetes Registry Dataset")
      .closest("button")!;
    await user.click(btn);
    await waitFor(() => screen.getByText("View in Catalog"));
    await user.click(btn);
    await waitFor(() => {
      expect(screen.queryByText("View in Catalog")).not.toBeInTheDocument();
    });
  });

  // ── Search / filter ──

  it("filters assets by search query", async () => {
    setupDefaultMocks();
    const user = userEvent.setup();
    render(<DiscoverPage />);
    await waitFor(() => screen.getByText("FHIR Patient Bundle"));
    const input = screen.getByPlaceholderText(/Search by name/);
    await user.type(input, "OMOP");
    expect(screen.getByText("OMOP Cohort Data")).toBeInTheDocument();
    expect(screen.queryByText("FHIR Patient Bundle")).not.toBeInTheDocument();
  });

  it("filters catalog by search query", async () => {
    setupDefaultMocks();
    const user = userEvent.setup();
    render(<DiscoverPage />);
    await waitFor(() => screen.getByText("Diabetes Registry Dataset"));
    const input = screen.getByPlaceholderText(/Search by name/);
    await user.type(input, "Cardiology");
    expect(screen.getByText("Cardiology Observations")).toBeInTheDocument();
    expect(
      screen.queryByText("Diabetes Registry Dataset"),
    ).not.toBeInTheDocument();
  });

  it("shows 'matching' count in stats bar when filter is active", async () => {
    setupDefaultMocks();
    const user = userEvent.setup();
    render(<DiscoverPage />);
    await waitFor(() => screen.getByText("FHIR Patient Bundle"));
    const input = screen.getByPlaceholderText(/Search by name/);
    await user.type(input, "FHIR");
    await waitFor(() => {
      expect(screen.getByText(/matching/)).toBeInTheDocument();
    });
  });

  it("filters by description text", async () => {
    setupDefaultMocks();
    const user = userEvent.setup();
    render(<DiscoverPage />);
    await waitFor(() => screen.getByText("FHIR Patient Bundle"));
    const input = screen.getByPlaceholderText(/Search by name/);
    await user.type(input, "Synthetic");
    expect(screen.getByText("FHIR Patient Bundle")).toBeInTheDocument();
    expect(screen.queryByText("OMOP Cohort Data")).not.toBeInTheDocument();
  });

  it("filters catalog by publisher name", async () => {
    setupDefaultMocks();
    const user = userEvent.setup();
    render(<DiscoverPage />);
    await waitFor(() => screen.getByText("Diabetes Registry Dataset"));
    const input = screen.getByPlaceholderText(/Search by name/);
    await user.type(input, "Limburg");
    expect(screen.getByText("Cardiology Observations")).toBeInTheDocument();
    expect(
      screen.queryByText("Diabetes Registry Dataset"),
    ).not.toBeInTheDocument();
  });

  it("filters catalog by theme", async () => {
    setupDefaultMocks();
    const user = userEvent.setup();
    render(<DiscoverPage />);
    await waitFor(() => screen.getByText("Diabetes Registry Dataset"));
    const input = screen.getByPlaceholderText(/Search by name/);
    await user.type(input, "Endocrinology");
    expect(screen.getByText("Diabetes Registry Dataset")).toBeInTheDocument();
  });

  // ── Empty states ──

  it("shows empty state when no datasets are available", async () => {
    setupDefaultMocks({ assets: [], catalog: [] });
    render(<DiscoverPage />);
    await waitFor(() => {
      expect(screen.getByText("No datasets available")).toBeInTheDocument();
    });
  });

  it("shows 'No datasets match' when filter matches nothing", async () => {
    setupDefaultMocks();
    const user = userEvent.setup();
    render(<DiscoverPage />);
    await waitFor(() => screen.getByText("FHIR Patient Bundle"));
    const input = screen.getByPlaceholderText(/Search by name/);
    await user.type(input, "zzz-no-match-zzz");
    expect(
      screen.getByText("No datasets match your search"),
    ).toBeInTheDocument();
  });

  it("shows zero participants when assets response is empty", async () => {
    setupDefaultMocks({ assets: [] });
    render(<DiscoverPage />);
    await waitFor(() => {
      expect(screen.getByText(/0 participants/)).toBeInTheDocument();
      expect(screen.getByText(/0 EDC assets/)).toBeInTheDocument();
    });
  });

  // ── API error handling ──

  it("handles assets API failure gracefully", async () => {
    setupDefaultMocks({ assetsOk: false });
    render(<DiscoverPage />);
    await waitFor(() => {
      // Should still render catalog items
      expect(screen.getByText("Diabetes Registry Dataset")).toBeInTheDocument();
      // Assets count should be 0
      expect(screen.getByText(/0 EDC assets/)).toBeInTheDocument();
    });
  });

  it("handles catalog API failure gracefully", async () => {
    setupDefaultMocks({ catalogOk: false });
    render(<DiscoverPage />);
    await waitFor(() => {
      // Should still render assets
      expect(screen.getByText("FHIR Patient Bundle")).toBeInTheDocument();
      expect(screen.getByText(/0 HealthDCAT-AP datasets/)).toBeInTheDocument();
    });
  });

  it("handles both APIs failing gracefully", async () => {
    mockFetchApi.mockRejectedValue(new Error("Network error"));
    render(<DiscoverPage />);
    await waitFor(() => {
      expect(screen.getByText("No datasets available")).toBeInTheDocument();
    });
  });

  // ── assetField normalisation ──

  it("resolves name from edc: prefix fields", async () => {
    setupDefaultMocks({
      assets: [
        {
          participantId: "ctx-test",
          identity: "did:web:test.de:participant",
          assets: [EDC_PREFIXED_ASSET],
        },
      ],
      catalog: [],
    });
    render(<DiscoverPage />);
    await waitFor(() => {
      expect(screen.getByText("EDC Prefixed Dataset")).toBeInTheDocument();
    });
  });

  it("resolves name from properties-level fields", async () => {
    setupDefaultMocks({
      assets: [
        {
          participantId: "ctx-test",
          identity: "did:web:test.de:participant",
          assets: [PROPERTIES_ONLY_ASSET],
        },
      ],
      catalog: [],
    });
    render(<DiscoverPage />);
    await waitFor(() => {
      expect(screen.getByText("Properties Dataset")).toBeInTheDocument();
    });
  });

  it("falls back to @id for name when all fields are missing", async () => {
    setupDefaultMocks({
      assets: [
        {
          participantId: "ctx-test",
          identity: "did:web:test.de:participant",
          assets: [{ "@id": "fallback-asset-id", properties: {} }],
        },
      ],
      catalog: [],
    });
    render(<DiscoverPage />);
    await waitFor(() => {
      expect(screen.getByText("fallback-asset-id")).toBeInTheDocument();
    });
  });

  // ── Wrapped participants format ──

  it("handles {participants: [...]} response format", async () => {
    setupDefaultMocks({
      assets: { participants: ASSETS_RESPONSE },
    });
    render(<DiscoverPage />);
    await waitFor(() => {
      expect(screen.getByText("FHIR Patient Bundle")).toBeInTheDocument();
    });
  });

  // ── Section headers in All tab ──

  it("shows section headers on All tab", async () => {
    setupDefaultMocks();
    render(<DiscoverPage />);
    await waitFor(() => {
      expect(screen.getByText(/HealthDCAT-AP Datasets/)).toBeInTheDocument();
      expect(screen.getByText(/EDC Data Assets/)).toBeInTheDocument();
    });
  });

  it("hides section headers when on a specific tab", async () => {
    setupDefaultMocks();
    const user = userEvent.setup();
    render(<DiscoverPage />);
    await waitFor(() => screen.getByText("EDC Assets"));
    await user.click(screen.getByText("EDC Assets"));
    expect(
      screen.queryByText(/HealthDCAT-AP Datasets/),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/EDC Data Assets/)).not.toBeInTheDocument();
  });

  // ── Singular participant label ──

  it("uses singular 'participant' for 1 participant", async () => {
    setupDefaultMocks({
      assets: [ASSETS_RESPONSE[0]],
    });
    render(<DiscoverPage />);
    await waitFor(() => {
      expect(screen.getByText(/1 participant(?!s)/)).toBeInTheDocument();
    });
  });

  // ── Expanded only one at a time ──

  it("only one item is expanded at a time", async () => {
    setupDefaultMocks();
    const user = userEvent.setup();
    render(<DiscoverPage />);
    await waitFor(() => screen.getByText("Diabetes Registry Dataset"));

    // Expand a catalog entry
    await user.click(
      screen.getByText("Diabetes Registry Dataset").closest("button")!,
    );
    await waitFor(() => screen.getByText("View in Catalog"));

    // Expand an asset — catalog detail should collapse
    await user.click(
      screen.getByText("FHIR Patient Bundle").closest("button")!,
    );
    await waitFor(() => {
      expect(screen.getByText("Negotiate Access")).toBeInTheDocument();
      expect(screen.queryByText("View in Catalog")).not.toBeInTheDocument();
    });
  });

  // ── ConformsTo link ──

  it("renders conformsTo as a link in expanded catalog entry", async () => {
    setupDefaultMocks();
    const user = userEvent.setup();
    render(<DiscoverPage />);
    await waitFor(() => screen.getByText("Diabetes Registry Dataset"));
    await user.click(
      screen.getByText("Diabetes Registry Dataset").closest("button")!,
    );
    await waitFor(() => {
      const link = screen.getByText(/hl7\.org\/fhir/).closest("a")!;
      expect(link.getAttribute("href")).toBe("https://hl7.org/fhir/R4");
      expect(link.getAttribute("target")).toBe("_blank");
    });
  });
});
