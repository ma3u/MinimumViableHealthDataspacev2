/**
 * /applications: the data user's application with the eleven items of Art.
 * 67(2), the clock, the completion form and the results form. Issue #206.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "fs";
import path from "path";

let roles: string[] = ["EDC_USER_PARTICIPANT", "DATA_USER"];
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

import ApplicationsPage from "@/app/applications/page";

function response(data: unknown, ok = true) {
  return Promise.resolve({
    ok,
    status: ok ? 200 : 400,
    json: () => Promise.resolve(data),
  });
}

const FIXTURE = JSON.parse(
  readFileSync(
    path.join(process.cwd(), "public/mock/applications.json"),
    "utf-8",
  ),
);

const DECIDED = {
  ...FIXTURE.applications[1],
  applicationId: "app-pharmaco-20260901-perm",
  status: "APPROVED",
  decision: "APPROVED",
  permitId: "permit-app-pharmaco-20260901-perm",
  decidedAt: "2026-09-10T10:00:00Z",
  validUntil: "2027-09-10T23:59:59Z",
  clockState: "decided",
  decisionDue: null,
  daysToDecision: null,
  undecided: false,
};
const REFUSED = {
  ...DECIDED,
  applicationId: "app-pharmaco-20260901-ref",
  decision: "REJECTED",
  permitId: "permit-app-pharmaco-20260901-ref",
  decisionJustification: "Data minimisation not shown",
  statisticalAlternativeOffered: true,
};
const REVOKED = {
  ...DECIDED,
  applicationId: "app-pharmaco-20260901-rev",
  decision: "REVOKED",
  extensionReason: "linkage across two holders",
  extended: true,
};

describe("/applications", () => {
  beforeEach(() => {
    mockFetchApi.mockReset();
    roles = ["EDC_USER_PARTICIPANT", "DATA_USER"];
  });

  it("lists the applications with their clock, completeness and decision", async () => {
    mockFetchApi.mockImplementation(() =>
      response({
        ...FIXTURE,
        applications: [...FIXTURE.applications, DECIDED, REFUSED, REVOKED],
      }),
    );
    render(<ApplicationsPage />);
    expect(
      await screen.findByText("Data permit applications"),
    ).toBeInTheDocument();
    expect(screen.getByText(/My applications \(5\)/)).toBeInTheDocument();
    const cards = screen.getAllByTestId("application-card");
    expect(cards).toHaveLength(5);
    const incomplete = cards[0];
    expect(
      within(incomplete).getByTestId("application-status"),
    ).toHaveTextContent("incomplete, please complete");
    expect(
      within(incomplete).getByTestId("application-clock"),
    ).toHaveTextContent("stopped; complete by 2026-10-13");
    expect(
      within(incomplete).getByTestId("application-completeness"),
    ).toHaveTextContent("9 of 11; missing (a) (i)");
    expect(within(incomplete).getByTestId("complete-form")).toBeInTheDocument();
    const pending = cards[1];
    expect(
      within(pending).getByTestId("application-completeness"),
    ).toHaveTextContent("complete, 11 of 11");
    expect(within(pending).getByTestId("application-fee")).toHaveTextContent(
      "EUR",
    );
    expect(within(cards[2]).getByTestId("results-form")).toBeInTheDocument();
    expect(
      within(cards[2]).getByText(
        /data permit permit-app-pharmaco-20260901-perm issued/,
      ),
    ).toBeInTheDocument();
    expect(
      within(cards[3]).getByText(/anonymised statistical answer instead/),
    ).toBeInTheDocument();
    expect(
      within(cards[4]).getByTestId("application-status"),
    ).toHaveTextContent("permit revoked");
    expect(
      within(cards[4]).getByText(/linkage across two holders/),
    ).toBeInTheDocument();
  });

  it("files an application from the form and reports the completeness", async () => {
    mockFetchApi.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/compliance/applications" && init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        expect(body.identifiability).toBe("PSEUDONYMISED");
        expect(body.art71Exception).toBe(false);
        return response({
          applicationId: "app-pharmaco-20260925-new",
          decisionDue: "2026-12-25T10:00:00Z",
          completeness: { complete: true, present: 11, total: 11, missing: [] },
        });
      }
      return response(FIXTURE);
    });
    render(<ApplicationsPage />);
    await screen.findByText("Data permit applications");
    const user = userEvent.setup();
    await user.clear(screen.getByLabelText("Title of the project"));
    await user.type(screen.getByLabelText("Title of the project"), "A test");
    await user.selectOptions(
      document.getElementById("apply-category") as HTMLSelectElement,
      "ACADEMIC",
    );
    await user.click(
      screen.getByRole("button", { name: "File the application" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Application app-pharmaco-20260925-new filed, 11 of 11 items; the access body decides by 2026-12-25",
      ),
    );
  });

  it("shows the route's error when filing fails", async () => {
    mockFetchApi.mockImplementation((url: string, init?: RequestInit) =>
      init?.method === "POST"
        ? response(
            { error: "purpose must be one of the Art. 53(1) purposes" },
            false,
          )
        : response(FIXTURE),
    );
    render(<ApplicationsPage />);
    await screen.findByText("Data permit applications");
    await userEvent.click(
      screen.getByRole("button", { name: "File the application" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Art. 53(1)"),
    );
  });

  it("completes a stopped application and the clock runs again", async () => {
    mockFetchApi.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/compliance/applications/complete") {
        const body = JSON.parse(String(init?.body));
        expect(body.applicationId).toBe("app-pharmaco-medreg-2026-003");
        return response({
          completeness: { complete: true, present: 11, total: 11, missing: [] },
          decisionDue: "2026-12-25T10:00:00Z",
        });
      }
      return response(FIXTURE);
    });
    render(<ApplicationsPage />);
    await screen.findByText("Data permit applications");
    const form = screen.getByTestId("complete-form");
    expect(form).toHaveTextContent("Complete the application by 2026-10-13");
    const user = userEvent.setup();
    await user.type(
      within(form).getByLabelText(/natural persons who will access/),
      "Dr A. Weber",
    );
    await user.click(
      within(form).getByRole("button", { name: "Send the missing items" }),
    );
    await waitFor(() =>
      expect(within(form).getByRole("status")).toHaveTextContent(
        "Complete application received; the access body decides by 2026-12-25",
      ),
    );
  });

  it("says what is still missing after a partial completion", async () => {
    mockFetchApi.mockImplementation((url: string) =>
      url === "/api/compliance/applications/complete"
        ? response({
            completeness: {
              complete: false,
              present: 10,
              total: 11,
              missing: [{ item: "i", label: "Tools" }],
            },
          })
        : response(FIXTURE),
    );
    render(<ApplicationsPage />);
    await screen.findByText("Data permit applications");
    const form = screen.getByTestId("complete-form");
    await userEvent.click(
      within(form).getByRole("button", { name: "Send the missing items" }),
    );
    await waitFor(() =>
      expect(within(form).getByRole("status")).toHaveTextContent(
        "Still missing: (i)",
      ),
    );
  });

  it("communicates results under an issued permit", async () => {
    mockFetchApi.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/compliance/results") {
        const body = JSON.parse(String(init?.body));
        expect(body.permitId).toBe(DECIDED.permitId);
        expect(body.kind).toBe("IT_PRODUCT");
        return response({ resultId: "result-1", onTime: true });
      }
      return response({ ...FIXTURE, applications: [DECIDED] });
    });
    render(<ApplicationsPage />);
    await screen.findByText("Data permit applications");
    const form = screen.getByTestId("results-form");
    expect(form).toHaveTextContent("due by 2029-03-10");
    const user = userEvent.setup();
    await user.selectOptions(within(form).getByLabelText("Kind"), "IT_PRODUCT");
    await user.click(
      within(form).getByRole("button", { name: "Communicate results" }),
    );
    await waitFor(() =>
      expect(within(form).getByRole("status")).toHaveTextContent(
        "Result result-1 communicated within the 18 months",
      ),
    );
  });

  it("shows the error when the list cannot be read, and no form to a patient", async () => {
    roles = ["PATIENT"];
    mockFetchApi.mockImplementation(() =>
      response({ error: "Neo4j unavailable" }, false),
    );
    render(<ApplicationsPage />);
    expect(await screen.findByText("Neo4j unavailable")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "File the application" }),
    ).toBeNull();
  });
});
