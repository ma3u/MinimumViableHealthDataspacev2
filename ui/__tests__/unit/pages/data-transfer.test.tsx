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
    const startBtn = screen.getByTestId("start-transfer-bottom");
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
      // The data user transfers by default (#876).
      expect(body.participantId).toBe("ctx-pharmaco");
    });

    // Should show success message
    await waitFor(() => {
      expect(
        screen.getByText(/Transfer started for Omop Cohort Data/),
      ).toBeInTheDocument();
    });
  });

  // A transfer under a contract that exists only in this demonstrator is recorded
  // by the API rather than sent (issue #25). "Transfer started" would claim a DSP
  // transfer that never happened, so the page has to say which one it was.
  it("reports a recorded demo transfer as recorded, not started", async () => {
    mockFetchApi.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/participants") return mockResponse(PARTICIPANTS);
      if (url === "/api/transfers" && init?.method === "POST") {
        return mockResponse({
          "@id": "demo-transfer:agr-002",
          state: "STARTED",
          contractId: "agr-002",
          demo: true,
          demoReason: "The connector has never seen the contract.",
        });
      }
      if (url.startsWith("/api/transfers")) return mockResponse([]);
      if (url.startsWith("/api/negotiations")) {
        return mockResponse(NEGOTIATIONS_FINALIZED);
      }
      return mockResponse({});
    });
    const user = userEvent.setup();
    render(<DataTransferPage />);

    await waitFor(() => {
      expect(
        screen.getByText("Start Transfer from Agreement"),
      ).toBeInTheDocument();
    });

    const checkboxes = screen.getAllByRole("checkbox");
    await user.click(checkboxes[2]);
    await user.click(screen.getByTestId("start-transfer-bottom"));

    await waitFor(() => {
      expect(
        screen.getByText(/Demo transfer recorded for Omop Cohort Data/),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText(/Transfer started for/)).toBeNull();
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

    await user.click(screen.getByTestId("start-transfer-bottom"));

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
    expect(screen.getByTestId("start-transfer-bottom")).toBeInTheDocument();
  });

  describe("what an agreement's transfers have reached (#876)", () => {
    // It said "transfer in progress" for any transfer at all, a failed one
    // included, and a STARTED pull transfer stays STARTED while its data is
    // ready.
    const only = (state: string) => [
      { "@id": "tp-x", "edc:state": state, "edc:contractId": "agr-001" },
    ];

    it.each([
      ["COMPLETED", "(transferred)"],
      ["STARTED", "(data ready)"],
      ["REQUESTED", "(transfer in progress)"],
    ])("%s reads %s", async (state, label) => {
      setupDefaultMocks({ transfers: only(state) });
      render(<DataTransferPage />);
      expect(await screen.findByText(label)).toBeInTheDocument();
    });

    it("a failed transfer leaves the agreement unlabelled", async () => {
      setupDefaultMocks({ transfers: only("TERMINATED") });
      render(<DataTransferPage />);
      await screen.findAllByText("TERMINATED");
      expect(screen.queryByText(/transfer in progress|data ready/)).toBeNull();
    });
  });

  it("offers Start Transfer above the agreement list as well (#876)", async () => {
    setupDefaultMocks();
    const user = userEvent.setup();
    render(<DataTransferPage />);
    await screen.findByText("Start Transfer from Agreement");

    const top = screen.getByTestId("start-transfer-top");
    expect((top as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getAllByRole("checkbox")[2]);
    expect((top as HTMLButtonElement).disabled).toBe(false);
  });

  it("shows Details for an agreement without ticking it; a sample says it is one", async () => {
    setupDefaultMocks();
    const user = userEvent.setup();
    render(<DataTransferPage />);
    await screen.findByText("Start Transfer from Agreement");
    const before = screen
      .getAllByRole("checkbox")
      .map((c) => (c as HTMLInputElement).checked);

    await user.click(screen.getAllByText("Details")[0]);

    const details = await screen.findByTestId("transfer-details");
    expect(details.textContent).toMatch(/sample agreement/);
    expect(
      screen
        .getAllByRole("checkbox")
        .map((c) => (c as HTMLInputElement).checked),
    ).toEqual(before);
    // No connector record to read for a sample row.
    expect(
      mockFetchApi.mock.calls.some(([u]) =>
        String(u).startsWith("/api/agreements/"),
      ),
    ).toBe(false);
  });

  describe("My data: the data of open connector transfers (#876)", () => {
    const LIVE = {
      "@id": "tp-live",
      state: "STARTED",
      assetId: "fhir-patient-search",
      contractId: "agr-001",
      source: "controlplane",
      stateTimestamp: 1793887087546,
    };
    const BUNDLE = {
      resourceType: "Bundle",
      type: "searchset",
      total: 1,
      entry: [{ resource: { resourceType: "Patient", id: "p-1a2b3c4d" } }],
    };

    function mocks(data: () => Promise<unknown>) {
      mockFetchApi.mockImplementation((url: string) => {
        if (url.startsWith("/api/transfers/tp-live/data")) return data();
        if (url === "/api/participants") return mockResponse(PARTICIPANTS);
        if (url.startsWith("/api/transfers")) {
          return mockResponse([LIVE, ...TRANSFERS]);
        }
        if (url.startsWith("/api/negotiations")) {
          return mockResponse(NEGOTIATIONS_FINALIZED);
        }
        return mockResponse({});
      });
    }

    it("lists the asset of a STARTED connector transfer, and only that", async () => {
      mocks(() => mockResponse({}));
      render(<DataTransferPage />);

      const section = await screen.findByTestId("my-data");
      expect(within(section).getByText("Fhir Patient Search")).toBeTruthy();
      expect(
        within(section).getByText(/Provider:\s*AlphaKlinik Berlin/),
      ).toBeTruthy();
      // tp-001 is a COMPLETED sample row: not in My data.
      expect(within(section).queryByText("Fhir Patient Bundle")).toBeNull();
    });

    it("Open fetches the transfer's own data and shows its resources", async () => {
      mocks(() =>
        mockResponse({
          bytes: 120,
          truncated: false,
          fetchedAt: "2026-11-05T14:00:00Z",
          data: BUNDLE,
        }),
      );
      const user = userEvent.setup();
      render(<DataTransferPage />);

      const section = await screen.findByTestId("my-data");
      await user.click(within(section).getByText("Open"));

      await waitFor(() => {
        expect(
          mockFetchApi.mock.calls.some(([u]) =>
            String(u).startsWith(
              "/api/transfers/tp-live/data?participantId=ctx-pharmaco",
            ),
          ),
        ).toBe(true);
      });
      expect((await screen.findAllByText(/p-1a2b3c4d/)).length).toBeGreaterThan(
        0,
      );
    });

    it("imports into SPE-1 by default, or the SPE picked, and links to the graph", async () => {
      mockFetchApi.mockImplementation((url: string) => {
        if (url === "/api/transfers/tp-live/import") {
          return mockResponse({
            datasetId: "tp-live",
            speId: "SPE-2",
            records: 12,
            relationships: 30,
            byType: { Patient: 12 },
            importedAt: "2026-11-05T19:00:00.000Z",
            pseudonymised: true,
            graphUrl: "/graph?dataset=tp-live&spe=SPE-2",
          });
        }
        if (url === "/api/participants") return mockResponse(PARTICIPANTS);
        if (url.startsWith("/api/transfers")) {
          return mockResponse([LIVE, ...TRANSFERS]);
        }
        if (url.startsWith("/api/negotiations")) {
          return mockResponse(NEGOTIATIONS_FINALIZED);
        }
        return mockResponse({});
      });
      const user = userEvent.setup();
      render(<DataTransferPage />);

      const section = await screen.findByTestId("my-data");
      const target = within(section).getByTestId(
        "spe-import-target",
      ) as HTMLSelectElement;
      expect(target.value).toBe("SPE-1");
      await user.selectOptions(target, "SPE-2");
      await user.click(within(section).getByTestId("spe-import-run"));

      const done = await within(section).findByTestId("spe-import-done");
      expect(done.textContent).toMatch(
        /12 records with 30 references into SPE-2/,
      );
      expect(done.textContent).toMatch(/pseudonymised/);
      expect(
        within(section).getByTestId("spe-import-graph").getAttribute("href"),
      ).toBe("/graph?dataset=tp-live&spe=SPE-2");
      const call = mockFetchApi.mock.calls.find(
        ([u]) => u === "/api/transfers/tp-live/import",
      );
      expect(JSON.parse(String(call?.[1]?.body))).toEqual({
        participantId: "ctx-pharmaco",
        speId: "SPE-2",
        overwrite: false,
      });
    });

    it("shows a transfer an SPE holds already and asks before overwriting it", async () => {
      const posted: unknown[] = [];
      mockFetchApi.mockImplementation((url: string, init?: RequestInit) => {
        if (url.startsWith("/api/spe-imports?ids=tp-live")) {
          return mockResponse({
            imports: [
              {
                datasetId: "tp-live",
                speId: "SPE-1",
                records: 100,
                importedAt: "2026-11-05T20:12:36.622Z",
              },
            ],
            unreachable: [],
          });
        }
        if (url === "/api/transfers/tp-live/import") {
          posted.push(JSON.parse(String(init?.body)));
          return mockResponse({
            datasetId: "tp-live",
            speId: "SPE-1",
            records: 100,
            relationships: 0,
            importedAt: "2026-11-05T21:00:00.000Z",
            pseudonymised: true,
            graphUrl: "/overview?import=tp-live&spe=SPE-1",
          });
        }
        if (url === "/api/participants") return mockResponse(PARTICIPANTS);
        if (url.startsWith("/api/transfers")) {
          return mockResponse([LIVE, ...TRANSFERS]);
        }
        if (url.startsWith("/api/negotiations")) {
          return mockResponse(NEGOTIATIONS_FINALIZED);
        }
        return mockResponse({});
      });
      const user = userEvent.setup();
      render(<DataTransferPage />);

      const section = await screen.findByTestId("my-data");
      const held = await within(section).findByTestId("spe-import-existing");
      expect(held.textContent).toMatch(
        /Imported into SPE-1 on 2026-11-05: 100 records/,
      );
      expect(within(held).getByText("Show in 3D").getAttribute("href")).toBe(
        "/overview?import=tp-live&spe=SPE-1",
      );

      await user.click(within(section).getByText("Import again"));
      const ask = within(section).getByTestId("spe-import-confirm");
      expect(ask.textContent).toMatch(/SPE-1 holds this transfer already/);
      expect(posted).toHaveLength(0);

      await user.click(within(section).getByTestId("spe-import-confirm-no"));
      expect(within(section).queryByTestId("spe-import-confirm")).toBeNull();
      expect(posted).toHaveLength(0);

      await user.click(within(section).getByText("Import again"));
      await user.click(within(section).getByTestId("spe-import-confirm-yes"));
      await within(section).findByTestId("spe-import-done");
      expect(posted).toEqual([
        { participantId: "ctx-pharmaco", speId: "SPE-1", overwrite: true },
      ]);
    });

    it("asks before holding a transfer in a second SPE", async () => {
      mockFetchApi.mockImplementation((url: string) => {
        if (url.startsWith("/api/spe-imports?ids=tp-live")) {
          return mockResponse({
            imports: [
              {
                datasetId: "tp-live",
                speId: "SPE-1",
                records: 100,
                importedAt: "2026-11-05T20:12:36.622Z",
              },
            ],
          });
        }
        if (url === "/api/participants") return mockResponse(PARTICIPANTS);
        if (url.startsWith("/api/transfers")) {
          return mockResponse([LIVE, ...TRANSFERS]);
        }
        if (url.startsWith("/api/negotiations")) {
          return mockResponse(NEGOTIATIONS_FINALIZED);
        }
        return mockResponse({});
      });
      const user = userEvent.setup();
      render(<DataTransferPage />);

      const section = await screen.findByTestId("my-data");
      await within(section).findByTestId("spe-import-existing");
      await user.selectOptions(
        within(section).getByTestId("spe-import-target"),
        "SPE-2",
      );
      await user.click(within(section).getByText("Import again"));

      expect(
        within(section).getByTestId("spe-import-confirm").textContent,
      ).toMatch(/in SPE-1 already\. Import it into SPE-2 as well/);
      expect(
        within(section).getByTestId("spe-import-confirm-yes").textContent,
      ).toBe("Import as well");
    });

    it("says why an import failed", async () => {
      mockFetchApi.mockImplementation((url: string) => {
        if (url === "/api/transfers/tp-live/import") {
          return mockResponse(
            { error: "SPE-1 is not connected to the hub", step: "import" },
            false,
          );
        }
        if (url === "/api/participants") return mockResponse(PARTICIPANTS);
        if (url.startsWith("/api/transfers")) {
          return mockResponse([LIVE, ...TRANSFERS]);
        }
        if (url.startsWith("/api/negotiations")) {
          return mockResponse(NEGOTIATIONS_FINALIZED);
        }
        return mockResponse({});
      });
      const user = userEvent.setup();
      render(<DataTransferPage />);

      const section = await screen.findByTestId("my-data");
      await user.click(within(section).getByTestId("spe-import-run"));

      expect(
        (await within(section).findByTestId("spe-import-error")).textContent,
      ).toMatch(/SPE-1 is not connected/);
      expect(within(section).queryByTestId("spe-import-done")).toBeNull();
    });

    it("Details say since when, until when, how, and the agreed policy", async () => {
      mockFetchApi.mockImplementation((url: string) => {
        if (url.startsWith("/api/agreements/agr-001")) {
          return mockResponse({
            agreementId: "agr-001",
            assetId: "fhir-patient-search",
            providerId: "did:web:alpha-klinik.de:participant",
            consumerId: "did:web:pharmaco.de:research",
            signedAt: "2026-11-05T13:56:30.000Z",
            validUntil: "2027-11-05T13:56:30.000Z",
            policy: {
              permission: [
                {
                  action: "use",
                  constraint: [
                    {
                      leftOperand: "inForceDate",
                      operator: "lteq",
                      rightOperand: "contractAgreement+365d",
                    },
                  ],
                },
              ],
            },
          });
        }
        if (url === "/api/participants") return mockResponse(PARTICIPANTS);
        if (url.startsWith("/api/transfers")) {
          return mockResponse([LIVE, ...TRANSFERS]);
        }
        if (url.startsWith("/api/negotiations")) {
          return mockResponse(NEGOTIATIONS_FINALIZED);
        }
        return mockResponse({});
      });
      const user = userEvent.setup();
      render(<DataTransferPage />);

      const section = await screen.findByTestId("my-data");
      await user.click(within(section).getByText("Details"));

      const details = await screen.findByTestId("transfer-details");
      expect(within(details).getByText("Access open since")).toBeTruthy();
      expect(
        within(details).getByTestId("transfer-opened").textContent,
      ).not.toBe("—");
      await waitFor(() => {
        expect(
          within(details).getByTestId("transfer-until").textContent,
        ).toMatch(/2027/);
      });
      expect(details.textContent).toMatch(/How to get the data/);
      expect(details.textContent).toMatch(/Access policy/);
      expect(
        within(details).getByTestId("offer-policy-description").textContent,
      ).toMatch(/for 1 year after the contract is agreed/);
      // A signed agreement has nothing left to tick.
      expect(within(details).queryByTestId("offer-terms-accept")).toBeNull();
      expect(
        mockFetchApi.mock.calls.some(([u]) =>
          String(u).startsWith(
            "/api/agreements/agr-001?participantId=ctx-pharmaco",
          ),
        ),
      ).toBe(true);
    });

    it("says why when the data cannot be fetched", async () => {
      mocks(() =>
        mockResponse(
          {
            error: "Failed to fetch the transfer's data",
            detail: "siglet answered 404 for flow tp-live",
          },
          false,
        ),
      );
      const user = userEvent.setup();
      render(<DataTransferPage />);

      const section = await screen.findByTestId("my-data");
      await user.click(within(section).getByText("Open"));

      expect(
        (
          await screen.findAllByText(
            /Could not fetch the data: .*siglet answered 404/,
          )
        ).length,
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
      const btn = screen.getByTestId("start-transfer-bottom");
      expect(btn).toBeDisabled();
    });
  });
});
