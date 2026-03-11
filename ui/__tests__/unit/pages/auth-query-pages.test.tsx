/**
 * Tests for Auth and Query pages
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

import SignInPage from "@/app/auth/signin/page";
import QueryPage from "@/app/query/page";

function mockResponse(data: unknown) {
  return Promise.resolve({ json: () => Promise.resolve(data), ok: true });
}

describe("SignInPage", () => {
  it("renders heading", () => {
    render(<SignInPage />);
    expect(screen.getByText("Health Dataspace Login")).toBeInTheDocument();
  });

  it("renders sign-in button", () => {
    render(<SignInPage />);
    expect(screen.getByText(/Sign in with Keycloak/)).toBeInTheDocument();
  });

  it("renders description text", () => {
    render(<SignInPage />);
    expect(
      screen.getByText(/Sign in with your Keycloak account/),
    ).toBeInTheDocument();
  });
});

describe("QueryPage (Natural Language Query)", () => {
  beforeEach(() => {
    mockFetchApi.mockReset();
  });

  const sampleTemplates = [
    {
      name: "patient_count",
      description: "Count all patients",
      examplePatterns: ["How many patients"],
    },
    {
      name: "gender_breakdown",
      description: "Show patients by gender",
      examplePatterns: ["patients by gender"],
    },
  ];

  const sampleStats = {
    speCount: 3,
    totals: {
      patients: 1500,
      encounters: 5000,
      conditions: 3000,
      observations: 8000,
    },
    aggregatedConditions: [{ name: "Diabetes", count: 200 }],
    aggregatedGenders: [{ gender: "Male", count: 800 }],
    spes: [
      {
        label: "SPE-Alpha",
        patients: 500,
        encounters: 2000,
        conditions: 1000,
        observations: 3000,
      },
      {
        label: "SPE-Beta",
        patients: 1000,
        encounters: 3000,
        conditions: 2000,
        observations: 5000,
      },
    ],
  };

  it("renders heading", () => {
    mockFetchApi.mockReturnValue(new Promise(() => {}));
    render(<QueryPage />);
    expect(screen.getByText("Natural Language Query")).toBeInTheDocument();
  });

  it("renders example questions", () => {
    mockFetchApi.mockImplementation((url: string) => {
      if (url.includes("nlq")) return mockResponse({ templates: [] });
      if (url.includes("federated")) return mockResponse(null);
      return mockResponse({});
    });
    render(<QueryPage />);
    expect(
      screen.getByText("How many patients are there?"),
    ).toBeInTheDocument();
  });

  it("renders search input", () => {
    mockFetchApi.mockImplementation((url: string) => {
      if (url.includes("nlq")) return mockResponse({ templates: [] });
      if (url.includes("federated")) return mockResponse(null);
      return mockResponse({});
    });
    render(<QueryPage />);
    expect(screen.getByPlaceholderText(/Ask a question/i)).toBeInTheDocument();
  });

  it("renders federated stats header", async () => {
    mockFetchApi.mockImplementation((url: string) => {
      if (url.includes("nlq"))
        return mockResponse({ templates: sampleTemplates });
      if (url.includes("federated")) return mockResponse(sampleStats);
      return mockResponse({});
    });
    render(<QueryPage />);
    await waitFor(() => {
      expect(screen.getByText("1,500")).toBeInTheDocument(); // patients
    });
    // "5,000" appears in both header (encounters) and SPE breakdown (observations)
    expect(screen.getAllByText("5,000").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("SPEs")).toBeInTheDocument();
    expect(screen.getByText("Patients")).toBeInTheDocument();
    expect(screen.getByText("Encounters")).toBeInTheDocument();
  });

  it("renders available templates when no result", async () => {
    mockFetchApi.mockImplementation((url: string) => {
      if (url.includes("nlq"))
        return mockResponse({ templates: sampleTemplates });
      if (url.includes("federated")) return mockResponse(sampleStats);
      return mockResponse({});
    });
    render(<QueryPage />);
    await waitFor(() => {
      expect(screen.getByText("Available Query Templates")).toBeInTheDocument();
    });
    expect(screen.getByText("patient count")).toBeInTheDocument();
    expect(screen.getByText("gender breakdown")).toBeInTheDocument();
  });

  it("renders SPE breakdown section", async () => {
    mockFetchApi.mockImplementation((url: string) => {
      if (url.includes("nlq")) return mockResponse({ templates: [] });
      if (url.includes("federated")) return mockResponse(sampleStats);
      return mockResponse({});
    });
    render(<QueryPage />);
    await waitFor(() => {
      expect(
        screen.getByText("Secure Processing Environments"),
      ).toBeInTheDocument();
    });
    expect(screen.getByText("SPE-Alpha")).toBeInTheDocument();
    expect(screen.getByText("SPE-Beta")).toBeInTheDocument();
  });

  it("shows federated toggle button", () => {
    mockFetchApi.mockReturnValue(new Promise(() => {}));
    render(<QueryPage />);
    expect(screen.getByText("Federated")).toBeInTheDocument();
  });

  it("submits a query and shows template result with table", async () => {
    const user = userEvent.setup();
    mockFetchApi.mockImplementation((url: string, opts?: RequestInit) => {
      if (opts?.method === "POST") {
        return mockResponse({
          question: "How many patients?",
          cypher: "MATCH (p:Patient) RETURN count(p) AS total",
          method: "template",
          templateName: "patient_count",
          federated: false,
          results: [{ total: 1500 }],
          totalRows: 1,
        });
      }
      if (url.includes("nlq"))
        return mockResponse({ templates: sampleTemplates });
      if (url.includes("federated")) return mockResponse(sampleStats);
      return mockResponse({});
    });
    render(<QueryPage />);
    await waitFor(() =>
      expect(screen.getByPlaceholderText(/Ask a question/)).toBeInTheDocument(),
    );
    // Type and submit
    await user.type(
      screen.getByPlaceholderText(/Ask a question/),
      "How many patients?",
    );
    await user.click(screen.getByRole("button", { name: /Ask/ }));
    // Template badge
    await waitFor(() => {
      expect(screen.getByText(/Template: patient_count/)).toBeInTheDocument();
    });
    // Results table
    expect(screen.getByText("total")).toBeInTheDocument(); // column header
    expect(screen.getByText("1500")).toBeInTheDocument(); // row value
    expect(screen.getByText("1 row")).toBeInTheDocument();
  });

  it("shows error result when query fails", async () => {
    const user = userEvent.setup();
    mockFetchApi.mockImplementation((url: string, opts?: RequestInit) => {
      if (opts?.method === "POST")
        return Promise.reject(new Error("Server error"));
      if (url.includes("nlq")) return mockResponse({ templates: [] });
      if (url.includes("federated")) return mockResponse(null);
      return mockResponse({});
    });
    render(<QueryPage />);
    await waitFor(() =>
      expect(screen.getByPlaceholderText(/Ask a question/)).toBeInTheDocument(),
    );
    await user.type(screen.getByPlaceholderText(/Ask a question/), "bad query");
    await user.click(screen.getByRole("button", { name: /Ask/ }));
    await waitFor(() => {
      expect(screen.getByText("Server error")).toBeInTheDocument();
    });
  });

  it("toggles cypher display", async () => {
    const user = userEvent.setup();
    mockFetchApi.mockImplementation((url: string, opts?: RequestInit) => {
      if (opts?.method === "POST") {
        return mockResponse({
          question: "q",
          cypher: "MATCH (n) RETURN n LIMIT 1",
          method: "template",
          templateName: "test",
          federated: false,
          results: [{ n: 1 }],
          totalRows: 1,
        });
      }
      if (url.includes("nlq")) return mockResponse({ templates: [] });
      if (url.includes("federated")) return mockResponse(null);
      return mockResponse({});
    });
    render(<QueryPage />);
    await waitFor(() =>
      expect(screen.getByPlaceholderText(/Ask a question/)).toBeInTheDocument(),
    );
    await user.type(screen.getByPlaceholderText(/Ask a question/), "test");
    await user.click(screen.getByRole("button", { name: /Ask/ }));
    await waitFor(() => expect(screen.getByText("Cypher")).toBeInTheDocument());
    // Initially cypher hidden
    expect(
      screen.queryByText("MATCH (n) RETURN n LIMIT 1"),
    ).not.toBeInTheDocument();
    // Toggle cypher display
    await user.click(screen.getByText("Cypher"));
    expect(screen.getByText("MATCH (n) RETURN n LIMIT 1")).toBeInTheDocument();
  });

  it("clicks example question to submit query", async () => {
    const user = userEvent.setup();
    mockFetchApi.mockImplementation((url: string, opts?: RequestInit) => {
      if (opts?.method === "POST") {
        return mockResponse({
          question: "How many patients are there?",
          cypher: "MATCH (p:Patient) RETURN count(p)",
          method: "template",
          templateName: "patient_count",
          federated: false,
          results: [{ count: 100 }],
          totalRows: 1,
        });
      }
      if (url.includes("nlq")) return mockResponse({ templates: [] });
      if (url.includes("federated")) return mockResponse(null);
      return mockResponse({});
    });
    render(<QueryPage />);
    await waitFor(() =>
      expect(
        screen.getByText("How many patients are there?"),
      ).toBeInTheDocument(),
    );
    await user.click(screen.getByText("How many patients are there?"));
    await waitFor(() => {
      expect(screen.getByText(/Template: patient_count/)).toBeInTheDocument();
    });
  });
});
