/**
 * Comprehensive tests for the Admin Tenants page.
 *
 * Covers: loading state, tenant cards, summary bar, accordion expand/collapse,
 * properties grid, VPA status badges, participant context state, allDisposed
 * warning banner, profile roles, empty state, error handling, DID display,
 * PageIntro heading, error profile styling, multi-tenant expand isolation.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/* ── Mocks ── */

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

import AdminTenantsPage from "@/app/admin/tenants/page";

function mockResponse(data: unknown, ok = true) {
  return Promise.resolve({ json: () => Promise.resolve(data), ok });
}

function mockErrorResponse() {
  return Promise.reject(new Error("Network error"));
}

/* ── Test data ── */

const MOCK_TENANTS = [
  {
    id: "tenant-alpha",
    version: 2,
    properties: {
      displayName: "AlphaKlinik Berlin",
      role: "DATA_HOLDER",
      ehdsParticipantType: "HealthDataHolder",
      organization: "AlphaKlinik Berlin",
    },
    participantProfiles: [
      {
        id: "profile-alpha-1",
        version: 1,
        identifier: "did:web:alpha-klinik.de:participant",
        tenantId: "tenant-alpha",
        participantRoles: { dataspace1: ["DATA_HOLDER", "DATA_INTERMEDIARY"] },
        vpas: [
          {
            id: "vpa-a1",
            state: "active",
            type: "cfm.connector",
            cellId: "cell-1",
          },
          {
            id: "vpa-a2",
            state: "provisioning",
            type: "cfm.identityhub",
            cellId: "cell-2",
          },
        ],
        properties: {
          "cfm.vpa.state": { participantContextId: "ctx-alpha" },
        },
        error: false,
      },
    ],
  },
  {
    id: "tenant-pharmaco",
    version: 1,
    properties: {
      displayName: "PharmaCo Research AG",
      role: "DATA_USER",
      organization: "PharmaCo Research AG",
    },
    participantProfiles: [
      {
        id: "profile-pharmaco-1",
        version: 1,
        identifier: "did:web:pharmaco.de:research",
        tenantId: "tenant-pharmaco",
        participantRoles: { dataspace1: ["DATA_USER"] },
        vpas: [
          {
            id: "vpa-p1",
            state: "disposed",
            type: "cfm.connector",
            cellId: "cell-3",
          },
          {
            id: "vpa-p2",
            state: "disposed",
            type: "cfm.identityhub",
            cellId: "cell-4",
          },
        ],
        properties: {
          "cfm.vpa.state": { participantContextId: "ctx-pharmaco" },
        },
        error: false,
      },
    ],
  },
];

const MOCK_PARTICIPANTS = [
  {
    "@id": "ctx-alpha",
    identity: "did:web:alpha-klinik.de:participant",
    state: "ACTIVE",
  },
  {
    "@id": "ctx-pharmaco",
    identity: "did:web:pharmaco.de:research",
    state: "CREATED",
  },
];

function setupSuccess(
  tenants = MOCK_TENANTS,
  participants = MOCK_PARTICIPANTS,
) {
  mockFetchApi.mockReturnValueOnce(mockResponse({ tenants, participants }));
}

/* ── Tests ── */

describe("AdminTenantsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Loading state ──

  it("shows a loading spinner and text before data arrives", () => {
    // Never-resolving promise keeps loading state
    mockFetchApi.mockReturnValueOnce(new Promise(() => {}));
    render(<AdminTenantsPage />);
    expect(screen.getByText("Loading tenants…")).toBeInTheDocument();
  });

  it("calls fetchApi with /api/admin/tenants", () => {
    mockFetchApi.mockReturnValueOnce(new Promise(() => {}));
    render(<AdminTenantsPage />);
    expect(mockFetchApi).toHaveBeenCalledWith("/api/admin/tenants");
  });

  // ── PageIntro heading ──

  it("renders the Tenant Management heading", async () => {
    setupSuccess();
    render(<AdminTenantsPage />);
    await waitFor(() =>
      expect(screen.getByText("Tenant Management")).toBeInTheDocument(),
    );
  });

  it("renders the page description", async () => {
    setupSuccess();
    render(<AdminTenantsPage />);
    await waitFor(() =>
      expect(
        screen.getByText(/View and manage all registered organisations/),
      ).toBeInTheDocument(),
    );
  });

  // ── Summary bar ──

  it("displays tenant count in summary bar", async () => {
    setupSuccess();
    render(<AdminTenantsPage />);
    await waitFor(() =>
      expect(screen.getByText("2 tenants")).toBeInTheDocument(),
    );
  });

  it("displays participant context count in summary bar", async () => {
    setupSuccess();
    render(<AdminTenantsPage />);
    await waitFor(() =>
      expect(screen.getByText("2 participant contexts")).toBeInTheDocument(),
    );
  });

  it("uses singular 'tenant' for single tenant", async () => {
    setupSuccess([MOCK_TENANTS[0]], [MOCK_PARTICIPANTS[0]]);
    render(<AdminTenantsPage />);
    await waitFor(() =>
      expect(screen.getByText("1 tenant")).toBeInTheDocument(),
    );
  });

  it("uses singular 'participant context' for single participant", async () => {
    setupSuccess([MOCK_TENANTS[0]], [MOCK_PARTICIPANTS[0]]);
    render(<AdminTenantsPage />);
    await waitFor(() =>
      expect(screen.getByText("1 participant context")).toBeInTheDocument(),
    );
  });

  // ── Tenant cards rendering ──

  it("renders tenant display names", async () => {
    setupSuccess();
    render(<AdminTenantsPage />);
    await waitFor(() => {
      expect(screen.getByText("AlphaKlinik Berlin")).toBeInTheDocument();
      expect(screen.getByText("PharmaCo Research AG")).toBeInTheDocument();
    });
  });

  it("shows organization, role, version and profile count in subtitle", async () => {
    setupSuccess();
    render(<AdminTenantsPage />);
    await waitFor(() => {
      expect(
        screen.getByText(/AlphaKlinik Berlin · DATA_HOLDER · v2 · 1 profile/),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/PharmaCo Research AG · DATA_USER · v1 · 1 profile/),
      ).toBeInTheDocument();
    });
  });

  it("shows ehdsParticipantType badge when present", async () => {
    setupSuccess();
    render(<AdminTenantsPage />);
    await waitFor(() =>
      expect(screen.getByText("HealthDataHolder")).toBeInTheDocument(),
    );
  });

  it("falls back to role when ehdsParticipantType is missing", async () => {
    setupSuccess();
    render(<AdminTenantsPage />);
    // PharmaCo has no ehdsParticipantType, should show role as badge
    await waitFor(() => {
      const badges = screen.getAllByText("DATA_USER");
      // One in subtitle, one as badge
      expect(badges.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("falls back to tenant ID when displayName is missing", async () => {
    const noNameTenant = {
      ...MOCK_TENANTS[0],
      id: "tenant-anonymous",
      properties: { role: "DATA_HOLDER", organization: "Anon Org" },
      participantProfiles: [],
    };
    setupSuccess([noNameTenant], []);
    render(<AdminTenantsPage />);
    await waitFor(() =>
      expect(screen.getByText("tenant-anonymous")).toBeInTheDocument(),
    );
  });

  // ── Accordion expand/collapse ──

  it("does not show expanded details by default", async () => {
    setupSuccess();
    render(<AdminTenantsPage />);
    await waitFor(() =>
      expect(screen.getByText("AlphaKlinik Berlin")).toBeInTheDocument(),
    );
    expect(screen.queryByText("Properties")).not.toBeInTheDocument();
  });

  it("expands a tenant card on click", async () => {
    setupSuccess();
    const user = userEvent.setup();
    render(<AdminTenantsPage />);

    await waitFor(() =>
      expect(screen.getByText("AlphaKlinik Berlin")).toBeInTheDocument(),
    );
    await user.click(screen.getByText("AlphaKlinik Berlin"));

    await waitFor(() =>
      expect(screen.getByText("Properties")).toBeInTheDocument(),
    );
  });

  it("collapses an expanded card on second click", async () => {
    setupSuccess();
    const user = userEvent.setup();
    render(<AdminTenantsPage />);

    await waitFor(() =>
      expect(screen.getByText("AlphaKlinik Berlin")).toBeInTheDocument(),
    );
    // Expand
    await user.click(screen.getByText("AlphaKlinik Berlin"));
    await waitFor(() =>
      expect(screen.getByText("Properties")).toBeInTheDocument(),
    );
    // Collapse — target the button element containing the display name
    const heading = screen.getByText("AlphaKlinik Berlin", {
      selector: "p.font-medium",
    });
    await user.click(heading);
    await waitFor(() =>
      expect(screen.queryByText("Properties")).not.toBeInTheDocument(),
    );
  });

  it("only one tenant can be expanded at a time", async () => {
    setupSuccess();
    const user = userEvent.setup();
    render(<AdminTenantsPage />);

    await waitFor(() =>
      expect(screen.getByText("AlphaKlinik Berlin")).toBeInTheDocument(),
    );

    // Expand first tenant
    await user.click(screen.getByText("AlphaKlinik Berlin"));
    await waitFor(() =>
      expect(screen.getByText("profile-alpha-1")).toBeInTheDocument(),
    );

    // Expand second tenant — first should collapse
    await user.click(screen.getByText("PharmaCo Research AG"));
    await waitFor(() => {
      expect(screen.queryByText("profile-alpha-1")).not.toBeInTheDocument();
      expect(screen.getByText("profile-pharmaco-1")).toBeInTheDocument();
    });
  });

  // ── Properties grid ──

  it("shows properties grid in expanded view", async () => {
    setupSuccess();
    const user = userEvent.setup();
    render(<AdminTenantsPage />);

    await waitFor(() =>
      expect(screen.getByText("AlphaKlinik Berlin")).toBeInTheDocument(),
    );
    await user.click(screen.getByText("AlphaKlinik Berlin"));

    await waitFor(() => {
      expect(screen.getByText("displayName:")).toBeInTheDocument();
      expect(screen.getByText("role:")).toBeInTheDocument();
      expect(screen.getByText("organization:")).toBeInTheDocument();
      expect(screen.getByText("ID:")).toBeInTheDocument();
      expect(screen.getByText("tenant-alpha")).toBeInTheDocument();
    });
  });

  // ── Dataspace profiles ──

  it("shows Dataspace Profiles heading in expanded view", async () => {
    setupSuccess();
    const user = userEvent.setup();
    render(<AdminTenantsPage />);

    await waitFor(() =>
      expect(screen.getByText("AlphaKlinik Berlin")).toBeInTheDocument(),
    );
    await user.click(screen.getByText("AlphaKlinik Berlin"));

    await waitFor(() =>
      expect(screen.getByText("Dataspace Profiles")).toBeInTheDocument(),
    );
  });

  // ── DID display ──

  it("displays the DID identifier in profile details", async () => {
    setupSuccess();
    const user = userEvent.setup();
    render(<AdminTenantsPage />);

    await waitFor(() =>
      expect(screen.getByText("AlphaKlinik Berlin")).toBeInTheDocument(),
    );
    await user.click(screen.getByText("AlphaKlinik Berlin"));

    await waitFor(() =>
      expect(
        screen.getByText("did:web:alpha-klinik.de:participant"),
      ).toBeInTheDocument(),
    );
  });

  it("shows dash when identifier is missing", async () => {
    const tenantNoId = {
      ...MOCK_TENANTS[0],
      participantProfiles: [
        { ...MOCK_TENANTS[0].participantProfiles[0], identifier: "" },
      ],
    };
    setupSuccess([tenantNoId], MOCK_PARTICIPANTS);
    const user = userEvent.setup();
    render(<AdminTenantsPage />);

    await waitFor(() =>
      expect(screen.getByText("AlphaKlinik Berlin")).toBeInTheDocument(),
    );
    await user.click(screen.getByText("AlphaKlinik Berlin"));

    await waitFor(() => {
      // DID label followed by dash
      const didLabel = screen.getByText("DID");
      const container = didLabel.parentElement!;
      expect(within(container).getByText("—")).toBeInTheDocument();
    });
  });

  // ── Profile roles ──

  it("displays profile roles", async () => {
    setupSuccess();
    const user = userEvent.setup();
    render(<AdminTenantsPage />);

    await waitFor(() =>
      expect(screen.getByText("AlphaKlinik Berlin")).toBeInTheDocument(),
    );
    await user.click(screen.getByText("AlphaKlinik Berlin"));

    await waitFor(() =>
      expect(
        screen.getByText("DATA_HOLDER, DATA_INTERMEDIARY"),
      ).toBeInTheDocument(),
    );
  });

  it("shows dash when profile has no roles", async () => {
    const tenantNoRoles = {
      ...MOCK_TENANTS[0],
      participantProfiles: [
        {
          ...MOCK_TENANTS[0].participantProfiles[0],
          participantRoles: {},
        },
      ],
    };
    setupSuccess([tenantNoRoles], MOCK_PARTICIPANTS);
    const user = userEvent.setup();
    render(<AdminTenantsPage />);

    await waitFor(() =>
      expect(screen.getByText("AlphaKlinik Berlin")).toBeInTheDocument(),
    );
    await user.click(screen.getByText("AlphaKlinik Berlin"));

    await waitFor(() => {
      const rolesLabel = screen.getByText("Roles");
      const container = rolesLabel.parentElement!;
      expect(within(container).getByText("—")).toBeInTheDocument();
    });
  });

  // ── VPA status badges ──

  it("renders active VPA badges", async () => {
    setupSuccess();
    const user = userEvent.setup();
    render(<AdminTenantsPage />);

    await waitFor(() =>
      expect(screen.getByText("AlphaKlinik Berlin")).toBeInTheDocument(),
    );
    await user.click(screen.getByText("AlphaKlinik Berlin"));

    await waitFor(() => expect(screen.getByText("active")).toBeInTheDocument());
  });

  it("renders provisioning VPA badges", async () => {
    setupSuccess();
    const user = userEvent.setup();
    render(<AdminTenantsPage />);

    await waitFor(() =>
      expect(screen.getByText("AlphaKlinik Berlin")).toBeInTheDocument(),
    );
    await user.click(screen.getByText("AlphaKlinik Berlin"));

    await waitFor(() =>
      expect(screen.getByText("provisioning")).toBeInTheDocument(),
    );
  });

  it("renders disposed VPA badges", async () => {
    setupSuccess();
    const user = userEvent.setup();
    render(<AdminTenantsPage />);

    await waitFor(() =>
      expect(screen.getByText("PharmaCo Research AG")).toBeInTheDocument(),
    );
    await user.click(screen.getByText("PharmaCo Research AG"));

    await waitFor(() => {
      const disposedBadges = screen.getAllByText("disposed");
      expect(disposedBadges.length).toBe(2);
    });
  });

  it("strips cfm. prefix from VPA type labels", async () => {
    setupSuccess();
    const user = userEvent.setup();
    render(<AdminTenantsPage />);

    await waitFor(() =>
      expect(screen.getByText("AlphaKlinik Berlin")).toBeInTheDocument(),
    );
    await user.click(screen.getByText("AlphaKlinik Berlin"));

    await waitFor(() => {
      expect(screen.getByText(/connector/)).toBeInTheDocument();
      expect(screen.getByText(/identityhub/)).toBeInTheDocument();
    });
  });

  // ── Participant context state ──

  it("shows ACTIVE participant state in green", async () => {
    setupSuccess();
    const user = userEvent.setup();
    render(<AdminTenantsPage />);

    await waitFor(() =>
      expect(screen.getByText("AlphaKlinik Berlin")).toBeInTheDocument(),
    );
    await user.click(screen.getByText("AlphaKlinik Berlin"));

    await waitFor(() => {
      const stateEl = screen.getByText("ACTIVE");
      expect(stateEl).toHaveClass("text-green-400");
    });
  });

  it("shows CREATED participant state in blue", async () => {
    setupSuccess();
    const user = userEvent.setup();
    render(<AdminTenantsPage />);

    await waitFor(() =>
      expect(screen.getByText("PharmaCo Research AG")).toBeInTheDocument(),
    );
    await user.click(screen.getByText("PharmaCo Research AG"));

    await waitFor(() => {
      const stateEl = screen.getByText("CREATED");
      expect(stateEl).toHaveClass("text-blue-400");
    });
  });

  it("shows yellow for unknown participant state", async () => {
    const customParticipants = [
      { "@id": "ctx-alpha", identity: "did:web:alpha", state: "PENDING" },
    ];
    setupSuccess(MOCK_TENANTS, customParticipants);
    const user = userEvent.setup();
    render(<AdminTenantsPage />);

    await waitFor(() =>
      expect(screen.getByText("AlphaKlinik Berlin")).toBeInTheDocument(),
    );
    await user.click(screen.getByText("AlphaKlinik Berlin"));

    await waitFor(() => {
      const stateEl = screen.getByText("PENDING");
      expect(stateEl).toHaveClass("text-yellow-400");
    });
  });

  // ── allDisposed warning banner ──

  it("shows disposed warning when all VPAs are disposed", async () => {
    setupSuccess();
    const user = userEvent.setup();
    render(<AdminTenantsPage />);

    await waitFor(() =>
      expect(screen.getByText("PharmaCo Research AG")).toBeInTheDocument(),
    );
    await user.click(screen.getByText("PharmaCo Research AG"));

    await waitFor(() => {
      expect(screen.getByText(/VPAs disposed/)).toBeInTheDocument();
      expect(screen.getByText("seed-health-tenants.sh")).toBeInTheDocument();
    });
  });

  it("does not show disposed warning when VPAs are mixed", async () => {
    setupSuccess();
    const user = userEvent.setup();
    render(<AdminTenantsPage />);

    await waitFor(() =>
      expect(screen.getByText("AlphaKlinik Berlin")).toBeInTheDocument(),
    );
    await user.click(screen.getByText("AlphaKlinik Berlin"));

    await waitFor(() =>
      expect(screen.queryByText(/VPAs disposed/)).not.toBeInTheDocument(),
    );
  });

  // ── Error profile styling ──

  it("applies error styling to profiles with error flag", async () => {
    const errorTenant = {
      ...MOCK_TENANTS[0],
      participantProfiles: [
        { ...MOCK_TENANTS[0].participantProfiles[0], error: true },
      ],
    };
    setupSuccess([errorTenant], MOCK_PARTICIPANTS);
    const user = userEvent.setup();
    render(<AdminTenantsPage />);

    await waitFor(() =>
      expect(screen.getByText("AlphaKlinik Berlin")).toBeInTheDocument(),
    );
    await user.click(screen.getByText("AlphaKlinik Berlin"));

    await waitFor(() => {
      const profileCard = screen
        .getByText("profile-alpha-1")
        .closest("div.p-3");
      expect(profileCard).toHaveClass("border-yellow-700/60");
    });
  });

  it("applies normal styling to profiles without error", async () => {
    setupSuccess();
    const user = userEvent.setup();
    render(<AdminTenantsPage />);

    await waitFor(() =>
      expect(screen.getByText("AlphaKlinik Berlin")).toBeInTheDocument(),
    );
    await user.click(screen.getByText("AlphaKlinik Berlin"));

    await waitFor(() => {
      const profileCard = screen
        .getByText("profile-alpha-1")
        .closest("div.p-3");
      expect(profileCard).toHaveClass("border-gray-700");
    });
  });

  // ── Empty state ──

  it("shows empty state when no tenants are returned", async () => {
    setupSuccess([], []);
    render(<AdminTenantsPage />);
    await waitFor(() =>
      expect(screen.getByText("No tenants registered")).toBeInTheDocument(),
    );
  });

  it("shows 0 tenants in summary bar for empty response", async () => {
    setupSuccess([], []);
    render(<AdminTenantsPage />);
    await waitFor(() =>
      expect(screen.getByText("0 tenants")).toBeInTheDocument(),
    );
  });

  // ── Error handling ──

  it("handles fetch failure gracefully", async () => {
    mockFetchApi.mockReturnValueOnce(mockErrorResponse());
    render(<AdminTenantsPage />);
    await waitFor(() =>
      expect(screen.getByText("No tenants registered")).toBeInTheDocument(),
    );
  });

  it("handles non-ok response by showing empty state", async () => {
    mockFetchApi.mockReturnValueOnce(mockResponse({}, false));
    render(<AdminTenantsPage />);
    await waitFor(() =>
      expect(screen.getByText("No tenants registered")).toBeInTheDocument(),
    );
  });

  // ── Navigation links via PageIntro ──

  it("renders nav link to Operator Dashboard", async () => {
    setupSuccess();
    render(<AdminTenantsPage />);
    await waitFor(() => {
      const link = screen.getByText("Operator Dashboard");
      expect(link.closest("a")).toHaveAttribute("href", "/admin");
    });
  });

  it("renders nav link to Policy Definitions", async () => {
    setupSuccess();
    render(<AdminTenantsPage />);
    await waitFor(() => {
      const link = screen.getByText("Policy Definitions");
      expect(link.closest("a")).toHaveAttribute("href", "/admin/policies");
    });
  });

  // ── Participant context ID display ──

  it("shows participant context ID in profile grid", async () => {
    setupSuccess();
    const user = userEvent.setup();
    render(<AdminTenantsPage />);

    await waitFor(() =>
      expect(screen.getByText("AlphaKlinik Berlin")).toBeInTheDocument(),
    );
    await user.click(screen.getByText("AlphaKlinik Berlin"));

    await waitFor(() => {
      expect(screen.getByText("Participant Ctx")).toBeInTheDocument();
      expect(screen.getByText("ctx-alpha")).toBeInTheDocument();
    });
  });

  // ── Profile with no VPAs ──

  it("does not render VPA section when profile has no VPAs", async () => {
    const noVpaTenant = {
      ...MOCK_TENANTS[0],
      participantProfiles: [
        { ...MOCK_TENANTS[0].participantProfiles[0], vpas: [] },
      ],
    };
    setupSuccess([noVpaTenant], MOCK_PARTICIPANTS);
    const user = userEvent.setup();
    render(<AdminTenantsPage />);

    await waitFor(() =>
      expect(screen.getByText("AlphaKlinik Berlin")).toBeInTheDocument(),
    );
    await user.click(screen.getByText("AlphaKlinik Berlin"));

    await waitFor(() => {
      // Profile section renders but no VPA badges
      expect(screen.getByText("Dataspace Profiles")).toBeInTheDocument();
      expect(screen.queryByText("active")).not.toBeInTheDocument();
      expect(screen.queryByText("disposed")).not.toBeInTheDocument();
    });
  });

  // ── Tenant with no participant profiles ──

  it("does not show Dataspace Profiles heading for tenant with empty profiles", async () => {
    const noProfileTenant = {
      id: "tenant-empty",
      version: 1,
      properties: {
        displayName: "Empty Tenant",
        role: "DATA_HOLDER",
        organization: "Empty Org",
      },
      participantProfiles: [],
    };
    setupSuccess([noProfileTenant], []);
    const user = userEvent.setup();
    render(<AdminTenantsPage />);

    await waitFor(() =>
      expect(screen.getByText("Empty Tenant")).toBeInTheDocument(),
    );
    await user.click(screen.getByText("Empty Tenant"));

    await waitFor(() => {
      expect(screen.getByText("Properties")).toBeInTheDocument();
      expect(screen.queryByText("Dataspace Profiles")).not.toBeInTheDocument();
    });
  });
});
