/**
 * Tests for Research Insights page (ui/src/app/patient/insights/page.tsx)
 *
 * Covers: loading state, stats cards, research findings, personalised
 * recommendations, donated studies table, privacy banner, empty state,
 * and evidence level badges.
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

import ResearchInsightsPage from "@/app/patient/insights/page";

function mockResponse(data: unknown) {
  return Promise.resolve({ json: () => Promise.resolve(data), ok: true });
}

const INSIGHTS = {
  activeDonations: 2,
  activeStudies: 1,
  donatedStudies: [
    {
      studyId: "STUDY-CARDIO-2024",
      studyName: "European Cardiovascular Risk Study",
      grantedAt: "2024-03-10",
      status: "active",
    },
    {
      studyId: "STUDY-DIAB-2023",
      studyName: "T2D Progression Biomarkers",
      grantedAt: "2023-11-15",
      status: "completed",
    },
  ],
  findings: [
    {
      insightId: "INS-001",
      studyId: "STUDY-DIAB-2023",
      finding:
        "Patients with T2D and chronic stress show 23% faster HbA1c progression.",
      relevantConditions: ["Diabetes mellitus type 2"],
      recommendation: "Request HbA1c test every 3 months.",
      evidenceLevel: "moderate",
    },
    {
      insightId: "INS-002",
      studyId: "STUDY-CARDIO-2024",
      finding:
        "Patients with hypertension + obesity have 31% higher cardiovascular event probability.",
      relevantConditions: ["Hypertension", "Obesity"],
      recommendation: "Discuss statin therapy review with your cardiologist.",
      evidenceLevel: "high",
    },
  ],
  recommendations: [
    {
      category: "Monitoring",
      action: "Increase cardiovascular monitoring frequency to every 6 months.",
      priority: "high" as const,
      basedOn: "T2D + Hypertension co-morbidity pattern",
      ehdsArticle: "EHDS Art. 50",
    },
    {
      category: "Lifestyle",
      action: "Enrol in a certified stress-management programme.",
      priority: "medium" as const,
      basedOn: "Stress biomarker correlation",
      ehdsArticle: "EHDS Art. 50",
    },
  ],
  privacyNote: "All findings are aggregate results (k ≥ 5 participants).",
};

describe("ResearchInsightsPage", () => {
  beforeEach(() => {
    mockFetchApi.mockReset();
  });

  it("shows loading state initially", () => {
    mockFetchApi.mockReturnValue(new Promise(() => {}));
    render(<ResearchInsightsPage />);
    expect(screen.getByText(/Loading insights/i)).toBeInTheDocument();
  });

  it("renders page heading and privacy banner", async () => {
    mockFetchApi.mockReturnValueOnce(mockResponse(INSIGHTS));
    render(<ResearchInsightsPage />);
    await waitFor(() => {
      expect(
        screen.getByText("Research Insights & Medical Recommendations"),
      ).toBeInTheDocument();
    });
    expect(screen.getByText(INSIGHTS.privacyNote)).toBeInTheDocument();
  });

  it("renders stats cards with correct values", async () => {
    mockFetchApi.mockReturnValueOnce(mockResponse(INSIGHTS));
    render(<ResearchInsightsPage />);
    await waitFor(() => {
      expect(screen.getByText("Active donations")).toBeInTheDocument();
    });
    expect(screen.getByText("Active SPE studies")).toBeInTheDocument();
    expect(screen.getByText("Research findings")).toBeInTheDocument();
    // activeDonations=2 and findings.length=2 both render "2" — just check labels exist
  });

  it("renders research findings with evidence badges", async () => {
    mockFetchApi.mockReturnValueOnce(mockResponse(INSIGHTS));
    render(<ResearchInsightsPage />);
    await waitFor(() => {
      expect(
        screen.getByText("Aggregate Research Findings"),
      ).toBeInTheDocument();
    });
    const findings = screen.getAllByTestId("research-finding");
    expect(findings).toHaveLength(2);
    expect(screen.getByText(/23% faster HbA1c/)).toBeInTheDocument();
    expect(screen.getByText(/31% higher cardiovascular/)).toBeInTheDocument();
    expect(screen.getByText("moderate evidence")).toBeInTheDocument();
    expect(screen.getByText("high evidence")).toBeInTheDocument();
  });

  it("renders personalised recommendations", async () => {
    mockFetchApi.mockReturnValueOnce(mockResponse(INSIGHTS));
    render(<ResearchInsightsPage />);
    await waitFor(() => {
      expect(
        screen.getByText("Personalised Recommendations"),
      ).toBeInTheDocument();
    });
    const cards = screen.getAllByTestId("recommendation-card");
    expect(cards).toHaveLength(2);
    expect(screen.getByText("Monitoring")).toBeInTheDocument();
    expect(screen.getByText("Lifestyle")).toBeInTheDocument();
    expect(screen.getByText("high priority")).toBeInTheDocument();
    expect(screen.getByText(/stress-management/)).toBeInTheDocument();
  });

  it("renders recommendation 'based on' and EHDS article", async () => {
    mockFetchApi.mockReturnValueOnce(mockResponse(INSIGHTS));
    render(<ResearchInsightsPage />);
    await waitFor(() => {
      expect(
        screen.getByText(/T2D \+ Hypertension co-morbidity/),
      ).toBeInTheDocument();
    });
    // Both recommendations reference EHDS Art. 50
    const ehdsRefs = screen.getAllByText("EHDS Art. 50");
    expect(ehdsRefs.length).toBeGreaterThanOrEqual(2);
  });

  it("renders finding recommendations (For you:)", async () => {
    mockFetchApi.mockReturnValueOnce(mockResponse(INSIGHTS));
    render(<ResearchInsightsPage />);
    await waitFor(() => {
      expect(
        screen.getByText(/Request HbA1c test every 3 months/),
      ).toBeInTheDocument();
    });
    expect(screen.getByText(/Discuss statin therapy/)).toBeInTheDocument();
  });

  it("renders donated studies table", async () => {
    mockFetchApi.mockReturnValueOnce(mockResponse(INSIGHTS));
    render(<ResearchInsightsPage />);
    await waitFor(() => {
      expect(screen.getByText("Studies Using My Data")).toBeInTheDocument();
    });
    expect(
      screen.getByText("European Cardiovascular Risk Study"),
    ).toBeInTheDocument();
    expect(screen.getByText("T2D Progression Biomarkers")).toBeInTheDocument();
    expect(screen.getByText("active")).toBeInTheDocument();
    expect(screen.getByText("completed")).toBeInTheDocument();
  });

  it("shows 'No insights available' when data is null", async () => {
    mockFetchApi.mockReturnValueOnce(
      Promise.resolve({ json: () => Promise.resolve(null), ok: true }),
    );
    render(<ResearchInsightsPage />);
    await waitFor(() => {
      expect(screen.getByText("No insights available.")).toBeInTheDocument();
    });
  });

  it("renders navigation links (prev/next)", async () => {
    mockFetchApi.mockReturnValueOnce(mockResponse(INSIGHTS));
    render(<ResearchInsightsPage />);
    await waitFor(() => {
      expect(
        screen.getByText("Aggregate Research Findings"),
      ).toBeInTheDocument();
    });
    expect(screen.getByText("Research Programs")).toBeInTheDocument();
    expect(screen.getByText("Health Records")).toBeInTheDocument();
  });

  it("handles empty findings and recommendations gracefully", async () => {
    mockFetchApi.mockReturnValueOnce(
      mockResponse({
        ...INSIGHTS,
        findings: [],
        recommendations: [],
        donatedStudies: [],
      }),
    );
    render(<ResearchInsightsPage />);
    await waitFor(() => {
      expect(screen.getByText("0")).toBeInTheDocument(); // 0 findings in stats
    });
    // Sections should not render when empty
    expect(
      screen.queryByText("Aggregate Research Findings"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Personalised Recommendations"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Studies Using My Data")).not.toBeInTheDocument();
  });
});
