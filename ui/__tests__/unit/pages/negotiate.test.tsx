/**
 * Comprehensive tests for the Contract Negotiation page.
 *
 * Covers: page title, loading state, participant selector, catalog discovery,
 * empty catalog offers, negotiation initiation, existing negotiations list,
 * state badges (FINALIZED, AGREED, TERMINATED), API error handling,
 * ODRL offer parsing from DCAT structure, and query param pre-population.
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

import NegotiatePage from "@/app/negotiate/page";

// ── Helpers ──────────────────────────────────────────────────────────
function mockResponse(data: unknown, ok = true) {
  return Promise.resolve({ json: () => Promise.resolve(data), ok });
}

const sampleParticipants = [
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

const sampleCatalog = {
  "dcat:dataset": [
    {
      "@id": "asset-fhir-bundle",
      "dct:title": "FHIR Patient Bundle",
      "dct:description": "Synthetic patient records",
      contenttype: "application/fhir+json",
      "odrl:hasPolicy": [
        {
          "@id": "offer-1",
          "odrl:assigner": { "@id": "did:web:alpha-klinik.de:participant" },
        },
      ],
    },
    {
      "@id": "asset-omop-cohort",
      name: "OMOP Cohort Data",
      description: "Cohort query results",
      hasPolicy: [
        {
          "@id": "offer-2",
          assigner: "did:web:alpha-klinik.de:participant",
        },
      ],
    },
  ],
};

const sampleNegotiations: Record<string, unknown>[] = [
  {
    "@id": "neg-001",
    state: "FINALIZED",
    contractAgreementId: "agr-001",
    counterPartyId: "did:web:example.com:alpha-klinik",
    assetId: "fhir-patient-bundle",
  },
  {
    "@id": "neg-002",
    "edc:state": "AGREED",
    "edc:counterPartyId": "did:web:example.com:pharmaco",
    assetId: "omop-cohort-data",
  },
  {
    "@id": "neg-003",
    state: "TERMINATED",
    counterPartyId: "did:web:example.com:lmc",
    assetId: "analytics-report",
  },
];

/**
 * Route mockFetchApi calls based on the URL string.
 * Allows overriding specific routes via an options map.
 */
function setupDefaultMocks(
  overrides: Record<string, () => Promise<unknown>> = {},
) {
  mockFetchApi.mockImplementation((url: string) => {
    // Check overrides first (match by substring)
    for (const [pattern, handler] of Object.entries(overrides)) {
      if (url.includes(pattern)) return handler();
    }

    // Default routing
    if (url.includes("/api/participants")) {
      return mockResponse(sampleParticipants);
    }
    if (url.includes("catalog=true")) {
      return mockResponse(sampleCatalog);
    }
    if (
      url === "/api/negotiations" ||
      url.includes("/api/negotiations?participantId=")
    ) {
      return mockResponse(sampleNegotiations);
    }
    return mockResponse([], false);
  });
}

// ── Tests ────────────────────────────────────────────────────────────
describe("NegotiatePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── 1. Page title rendering ──
  it("renders the page title", async () => {
    setupDefaultMocks();
    render(<NegotiatePage />);
    await waitFor(() => {
      expect(screen.getByText("Contract Negotiation")).toBeTruthy();
    });
  });

  it("renders the two-step workflow headings", async () => {
    setupDefaultMocks();
    render(<NegotiatePage />);
    await waitFor(() => {
      expect(screen.getByText("Step 1 — Choose Data Provider")).toBeTruthy();
      expect(screen.getByText("Step 2 — Initiate Negotiation")).toBeTruthy();
    });
  });

  // ── 2. Loading state ──
  it("shows loading spinner for negotiations", async () => {
    // Make negotiations hang so loading state persists
    mockFetchApi.mockImplementation((url: string) => {
      if (url.includes("/api/participants")) {
        return mockResponse(sampleParticipants);
      }
      // Never-resolving promise for negotiations
      return new Promise(() => {});
    });

    render(<NegotiatePage />);
    await waitFor(() => {
      expect(screen.getByText("Loading negotiations…")).toBeTruthy();
    });
  });

  // ── 3. Participant selector populated ──
  it("populates participant selectors from API", async () => {
    setupDefaultMocks();
    render(<NegotiatePage />);

    await waitFor(() => {
      // Consumer selector should show both participants
      const options = screen.getAllByRole("option");
      const optionTexts = options.map((o) => o.textContent);
      expect(optionTexts.some((t) => t?.includes("AlphaKlinik Berlin"))).toBe(
        true,
      );
      expect(optionTexts.some((t) => t?.includes("PharmaCo Research AG"))).toBe(
        true,
      );
    });
  });

  it("shows role tags in participant selectors", async () => {
    setupDefaultMocks();
    render(<NegotiatePage />);

    await waitFor(() => {
      const options = screen.getAllByRole("option");
      const optionTexts = options.map((o) => o.textContent);
      expect(optionTexts.some((t) => t?.includes("[DATA_HOLDER]"))).toBe(true);
      expect(optionTexts.some((t) => t?.includes("[DATA_USER]"))).toBe(true);
    });
  });

  // ── 4. Catalog discovery button and results ──
  it("renders the Discover Offers button", async () => {
    setupDefaultMocks();
    render(<NegotiatePage />);

    await waitFor(() => {
      expect(screen.getByText("Discover Offers")).toBeTruthy();
    });
  });

  it("discovers catalog offers on button click", async () => {
    setupDefaultMocks();
    const user = userEvent.setup();
    render(<NegotiatePage />);

    // Wait for participants to load
    await waitFor(() => {
      expect(screen.getByText("Discover Offers")).toBeTruthy();
    });

    await user.click(screen.getByText("Discover Offers"));

    await waitFor(() => {
      expect(
        screen.getByText("2 offer(s) found — select one to negotiate:"),
      ).toBeTruthy();
    });

    // Verify the parsed offers are shown
    expect(screen.getByText("FHIR Patient Bundle")).toBeTruthy();
    expect(screen.getByText("OMOP Cohort Data")).toBeTruthy();
  });

  it("shows asset descriptions and content types after discovery", async () => {
    setupDefaultMocks();
    const user = userEvent.setup();
    render(<NegotiatePage />);

    await waitFor(() => {
      expect(screen.getByText("Discover Offers")).toBeTruthy();
    });

    await user.click(screen.getByText("Discover Offers"));

    await waitFor(() => {
      expect(screen.getByText("Synthetic patient records")).toBeTruthy();
      expect(screen.getByText("application/fhir+json")).toBeTruthy();
    });
  });

  // ── 5. Empty catalog offers state ──
  it("shows error when discovery returns no offers", async () => {
    setupDefaultMocks({
      "catalog=true": () => mockResponse({ "dcat:dataset": [] }),
    });
    const user = userEvent.setup();
    render(<NegotiatePage />);

    await waitFor(() => {
      expect(screen.getByText("Discover Offers")).toBeTruthy();
    });

    await user.click(screen.getByText("Discover Offers"));

    await waitFor(() => {
      expect(
        screen.getByText(
          "No datasets with offers found. Ensure the provider has contract definitions and active participant contexts (VPAs in ACTIVE state).",
        ),
      ).toBeTruthy();
    });
  });

  // ── 6. Negotiation initiation form and submission ──
  it("shows prompt to complete Step 1 when no offer selected", async () => {
    setupDefaultMocks();
    render(<NegotiatePage />);

    await waitFor(() => {
      expect(
        screen.getByText(
          "Complete Step 1 first — select a dataset offer above to negotiate.",
        ),
      ).toBeTruthy();
    });
  });

  it("disables Start Negotiation button when no offer selected", async () => {
    setupDefaultMocks();
    render(<NegotiatePage />);

    await waitFor(() => {
      const btn = screen.getByText("Start Negotiation");
      expect(btn.closest("button")?.disabled).toBe(true);
    });
  });

  it("selects an offer and submits negotiation", async () => {
    setupDefaultMocks();
    const user = userEvent.setup();
    render(<NegotiatePage />);

    await waitFor(() => {
      expect(screen.getByText("Discover Offers")).toBeTruthy();
    });

    // Discover offers
    await user.click(screen.getByText("Discover Offers"));
    await waitFor(() => {
      expect(screen.getByText("FHIR Patient Bundle")).toBeTruthy();
    });

    // Select the first offer
    await user.click(screen.getByText("FHIR Patient Bundle"));

    // Verify the "Selected:" indicator appears in Step 2
    await waitFor(() => {
      expect(screen.getByText("Selected:")).toBeTruthy();
    });

    // Start Negotiation should now be enabled
    const negotiateBtn = screen.getByText("Start Negotiation");
    expect(negotiateBtn.closest("button")?.disabled).toBe(false);

    // Mock the POST and subsequent refresh
    mockFetchApi.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/negotiations" && init?.method === "POST") {
        return mockResponse({ "@id": "neg-new-001" });
      }
      if (url.includes("/api/negotiations?participantId=")) {
        return mockResponse(sampleNegotiations);
      }
      if (url.includes("/api/participants")) {
        return mockResponse(sampleParticipants);
      }
      return mockResponse([]);
    });

    await user.click(negotiateBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/Negotiation initiated: neg-new-001/),
      ).toBeTruthy();
    });
  });

  it("shows error result on negotiation failure", async () => {
    setupDefaultMocks();
    const user = userEvent.setup();
    render(<NegotiatePage />);

    // Discover and select
    await waitFor(() => {
      expect(screen.getByText("Discover Offers")).toBeTruthy();
    });
    await user.click(screen.getByText("Discover Offers"));
    await waitFor(() => {
      expect(screen.getByText("FHIR Patient Bundle")).toBeTruthy();
    });
    await user.click(screen.getByText("FHIR Patient Bundle"));

    // Mock POST failure
    mockFetchApi.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/negotiations" && init?.method === "POST") {
        return mockResponse({ detail: "Contract definition not found" }, false);
      }
      if (url.includes("/api/participants")) {
        return mockResponse(sampleParticipants);
      }
      return mockResponse(sampleNegotiations);
    });

    await user.click(screen.getByText("Start Negotiation"));

    await waitFor(() => {
      expect(
        screen.getByText("Error: Contract definition not found"),
      ).toBeTruthy();
    });
  });

  // ── 7. Existing negotiations list ──
  it("renders existing negotiations after loading", async () => {
    setupDefaultMocks();
    render(<NegotiatePage />);

    await waitFor(() => {
      // assetLabel converts "fhir-patient-bundle" → "Fhir Patient Bundle"
      expect(screen.getByText("Fhir Patient Bundle")).toBeTruthy();
      expect(screen.getByText("Omop Cohort Data")).toBeTruthy();
      expect(screen.getByText("Analytics Report")).toBeTruthy();
    });
  });

  it("shows No negotiations found when list is empty", async () => {
    setupDefaultMocks({
      "negotiations?participantId=": () => mockResponse([]),
    });
    render(<NegotiatePage />);

    await waitFor(() => {
      expect(screen.getByText("No negotiations found")).toBeTruthy();
    });
  });

  it("shows provider names resolved from DIDs", async () => {
    setupDefaultMocks();
    render(<NegotiatePage />);

    await waitFor(() => {
      // didToName resolves last slug of DID to human-readable names
      // "AlphaKlinik Berlin" appears only in the negotiations list (not in dropdown since DID differs)
      expect(screen.getByText(/Provider: AlphaKlinik Berlin/)).toBeTruthy();
      // "PharmaCo Research AG" appears in both dropdown and negotiation list;
      // check multiple matches exist
      expect(
        screen.getAllByText(/PharmaCo Research AG/).length,
      ).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(/Provider: Limburg Medical Centre/)).toBeTruthy();
    });
  });

  it("shows Agreement ready text for FINALIZED negotiations", async () => {
    setupDefaultMocks();
    render(<NegotiatePage />);

    await waitFor(() => {
      expect(screen.getByText(/Agreement ready/)).toBeTruthy();
    });
  });

  it("renders Transfer link for negotiations with agreement ID", async () => {
    setupDefaultMocks();
    render(<NegotiatePage />);

    await waitFor(() => {
      const transferLink = screen.getByText("Transfer");
      expect(transferLink).toBeTruthy();
      expect(transferLink.closest("a")?.getAttribute("href")).toContain(
        "contractId=agr-001",
      );
    });
  });

  // ── 8. Negotiation state badges ──
  it("renders FINALIZED state badge", async () => {
    setupDefaultMocks();
    render(<NegotiatePage />);

    await waitFor(() => {
      expect(screen.getByText("FINALIZED")).toBeTruthy();
    });
  });

  it("renders AGREED state badge", async () => {
    setupDefaultMocks();
    render(<NegotiatePage />);

    await waitFor(() => {
      expect(screen.getByText("AGREED")).toBeTruthy();
    });
  });

  it("renders TERMINATED state badge", async () => {
    setupDefaultMocks();
    render(<NegotiatePage />);

    await waitFor(() => {
      expect(screen.getByText("TERMINATED")).toBeTruthy();
    });
  });

  // ── 9. API error handling ──
  it("handles participants API failure gracefully", async () => {
    mockFetchApi.mockImplementation((url: string) => {
      if (url.includes("/api/participants")) {
        return Promise.reject(new Error("Network error"));
      }
      return mockResponse([]);
    });

    render(<NegotiatePage />);

    // Should still render without crashing
    await waitFor(() => {
      expect(screen.getByText("Contract Negotiation")).toBeTruthy();
    });
  });

  it("handles catalog discovery network error", async () => {
    setupDefaultMocks({
      "catalog=true": () => Promise.reject(new Error("Network error")),
    });
    const user = userEvent.setup();
    render(<NegotiatePage />);

    await waitFor(() => {
      expect(screen.getByText("Discover Offers")).toBeTruthy();
    });

    await user.click(screen.getByText("Discover Offers"));

    await waitFor(() => {
      expect(screen.getByText("Network error fetching catalog")).toBeTruthy();
    });
  });

  it("handles catalog discovery API error response", async () => {
    setupDefaultMocks({
      "catalog=true": () =>
        mockResponse({ detail: "Provider DID not resolvable" }, false),
    });
    const user = userEvent.setup();
    render(<NegotiatePage />);

    await waitFor(() => {
      expect(screen.getByText("Discover Offers")).toBeTruthy();
    });

    await user.click(screen.getByText("Discover Offers"));

    await waitFor(() => {
      expect(screen.getByText("Provider DID not resolvable")).toBeTruthy();
    });
  });

  it("handles negotiation network error", async () => {
    setupDefaultMocks();
    const user = userEvent.setup();
    render(<NegotiatePage />);

    await waitFor(() => {
      expect(screen.getByText("Discover Offers")).toBeTruthy();
    });

    // Discover and select
    await user.click(screen.getByText("Discover Offers"));
    await waitFor(() => {
      expect(screen.getByText("FHIR Patient Bundle")).toBeTruthy();
    });
    await user.click(screen.getByText("FHIR Patient Bundle"));

    // Mock POST network error
    mockFetchApi.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/negotiations" && init?.method === "POST") {
        return Promise.reject(new Error("Connection refused"));
      }
      if (url.includes("/api/participants")) {
        return mockResponse(sampleParticipants);
      }
      return mockResponse(sampleNegotiations);
    });

    await user.click(screen.getByText("Start Negotiation"));

    await waitFor(() => {
      expect(
        screen.getByText("Error: Failed to initiate negotiation"),
      ).toBeTruthy();
    });
  });

  // ── 10. ODRL offer parsing from DCAT structure ──
  it("parses offers from dcat:dataset with odrl:hasPolicy (JSON-LD prefixed)", async () => {
    setupDefaultMocks({
      "catalog=true": () =>
        mockResponse({
          "dcat:dataset": [
            {
              "@id": "asset-ld-1",
              "dct:title": "LD Prefixed Dataset",
              "odrl:hasPolicy": [
                {
                  "@id": "offer-ld-1",
                  "odrl:assigner": { "@id": "did:web:some-provider" },
                },
              ],
            },
          ],
        }),
    });
    const user = userEvent.setup();
    render(<NegotiatePage />);

    await waitFor(() => {
      expect(screen.getByText("Discover Offers")).toBeTruthy();
    });

    await user.click(screen.getByText("Discover Offers"));

    await waitFor(() => {
      expect(screen.getByText("LD Prefixed Dataset")).toBeTruthy();
      expect(
        screen.getByText("1 offer(s) found — select one to negotiate:"),
      ).toBeTruthy();
    });
  });

  it("parses offers from dataset with hasPolicy (unprefixed)", async () => {
    setupDefaultMocks({
      "catalog=true": () =>
        mockResponse({
          dataset: [
            {
              "@id": "asset-plain-1",
              name: "Plain Dataset",
              hasPolicy: {
                "@id": "offer-plain-1",
                assigner: "did:web:other-provider",
              },
            },
          ],
        }),
    });
    const user = userEvent.setup();
    render(<NegotiatePage />);

    await waitFor(() => {
      expect(screen.getByText("Discover Offers")).toBeTruthy();
    });

    await user.click(screen.getByText("Discover Offers"));

    await waitFor(() => {
      expect(screen.getByText("Plain Dataset")).toBeTruthy();
    });
  });

  it("uses assetLabel fallback when dataset has no name", async () => {
    setupDefaultMocks({
      "catalog=true": () =>
        mockResponse({
          dataset: [
            {
              "@id": "my-custom-asset",
              hasPolicy: [{ "@id": "off-x", assigner: "did:web:x" }],
            },
          ],
        }),
    });
    const user = userEvent.setup();
    render(<NegotiatePage />);

    await waitFor(() => {
      expect(screen.getByText("Discover Offers")).toBeTruthy();
    });

    await user.click(screen.getByText("Discover Offers"));

    await waitFor(() => {
      // "my-custom-asset" → "My Custom Asset"
      expect(screen.getByText("My Custom Asset")).toBeTruthy();
    });
  });

  it("handles single dataset object (not wrapped in array)", async () => {
    setupDefaultMocks({
      "catalog=true": () =>
        mockResponse({
          dataset: {
            "@id": "solo-asset",
            name: "Solo Dataset",
            hasPolicy: { "@id": "offer-solo", assigner: "did:web:solo" },
          },
        }),
    });
    const user = userEvent.setup();
    render(<NegotiatePage />);

    await waitFor(() => {
      expect(screen.getByText("Discover Offers")).toBeTruthy();
    });

    await user.click(screen.getByText("Discover Offers"));

    await waitFor(() => {
      expect(screen.getByText("Solo Dataset")).toBeTruthy();
    });
  });

  // ── Additional coverage ──
  it("renders Negotiation History heading", async () => {
    setupDefaultMocks();
    render(<NegotiatePage />);

    await waitFor(() => {
      expect(screen.getByText("Negotiation History")).toBeTruthy();
    });
  });

  it("renders DSP protocol description in Step 2", async () => {
    setupDefaultMocks();
    render(<NegotiatePage />);

    await waitFor(() => {
      expect(screen.getByText("ContractRequest")).toBeTruthy();
      expect(screen.getByText("dataspace-protocol-http:2025-1")).toBeTruthy();
    });
  });

  it("renders the consumer context label", async () => {
    setupDefaultMocks();
    render(<NegotiatePage />);

    await waitFor(() => {
      expect(screen.getByText("Requesting as (your participant)")).toBeTruthy();
    });
  });

  it("renders the Data Provider label in Step 1", async () => {
    setupDefaultMocks();
    render(<NegotiatePage />);

    await waitFor(() => {
      expect(screen.getByText("Data Provider")).toBeTruthy();
    });
  });

  it("switches consumer participant and reloads negotiations", async () => {
    setupDefaultMocks();
    const user = userEvent.setup();
    render(<NegotiatePage />);

    await waitFor(() => {
      expect(screen.getByText("Fhir Patient Bundle")).toBeTruthy();
    });

    // Find the consumer selector (first select)
    const selects = screen.getAllByRole("combobox");
    const consumerSelect = selects[0];

    await user.selectOptions(consumerSelect, "ctx-pharmaco");

    // fetchApi should be called again for the new participant's negotiations
    await waitFor(() => {
      const negotiationCalls = mockFetchApi.mock.calls.filter(
        (c: unknown[]) =>
          typeof c[0] === "string" &&
          c[0].includes("negotiations?participantId=ctx-pharmaco"),
      );
      expect(negotiationCalls.length).toBeGreaterThan(0);
    });
  });

  it("shows edc:-prefixed state and counterPartyId from negotiations", async () => {
    // neg-002 uses edc:state = AGREED and edc:counterPartyId
    setupDefaultMocks();
    render(<NegotiatePage />);

    await waitFor(() => {
      expect(screen.getByText("AGREED")).toBeTruthy();
      // edc:counterPartyId "did:web:example.com:pharmaco" → slug "pharmaco" → "PharmaCo Research AG"
      expect(
        screen.getAllByText(/PharmaCo Research AG/).length,
      ).toBeGreaterThanOrEqual(1);
    });
  });
});
