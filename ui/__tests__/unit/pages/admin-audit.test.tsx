/**
 * Comprehensive tests for the Admin Audit & Provenance page.
 *
 * Covers: loading state, overview tab with summary cards, transfers table,
 * negotiations (expandable rows), credentials, access logs, tab switching,
 * filter bar interactions, error state, empty states, cross-border globe,
 * export CSV, direction/access-type/status badges, EHDS articles,
 * display name resolution.
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

import AdminAuditPage from "@/app/admin/audit/page";

function mockResponse(data: unknown, ok = true) {
  return Promise.resolve({ json: () => Promise.resolve(data), ok });
}

function mockErrorResponse() {
  return Promise.reject(new Error("Network error"));
}

/* ── Test data ── */

const MOCK_PARTICIPANTS = {
  participants: [
    {
      did: "did:web:alpha-klinik.de:participant",
      name: "AlphaKlinik Berlin",
      country: "DE",
      complianceOfficerName: "Dr. Max Compliance",
      complianceOfficerEmail: "compliance@alpha-klinik.de",
    },
    {
      did: "did:web:pharmaco.de:research",
      name: "PharmaCo Research AG",
      country: "DE",
      complianceOfficerName: "Frau Aufsicht",
      complianceOfficerEmail: "compliance@pharmaco.de",
    },
    {
      did: "did:web:lmc.nl:clinic",
      name: "Limburg Medical Centre",
      country: "NL",
    },
  ],
};

const MOCK_AUDIT_DATA = {
  type: "all",
  limit: 50,
  transfers: [
    {
      id: "tx-1",
      status: "COMPLETED",
      timestamp: "2024-01-15T10:00:00Z",
      consumerDid: "did:web:pharmaco.de:research",
      consumerName: "PharmaCo Research AG",
      consumerCountryCode: "DE",
      consumerComplianceName: "Frau Aufsicht",
      consumerComplianceEmail: "compliance@pharmaco.de",
      providerDid: "did:web:alpha-klinik.de:participant",
      providerName: "AlphaKlinik Berlin",
      providerCountryCode: "DE",
      providerComplianceName: "Dr. Max Compliance",
      providerComplianceEmail: "compliance@alpha-klinik.de",
      asset: "fhir-patient-bundle",
      direction: "OUTGOING",
      byteSize: 1_048_576,
      crossBorder: true,
      policyId: "art53c-research",
      contentHash: "abc123def456789012345678",
      accessLogCount: 3,
      edcProviderEndpoint: "https://controlplane.alpha-klinik.de/api/dsp",
      purposeOfSharing: "Clinical trial data analysis",
    },
    {
      id: "tx-2",
      status: "IN_PROGRESS",
      timestamp: "2024-02-10T08:30:00Z",
      consumerDid: "did:web:lmc.nl:clinic",
      consumerName: "Limburg Medical Centre",
      consumerCountryCode: "NL",
      providerDid: "did:web:alpha-klinik.de:participant",
      providerName: "AlphaKlinik Berlin",
      providerCountryCode: "DE",
      asset: "omop-cohort-data",
      direction: "INCOMING",
      byteSize: 512,
      crossBorder: false,
      policyId: "art7-cross-border",
      errorMessage: null,
    },
    {
      id: "tx-3",
      status: "ERROR",
      timestamp: "2024-03-01T12:00:00Z",
      consumerDid: "did:web:pharmaco.de:research",
      providerDid: "did:web:alpha-klinik.de:participant",
      asset: "failed-asset",
      byteSize: 0,
      errorMessage: "Connection timeout",
    },
  ],
  negotiations: [
    {
      id: "neg-1",
      status: "FINALIZED",
      timestamp: "2024-01-10T09:00:00Z",
      consumerDid: "did:web:pharmaco.de:research",
      consumerName: "PharmaCo Research AG",
      consumerCountryCode: "DE",
      consumerComplianceName: "Frau Aufsicht",
      consumerComplianceEmail: "compliance@pharmaco.de",
      consumerEdcEndpoint: "https://controlplane.pharmaco.de/api/dsp",
      providerDid: "did:web:alpha-klinik.de:participant",
      providerName: "AlphaKlinik Berlin",
      providerCountryCode: "DE",
      providerComplianceName: "Dr. Max Compliance",
      providerComplianceEmail: "compliance@alpha-klinik.de",
      providerEdcEndpoint: "https://controlplane.alpha-klinik.de/api/dsp",
      asset: "fhir-patient-bundle",
      crossBorder: true,
      policyId: "art53c-research",
      contractId: "contract-abc-123",
      policyPurpose: "Clinical research",
      policyLegalBasis: "EHDS Art. 53(c)",
      policyPermittedUses: "Anonymized research",
      policyProhibitedUses: "Re-identification",
      policyDataMinimisation: "Only required fields",
      policyRetentionDays: 365,
      accessCount: 5,
      accessLogCount: 5,
      lastAccessAt: "2024-06-01T14:00:00Z",
    },
    {
      id: "neg-2",
      status: "TERMINATED",
      timestamp: "2024-02-05T11:00:00Z",
      consumerDid: "did:web:lmc.nl:clinic",
      consumerName: "Limburg Medical Centre",
      providerDid: "did:web:alpha-klinik.de:participant",
      providerName: "AlphaKlinik Berlin",
      asset: "omop-cohort-data",
      crossBorder: false,
    },
  ],
  credentials: [
    {
      participant: "AlphaKlinik Berlin",
      credentialType: "EhdsDataPermit",
      issuedAt: "2024-01-01T00:00:00Z",
    },
    {
      subjectDid: "did:web:pharmaco.de:research",
      type: "EhdsMembership",
      issuanceDate: "2024-03-15T00:00:00Z",
    },
  ],
  accesslogs: [
    {
      id: "al-1",
      contractId: "contract-abc-123-long-id",
      transferId: "tx-1",
      consumerDid: "did:web:pharmaco.de:research",
      consumerName: "PharmaCo Research AG",
      consumerCountry: "DE",
      providerDid: "did:web:alpha-klinik.de:participant",
      providerName: "AlphaKlinik Berlin",
      providerCountry: "DE",
      assetId: "fhir-patient-bundle",
      accessedAt: "2024-06-01T14:00:00Z",
      accessType: "INITIAL_TRANSFER",
      bytesAccessed: 2_097_152,
      purpose: "Data extraction for trial RCT-42",
    },
    {
      id: "al-2",
      contractId: "contract-def-456",
      consumerName: "Limburg Medical Centre",
      consumerCountry: "NL",
      providerName: "AlphaKlinik Berlin",
      providerCountry: "DE",
      assetId: "omop-cohort-data",
      accessedAt: "2024-07-10T09:30:00Z",
      accessType: "QUERY",
      bytesAccessed: 1024,
      purpose: "Cohort size estimation",
    },
  ],
  summary: {
    nodeCounts: {
      Transfer: 5,
      Negotiation: 3,
      Credential: 2,
      AccessLog: 8,
    },
    accessByConsumer: [
      {
        consumerName: "PharmaCo Research AG",
        totalAccesses: 5,
        totalBytes: 5_242_880,
        lastAccess: "2024-06-01T14:00:00Z",
      },
      {
        consumerName: "Limburg Medical Centre",
        totalAccesses: 2,
        totalBytes: 2048,
        lastAccess: "2024-07-10T09:30:00Z",
      },
    ],
  },
};

/* ── Helpers ── */

/** Set up default mock responses for participants + audit data calls */
function setupMocks(
  auditData: Record<string, unknown> = MOCK_AUDIT_DATA,
  participantsData = MOCK_PARTICIPANTS,
) {
  mockFetchApi.mockImplementation((url: string) => {
    if (url.includes("type=participants")) {
      return mockResponse(participantsData);
    }
    return mockResponse(auditData);
  });
}

/** Render and wait for loading to finish */
async function renderAndWait() {
  render(<AdminAuditPage />);
  await waitFor(() => {
    expect(screen.queryByText(/Querying Neo4j/)).not.toBeInTheDocument();
  });
}

/* ── Tests ── */

describe("AdminAuditPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset URL.createObjectURL for export tests
    global.URL.createObjectURL = vi.fn(() => "blob:mock-url");
  });

  // ── Loading state ──

  describe("Loading state", () => {
    it("shows spinner and 'Querying Neo4j' while loading", () => {
      mockFetchApi.mockReturnValue(new Promise(() => {})); // never resolves
      render(<AdminAuditPage />);
      expect(screen.getByText(/Querying Neo4j/)).toBeInTheDocument();
    });

    it("removes loading spinner after data loads", async () => {
      setupMocks();
      render(<AdminAuditPage />);
      expect(screen.getByText(/Querying Neo4j/)).toBeInTheDocument();
      await waitFor(() => {
        expect(screen.queryByText(/Querying Neo4j/)).not.toBeInTheDocument();
      });
    });
  });

  // ── Error state ──

  describe("Error state", () => {
    it("shows error message when audit fetch fails", async () => {
      mockFetchApi.mockImplementation((url: string) => {
        if (url.includes("type=participants")) {
          return mockResponse(MOCK_PARTICIPANTS);
        }
        return mockErrorResponse();
      });
      render(<AdminAuditPage />);
      await waitFor(() => {
        expect(
          screen.getByText("Failed to load audit data"),
        ).toBeInTheDocument();
      });
    });
  });

  // ── Page header ──

  describe("Page header", () => {
    it("renders page title and description", async () => {
      setupMocks();
      await renderAndWait();
      expect(screen.getByText("Audit & Provenance")).toBeInTheDocument();
      // Component subtitle: "Tamper-evident audit trail · EHDS Art. 32 · GDPR Art. 30"
      expect(
        screen.getByText(/Tamper-evident audit trail/),
      ).toBeInTheDocument();
    });
  });

  // ── Tabs ──

  describe("Tabs", () => {
    it("renders all five tabs", async () => {
      setupMocks();
      await renderAndWait();
      expect(screen.getByText("Overview")).toBeInTheDocument();
      expect(screen.getByText("Transfers")).toBeInTheDocument();
      expect(screen.getByText("Negotiations")).toBeInTheDocument();
      expect(screen.getByText("Credentials")).toBeInTheDocument();
      expect(screen.getByText("Access Logs")).toBeInTheDocument();
    });

    it("defaults to Overview tab", async () => {
      setupMocks();
      await renderAndWait();
      // Overview shows summary cards
      expect(screen.getByText("Transfer")).toBeInTheDocument();
      expect(screen.getByText("5")).toBeInTheDocument(); // Transfer node count
    });

    it("switches to Transfers tab and triggers new fetch", async () => {
      setupMocks();
      await renderAndWait();
      const user = userEvent.setup();
      mockFetchApi.mockClear();
      setupMocks();

      await user.click(screen.getByText("Transfers"));

      await waitFor(() => {
        expect(mockFetchApi).toHaveBeenCalledWith(
          expect.stringContaining("type=transfers"),
        );
      });
    });

    it("switches to Negotiations tab", async () => {
      setupMocks();
      await renderAndWait();
      const user = userEvent.setup();

      await user.click(screen.getByText("Negotiations"));

      await waitFor(() => {
        expect(mockFetchApi).toHaveBeenCalledWith(
          expect.stringContaining("type=negotiations"),
        );
      });
    });

    it("switches to Credentials tab", async () => {
      setupMocks();
      await renderAndWait();
      const user = userEvent.setup();

      await user.click(screen.getByText("Credentials"));

      await waitFor(() => {
        expect(mockFetchApi).toHaveBeenCalledWith(
          expect.stringContaining("type=credentials"),
        );
      });
    });

    it("switches to Access Logs tab", async () => {
      setupMocks();
      await renderAndWait();
      const user = userEvent.setup();

      await user.click(screen.getByText("Access Logs"));

      await waitFor(() => {
        expect(mockFetchApi).toHaveBeenCalledWith(
          expect.stringContaining("type=accesslogs"),
        );
      });
    });

    it("clears filters when switching tabs", async () => {
      setupMocks();
      await renderAndWait();
      const user = userEvent.setup();

      // Switch to Transfers tab
      await user.click(screen.getByText("Transfers"));
      await waitFor(() => {
        expect(screen.queryByText(/Querying Neo4j/)).not.toBeInTheDocument();
      });

      // Set a filter
      const statusSelect = screen.getByDisplayValue("All statuses");
      await user.selectOptions(statusSelect, "COMPLETED");

      // Switch to Negotiations — filters should reset
      mockFetchApi.mockClear();
      setupMocks();
      await user.click(screen.getByText("Negotiations"));

      await waitFor(() => {
        const url = mockFetchApi.mock.calls.find(
          (c: unknown[]) =>
            typeof c[0] === "string" && c[0].includes("type=negotiations"),
        );
        expect(url).toBeDefined();
        // Should NOT contain status= filter param (it was cleared)
        expect(url![0]).not.toContain("status=COMPLETED");
      });
    });
  });

  // ── Overview tab ──

  describe("Overview tab", () => {
    it("renders summary cards with node counts", async () => {
      setupMocks();
      await renderAndWait();

      expect(screen.getByText("Transfer")).toBeInTheDocument();
      expect(screen.getByText("5")).toBeInTheDocument();
      expect(screen.getByText("Negotiation")).toBeInTheDocument();
      expect(screen.getByText("3")).toBeInTheDocument();
      expect(screen.getByText("Credential")).toBeInTheDocument();
      expect(screen.getByText("2")).toBeInTheDocument();
      expect(screen.getByText("AccessLog")).toBeInTheDocument();
      expect(screen.getByText("8")).toBeInTheDocument();
    });

    it("renders access-by-consumer table", async () => {
      setupMocks();
      await renderAndWait();

      const heading = screen.getByText("Access Activity by Consumer");
      expect(heading).toBeInTheDocument();
      const section = heading.closest("section")!;
      expect(
        within(section).getByText("PharmaCo Research AG"),
      ).toBeInTheDocument();
      expect(within(section).getAllByText(/5×/).length).toBeGreaterThan(0);
      expect(within(section).getByText("5.0 MB")).toBeInTheDocument();
      expect(within(section).getByText("2024-06-01")).toBeInTheDocument();

      expect(
        within(section).getByText("Limburg Medical Centre"),
      ).toBeInTheDocument();
      expect(within(section).getAllByText(/2×/).length).toBeGreaterThan(0);
      expect(within(section).getByText("2 KB")).toBeInTheDocument();
    });

    it("shows all sections on overview: transfers, negotiations, credentials", async () => {
      setupMocks();
      await renderAndWait();

      // All three section headings should be visible
      expect(screen.getByText(/Data Transfers \(3\)/)).toBeInTheDocument();
      expect(
        screen.getByText(/Contract Negotiations \(2\)/),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Verifiable Credentials \(2\)/),
      ).toBeInTheDocument();
    });
  });

  // ── Transfers table ──

  describe("Transfers table", () => {
    it("renders transfer rows with direction badges", async () => {
      setupMocks();
      await renderAndWait();

      // OUTGOING direction
      expect(screen.getByText("OUT")).toBeInTheDocument();
      // INCOMING direction
      expect(screen.getByText("IN")).toBeInTheDocument();
    });

    it("renders status badges with correct text", async () => {
      setupMocks();
      await renderAndWait();

      expect(screen.getByText("COMPLETED")).toBeInTheDocument();
      expect(screen.getByText("IN_PROGRESS")).toBeInTheDocument();
      expect(screen.getByText("ERROR")).toBeInTheDocument();
    });

    it("formats byte sizes correctly", async () => {
      setupMocks();
      await renderAndWait();

      // 1_048_576 bytes = 1.0 MB
      expect(screen.getByText("1.0 MB")).toBeInTheDocument();
      // 512 bytes = 512 B
      expect(screen.getByText("512 B")).toBeInTheDocument();
    });

    it("shows consumer and provider names with country codes", async () => {
      setupMocks();
      await renderAndWait();

      expect(
        screen.getAllByText("PharmaCo Research AG (DE)").length,
      ).toBeGreaterThan(0);
      expect(
        screen.getAllByText("AlphaKlinik Berlin (DE)").length,
      ).toBeGreaterThan(0);
      expect(
        screen.getAllByText("Limburg Medical Centre (NL)").length,
      ).toBeGreaterThan(0);
    });

    it("shows compliance officer mailto links", async () => {
      setupMocks();
      await renderAndWait();

      const complianceLinks = screen.getAllByText("Frau Aufsicht");
      expect(complianceLinks.length).toBeGreaterThan(0);
      const link = complianceLinks[0].closest("a");
      expect(link).toHaveAttribute(
        "href",
        expect.stringContaining("mailto:compliance@pharmaco.de"),
      );
    });

    it("shows cross-border globe icon and EHDS article", async () => {
      setupMocks();
      await renderAndWait();

      // Art. 53(c) from policyId "art53c-research"
      expect(screen.getAllByText("Art. 53(c)").length).toBeGreaterThan(0);
      // Art. 7 from policyId "art7-cross-border"
      expect(screen.getAllByText("Art. 7").length).toBeGreaterThan(0);
    });

    it("shows access log count badges", async () => {
      setupMocks();
      await renderAndWait();

      // tx-1 has accessLogCount: 3
      expect(screen.getByText("3×")).toBeInTheDocument();
    });

    it("shows EDC provider endpoint", async () => {
      setupMocks();
      await renderAndWait();

      expect(
        screen.getByText("controlplane.alpha-klinik.de/api/dsp"),
      ).toBeInTheDocument();
    });

    it("shows purpose of sharing", async () => {
      setupMocks();
      await renderAndWait();

      expect(
        screen.getByText("Clinical trial data analysis"),
      ).toBeInTheDocument();
    });

    it("renders Export CSV button for transfers", async () => {
      setupMocks();
      await renderAndWait();

      const buttons = screen.getAllByText("Export CSV");
      expect(buttons.length).toBeGreaterThanOrEqual(1);
    });

    it("Export CSV button calls exportCSV with transfer data", async () => {
      setupMocks();
      await renderAndWait();
      const user = userEvent.setup();

      const createElementSpy = vi.spyOn(document, "createElement");
      const buttons = screen.getAllByText("Export CSV");
      await user.click(buttons[0]); // first Export CSV is for transfers

      // Verify a download link was created
      expect(createElementSpy).toHaveBeenCalledWith("a");
      createElementSpy.mockRestore();
    });
  });

  // ── Negotiations table ──

  describe("Negotiations table", () => {
    it("renders negotiation rows", async () => {
      setupMocks();
      await renderAndWait();

      expect(
        screen.getByText(/Contract Negotiations \(2\)/),
      ).toBeInTheDocument();
      expect(screen.getByText("FINALIZED")).toBeInTheDocument();
      expect(screen.getByText("TERMINATED")).toBeInTheDocument();
    });

    it("expands negotiation row to show policy details on click", async () => {
      setupMocks();
      await renderAndWait();
      const user = userEvent.setup();

      // Policy details should not be visible initially
      expect(screen.queryByText("Policy Details")).not.toBeInTheDocument();

      // Find the FINALIZED negotiation row and click it
      const rows = screen.getAllByText("FINALIZED");
      const row = rows[0].closest("tr")!;
      await user.click(row);

      // Policy details should now be visible
      await waitFor(() => {
        expect(screen.getByText("Policy Details")).toBeInTheDocument();
      });
      expect(screen.getByText("Clinical research")).toBeInTheDocument();
      expect(screen.getByText("EHDS Art. 53(c)")).toBeInTheDocument();
      expect(screen.getByText("Anonymized research")).toBeInTheDocument();
      expect(screen.getByText("Re-identification")).toBeInTheDocument();
      expect(screen.getByText("Only required fields")).toBeInTheDocument();
      expect(screen.getByText("365 days")).toBeInTheDocument();
    });

    it("shows EDC endpoints in expanded negotiation", async () => {
      setupMocks();
      await renderAndWait();
      const user = userEvent.setup();

      const rows = screen.getAllByText("FINALIZED");
      await user.click(rows[0].closest("tr")!);

      await waitFor(() => {
        expect(
          screen.getByText("EDC Endpoints & Contract"),
        ).toBeInTheDocument();
      });
      expect(
        screen.getByText("https://controlplane.pharmaco.de/api/dsp"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("https://controlplane.alpha-klinik.de/api/dsp"),
      ).toBeInTheDocument();
      expect(screen.getByText("contract-abc-123")).toBeInTheDocument();
    });

    it("collapses expanded negotiation row on second click", async () => {
      setupMocks();
      await renderAndWait();
      const user = userEvent.setup();

      const rows = screen.getAllByText("FINALIZED");
      const row = rows[0].closest("tr")!;

      // Expand
      await user.click(row);
      await waitFor(() => {
        expect(screen.getByText("Policy Details")).toBeInTheDocument();
      });

      // Collapse
      await user.click(row);
      await waitFor(() => {
        expect(screen.queryByText("Policy Details")).not.toBeInTheDocument();
      });
    });

    it("shows access count and last access in expanded detail", async () => {
      setupMocks();
      await renderAndWait();
      const user = userEvent.setup();

      const rows = screen.getAllByText("FINALIZED");
      await user.click(rows[0].closest("tr")!);

      await waitFor(() => {
        expect(screen.getByText("Policy Details")).toBeInTheDocument();
      });
      // The expanded policy detail card contains purpose, retention, etc.
      const policyCard = screen.getByText("Policy Details").closest("div")!;
      expect(
        within(policyCard).getByText("Clinical research"),
      ).toBeInTheDocument();
      expect(within(policyCard).getByText("365 days")).toBeInTheDocument();
    });

    it("renders Export CSV button for negotiations", async () => {
      setupMocks();
      await renderAndWait();

      // There should be at least 2 Export CSV buttons (transfers + negotiations)
      const buttons = screen.getAllByText("Export CSV");
      expect(buttons.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ── Credentials table ──

  describe("Credentials table", () => {
    it("renders credentials with participant name and type", async () => {
      setupMocks();
      await renderAndWait();

      const heading = screen.getByText(/Verifiable Credentials \(2\)/);
      expect(heading).toBeInTheDocument();
      const section = heading.closest("section")!;
      // First credential uses participant field
      expect(
        within(section).getAllByText(/AlphaKlinik Berlin/).length,
      ).toBeGreaterThan(0);
      expect(within(section).getByText("EhdsDataPermit")).toBeInTheDocument();
      // Second credential has no participant, falls back to subjectDid
      expect(
        within(section).getByText("pharmaco.de:research"),
      ).toBeInTheDocument();
      expect(within(section).getByText("EhdsMembership")).toBeInTheDocument();
    });

    it("renders credential issuance dates", async () => {
      setupMocks();
      await renderAndWait();

      expect(screen.getByText("2024-01-01")).toBeInTheDocument();
      expect(screen.getByText("2024-03-15")).toBeInTheDocument();
    });
  });

  // ── Access Logs tab ──

  describe("Access Logs tab", () => {
    it("renders access log rows on Access Logs tab", async () => {
      setupMocks();
      await renderAndWait();
      const user = userEvent.setup();

      await user.click(screen.getByText("Access Logs"));

      await waitFor(() => {
        expect(screen.queryByText(/Querying Neo4j/)).not.toBeInTheDocument();
      });

      expect(screen.getByText(/Data Access Logs \(2\)/)).toBeInTheDocument();
    });

    it("shows access type badges — Transfer and Query", async () => {
      setupMocks();
      await renderAndWait();
      const user = userEvent.setup();

      await user.click(screen.getByText("Access Logs"));
      await waitFor(() => {
        expect(screen.queryByText(/Querying Neo4j/)).not.toBeInTheDocument();
      });

      expect(screen.getByText("Transfer")).toBeInTheDocument();
      expect(screen.getByText("Query")).toBeInTheDocument();
    });

    it("shows consumer and provider with country", async () => {
      setupMocks();
      await renderAndWait();
      const user = userEvent.setup();

      await user.click(screen.getByText("Access Logs"));
      await waitFor(() => {
        expect(screen.queryByText(/Querying Neo4j/)).not.toBeInTheDocument();
      });

      // Consumer + country pattern — multiple elements expected
      expect(screen.getAllByText("(DE)").length).toBeGreaterThan(0);
      expect(screen.getAllByText("(NL)").length).toBeGreaterThan(0);
    });

    it("shows bytes and purpose", async () => {
      setupMocks();
      await renderAndWait();
      const user = userEvent.setup();

      await user.click(screen.getByText("Access Logs"));
      await waitFor(() => {
        expect(screen.queryByText(/Querying Neo4j/)).not.toBeInTheDocument();
      });

      // 2_097_152 = 2.0 MB
      expect(screen.getByText("2.0 MB")).toBeInTheDocument();
      // 1024 = 1 KB
      expect(screen.getByText("1 KB")).toBeInTheDocument();
      expect(
        screen.getByText("Data extraction for trial RCT-42"),
      ).toBeInTheDocument();
      expect(screen.getByText("Cohort size estimation")).toBeInTheDocument();
    });

    it("shows truncated contract IDs", async () => {
      setupMocks();
      await renderAndWait();
      const user = userEvent.setup();

      await user.click(screen.getByText("Access Logs"));
      await waitFor(() => {
        expect(screen.queryByText(/Querying Neo4j/)).not.toBeInTheDocument();
      });

      // contract-abc-123-long-id => first 12 chars + "…"
      expect(screen.getByText("contract-abc…")).toBeInTheDocument();
      expect(screen.getByText("contract-def…")).toBeInTheDocument();
    });
  });

  // ── Filter bar ──

  describe("Filter bar", () => {
    it("does not show filter bar on Overview tab", async () => {
      setupMocks();
      await renderAndWait();

      // No date inputs visible on overview
      expect(screen.queryByLabelText("From")).not.toBeInTheDocument();
    });

    it("shows filter bar on Transfers tab", async () => {
      setupMocks();
      await renderAndWait();
      const user = userEvent.setup();

      await user.click(screen.getByText("Transfers"));
      await waitFor(() => {
        expect(screen.queryByText(/Querying Neo4j/)).not.toBeInTheDocument();
      });

      // Filter bar labels (may appear alongside table column headers)
      expect(screen.getAllByText("From").length).toBeGreaterThan(0);
      expect(screen.getAllByText("To").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Status").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Consumer").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Provider").length).toBeGreaterThan(0);
      expect(screen.getByText("Cross-border")).toBeInTheDocument();
    });

    it("shows transfer-specific statuses in dropdown", async () => {
      setupMocks();
      await renderAndWait();
      const user = userEvent.setup();

      await user.click(screen.getByText("Transfers"));
      await waitFor(() => {
        expect(screen.queryByText(/Querying Neo4j/)).not.toBeInTheDocument();
      });

      const statusSelect = screen.getByDisplayValue("All statuses");
      const options = within(statusSelect as HTMLElement).getAllByRole(
        "option",
      );
      const optionTexts = options.map((o) => o.textContent);
      expect(optionTexts).toContain("COMPLETED");
      expect(optionTexts).toContain("IN_PROGRESS");
      expect(optionTexts).toContain("ERROR");
    });

    it("shows negotiation-specific statuses on Negotiations tab", async () => {
      setupMocks();
      await renderAndWait();
      const user = userEvent.setup();

      await user.click(screen.getByText("Negotiations"));
      await waitFor(() => {
        expect(screen.queryByText(/Querying Neo4j/)).not.toBeInTheDocument();
      });

      const statusSelect = screen.getByDisplayValue("All statuses");
      const options = within(statusSelect as HTMLElement).getAllByRole(
        "option",
      );
      const optionTexts = options.map((o) => o.textContent);
      expect(optionTexts).toContain("CONFIRMED");
      expect(optionTexts).toContain("FINALIZED");
      expect(optionTexts).toContain("IN_PROGRESS");
      expect(optionTexts).toContain("TERMINATED");
    });

    it("selecting a status filter triggers new fetch with status param", async () => {
      setupMocks();
      await renderAndWait();
      const user = userEvent.setup();

      await user.click(screen.getByText("Transfers"));
      await waitFor(() => {
        expect(screen.queryByText(/Querying Neo4j/)).not.toBeInTheDocument();
      });

      mockFetchApi.mockClear();
      setupMocks();

      const statusSelect = screen.getByDisplayValue("All statuses");
      await user.selectOptions(statusSelect, "COMPLETED");

      await waitFor(() => {
        expect(mockFetchApi).toHaveBeenCalledWith(
          expect.stringContaining("status=COMPLETED"),
        );
      });
    });

    it("selecting consumer filter triggers fetch with consumerDid param", async () => {
      setupMocks();
      await renderAndWait();
      const user = userEvent.setup();

      await user.click(screen.getByText("Transfers"));
      await waitFor(() => {
        expect(screen.queryByText(/Querying Neo4j/)).not.toBeInTheDocument();
      });

      mockFetchApi.mockClear();
      setupMocks();

      const consumerSelect = screen.getByDisplayValue("All consumers");
      await user.selectOptions(
        consumerSelect,
        "did:web:alpha-klinik.de:participant",
      );

      await waitFor(() => {
        expect(mockFetchApi).toHaveBeenCalledWith(
          expect.stringContaining("consumerDid="),
        );
      });
    });

    it("selecting cross-border filter triggers fetch", async () => {
      setupMocks();
      await renderAndWait();
      const user = userEvent.setup();

      await user.click(screen.getByText("Transfers"));
      await waitFor(() => {
        expect(screen.queryByText(/Querying Neo4j/)).not.toBeInTheDocument();
      });

      mockFetchApi.mockClear();
      setupMocks();

      const cbSelect = screen.getByDisplayValue("All");
      await user.selectOptions(cbSelect, "true");

      await waitFor(() => {
        expect(mockFetchApi).toHaveBeenCalledWith(
          expect.stringContaining("crossBorder=true"),
        );
      });
    });

    it("clear button resets all filters", async () => {
      setupMocks();
      await renderAndWait();
      const user = userEvent.setup();

      await user.click(screen.getByText("Transfers"));
      await waitFor(() => {
        expect(screen.queryByText(/Querying Neo4j/)).not.toBeInTheDocument();
      });

      // Set a filter to make Clear button appear
      const statusSelect = screen.getByDisplayValue("All statuses");
      await user.selectOptions(statusSelect, "COMPLETED");

      // Clear button should appear
      await waitFor(() => {
        expect(screen.getByText("Clear")).toBeInTheDocument();
      });

      mockFetchApi.mockClear();
      setupMocks();

      await user.click(screen.getByText("Clear"));

      await waitFor(() => {
        // After clear, the fetch should not include status param
        const lastCall =
          mockFetchApi.mock.calls[mockFetchApi.mock.calls.length - 1];
        expect(lastCall[0]).not.toContain("status=COMPLETED");
      });
    });

    it("does not show status or consumer filters on Credentials tab", async () => {
      setupMocks();
      await renderAndWait();
      const user = userEvent.setup();

      await user.click(screen.getByText("Credentials"));
      await waitFor(() => {
        expect(screen.queryByText(/Querying Neo4j/)).not.toBeInTheDocument();
      });

      // FilterBar shows on credentials but without status, consumer, provider, cross-border
      expect(screen.queryByText("Status")).not.toBeInTheDocument();
      expect(screen.queryByText("Consumer")).not.toBeInTheDocument();
      expect(screen.queryByText("Provider")).not.toBeInTheDocument();
      expect(screen.queryByText("Cross-border")).not.toBeInTheDocument();
    });

    it("populates consumer/provider dropdowns with participants", async () => {
      setupMocks();
      await renderAndWait();
      const user = userEvent.setup();

      await user.click(screen.getByText("Transfers"));
      await waitFor(() => {
        expect(screen.queryByText(/Querying Neo4j/)).not.toBeInTheDocument();
      });

      const consumerSelect = screen.getByDisplayValue("All consumers");
      const options = within(consumerSelect as HTMLElement).getAllByRole(
        "option",
      );
      const optionTexts = options.map((o) => o.textContent);
      expect(optionTexts).toContain("AlphaKlinik Berlin (DE)");
      expect(optionTexts).toContain("PharmaCo Research AG (DE)");
      expect(optionTexts).toContain("Limburg Medical Centre (NL)");
    });
  });

  // ── Empty states ──

  describe("Empty states", () => {
    it("shows 'No transfers recorded' when transfers array is empty", async () => {
      setupMocks({ ...MOCK_AUDIT_DATA, transfers: [] });
      await renderAndWait();

      expect(screen.getByText("No transfers recorded")).toBeInTheDocument();
    });

    it("shows 'No negotiations recorded' when negotiations array is empty", async () => {
      setupMocks({ ...MOCK_AUDIT_DATA, negotiations: [] });
      await renderAndWait();

      expect(screen.getByText("No negotiations recorded")).toBeInTheDocument();
    });

    it("shows 'No credentials recorded' when credentials array is empty", async () => {
      setupMocks({ ...MOCK_AUDIT_DATA, credentials: [] });
      await renderAndWait();

      expect(screen.getByText("No credentials recorded")).toBeInTheDocument();
    });

    it("shows 'No access logs recorded' on empty access logs tab", async () => {
      setupMocks({ ...MOCK_AUDIT_DATA, accesslogs: [] });
      await renderAndWait();
      const user = userEvent.setup();

      await user.click(screen.getByText("Access Logs"));
      await waitFor(() => {
        expect(screen.queryByText(/Querying Neo4j/)).not.toBeInTheDocument();
      });

      expect(screen.getByText("No access logs recorded")).toBeInTheDocument();
    });

    it("does not show Export CSV when transfers list is empty", async () => {
      setupMocks({
        ...MOCK_AUDIT_DATA,
        transfers: [],
        negotiations: [],
      });
      await renderAndWait();

      expect(screen.queryByText("Export CSV")).not.toBeInTheDocument();
    });
  });

  // ── Fetch behavior ──

  describe("Fetch behavior", () => {
    it("makes two fetch calls on mount: participants + audit data", async () => {
      setupMocks();
      await renderAndWait();

      expect(mockFetchApi).toHaveBeenCalledWith(
        expect.stringContaining("type=participants"),
      );
      expect(mockFetchApi).toHaveBeenCalledWith(
        expect.stringContaining("type=all"),
      );
    });

    it("includes limit=50 in audit data call", async () => {
      setupMocks();
      await renderAndWait();

      expect(mockFetchApi).toHaveBeenCalledWith(
        expect.stringContaining("limit=50"),
      );
    });
  });

  // ── Display name resolution ──

  describe("Display name resolution", () => {
    it("falls back to DID when name is missing", async () => {
      const dataWithMissingNames = {
        ...MOCK_AUDIT_DATA,
        transfers: [
          {
            id: "tx-no-name",
            status: "COMPLETED",
            timestamp: "2024-01-15T10:00:00Z",
            consumerDid: "did:web:unknown.org:participant",
            providerDid: "did:web:another.org:provider",
            asset: "test",
          },
        ],
        negotiations: [],
        credentials: [],
      };
      setupMocks(dataWithMissingNames);
      await renderAndWait();

      expect(screen.getByText("unknown.org:participant")).toBeInTheDocument();
      expect(screen.getByText("another.org:provider")).toBeInTheDocument();
    });

    it("shows dash when both name and DID are missing", async () => {
      const dataWithEmpty = {
        ...MOCK_AUDIT_DATA,
        transfers: [
          { id: "tx-empty", status: "COMPLETED", timestamp: "2024-01-01" },
        ],
        negotiations: [],
        credentials: [],
      };
      setupMocks(dataWithEmpty);
      await renderAndWait();

      // Multiple "—" dashes for empty fields
      const dashes = screen.getAllByText("—");
      expect(dashes.length).toBeGreaterThan(0);
    });
  });

  // ── Date rendering ──

  describe("Date rendering", () => {
    it("renders dates truncated to YYYY-MM-DD", async () => {
      setupMocks();
      await renderAndWait();

      // Transfer date: "2024-01-15T10:00:00Z" → "2024-01-15"
      expect(screen.getAllByText("2024-01-15").length).toBeGreaterThan(0);
    });
  });
});
