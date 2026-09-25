/**
 * /supervision: findings of non-compliance, views, measures and requests for
 * information (Art. 63), for the access body and for the party. Issue #206.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "fs";
import path from "path";

let roles: string[] = ["HDAB_AUTHORITY"];
vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { name: "Test" }, roles },
    status: "authenticated",
  }),
  signIn: vi.fn(),
  signOut: vi.fn(),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const mockFetchApi = vi.fn();
vi.mock("@/lib/api", () => ({
  fetchApi: (...args: unknown[]) => mockFetchApi(...args),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
  }: {
    href: string;
    children: React.ReactNode;
  }) => <a href={href}>{children}</a>,
}));

import SupervisionPage from "@/app/supervision/page";

function response(data: unknown, ok = true) {
  return Promise.resolve({
    ok,
    status: ok ? 200 : 400,
    json: () => Promise.resolve(data),
  });
}

const FINDINGS = JSON.parse(
  readFileSync(path.join(process.cwd(), "public/mock/findings.json"), "utf-8"),
);
const INFO = JSON.parse(
  readFileSync(
    path.join(process.cwd(), "public/mock/information_requests.json"),
    "utf-8",
  ),
);
const OPEN_FINDING = {
  ...FINDINGS.findings[0],
  findingId: "finding-open-1",
  status: "OPEN",
  views: null,
  respondedAt: null,
  measure: null,
  measureNote: null,
  closedAt: null,
  daysToRespond: 20,
  gdprBreach: false,
};
const VIEWS_FINDING = {
  ...OPEN_FINDING,
  findingId: "finding-views-1",
  status: "VIEWS_RECEIVED",
  views: "It was a test file.",
  respondedAt: "2026-09-19T14:00:00Z",
};
const ANSWERED_INFO = {
  ...INFO.requests[0],
  requestId: "info-answered-1",
  status: "ANSWERED",
  answer: "Two aggregate tables.",
  answeredAt: "2026-09-22T09:00:00Z",
  daysToAnswer: null,
};

function graph(overrides: Record<string, unknown> = {}) {
  return (url: string, init?: RequestInit) => {
    if (init?.method === "POST" && url in overrides) {
      return response(overrides[url]);
    }
    if (url === "/api/compliance/findings") {
      return response({
        findings: [OPEN_FINDING, VIEWS_FINDING, FINDINGS.findings[0]],
      });
    }
    if (url === "/api/compliance/information-requests") {
      return response({ requests: [INFO.requests[0], ANSWERED_INFO] });
    }
    if (url === "/api/compliance") {
      return response({
        consumers: [
          {
            id: "did:web:pharmaco.de:research",
            name: "PharmaCo Research AG",
            type: "DATA_USER",
          },
          { id: "did:web:medreg.de:hdab", name: "MedReg DE", type: "HDAB" },
        ],
      });
    }
    if (url === "/api/permits") {
      return response({
        entries: [
          {
            permitId: "permit-app-1",
            applicantDid: "did:web:pharmaco.de:research",
            outcome: "permit issued",
            datasetTitle: "Synthea",
          },
          { permitId: null, outcome: "pending" },
        ],
      });
    }
    return response({ error: `unexpected ${url}` }, false);
  };
}

describe("/supervision as the access body", () => {
  beforeEach(() => {
    mockFetchApi.mockReset();
    roles = ["HDAB_AUTHORITY"];
  });

  it("lists findings and information requests with their state", async () => {
    mockFetchApi.mockImplementation(graph());
    render(<SupervisionPage />);
    expect(await screen.findByText("Supervision")).toBeInTheDocument();
    expect(await screen.findByText(/Findings \(3\)/)).toBeInTheDocument();
    const cards = screen.getAllByTestId("finding-card");
    expect(
      within(cards[0]).getByTestId("supervision-status"),
    ).toHaveTextContent("open, views awaited");
    expect(
      within(cards[0]).getByTestId("finding-respond-by"),
    ).toHaveTextContent("(20 days)");
    expect(
      within(cards[1]).getByText(/It was a test file/),
    ).toBeInTheDocument();
    expect(within(cards[2]).getByTestId("finding-measure")).toHaveTextContent(
      "data permit revoked (Art. 63(3))",
    );
    expect(
      within(cards[2]).getByText(/supervisory authority has been informed/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Requests for information \(2\)/),
    ).toBeInTheDocument();
    expect(screen.getByTestId("information-answer")).toHaveTextContent(
      "Two aggregate tables.",
    );
    // the party select excludes the access body itself
    const party = screen.getByLabelText("Party") as HTMLSelectElement;
    await waitFor(() => expect(party.options).toHaveLength(1));
    expect(party.options[0].textContent).toBe("PharmaCo Research AG");
  });

  it("records a finding and sends an information request", async () => {
    mockFetchApi.mockImplementation(
      graph({
        "/api/compliance/findings": {
          findingId: "finding-pharmaco-20260925-x",
          partyName: "PharmaCo Research AG",
          respondBy: "2026-10-23T10:00:00Z",
        },
        "/api/compliance/information-requests": {
          requestId: "info-pharmaco-20260925-x",
          answerBy: "2026-10-23T10:00:00Z",
        },
      }),
    );
    render(<SupervisionPage />);
    await screen.findByText(/Findings \(3\)/);
    const user = userEvent.setup();
    await waitFor(() =>
      expect(
        (screen.getByLabelText(/Permit concerned/) as HTMLSelectElement)
          .options,
      ).toHaveLength(2),
    );
    await user.selectOptions(
      screen.getByLabelText(/Permit concerned/),
      "permit-app-1",
    );
    await user.click(screen.getByRole("button", { name: "Record and notify" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Finding finding-pharmaco-20260925-x recorded; PharmaCo Research AG states its views by 2026-10-23 (Art. 63(2)); the supervisory authority is informed.",
      ),
    );
    const posted = JSON.parse(
      String(
        mockFetchApi.mock.calls.find(
          (c) => c[0] === "/api/compliance/findings" && c[1]?.method === "POST",
        )?.[1]?.body,
      ),
    );
    expect(posted.permitId).toBe("permit-app-1");
    expect(posted.gdprBreach).toBe(true);

    await user.click(screen.getByRole("button", { name: "Send the request" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Information request info-pharmaco-20260925-x sent; answer by 2026-10-23",
      ),
    );
  });

  it("closes a finding with a fine, an exclusion or a revocation", async () => {
    mockFetchApi.mockImplementation(
      graph({
        "/api/compliance/findings/close": {
          permitRevoked: true,
          permitId: "permit-app-1",
        },
      }),
    );
    render(<SupervisionPage />);
    await screen.findByText(/Findings \(3\)/);
    const card = screen.getAllByTestId("finding-card")[0];
    const user = userEvent.setup();
    const measure = within(card).getByLabelText(/Measure, Art. 63\(3\)/);
    await user.selectOptions(measure, "FINE");
    expect(within(card).getByLabelText("Fine, EUR")).toBeInTheDocument();
    await user.selectOptions(measure, "EXCLUSION");
    expect(
      within(card).getByLabelText(/Exclusion, months/),
    ).toBeInTheDocument();
    await user.selectOptions(measure, "REVOCATION");
    await user.type(
      within(card).getByLabelText(/Reason/),
      "Identifiers left the SPE",
    );
    await user.click(
      within(card).getByRole("button", { name: "Close with this measure" }),
    );
    await waitFor(() =>
      expect(within(card).getByRole("status")).toHaveTextContent(
        "Closed; data permit permit-app-1 revoked (Art. 63(3))",
      ),
    );
  });

  it("shows the route's error on a failed close", async () => {
    mockFetchApi.mockImplementation((url: string, init?: RequestInit) =>
      url === "/api/compliance/findings/close" && init?.method === "POST"
        ? response({ error: "A measure needs a written reason" }, false)
        : graph()(url, init),
    );
    render(<SupervisionPage />);
    await screen.findByText(/Findings \(3\)/);
    const card = screen.getAllByTestId("finding-card")[0];
    const user = userEvent.setup();
    await user.selectOptions(
      within(card).getByLabelText(/Measure, Art. 63\(3\)/),
      "NONE",
    );
    await user.click(
      within(card).getByRole("button", { name: "Close with this measure" }),
    );
    await waitFor(() =>
      expect(within(card).getByRole("status")).toHaveTextContent(
        "A measure needs a written reason",
      ),
    );
  });
});

describe("/supervision as the party", () => {
  beforeEach(() => {
    mockFetchApi.mockReset();
    roles = ["EDC_USER_PARTICIPANT", "DATA_USER"];
  });

  it("states its views and answers an information request", async () => {
    mockFetchApi.mockImplementation(
      graph({
        "/api/compliance/findings/respond": { status: "VIEWS_RECEIVED" },
        "/api/compliance/information-requests/answer": { status: "ANSWERED" },
      }),
    );
    render(<SupervisionPage />);
    expect(
      await screen.findByText(/Findings against you \(3\)/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Record and notify" }),
    ).toBeNull();
    const user = userEvent.setup();
    const card = screen.getAllByTestId("finding-card")[0];
    await user.type(within(card).getByRole("textbox"), "It was a test file.");
    await user.click(within(card).getByRole("button", { name: "Send views" }));
    await waitFor(() =>
      expect(within(card).getByRole("status")).toHaveTextContent(
        "Your views are on record",
      ),
    );
    const req = screen.getAllByTestId("information-request-card")[0];
    await user.type(within(req).getByLabelText("Your answer"), "Two tables.");
    await user.click(within(req).getByRole("button", { name: "Send answer" }));
    await waitFor(() =>
      expect(within(req).getByRole("status")).toHaveTextContent(
        "Answer on record.",
      ),
    );
  });

  it("shows the reason when the graph is away", async () => {
    mockFetchApi.mockImplementation(() =>
      response({ error: "Neo4j unavailable" }, false),
    );
    render(<SupervisionPage />);
    expect(await screen.findByText("Neo4j unavailable")).toBeInTheDocument();
  });
});
