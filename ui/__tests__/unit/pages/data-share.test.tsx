/**
 * Comprehensive tests for the Data Share page.
 *
 * Covers: loading state, participant selection, existing assets tab,
 * empty state, asset cards with correct info, asset detail panel with
 * Details/Raw JSON/FHIR view modes, create asset tab & form,
 * form submission & success/error, copy JSON, API error handling,
 * edc: prefix field normalization, and FHIR bundle loading.
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

import SharePage from "@/app/data/share/page";

function mockResponse(data: unknown, ok = true) {
  return Promise.resolve({ json: () => Promise.resolve(data), ok });
}

function mockErrorResponse(status = 500) {
  return Promise.resolve({
    json: () => Promise.resolve({ error: "Server error" }),
    ok: false,
    status,
  });
}

/* ── Test data ── */

const PARTICIPANTS = [
  {
    "@id": "ctx-alpha",
    identity: "did:web:alpha-klinik.de:participant",
    state: "ACTIVE",
  },
  {
    "@id": "ctx-pharmaco",
    identity: "did:web:pharmaco.de:research",
    state: "ACTIVE",
  },
];

const ASSETS_RESPONSE = [
  {
    participantId: "ctx-alpha",
    identity: "did:web:alpha-klinik.de:participant",
    assets: [
      {
        "@id": "asset-fhir-001",
        "@type": "Asset",
        name: "FHIR Patient Bundle",
        description: "Synthetic patient data from AlphaKlinik",
        contenttype: "application/fhir+json",
        properties: {
          name: "FHIR Patient Bundle",
          description: "Synthetic patient data from AlphaKlinik",
          contenttype: "application/fhir+json",
          version: "1.0",
          publisher: "AlphaKlinik Berlin",
        },
      },
      {
        "@id": "asset-omop-002",
        "@type": "Asset",
        name: "OMOP Cohort Data",
        description: "Cohort data in OMOP CDM format",
        contenttype: "application/json",
        properties: {
          name: "OMOP Cohort Data",
          contenttype: "application/json",
        },
      },
    ],
  },
];

/** Asset that only uses edc:-prefixed fields (no top-level name/description) */
const EDC_PREFIXED_ASSET = {
  "@id": "asset-edc-prefix",
  "@type": "Asset",
  "edc:name": "EDC Prefixed Dataset",
  "edc:description": "Description via edc prefix",
  "edc:contenttype": "text/csv",
  properties: {},
};

/** Asset with only properties-level fields */
const PROPERTIES_ONLY_ASSET = {
  "@id": "asset-props-only",
  "@type": "Asset",
  properties: {
    name: "Properties Dataset",
    description: "From properties only",
    contenttype: "application/x-ndjson",
    customField: "custom-value",
  },
};

const FHIR_BUNDLE = {
  resourceType: "Bundle",
  type: "searchset",
  total: 2,
  entry: [
    {
      resource: {
        resourceType: "Patient",
        id: "p-001",
        name: [{ family: "Mustermann", given: ["Max"] }],
      },
    },
  ],
};

/* ── Helpers ── */

function setupDefaultMocks(overrides?: {
  participants?: unknown;
  assets?: unknown;
  participantsOk?: boolean;
  assetsOk?: boolean;
}) {
  mockFetchApi.mockImplementation((url: string, options?: RequestInit) => {
    if (url === "/api/participants") {
      return mockResponse(
        overrides?.participants ?? PARTICIPANTS,
        overrides?.participantsOk ?? true,
      );
    }
    if (url === "/api/assets" && options?.method === "POST") {
      return mockResponse({ "@id": "asset-new", state: "CREATED" });
    }
    if (url.startsWith("/api/assets")) {
      return mockResponse(
        overrides?.assets ?? ASSETS_RESPONSE,
        overrides?.assetsOk ?? true,
      );
    }
    return mockResponse({});
  });
}

/* ── Tests ── */

describe("DataSharePage", () => {
  beforeEach(() => {
    mockFetchApi.mockReset();
    vi.restoreAllMocks();
  });

  /* ─── 1. Renders page heading ─── */
  it("renders the page title", async () => {
    setupDefaultMocks();
    render(<SharePage />);
    await waitFor(() => {
      expect(screen.getByText("Share Data")).toBeInTheDocument();
    });
  });

  it("renders the page description", async () => {
    setupDefaultMocks();
    render(<SharePage />);
    await waitFor(() => {
      expect(
        screen.getByText(/Register data assets for sharing/),
      ).toBeInTheDocument();
    });
  });

  /* ─── 2. Loading state ─── */
  it("shows loading state while data is being fetched", () => {
    mockFetchApi.mockReturnValue(new Promise(() => {})); // never resolves
    render(<SharePage />);
    expect(screen.getByText(/Loading assets/)).toBeInTheDocument();
  });

  /* ─── 3. Loads participants into selector ─── */
  it("loads participants and populates the context selector", async () => {
    setupDefaultMocks();
    const user = userEvent.setup();
    render(<SharePage />);

    // Switch to Create tab to see participant selector
    await waitFor(() => {
      expect(screen.getByText("Register New")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Register New"));

    await waitFor(() => {
      expect(screen.getByText("Participant Context")).toBeInTheDocument();
    });
    // Participant identities are displayed with did:web: prefix stripped
    expect(screen.getByText("alpha-klinik.de:participant")).toBeInTheDocument();
    expect(screen.getByText("pharmaco.de:research")).toBeInTheDocument();
  });

  /* ─── 4. Shows existing assets tab ─── */
  it("shows the My Assets tab as default active tab", async () => {
    setupDefaultMocks();
    render(<SharePage />);
    await waitFor(() => {
      expect(screen.getByText("My Assets")).toBeInTheDocument();
    });
    expect(screen.getByText("Register New")).toBeInTheDocument();
  });

  /* ─── 5. Shows empty state when no assets ─── */
  it("shows empty state when there are no assets", async () => {
    setupDefaultMocks({
      assets: [
        {
          participantId: "ctx-alpha",
          identity: "did:web:alpha-klinik.de:participant",
          assets: [],
        },
      ],
    });
    render(<SharePage />);
    await waitFor(() => {
      expect(
        screen.getByText("No data assets registered yet"),
      ).toBeInTheDocument();
    });
    expect(screen.getByText("Register your first asset →")).toBeInTheDocument();
  });

  it("clicking empty state link switches to create tab", async () => {
    setupDefaultMocks({
      assets: [{ participantId: "ctx-alpha", assets: [] }],
    });
    const user = userEvent.setup();
    render(<SharePage />);
    await waitFor(() => {
      expect(
        screen.getByText("Register your first asset →"),
      ).toBeInTheDocument();
    });
    await user.click(screen.getByText("Register your first asset →"));
    await waitFor(() => {
      expect(screen.getByText("Register Data Asset")).toBeInTheDocument();
    });
  });

  /* ─── 6. Renders asset cards with correct info ─── */
  it("renders asset cards with names and descriptions", async () => {
    setupDefaultMocks();
    render(<SharePage />);
    await waitFor(() => {
      expect(screen.getByText("FHIR Patient Bundle")).toBeInTheDocument();
    });
    expect(screen.getByText("OMOP Cohort Data")).toBeInTheDocument();
    expect(
      screen.getByText("Synthetic patient data from AlphaKlinik"),
    ).toBeInTheDocument();
  });

  it("renders content type badges on asset cards", async () => {
    setupDefaultMocks();
    render(<SharePage />);
    await waitFor(() => {
      expect(screen.getByText("application/fhir+json")).toBeInTheDocument();
    });
    expect(screen.getByText("application/json")).toBeInTheDocument();
  });

  /* ─── 7. Asset detail panel with view modes ─── */
  it("expands asset detail panel on click", async () => {
    setupDefaultMocks();
    const user = userEvent.setup();
    render(<SharePage />);

    await waitFor(() => {
      expect(screen.getByText("FHIR Patient Bundle")).toBeInTheDocument();
    });

    // Click to expand asset
    await user.click(screen.getByText("FHIR Patient Bundle"));

    await waitFor(() => {
      expect(
        screen.getByText(/Asset Details — FHIR Patient Bundle/),
      ).toBeInTheDocument();
    });
    // Should show asset ID
    expect(screen.getByText("asset-fhir-001")).toBeInTheDocument();
  });

  it("shows Details, Raw JSON, and FHIR Viewer tabs for fhir assets", async () => {
    setupDefaultMocks();
    const user = userEvent.setup();
    render(<SharePage />);

    await waitFor(() => {
      expect(screen.getByText("FHIR Patient Bundle")).toBeInTheDocument();
    });
    await user.click(screen.getByText("FHIR Patient Bundle"));

    await waitFor(() => {
      expect(screen.getByText("Details")).toBeInTheDocument();
    });
    expect(screen.getByText("Raw JSON")).toBeInTheDocument();
    // FHIR Viewer tab appears because contenttype includes "fhir"
    expect(screen.getByText("FHIR Viewer")).toBeInTheDocument();
  });

  it("does not show FHIR Viewer tab for non-FHIR assets", async () => {
    setupDefaultMocks();
    const user = userEvent.setup();
    render(<SharePage />);

    await waitFor(() => {
      expect(screen.getByText("OMOP Cohort Data")).toBeInTheDocument();
    });
    await user.click(screen.getByText("OMOP Cohort Data"));

    await waitFor(() => {
      expect(screen.getByText("Details")).toBeInTheDocument();
    });
    expect(screen.getByText("Raw JSON")).toBeInTheDocument();
    expect(screen.queryByText("FHIR Viewer")).not.toBeInTheDocument();
  });

  it("shows Raw JSON view when clicking Raw JSON tab", async () => {
    setupDefaultMocks();
    const user = userEvent.setup();
    render(<SharePage />);

    await waitFor(() => {
      expect(screen.getByText("FHIR Patient Bundle")).toBeInTheDocument();
    });
    await user.click(screen.getByText("FHIR Patient Bundle"));
    await waitFor(() => {
      expect(screen.getByText("Raw JSON")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Raw JSON"));
    // In JSON view, the JsonNode component renders keys from the asset
    await waitFor(() => {
      expect(screen.getByText("@id")).toBeInTheDocument();
    });
  });

  it("shows metadata fields in Details view", async () => {
    setupDefaultMocks();
    const user = userEvent.setup();
    render(<SharePage />);

    await waitFor(() => {
      expect(screen.getByText("FHIR Patient Bundle")).toBeInTheDocument();
    });
    await user.click(screen.getByText("FHIR Patient Bundle"));

    await waitFor(() => {
      expect(screen.getByText("Asset ID")).toBeInTheDocument();
    });
    expect(screen.getByText("Type")).toBeInTheDocument();
    expect(screen.getByText("Content Type")).toBeInTheDocument();
    // "Properties" appears both as a summary field and as a section header
    expect(screen.getAllByText("Properties").length).toBeGreaterThanOrEqual(1);
  });

  it("shows description in detail panel", async () => {
    setupDefaultMocks();
    const user = userEvent.setup();
    render(<SharePage />);

    await waitFor(() => {
      expect(screen.getByText("FHIR Patient Bundle")).toBeInTheDocument();
    });
    await user.click(screen.getByText("FHIR Patient Bundle"));

    await waitFor(() => {
      expect(screen.getByText("Description")).toBeInTheDocument();
    });
  });

  it("shows View in Graph link", async () => {
    setupDefaultMocks();
    const user = userEvent.setup();
    render(<SharePage />);

    await waitFor(() => {
      expect(screen.getByText("FHIR Patient Bundle")).toBeInTheDocument();
    });
    await user.click(screen.getByText("FHIR Patient Bundle"));

    await waitFor(() => {
      expect(screen.getByText(/View in Graph/)).toBeInTheDocument();
    });
  });

  it("collapses asset detail panel on second click", async () => {
    setupDefaultMocks();
    const user = userEvent.setup();
    render(<SharePage />);

    await waitFor(() => {
      expect(screen.getByText("FHIR Patient Bundle")).toBeInTheDocument();
    });

    // Expand
    await user.click(screen.getByText("FHIR Patient Bundle"));
    await waitFor(() => {
      expect(
        screen.getByText(/Asset Details — FHIR Patient Bundle/),
      ).toBeInTheDocument();
    });

    // Collapse
    await user.click(screen.getByText("FHIR Patient Bundle"));
    await waitFor(() => {
      expect(
        screen.queryByText(/Asset Details — FHIR Patient Bundle/),
      ).not.toBeInTheDocument();
    });
  });

  /* ─── 8. Create Asset tab and form rendering ─── */
  it("switches to Register New tab and shows form", async () => {
    setupDefaultMocks();
    const user = userEvent.setup();
    render(<SharePage />);

    await waitFor(() => {
      expect(screen.getByText("Register New")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Register New"));

    await waitFor(() => {
      expect(screen.getByText("Register Data Asset")).toBeInTheDocument();
    });
    expect(screen.getByText("Participant Context")).toBeInTheDocument();
    expect(screen.getByText("Asset Name")).toBeInTheDocument();
    expect(screen.getByText("Content Type")).toBeInTheDocument();
    expect(screen.getByText("Description")).toBeInTheDocument();
    expect(screen.getByText("Data Source URL")).toBeInTheDocument();
    expect(screen.getByText("Register Asset")).toBeInTheDocument();
  });

  it("shows content type dropdown with FHIR, JSON, CSV, NDJSON options", async () => {
    setupDefaultMocks();
    const user = userEvent.setup();
    render(<SharePage />);

    await waitFor(() => {
      expect(screen.getByText("Register New")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Register New"));

    await waitFor(() => {
      expect(
        screen.getByText("FHIR R4 (application/fhir+json)"),
      ).toBeInTheDocument();
    });
    // Other options are in the select but may not be visible as text — check by role
    const contentTypeSelect = screen.getAllByRole("combobox")[1]; // second select after participant
    const options = within(contentTypeSelect).getAllByRole("option");
    const optionValues = options.map((o) => o.getAttribute("value"));
    expect(optionValues).toContain("application/fhir+json");
    expect(optionValues).toContain("application/json");
    expect(optionValues).toContain("text/csv");
    expect(optionValues).toContain("application/x-ndjson");
  });

  /* ─── 9. Create asset form submission ─── */
  it("submits the create form and shows success message", async () => {
    setupDefaultMocks();
    const user = userEvent.setup();
    render(<SharePage />);

    // Navigate to create tab
    await waitFor(() => {
      expect(screen.getByText("Register New")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Register New"));

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText("e.g. fhir-patient-cohort"),
      ).toBeInTheDocument();
    });

    // Fill in required fields
    await user.type(
      screen.getByPlaceholderText("e.g. fhir-patient-cohort"),
      "test-cohort-asset",
    );
    await user.type(
      screen.getByPlaceholderText("Describe the dataset…"),
      "Test description for cohort",
    );
    await user.type(
      screen.getByPlaceholderText("https://fhir-server/Patient"),
      "https://example.com/fhir/Patient",
    );

    // Submit
    await user.click(screen.getByText("Register Asset"));

    await waitFor(() => {
      expect(
        screen.getByText("Asset created successfully!"),
      ).toBeInTheDocument();
    });

    // Verify POST was called with correct payload
    const postCall = mockFetchApi.mock.calls.find(
      (c: unknown[]) =>
        c[0] === "/api/assets" && (c[1] as RequestInit)?.method === "POST",
    );
    expect(postCall).toBeDefined();
    const body = JSON.parse((postCall![1] as RequestInit).body as string);
    expect(body.name).toBe("test-cohort-asset");
    expect(body.description).toBe("Test description for cohort");
    expect(body.baseUrl).toBe("https://example.com/fhir/Patient");
    expect(body.participantId).toBe("ctx-alpha");
  });

  it("shows error message when asset creation fails", async () => {
    mockFetchApi.mockImplementation((url: string, options?: RequestInit) => {
      if (url === "/api/participants") return mockResponse(PARTICIPANTS);
      if (url === "/api/assets" && options?.method === "POST") {
        return mockResponse({ error: "Conflict: asset already exists" }, false);
      }
      if (url.startsWith("/api/assets")) return mockResponse(ASSETS_RESPONSE);
      return mockResponse({});
    });
    const user = userEvent.setup();
    render(<SharePage />);

    await waitFor(() => {
      expect(screen.getByText("Register New")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Register New"));

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText("e.g. fhir-patient-cohort"),
      ).toBeInTheDocument();
    });

    await user.type(
      screen.getByPlaceholderText("e.g. fhir-patient-cohort"),
      "duplicate-asset",
    );
    await user.click(screen.getByText("Register Asset"));

    await waitFor(() => {
      expect(
        screen.getByText("Error: Conflict: asset already exists"),
      ).toBeInTheDocument();
    });
  });

  it("shows generic error when create request throws", async () => {
    mockFetchApi.mockImplementation((url: string, options?: RequestInit) => {
      if (url === "/api/participants") return mockResponse(PARTICIPANTS);
      if (url === "/api/assets" && options?.method === "POST") {
        return Promise.reject(new Error("Network error"));
      }
      if (url.startsWith("/api/assets")) return mockResponse(ASSETS_RESPONSE);
      return mockResponse({});
    });
    const user = userEvent.setup();
    render(<SharePage />);

    await waitFor(() => {
      expect(screen.getByText("Register New")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Register New"));

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText("e.g. fhir-patient-cohort"),
      ).toBeInTheDocument();
    });

    await user.type(
      screen.getByPlaceholderText("e.g. fhir-patient-cohort"),
      "will-fail",
    );
    await user.click(screen.getByText("Register Asset"));

    await waitFor(() => {
      expect(
        screen.getByText("Error: Failed to create asset"),
      ).toBeInTheDocument();
    });
  });

  /* ─── 10. Copy JSON button ─── */
  it("copies asset JSON to clipboard", async () => {
    setupDefaultMocks();
    const user = userEvent.setup();

    // Spy on navigator.clipboard.writeText
    const writeTextSpy = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined);

    render(<SharePage />);

    await waitFor(() => {
      expect(screen.getByText("FHIR Patient Bundle")).toBeInTheDocument();
    });
    await user.click(screen.getByText("FHIR Patient Bundle"));

    await waitFor(() => {
      expect(screen.getByText("Copy")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Copy"));

    await waitFor(() => {
      expect(writeTextSpy).toHaveBeenCalledTimes(1);
    });
    const copied = JSON.parse(writeTextSpy.mock.calls[0][0]);
    expect(copied["@id"]).toBe("asset-fhir-001");

    // Should show "Copied!" feedback
    expect(screen.getByText("Copied!")).toBeInTheDocument();

    writeTextSpy.mockRestore();
  });

  /* ─── 11. API error handling ─── */
  it("handles participants API failure gracefully", async () => {
    setupDefaultMocks({ participantsOk: false, participants: [] });
    render(<SharePage />);
    // Should still finish loading (empty state or assets shown)
    await waitFor(() => {
      expect(screen.queryByText(/Loading assets/)).not.toBeInTheDocument();
    });
  });

  it("handles assets API failure gracefully", async () => {
    setupDefaultMocks({ assetsOk: false, assets: [] });
    render(<SharePage />);
    await waitFor(() => {
      expect(screen.queryByText(/Loading assets/)).not.toBeInTheDocument();
    });
    // Should show empty state since no assets could be loaded
    expect(
      screen.getByText("No data assets registered yet"),
    ).toBeInTheDocument();
  });

  it("handles both APIs failing", async () => {
    mockFetchApi.mockImplementation(() =>
      Promise.reject(new Error("Network offline")),
    );
    render(<SharePage />);
    // catch() sets loading false so we exit loading state
    await waitFor(() => {
      expect(screen.queryByText(/Loading assets/)).not.toBeInTheDocument();
    });
  });

  /* ─── 12. edc: prefix field normalization ─── */
  it("displays name from edc:name when top-level name is absent", async () => {
    mockFetchApi.mockImplementation((url: string) => {
      if (url === "/api/participants") return mockResponse(PARTICIPANTS);
      if (url.startsWith("/api/assets")) {
        return mockResponse([
          {
            participantId: "ctx-alpha",
            assets: [EDC_PREFIXED_ASSET],
          },
        ]);
      }
      return mockResponse({});
    });
    render(<SharePage />);

    await waitFor(() => {
      expect(screen.getByText("EDC Prefixed Dataset")).toBeInTheDocument();
    });
    expect(screen.getByText("Description via edc prefix")).toBeInTheDocument();
    expect(screen.getByText("text/csv")).toBeInTheDocument();
  });

  it("falls back to properties.name when both top-level and edc: are absent", async () => {
    mockFetchApi.mockImplementation((url: string) => {
      if (url === "/api/participants") return mockResponse(PARTICIPANTS);
      if (url.startsWith("/api/assets")) {
        return mockResponse([
          {
            participantId: "ctx-alpha",
            assets: [PROPERTIES_ONLY_ASSET],
          },
        ]);
      }
      return mockResponse({});
    });
    render(<SharePage />);

    await waitFor(() => {
      expect(screen.getByText("Properties Dataset")).toBeInTheDocument();
    });
    expect(screen.getByText("From properties only")).toBeInTheDocument();
    expect(screen.getByText("application/x-ndjson")).toBeInTheDocument();
  });

  it("falls back to @id when no name fields exist", async () => {
    const bareAsset = { "@id": "asset-bare-id", "@type": "Asset" };
    mockFetchApi.mockImplementation((url: string) => {
      if (url === "/api/participants") return mockResponse(PARTICIPANTS);
      if (url.startsWith("/api/assets")) {
        return mockResponse([
          { participantId: "ctx-alpha", assets: [bareAsset] },
        ]);
      }
      return mockResponse({});
    });
    render(<SharePage />);

    await waitFor(() => {
      expect(screen.getByText("asset-bare-id")).toBeInTheDocument();
    });
  });

  /* ─── 13. FHIR bundle loading for asset preview ─── */
  it("loads FHIR bundle when clicking FHIR Viewer tab", async () => {
    setupDefaultMocks();
    const user = userEvent.setup();

    // Mock global fetch for the /mock/fhir_bundles.json endpoint
    const globalFetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation((input) => {
        const url = typeof input === "string" ? input : (input as Request).url;
        if (url === "/mock/fhir_bundles.json") {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                "asset-fhir-001": FHIR_BUNDLE,
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            ),
          );
        }
        return Promise.resolve(new Response("{}", { status: 404 }));
      });

    render(<SharePage />);

    await waitFor(() => {
      expect(screen.getByText("FHIR Patient Bundle")).toBeInTheDocument();
    });
    await user.click(screen.getByText("FHIR Patient Bundle"));

    await waitFor(() => {
      expect(screen.getByText("FHIR Viewer")).toBeInTheDocument();
    });

    await user.click(screen.getByText("FHIR Viewer"));

    // Wait for FHIR bundle loading to complete — the FhirResourceViewer renders
    await waitFor(() => {
      expect(
        screen.queryByText("Loading FHIR bundle…"),
      ).not.toBeInTheDocument();
    });

    globalFetchSpy.mockRestore();
  });

  it("shows loading state while FHIR bundle is being fetched", async () => {
    setupDefaultMocks();
    const user = userEvent.setup();

    // Mock global fetch to hang on FHIR bundle request
    const globalFetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() => new Promise(() => {}));

    render(<SharePage />);

    await waitFor(() => {
      expect(screen.getByText("FHIR Patient Bundle")).toBeInTheDocument();
    });
    await user.click(screen.getByText("FHIR Patient Bundle"));

    await waitFor(() => {
      expect(screen.getByText("FHIR Viewer")).toBeInTheDocument();
    });
    await user.click(screen.getByText("FHIR Viewer"));

    await waitFor(() => {
      expect(screen.getByText("Loading FHIR bundle…")).toBeInTheDocument();
    });

    globalFetchSpy.mockRestore();
  });

  it("shows fallback message when no FHIR bundle available", async () => {
    setupDefaultMocks();
    const user = userEvent.setup();

    const globalFetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({}), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      );

    render(<SharePage />);

    await waitFor(() => {
      expect(screen.getByText("FHIR Patient Bundle")).toBeInTheDocument();
    });
    await user.click(screen.getByText("FHIR Patient Bundle"));

    await waitFor(() => {
      expect(screen.getByText("FHIR Viewer")).toBeInTheDocument();
    });
    await user.click(screen.getByText("FHIR Viewer"));

    await waitFor(() => {
      expect(
        screen.getByText("No FHIR bundle data available for this asset."),
      ).toBeInTheDocument();
    });

    globalFetchSpy.mockRestore();
  });

  /* ─── Detail panel: Properties display ─── */
  it("shows nested properties in detail panel", async () => {
    mockFetchApi.mockImplementation((url: string) => {
      if (url === "/api/participants") return mockResponse(PARTICIPANTS);
      if (url.startsWith("/api/assets")) {
        return mockResponse([
          { participantId: "ctx-alpha", assets: [PROPERTIES_ONLY_ASSET] },
        ]);
      }
      return mockResponse({});
    });
    const user = userEvent.setup();
    render(<SharePage />);

    await waitFor(() => {
      expect(screen.getByText("Properties Dataset")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Properties Dataset"));

    await waitFor(() => {
      expect(screen.getByText("asset-props-only")).toBeInTheDocument();
    });
    // "customField" is a non-standard property that should appear in Properties section
    expect(screen.getByText("customField:")).toBeInTheDocument();
    expect(screen.getByText("custom-value")).toBeInTheDocument();
  });

  it("shows properties field count in detail panel", async () => {
    setupDefaultMocks();
    const user = userEvent.setup();
    render(<SharePage />);

    await waitFor(() => {
      expect(screen.getByText("FHIR Patient Bundle")).toBeInTheDocument();
    });
    await user.click(screen.getByText("FHIR Patient Bundle"));

    await waitFor(() => {
      // The FHIR asset has 5 properties fields
      expect(screen.getByText("5 fields")).toBeInTheDocument();
    });
  });

  /* ─── Participants wrapped in object format ─── */
  it("handles participants wrapped in { participants: [...] }", async () => {
    mockFetchApi.mockImplementation((url: string) => {
      if (url === "/api/participants") {
        return mockResponse({ participants: PARTICIPANTS });
      }
      if (url.startsWith("/api/assets")) {
        return mockResponse({ participants: ASSETS_RESPONSE });
      }
      return mockResponse({});
    });
    const user = userEvent.setup();
    render(<SharePage />);

    // Should still work — switch to create tab to verify participants loaded
    await waitFor(() => {
      expect(screen.getByText("Register New")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Register New"));

    await waitFor(() => {
      expect(
        screen.getByText("alpha-klinik.de:participant"),
      ).toBeInTheDocument();
    });
  });

  /* ─── Navigation links ─── */
  it("renders prev/next workflow navigation links", async () => {
    setupDefaultMocks();
    render(<SharePage />);
    await waitFor(() => {
      expect(screen.getByText("Verifiable Credentials")).toBeInTheDocument();
    });
    expect(screen.getByText("Discover Data")).toBeInTheDocument();
  });
});
