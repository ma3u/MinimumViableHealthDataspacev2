/**
 * Tests for Portal pages: Admin, Audit, Policies, Tenants, Onboarding, Status, Settings
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

import AdminDashboard from "@/app/admin/page";
import AuditPage from "@/app/admin/audit/page";
import PoliciesPage from "@/app/admin/policies/page";
import TenantsPage from "@/app/admin/tenants/page";
import OnboardingPage from "@/app/onboarding/page";
import OnboardingStatusPage from "@/app/onboarding/status/page";
import SettingsPage from "@/app/settings/page";

function mockResponse(data: unknown) {
  return Promise.resolve({ json: () => Promise.resolve(data), ok: true });
}

describe("AdminDashboard", () => {
  beforeEach(() => {
    mockFetchApi.mockReset();
  });

  it("renders heading", () => {
    mockFetchApi.mockReturnValue(new Promise(() => {}));
    render(<AdminDashboard />);
    expect(screen.getByText("Operator Dashboard")).toBeInTheDocument();
  });

  it("shows loading state", () => {
    mockFetchApi.mockReturnValue(new Promise(() => {}));
    render(<AdminDashboard />);
    expect(screen.getByText(/Loading/i)).toBeInTheDocument();
  });

  it("renders dashboard cards after loading", async () => {
    mockFetchApi.mockReturnValue(
      mockResponse({
        summary: {
          totalTenants: 3,
          totalParticipants: 5,
          byRole: { "data-holder": 2, "data-user": 1 },
        },
        tenants: [],
      }),
    );
    render(<AdminDashboard />);
    await waitFor(() => {
      expect(screen.getByText("Tenants")).toBeInTheDocument();
      expect(screen.getByText("5")).toBeInTheDocument();
    });
  });
});

describe("AuditPage", () => {
  beforeEach(() => {
    mockFetchApi.mockReset();
  });

  it("renders heading", () => {
    mockFetchApi.mockReturnValue(new Promise(() => {}));
    render(<AuditPage />);
    expect(screen.getByText("Audit & Provenance")).toBeInTheDocument();
  });

  it("shows loading state", () => {
    mockFetchApi.mockReturnValue(new Promise(() => {}));
    render(<AuditPage />);
    // Audit page shows "Querying Neo4j…" when loading
    expect(screen.getByText(/Querying Neo4j/)).toBeInTheDocument();
  });
});

describe("PoliciesPage", () => {
  beforeEach(() => {
    mockFetchApi.mockReset();
  });

  it("renders heading", () => {
    mockFetchApi.mockReturnValue(new Promise(() => {}));
    render(<PoliciesPage />);
    expect(screen.getByText("Policy Definitions")).toBeInTheDocument();
  });

  it("shows loading state", () => {
    mockFetchApi.mockReturnValue(new Promise(() => {}));
    render(<PoliciesPage />);
    expect(screen.getByText(/Loading/i)).toBeInTheDocument();
  });

  it("renders policies after loading", async () => {
    mockFetchApi.mockReturnValue(
      mockResponse({
        participants: [
          {
            participantId: "p1",
            identity: "did:web:spe1",
            policies: [{ "@id": "pol1", "edc:policy": { "@type": "Set" } }],
          },
        ],
      }),
    );
    render(<PoliciesPage />);
    await waitFor(() => {
      // Identity is transformed: "did:web:" prefix is removed
      expect(screen.getByText(/spe1/)).toBeInTheDocument();
    });
  });
});

describe("TenantsPage", () => {
  beforeEach(() => {
    mockFetchApi.mockReset();
  });

  it("renders heading", () => {
    mockFetchApi.mockReturnValue(new Promise(() => {}));
    render(<TenantsPage />);
    expect(screen.getByText("Tenant Management")).toBeInTheDocument();
  });

  it("shows loading state", () => {
    mockFetchApi.mockReturnValue(new Promise(() => {}));
    render(<TenantsPage />);
    expect(screen.getByText(/Loading/i)).toBeInTheDocument();
  });
});

describe("OnboardingPage", () => {
  beforeEach(() => {
    mockFetchApi.mockReset();
  });

  it("renders heading", () => {
    mockFetchApi.mockReturnValue(new Promise(() => {}));
    render(<OnboardingPage />);
    expect(screen.getByText("Participant Onboarding")).toBeInTheDocument();
  });

  it("shows loading state", () => {
    mockFetchApi.mockReturnValue(new Promise(() => {}));
    render(<OnboardingPage />);
    expect(screen.getByText(/Loading/i)).toBeInTheDocument();
  });

  it("renders onboarding form after loading", async () => {
    mockFetchApi.mockReturnValue(mockResponse({ tenants: [] }));
    render(<OnboardingPage />);
    await waitFor(() => {
      expect(
        screen.getByText(/New Participant Registration/),
      ).toBeInTheDocument();
    });
  });
});

describe("OnboardingStatusPage", () => {
  beforeEach(() => {
    mockFetchApi.mockReset();
  });

  it("renders heading", async () => {
    mockFetchApi.mockReturnValue(mockResponse({ participants: [] }));
    render(<OnboardingStatusPage />);
    await waitFor(() => {
      expect(screen.getByText("Onboarding Status")).toBeInTheDocument();
    });
  });

  it("shows loading state", () => {
    mockFetchApi.mockReturnValue(new Promise(() => {}));
    render(<OnboardingStatusPage />);
    // Suspense or inner component shows loading text
    expect(screen.getByText(/Loading/)).toBeInTheDocument();
  });
});

describe("SettingsPage", () => {
  beforeEach(() => {
    mockFetchApi.mockReset();
  });

  it("renders heading", async () => {
    // Settings page uses early return when loading — heading only shows after data loads
    mockFetchApi.mockReturnValue(mockResponse({ tenants: [] }));
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByText("Participant Settings")).toBeInTheDocument();
    });
  });

  it("shows loading state", () => {
    mockFetchApi.mockReturnValue(new Promise(() => {}));
    render(<SettingsPage />);
    expect(screen.getByText(/Loading/i)).toBeInTheDocument();
  });

  it("renders settings after loading", async () => {
    mockFetchApi.mockReturnValue(
      mockResponse({
        tenants: [
          {
            id: "t1",
            version: 1,
            properties: { displayName: "SPE-1 Hospital", role: "data-holder" },
            participantProfiles: [],
          },
        ],
      }),
    );
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByText(/SPE-1 Hospital/)).toBeInTheDocument();
    });
  });
});
