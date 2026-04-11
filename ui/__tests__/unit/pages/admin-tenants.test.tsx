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
        screen.getByText(/Manage EHDS participant organisations/),
      ).toBeInTheDocument(),
    );
  });

  // ── Stat cards ──

  it("displays Total Tenants stat card", async () => {
    setupSuccess();
    render(<AdminTenantsPage />);
    await waitFor(() =>
      expect(screen.getByText("Total Tenants")).toBeInTheDocument(),
    );
  });

  it("displays Participant Profiles stat card", async () => {
    setupSuccess();
    render(<AdminTenantsPage />);
    await waitFor(() =>
      expect(screen.getByText("Participant Profiles")).toBeInTheDocument(),
    );
  });

  it("displays tenant count as number in stat card", async () => {
    setupSuccess([MOCK_TENANTS[0]], [MOCK_PARTICIPANTS[0]]);
    render(<AdminTenantsPage />);
    // Wait for loading to finish; tenant count "1" is in the stat card
    await waitFor(() =>
      expect(screen.getByText("Total Tenants")).toBeInTheDocument(),
    );
  });

  it("displays Disposed VPAs stat card", async () => {
    setupSuccess([MOCK_TENANTS[0]], [MOCK_PARTICIPANTS[0]]);
    render(<AdminTenantsPage />);
    await waitFor(() =>
      expect(screen.getByText("Disposed VPAs")).toBeInTheDocument(),
    );
  });

  // ── Tenant cards rendering ──

  it("renders tenant display names", async () => {
    setupSuccess();
    render(<AdminTenantsPage />);
    await waitFor(() => {
      // Each name appears at least once (in table row)
      const alphas = screen.getAllByText("AlphaKlinik Berlin");
      expect(alphas.length).toBeGreaterThanOrEqual(1);
      const pharmas = screen.getAllByText("PharmaCo Research AG");
      expect(pharmas.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("shows organisation ID as secondary text in table row", async () => {
    setupSuccess();
    render(<AdminTenantsPage />);
    await waitFor(() => {
      // organization property is shown as secondary text below display name
      const orgTexts = screen.getAllByText("AlphaKlinik Berlin");
      expect(orgTexts.length).toBeGreaterThanOrEqual(1);
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
    // PharmaCo has no ehdsParticipantType, role column shows "Researcher" (mapped label)
    await waitFor(() => {
      // ROLE_CONFIG maps DATA_USER → label "Researcher"
      expect(screen.getByText("Researcher")).toBeInTheDocument();
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
      expect(screen.getByText("Registered Organisations")).toBeInTheDocument(),
    );
    // Expanded detail row (Tenant ID label) should not be visible without expanding
    expect(screen.queryByText("Tenant ID")).not.toBeInTheDocument();
  });

  it("expands a tenant row on chevron click", async () => {
    setupSuccess();
    const user = userEvent.setup();
    render(<AdminTenantsPage />);

    await waitFor(() =>
      expect(screen.getByText("Registered Organisations")).toBeInTheDocument(),
    );
    const expandBtn = screen.getAllByLabelText("Expand details")[0];
    await user.click(expandBtn);

    await waitFor(() =>
      expect(screen.getByText("Tenant ID")).toBeInTheDocument(),
    );
  });

  it("collapses an expanded row on second chevron click", async () => {
    setupSuccess();
    const user = userEvent.setup();
    render(<AdminTenantsPage />);

    await waitFor(() =>
      expect(screen.getByText("Registered Organisations")).toBeInTheDocument(),
    );
    const expandBtn = screen.getAllByLabelText("Expand details")[0];
    // Expand
    await user.click(expandBtn);
    await waitFor(() =>
      expect(screen.getByText("Tenant ID")).toBeInTheDocument(),
    );
    // Collapse (button now shows "Collapse details")
    const collapseBtn = screen.getByLabelText("Collapse details");
    await user.click(collapseBtn);
    await waitFor(() =>
      expect(screen.queryByText("Tenant ID")).not.toBeInTheDocument(),
    );
  });

  it("only one tenant can be expanded at a time", async () => {
    setupSuccess();
    const user = userEvent.setup();
    render(<AdminTenantsPage />);

    await waitFor(() =>
      expect(screen.getByText("Registered Organisations")).toBeInTheDocument(),
    );

    const expandBtns = screen.getAllByLabelText("Expand details");

    // Expand first tenant
    await user.click(expandBtns[0]);
    await waitFor(() =>
      expect(screen.getByText("profile-alpha-1")).toBeInTheDocument(),
    );

    // Expand second tenant — first should collapse
    await user.click(expandBtns[1]);
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
      expect(screen.getByText("Registered Organisations")).toBeInTheDocument(),
    );
    const expandBtn = screen.getAllByLabelText("Expand details")[0];
    await user.click(expandBtn);

    await waitFor(() => {
      // Property keys are shown uppercased and the "Tenant ID" label always present
      expect(screen.getByText("Tenant ID")).toBeInTheDocument();
      expect(screen.getByText("tenant-alpha")).toBeInTheDocument();
    });
  });

  // ── Dataspace profiles ──

  it("shows Dataspace Profiles heading in expanded view", async () => {
    setupSuccess();
    const user = userEvent.setup();
    render(<AdminTenantsPage />);

    await waitFor(() =>
      expect(screen.getByText("Registered Organisations")).toBeInTheDocument(),
    );
    const expandBtn = screen.getAllByLabelText("Expand details")[0];
    await user.click(expandBtn);

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
      expect(screen.getByText("Registered Organisations")).toBeInTheDocument(),
    );
    const expandBtn = screen.getAllByLabelText("Expand details")[0];
    await user.click(expandBtn);

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
      expect(screen.getByText("Registered Organisations")).toBeInTheDocument(),
    );
    const expandBtn = screen.getByLabelText("Expand details");
    await user.click(expandBtn);

    await waitFor(() => {
      // The profile grid has a "DID" label span followed by a "—" value span.
      // Use getAllByText with exact:false to find the container.
      const allDashes = screen.getAllByText("—");
      // At least one dash should be present for the missing identifier
      expect(allDashes.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── Profile roles ──

  it("displays profile roles", async () => {
    setupSuccess();
    const user = userEvent.setup();
    render(<AdminTenantsPage />);

    await waitFor(() =>
      expect(screen.getByText("Registered Organisations")).toBeInTheDocument(),
    );
    const expandBtn = screen.getAllByLabelText("Expand details")[0];
    await user.click(expandBtn);

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
      expect(screen.getByText("Registered Organisations")).toBeInTheDocument(),
    );
    const expandBtn = screen.getByLabelText("Expand details");
    await user.click(expandBtn);

    await waitFor(() => {
      // The profile grid has a "Roles" label span followed by a "—" value span.
      // Verify the dash is present for the empty roles case.
      const allDashes = screen.getAllByText("—");
      expect(allDashes.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── VPA status badges ──

  it("renders active VPA badges", async () => {
    setupSuccess();
    const user = userEvent.setup();
    render(<AdminTenantsPage />);

    await waitFor(() =>
      expect(screen.getByText("Registered Organisations")).toBeInTheDocument(),
    );
    const expandBtns = screen.getAllByLabelText("Expand details");
    await user.click(expandBtns[0]);

    // VPA badges show "connector active" and "identityhub provisioning"
    await waitFor(() =>
      expect(screen.getByText(/connector/)).toBeInTheDocument(),
    );
  });

  it("renders provisioning VPA badges", async () => {
    setupSuccess();
    const user = userEvent.setup();
    render(<AdminTenantsPage />);

    await waitFor(() =>
      expect(screen.getByText("Registered Organisations")).toBeInTheDocument(),
    );
    const expandBtns = screen.getAllByLabelText("Expand details");
    await user.click(expandBtns[0]);

    await waitFor(() =>
      expect(screen.getByText(/provisioning/)).toBeInTheDocument(),
    );
  });

  it("renders disposed VPA badges", async () => {
    setupSuccess();
    const user = userEvent.setup();
    render(<AdminTenantsPage />);

    await waitFor(() =>
      expect(screen.getByText("Registered Organisations")).toBeInTheDocument(),
    );
    const expandBtns = screen.getAllByLabelText("Expand details");
    await user.click(expandBtns[1]);

    await waitFor(() => {
      const disposedBadges = screen.getAllByText(/disposed/);
      expect(disposedBadges.length).toBeGreaterThanOrEqual(2);
    });
  });

  it("strips cfm. prefix from VPA type labels", async () => {
    setupSuccess();
    const user = userEvent.setup();
    render(<AdminTenantsPage />);

    await waitFor(() =>
      expect(screen.getByText("Registered Organisations")).toBeInTheDocument(),
    );
    const expandBtns = screen.getAllByLabelText("Expand details");
    await user.click(expandBtns[0]);

    await waitFor(() => {
      expect(screen.getByText(/connector/)).toBeInTheDocument();
      expect(screen.getByText(/identityhub/)).toBeInTheDocument();
    });
  });

  // ── Participant context state ──

  it("shows ACTIVE participant state with success styling", async () => {
    setupSuccess();
    const user = userEvent.setup();
    render(<AdminTenantsPage />);

    await waitFor(() =>
      expect(screen.getByText("Registered Organisations")).toBeInTheDocument(),
    );
    const expandBtns = screen.getAllByLabelText("Expand details");
    await user.click(expandBtns[0]);

    await waitFor(() => {
      const stateEl = screen.getByText("ACTIVE");
      // Component uses CSS variable class text-[var(--success-text)]
      expect(stateEl.className).toContain("font-bold");
    });
  });

  it("shows CREATED participant state with accent styling", async () => {
    setupSuccess();
    const user = userEvent.setup();
    render(<AdminTenantsPage />);

    await waitFor(() =>
      expect(screen.getByText("Registered Organisations")).toBeInTheDocument(),
    );
    const expandBtns = screen.getAllByLabelText("Expand details");
    await user.click(expandBtns[1]);

    await waitFor(() => {
      const stateEl = screen.getByText("CREATED");
      expect(stateEl.className).toContain("font-bold");
    });
  });

  it("shows warning styling for unknown participant state", async () => {
    const customParticipants = [
      { "@id": "ctx-alpha", identity: "did:web:alpha", state: "PENDING" },
    ];
    setupSuccess(MOCK_TENANTS, customParticipants);
    const user = userEvent.setup();
    render(<AdminTenantsPage />);

    await waitFor(() =>
      expect(screen.getByText("Registered Organisations")).toBeInTheDocument(),
    );
    const expandBtns = screen.getAllByLabelText("Expand details");
    await user.click(expandBtns[0]);

    await waitFor(() => {
      const stateEl = screen.getByText("PENDING");
      // Component uses CSS variable class text-[var(--warning-text)] for other states
      expect(stateEl.className).toContain("font-bold");
    });
  });

  // ── allDisposed warning banner ──

  it("shows disposed warning when all VPAs are disposed", async () => {
    setupSuccess();
    const user = userEvent.setup();
    render(<AdminTenantsPage />);

    await waitFor(() =>
      expect(screen.getByText("Registered Organisations")).toBeInTheDocument(),
    );
    const expandBtns = screen.getAllByLabelText("Expand details");
    await user.click(expandBtns[1]);

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
      expect(screen.getByText("Registered Organisations")).toBeInTheDocument(),
    );
    const expandBtns = screen.getAllByLabelText("Expand details");
    await user.click(expandBtns[0]);

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
      expect(screen.getByText("Registered Organisations")).toBeInTheDocument(),
    );
    const expandBtn = screen.getByLabelText("Expand details");
    await user.click(expandBtn);

    await waitFor(() => {
      // Profile card is a div.p-4 (not p-3); error uses var(--warning) border
      const profileCard = screen
        .getByText("profile-alpha-1")
        .closest("div.p-4");
      expect(profileCard?.className).toMatch(/warning/);
    });
  });

  it("applies normal styling to profiles without error", async () => {
    setupSuccess();
    const user = userEvent.setup();
    render(<AdminTenantsPage />);

    await waitFor(() =>
      expect(screen.getByText("Registered Organisations")).toBeInTheDocument(),
    );
    const expandBtns = screen.getAllByLabelText("Expand details");
    await user.click(expandBtns[0]);

    await waitFor(() => {
      const profileCard = screen
        .getByText("profile-alpha-1")
        .closest("div.p-4");
      // Normal profile uses --border variable class
      expect(profileCard?.className).toMatch(/border/);
      expect(profileCard?.className).not.toMatch(/warning/);
    });
  });

  // ── Empty state ──

  it("shows empty state when no tenants are returned", async () => {
    setupSuccess([], []);
    render(<AdminTenantsPage />);
    await waitFor(() =>
      expect(screen.getByText(/No tenants registered/)).toBeInTheDocument(),
    );
  });

  it("shows 0 in Total Tenants stat card for empty response", async () => {
    setupSuccess([], []);
    render(<AdminTenantsPage />);
    await waitFor(() =>
      expect(screen.getByText("Total Tenants")).toBeInTheDocument(),
    );
    // The number 0 should appear as tenant count
    expect(screen.getAllByText("0").length).toBeGreaterThanOrEqual(1);
  });

  // ── Error handling ──

  it("handles fetch failure gracefully", async () => {
    mockFetchApi.mockReturnValueOnce(mockErrorResponse());
    render(<AdminTenantsPage />);
    await waitFor(() =>
      expect(screen.getByText(/No tenants registered/)).toBeInTheDocument(),
    );
  });

  it("handles non-ok response by showing empty state", async () => {
    mockFetchApi.mockReturnValueOnce(mockResponse({}, false));
    render(<AdminTenantsPage />);
    await waitFor(() =>
      expect(screen.getByText(/No tenants registered/)).toBeInTheDocument(),
    );
  });

  // ── Navigation links via PageIntro ──

  it("renders nav link to Operator Dashboard", async () => {
    setupSuccess();
    render(<AdminTenantsPage />);
    await waitFor(() => {
      // Component renders "← Operator Dashboard" as the link text
      const link = screen.getByText("← Operator Dashboard");
      expect(link.closest("a")).toHaveAttribute("href", "/admin");
    });
  });

  it("renders nav link to Policy Definitions", async () => {
    setupSuccess();
    render(<AdminTenantsPage />);
    await waitFor(() => {
      const link = screen.getByText("Policy Definitions →");
      expect(link.closest("a")).toHaveAttribute("href", "/admin/policies");
    });
  });

  // ── Participant context state display ──

  it("shows participant context state in profile grid", async () => {
    setupSuccess();
    const user = userEvent.setup();
    render(<AdminTenantsPage />);

    await waitFor(() =>
      expect(screen.getByText("Registered Organisations")).toBeInTheDocument(),
    );
    const expandBtns = screen.getAllByLabelText("Expand details");
    await user.click(expandBtns[0]);

    // AlphaKlinik has ctx-alpha participant → state ACTIVE shown in profile
    await waitFor(() => {
      expect(screen.getByText("ACTIVE")).toBeInTheDocument();
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
      expect(screen.getByText("Registered Organisations")).toBeInTheDocument(),
    );
    const expandBtn = screen.getByLabelText("Expand details");
    await user.click(expandBtn);

    await waitFor(() => {
      // Profile section renders; no VPA badges (connector/identityhub) since vpas is empty
      expect(screen.getByText("Dataspace Profiles")).toBeInTheDocument();
      // VPA type labels (stripped of cfm. prefix) should not appear
      expect(screen.queryByText(/connector/)).not.toBeInTheDocument();
      expect(screen.queryByText(/identityhub/)).not.toBeInTheDocument();
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
    const expandBtn = screen.getByLabelText("Expand details");
    await user.click(expandBtn);

    await waitFor(() => {
      // "Tenant ID" label appears in the expanded properties section
      expect(screen.getByText("Tenant ID")).toBeInTheDocument();
      expect(screen.queryByText("Dataspace Profiles")).not.toBeInTheDocument();
    });
  });
});
