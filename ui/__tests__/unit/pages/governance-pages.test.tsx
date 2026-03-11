/**
 * Tests for Governance pages: Compliance, TCK, Credentials
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

import CompliancePage from "@/app/compliance/page";
import TckPage from "@/app/compliance/tck/page";
import CredentialsPage from "@/app/credentials/page";

function mockResponse(data: unknown) {
  return Promise.resolve({ json: () => Promise.resolve(data), ok: true });
}

describe("CompliancePage", () => {
  beforeEach(() => {
    mockFetchApi.mockReset();
  });

  it("renders heading", () => {
    mockFetchApi.mockReturnValue(
      mockResponse({ consumers: [], datasets: [], credentials: [] }),
    );
    render(<CompliancePage />);
    expect(screen.getByText("EHDS Compliance Checker")).toBeInTheDocument();
  });

  it("shows loading state for options", () => {
    mockFetchApi.mockReturnValue(new Promise(() => {}));
    render(<CompliancePage />);
    // Two labels show "Loading from graph…" (consumers + datasets)
    const matches = screen.getAllByText(/Loading from graph/);
    expect(matches.length).toBeGreaterThan(0);
  });

  it("renders form after options load", async () => {
    mockFetchApi.mockImplementation((url: string) => {
      if (url.includes("compliance"))
        return mockResponse({
          consumers: [{ id: "c1", name: "Researcher A", type: "data-user" }],
          datasets: [{ id: "d1", title: "Dataset 1" }],
        });
      if (url.includes("credentials")) return mockResponse({ credentials: [] });
      return mockResponse({});
    });
    render(<CompliancePage />);
    await waitFor(() => {
      expect(screen.getByText(/Validate Compliance/)).toBeInTheDocument();
    });
  });
});

describe("TckPage (Protocol Compliance Dashboard)", () => {
  beforeEach(() => {
    mockFetchApi.mockReset();
  });

  it("renders heading", () => {
    mockFetchApi.mockReturnValue(new Promise(() => {}));
    render(<TckPage />);
    expect(
      screen.getByText("Protocol Compliance Dashboard"),
    ).toBeInTheDocument();
  });

  it("shows loading state", () => {
    mockFetchApi.mockReturnValue(new Promise(() => {}));
    render(<TckPage />);
    // TCK page shows "Running…" in the button and animated skeleton divs
    expect(screen.getByText(/Running/)).toBeInTheDocument();
  });

  it("renders suites after loading", async () => {
    mockFetchApi.mockReturnValue(
      mockResponse({
        timestamp: "2025-01-01",
        summary: { total: 18, passed: 15, failed: 3, skipped: 0 },
        suites: {
          DSP: {
            results: [
              {
                id: "t1",
                category: "Catalog",
                suite: "DSP",
                name: "test1",
                status: "pass",
                detail: "",
              },
            ],
            passed: 8,
            total: 10,
          },
          DCP: {
            results: [
              {
                id: "t2",
                category: "Presentation",
                suite: "DCP",
                name: "test2",
                status: "pass",
                detail: "",
              },
            ],
            passed: 5,
            total: 5,
          },
          EHDS: {
            results: [
              {
                id: "t3",
                category: "Article53",
                suite: "EHDS",
                name: "test3",
                status: "fail",
                detail: "",
              },
            ],
            passed: 2,
            total: 3,
          },
        },
      }),
    );
    render(<TckPage />);
    await waitFor(() => {
      expect(screen.getByText(/DSP 2025-1 Protocol/)).toBeInTheDocument();
    });
  });
});

describe("CredentialsPage", () => {
  beforeEach(() => {
    mockFetchApi.mockReset();
  });

  it("renders heading", () => {
    mockFetchApi.mockReturnValue(
      mockResponse({ credentials: [], participants: [] }),
    );
    render(<CredentialsPage />);
    expect(screen.getByText("Verifiable Credentials")).toBeInTheDocument();
  });

  it("shows loading state", () => {
    mockFetchApi.mockReturnValue(new Promise(() => {}));
    render(<CredentialsPage />);
    expect(screen.getByText(/Loading/i)).toBeInTheDocument();
  });

  it("renders credentials list after loading", async () => {
    mockFetchApi.mockImplementation((url: string) => {
      if (url.includes("credentials"))
        return mockResponse({
          credentials: [
            {
              id: "vc-1",
              type: "EhdsDataPermit",
              issuer: "did:web:issuer",
              subject: "did:web:spe1",
              issuanceDate: "2025-01-01",
              expirationDate: "2026-01-01",
              status: "Active",
              claims: { purpose: "research" },
            },
          ],
        });
      if (url.includes("participants"))
        return mockResponse({
          participants: [
            { "@id": "ctx-1", identity: "did:web:spe1", state: "CREATED" },
          ],
        });
      return mockResponse({});
    });
    render(<CredentialsPage />);
    await waitFor(() => {
      expect(screen.getByText(/EhdsDataPermit/)).toBeInTheDocument();
    });
  });
});
