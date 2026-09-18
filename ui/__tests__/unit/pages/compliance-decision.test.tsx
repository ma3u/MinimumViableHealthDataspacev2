/**
 * /compliance as the health data access body: the inbox ordering, the
 * Art. 68(4) clock and the decision form (issue #206, M2). The reader's view
 * is covered by compliance-page.test.tsx.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "fs";
import path from "path";

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: {
      user: {
        name: "MedReg officer",
        email: "regulator@health-dataspace.local",
      },
      roles: ["HDAB_AUTHORITY"],
    },
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

import CompliancePage from "@/app/compliance/page";

function response(data: unknown, ok = true, status = ok ? 200 : 400) {
  return Promise.resolve({ ok, status, json: () => Promise.resolve(data) });
}

const PENDING = {
  consumerId: "did:web:pharmaco.de:research",
  consumerName: "PharmaCo Research AG",
  consumerType: "DATA_USER",
  hasApplication: true,
  applicationStatus: "PENDING",
  hasApproval: false,
  approvalStatus: null,
  datasetId: null,
  datasetTitle: null,
  hasContract: false,
  ehdsArticle: null,
  applicationId: "app-pharmaco-medreg-2026-002",
  applicationName: "PharmaCo T2D Outcomes Study",
  submittedAt: "2026-09-01T09:00:00Z",
  requestedPurpose: "SCIENTIFIC_RESEARCH",
  requestedDatasetId: "dataset:synthea-fhir-r4-mvd",
  requestedDatasetTitle: "Synthea Synthetic FHIR R4 Patient Cohort",
  justification: "Outcomes of second-line T2D therapies.",
  ethicsCommitteeRef: "EC-PharmaCo-2026-011",
  approvalId: null,
  decidedAt: null,
  validUntil: null,
  decisionJustification: null,
  decisionDue: "2026-12-01T09:00:00Z",
  daysToDecision: 75,
};

const APPROVED = {
  ...PENDING,
  consumerId: "did:web:lmc.nl:clinic",
  consumerName: "Limburg Medical Centre",
  consumerType: "DATA_HOLDER",
  applicationStatus: "APPROVED",
  hasApproval: true,
  approvalStatus: "APPROVED",
  datasetId: "dataset:synthea-fhir-r4-mvd",
  datasetTitle: "Synthea Synthetic FHIR R4 Patient Cohort",
  hasContract: true,
  applicationId: "app-lmc-irs-2026-001",
  approvalId: "hdab-irs-lmc-2026-001",
  decidedAt: "2026-02-20T11:00:00Z",
  validUntil: "2027-02-20T23:59:59Z",
  decisionDue: "2026-05-01T08:30:00Z",
  daysToDecision: null,
};

const NONE = {
  ...PENDING,
  consumerId: "did:web:alpha-klinik.de:participant",
  consumerName: "AlphaKlinik Berlin",
  consumerType: "DATA_HOLDER",
  hasApplication: false,
  applicationStatus: null,
  applicationId: null,
  submittedAt: null,
  decisionDue: null,
  daysToDecision: null,
};

function setupMocks(decisionBody: unknown = null, decisionOk = true) {
  mockFetchApi.mockImplementation((url: string, init?: RequestInit) => {
    if (url === "/api/compliance/permits" && init?.method === "POST") {
      return response(decisionBody, decisionOk);
    }
    if (url.startsWith("/api/compliance?")) {
      return response({ compliant: false, chain: [] });
    }
    if (url.startsWith("/api/compliance")) {
      // Listed out of order on purpose: the page sorts.
      return response({
        consumers: [],
        datasets: [],
        matrix: [APPROVED, NONE, PENDING],
      });
    }
    return response({});
  });
}

describe("/compliance as the access body", () => {
  beforeEach(() => {
    mockFetchApi.mockReset();
  });

  it("puts the undecided application first, with the Art. 68(4) clock", async () => {
    setupMocks();
    render(<CompliancePage />);
    await screen.findByText("PharmaCo Research AG");
    const rows = screen.getAllByRole("row").slice(1); // skip the header
    expect(
      within(rows[0]).getByText("PharmaCo Research AG"),
    ).toBeInTheDocument();
    expect(
      within(rows[0]).getByText(/2026-12-01 · 75 days left/),
    ).toBeInTheDocument();
    expect(within(rows[1]).getByText("AlphaKlinik Berlin")).toBeInTheDocument();
    expect(screen.getByText("Decision due")).toBeInTheDocument();
  });

  it("issues a data permit from the row's decision form", async () => {
    setupMocks({
      permitId: "permit-app-pharmaco-medreg-2026-002",
      decision: "APPROVED",
      validUntil: "2027-09-17T23:59:59.000Z",
      publishBy: "2026-10-29",
      article: "Regulation (EU) 2025/327, Art. 68(3): data permit issued",
    });
    const user = userEvent.setup();
    render(<CompliancePage />);
    await user.click(await screen.findByText("PharmaCo Research AG"));

    const panel = await screen.findByTestId("application-panel");
    expect(
      within(panel).getByText("app-pharmaco-medreg-2026-002"),
    ).toBeInTheDocument();
    expect(
      within(panel).getByText(/Criteria assessed, Art\. 68\(1\)/),
    ).toBeInTheDocument();

    await user.click(
      within(panel).getByRole("button", { name: "Issue data permit" }),
    );

    await waitFor(() => {
      expect(
        within(panel).getByText(
          /Data permit permit-app-pharmaco-medreg-2026-002 issued/,
        ),
      ).toBeInTheDocument();
    });
    const call = mockFetchApi.mock.calls.find(
      (c) => c[0] === "/api/compliance/permits",
    );
    expect(call).toBeDefined();
    const sent = JSON.parse((call![1] as RequestInit).body as string);
    expect(sent).toMatchObject({
      applicationId: "app-pharmaco-medreg-2026-002",
      decision: "APPROVED",
      purpose: "SCIENTIFIC_RESEARCH",
      datasetId: "dataset:synthea-fhir-r4-mvd",
      criteria: { a: true, h: true },
    });
    // The matrix was re-read after the decision.
    expect(
      mockFetchApi.mock.calls.filter((c) => c[0] === "/api/compliance").length,
    ).toBeGreaterThan(1);
  });

  it("will not refuse without a justification", async () => {
    setupMocks();
    const user = userEvent.setup();
    render(<CompliancePage />);
    await user.click(await screen.findByText("PharmaCo Research AG"));
    const panel = await screen.findByTestId("application-panel");
    const refuse = within(panel).getByRole("button", { name: "Refuse" });
    expect(refuse).toBeDisabled();
    await user.type(
      within(panel).getByLabelText(/Justification/),
      "Minimisation plan insufficient.",
    );
    expect(refuse).toBeEnabled();
  });

  it("shows the route's error instead of pretending", async () => {
    setupMocks({ error: "A refusal needs a written justification" }, false);
    const user = userEvent.setup();
    render(<CompliancePage />);
    await user.click(await screen.findByText("PharmaCo Research AG"));
    const panel = await screen.findByTestId("application-panel");
    await user.click(
      within(panel).getByRole("button", { name: "Issue data permit" }),
    );
    expect(await within(panel).findByRole("alert")).toHaveTextContent(
      /justification/,
    );
  });

  it("revokes an issued permit with a reason (Art. 63(3))", async () => {
    setupMocks();
    mockFetchApi.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/compliance/permits/revoke" && init?.method === "POST") {
        return response({
          permitId: "hdab-irs-lmc-2026-001",
          decision: "REVOKED",
          article: "Regulation (EU) 2025/327, Art. 63(3): data permit revoked",
        });
      }
      if (url.startsWith("/api/compliance?")) {
        return response({ compliant: false, chain: [] });
      }
      if (url.startsWith("/api/compliance")) {
        return response({
          consumers: [],
          datasets: [],
          matrix: [APPROVED, NONE, PENDING],
        });
      }
      return response({});
    });
    const user = userEvent.setup();
    render(<CompliancePage />);
    await user.click(await screen.findByText("Limburg Medical Centre"));
    const panel = await screen.findByTestId("application-panel");
    const revoke = within(panel).getByRole("button", { name: "Revoke permit" });
    expect(revoke).toBeDisabled();
    await user.type(
      within(panel).getByLabelText(/Reason/),
      "Output left the SPE with direct identifiers.",
    );
    await user.click(revoke);
    await waitFor(() => {
      expect(
        within(panel).getByText(/Data permit hdab-irs-lmc-2026-001 revoked/),
      ).toBeInTheDocument();
    });
    const call = mockFetchApi.mock.calls.find(
      (c) => c[0] === "/api/compliance/permits/revoke",
    );
    const sent = JSON.parse((call![1] as RequestInit).body as string);
    expect(sent).toEqual({
      permitId: "hdab-irs-lmc-2026-001",
      reason: "Output left the SPE with direct identifiers.",
    });
  });

  it("cites the adopted regulation, not the 2022 proposal", () => {
    const src = readFileSync(
      path.join(process.cwd(), "src/app/compliance/page.tsx"),
      "utf-8",
    );
    expect(src).not.toMatch(/Art\. 4[5-9]\b/);
    expect(src).not.toContain("45–53");
    expect(src).toContain("Regulation (EU) 2025/327");
  });
});
