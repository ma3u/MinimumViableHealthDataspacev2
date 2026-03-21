/**
 * Comprehensive tests for the Data Transfer page.
 *
 * Covers: loading state, participant selection, transfer list with DSP pipeline,
 * agreement-based transfer initiation, FHIR bundle viewer, error handling,
 * edc: prefix field normalization, and DID resolution.
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

import DataTransferPage from "@/app/data/transfer/page";

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
    displayName: "AlphaKlinik Berlin",
    role: "DATA_HOLDER",
  },
  {
    "@id": "ctx-pharmaco",
    identity: "did:web:pharmaco.de:research",
    displayName: "PharmaCo Research AG",
    role: "DATA_USER",
  },
];

const NEGOTIATIONS_FINALIZED = [
  {
    "@id": "neg-1",
    "edc:state": "FINALIZED",
    "edc:contractAgreementId": "agr-001",
    "edc:assetId": "fhir-patient-bundle",
    "edc:counterPartyId": "did:web:alpha-klinik.de:participant",
    counterPartyAddress: "http://controlplane:8082/api/dsp",
  },
  {
    "@id": "neg-2",
    "edc:state": "FINALIZED",
    "edc:contractAgreementId": "agr-002",
    "edc:assetId": "omop-cohort-data",
    "edc:counterPartyId": "did:web:pharmaco.de:research",
    counterPartyAddress: "http://controlplane:8082/api/dsp",
  },
];

const TRANSFERS = [
  {
    "@id": "tp-001",
    "edc:state": "COMPLETED",
    "edc:assetId": "fhir-patient-bundle",
    "edc:contractId": "agr-001",
    "edc:transferType": "HttpData-PULL",
    "edc:stateTimestamp": 1700000000000,
    dataPayload: {
      resourceType: "Bundle",
      type: "searchset",
      total: 42,
      containedResourceTypes: ["Patient", "Observation", "Condition"],
      provider: "AlphaKlinik",
      transferredAt: "2024-11-14T10:00:00Z",
      sizeBytes: 51200,
    },
  },
  {
    "@id": "tp-002",
    "edc:state": "STARTED",
    "edc:assetId": "omop-cohort-data",
    "edc:contractId": "agr-002",
    "edc:transferType": "HttpData-PULL",
    "edc:stateTimestamp": 1700001000000,
  },
];

const TRANSFER_REQUESTED = {
  "@id": "tp-003",
  "edc:state": "REQUESTED",
  "edc:assetId": "fhir-patient-bundle",
  "edc:contractId": "agr-001",
  "edc:transferType": "HttpData-PULL",
};

const TRANSFER_TERMINATED = {
  "@id": "tp-004",
  "edc:state": "TERMINATED",
  "edc:assetId": "fhir-patient-bundle",
  "edc:contractId": "agr-001",
};

/* ── Helpers ── */

/**
 * Mock `fetchApi` to return appropriate data for each URL pattern.
 * Accepts optional overrides per endpoint.
 */
function setupDefaultMocks(overrides?: {
  participants?: unknown;
  negotiations?: unknown;
  transfers?: unknown;
}) {
  mockFetchApi.mockImplementation((url: string) => {
    if (url === "/api/participants") {
      return mockResponse(overrides?.participants ?? PARTICIPANTS);
    }
    if (url.startsWith("/api/transfers") && !url.includes("participantId")) {
      // POST for initiating transfer
      return mockResponse({ "@id": "tp-new", state: "REQUESTED" });
    }
    if (url.startsWith("/api/transfers")) {
      return mockResponse(overrides?.transfers ?? TRANSFERS);
    }
    if (url.startsWith("/api/negotiations")) {
      return mockResponse(overrides?.negotiations ?? NEGOTIATIONS_FINALIZED);
    }
    return mockResponse({});
  });
}

/* ── Tests ── */

describe("DataTransferPage", () => {
  beforeEach(() => {
    mockFetchApi.mockReset();
    // Reset global fetch mock for FHIR bundles
    vi.restoreAllMocks();
  });

  /* ─── 1. Renders heading/title ─── */
  it("renders the page title", async () => {
    setupDefaultMocks();
    render(<DataTransferPage />);
    await waitFor(() => {
      expect(screen.getByText("Data Transfers")).toBeInTheDocument();
    });
  });

  /* ─── 2. Shows loading state initially ─── */
  it("shows loading state while data is being fetched", () => {
    mockFetchApi.mockReturnValue(new Promise(() => {})); // never resolves
    render(<DataTransferPage />);
    expect(screen.getByText(/Loading/)).toBeInTheDocument();
  });

  /* ─── 3. Loads and displays participants ─── */
  it("loads participants into the selector", async () => {
    setupDefaultMocks();
    render(<DataTransferPage />);
    await waitFor(() => {
      expect(
        screen.getByText(/AlphaKlinik Berlin \[DATA_HOLDER\]/),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByText(/PharmaCo Research AG \[DATA_USER\]/),
    ).toBeInTheDocument();
  });

  it("shows the participant selector label", async () => {
    setupDefaultMocks();
    render(<DataTransferPage />);
    await waitFor(() => {
      expect(
        screen.getByText(/Requesting as \(your participant\)/),
      ).toBeInTheDocument();
    });
  });

  /* ─── 4. Shows empty state when no transfers exist ─── */
  it("shows empty state message when there are no transfers", async () => {
    setupDefaultMocks({ transfers: [], negotiations: [] });
    render(<DataTransferPage />);
    await waitFor(() => {
      expect(
        screen.getByText(
          /No transfer processes yet\. Start one from an agreed contract above\./,
        ),
      ).toBeInTheDocument();
    });
  });

  it("shows empty agreements message when no finalized negotiations", async () => {
    setupDefaultMocks({ negotiations: [], transfers: [] });
    render(<DataTransferPage />);
    await waitFor(() => {
      expect(
        screen.getByText(/No finalized agreements found/),
      ).toBeInTheDocument();
    });
  });

  /* ─── 5. Renders transfer list with DSP state pipeline ─── */
  it("renders transfer cards with asset labels and state badges", async () => {
    setupDefaultMocks({ negotiations: [] });
    render(<DataTransferPage />);
    await waitFor(() => {
      // Asset labels: "fhir-patient-bundle" → "Fhir Patient Bundle"
      expect(screen.getByText("Fhir Patient Bundle")).toBeInTheDocument();
      expect(screen.getByText("Omop Cohort Data")).toBeInTheDocument();
    });
    // State badges (also used in pipeline steps, so use getAllByText)
    expect(screen.getAllByText("COMPLETED").length).toBeGreaterThan(0);
    expect(screen.getAllByText("STARTED").length).toBeGreaterThan(0);
  });

  it("renders DSP pipeline steps for each transfer", async () => {
    setupDefaultMocks({ negotiations: [] });
    render(<DataTransferPage />);
    await waitFor(() => {
      expect(screen.getByText("Fhir Patient Bundle")).toBeInTheDocument();
    });
    // DSP_STATES are displayed for each transfer; there should be multiple instances
    const requestedLabels = screen.getAllByText("REQUESTED");
    expect(requestedLabels.length).toBeGreaterThanOrEqual(2); // one per transfer pipeline
    const startedLabels = screen.getAllByText("STARTED");
    expect(startedLabels.length).toBeGreaterThanOrEqual(1); // state badge + pipeline label(s)
  });

  it("shows transfer type badge", async () => {
    setupDefaultMocks();
    render(<DataTransferPage />);
    await waitFor(() => {
      const badges = screen.getAllByText("HttpData-PULL");
      expect(badges.length).toBeGreaterThan(0);
    });
  });

  it("shows View FHIR button on each transfer", async () => {
    setupDefaultMocks();
    render(<DataTransferPage />);
    await waitFor(() => {
      const viewButtons = screen.getAllByText("View FHIR");
      expect(viewButtons).toHaveLength(2);
    });
  });

  /* ─── 6. Shows FHIR bundle data after clicking view data ─── */
  it("opens FHIR viewer panel when clicking View FHIR", async () => {
    setupDefaultMocks({ negotiations: [] });

    // Mock global fetch for /mock/fhir_bundles.json
    const fhirBundles = {
      "fhir-patient-bundle": {
        resourceType: "Bundle",
        id: "bundle-1",
        type: "searchset",
        total: 2,
        entry: [
          {
            resource: {
              resourceType: "Patient",
              id: "pat-1",
              name: [{ given: ["Jane"], family: "Doe" }],
            },
          },
          {
            resource: {
              resourceType: "Observation",
              id: "obs-1",
              code: { text: "Blood Pressure" },
              valueQuantity: { value: 120, unit: "mmHg" },
            },
          },
        ],
      },
    };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(fhirBundles),
    });

    const user = userEvent.setup();
    render(<DataTransferPage />);

    await waitFor(() => {
      expect(screen.getByText("Fhir Patient Bundle")).toBeInTheDocument();
    });

    // Click the first "View FHIR" button
    const viewButtons = screen.getAllByText("View FHIR");
    await user.click(viewButtons[0]);

    await waitFor(() => {
      expect(screen.getByText(/FHIR Data/)).toBeInTheDocument();
    });

    // Should show resource type pills and resource cards
    await waitFor(() => {
      expect(screen.getByText("Patient")).toBeInTheDocument();
      expect(screen.getByText("Observation")).toBeInTheDocument();
    });

    globalThis.fetch = originalFetch;
  });

  it("toggles FHIR viewer from Hide FHIR back to View FHIR", async () => {
    setupDefaultMocks({ negotiations: [] });
    const fhirBundles = {
      "fhir-patient-bundle": {
        resourceType: "Bundle",
        id: "b1",
        type: "searchset",
        total: 0,
        entry: [],
      },
    };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(fhirBundles),
    });

    const user = userEvent.setup();
    render(<DataTransferPage />);
    await waitFor(() => {
      expect(screen.getByText("Fhir Patient Bundle")).toBeInTheDocument();
    });

    const viewButtons = screen.getAllByText("View FHIR");
    await user.click(viewButtons[0]);

    await waitFor(() => {
      expect(screen.getByText("Hide FHIR")).toBeInTheDocument();
    });

    // Click again to hide
    await user.click(screen.getByText("Hide FHIR"));
    await waitFor(() => {
      const btns = screen.getAllByText("View FHIR");
      expect(btns).toHaveLength(2);
    });

    globalThis.fetch = originalFetch;
  });

  /* ─── 7. Handles API errors gracefully ─── */
  it("handles participant fetch failure gracefully", async () => {
    mockFetchApi.mockRejectedValue(new Error("Network error"));
    render(<DataTransferPage />);
    // Should not crash — page renders without data
    await waitFor(() => {
      expect(screen.getByText("Data Transfers")).toBeInTheDocument();
    });
  });

  it("handles transfers/negotiations fetch failure gracefully", async () => {
    mockFetchApi.mockImplementation((url: string) => {
      if (url === "/api/participants") return mockResponse(PARTICIPANTS);
      return Promise.reject(new Error("Server error"));
    });
    render(<DataTransferPage />);
    await waitFor(() => {
      expect(
        screen.getByText(
          /No transfer processes yet\. Start one from an agreed contract above\./,
        ),
      ).toBeInTheDocument();
    });
  });

  it("handles non-ok participant response", async () => {
    mockFetchApi.mockImplementation((url: string) => {
      if (url === "/api/participants") return mockErrorResponse(500);
      return mockResponse([]);
    });
    render(<DataTransferPage />);
    // Should show loading then reach some stable state without crashing
    await waitFor(() => {
      expect(screen.getByText("Data Transfers")).toBeInTheDocument();
    });
  });

  /* ─── 8. Initiates a transfer from an agreement ─── */
  it("shows agreements from finalized negotiations", async () => {
    setupDefaultMocks({ transfers: [] });
    render(<DataTransferPage />);
    await waitFor(() => {
      expect(
        screen.getByText("Start Transfer from Agreement"),
      ).toBeInTheDocument();
    });
    // Agreements rendered with asset labels
    expect(screen.getByText("Fhir Patient Bundle")).toBeInTheDocument();
    expect(screen.getByText("Omop Cohort Data")).toBeInTheDocument();
  });

  it("initiates transfer when Start Transfer is clicked", async () => {
    setupDefaultMocks({ transfers: [] });
    const user = userEvent.setup();
    render(<DataTransferPage />);

    await waitFor(() => {
      expect(
        screen.getByText("Start Transfer from Agreement"),
      ).toBeInTheDocument();
    });

    // Select the second agreement (Omop Cohort Data) via its checkbox
    const checkboxes = screen.getAllByRole("checkbox");
    // checkboxes[0] = Select All, checkboxes[1] = agr-001, checkboxes[2] = agr-002
    await user.click(checkboxes[2]);

    // Click start transfer
    const startBtn = screen.getByRole("button", { name: /Start Transfer/i });
    await user.click(startBtn);

    // Verify the POST was called
    await waitFor(() => {
      const postCalls = mockFetchApi.mock.calls.filter(
        (c: unknown[]) =>
          c[0] === "/api/transfers" && (c[1] as RequestInit)?.method === "POST",
      );
      expect(postCalls.length).toBe(1);
      const body = JSON.parse((postCalls[0][1] as RequestInit).body as string);
      expect(body.contractId).toBe("agr-002");
      expect(body.assetId).toBe("omop-cohort-data");
      expect(body.participantId).toBe("ctx-alpha");
    });

    // Should show success message
    await waitFor(() => {
      expect(
        screen.getByText(/Transfer started for Omop Cohort Data/),
      ).toBeInTheDocument();
    });
  });

  it("shows error message when transfer initiation fails", async () => {
    mockFetchApi.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/participants") return mockResponse(PARTICIPANTS);
      if (url === "/api/transfers" && init?.method === "POST") {
        return mockErrorResponse(400);
      }
      if (url.startsWith("/api/transfers")) return mockResponse([]);
      if (url.startsWith("/api/negotiations"))
        return mockResponse(NEGOTIATIONS_FINALIZED);
      return mockResponse({});
    });

    const user = userEvent.setup();
    render(<DataTransferPage />);

    await waitFor(() => {
      expect(
        screen.getByText("Start Transfer from Agreement"),
      ).toBeInTheDocument();
    });

    // Select first agreement
    const checkboxes = screen.getAllByRole("checkbox");
    await user.click(checkboxes[1]);

    await user.click(screen.getByRole("button", { name: /Start Transfer/i }));

    await waitFor(() => {
      expect(screen.getByText(/Error:/)).toBeInTheDocument();
    });
  });

  it("supports Select All to toggle all agreements", async () => {
    setupDefaultMocks();
    const user = userEvent.setup();
    render(<DataTransferPage />);

    await waitFor(() => {
      expect(screen.getByText(/Select All/)).toBeInTheDocument();
    });

    // Click Select All
    const selectAllCheckbox = screen.getByRole("checkbox", {
      name: /Select All/,
    });
    await user.click(selectAllCheckbox);

    // Button should indicate multiple transfers
    expect(
      screen.getByRole("button", { name: /Start 2 Transfers/ }),
    ).toBeInTheDocument();
  });

  it("marks agreements that already have a transfer in progress", async () => {
    setupDefaultMocks();
    render(<DataTransferPage />);
    await waitFor(() => {
      // agr-001 has a matching transfer (tp-001 with contractId agr-001)
      expect(
        screen.getAllByText(/transfer in progress/).length,
      ).toBeGreaterThan(0);
    });
  });

  /* ─── 9. DSP state pipeline stage display ─── */
  it("shows COMPLETED state with green check in pipeline", async () => {
    setupDefaultMocks({ transfers: [TRANSFERS[0]], negotiations: [] });
    render(<DataTransferPage />);
    await waitFor(() => {
      // COMPLETED appears in both state badge and pipeline step
      const completed = screen.getAllByText("COMPLETED");
      expect(completed.length).toBeGreaterThanOrEqual(2);
    });
    // Pipeline steps should all be present
    const pipelineSteps = screen.getAllByText("REQUESTED");
    expect(pipelineSteps.length).toBeGreaterThanOrEqual(1);
  });

  it("shows REQUESTED state correctly in pipeline", async () => {
    setupDefaultMocks({
      transfers: [TRANSFER_REQUESTED],
      negotiations: [],
    });
    render(<DataTransferPage />);
    await waitFor(() => {
      // The state badge + pipeline both show REQUESTED
      const labels = screen.getAllByText("REQUESTED");
      expect(labels.length).toBeGreaterThanOrEqual(2); // badge + pipeline step
    });
  });

  it("shows TERMINATED state with error indicator", async () => {
    setupDefaultMocks({
      transfers: [TRANSFER_TERMINATED],
      negotiations: [],
    });
    render(<DataTransferPage />);
    await waitFor(() => {
      // TERMINATED shows in both the badge and extra pipeline node
      const terminated = screen.getAllByText("TERMINATED");
      expect(terminated.length).toBeGreaterThanOrEqual(2); // badge + pipeline
    });
  });

  it("shows transfer status filter pills when transfers exist", async () => {
    setupDefaultMocks();
    render(<DataTransferPage />);
    await waitFor(() => {
      // Status filter: ALL, COMPLETED, STARTED
      expect(screen.getByText(/ALL \(2\)/)).toBeInTheDocument();
    });
  });

  it("filters transfers by status when clicking a filter pill", async () => {
    setupDefaultMocks({ negotiations: [] });
    const user = userEvent.setup();
    render(<DataTransferPage />);

    await waitFor(() => {
      expect(screen.getByText("Fhir Patient Bundle")).toBeInTheDocument();
      expect(screen.getByText("Omop Cohort Data")).toBeInTheDocument();
    });

    // Click the COMPLETED filter
    const completedFilter = screen.getByText(/COMPLETED \(1\)/);
    await user.click(completedFilter);

    await waitFor(() => {
      expect(screen.getByText("Fhir Patient Bundle")).toBeInTheDocument();
      expect(screen.queryByText("Omop Cohort Data")).not.toBeInTheDocument();
    });
  });

  /* ─── 10. edc: prefix field normalization ─── */
  it("reads edc: prefixed fields correctly for asset ID and state", async () => {
    // Use only edc:-prefixed fields (no unprefixed)
    const transferEdcOnly = {
      "@id": "tp-edc",
      "edc:state": "STARTED",
      "edc:assetId": "fhir-condition-report",
      "edc:contractId": "agr-edc",
      "edc:transferType": "HttpData-PULL",
    };
    setupDefaultMocks({ transfers: [transferEdcOnly], negotiations: [] });
    render(<DataTransferPage />);
    await waitFor(() => {
      expect(screen.getByText("Fhir Condition Report")).toBeInTheDocument();
      // "STARTED" should appear as state badge
      const startedLabels = screen.getAllByText("STARTED");
      expect(startedLabels.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("reads unprefixed fields when edc: variants are absent", async () => {
    const transferUnprefixed = {
      "@id": "tp-plain",
      state: "COMPLETED",
      assetId: "omop-medication-data",
      contractId: "agr-plain",
      transferType: "HttpData-PULL",
    };
    setupDefaultMocks({ transfers: [transferUnprefixed], negotiations: [] });
    render(<DataTransferPage />);
    await waitFor(() => {
      expect(screen.getByText("Omop Medication Data")).toBeInTheDocument();
      // COMPLETED appears in both badge and pipeline step
      expect(screen.getAllByText("COMPLETED").length).toBeGreaterThanOrEqual(2);
    });
  });

  /* ─── Additional coverage ─── */

  it("renders the Refresh button", async () => {
    setupDefaultMocks();
    render(<DataTransferPage />);
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Refresh/i }),
      ).toBeInTheDocument();
    });
  });

  it("refreshes transfers when clicking Refresh", async () => {
    setupDefaultMocks({ negotiations: [] });
    const user = userEvent.setup();
    render(<DataTransferPage />);

    await waitFor(() => {
      expect(screen.getByText("Fhir Patient Bundle")).toBeInTheDocument();
    });

    const callCountBefore = mockFetchApi.mock.calls.filter((c: unknown[]) =>
      (c[0] as string).startsWith("/api/transfers"),
    ).length;

    await user.click(screen.getByRole("button", { name: /Refresh/i }));

    await waitFor(() => {
      const callCountAfter = mockFetchApi.mock.calls.filter((c: unknown[]) =>
        (c[0] as string).startsWith("/api/transfers"),
      ).length;
      expect(callCountAfter).toBeGreaterThan(callCountBefore);
    });
  });

  it("renders DSP workflow navigation links", async () => {
    setupDefaultMocks();
    render(<DataTransferPage />);
    await waitFor(() => {
      expect(screen.getByText("Data Transfers")).toBeInTheDocument();
    });
    // PageIntro should render prev/next step links
    expect(screen.getByText("Contract Negotiation")).toBeInTheDocument();
    expect(screen.getByText("Operator Dashboard")).toBeInTheDocument();
  });

  it("resolves DID to human name for counter-party in agreements", async () => {
    setupDefaultMocks();
    render(<DataTransferPage />);
    await waitFor(() => {
      // counterPartyId "did:web:alpha-klinik.de:participant" → "AlphaKlinik Berlin"
      expect(screen.getByText(/AlphaKlinik Berlin/)).toBeInTheDocument();
    });
  });

  it("shows AGREED badge on each agreement", async () => {
    setupDefaultMocks();
    render(<DataTransferPage />);
    await waitFor(() => {
      const agreedBadges = screen.getAllByText("AGREED");
      expect(agreedBadges.length).toBe(2);
    });
  });

  it("handles participants returned as { participants: [...] } wrapper", async () => {
    setupDefaultMocks({
      participants: { participants: PARTICIPANTS },
    });
    render(<DataTransferPage />);
    await waitFor(() => {
      expect(
        screen.getByText(/AlphaKlinik Berlin \[DATA_HOLDER\]/),
      ).toBeInTheDocument();
    });
  });

  it("handles transfers returned as { transfers: [...] } wrapper", async () => {
    setupDefaultMocks({
      transfers: { transfers: TRANSFERS },
      negotiations: [],
    });
    render(<DataTransferPage />);
    await waitFor(() => {
      expect(screen.getByText("Fhir Patient Bundle")).toBeInTheDocument();
    });
  });

  it("disables Start Transfer button when no agreement is selected", async () => {
    setupDefaultMocks();
    render(<DataTransferPage />);
    await waitFor(() => {
      const btn = screen.getByRole("button", { name: /Start Transfer/i });
      expect(btn).toBeDisabled();
    });
  });
});
