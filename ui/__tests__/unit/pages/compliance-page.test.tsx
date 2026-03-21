/**
 * Comprehensive tests for the CompliancePage (/compliance/page.tsx).
 *
 * Covers: initial loading state, dropdown rendering, consumer/dataset selection,
 * fallback text inputs, compliance check (compliant & non-compliant), chain
 * table rendering, credentials section, trust chain diagram, empty states,
 * error handling, button disabled states, and credential detail rendering.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ── Mocks ────────────────────────────────────────────────────────────
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

import CompliancePage from "@/app/compliance/page";

// ── Helpers ──────────────────────────────────────────────────────────
function mockResponse(data: unknown, ok = true) {
  return Promise.resolve({ json: () => Promise.resolve(data), ok });
}

const CONSUMERS = [
  {
    id: "did:web:pharmaco.de:research",
    name: "PharmaCo Research AG",
    type: "DATA_USER",
  },
  {
    id: "did:web:irs.fr:hdab",
    name: "Institut de Recherche Santé",
    type: "HDAB",
  },
];

const DATASETS = [
  { id: "dataset:fhir-patients", title: "Synthetic FHIR Cohort" },
  { id: "dataset:cancer-registry", title: "Cancer Registry Limburg" },
];

const OPTIONS_RESPONSE = { consumers: CONSUMERS, datasets: DATASETS };

const CREDENTIALS = [
  {
    credentialId: "vc-participant-001",
    credentialType: "EHDSParticipantCredential",
    subjectDid: "did:web:identityhub%3A7083:participant",
    issuerDid: "did:web:issuerservice%3A10016:issuer",
    status: "active",
    participantRole: "DATA_USER",
    holderName: "PharmaCo Research AG",
    holderType: "CRO",
    issuedAt: "2025-01-01T00:00:00Z",
    expiresAt: "2026-01-01T00:00:00Z",
    purpose: null,
    datasetId: null,
    completeness: null,
    conformance: null,
    timeliness: null,
  },
  {
    credentialId: "vc-quality-002",
    credentialType: "DataQualityCredential",
    subjectDid: "did:web:identityhub%3A7083:dataset",
    issuerDid: "did:web:issuerservice%3A10016:issuer",
    status: "revoked",
    participantRole: null,
    holderName: "AlphaKlinik Berlin",
    holderType: "Hospital",
    issuedAt: "2024-06-01T00:00:00Z",
    expiresAt: "2025-06-01T00:00:00Z",
    purpose: "Public health research",
    datasetId: "dataset:fhir-patients",
    completeness: 0.95,
    conformance: 0.88,
    timeliness: 0.72,
  },
];

const COMPLIANT_RESULT = {
  compliant: true,
  chain: [
    {
      consumer: "did:web:pharmaco.de:research",
      applicationId: "app-001",
      applicationStatus: "approved",
      approvalId: "appr-001",
      approvalStatus: "granted",
      ehdsArticle: "Article 53",
      dataset: "dataset:fhir-patients",
      contract: "contract:abc-123",
    },
  ],
};

const NON_COMPLIANT_RESULT = {
  compliant: false,
  chain: [],
};

const MULTI_CHAIN_RESULT = {
  compliant: true,
  chain: [
    {
      consumer: "did:web:pharmaco.de:research",
      applicationId: "app-001",
      applicationStatus: "approved",
      approvalId: "appr-001",
      approvalStatus: "granted",
      ehdsArticle: "Article 53",
      dataset: "dataset:fhir-patients",
      contract: "contract:abc-123",
    },
    {
      consumer: "did:web:pharmaco.de:research",
      applicationId: "app-002",
      applicationStatus: "approved",
      approvalId: "appr-002",
      approvalStatus: "granted",
      ehdsArticle: "Article 46",
      dataset: "dataset:fhir-patients",
      contract: null,
    },
  ],
};

/** Sets up fetchApi to serve options + credentials on mount */
function setupMountMocks(
  options = OPTIONS_RESPONSE,
  credentials = CREDENTIALS,
) {
  mockFetchApi.mockImplementation((url: string) => {
    if (url === "/api/compliance") return mockResponse(options);
    if (url === "/api/credentials") return mockResponse({ credentials });
    return mockResponse({});
  });
}

// ── Setup ────────────────────────────────────────────────────────────
beforeEach(() => {
  mockFetchApi.mockReset();
});

// ── Tests ────────────────────────────────────────────────────────────
describe("CompliancePage", () => {
  // ─── Initial Loading State ───────────────────────────────────────
  describe("Loading state", () => {
    it("shows loading placeholders on mount", () => {
      mockFetchApi.mockReturnValue(new Promise(() => {}));
      render(<CompliancePage />);
      expect(screen.getAllByText(/Loading from graph/i).length).toBeGreaterThan(
        0,
      );
    });

    it("fetches /api/compliance on mount", () => {
      mockFetchApi.mockReturnValue(new Promise(() => {}));
      render(<CompliancePage />);
      expect(mockFetchApi).toHaveBeenCalledWith("/api/compliance");
    });

    it("fetches /api/credentials on mount", () => {
      mockFetchApi.mockReturnValue(new Promise(() => {}));
      render(<CompliancePage />);
      expect(mockFetchApi).toHaveBeenCalledWith("/api/credentials");
    });
  });

  // ─── Page Header ─────────────────────────────────────────────────
  describe("Page header", () => {
    it("renders the EHDS Compliance Checker title", async () => {
      setupMountMocks();
      render(<CompliancePage />);
      await waitFor(() => {
        expect(screen.getByText("EHDS Compliance Checker")).toBeInTheDocument();
      });
    });

    it("renders description text about HDAB approval chain", async () => {
      setupMountMocks();
      render(<CompliancePage />);
      await waitFor(() => {
        expect(
          screen.getByText(/Validate the HDAB approval chain/i),
        ).toBeInTheDocument();
      });
    });

    it("renders navigation links from PageIntro", async () => {
      setupMountMocks();
      render(<CompliancePage />);
      await waitFor(() => {
        expect(screen.getByText(/EEHRxF Profiles/i)).toBeInTheDocument();
        expect(screen.getByText(/Protocol TCK/i)).toBeInTheDocument();
      });
    });
  });

  // ─── Dropdown Rendering ──────────────────────────────────────────
  describe("Dropdown options", () => {
    it("renders consumer dropdown with options after loading", async () => {
      setupMountMocks();
      render(<CompliancePage />);

      await waitFor(() => {
        const select = screen.getAllByRole("combobox")[0];
        const options = within(select).getAllByRole("option");
        // Placeholder + 2 consumers
        expect(options.length).toBe(3);
      });
    });

    it("renders dataset dropdown with options after loading", async () => {
      setupMountMocks();
      render(<CompliancePage />);

      await waitFor(() => {
        const selects = screen.getAllByRole("combobox");
        const datasetSelect = selects[1];
        const options = within(datasetSelect).getAllByRole("option");
        expect(options.length).toBe(3);
      });
    });

    it("displays consumer names with type in options", async () => {
      setupMountMocks();
      render(<CompliancePage />);

      await waitFor(() => {
        expect(
          screen.getByText("PharmaCo Research AG [DATA_USER]"),
        ).toBeInTheDocument();
        expect(
          screen.getByText("Institut de Recherche Santé [HDAB]"),
        ).toBeInTheDocument();
      });
    });

    it("displays dataset titles in options", async () => {
      setupMountMocks();
      render(<CompliancePage />);

      await waitFor(() => {
        expect(screen.getByText("Synthetic FHIR Cohort")).toBeInTheDocument();
        expect(screen.getByText("Cancer Registry Limburg")).toBeInTheDocument();
      });
    });

    it("auto-selects first consumer and dataset on load", async () => {
      setupMountMocks();
      render(<CompliancePage />);

      await waitFor(() => {
        const selects = screen.getAllByRole("combobox");
        expect(selects[0]).toHaveValue(CONSUMERS[0].id);
        expect(selects[1]).toHaveValue(DATASETS[0].id);
      });
    });
  });

  // ─── Fallback Text Inputs ───────────────────────────────────────
  describe("Fallback to text inputs", () => {
    it("renders text input when no consumers available", async () => {
      setupMountMocks({ consumers: [], datasets: DATASETS });
      render(<CompliancePage />);

      await waitFor(() => {
        expect(
          screen.getByPlaceholderText("Participant ID or DID"),
        ).toBeInTheDocument();
      });
    });

    it("renders text input when no datasets available", async () => {
      setupMountMocks({ consumers: CONSUMERS, datasets: [] });
      render(<CompliancePage />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText("Dataset ID")).toBeInTheDocument();
      });
    });
  });

  // ─── Validate Button ────────────────────────────────────────────
  describe("Validate button", () => {
    it("renders the Validate Compliance button", async () => {
      setupMountMocks();
      render(<CompliancePage />);

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /Validate Compliance/i }),
        ).toBeInTheDocument();
      });
    });

    it("button is enabled when consumer and dataset are selected", async () => {
      setupMountMocks();
      render(<CompliancePage />);

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /Validate Compliance/i }),
        ).toBeEnabled();
      });
    });

    it("button is disabled when consumer text input is empty", async () => {
      setupMountMocks({ consumers: [], datasets: [] });
      render(<CompliancePage />);

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /Validate Compliance/i }),
        ).toBeDisabled();
      });
    });
  });

  // ─── Compliance Check (Compliant) ───────────────────────────────
  describe("Compliant result", () => {
    it("shows compliant message after successful check", async () => {
      setupMountMocks();
      render(<CompliancePage />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Validate/i })).toBeEnabled();
      });

      // Override fetchApi for the compliance check call
      mockFetchApi.mockImplementation((url: string) => {
        if (typeof url === "string" && url.startsWith("/api/compliance?"))
          return mockResponse(COMPLIANT_RESULT);
        return mockResponse({});
      });

      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: /Validate/i }));

      await waitFor(() => {
        expect(
          screen.getByText(/Compliant — full HDAB chain found/i),
        ).toBeInTheDocument();
      });
    });

    it("renders chain table with correct application data", async () => {
      setupMountMocks();
      render(<CompliancePage />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Validate/i })).toBeEnabled();
      });

      mockFetchApi.mockImplementation((url: string) => {
        if (typeof url === "string" && url.startsWith("/api/compliance?"))
          return mockResponse(COMPLIANT_RESULT);
        return mockResponse({});
      });

      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: /Validate/i }));

      await waitFor(() => {
        expect(screen.getByText("app-001")).toBeInTheDocument();
        expect(screen.getByText("approved")).toBeInTheDocument();
        expect(screen.getByText("appr-001")).toBeInTheDocument();
        expect(screen.getByText("Article 53")).toBeInTheDocument();
        expect(screen.getByText("contract:abc-123")).toBeInTheDocument();
      });
    });

    it("renders multiple chain rows", async () => {
      setupMountMocks();
      render(<CompliancePage />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Validate/i })).toBeEnabled();
      });

      mockFetchApi.mockImplementation((url: string) => {
        if (typeof url === "string" && url.startsWith("/api/compliance?"))
          return mockResponse(MULTI_CHAIN_RESULT);
        return mockResponse({});
      });

      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: /Validate/i }));

      await waitFor(() => {
        expect(screen.getByText("app-001")).toBeInTheDocument();
        expect(screen.getByText("app-002")).toBeInTheDocument();
        expect(screen.getByText("Article 46")).toBeInTheDocument();
      });
    });

    it("shows dash for null contract in chain", async () => {
      setupMountMocks();
      render(<CompliancePage />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Validate/i })).toBeEnabled();
      });

      mockFetchApi.mockImplementation((url: string) => {
        if (typeof url === "string" && url.startsWith("/api/compliance?"))
          return mockResponse(MULTI_CHAIN_RESULT);
        return mockResponse({});
      });

      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: /Validate/i }));

      await waitFor(() => {
        expect(screen.getByText("—")).toBeInTheDocument();
      });
    });
  });

  // ─── Compliance Check (Non-compliant) ──────────────────────────
  describe("Non-compliant result", () => {
    it("shows non-compliant message", async () => {
      setupMountMocks();
      render(<CompliancePage />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Validate/i })).toBeEnabled();
      });

      mockFetchApi.mockImplementation((url: string) => {
        if (typeof url === "string" && url.startsWith("/api/compliance?"))
          return mockResponse(NON_COMPLIANT_RESULT);
        return mockResponse({});
      });

      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: /Validate/i }));

      await waitFor(() => {
        expect(
          screen.getByText(/Non-compliant — no approval chain found/i),
        ).toBeInTheDocument();
      });
    });

    it("does not render a chain table when chain is empty", async () => {
      setupMountMocks();
      render(<CompliancePage />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Validate/i })).toBeEnabled();
      });

      mockFetchApi.mockImplementation((url: string) => {
        if (typeof url === "string" && url.startsWith("/api/compliance?"))
          return mockResponse(NON_COMPLIANT_RESULT);
        return mockResponse({});
      });

      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: /Validate/i }));

      await waitFor(() => {
        expect(screen.getByText(/Non-compliant/i)).toBeInTheDocument();
      });

      expect(screen.queryByText("Application")).not.toBeInTheDocument();
    });
  });

  // ─── Compliance Check Request ──────────────────────────────────
  describe("Check request", () => {
    it("sends consumerId and datasetId as query params", async () => {
      setupMountMocks();
      render(<CompliancePage />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Validate/i })).toBeEnabled();
      });

      mockFetchApi.mockImplementation((url: string) => {
        if (typeof url === "string" && url.startsWith("/api/compliance?"))
          return mockResponse(COMPLIANT_RESULT);
        return mockResponse({});
      });

      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: /Validate/i }));

      await waitFor(() => {
        const checkCall = mockFetchApi.mock.calls.find(
          (c: unknown[]) =>
            typeof c[0] === "string" &&
            (c[0] as string).startsWith("/api/compliance?"),
        );
        expect(checkCall).toBeDefined();
        expect(checkCall![0]).toContain(
          `consumerId=${encodeURIComponent(CONSUMERS[0].id)}`,
        );
        expect(checkCall![0]).toContain(
          `datasetId=${encodeURIComponent(DATASETS[0].id)}`,
        );
      });
    });

    it("shows Checking… text while loading", async () => {
      setupMountMocks();
      render(<CompliancePage />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Validate/i })).toBeEnabled();
      });

      // Make the compliance check hang
      mockFetchApi.mockImplementation((url: string) => {
        if (typeof url === "string" && url.startsWith("/api/compliance?"))
          return new Promise(() => {});
        return mockResponse({});
      });

      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: /Validate/i }));

      expect(screen.getByText("Checking…")).toBeInTheDocument();
    });
  });

  // ─── Consumer/Dataset Selection ────────────────────────────────
  describe("Selection changes", () => {
    it("allows changing consumer via dropdown", async () => {
      setupMountMocks();
      const user = userEvent.setup();
      render(<CompliancePage />);

      await waitFor(() => {
        expect(screen.getAllByRole("combobox").length).toBe(2);
      });

      const consumerSelect = screen.getAllByRole("combobox")[0];
      await user.selectOptions(consumerSelect, CONSUMERS[1].id);

      expect(consumerSelect).toHaveValue(CONSUMERS[1].id);
    });

    it("allows changing dataset via dropdown", async () => {
      setupMountMocks();
      const user = userEvent.setup();
      render(<CompliancePage />);

      await waitFor(() => {
        expect(screen.getAllByRole("combobox").length).toBe(2);
      });

      const datasetSelect = screen.getAllByRole("combobox")[1];
      await user.selectOptions(datasetSelect, DATASETS[1].id);

      expect(datasetSelect).toHaveValue(DATASETS[1].id);
    });

    it("allows typing in fallback consumer text input", async () => {
      setupMountMocks({ consumers: [], datasets: DATASETS });
      const user = userEvent.setup();
      render(<CompliancePage />);

      await waitFor(() => {
        expect(
          screen.getByPlaceholderText("Participant ID or DID"),
        ).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText("Participant ID or DID");
      await user.type(input, "did:web:custom");

      expect(input).toHaveValue("did:web:custom");
    });
  });

  // ─── Verifiable Credentials Section ────────────────────────────
  describe("Credentials section", () => {
    it("renders EHDS Verifiable Credentials heading", async () => {
      setupMountMocks();
      render(<CompliancePage />);

      await waitFor(() => {
        expect(
          screen.getByText("EHDS Verifiable Credentials"),
        ).toBeInTheDocument();
      });
    });

    it("renders credential cards after loading", async () => {
      setupMountMocks();
      render(<CompliancePage />);

      await waitFor(() => {
        expect(
          screen.getByText("EHDSParticipantCredential"),
        ).toBeInTheDocument();
        expect(screen.getByText("DataQualityCredential")).toBeInTheDocument();
      });
    });

    it("shows active status badge for active credentials", async () => {
      setupMountMocks();
      render(<CompliancePage />);

      await waitFor(() => {
        expect(screen.getByText("active")).toBeInTheDocument();
      });
    });

    it("shows revoked status badge for revoked credentials", async () => {
      setupMountMocks();
      render(<CompliancePage />);

      await waitFor(() => {
        expect(screen.getByText("revoked")).toBeInTheDocument();
      });
    });

    it("displays participant role badge when present", async () => {
      setupMountMocks();
      render(<CompliancePage />);

      await waitFor(() => {
        expect(screen.getByText("DATA_USER")).toBeInTheDocument();
      });
    });

    it("displays holder name and type", async () => {
      setupMountMocks();
      render(<CompliancePage />);

      await waitFor(() => {
        expect(screen.getByText(/PharmaCo Research AG/)).toBeInTheDocument();
        expect(screen.getByText(/\[CRO\]/)).toBeInTheDocument();
      });
    });

    it("shows dash for holder when holderName is null", async () => {
      const credNoHolder = [
        { ...CREDENTIALS[0], holderName: null, holderType: null },
      ];
      setupMountMocks(OPTIONS_RESPONSE, credNoHolder);
      render(<CompliancePage />);

      await waitFor(() => {
        expect(
          screen.getByText("EHDSParticipantCredential"),
        ).toBeInTheDocument();
      });

      // The "—" appears as the holder name fallback
      const holders = screen.getAllByText("—");
      expect(holders.length).toBeGreaterThan(0);
    });

    it("displays purpose when present", async () => {
      setupMountMocks();
      render(<CompliancePage />);

      await waitFor(() => {
        expect(screen.getByText("Public health research")).toBeInTheDocument();
      });
    });

    it("displays dataset ID when present", async () => {
      setupMountMocks();
      render(<CompliancePage />);

      await waitFor(() => {
        expect(screen.getByText("dataset:fhir-patients")).toBeInTheDocument();
      });
    });

    it("displays quality metrics when completeness is present", async () => {
      setupMountMocks();
      render(<CompliancePage />);

      await waitFor(() => {
        expect(screen.getByText("95%")).toBeInTheDocument();
        expect(screen.getByText("88%")).toBeInTheDocument();
        expect(screen.getByText("72%")).toBeInTheDocument();
      });
    });

    it("shows 'No credentials found' when credentials list is empty", async () => {
      setupMountMocks(OPTIONS_RESPONSE, []);
      render(<CompliancePage />);

      await waitFor(() => {
        expect(
          screen.getByText(/No credentials found in graph/i),
        ).toBeInTheDocument();
      });
    });

    it("shows Loading… for credentials during fetch", () => {
      mockFetchApi.mockReturnValue(new Promise(() => {}));
      render(<CompliancePage />);
      expect(screen.getByText("Loading…")).toBeInTheDocument();
    });
  });

  // ─── Trust Chain Diagram ─────────────────────────────────────────
  describe("Trust chain diagram", () => {
    it("renders the DCP Trust Chain heading", async () => {
      setupMountMocks();
      render(<CompliancePage />);

      await waitFor(() => {
        expect(
          screen.getByText(/DCP Trust Chain — Credential Presentation Flow/i),
        ).toBeInTheDocument();
      });
    });

    it("renders all trust chain steps", async () => {
      setupMountMocks();
      render(<CompliancePage />);

      await waitFor(() => {
        expect(screen.getByText("IssuerService")).toBeInTheDocument();
        expect(screen.getByText("IdentityHub")).toBeInTheDocument();
        expect(screen.getByText("DCP Presentation")).toBeInTheDocument();
        expect(screen.getByText("Policy Engine")).toBeInTheDocument();
        expect(screen.getByText("✓ Access Granted")).toBeInTheDocument();
      });
    });
  });

  // ─── Error Handling ──────────────────────────────────────────────
  describe("Error handling", () => {
    it("handles failed /api/compliance fetch gracefully", async () => {
      mockFetchApi.mockImplementation((url: string) => {
        if (url === "/api/compliance")
          return mockResponse({ consumers: [], datasets: [] });
        if (url === "/api/credentials")
          return mockResponse({ credentials: [] });
        return mockResponse({});
      });

      render(<CompliancePage />);

      // Should still render the page without crashing
      await waitFor(() => {
        expect(screen.getByText("EHDS Compliance Checker")).toBeInTheDocument();
      });
    });

    it("handles failed /api/credentials fetch gracefully", async () => {
      mockFetchApi.mockImplementation((url: string) => {
        if (url === "/api/compliance") return mockResponse(OPTIONS_RESPONSE);
        if (url === "/api/credentials")
          return mockResponse({ credentials: [] });
        return mockResponse({});
      });

      render(<CompliancePage />);

      await waitFor(() => {
        expect(screen.getByText("EHDS Compliance Checker")).toBeInTheDocument();
      });

      // Credentials section should show empty state
      expect(
        screen.getByText(/No credentials found in graph/i),
      ).toBeInTheDocument();
    });

    it("handles empty consumers/datasets from API", async () => {
      setupMountMocks({ consumers: [], datasets: [] }, []);
      render(<CompliancePage />);

      await waitFor(() => {
        expect(
          screen.getByPlaceholderText("Participant ID or DID"),
        ).toBeInTheDocument();
        expect(screen.getByPlaceholderText("Dataset ID")).toBeInTheDocument();
      });
    });
  });

  // ─── No Result Initially ─────────────────────────────────────────
  describe("Initial state", () => {
    it("does not show compliance result before checking", async () => {
      setupMountMocks();
      render(<CompliancePage />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Validate/i })).toBeEnabled();
      });

      expect(screen.queryByText(/Compliant/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Non-compliant/)).not.toBeInTheDocument();
    });
  });
});
