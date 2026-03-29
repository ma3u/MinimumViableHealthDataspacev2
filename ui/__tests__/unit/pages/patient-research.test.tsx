/**
 * Tests for Research Programs page (ui/src/app/patient/research/page.tsx)
 *
 * Covers: loading state, program list rendering, consent status display,
 * donate action, revoke consent action, consent history table, EHDS banner,
 * and empty state.
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

import ResearchProgramsPage from "@/app/patient/research/page";

function mockResponse(data: unknown) {
  return Promise.resolve({ json: () => Promise.resolve(data), ok: true });
}

const RESEARCH_DATA = {
  programs: [
    {
      studyId: "STUDY-CARDIO-2024",
      studyName: "European Cardiovascular Risk Study",
      institution: "PharmaCo Research AG",
      purpose: "secondary-use",
      description: "Multi-centre cohort study of cardiovascular risk factors.",
      dataNeeded: "FHIR Conditions, Observations",
      status: "open",
    },
    {
      studyId: "STUDY-DIAB-2023",
      studyName: "T2D Progression Biomarkers",
      institution: "Institut de Recherche Santé",
      purpose: "secondary-use",
      description: "Identifying biomarker patterns predicting T2D.",
      dataNeeded: "OMOP Drug Exposures, Conditions",
      status: "open",
    },
  ],
  consents: [
    {
      consentId: "CONSENT-001",
      studyId: "STUDY-CARDIO-2024",
      grantedAt: "2024-03-10T09:00:00Z",
      revoked: false,
      purpose: "secondary-use",
    },
  ],
};

describe("ResearchProgramsPage", () => {
  beforeEach(() => {
    mockFetchApi.mockReset();
  });

  it("shows loading state initially", () => {
    mockFetchApi.mockReturnValue(new Promise(() => {}));
    render(<ResearchProgramsPage />);
    expect(screen.getByText(/Loading research programs/i)).toBeInTheDocument();
  });

  it("renders page heading and EHDS Art. 10 banner", async () => {
    mockFetchApi.mockReturnValueOnce(mockResponse(RESEARCH_DATA));
    render(<ResearchProgramsPage />);
    await waitFor(() => {
      expect(screen.getByText("Research Programs")).toBeInTheDocument();
    });
    // EHDS Art. 10 appears in both PageIntro and the banner
    expect(screen.getAllByText(/EHDS Art. 10/).length).toBeGreaterThanOrEqual(
      1,
    );
  });

  it("renders program cards", async () => {
    mockFetchApi.mockReturnValueOnce(mockResponse(RESEARCH_DATA));
    render(<ResearchProgramsPage />);
    await waitFor(() => {
      expect(
        screen.getByText("European Cardiovascular Risk Study"),
      ).toBeInTheDocument();
    });
    expect(screen.getByText("T2D Progression Biomarkers")).toBeInTheDocument();
    expect(screen.getByText("PharmaCo Research AG")).toBeInTheDocument();
    expect(screen.getByText("Institut de Recherche Santé")).toBeInTheDocument();
  });

  it("shows program count in heading", async () => {
    mockFetchApi.mockReturnValueOnce(mockResponse(RESEARCH_DATA));
    render(<ResearchProgramsPage />);
    await waitFor(() => {
      expect(
        screen.getByText(/Available Research Programs \(2\)/),
      ).toBeInTheDocument();
    });
  });

  it("shows 'Donated' badge for consented study", async () => {
    mockFetchApi.mockReturnValueOnce(mockResponse(RESEARCH_DATA));
    render(<ResearchProgramsPage />);
    await waitFor(() => {
      expect(screen.getByText("Donated")).toBeInTheDocument();
    });
  });

  it("shows 'Donate my EHR' button for unconsented study", async () => {
    mockFetchApi.mockReturnValueOnce(mockResponse(RESEARCH_DATA));
    render(<ResearchProgramsPage />);
    await waitFor(() => {
      expect(
        screen.getByText("Donate my EHR to this study"),
      ).toBeInTheDocument();
    });
  });

  it("shows revoke button for consented study", async () => {
    mockFetchApi.mockReturnValueOnce(mockResponse(RESEARCH_DATA));
    render(<ResearchProgramsPage />);
    await waitFor(() => {
      expect(screen.getByText(/Revoke consent/)).toBeInTheDocument();
    });
  });

  it("calls fetchApi with POST when donating", async () => {
    const user = userEvent.setup();
    mockFetchApi
      .mockReturnValueOnce(mockResponse(RESEARCH_DATA))
      .mockReturnValueOnce(mockResponse({ message: "Consent registered" }))
      .mockReturnValueOnce(mockResponse(RESEARCH_DATA));
    render(<ResearchProgramsPage />);
    await waitFor(() => {
      expect(
        screen.getByText("Donate my EHR to this study"),
      ).toBeInTheDocument();
    });
    await user.click(screen.getByText("Donate my EHR to this study"));
    await waitFor(() => {
      expect(mockFetchApi).toHaveBeenCalledWith(
        "/api/patient/research",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("calls fetchApi with DELETE when revoking", async () => {
    const user = userEvent.setup();
    mockFetchApi
      .mockReturnValueOnce(mockResponse(RESEARCH_DATA))
      .mockReturnValueOnce(mockResponse({}))
      .mockReturnValueOnce(mockResponse({ ...RESEARCH_DATA, consents: [] }));
    render(<ResearchProgramsPage />);
    await waitFor(() => {
      expect(screen.getByText(/Revoke consent/)).toBeInTheDocument();
    });
    await user.click(screen.getByText(/Revoke consent/));
    await waitFor(() => {
      expect(mockFetchApi).toHaveBeenCalledWith(
        expect.stringContaining("consentId=CONSENT-001"),
        expect.objectContaining({ method: "DELETE" }),
      );
    });
  });

  it("renders consent history table", async () => {
    mockFetchApi.mockReturnValueOnce(mockResponse(RESEARCH_DATA));
    render(<ResearchProgramsPage />);
    await waitFor(() => {
      expect(screen.getByText("Consent History")).toBeInTheDocument();
    });
    expect(screen.getByText("STUDY-CARDIO-2024")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("shows empty state when no programs", async () => {
    mockFetchApi.mockReturnValueOnce(
      mockResponse({ programs: [], consents: [] }),
    );
    render(<ResearchProgramsPage />);
    await waitFor(() => {
      expect(
        screen.getByText(/No research programs found/),
      ).toBeInTheDocument();
    });
  });

  it("shows success message after donation", async () => {
    const user = userEvent.setup();
    mockFetchApi
      .mockReturnValueOnce(mockResponse(RESEARCH_DATA))
      .mockReturnValueOnce(
        mockResponse({ message: "EHR donation registered." }),
      )
      .mockReturnValueOnce(mockResponse(RESEARCH_DATA));
    render(<ResearchProgramsPage />);
    await waitFor(() => {
      expect(
        screen.getByText("Donate my EHR to this study"),
      ).toBeInTheDocument();
    });
    await user.click(screen.getByText("Donate my EHR to this study"));
    await waitFor(() => {
      expect(screen.getByText("EHR donation registered.")).toBeInTheDocument();
    });
  });

  it("renders navigation links (prev/next)", async () => {
    mockFetchApi.mockReturnValueOnce(mockResponse(RESEARCH_DATA));
    render(<ResearchProgramsPage />);
    await waitFor(() => {
      expect(
        screen.getByText("European Cardiovascular Risk Study"),
      ).toBeInTheDocument();
    });
    expect(screen.getByText("Health Profile")).toBeInTheDocument();
    expect(screen.getByText("Research Insights")).toBeInTheDocument();
  });
});
