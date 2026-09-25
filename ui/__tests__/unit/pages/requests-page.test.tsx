/**
 * /requests: statistical requests (Art. 69) for the researcher and the
 * access body. Issue #206, M5.
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

import RequestsPage from "@/app/requests/page";

function response(data: unknown, ok = true) {
  return Promise.resolve({
    ok,
    status: ok ? 200 : 400,
    json: () => Promise.resolve(data),
  });
}

const FIXTURE = JSON.parse(
  readFileSync(path.join(process.cwd(), "public/mock/requests.json"), "utf-8"),
);

describe("/requests", () => {
  beforeEach(() => {
    mockFetchApi.mockReset();
    roles = ["HDAB_AUTHORITY"];
  });

  it("lists requests with their state and the answer table", async () => {
    mockFetchApi.mockImplementation(() => response(FIXTURE));
    render(<RequestsPage />);
    expect(await screen.findByText("Statistical requests")).toBeInTheDocument();
    expect(screen.getByText(/All requests \(3\)/)).toBeInTheDocument();
    expect(screen.getByText("awaiting decision")).toBeInTheDocument();
    expect(screen.getByText("answered")).toBeInTheDocument();
    expect(screen.getByText("refused")).toBeInTheDocument();
    const table = screen.getByTestId("answer-table");
    expect(within(table).getByText("112")).toBeInTheDocument();
    expect(
      screen.getByText(/A single patient's timeline is not a statistic/),
    ).toBeInTheDocument();
  });

  it("lets the access body approve, and reports the statistic", async () => {
    mockFetchApi.mockImplementation((url: string, init?: RequestInit) => {
      if (
        url === "/api/compliance/requests/decide" &&
        init?.method === "POST"
      ) {
        return response({
          answered: true,
          suppressedCells: 1,
          decision: "APPROVED",
        });
      }
      return response(FIXTURE);
    });
    const user = userEvent.setup();
    render(<RequestsPage />);
    const pending = (await screen.findAllByTestId("request-card"))[0];
    expect(
      within(pending).getByText("How many patients are there?"),
    ).toBeInTheDocument();
    await user.click(
      within(pending).getByRole("button", { name: "Approve and answer" }),
    );
    await waitFor(() => {
      expect(within(pending).getByRole("status")).toHaveTextContent(
        /Answered in anonymised statistical format, 1 small count/,
      );
    });
    const call = mockFetchApi.mock.calls.find(
      (c) => c[0] === "/api/compliance/requests/decide",
    );
    expect(JSON.parse((call![1] as RequestInit).body as string)).toMatchObject({
      requestId: "req-pharmaco-20260901-demo",
      decision: "APPROVED",
    });
  });

  it("lets a data user file a request", async () => {
    roles = ["EDC_USER_PARTICIPANT", "DATA_USER"];
    mockFetchApi.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/compliance/requests" && init?.method === "POST") {
        return response({ requestId: "req-pharmaco-20260918-ab12" });
      }
      return response({ ...FIXTURE, scope: "own", requests: [] });
    });
    const user = userEvent.setup();
    render(<RequestsPage />);
    await screen.findByText(/My requests \(0\)/);
    await user.click(
      screen.getByRole("button", { name: "Patients by gender" }),
    );
    await user.type(
      screen.getByLabelText(/Statistical content/),
      "Cohort by gender",
    );
    await user.click(screen.getByRole("button", { name: "File the request" }));
    expect(
      await screen.findByText(/Request req-pharmaco-20260918-ab12 filed/),
    ).toBeInTheDocument();
    const call = mockFetchApi.mock.calls.find(
      (c) =>
        c[0] === "/api/compliance/requests" &&
        (c[1] as RequestInit | undefined)?.method === "POST",
    );
    expect(JSON.parse((call![1] as RequestInit).body as string)).toMatchObject({
      question: "Patients by gender",
      purpose: "SCIENTIFIC_RESEARCH",
      statisticalContent: "Cohort by gender",
    });
    expect(
      screen.queryByRole("button", { name: "Approve and answer" }),
    ).not.toBeInTheDocument();
  });

  it("needs a session: on the protected path list", () => {
    const middleware = readFileSync(
      path.join(process.cwd(), "src/middleware.ts"),
      "utf-8",
    );
    expect(middleware).toContain('"/requests"');
  });
});

describe("/requests as a trusted data holder (Art. 72)", () => {
  beforeEach(() => {
    mockFetchApi.mockReset();
    roles = ["EDC_USER_PARTICIPANT", "DATA_HOLDER"];
  });

  it("shows the note, decides its own dataset's request and names the article", async () => {
    const pending = {
      ...FIXTURE.requests[0],
      requestId: "req-own-1",
      status: "PENDING",
      canDecide: true,
    };
    const decided = {
      ...FIXTURE.requests[0],
      requestId: "req-own-2",
      status: "ANSWERED",
      decidedAt: "2026-09-20T10:00:00Z",
      decidedUnder: "Art. 72",
      feeEur: 300,
      answer: [{ patientCount: 112 }],
      undecided: false,
    };
    mockFetchApi.mockImplementation((url: string, init?: RequestInit) => {
      if (
        url === "/api/compliance/requests/decide" &&
        init?.method === "POST"
      ) {
        return response({ answered: true, suppressedCells: 0 });
      }
      return response({
        requests: [pending, decided],
        scope: "holder",
        trustedHolder: true,
      });
    });
    render(<RequestsPage />);
    expect(
      await screen.findByTestId("trusted-holder-note"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Requests on my datasets, as a trusted holder/),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Decide as the trusted data holder · Art. 72"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("decided-under")).toHaveTextContent(
      "decided by the trusted data holder, Art. 72 · fee 300 EUR (Art. 62)",
    );
    await userEvent.click(screen.getByRole("button", { name: /approve/i }));
    await waitFor(() =>
      expect(
        screen.getByText(/Answered in anonymised statistical format/),
      ).toBeInTheDocument(),
    );
  });
});
