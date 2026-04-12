/**
 * Tests for Portal pages: Admin, Audit, Policies, Tenants, Onboarding, Status, Settings
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockFetchApi = vi.fn();
vi.mock("@/lib/api", () => ({
  fetchApi: (...args: unknown[]) => mockFetchApi(...args),
}));

vi.mock("@/lib/use-demo-persona", () => ({
  useDemoPersona: () => ({ username: "edcadmin", roles: ["EDC_ADMIN"] }),
}));

vi.mock("@/lib/use-tab-session", () => ({
  useTabSession: () => ({
    session: {
      username: "edcadmin",
      email: "edcadmin@demo.ehds.eu",
      roles: ["EDC_ADMIN"],
    },
    status: "authenticated",
  }),
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

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
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
    expect(screen.getByText("System Overview")).toBeInTheDocument();
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

  it("renders without crashing (redirects to /onboarding)", () => {
    render(<OnboardingStatusPage />);
    // Page now just renders a Redirector inside Suspense — no visible content
    expect(document.body).toBeInTheDocument();
  });
});

describe("SettingsPage", () => {
  beforeEach(() => {
    mockFetchApi.mockReset();
  });

  const fullTenant = {
    id: "tenant-abc-123",
    version: 1,
    properties: {
      displayName: "SPE-1 Hospital",
      organization: "University Medical Center",
      ehdsParticipantType: "data-holder",
      role: "data-holder",
    },
    participantProfiles: [
      {
        id: "dp-1",
        identifier: "did:web:spe1:participant",
        tenantId: "tenant-abc-123",
      },
    ],
  };

  const secondTenant = {
    id: "tenant-xyz-789",
    version: 1,
    properties: {
      displayName: "SPE-2 Research Lab",
      organization: "Research Institute",
      ehdsParticipantType: "data-user",
    },
    participantProfiles: [],
  };

  it("renders heading", async () => {
    mockFetchApi.mockReturnValue(mockResponse({ tenants: [] }));
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByText(/Settings/)).toBeInTheDocument();
    });
  });

  it("shows loading state", () => {
    mockFetchApi.mockReturnValue(new Promise(() => {}));
    render(<SettingsPage />);
    expect(screen.getByText(/Loading/i)).toBeInTheDocument();
  });

  it("renders settings after loading", async () => {
    mockFetchApi.mockReturnValue(mockResponse({ tenants: [fullTenant] }));
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByText(/SPE-1 Hospital/)).toBeInTheDocument();
    });
  });

  it("shows empty state with registration link when no tenants", async () => {
    mockFetchApi.mockReturnValue(mockResponse({ tenants: [] }));
    render(<SettingsPage />);
    await waitFor(() => {
      expect(
        screen.getByText("No participant profile found"),
      ).toBeInTheDocument();
    });
    const regLink = screen.getByText("Register first →");
    expect(regLink).toBeInTheDocument();
    expect(regLink.closest("a")).toHaveAttribute("href", "/onboarding");
  });

  it("renders profile details with organization and EHDS role", async () => {
    mockFetchApi.mockReturnValue(mockResponse({ tenants: [fullTenant] }));
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByText("SPE-1 Hospital")).toBeInTheDocument();
    });
    // Organization is in an editable form input
    expect(
      screen.getByDisplayValue("University Medical Center"),
    ).toBeInTheDocument();
    expect(screen.getByText("data-holder")).toBeInTheDocument();
    expect(screen.getByText("tenant-abc-123")).toBeInTheDocument();
    expect(screen.getByText("Identity")).toBeInTheDocument();
  });

  it("renders dataspace profiles section", async () => {
    mockFetchApi.mockReturnValue(mockResponse({ tenants: [fullTenant] }));
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByText("Dataspace Profiles")).toBeInTheDocument();
    });
    // Profile ID is rendered in the dataspace profiles section
    expect(screen.getByText(/dp-1/)).toBeInTheDocument();
  });

  it("shows no dataspace profiles message when empty", async () => {
    const tenantNoProfiles = { ...fullTenant, participantProfiles: [] };
    mockFetchApi.mockReturnValue(mockResponse({ tenants: [tenantNoProfiles] }));
    render(<SettingsPage />);
    await waitFor(() => {
      expect(
        screen.getByText("No dataspace profiles linked yet."),
      ).toBeInTheDocument();
    });
  });

  it("renders save button and shows saved feedback", async () => {
    const user = userEvent.setup();
    mockFetchApi.mockReturnValue(mockResponse({ tenants: [fullTenant] }));
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByText("Save Changes")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Save Changes"));
    expect(screen.getByText("Saved")).toBeInTheDocument();
  });

  it("renders tenant selector when multiple tenants", async () => {
    mockFetchApi.mockReturnValue(
      mockResponse({ tenants: [fullTenant, secondTenant] }),
    );
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByText("Active Profile")).toBeInTheDocument();
    });
    // Both tenant names should be in the selector
    const select = screen.getByRole("combobox");
    expect(select).toBeInTheDocument();
  });

  it("handles fetch error gracefully", async () => {
    mockFetchApi.mockReturnValue(Promise.reject(new Error("fail")));
    render(<SettingsPage />);
    await waitFor(() => {
      // Should show empty state (no crash), heading renders
      expect(screen.getByText(/Settings/)).toBeInTheDocument();
    });
  });
});
