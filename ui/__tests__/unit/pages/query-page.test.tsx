/**
 * Unit tests for /query page (Phase 24 additions)
 *
 * Tests: ODRL scope indicator, GraphRAG method badge,
 * ODRL enforced badge, and NLQ query flow.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock fetchApi — controls what the page receives on mount
const mockFetchApi = vi.fn();
vi.mock("@/lib/api", () => ({
  fetchApi: (...args: unknown[]) => mockFetchApi(...args),
}));

import NlqPage from "@/app/query/page";

function mockFetchApiResponses(
  overrides: Partial<Record<string, unknown>> = {},
) {
  const defaults: Record<string, unknown> = {
    "/api/nlq": { templates: [] },
    "/api/federated": { totals: null },
    "/api/odrl/scope": {
      participantId: "did:web:pharmaco.de:research",
      participantName: "PharmaCo Research AG",
      permissions: ["scientific_research", "statistics"],
      prohibitions: ["re_identification"],
      accessibleDatasets: ["dataset-synthea-fhir-r4-2026"],
      temporalLimit: "2027-12-31T23:59:59",
      policyIds: ["policy-1"],
      hasActiveContract: true,
      hdabApproved: true,
    },
    ...overrides,
  };

  mockFetchApi.mockImplementation((url: string, _opts?: unknown) => {
    const data = defaults[url] ?? null;
    return Promise.resolve({
      ok: data !== null,
      json: () => Promise.resolve(data),
    });
  });
}

describe("NlqPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render the page title", async () => {
    mockFetchApiResponses();
    render(<NlqPage />);
    expect(screen.getByText("Natural Language Query")).toBeInTheDocument();
  });

  it("should fetch ODRL scope on mount", async () => {
    mockFetchApiResponses();
    render(<NlqPage />);

    await waitFor(() => {
      expect(mockFetchApi).toHaveBeenCalledWith("/api/odrl/scope");
    });
  });

  it("should display ODRL policy scope indicator", async () => {
    mockFetchApiResponses();
    render(<NlqPage />);

    await waitFor(() => {
      expect(screen.getByText("Policy Scope")).toBeInTheDocument();
    });
    expect(screen.getByText("Active Contract")).toBeInTheDocument();
    expect(screen.getByText("HDAB Approved")).toBeInTheDocument();
  });

  it("should display permissions from ODRL scope", async () => {
    mockFetchApiResponses();
    render(<NlqPage />);

    await waitFor(() => {
      expect(screen.getByText("scientific_research")).toBeInTheDocument();
    });
    expect(screen.getByText("statistics")).toBeInTheDocument();
  });

  it("should display prohibitions from ODRL scope", async () => {
    mockFetchApiResponses();
    render(<NlqPage />);

    await waitFor(() => {
      expect(screen.getByText("re_identification")).toBeInTheDocument();
    });
  });

  it("should display accessible datasets from ODRL scope", async () => {
    mockFetchApiResponses();
    render(<NlqPage />);

    await waitFor(() => {
      expect(
        screen.getByText("dataset-synthea-fhir-r4-2026"),
      ).toBeInTheDocument();
    });
  });

  it("should display temporal limit", async () => {
    mockFetchApiResponses();
    render(<NlqPage />);

    await waitFor(() => {
      expect(screen.getByText("2027-12-31T23:59:59")).toBeInTheDocument();
    });
  });

  it("should not show policy scope when ODRL scope fetch fails", async () => {
    mockFetchApiResponses({
      "/api/odrl/scope": null,
    });
    render(<NlqPage />);

    // Give time for fetch to resolve
    await waitFor(() => {
      expect(mockFetchApi).toHaveBeenCalledWith("/api/odrl/scope");
    });

    expect(screen.queryByText("Policy Scope")).not.toBeInTheDocument();
  });

  it("should render example question buttons", async () => {
    mockFetchApiResponses();
    render(<NlqPage />);

    expect(
      screen.getByText("How many patients are there?"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("What are the top 10 conditions?"),
    ).toBeInTheDocument();
  });

  it("should submit query on Ask button click", async () => {
    mockFetchApiResponses();
    render(<NlqPage />);

    const input = screen.getByPlaceholderText(
      /ask a question about the health data/i,
    );
    const askButton = screen.getByText("Ask");

    // Simulate query submission
    mockFetchApi.mockImplementation(
      (url: string, opts?: { method?: string }) => {
        if (url === "/api/nlq" && opts?.method === "POST") {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                question: "How many patients?",
                cypher: "MATCH (p:Patient) RETURN count(p)",
                method: "template",
                templateName: "patient_count",
                federated: false,
                results: [{ count: 127 }],
                totalRows: 1,
                odrlEnforced: true,
              }),
          });
        }
        // Default mount responses
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ templates: [] }),
        });
      },
    );

    await userEvent.type(input, "How many patients?");
    await userEvent.click(askButton);

    await waitFor(() => {
      expect(screen.getByText("Template: patient_count")).toBeInTheDocument();
    });
    expect(screen.getByText("1 row")).toBeInTheDocument();
  });

  it("should show ODRL Enforced badge when result has odrlEnforced", async () => {
    mockFetchApiResponses();

    // Override NLQ POST to return odrlEnforced result
    mockFetchApi.mockImplementation(
      (url: string, opts?: { method?: string }) => {
        if (url === "/api/nlq" && opts?.method === "POST") {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                question: "Test",
                cypher: "MATCH (n) RETURN n",
                method: "llm",
                federated: false,
                results: [],
                totalRows: 0,
                odrlEnforced: true,
              }),
          });
        }
        if (url === "/api/odrl/scope") {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                participantId: "did:web:test",
                permissions: [],
                prohibitions: [],
                accessibleDatasets: [],
                temporalLimit: null,
                policyIds: [],
                hasActiveContract: false,
                hdabApproved: false,
              }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ templates: [] }),
        });
      },
    );

    render(<NlqPage />);

    const input = screen.getByPlaceholderText(
      /ask a question about the health data/i,
    );
    await userEvent.type(input, "Test query");
    await userEvent.click(screen.getByText("Ask"));

    await waitFor(() => {
      expect(screen.getByText("ODRL Enforced")).toBeInTheDocument();
    });
  });

  it("should show GraphRAG badge for graphrag method results", async () => {
    mockFetchApiResponses();

    mockFetchApi.mockImplementation(
      (url: string, opts?: { method?: string }) => {
        if (url === "/api/nlq" && opts?.method === "POST") {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                question: "Find diabetes datasets",
                cypher: "MATCH (d:HealthDataset)...",
                method: "graphrag",
                federated: false,
                results: [{ title: "Diabetes Cohort" }],
                totalRows: 1,
              }),
          });
        }
        return Promise.resolve({
          ok: false,
          json: () => Promise.resolve(null),
        });
      },
    );

    render(<NlqPage />);

    const input = screen.getByPlaceholderText(
      /ask a question about the health data/i,
    );
    await userEvent.type(input, "Find diabetes datasets");
    await userEvent.click(screen.getByText("Ask"));

    await waitFor(() => {
      expect(screen.getByText("GraphRAG")).toBeInTheDocument();
    });
  });

  it("should show federated stats in header when available", async () => {
    mockFetchApiResponses({
      "/api/federated": {
        speCount: 3,
        totals: {
          patients: 127,
          encounters: 450,
          conditions: 312,
          observations: 1200,
        },
        spes: [],
      },
    });

    render(<NlqPage />);

    await waitFor(() => {
      expect(screen.getByText("127")).toBeInTheDocument();
    });
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("SPEs")).toBeInTheDocument();
    expect(screen.getByText("Patients")).toBeInTheDocument();
  });

  it("should handle query error gracefully", async () => {
    mockFetchApiResponses();

    mockFetchApi.mockImplementation(
      (url: string, opts?: { method?: string }) => {
        if (url === "/api/nlq" && opts?.method === "POST") {
          return Promise.reject(new Error("Network error"));
        }
        return Promise.resolve({
          ok: false,
          json: () => Promise.resolve(null),
        });
      },
    );

    render(<NlqPage />);

    const input = screen.getByPlaceholderText(
      /ask a question about the health data/i,
    );
    await userEvent.type(input, "Test query");
    await userEvent.click(screen.getByText("Ask"));

    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeInTheDocument();
    });
  });

  it("should toggle federated mode", async () => {
    mockFetchApiResponses();
    render(<NlqPage />);

    const federatedBtn = screen.getByText("Federated");
    await userEvent.click(federatedBtn);

    // After clicking, the button should have the active styles
    expect(federatedBtn.closest("button")).toHaveClass("bg-blue-500/20");
  });

  it("shows the gate's reason and article when the query is refused (Art. 61(1))", async () => {
    mockFetchApiResponses();
    render(<NlqPage />);
    const input = screen.getByPlaceholderText(
      /ask a question about the health data/i,
    );

    mockFetchApi.mockImplementation(
      (url: string, opts?: { method?: string }) => {
        if (url === "/api/nlq" && opts?.method === "POST") {
          return Promise.resolve({
            ok: false,
            status: 403,
            json: () =>
              Promise.resolve({
                error: "No data permit covers this query",
                reason:
                  "Data permit permit-app-1 for dataset:synthea-fhir-r4-mvd was revoked on 2026-09-16 (Art. 63(3)): output left the SPE with identifiers.",
                article: "Regulation (EU) 2025/327, Art. 61(1) and Art. 68",
                odrlEnforced: true,
              }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ templates: [] }),
        });
      },
    );

    await userEvent.type(input, "How many patients?");
    await userEvent.click(screen.getByText("Ask"));

    const box = await screen.findByTestId("nlq-error");
    expect(box).toHaveTextContent("No data permit covers this query");
    expect(box).toHaveTextContent("revoked on 2026-09-16 (Art. 63(3))");
    expect(box).toHaveTextContent("Art. 61(1)");
  });

  it("lists the data permits the scope is derived from (Art. 68)", async () => {
    mockFetchApiResponses({
      "/api/odrl/scope": {
        participantId: "did:web:pharmaco.de:research",
        participantName: "PharmaCo Research AG",
        permissions: ["scientific_research"],
        prohibitions: [],
        accessibleDatasets: ["dataset:synthea-fhir-r4-mvd"],
        temporalLimit: "2027-12-31T23:59:59.000Z",
        policyIds: [],
        hasActiveContract: false,
        hdabApproved: true,
        permits: [
          {
            permitId: "hdab-decision-medreg-2025-001",
            datasetId: "dataset:synthea-fhir-r4-mvd",
            datasetTitle: "Synthea Synthetic FHIR R4 Patient Cohort",
            purpose: "SCIENTIFIC_RESEARCH",
            validUntil: "2027-12-31T23:59:59.000Z",
          },
        ],
      },
    });
    render(<NlqPage />);

    const permits = await screen.findByTestId("scope-permits");
    expect(permits).toHaveTextContent("Data permits (Art. 68)");
    expect(permits).toHaveTextContent("hdab-decision-medreg-2025-001");
    expect(permits).toHaveTextContent(
      "for Synthea Synthetic FHIR R4 Patient Cohort",
    );
    expect(permits).toHaveTextContent("valid until 2027-12-31");
  });
});
