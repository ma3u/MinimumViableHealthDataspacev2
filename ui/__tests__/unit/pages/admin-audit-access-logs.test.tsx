/**
 * The Access Logs tab of /admin/audit: the criticality of each access, its
 * reasons in the opened row, the criticality filter, and the Test badge and
 * checkbox for forged CI sessions.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockFetchApi = vi.fn();
vi.mock("@/lib/api", () => ({
  fetchApi: (...args: unknown[]) => mockFetchApi(...args),
}));

import { AccessLogSection } from "@/app/admin/audit/_components/AccessLogSection";

/** The CI smoke's read of 2026-11-01, now under its test identity. */
const CI_SMOKE = {
  id: "te-ci",
  accessedAt: "2026-11-01T06:12:00Z",
  consumerDid: "did:web:ci.test:participant",
  accessType: "QUERY",
  purpose: "GET /federated/stats",
  bytesAccessed: 1510,
  endpoint: "/federated/stats",
  method: "GET",
  statusCode: 200,
  resultCount: 1,
};

const FHIR_NO_PERMIT = {
  id: "te-fhir",
  accessedAt: "2026-10-30T09:00:00Z",
  consumerDid: "did:web:pharmaco.de:research",
  consumerName: "PharmaCo Research AG",
  consumerCountry: "DE",
  providerName: "AlphaKlinik Berlin",
  providerCountry: "DE",
  accessType: "DATA_READ",
  purpose: "SCIENTIFIC_RESEARCH",
  bytesAccessed: 125000,
  endpoint: "/fhir/Patient",
  method: "GET",
  statusCode: 200,
  resultCount: 42,
};

const FHIR_PERMIT = {
  ...FHIR_NO_PERMIT,
  id: "te-fhir-permit",
  permitId: "hdab-decision-medreg-2025-001",
  permitStatus: "APPROVED",
  contractId: "contract-fhir-t2d-001",
};

const LOGS = [CI_SMOKE, FHIR_NO_PERMIT, FHIR_PERMIT];

function chipLevels() {
  return screen
    .getAllByTestId("criticality-chip")
    .map((c) => c.getAttribute("data-level"));
}

describe("Access Logs: criticality and test identities", () => {
  beforeEach(() => {
    mockFetchApi.mockReset();
    // RetentionLine asks for the retention state; none is fine here.
    mockFetchApi.mockResolvedValue({ ok: true, json: async () => ({}) });
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows a criticality chip per row", () => {
    render(<AccessLogSection logs={LOGS} />);
    expect(
      screen.getByRole("columnheader", { name: "Criticality" }),
    ).toBeInTheDocument();
    expect(chipLevels()).toEqual(["low", "high", "medium"]);
    const rows = screen.getAllByTestId("access-log-row");
    expect(within(rows[0]).getByText("Low")).toBeInTheDocument();
    expect(within(rows[1]).getByText("High")).toBeInTheDocument();
    expect(within(rows[2]).getByText("Medium")).toBeInTheDocument();
  });

  it("lists the reasons in the opened row", async () => {
    const user = userEvent.setup();
    render(<AccessLogSection logs={LOGS} />);
    await user.click(screen.getAllByTestId("access-log-row")[0]);
    const reasons = await screen.findByTestId("criticality-reasons");
    expect(within(reasons).getByText("aggregate counts only")).toBeVisible();
    expect(within(reasons).getByText("automated test")).toBeVisible();

    await user.click(screen.getAllByTestId("access-log-row")[1]);
    const all = screen.getAllByTestId("criticality-reasons");
    expect(
      all.some((r) => within(r).queryByText("no data permit or contract")),
    ).toBe(true);
  });

  it("filters by criticality", async () => {
    const user = userEvent.setup();
    render(<AccessLogSection logs={LOGS} />);
    await user.selectOptions(screen.getByTestId("criticality-filter"), "high");
    expect(chipLevels()).toEqual(["high"]);
    expect(screen.getByText("2 hidden by the filters")).toBeInTheDocument();
    await user.selectOptions(screen.getByTestId("criticality-filter"), "");
    expect(chipLevels()).toHaveLength(3);
  });

  it("marks a forged CI session with a Test badge and can hide it", async () => {
    const user = userEvent.setup();
    render(<AccessLogSection logs={LOGS} />);
    const badges = screen.getAllByTestId("test-identity-badge");
    expect(badges).toHaveLength(1);
    expect(badges[0]).toHaveTextContent("Test");
    expect(
      within(screen.getAllByTestId("access-log-row")[0]).getByTestId(
        "test-identity-badge",
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByLabelText("Hide automated tests"));
    expect(screen.queryByTestId("test-identity-badge")).toBeNull();
    expect(screen.getAllByTestId("access-log-row")).toHaveLength(2);
    expect(screen.getByText("1 hidden by the filters")).toBeInTheDocument();
  });

  it("says so when the filters hide every row", async () => {
    const user = userEvent.setup();
    render(<AccessLogSection logs={[CI_SMOKE]} />);
    await user.click(screen.getByLabelText("Hide automated tests"));
    expect(
      screen.getByText("No access matches the filters"),
    ).toBeInTheDocument();
  });
});
