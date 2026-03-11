/**
 * Tests for Exchange pages: Share, Discover, Transfer, Negotiate
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

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

import DataSharePage from "@/app/data/share/page";
import DataDiscoverPage from "@/app/data/discover/page";
import DataTransferPage from "@/app/data/transfer/page";
import NegotiatePage from "@/app/negotiate/page";

function mockResponse(data: unknown) {
  return Promise.resolve({ json: () => Promise.resolve(data), ok: true });
}

describe("DataSharePage", () => {
  beforeEach(() => {
    mockFetchApi.mockReset();
  });

  it("renders heading", () => {
    mockFetchApi.mockReturnValue(
      mockResponse({ participants: [], assets: [] }),
    );
    render(<DataSharePage />);
    expect(screen.getByText("Share Data")).toBeInTheDocument();
  });

  it("shows loading state", () => {
    mockFetchApi.mockReturnValue(new Promise(() => {}));
    render(<DataSharePage />);
    expect(screen.getByText(/Loading/i)).toBeInTheDocument();
  });

  it("renders tabs after loading", async () => {
    mockFetchApi.mockImplementation((url: string) => {
      if (url.includes("participants"))
        return mockResponse([{ "@id": "ctx-1", identity: "did:web:spe1" }]);
      if (url.includes("assets")) return mockResponse({ participants: [] });
      return mockResponse({});
    });
    render(<DataSharePage />);
    await waitFor(() => {
      expect(screen.getByText(/My Assets/)).toBeInTheDocument();
    });
  });
});

describe("DataDiscoverPage", () => {
  beforeEach(() => {
    mockFetchApi.mockReset();
  });

  it("renders heading", () => {
    mockFetchApi.mockReturnValue(new Promise(() => {}));
    render(<DataDiscoverPage />);
    expect(screen.getByText("Discover Data")).toBeInTheDocument();
  });

  it("shows loading state", () => {
    mockFetchApi.mockReturnValue(new Promise(() => {}));
    render(<DataDiscoverPage />);
    // Discover page shows "Querying federated catalog…" when loading
    expect(screen.getByText(/Querying federated catalog/)).toBeInTheDocument();
  });

  it("renders search input", () => {
    mockFetchApi.mockReturnValue(new Promise(() => {}));
    render(<DataDiscoverPage />);
    expect(screen.getByPlaceholderText(/Search assets/i)).toBeInTheDocument();
  });

  it("renders assets after loading", async () => {
    mockFetchApi.mockReturnValue(
      mockResponse({
        participants: [
          {
            participantId: "p1",
            identity: "did:web:spe1",
            assets: [
              {
                "@id": "a1",
                "edc:name": "FHIR Cohort",
                "edc:description": "Patient data",
                "edc:contenttype": "application/json",
              },
            ],
          },
        ],
      }),
    );
    render(<DataDiscoverPage />);
    await waitFor(() => {
      expect(screen.getByText("FHIR Cohort")).toBeInTheDocument();
    });
  });
});

describe("DataTransferPage", () => {
  beforeEach(() => {
    mockFetchApi.mockReset();
  });

  it("renders heading", () => {
    mockFetchApi.mockReturnValue(mockResponse([]));
    render(<DataTransferPage />);
    expect(screen.getByText("Data Transfers")).toBeInTheDocument();
  });

  it("shows loading state", () => {
    mockFetchApi.mockReturnValue(new Promise(() => {}));
    render(<DataTransferPage />);
    expect(screen.getByText(/Loading/i)).toBeInTheDocument();
  });
});

describe("NegotiatePage", () => {
  beforeEach(() => {
    mockFetchApi.mockReset();
  });

  const sampleParticipants = [
    { "@id": "ctx-1", identity: "did:web:spe1" },
    { "@id": "ctx-2", identity: "did:web:spe2" },
  ];

  const sampleNegotiations: Array<Record<string, unknown>> = [
    {
      "@id": "neg-1",
      "edc:state": "FINALIZED",
      "edc:contractAgreementId": "agreement-abc-123",
      "edc:counterPartyId": "provider-xyz",
    },
    {
      "@id": "neg-2",
      "edc:state": "ERROR",
      "edc:counterPartyId": "provider-xyz",
    },
    {
      "@id": "neg-3",
      "edc:state": "REQUESTED",
      "edc:counterPartyId": "provider-xyz",
    },
  ];

  it("renders heading", () => {
    mockFetchApi.mockReturnValue(mockResponse([]));
    render(<NegotiatePage />);
    expect(screen.getByText("Contract Negotiation")).toBeInTheDocument();
  });

  it("shows loading state", () => {
    mockFetchApi.mockReturnValue(new Promise(() => {}));
    render(<NegotiatePage />);
    expect(screen.getByText(/Loading/i)).toBeInTheDocument();
  });

  it("loads participants and renders selector", async () => {
    mockFetchApi.mockImplementation((url: string) => {
      if (url.includes("participants"))
        return mockResponse({ participants: sampleParticipants });
      return mockResponse({ negotiations: [] });
    });
    render(<NegotiatePage />);
    await waitFor(() => {
      expect(screen.getByText(/spe1/)).toBeInTheDocument();
    });
    expect(
      screen.getByText("Your Participant Context (consumer)"),
    ).toBeInTheDocument();
  });

  it("renders negotiation form fields", async () => {
    mockFetchApi.mockImplementation((url: string) => {
      if (url.includes("participants"))
        return mockResponse({ participants: sampleParticipants });
      return mockResponse({ negotiations: [] });
    });
    render(<NegotiatePage />);
    await waitFor(() => {
      expect(screen.getByText("Initiate Negotiation")).toBeInTheDocument();
    });
    expect(screen.getByPlaceholderText(/fhir-patient/)).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(/Context ID of the provider/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Start Negotiation/ }),
    ).toBeInTheDocument();
  });

  it("shows no negotiations found when list is empty", async () => {
    mockFetchApi.mockImplementation((url: string) => {
      if (url.includes("participants"))
        return mockResponse({ participants: sampleParticipants });
      return mockResponse({ negotiations: [] });
    });
    render(<NegotiatePage />);
    await waitFor(() => {
      expect(screen.getByText("No negotiations found")).toBeInTheDocument();
    });
  });

  it("renders negotiations with state icons", async () => {
    mockFetchApi.mockImplementation((url: string) => {
      if (url.includes("participants"))
        return mockResponse({ participants: sampleParticipants });
      return mockResponse({ negotiations: sampleNegotiations });
    });
    render(<NegotiatePage />);
    await waitFor(() => {
      expect(screen.getByText("neg-1")).toBeInTheDocument();
    });
    expect(screen.getByText("FINALIZED")).toBeInTheDocument();
    expect(screen.getByText("ERROR")).toBeInTheDocument();
    expect(screen.getByText("REQUESTED")).toBeInTheDocument();
  });

  it("shows transfer link for finalized negotiations with agreement", async () => {
    mockFetchApi.mockImplementation((url: string) => {
      if (url.includes("participants"))
        return mockResponse({ participants: sampleParticipants });
      return mockResponse({ negotiations: sampleNegotiations });
    });
    render(<NegotiatePage />);
    await waitFor(() => {
      expect(screen.getByText("neg-1")).toBeInTheDocument();
    });
    const transferLink = screen.getByText("Transfer");
    expect(transferLink).toBeInTheDocument();
    expect(transferLink.closest("a")).toHaveAttribute(
      "href",
      expect.stringContaining("contractId=agreement-abc-123"),
    );
  });

  it("submits negotiation form successfully", async () => {
    const user = userEvent.setup();
    mockFetchApi.mockImplementation((url: string, opts?: RequestInit) => {
      if (url.includes("participants"))
        return mockResponse({ participants: sampleParticipants });
      if (opts?.method === "POST")
        return mockResponse({ "@id": "new-neg-1", ok: true });
      return mockResponse({ negotiations: [] });
    });
    render(<NegotiatePage />);
    await waitFor(() => {
      expect(screen.getByText("Initiate Negotiation")).toBeInTheDocument();
    });
    // Fill form
    await user.type(screen.getByPlaceholderText(/fhir-patient/), "fhir-cohort");
    await user.type(
      screen.getByPlaceholderText(/Context ID of the provider/),
      "provider-1",
    );
    await user.click(screen.getByRole("button", { name: /Start Negotiation/ }));
    await waitFor(() => {
      expect(screen.getByText(/Negotiation initiated/)).toBeInTheDocument();
    });
  });

  it("handles error participant load gracefully", async () => {
    mockFetchApi.mockReturnValue(Promise.reject(new Error("fail")));
    render(<NegotiatePage />);
    // Should not crash
    await waitFor(() => {
      expect(screen.getByText("Contract Negotiation")).toBeInTheDocument();
    });
  });
});
