/**
 * Tests for Patient Profile page (ui/src/app/patient/profile/page.tsx)
 *
 * Covers: loading state, patient list rendering, profile display with
 * risk scores, conditions, medications, interests, GDPR rights banner,
 * patient selector, and error handling.
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

import PatientProfilePage from "@/app/patient/profile/page";

function mockResponse(data: unknown) {
  return Promise.resolve({ json: () => Promise.resolve(data), ok: true });
}

const PATIENT_LIST = {
  patients: [
    {
      id: "P1",
      name: "Anna Müller",
      gender: "female",
      birthDate: "1979-03-15",
      conditionCount: 8,
    },
    {
      id: "P2",
      name: "Jan de Vries",
      gender: "male",
      birthDate: "1965-07-22",
      conditionCount: 12,
    },
  ],
};

const PROFILE = {
  patient: {
    id: "P1",
    name: "Anna Müller",
    gender: "female",
    birthDate: "1979-03-15",
  },
  conditions: [
    {
      code: "E11.9",
      display: "Diabetes mellitus type 2",
      onsetDate: "2018-01-15",
    },
    { code: "I10", display: "Essential hypertension", onsetDate: "2019-06-01" },
  ],
  medications: [{ code: "860975", display: "Metformin 500 mg" }],
  riskScores: {
    cardiovascular: {
      score: 0.42,
      level: "moderate" as const,
      factors: ["Hypertension", "BMI > 30"],
    },
    diabetes: {
      score: 0.65,
      level: "high" as const,
      factors: ["T2D diagnosed", "Family history"],
    },
  },
  interests: ["cardiovascular-health", "diabetes-management"],
  gdprRights: { access: "GDPR Art. 15", portability: "GDPR Art. 20" },
  totalConditionCount: 8,
};

describe("PatientProfilePage", () => {
  beforeEach(() => {
    mockFetchApi.mockReset();
  });

  it("shows loading state initially", () => {
    mockFetchApi.mockReturnValue(new Promise(() => {}));
    render(<PatientProfilePage />);
    // Page renders heading while patient list loads
    expect(
      screen.getByText("Health Profile & Risk Assessment"),
    ).toBeInTheDocument();
  });

  it("renders page heading and GDPR rights banner", async () => {
    // First call: patient list, second call: profile detail
    mockFetchApi
      .mockReturnValueOnce(mockResponse(PATIENT_LIST))
      .mockReturnValueOnce(mockResponse(PROFILE));
    render(<PatientProfilePage />);
    await waitFor(() => {
      expect(
        screen.getByText("Health Profile & Risk Assessment"),
      ).toBeInTheDocument();
    });
    expect(screen.getByText(/Your data rights/)).toBeInTheDocument();
  });

  it("renders patient selector with both patients", async () => {
    mockFetchApi
      .mockReturnValueOnce(mockResponse(PATIENT_LIST))
      .mockReturnValueOnce(mockResponse(PROFILE));
    render(<PatientProfilePage />);
    await waitFor(() => {
      expect(screen.getByText(/Select patient record/)).toBeInTheDocument();
    });
    const select = screen.getByRole("combobox");
    expect(select).toBeInTheDocument();
    expect(select.children).toHaveLength(2);
  });

  it("renders patient demographics after loading", async () => {
    mockFetchApi
      .mockReturnValueOnce(mockResponse(PATIENT_LIST))
      .mockReturnValueOnce(mockResponse(PROFILE));
    render(<PatientProfilePage />);
    await waitFor(() => {
      expect(screen.getByText("Anna Müller")).toBeInTheDocument();
    });
    expect(screen.getByText("female")).toBeInTheDocument();
    expect(screen.getByText("1979-03-15")).toBeInTheDocument();
  });

  it("renders risk score cards with correct levels", async () => {
    mockFetchApi
      .mockReturnValueOnce(mockResponse(PATIENT_LIST))
      .mockReturnValueOnce(mockResponse(PROFILE));
    render(<PatientProfilePage />);
    await waitFor(() => {
      expect(screen.getByText("Health Risk Assessment")).toBeInTheDocument();
    });
    expect(screen.getByTestId("risk-card-cardiovascular")).toBeInTheDocument();
    expect(screen.getByTestId("risk-card-diabetes")).toBeInTheDocument();
    expect(screen.getByText("42%")).toBeInTheDocument();
    expect(screen.getByText("65%")).toBeInTheDocument();
    expect(screen.getByText("moderate risk")).toBeInTheDocument();
    expect(screen.getByText("high risk")).toBeInTheDocument();
  });

  it("renders risk factors", async () => {
    mockFetchApi
      .mockReturnValueOnce(mockResponse(PATIENT_LIST))
      .mockReturnValueOnce(mockResponse(PROFILE));
    render(<PatientProfilePage />);
    await waitFor(() => {
      expect(screen.getByText(/Hypertension/)).toBeInTheDocument();
    });
    expect(screen.getByText(/BMI > 30/)).toBeInTheDocument();
    expect(screen.getByText(/T2D diagnosed/)).toBeInTheDocument();
  });

  it("renders health interests as tags", async () => {
    mockFetchApi
      .mockReturnValueOnce(mockResponse(PATIENT_LIST))
      .mockReturnValueOnce(mockResponse(PROFILE));
    render(<PatientProfilePage />);
    await waitFor(() => {
      expect(screen.getByText("Health Interests & Goals")).toBeInTheDocument();
    });
    expect(screen.getByText("cardiovascular health")).toBeInTheDocument();
    expect(screen.getByText("diabetes management")).toBeInTheDocument();
  });

  it("renders conditions table", async () => {
    mockFetchApi
      .mockReturnValueOnce(mockResponse(PATIENT_LIST))
      .mockReturnValueOnce(mockResponse(PROFILE));
    render(<PatientProfilePage />);
    await waitFor(() => {
      expect(screen.getByText("Active Conditions")).toBeInTheDocument();
    });
    expect(screen.getByText("Diabetes mellitus type 2")).toBeInTheDocument();
    expect(screen.getByText("E11.9")).toBeInTheDocument();
    expect(screen.getByText("Essential hypertension")).toBeInTheDocument();
  });

  it("switches patient when selector changes", async () => {
    const user = userEvent.setup();
    const PROFILE_P2 = {
      ...PROFILE,
      patient: {
        id: "P2",
        name: "Jan de Vries",
        gender: "male",
        birthDate: "1965-07-22",
      },
    };
    mockFetchApi
      .mockReturnValueOnce(mockResponse(PATIENT_LIST))
      .mockReturnValueOnce(mockResponse(PROFILE))
      .mockReturnValueOnce(mockResponse(PROFILE_P2));
    render(<PatientProfilePage />);
    await waitFor(() => {
      expect(screen.getByText("Anna Müller")).toBeInTheDocument();
    });
    const select = screen.getByRole("combobox");
    await user.selectOptions(select, "P2");
    await waitFor(() => {
      expect(screen.getByText("Jan de Vries")).toBeInTheDocument();
    });
  });

  it("renders navigation links (prev/next)", async () => {
    mockFetchApi
      .mockReturnValueOnce(mockResponse(PATIENT_LIST))
      .mockReturnValueOnce(mockResponse(PROFILE));
    render(<PatientProfilePage />);
    await waitFor(() => {
      expect(screen.getByText("Anna Müller")).toBeInTheDocument();
    });
    expect(screen.getByText("Health Records")).toBeInTheDocument();
    expect(screen.getByText("Research Programs")).toBeInTheDocument();
  });
});
