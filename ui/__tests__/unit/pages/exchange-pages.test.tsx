/**
 * Tests for Exchange pages: Share, Discover, Transfer, Negotiate
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

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
});
