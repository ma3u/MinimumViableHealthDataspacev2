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

  it("shows empty agreements message when no finalized negotiations", async () => {
    setupDefaultMocks({ negotiations: [], transfers: [] });
    render(<DataTransferPage />);
    await waitFor(() => {
      expect(
        screen.getByText(/No finalized agreements found/),
      ).toBeInTheDocument();
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
      expect(screen.getByText("My contracts and data")).toBeInTheDocument();
    });
    // Agreements rendered with asset labels
    expect(screen.getByText("Fhir Patient Bundle")).toBeInTheDocument();
    expect(screen.getByText("Omop Cohort Data")).toBeInTheDocument();
  });

  describe("one list: each contract once, where it stands (#894)", () => {
    const rowsOf = async () => {
      await screen.findByTestId("contracts-list");
      return screen.findAllByTestId("contract-row");
    };
    const stageOf = (row: HTMLElement) =>
      within(row).getByTestId("contract-stage").textContent;

    it("lists each agreement once, with its stage", async () => {
      setupDefaultMocks();
      render(<DataTransferPage />);

      const rows = await rowsOf();
      expect(rows).toHaveLength(2);
      // edc: prefixed fields (the fixtures) are read as well.
      expect(within(rows[0]).getByText("Omop Cohort Data")).toBeTruthy();
      expect(stageOf(rows[0])).toBe("Data ready");
      expect(within(rows[1]).getByText("Fhir Patient Bundle")).toBeTruthy();
      expect(stageOf(rows[1])).toBe("Transfer completed");
      expect(screen.getAllByText("Fhir Patient Bundle")).toHaveLength(1);
      expect(screen.queryByText("Transfer Processes")).toBeNull();
      expect(screen.queryByText(/Select All/)).toBeNull();
    });

    it("orders by contract date, newest first, and shows when it was agreed", async () => {
      setupDefaultMocks({
        negotiations: [
          { ...NEGOTIATIONS_FINALIZED[0], createdAt: 1793900000000 },
          { ...NEGOTIATIONS_FINALIZED[1], createdAt: 1793800000000 },
        ],
      });
      render(<DataTransferPage />);

      const rows = await rowsOf();
      // agr-002 has data ready, agr-001 is completed: the date decides.
      expect(within(rows[0]).getByText("Fhir Patient Bundle")).toBeTruthy();
      expect(within(rows[1]).getByText("Omop Cohort Data")).toBeTruthy();
      expect(
        within(rows[0]).getByTestId("contract-agreed").textContent,
      ).toMatch(/agreed .*2026/);
    });

    it("reads unprefixed fields too", async () => {
      setupDefaultMocks({
        transfers: [
          {
            "@id": "tp-plain",
            state: "STARTED",
            assetId: "omop-cohort-data",
            contractId: "agr-002",
            stateTimestamp: 1700002000000,
          },
        ],
      });
      render(<DataTransferPage />);

      const rows = await rowsOf();
      expect(stageOf(rows[0])).toBe("Data ready");
      expect(within(rows[0]).getByText("Omop Cohort Data")).toBeTruthy();
    });

    it("counts each stage, filters by it and searches", async () => {
      setupDefaultMocks();
      const user = userEvent.setup();
      render(<DataTransferPage />);
      await rowsOf();

      expect(screen.getByTestId("stage-filter-all").textContent).toBe(
        "All (2)",
      );
      expect(screen.getByTestId("stage-filter-done").textContent).toBe(
        "Transfer completed (1)",
      );
      await user.click(screen.getByTestId("stage-filter-done"));
      expect(screen.getAllByTestId("contract-row")).toHaveLength(1);
      expect(screen.getByText("Fhir Patient Bundle")).toBeTruthy();

      await user.click(screen.getByTestId("stage-filter-imported"));
      expect(screen.queryAllByTestId("contract-row")).toHaveLength(0);
      expect(screen.getByText("No contract matches.")).toBeTruthy();

      await user.click(screen.getByTestId("stage-filter-all"));
      await user.type(
        screen.getByRole("searchbox", {
          name: "Search dataset, provider or contract",
        }),
        "omop",
      );
      expect(screen.getAllByTestId("contract-row")).toHaveLength(1);
      expect(screen.getByText("Omop Cohort Data")).toBeTruthy();
    });

    it("starts a transfer from the agreement's row and says so", async () => {
      setupDefaultMocks({ transfers: [] });
      const user = userEvent.setup();
      render(<DataTransferPage />);
      const rows = await rowsOf();
      const fhir = rows.find((r) =>
        within(r).queryByText("Fhir Patient Bundle"),
      )!;
      expect(stageOf(fhir)).toBe("Ready to transfer");

      await user.click(within(fhir).getByTestId("start-transfer"));

      await screen.findByText(/Transfer started for Fhir Patient Bundle/);
      const post = mockFetchApi.mock.calls.find(
        ([u, init]) => u === "/api/transfers" && init?.method === "POST",
      );
      expect(JSON.parse(String(post?.[1]?.body))).toMatchObject({
        participantId: "ctx-pharmaco",
        contractId: "agr-001",
        assetId: "fhir-patient-bundle",
      });
    });

    it("reports a recorded demo transfer as recorded, not started", async () => {
      setupDefaultMocks({ transfers: [] });
      mockFetchApi.mockImplementation((url: string, init?: RequestInit) => {
        if (url === "/api/transfers" && init?.method === "POST") {
          return mockResponse({ "@id": "tp-demo", demo: true });
        }
        if (url === "/api/participants") return mockResponse(PARTICIPANTS);
        if (url.startsWith("/api/transfers")) return mockResponse([]);
        if (url.startsWith("/api/negotiations")) {
          return mockResponse(NEGOTIATIONS_FINALIZED);
        }
        return mockResponse({});
      });
      const user = userEvent.setup();
      render(<DataTransferPage />);
      const rows = await rowsOf();

      await user.click(within(rows[0]).getByTestId("start-transfer"));

      await screen.findByText(/Demo transfer recorded for/);
      expect(screen.queryByText(/Transfer started for/)).toBeNull();
    });

    it("says why a transfer could not start, and when the network failed", async () => {
      let fail: "http" | "network" = "http";
      mockFetchApi.mockImplementation((url: string, init?: RequestInit) => {
        if (url === "/api/transfers" && init?.method === "POST") {
          return fail === "http"
            ? mockResponse({ detail: "contract not found" }, false)
            : Promise.reject(new Error("offline"));
        }
        if (url === "/api/participants") return mockResponse(PARTICIPANTS);
        if (url.startsWith("/api/transfers")) return mockResponse([]);
        if (url.startsWith("/api/negotiations")) {
          return mockResponse([NEGOTIATIONS_FINALIZED[0]]);
        }
        return mockResponse({});
      });
      const user = userEvent.setup();
      render(<DataTransferPage />);
      const rows = await rowsOf();

      await user.click(within(rows[0]).getByTestId("start-transfer"));
      await screen.findByText(/Fhir Patient Bundle: contract not found/);

      fail = "network";
      await user.click(within(rows[0]).getByTestId("start-transfer"));
      await screen.findByText(/Fhir Patient Bundle: Network error/);
    });

    it("says why the data permit gate refused a transfer", async () => {
      mockFetchApi.mockImplementation((url: string, init?: RequestInit) => {
        if (url === "/api/transfers" && init?.method === "POST") {
          return mockResponse(
            {
              error: "No data permit covers this transfer",
              reason:
                "Data permit permit-app-pharmaco-1 expired on 2026-11-01.",
              article: "Regulation (EU) 2025/327, Art. 61(1) and Art. 68",
            },
            false,
          );
        }
        if (url === "/api/participants") return mockResponse(PARTICIPANTS);
        if (url.startsWith("/api/transfers")) return mockResponse([]);
        if (url.startsWith("/api/negotiations")) {
          return mockResponse([NEGOTIATIONS_FINALIZED[0]]);
        }
        return mockResponse({});
      });
      const user = userEvent.setup();
      render(<DataTransferPage />);
      const rows = await rowsOf();

      await user.click(within(rows[0]).getByTestId("start-transfer"));
      await screen.findByText(
        /No data permit covers this transfer: Data permit permit-app-pharmaco-1 expired on 2026-11-01\./,
      );
    });

    it("follows a transfer the connector is still working on until it starts", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        const transfer = {
          "@id": "tp-live",
          state: "INITIAL",
          assetId: "fhir-patient-bundle",
          contractId: "agr-001",
          source: "controlplane",
          stateTimestamp: 1793966000000,
        };
        let reads = 0;
        mockFetchApi.mockImplementation((url: string) => {
          if (url === "/api/participants") return mockResponse(PARTICIPANTS);
          if (url.startsWith("/api/transfers?")) {
            reads += 1;
            // The connector moves it on after the page has loaded it once.
            return mockResponse([
              reads > 1 ? { ...transfer, state: "STARTED" } : transfer,
            ]);
          }
          if (url.startsWith("/api/negotiations")) {
            return mockResponse([NEGOTIATIONS_FINALIZED[0]]);
          }
          return mockResponse({});
        });
        render(<DataTransferPage />);
        const rows = await rowsOf();
        expect(stageOf(rows[0])).toBe("Transfer in progress");
        expect(
          within(rows[0]).getByText("Waiting for the provider"),
        ).toBeTruthy();

        await vi.advanceTimersByTimeAsync(3100);

        await waitFor(() =>
          expect(stageOf(screen.getAllByTestId("contract-row")[0])).toBe(
            "Data ready",
          ),
        );
        expect(screen.queryByText("Waiting for the provider")).toBeNull();
        // Settled: no more reloads.
        const settledAt = reads;
        await vi.advanceTimersByTimeAsync(10_000);
        expect(reads).toBe(settledAt);
      } finally {
        vi.useRealTimers();
      }
    });

    it("keeps a contract's transfers under Details, with their pipeline", async () => {
      setupDefaultMocks({
        transfers: [TRANSFERS[0], TRANSFER_REQUESTED, TRANSFER_TERMINATED],
      });
      const user = userEvent.setup();
      render(<DataTransferPage />);
      const rows = await rowsOf();
      const fhir = rows.find((r) =>
        within(r).queryByText("Fhir Patient Bundle"),
      )!;
      // A REQUESTED transfer is under way: the contract waits for it.
      expect(stageOf(fhir)).toBe("Transfer in progress");
      expect(within(fhir).queryByTestId("contract-history")).toBeNull();

      await user.click(within(fhir).getByText("Details"));

      const history = within(fhir).getByTestId("contract-history");
      expect(history.textContent).toMatch(
        /Transfers under this contract \(3\)/,
      );
      expect(within(history).getAllByText("COMPLETED").length).toBeGreaterThan(
        0,
      );
      expect(within(history).getAllByText("REQUESTED").length).toBeGreaterThan(
        0,
      );
      expect(within(history).getAllByText("TERMINATED").length).toBeGreaterThan(
        0,
      );
      expect(history.textContent).toMatch(/42 resources transferred/);
      expect(history.textContent).toMatch(/HttpData-PULL/);
    });

    it("offers a new transfer after a failed one, and says it failed", async () => {
      setupDefaultMocks({ transfers: [TRANSFER_TERMINATED] });
      render(<DataTransferPage />);
      const rows = await rowsOf();
      const fhir = rows.find((r) =>
        within(r).queryByText("Fhir Patient Bundle"),
      )!;

      expect(stageOf(fhir)).toBe("Ready to transfer");
      expect(fhir.textContent).toMatch(/the last transfer failed/);
      expect(within(fhir).getByTestId("start-transfer")).toBeTruthy();
    });

    it("resolves the provider's DID to its name", async () => {
      setupDefaultMocks();
      render(<DataTransferPage />);
      const rows = await rowsOf();

      expect(rows[1].textContent).toMatch(/Provider:\s*AlphaKlinik Berlin/);
    });

    it("says a sample agreement is one under Details", async () => {
      setupDefaultMocks();
      const user = userEvent.setup();
      render(<DataTransferPage />);
      const rows = await rowsOf();

      await user.click(within(rows[1]).getByText("Details"));

      expect(
        within(rows[1]).getByTestId("transfer-details").textContent,
      ).toMatch(/sample agreement/);
      expect(
        mockFetchApi.mock.calls.some(([u]) =>
          String(u).startsWith("/api/agreements/"),
        ),
      ).toBe(false);
    });

    it("shows the empty state when the contracts cannot be read", async () => {
      mockFetchApi.mockImplementation((url: string) => {
        if (url === "/api/participants") return mockResponse(PARTICIPANTS);
        return Promise.reject(new Error("down"));
      });
      render(<DataTransferPage />);

      await screen.findByText(/No finalized agreements found/);
    });
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

      const section = await screen.findByTestId("contracts-list");
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

      const section = await screen.findByTestId("contracts-list");
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

      const section = await screen.findByTestId("contracts-list");
      const held = await within(section).findByTestId("spe-import-existing");
      // The row says when, beside who provided it.
      expect(
        (await within(section).findByTestId("contract-imported")).textContent,
      ).toMatch(/imported .*2026/);
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

      const section = await screen.findByTestId("contracts-list");
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

    it("Details of a connector agreement say since when, until when and the policy", async () => {
      mockFetchApi.mockImplementation((url: string) => {
        if (url.startsWith("/api/agreements/agr-001")) {
          return mockResponse({
            agreementId: "agr-001",
            signedAt: "2026-11-05T13:56:30.000Z",
            validUntil: "2027-11-05T13:56:30.000Z",
            policy: { permission: [{ action: "use" }] },
          });
        }
        if (url === "/api/participants") return mockResponse(PARTICIPANTS);
        if (url.startsWith("/api/transfers")) return mockResponse([LIVE]);
        if (url.startsWith("/api/negotiations")) {
          return mockResponse([
            { ...NEGOTIATIONS_FINALIZED[0], source: "controlplane" },
          ]);
        }
        return mockResponse({});
      });
      const user = userEvent.setup();
      render(<DataTransferPage />);

      const section = await screen.findByTestId("contracts-list");
      const row = (await within(section).findAllByTestId("contract-row"))[0];
      await user.click(within(row).getByText("Details"));

      const details = await within(row).findByTestId("transfer-details");
      await waitFor(() =>
        expect(
          within(details).getByTestId("transfer-until").textContent,
        ).toMatch(/2027/),
      );
      expect(
        within(details).getByTestId("transfer-opened").textContent,
      ).not.toBe("no open transfer");
      expect(within(row).getByTestId("contract-history").textContent).toMatch(
        /Transfers under this contract \(1\)/,
      );
    });

    it("offers a new transfer when the access has expired", async () => {
      const posts: unknown[] = [];
      mockFetchApi.mockImplementation((url: string, init?: RequestInit) => {
        if (url === "/api/transfers/tp-live/import") {
          return mockResponse(
            {
              error: "Failed to fetch the transfer's data",
              step: "token",
              detail: "the access to this transfer has expired",
              expired: true,
            },
            false,
          );
        }
        if (url === "/api/transfers" && init?.method === "POST") {
          posts.push(JSON.parse(String(init.body)));
          return mockResponse({ "@id": "tp-new", state: "REQUESTED" });
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

      const section = await screen.findByTestId("contracts-list");
      await user.click(within(section).getByTestId("spe-import-run"));

      const msg = await within(section).findByTestId("spe-import-error");
      expect(msg.textContent).toMatch(
        /The access to this transfer has expired/,
      );
      await user.click(within(section).getByTestId("spe-import-restart"));

      await waitFor(() =>
        expect(posts).toEqual([
          expect.objectContaining({
            participantId: "ctx-pharmaco",
            contractId: "agr-001",
          }),
        ]),
      );
    });

    it("says a stopped workspace is starting, and that an import lasts until it stops", async () => {
      let attempt = 0;
      mockFetchApi.mockImplementation((url: string) => {
        if (url === "/api/transfers/tp-live/import") {
          attempt += 1;
          if (attempt === 1) {
            return Promise.resolve({
              json: () =>
                Promise.resolve({
                  error: "SPE-1 is starting",
                  spe: { id: "SPE-1", state: "starting", etaSeconds: 240 },
                  started: true,
                }),
              ok: false,
              status: 503,
            });
          }
          return mockResponse({
            datasetId: "tp-live",
            speId: "SPE-1",
            records: 3,
            relationships: 2,
            pseudonymised: true,
            untilStopped: true,
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

      const section = await screen.findByTestId("contracts-list");
      await user.click(within(section).getByTestId("spe-import-run"));

      expect(
        (await within(section).findByTestId("spe-import-starting")).textContent,
      ).toMatch(/SPE-1 is starting\. That takes about 4 minutes/);
      expect(within(section).queryByTestId("spe-import-error")).toBeNull();

      await user.click(within(section).getByTestId("spe-import-run"));
      const done = await within(section).findByTestId("spe-import-done");
      expect(done.textContent).toMatch(/in memory until it stops/);
      expect(within(section).queryByTestId("spe-import-starting")).toBeNull();
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

      const section = await screen.findByTestId("contracts-list");
      await user.click(within(section).getByTestId("spe-import-run"));

      expect(
        (await within(section).findByTestId("spe-import-error")).textContent,
      ).toMatch(/SPE-1 is not connected/);
      expect(within(section).queryByTestId("spe-import-done")).toBeNull();
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

      const section = await screen.findByTestId("contracts-list");
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
});
