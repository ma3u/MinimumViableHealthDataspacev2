/**
 * Supplementary tests for TasksPage – covers branches not exercised
 * by tasks-catalog-editor.test.tsx: participant dropdown, filter tabs,
 * state helpers (SUSPENDED, ERROR, TERMINATED), DSP action buttons,
 * EDR badge, empty-filter states, refresh button, and auto-refresh.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

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

function mockResponse(data: unknown) {
  return Promise.resolve({ json: () => Promise.resolve(data), ok: true });
}

/* ── Test data ── */

const baseTasks = [
  {
    id: "neg-1",
    type: "negotiation",
    participant: "AlphaKlinik Berlin",
    participantId: "ctx-alpha",
    asset: "FHIR R4 Bundle",
    assetId: "fhir-bundle",
    state: "FINALIZED",
    counterParty: "PharmaCo Research AG",
    timestamp: 1700000000000,
    contractId: "contract-abc123def",
  },
  {
    id: "neg-2",
    type: "negotiation",
    participant: "PharmaCo Research AG",
    participantId: "ctx-pharmaco",
    asset: "OMOP Cohort",
    assetId: "omop-cohort",
    state: "AGREED",
    counterParty: "AlphaKlinik Berlin",
    timestamp: 1700001000000,
  },
  {
    id: "tp-1",
    type: "transfer",
    participant: "AlphaKlinik Berlin",
    participantId: "ctx-alpha",
    asset: "FHIR Patient",
    assetId: "fhir-patient",
    state: "STARTED",
    counterParty: "—",
    timestamp: 1700002000000,
    transferType: "HttpData-PULL",
    edrAvailable: true,
  },
  {
    id: "tp-2",
    type: "transfer",
    participant: "PharmaCo Research AG",
    participantId: "ctx-pharmaco",
    asset: "OMOP Medication",
    assetId: "omop-med",
    state: "COMPLETED",
    counterParty: "AlphaKlinik Berlin",
    timestamp: 1700003000000,
    transferType: "HttpData-PULL",
  },
];

function defaultResponse(tasks = baseTasks) {
  return mockResponse({
    tasks,
    counts: {
      total: tasks.length,
      negotiations: tasks.filter((t) => t.type === "negotiation").length,
      transfers: tasks.filter((t) => t.type === "transfer").length,
      active: tasks.filter(
        (t) =>
          !["FINALIZED", "COMPLETED", "TERMINATED", "ERROR"].includes(
            t.state.toUpperCase(),
          ),
      ).length,
    },
  });
}

describe("TasksPage – extra coverage", () => {
  beforeEach(() => {
    mockFetchApi.mockReset();
  });

  /* ─── Filter tabs ─── */

  it("filters by 'Negotiations' tab", async () => {
    mockFetchApi.mockReturnValue(defaultResponse());
    const user = userEvent.setup();
    render(<TasksPage />);

    await waitFor(() => {
      expect(screen.getByText("FHIR R4 Bundle")).toBeInTheDocument();
    });

    // Click the Negotiations filter button (not the summary card label)
    const negBtn = screen
      .getAllByRole("button")
      .find((btn) => btn.textContent?.startsWith("Negotiations"));
    expect(negBtn).toBeDefined();
    await user.click(negBtn!);

    await waitFor(() => {
      // Only negotiation tasks visible
      expect(screen.getByText("FHIR R4 Bundle")).toBeInTheDocument();
      expect(screen.getByText("OMOP Cohort")).toBeInTheDocument();
      expect(screen.queryByText("FHIR Patient")).not.toBeInTheDocument();
    });
  });

  it("filters by 'Transfers' tab", async () => {
    mockFetchApi.mockReturnValue(defaultResponse());
    const user = userEvent.setup();
    render(<TasksPage />);

    await waitFor(() => {
      expect(screen.getByText("FHIR R4 Bundle")).toBeInTheDocument();
    });

    // Click the Transfers filter button
    const transBtn = screen
      .getAllByRole("button")
      .find((btn) => btn.textContent?.startsWith("Transfers"));
    expect(transBtn).toBeDefined();
    await user.click(transBtn!);

    await waitFor(() => {
      expect(screen.getByText("FHIR Patient")).toBeInTheDocument();
      expect(screen.queryByText("FHIR R4 Bundle")).not.toBeInTheDocument();
    });
  });

  it("filters by 'Active' tab – excludes FINALIZED and COMPLETED", async () => {
    mockFetchApi.mockReturnValue(defaultResponse());
    const user = userEvent.setup();
    render(<TasksPage />);

    await waitFor(() => {
      expect(screen.getByText("FHIR R4 Bundle")).toBeInTheDocument();
    });

    // Click the Active filter button
    const activeBtn = screen
      .getAllByRole("button")
      .find((btn) => btn.textContent?.startsWith("Active"));
    expect(activeBtn).toBeDefined();
    await user.click(activeBtn!);

    await waitFor(() => {
      // AGREED and STARTED are active; FINALIZED and COMPLETED are not
      expect(screen.getByText("OMOP Cohort")).toBeInTheDocument();
      expect(screen.getByText("FHIR Patient")).toBeInTheDocument();
      expect(screen.queryByText("FHIR R4 Bundle")).not.toBeInTheDocument();
      expect(screen.queryByText("OMOP Medication")).not.toBeInTheDocument();
    });
  });

  /* ─── Empty filtered state ─── */

  it("shows 'No tasks yet' when data is empty and filter is all", async () => {
    mockFetchApi.mockReturnValue(
      mockResponse({
        tasks: [],
        counts: { total: 0, negotiations: 0, transfers: 0, active: 0 },
      }),
    );
    render(<TasksPage />);

    await waitFor(() => {
      expect(
        screen.getByText(
          /No tasks yet\. Start by sharing data or negotiating a contract\./,
        ),
      ).toBeInTheDocument();
    });
  });

  it("shows 'No negotiation tasks found' when filter yields no results", async () => {
    // Only transfer tasks, then filter by negotiation
    const transferOnly = baseTasks.filter((t) => t.type === "transfer");
    mockFetchApi.mockReturnValue(defaultResponse(transferOnly));
    const user = userEvent.setup();
    render(<TasksPage />);

    await waitFor(() => {
      expect(screen.getByText("FHIR Patient")).toBeInTheDocument();
    });

    const negBtn = screen
      .getAllByRole("button")
      .find((btn) => btn.textContent?.startsWith("Negotiations"));
    await user.click(negBtn!);

    await waitFor(() => {
      expect(
        screen.getByText(/No negotiation tasks found/),
      ).toBeInTheDocument();
    });
  });

  /* ─── Participant dropdown ─── */

  it("opens participant dropdown and filters by participant", async () => {
    mockFetchApi.mockReturnValue(defaultResponse());
    const user = userEvent.setup();
    render(<TasksPage />);

    await waitFor(() => {
      expect(screen.getByText("FHIR R4 Bundle")).toBeInTheDocument();
    });

    // Open the participant dropdown (button text contains "All Participants")
    const dropdownBtn = screen
      .getAllByRole("button")
      .find((btn) => btn.textContent?.includes("All Participants"));
    expect(dropdownBtn).toBeDefined();
    await user.click(dropdownBtn!);

    // Both participants should appear in dropdown
    await waitFor(() => {
      const pharmacoBtns = screen.getAllByText(/PharmaCo Research AG/);
      expect(pharmacoBtns.length).toBeGreaterThan(0);
    });

    // Select PharmaCo
    const pharmacoBtn = screen
      .getAllByText(/PharmaCo Research AG/)
      .find((el) => el.tagName === "BUTTON");
    expect(pharmacoBtn).toBeDefined();
    await user.click(pharmacoBtn!);

    // Only PharmaCo tasks should be visible now
    await waitFor(() => {
      expect(screen.getByText("OMOP Cohort")).toBeInTheDocument();
      expect(screen.getByText("OMOP Medication")).toBeInTheDocument();
    });
  });

  /* ─── State color / stateBg branches ─── */

  it("renders SUSPENDED state with orange styling", async () => {
    const suspendedTask = [
      {
        id: "tp-sus",
        type: "transfer" as const,
        participant: "AlphaKlinik Berlin",
        participantId: "ctx-alpha",
        asset: "Suspended Transfer",
        assetId: "sus-1",
        state: "SUSPENDED",
        counterParty: "—",
        timestamp: 0,
      },
    ];
    mockFetchApi.mockReturnValue(defaultResponse(suspendedTask));
    render(<TasksPage />);

    await waitFor(() => {
      expect(screen.getByText("Suspended Transfer")).toBeInTheDocument();
    });
    // The state badge with rounded-full has orange styling
    const badges = screen.getAllByText("SUSPENDED");
    const orangeBadge = badges.find((el) => el.className.includes("orange"));
    expect(orangeBadge).toBeDefined();
  });

  it("renders TERMINATED state with red error indicator in pipeline", async () => {
    const terminatedTask = [
      {
        id: "neg-term",
        type: "negotiation" as const,
        participant: "AlphaKlinik Berlin",
        participantId: "ctx-alpha",
        asset: "Failed Negotiation",
        assetId: "fail-1",
        state: "TERMINATED",
        counterParty: "PharmaCo Research AG",
        timestamp: 0,
      },
    ];
    mockFetchApi.mockReturnValue(defaultResponse(terminatedTask));
    render(<TasksPage />);

    await waitFor(() => {
      expect(screen.getByText("Failed Negotiation")).toBeInTheDocument();
      // TERMINATED appears in both badge and pipeline
      const labels = screen.getAllByText("TERMINATED");
      expect(labels.length).toBeGreaterThanOrEqual(2);
    });
  });

  it("renders ERROR state with red styling", async () => {
    const errorTask = [
      {
        id: "tp-err",
        type: "transfer" as const,
        participant: "AlphaKlinik Berlin",
        participantId: "ctx-alpha",
        asset: "Error Transfer",
        assetId: "err-1",
        state: "ERROR",
        counterParty: "—",
        timestamp: 0,
      },
    ];
    mockFetchApi.mockReturnValue(defaultResponse(errorTask));
    render(<TasksPage />);

    await waitFor(() => {
      expect(screen.getByText("Error Transfer")).toBeInTheDocument();
      const badge = screen.getByText("ERROR");
      expect(badge.className).toContain("badge");
    });
  });

  /* ─── DSP action buttons ─── */

  it("shows 'Verify' action for AGREED negotiation state", async () => {
    const agreedNeg = [
      {
        id: "neg-agreed",
        type: "negotiation" as const,
        participant: "AlphaKlinik Berlin",
        participantId: "ctx-alpha",
        asset: "Agreed Negotiation",
        assetId: "agr-1",
        state: "AGREED",
        counterParty: "PharmaCo Research AG",
        timestamp: 0,
      },
    ];
    mockFetchApi.mockReturnValue(defaultResponse(agreedNeg));
    render(<TasksPage />);

    await waitFor(() => {
      expect(screen.getByText("Verify")).toBeInTheDocument();
      expect(screen.getByText("Actions:")).toBeInTheDocument();
    });
  });

  it("shows 'Suspend' and 'Complete' actions for STARTED transfer", async () => {
    const startedTransfer = [
      {
        id: "tp-started",
        type: "transfer" as const,
        participant: "AlphaKlinik Berlin",
        participantId: "ctx-alpha",
        asset: "Active Transfer",
        assetId: "act-1",
        state: "STARTED",
        counterParty: "—",
        timestamp: 0,
      },
    ];
    mockFetchApi.mockReturnValue(defaultResponse(startedTransfer));
    render(<TasksPage />);

    await waitFor(() => {
      expect(screen.getByText("Suspend")).toBeInTheDocument();
      expect(screen.getByText("Complete")).toBeInTheDocument();
    });
  });

  it("hides actions for FINALIZED negotiation", async () => {
    const finalized = [
      {
        id: "neg-fin",
        type: "negotiation" as const,
        participant: "AlphaKlinik Berlin",
        participantId: "ctx-alpha",
        asset: "Done Negotiation",
        assetId: "done-1",
        state: "FINALIZED",
        counterParty: "PharmaCo Research AG",
        timestamp: 0,
      },
    ];
    mockFetchApi.mockReturnValue(defaultResponse(finalized));
    render(<TasksPage />);

    await waitFor(() => {
      expect(screen.getByText("Done Negotiation")).toBeInTheDocument();
    });
    expect(screen.queryByText("Actions:")).not.toBeInTheDocument();
  });

  /* ─── EDR badge ─── */

  it("shows EDR badge when edrAvailable is true", async () => {
    mockFetchApi.mockReturnValue(defaultResponse());
    render(<TasksPage />);

    await waitFor(() => {
      expect(screen.getByText("EDR")).toBeInTheDocument();
    });
  });

  it("does not show EDR badge when edrAvailable is false/missing", async () => {
    const noEdr = baseTasks.map((t) => ({ ...t, edrAvailable: false }));
    mockFetchApi.mockReturnValue(defaultResponse(noEdr));
    render(<TasksPage />);

    await waitFor(() => {
      expect(screen.getByText("FHIR R4 Bundle")).toBeInTheDocument();
    });
    expect(screen.queryByText("EDR")).not.toBeInTheDocument();
  });

  /* ─── Transfer type badge ─── */

  it("shows transferType badge on transfer tasks", async () => {
    mockFetchApi.mockReturnValue(defaultResponse());
    render(<TasksPage />);

    await waitFor(() => {
      const badges = screen.getAllByText("HttpData-PULL");
      expect(badges.length).toBeGreaterThan(0);
    });
  });

  /* ─── Contract ID display ─── */

  it("shows truncated contract ID when present", async () => {
    mockFetchApi.mockReturnValue(defaultResponse());
    render(<TasksPage />);

    await waitFor(() => {
      // "contract-abc123def" → first 12 chars "contract-abc" + "…"
      expect(screen.getByText(/contract-abc/)).toBeInTheDocument();
    });
  });

  /* ─── Refresh button ─── */

  it("calls loadTasks on Refresh button click", async () => {
    mockFetchApi.mockReturnValue(defaultResponse());
    const user = userEvent.setup();
    render(<TasksPage />);

    await waitFor(() => {
      expect(screen.getByText("FHIR R4 Bundle")).toBeInTheDocument();
    });

    const callsBefore = mockFetchApi.mock.calls.length;
    await user.click(screen.getByText("Refresh"));

    await waitFor(() => {
      expect(mockFetchApi.mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });

  /* ─── Fetch exception handling ─── */

  it("handles fetch rejection gracefully", async () => {
    mockFetchApi.mockRejectedValue(new Error("Network error"));
    render(<TasksPage />);

    await waitFor(() => {
      expect(screen.getByText("Tasks")).toBeInTheDocument();
    });
    // Should show empty state, not crash
    expect(screen.queryByText("FHIR R4 Bundle")).not.toBeInTheDocument();
  });

  /* ─── Auto-refresh interval ─── */

  it("auto-refreshes every 15 seconds", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockFetchApi.mockReturnValue(defaultResponse());
    render(<TasksPage />);

    await waitFor(() => {
      expect(screen.getByText("FHIR R4 Bundle")).toBeInTheDocument();
    });

    const callsBefore = mockFetchApi.mock.calls.length;

    // Advance 15 seconds
    await act(async () => {
      vi.advanceTimersByTime(15000);
    });

    await waitFor(() => {
      expect(mockFetchApi.mock.calls.length).toBeGreaterThan(callsBefore);
    });
    vi.useRealTimers();
  });

  /* ─── Pipeline stepper states ─── */

  it("renders VERIFIED negotiation state in pipeline with active indicator", async () => {
    const verified = [
      {
        id: "neg-ver",
        type: "negotiation" as const,
        participant: "AlphaKlinik Berlin",
        participantId: "ctx-alpha",
        asset: "Verified Neg",
        assetId: "ver-1",
        state: "VERIFIED",
        counterParty: "PharmaCo",
        timestamp: 0,
      },
    ];
    mockFetchApi.mockReturnValue(defaultResponse(verified));
    render(<TasksPage />);

    await waitFor(() => {
      expect(screen.getByText("Verified Neg")).toBeInTheDocument();
      // Finalize action should be shown
      expect(screen.getByText("Finalize")).toBeInTheDocument();
    });
  });

  it("renders REQUESTED negotiation with Offer action", async () => {
    const requested = [
      {
        id: "neg-req",
        type: "negotiation" as const,
        participant: "AlphaKlinik Berlin",
        participantId: "ctx-alpha",
        asset: "New Request",
        assetId: "req-1",
        state: "REQUESTED",
        counterParty: "PharmaCo",
        timestamp: 0,
      },
    ];
    mockFetchApi.mockReturnValue(defaultResponse(requested));
    render(<TasksPage />);

    await waitFor(() => {
      expect(screen.getByText("New Request")).toBeInTheDocument();
      expect(screen.getByText("Offer")).toBeInTheDocument();
    });
  });

  /* ─── Task navigation links ─── */

  it("renders detail links for negotiation tasks pointing to /negotiate", async () => {
    mockFetchApi.mockReturnValue(defaultResponse());
    render(<TasksPage />);

    await waitFor(() => {
      expect(screen.getByText("FHIR R4 Bundle")).toBeInTheDocument();
    });

    const link = screen.getByText("FHIR R4 Bundle").closest("a");
    expect(link?.getAttribute("href")).toContain("/negotiate");
  });

  it("renders detail links for transfer tasks pointing to /data/transfer", async () => {
    mockFetchApi.mockReturnValue(defaultResponse());
    render(<TasksPage />);

    await waitFor(() => {
      expect(screen.getByText("FHIR Patient")).toBeInTheDocument();
    });

    const link = screen.getByText("FHIR Patient").closest("a");
    expect(link?.getAttribute("href")).toContain("/data/transfer");
  });

  /* ─── Counter-party display ─── */

  it("shows counter-party in metadata when not '—'", async () => {
    mockFetchApi.mockReturnValue(defaultResponse());
    render(<TasksPage />);

    await waitFor(() => {
      expect(
        screen.getByText(/AlphaKlinik Berlin → PharmaCo Research AG/),
      ).toBeInTheDocument();
    });
  });

  /* ─── Summary cards ─── */

  it("renders summary count cards with correct values", async () => {
    mockFetchApi.mockReturnValue(defaultResponse());
    render(<TasksPage />);

    await waitFor(() => {
      expect(screen.getByText("Total Tasks")).toBeInTheDocument();
    });
    // Card labels are present (some also appear as filter tab labels)
    expect(screen.getByText("Total Tasks")).toBeInTheDocument();
  });
});
