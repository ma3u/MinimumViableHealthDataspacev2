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

// The GitHub Pages build is a constant per bundle; a getter lets one test
// render the page as that build without reloading the module.
const staticMode = vi.hoisted(() => ({ on: false }));
vi.mock("@/lib/static-export", () => ({
  get IS_STATIC() {
    return staticMode.on;
  },
  BASE_PATH: "",
}));

// The query string the page is opened with, e.g. "dataset=..." from the catalog
const query = vi.hoisted(() => ({ value: "" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/negotiate",
  useSearchParams: () => new URLSearchParams(query.value),
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
    staticMode.on = false;
    query.value = "";
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
      expect(screen.getByText("Step 1: Choose Data Provider")).toBeTruthy();
      expect(screen.getByText("Step 2: Initiate Negotiation")).toBeTruthy();
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
        screen.getByText("2 offer(s) found. Select one to negotiate:"),
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
          "Complete Step 1 first: select a dataset offer above to negotiate.",
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

  // ── Demo negotiations (issue #25) ──
  //
  // The connector has no participant context, so a negotiation against an offer
  // from the demo catalogue is recorded by the API rather than sent. The page has
  // to carry that through honestly and without losing the row.
  describe("a negotiation the API recorded rather than sent", () => {
    const demoNegotiation = {
      "@id": "demo-negotiation:fhir-patient-bundle",
      state: "FINALIZED",
      contractAgreementId: "demo-agreement:fhir-patient-bundle",
      counterPartyId: "did:web:example.com:alpha-klinik",
      assetId: "fhir-patient-bundle",
      demo: true,
      demoReason: "No DSP agreement was signed with anyone.",
    };

    async function negotiateDemoOffer(refetch: Record<string, unknown>[]) {
      setupDefaultMocks();
      const user = userEvent.setup();
      render(<NegotiatePage />);

      await waitFor(() => {
        expect(screen.getByText("Discover Offers")).toBeTruthy();
      });
      await user.click(screen.getByText("Discover Offers"));
      await waitFor(() => {
        expect(screen.getByText("FHIR Patient Bundle")).toBeTruthy();
      });
      await user.click(screen.getByText("FHIR Patient Bundle"));
      await waitFor(() => {
        expect(screen.getByText("Selected:")).toBeTruthy();
      });

      mockFetchApi.mockImplementation((url: string, init?: RequestInit) => {
        if (url === "/api/negotiations" && init?.method === "POST") {
          return mockResponse(demoNegotiation);
        }
        if (url.includes("/api/negotiations?participantId=")) {
          return mockResponse(refetch);
        }
        if (url.includes("/api/participants")) {
          return mockResponse(sampleParticipants);
        }
        return mockResponse([]);
      });

      await user.click(screen.getByText("Start Negotiation"));
      return user;
    }

    it("says the negotiation was recorded, not initiated", async () => {
      await negotiateDemoOffer([demoNegotiation]);

      await waitFor(() => {
        expect(
          screen.getByText(/Demo negotiation recorded: demo-negotiation:/),
        ).toBeTruthy();
      });
      expect(screen.queryByText(/Negotiation initiated/)).toBeNull();
    });

    it("keeps the row exactly once when the refetch carries it too", async () => {
      await negotiateDemoOffer([demoNegotiation]);

      // The API now returns the recorded negotiation, and the page also holds the
      // POST response. Prepending unconditionally duplicated the row and its key.
      await waitFor(() => {
        expect(screen.getAllByText("Demo")).toHaveLength(1);
      });
    });

    it("keeps the row when the refetch has dropped it", async () => {
      await negotiateDemoOffer([]);

      // A vanishing row reads as a failure, so the POST response stands in.
      await waitFor(() => {
        expect(screen.getAllByText("Demo")).toHaveLength(1);
      });
    });

    it("marks the row as demo, since nobody signed that agreement", async () => {
      await negotiateDemoOffer([demoNegotiation]);

      await waitFor(() => {
        expect(screen.getByText("Demo")).toBeTruthy();
      });
      // An unmarked FINALIZED badge would claim an agreement that never existed.
      expect(screen.getByTitle(/No DSP agreement was signed/)).toBeTruthy();
    });

    it("offers the transfer step, with the agreement id url-encoded", async () => {
      await negotiateDemoOffer([demoNegotiation]);

      await waitFor(() => {
        const link = screen
          .getAllByText(/Transfer/)
          .map((el) => el.closest("a"))
          .find((a) => a?.getAttribute("href")?.includes("demo-agreement"));
        expect(link?.getAttribute("href")).toContain(
          "contractId=demo-agreement%3Afhir-patient-bundle",
        );
      });
    });

    it("never marks a live negotiation as demo", async () => {
      setupDefaultMocks();
      render(<NegotiatePage />);

      await waitFor(() => {
        expect(screen.getByText("Fhir Patient Bundle")).toBeTruthy();
      });
      expect(screen.queryByText("Demo")).toBeNull();
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

  describe("where the contract request is sent (#876)", () => {
    async function negotiateFirstOffer(catalog: unknown) {
      setupDefaultMocks({ "catalog=true": () => mockResponse(catalog) });
      const user = userEvent.setup();
      render(<NegotiatePage />);
      await user.click(await screen.findByText("Discover Offers"));
      await user.click(await screen.findByText("FHIR Patient Bundle"));
      mockFetchApi.mockImplementation((url: string, init?: RequestInit) =>
        url === "/api/negotiations" && init?.method === "POST"
          ? mockResponse({ "@id": "neg-new" })
          : mockResponse(sampleNegotiations),
      );
      await user.click(screen.getByText("Start Negotiation"));
      await waitFor(() => {
        expect(
          mockFetchApi.mock.calls.some(
            ([u, i]) => u === "/api/negotiations" && i?.method === "POST",
          ),
        ).toBe(true);
      });
      const [, init] = mockFetchApi.mock.calls.find(
        ([u, i]) => u === "/api/negotiations" && i?.method === "POST",
      )!;
      return JSON.parse(String(init.body)) as Record<string, unknown>;
    }

    it("sends the address the provider's catalog gives", async () => {
      const endpoint =
        "http://mvhd-controlplane:8082/api/dsp/36b1a04b/http-dsp-profile-2025-1";
      const catalog = structuredClone(sampleCatalog) as {
        "dcat:dataset": Record<string, unknown>[];
      };
      catalog["dcat:dataset"][0].distribution = [
        { accessService: { endpointURL: endpoint } },
      ];

      const body = await negotiateFirstOffer(catalog);

      expect(body.counterPartyAddress).toBe(endpoint);
    });

    it("sends no fixed host when the catalog names none, so the server's base applies", async () => {
      // It used to send http://controlplane:8082, the compose host, which
      // does not resolve on Azure: the negotiation stayed REQUESTING.
      const body = await negotiateFirstOffer(sampleCatalog);

      expect(body).not.toHaveProperty("counterPartyAddress");
    });
  });

  describe("after the request: who acts next (#876)", () => {
    async function startAndAnswer(row: Record<string, unknown>) {
      setupDefaultMocks();
      const user = userEvent.setup();
      render(<NegotiatePage />);
      await user.click(await screen.findByText("Discover Offers"));
      await user.click(await screen.findByText("FHIR Patient Bundle"));
      mockFetchApi.mockImplementation((url: string, init?: RequestInit) =>
        url === "/api/negotiations" && init?.method === "POST"
          ? mockResponse({ "@id": "neg-new" })
          : mockResponse([{ "@id": "neg-new", ...row }, ...sampleNegotiations]),
      );
      await user.click(screen.getByText("Start Negotiation"));
      return screen.findByTestId("negotiation-progress");
    }

    it("says nobody at the provider has to sign in while it waits", async () => {
      const box = await startAndAnswer({ state: "REQUESTED" });

      expect(box.textContent).toMatch(
        /Waiting for AlphaKlinik Berlin to agree/,
      );
      expect(box.textContent).toMatch(
        /nobody at AlphaKlinik Berlin has to sign in/,
      );
    });

    it("offers the transfer once the contract is agreed", async () => {
      await startAndAnswer({
        state: "FINALIZED",
        contractAgreementId: "agr-new",
      });

      const link = await screen.findByRole("link", {
        name: /Continue to transfer/,
      });
      expect(link.getAttribute("href")).toBe(
        "/data/transfer?participantId=ctx-pharmaco&contractId=agr-new",
      );
    });

    it("says why when the negotiation ends without a contract", async () => {
      await startAndAnswer({
        state: "TERMINATED",
        errorDetail: "Policy not satisfied",
      });

      expect(
        await screen.findByText(
          /ended without a contract: Policy not satisfied/,
        ),
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
        screen.getByText("1 offer(s) found. Select one to negotiate:"),
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
      expect(screen.getByText("http-dsp-profile-2025-1")).toBeTruthy();
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

    await user.selectOptions(consumerSelect, "ctx-alpha");

    // fetchApi should be called again for the new participant's negotiations
    await waitFor(() => {
      const negotiationCalls = mockFetchApi.mock.calls.filter(
        (c: unknown[]) =>
          typeof c[0] === "string" &&
          c[0].includes("negotiations?participantId=ctx-alpha"),
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

  // ── Ana's review of the Spanish UI (#876) ──
  describe("choosing who to ask for a catalog", () => {
    const fourParticipants = [
      ...sampleParticipants,
      {
        "@id": "ctx-medreg",
        identity: "did:web:medreg.de:hdab",
        displayName: "MedReg DE",
        role: "HDAB",
      },
      {
        "@id": "ctx-lmc",
        identity: "did:web:lmc.nl:clinic",
        displayName: "Limburg Medical Centre",
        role: "DATA_HOLDER",
      },
    ];

    function selects() {
      const [consumer, provider] = screen.getAllByRole("combobox");
      return {
        consumer: consumer as HTMLSelectElement,
        provider: provider as HTMLSelectElement,
      };
    }

    it("requests as the data user and asks the first data holder", async () => {
      setupDefaultMocks();
      render(<NegotiatePage />);

      await waitFor(() => {
        expect(selects().consumer.value).toBe("ctx-pharmaco");
        expect(selects().provider.value).toBe("ctx-alpha");
      });
    });

    it("asks the provider the dropdown shows, never the requester itself", async () => {
      setupDefaultMocks({
        "/api/participants": () => mockResponse(fourParticipants),
      });
      const user = userEvent.setup();
      render(<NegotiatePage />);
      await waitFor(() => {
        expect(selects().provider.value).toBe("ctx-alpha");
      });

      await user.click(screen.getByText("Discover Offers"));

      await waitFor(() => {
        const call = mockFetchApi.mock.calls.find(
          (c: unknown[]) =>
            typeof c[0] === "string" && c[0].includes("catalog=true"),
        );
        expect(call?.[0]).toContain("participantId=ctx-pharmaco");
        expect(call?.[0]).toContain(
          `providerDid=${encodeURIComponent(
            "did:web:alpha-klinik.de:participant",
          )}`,
        );
      });
    });

    it("does not offer a data user as a data provider", async () => {
      setupDefaultMocks({
        "/api/participants": () => mockResponse(fourParticipants),
      });
      const user = userEvent.setup();
      render(<NegotiatePage />);
      await waitFor(() => {
        expect(selects().consumer.value).toBe("ctx-pharmaco");
      });
      // Requesting as a hospital: PharmaCo is now not the requester, but it
      // is still a data user and has nothing to offer.
      await user.selectOptions(selects().consumer, "ctx-medreg");

      const offered = [...selects().provider.options].map((o) => o.value);
      expect(offered).not.toContain("ctx-pharmaco");
      expect(offered).not.toContain("ctx-medreg");
      expect(offered).toEqual(["ctx-alpha", "ctx-lmc"]);
    });

    it("picks another provider when the requester becomes the provider", async () => {
      setupDefaultMocks({
        "/api/participants": () => mockResponse(fourParticipants),
      });
      const user = userEvent.setup();
      render(<NegotiatePage />);
      await waitFor(() => {
        expect(selects().provider.value).toBe("ctx-alpha");
      });

      await user.selectOptions(selects().consumer, "ctx-alpha");

      expect(selects().provider.value).toBe("ctx-lmc");
    });
  });

  describe("on GitHub Pages, where there is no API route", () => {
    const assets = [
      {
        participantId: "ctx-alpha",
        identity: "did:web:alpha-klinik.de:participant",
        assets: [
          {
            "@id": "fhir-patient-search",
            properties: {
              name: "FHIR Patient Search",
              description: "Search FHIR R4 patients",
              contenttype: "application/fhir+json",
            },
          },
        ],
      },
    ];

    it("lists the provider's offers from the demo assets", async () => {
      staticMode.on = true;
      setupDefaultMocks({ "/api/assets": () => mockResponse(assets) });
      const user = userEvent.setup();
      render(<NegotiatePage />);
      await waitFor(() => {
        expect(screen.getByText("Discover Offers")).toBeTruthy();
      });

      await user.click(screen.getByText("Discover Offers"));

      await waitFor(() => {
        expect(screen.getByText("FHIR Patient Search")).toBeTruthy();
      });
      expect(screen.queryByText(/No datasets with offers found/)).toBeNull();
      // Labelled as the demonstrator's catalogue, not a live DSP answer
      expect(screen.getByText(/demonstrator's own catalogue/)).toBeTruthy();
      // The request negotiations.json would have answered never went out
      expect(
        mockFetchApi.mock.calls.some(
          (c: unknown[]) =>
            typeof c[0] === "string" && c[0].includes("catalog=true"),
        ),
      ).toBe(false);
    });

    it("says so when the provider has no demo assets", async () => {
      staticMode.on = true;
      setupDefaultMocks({ "/api/assets": () => mockResponse([]) });
      const user = userEvent.setup();
      render(<NegotiatePage />);
      await waitFor(() => {
        expect(screen.getByText("Discover Offers")).toBeTruthy();
      });

      await user.click(screen.getByText("Discover Offers"));

      await waitFor(() => {
        expect(screen.getByText(/No datasets with offers found/)).toBeTruthy();
      });
    });
  });

  describe("the negotiation history", () => {
    it("names graph-layer DIDs by organisation, not by role slug", async () => {
      setupDefaultMocks({
        "negotiations?participantId=": () =>
          mockResponse([
            {
              "@id": "neg-lmc",
              type: "CONSUMER",
              state: "FINALIZED",
              contractAgreementId: "agr-lmc",
              counterPartyId: "did:web:lmc.nl:clinic",
              assetId: "fhir-cohort-bundle",
            },
          ]),
      });
      render(<NegotiatePage />);

      await waitFor(() => {
        expect(
          screen.getByText(/Provider: Limburg Medical Centre/),
        ).toBeTruthy();
      });
      expect(screen.queryByText(/Provider: clinic/)).toBeNull();
    });

    it("calls the counter-party of a provider-side negotiation the consumer", async () => {
      setupDefaultMocks({
        "negotiations?participantId=": () =>
          mockResponse([
            {
              "@id": "neg-provider",
              type: "PROVIDER",
              state: "FINALIZED",
              contractAgreementId: "agr-p",
              counterPartyId: "did:web:identityhub%3A7083:pharmaco",
              assetId: "fhir-patient-search",
            },
          ]),
      });
      render(<NegotiatePage />);

      await waitFor(() => {
        expect(screen.getByText(/Consumer: PharmaCo Research AG/)).toBeTruthy();
      });
      expect(screen.queryByText(/Provider: PharmaCo Research AG/)).toBeNull();
    });
  });

  describe("arriving from the catalog's Request Access (?dataset=)", () => {
    const catalog = [
      {
        id: "Synthetic Type 2 Diabetes Patient Journey",
        title: "Synthetic Type 2 Diabetes Patient Journey",
        publisher: "Riverside General (CLINIC)",
        providers: ["AlphaKlinik Berlin", "Riverside General (CLINIC)"],
      },
      {
        id: "dataset:unheld",
        title: "A dataset nobody here holds",
        publisher: "Somewhere Else",
        providers: [],
      },
    ];
    const participants = [
      sampleParticipants[1],
      {
        "@id": "ctx-lmc",
        identity: "did:web:lmc.nl:clinic",
        displayName: "Limburg Medical Centre",
        role: "DATA_HOLDER",
      },
      sampleParticipants[0],
    ];

    it("names the dataset and preselects the participant that holds it", async () => {
      query.value =
        "dataset=" +
        encodeURIComponent("Synthetic Type 2 Diabetes Patient Journey");
      setupDefaultMocks({
        "/api/participants": () => mockResponse(participants),
        "/api/catalog": () => mockResponse(catalog),
      });
      render(<NegotiatePage />);

      await waitFor(() => {
        const note = screen.getByTestId("requested-dataset");
        expect(note.textContent).toContain(
          "Synthetic Type 2 Diabetes Patient Journey",
        );
        expect(note.textContent).toContain("AlphaKlinik Berlin");
      });
      // Not the first data holder in the list: the one that holds the dataset
      const provider = screen.getAllByRole("combobox")[1] as HTMLSelectElement;
      await waitFor(() => expect(provider.value).toBe("ctx-alpha"));
    });

    it("says plainly when no participant holds the dataset", async () => {
      query.value = "dataset=dataset%3Aunheld";
      setupDefaultMocks({
        "/api/participants": () => mockResponse(participants),
        "/api/catalog": () => mockResponse(catalog),
      });
      render(<NegotiatePage />);

      await waitFor(() => {
        expect(screen.getByTestId("requested-dataset").textContent).toContain(
          "No participant of this dataspace offers",
        );
      });
    });

    it("shows no dataset note without the parameter", async () => {
      setupDefaultMocks();
      render(<NegotiatePage />);
      await waitFor(() => {
        expect(screen.getByText("Discover Offers")).toBeTruthy();
      });
      expect(screen.queryByTestId("requested-dataset")).toBeNull();
    });
  });
});
