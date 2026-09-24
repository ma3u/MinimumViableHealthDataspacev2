/**
 * Tests for the /overview page (ui/src/app/overview/page.tsx, issue #271).
 *
 * The list is the view: signals sorted worst first, a click opens the
 * detail panel with the trend, the chart, the description and the series.
 * The scene is an enhancement that reduced motion switches off.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildPatientView } from "@/lib/overview/patient";

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

// The 3D scene never renders in jsdom; the page only needs its presence.
vi.mock("next/dynamic", () => ({
  default: () => () => <div data-testid="overview-canvas" />,
}));

import OverviewPage from "@/app/overview/page";

const MOCK = join(__dirname, "../../../public/mock");
const read = (name: string) =>
  JSON.parse(readFileSync(join(MOCK, `${name}.json`), "utf-8"));

const VIEW = buildPatientView({
  asOf: "2026-09-23",
  profile: read("patient_profile_patient1"),
  insights: read("patient_insights"),
  research: read("patient_research"),
  observations: read("patient_observations"),
  holder: {
    did: "did:web:alpha-klinik.de:participant",
    name: "AlphaKlinik Berlin",
  },
  accessLog: [],
});

function answer(data: unknown, ok = true, status = 200) {
  mockFetchApi.mockResolvedValue({
    ok,
    status,
    json: () => Promise.resolve(data),
  });
}

function matchMedia(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
}

describe("OverviewPage", () => {
  beforeEach(() => {
    mockFetchApi.mockReset();
    matchMedia(false);
    Object.defineProperty(window, "ResizeObserver", {
      writable: true,
      configurable: true,
      value: class {
        observe() {}
        disconnect() {}
      },
    });
  });

  it("asks the patient's question and lists the signals worst first", async () => {
    answer(VIEW);
    render(<OverviewPage />);
    await waitFor(() =>
      expect(screen.getByTestId("overview-question")).toHaveTextContent(
        "Which parameters put me at risk",
      ),
    );
    // the test session is EDC_ADMIN, whose default view is the access body
    expect(mockFetchApi).toHaveBeenCalledWith("/api/overview?persona=hdab");
    const signals = screen.getAllByTestId("overview-signal");
    expect(signals.length).toBe(VIEW.signals.length);
    expect(signals[0]).toHaveAttribute("data-severity", "bad");
    expect(signals[0]).toHaveAttribute("data-node", "param:4548-4");
    const rank: Record<string, number> = { bad: 3, warn: 2, info: 1, ok: 0 };
    const ranks = signals.map((s) => rank[s.getAttribute("data-severity")!]);
    expect([...ranks].sort((a, b) => b - a)).toEqual(ranks);
    expect(screen.getByTestId("overview-canvas")).toBeInTheDocument();
  });

  it("opens the detail panel with trend, chart, description and series on a click", async () => {
    answer(VIEW);
    const user = userEvent.setup();
    render(<OverviewPage />);
    const first = (await screen.findAllByTestId("overview-signal"))[0];
    await user.click(first);
    const detail = await screen.findByTestId("overview-detail");
    expect(detail).toHaveTextContent("Hemoglobin A1c");
    expect(within(detail).getByTestId("overview-trend")).toHaveTextContent(
      "rising",
    );
    expect(within(detail).getByTestId("overview-trend")).toHaveTextContent(
      "7.6 %",
    );
    expect(within(detail).getByTestId("overview-chart")).toBeInTheDocument();
    expect(
      within(detail).getByTestId("overview-description"),
    ).toHaveTextContent("HbA1c");
    expect(within(detail).getAllByTestId("overview-series-row")).toHaveLength(
      6,
    );
    expect(
      within(detail).getByTestId("overview-toggle-expand"),
    ).toHaveTextContent("Fold");
    // close
    await user.click(within(detail).getByLabelText("Close details"));
    expect(screen.queryByTestId("overview-detail")).not.toBeInTheDocument();
  });

  it("leaves the scene out under reduced motion, and can switch it on", async () => {
    matchMedia(true);
    answer(VIEW);
    const user = userEvent.setup();
    render(<OverviewPage />);
    await screen.findByTestId("overview-question");
    expect(screen.queryByTestId("overview-canvas")).not.toBeInTheDocument();
    expect(screen.getByTestId("overview-scene-off")).toHaveTextContent(
      "reduced motion",
    );
    await user.click(screen.getByTestId("overview-scene-toggle"));
    expect(screen.getByTestId("overview-canvas")).toBeInTheDocument();
  });

  it("says when a persona is not implemented yet and links the issue", async () => {
    answer(read("overview_not_implemented"));
    render(<OverviewPage />);
    const err = await screen.findByTestId("overview-error");
    expect(err).toHaveTextContent("not implemented yet");
    expect(
      within(err).getByRole("link", { name: /issue #271/ }),
    ).toHaveAttribute("href", expect.stringContaining("/issues/271"));
  });
});
