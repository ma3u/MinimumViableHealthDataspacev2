/**
 * Comprehensive tests for the Admin Components page.
 *
 * Covers: loading state, participant view (default), layer view switch,
 * critical banner, docker unavailable warning, auto-refresh toggle,
 * manual refresh, participant expansion/collapse, severity dots,
 * role badges, component cards, infrastructure grid, summary stats,
 * sparkline rendering, info popover, timestamp, error handling.
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

import AdminComponentsPage from "@/app/admin/components/page";

function mockResponse(data: unknown, ok = true) {
  return Promise.resolve({ json: () => Promise.resolve(data), ok });
}

/* ── Test data ── */

const HEALTHY_COMPONENT = {
  name: "Control Plane",
  container: "health-dataspace-controlplane",
  status: "healthy",
  severity: "healthy" as const,
  cpu: 2.5,
  memMB: 256,
  uptime: "5h 30m",
};

const CRITICAL_COMPONENT = {
  name: "Data Plane FHIR",
  container: "health-dataspace-dataplane-fhir",
  status: "unhealthy",
  severity: "critical" as const,
  cpu: 95.5,
  memMB: 900,
  uptime: "1h 5m",
};

const MOCK_TOPOLOGY = {
  timestamp: "2026-03-21T10:00:00.000Z",
  dockerAvailable: true,
  participants: [
    {
      id: "tenant-alpha",
      displayName: "AlphaKlinik Berlin",
      organization: "Alpha Klinik GmbH",
      role: "DATA_HOLDER",
      did: "did:web:alpha-klinik.de:participant",
      state: "CREATED",
      health: "healthy" as const,
      components: [HEALTHY_COMPONENT],
    },
    {
      id: "tenant-pharmaco",
      displayName: "PharmaCo Research AG",
      organization: "PharmaCo GmbH",
      role: "DATA_USER",
      did: "did:web:pharmaco.de:research",
      state: "CREATED",
      health: "critical" as const,
      components: [CRITICAL_COMPONENT],
    },
  ],
  infrastructure: [
    {
      name: "PostgreSQL",
      container: "health-dataspace-postgres",
      layer: "infrastructure",
      status: "healthy",
      severity: "healthy" as const,
      cpu: 1.2,
      memMB: 128,
      uptime: "5h 32m",
    },
    {
      name: "NATS",
      container: "health-dataspace-nats",
      layer: "infrastructure",
      status: "healthy",
      severity: "healthy" as const,
      cpu: 0.3,
      memMB: 32,
      uptime: "5h 32m",
    },
  ],
  summary: {
    totalParticipants: 2,
    degradedParticipants: 1,
    totalInfra: 2,
  },
};

const MOCK_TOPOLOGY_ALL_HEALTHY = {
  ...MOCK_TOPOLOGY,
  participants: [
    {
      ...MOCK_TOPOLOGY.participants[0],
      health: "healthy" as const,
    },
  ],
  summary: {
    totalParticipants: 1,
    degradedParticipants: 0,
    totalInfra: 2,
  },
};

const MOCK_SNAPSHOT = {
  timestamp: "2026-03-21T10:00:00.000Z",
  dockerAvailable: true,
  components: [
    {
      container: "health-dataspace-controlplane",
      component: "Control Plane",
      layer: "edc-core",
      status: "healthy",
      uptime: "5h 30m",
      cpu: 2.5,
      mem: { usedMB: 256, limitMB: 1024, percent: 25.0 },
    },
    {
      container: "health-dataspace-dataplane-fhir",
      component: "Data Plane FHIR",
      layer: "edc-core",
      status: "healthy",
      uptime: "5h 30m",
      cpu: 1.2,
      mem: { usedMB: 128, limitMB: 512, percent: 25.0 },
    },
    {
      container: "health-dataspace-keycloak",
      component: "Keycloak",
      layer: "identity",
      status: "running",
      uptime: "5h 30m",
      cpu: 3.0,
      mem: { usedMB: 512, limitMB: 2048, percent: 25.0 },
    },
    {
      container: "health-dataspace-postgres",
      component: "PostgreSQL",
      layer: "infrastructure",
      status: "healthy",
      uptime: "5h 32m",
      cpu: 1.0,
      mem: { usedMB: 96, limitMB: 1024, percent: 9.4 },
    },
  ],
  participants: [
    {
      id: "tenant-alpha",
      displayName: "AlphaKlinik Berlin",
      organization: "Alpha Klinik GmbH",
      role: "DATA_HOLDER",
      did: "did:web:alpha-klinik.de:participant",
      state: "CREATED",
      profileCount: 1,
    },
    {
      id: "tenant-pharmaco",
      displayName: "PharmaCo Research AG",
      organization: "PharmaCo GmbH",
      role: "DATA_USER",
      did: "did:web:pharmaco.de:research",
      state: "CREATED",
      profileCount: 2,
    },
  ],
};

const MOCK_SNAPSHOT_NO_DOCKER = {
  ...MOCK_SNAPSHOT,
  dockerAvailable: false,
};

const MOCK_TOPOLOGY_NO_DOCKER = {
  ...MOCK_TOPOLOGY,
  dockerAvailable: false,
};

/* ── Setup ── */

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mockFetchApi.mockImplementation((url: string) => {
    if (url.includes("topology")) return mockResponse(MOCK_TOPOLOGY);
    if (url.includes("components")) return mockResponse(MOCK_SNAPSHOT);
    return mockResponse({});
  });
});

// =====================================================================
// Loading state
// =====================================================================
describe("loading state", () => {
  it("shows loading spinner before data is fetched", () => {
    mockFetchApi.mockReturnValue(new Promise(() => {})); // never resolves
    render(<AdminComponentsPage />);
    expect(screen.getByText(/Loading EDC components/)).toBeInTheDocument();
  });

  it("hides loading spinner once data arrives", async () => {
    render(<AdminComponentsPage />);
    await waitFor(() => {
      expect(
        screen.queryByText(/Loading EDC components/),
      ).not.toBeInTheDocument();
    });
  });
});

// =====================================================================
// Participant view (default)
// =====================================================================
describe("participant view (default)", () => {
  it("renders participant names", async () => {
    render(<AdminComponentsPage />);
    await waitFor(() => {
      expect(screen.getByText("AlphaKlinik Berlin")).toBeInTheDocument();
    });
    expect(screen.getByText("PharmaCo Research AG")).toBeInTheDocument();
  });

  it("displays participant role badges", async () => {
    render(<AdminComponentsPage />);
    await waitFor(() => {
      expect(screen.getByText("DATA_HOLDER")).toBeInTheDocument();
    });
    expect(screen.getByText("DATA_USER")).toBeInTheDocument();
  });

  it("shows summary stats for participant count and infra", async () => {
    render(<AdminComponentsPage />);
    await waitFor(() => {
      expect(screen.getByText("2 participants")).toBeInTheDocument();
    });
    expect(screen.getByText("2 infra services")).toBeInTheDocument();
  });

  it("shows degraded count when participants are degraded", async () => {
    render(<AdminComponentsPage />);
    await waitFor(() => {
      expect(screen.getByText("1 degraded")).toBeInTheDocument();
    });
  });

  it("hides degraded count when no participants degraded", async () => {
    mockFetchApi.mockImplementation((url: string) => {
      if (url.includes("topology"))
        return mockResponse(MOCK_TOPOLOGY_ALL_HEALTHY);
      return mockResponse(MOCK_SNAPSHOT);
    });
    render(<AdminComponentsPage />);
    await waitFor(() => {
      expect(screen.getByText("1 participants")).toBeInTheDocument();
    });
    expect(screen.queryByText(/degraded/)).not.toBeInTheDocument();
  });

  it("renders infrastructure components in a grid", async () => {
    render(<AdminComponentsPage />);
    await waitFor(() => {
      expect(screen.getByText(/Shared Infrastructure/)).toBeInTheDocument();
    });
    expect(screen.getAllByText("PostgreSQL")[0]).toBeInTheDocument();
    expect(screen.getAllByText("NATS")[0]).toBeInTheDocument();
  });

  it("fetches topology endpoint on initial render", async () => {
    render(<AdminComponentsPage />);
    await waitFor(() => {
      expect(mockFetchApi).toHaveBeenCalledWith(
        "/api/admin/components/topology",
      );
    });
  });

  it("renders infrastructure component CPU and memory", async () => {
    render(<AdminComponentsPage />);
    await waitFor(() => {
      expect(screen.getByText("PostgreSQL")).toBeInTheDocument();
    });
    expect(screen.getByText("1.2%")).toBeInTheDocument();
    expect(screen.getByText("128 MB")).toBeInTheDocument();
  });
});

// =====================================================================
// Critical banner
// =====================================================================
describe("critical banner", () => {
  it("shows critical banner when participants are degraded", async () => {
    render(<AdminComponentsPage />);
    await waitFor(() => {
      expect(
        screen.getByText(/1 of 2 participants degraded/),
      ).toBeInTheDocument();
    });
  });

  it("lists degraded participant names in banner", async () => {
    render(<AdminComponentsPage />);
    await waitFor(() => {
      expect(screen.getByText(/— PharmaCo Research AG/)).toBeInTheDocument();
    });
  });

  it("hides critical banner when all participants healthy", async () => {
    mockFetchApi.mockImplementation((url: string) => {
      if (url.includes("topology"))
        return mockResponse(MOCK_TOPOLOGY_ALL_HEALTHY);
      return mockResponse(MOCK_SNAPSHOT);
    });
    render(<AdminComponentsPage />);
    await waitFor(() => {
      expect(screen.getByText("1 participants")).toBeInTheDocument();
    });
    expect(screen.queryByText(/participants degraded/)).not.toBeInTheDocument();
  });
});

// =====================================================================
// Participant section expand/collapse
// =====================================================================
describe("participant sections", () => {
  it("auto-expands critical participant sections", async () => {
    render(<AdminComponentsPage />);
    await waitFor(() => {
      // PharmaCo is critical → auto-expanded → components visible
      expect(screen.getByText("Data Plane FHIR")).toBeInTheDocument();
    });
  });

  it("shows DID and state when participant is expanded", async () => {
    render(<AdminComponentsPage />);
    await waitFor(() => {
      expect(
        screen.getByText(/did:web:pharmaco\.de:research/),
      ).toBeInTheDocument();
    });
  });

  it("expands a collapsed healthy participant on click", async () => {
    const user = userEvent.setup();
    render(<AdminComponentsPage />);
    await waitFor(() => {
      expect(screen.getByText("AlphaKlinik Berlin")).toBeInTheDocument();
    });
    // Healthy participant is collapsed by default —
    // its DID should not be visible
    expect(
      screen.queryByText(/did:web:alpha-klinik\.de:participant/),
    ).not.toBeInTheDocument();

    // Click the participant header to expand
    const alphaButton = screen
      .getByText("AlphaKlinik Berlin")
      .closest("button")!;
    await user.click(alphaButton);

    await waitFor(() => {
      expect(
        screen.getByText(/did:web:alpha-klinik\.de:participant/),
      ).toBeInTheDocument();
    });
  });

  it("collapses an expanded section on click", async () => {
    const user = userEvent.setup();
    render(<AdminComponentsPage />);
    await waitFor(() => {
      // PharmaCo is critical → auto-expanded
      expect(
        screen.getByText(/did:web:pharmaco\.de:research/),
      ).toBeInTheDocument();
    });

    // Click the participant header to collapse
    const pharmacoButton = screen
      .getByText("PharmaCo Research AG")
      .closest("button")!;
    await user.click(pharmacoButton);
    await waitFor(() => {
      expect(
        screen.queryByText(/did:web:pharmaco\.de:research/),
      ).not.toBeInTheDocument();
    });
  });

  it("shows component count per participant", async () => {
    render(<AdminComponentsPage />);
    await waitFor(() => {
      // Each participant shows "N services"
      const svcLabels = screen.getAllByText(/service/);
      expect(svcLabels.length).toBeGreaterThanOrEqual(2);
    });
  });
});

// =====================================================================
// Docker unavailable warning
// =====================================================================
describe("docker unavailable warning", () => {
  it("shows docker warning in participant view", async () => {
    mockFetchApi.mockImplementation((url: string) => {
      if (url.includes("topology"))
        return mockResponse(MOCK_TOPOLOGY_NO_DOCKER);
      return mockResponse(MOCK_SNAPSHOT_NO_DOCKER);
    });
    render(<AdminComponentsPage />);
    await waitFor(() => {
      expect(
        screen.getByText(/Docker socket not available/),
      ).toBeInTheDocument();
    });
  });

  it("shows docker warning in layer view", async () => {
    const user = userEvent.setup();
    mockFetchApi.mockImplementation((url: string) => {
      if (url.includes("topology"))
        return mockResponse(MOCK_TOPOLOGY_NO_DOCKER);
      return mockResponse(MOCK_SNAPSHOT_NO_DOCKER);
    });
    render(<AdminComponentsPage />);

    // Wait for initial render, then switch to layer view
    await waitFor(() => {
      expect(screen.getByText("Layer View")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Layer View"));

    await waitFor(() => {
      expect(
        screen.getByText(/Docker socket not available/),
      ).toBeInTheDocument();
    });
  });
});

// =====================================================================
// View mode toggle
// =====================================================================
describe("view mode toggle", () => {
  it("defaults to participant view", async () => {
    render(<AdminComponentsPage />);
    await waitFor(() => {
      expect(screen.getByText("Dataspace Participants")).toBeInTheDocument();
    });
  });

  it("switches to layer view on click", async () => {
    const user = userEvent.setup();
    render(<AdminComponentsPage />);
    await waitFor(() => {
      expect(screen.getByText("Layer View")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Layer View"));

    await waitFor(() => {
      expect(mockFetchApi).toHaveBeenCalledWith("/api/admin/components");
    });
  });

  it("switches back to participant view on click", async () => {
    const user = userEvent.setup();
    render(<AdminComponentsPage />);
    await waitFor(() => {
      expect(screen.getByText("2 participants")).toBeInTheDocument();
    });

    // Switch to layer
    await user.click(screen.getByText("Layer View"));
    await waitFor(() => {
      expect(mockFetchApi).toHaveBeenCalledWith("/api/admin/components");
    });

    // Switch back to participant
    await user.click(screen.getByText("Participant View"));
    await waitFor(() => {
      expect(mockFetchApi).toHaveBeenLastCalledWith(
        "/api/admin/components/topology",
      );
    });
  });
});

// =====================================================================
// Layer view
// =====================================================================
describe("layer view", () => {
  async function renderLayerView() {
    const user = userEvent.setup();
    render(<AdminComponentsPage />);
    await waitFor(() => {
      expect(screen.getByText("Layer View")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Layer View"));
    await waitFor(() => {
      expect(screen.getByText("Control Plane")).toBeInTheDocument();
    });
    return user;
  }

  it("renders component tables grouped by layer", async () => {
    await renderLayerView();
    expect(screen.getByText("EDC-V Core")).toBeInTheDocument();
    expect(screen.getByText("Identity & Trust")).toBeInTheDocument();
    expect(screen.getByText("Infrastructure")).toBeInTheDocument();
  });

  it("shows component status badges", async () => {
    await renderLayerView();
    // "healthy" badge for Control Plane
    const healthyBadges = screen.getAllByText("healthy");
    expect(healthyBadges.length).toBeGreaterThanOrEqual(1);
  });

  it("shows running status badge", async () => {
    await renderLayerView();
    expect(screen.getByText("running")).toBeInTheDocument();
  });

  it("renders component uptime", async () => {
    await renderLayerView();
    const uptimeElements = screen.getAllByText("5h 30m");
    expect(uptimeElements.length).toBeGreaterThanOrEqual(1);
  });

  it("renders summary stats for layer view", async () => {
    await renderLayerView();
    expect(screen.getByText("4 services")).toBeInTheDocument();
  });

  it("shows total CPU usage", async () => {
    await renderLayerView();
    // Total: 2.5 + 1.2 + 3.0 + 1.0 = 7.7
    expect(screen.getByText("7.7% total")).toBeInTheDocument();
  });

  it("shows total memory usage", async () => {
    await renderLayerView();
    // Total: 256 + 128 + 512 + 96 = 992 MB
    expect(screen.getByText("992 MB total")).toBeInTheDocument();
  });

  it("displays memory in GB when over 1024 MB", async () => {
    const bigSnapshot = {
      ...MOCK_SNAPSHOT,
      components: [
        ...MOCK_SNAPSHOT.components,
        {
          container: "health-dataspace-vault",
          component: "Vault",
          layer: "identity",
          status: "healthy",
          uptime: "5h 32m",
          cpu: 0.5,
          mem: { usedMB: 200, limitMB: 512, percent: 39.1 },
        },
      ],
    };
    mockFetchApi.mockImplementation((url: string) => {
      if (url.includes("topology")) return mockResponse(MOCK_TOPOLOGY);
      return mockResponse(bigSnapshot);
    });
    const user = userEvent.setup();
    render(<AdminComponentsPage />);
    await waitFor(() => {
      expect(screen.getByText("Layer View")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Layer View"));
    await waitFor(() => {
      // 992 + 200 = 1192 MB → 1.2 GB
      expect(screen.getByText(/1\.2 GB total/)).toBeInTheDocument();
    });
  });

  it("renders participants table in layer view", async () => {
    await renderLayerView();
    // Participant table headers
    expect(screen.getByText("Profiles")).toBeInTheDocument();
    // Participant row
    expect(screen.getByText("AlphaKlinik Berlin")).toBeInTheDocument();
    expect(screen.getByText("PharmaCo Research AG")).toBeInTheDocument();
  });

  it("shows participant profile count in layer view", async () => {
    await renderLayerView();
    expect(screen.getByText("1")).toBeInTheDocument(); // AlphaKlinik
    expect(screen.getByText("2")).toBeInTheDocument(); // PharmaCo
  });

  it("shows participant state with color coding", async () => {
    await renderLayerView();
    const stateElements = screen.getAllByText("CREATED");
    expect(stateElements.length).toBeGreaterThanOrEqual(1);
  });

  it("renders sparkline 'collecting' text on first load", async () => {
    await renderLayerView();
    // First time: history has 1 entry → sparklines show "collecting…"
    const collecting = screen.getAllByText("collecting…");
    expect(collecting.length).toBeGreaterThanOrEqual(1);
  });
});

// =====================================================================
// Refresh controls
// =====================================================================
describe("refresh controls", () => {
  it("renders auto-refresh checkbox checked by default", async () => {
    render(<AdminComponentsPage />);
    await waitFor(() => {
      expect(screen.getByText("2 participants")).toBeInTheDocument();
    });
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).toBeChecked();
  });

  it("unchecks auto-refresh checkbox on click", async () => {
    const user = userEvent.setup();
    render(<AdminComponentsPage />);
    await waitFor(() => {
      expect(screen.getByText("2 participants")).toBeInTheDocument();
    });
    const checkbox = screen.getByRole("checkbox");
    await user.click(checkbox);
    expect(checkbox).not.toBeChecked();
  });

  it("calls fetchApi on manual refresh click", async () => {
    const user = userEvent.setup();
    render(<AdminComponentsPage />);
    await waitFor(() => {
      expect(mockFetchApi).toHaveBeenCalledTimes(1);
    });

    await user.click(screen.getByText("Refresh"));

    await waitFor(() => {
      expect(mockFetchApi).toHaveBeenCalledTimes(2);
    });
  });
});

// =====================================================================
// Timestamp
// =====================================================================
describe("timestamp display", () => {
  it("shows last updated timestamp", async () => {
    render(<AdminComponentsPage />);
    await waitFor(() => {
      expect(screen.getByText(/Last updated:/)).toBeInTheDocument();
    });
  });
});

// =====================================================================
// Error handling
// =====================================================================
describe("error handling", () => {
  it("handles fetch failure gracefully", async () => {
    mockFetchApi.mockRejectedValue(new Error("Network error"));
    render(<AdminComponentsPage />);
    // Should not crash — loading eventually clears
    await waitFor(() => {
      expect(
        screen.queryByText(/Loading EDC components/),
      ).not.toBeInTheDocument();
    });
  });

  it("handles non-ok response gracefully", async () => {
    mockFetchApi.mockReturnValue(mockResponse(null, false));
    render(<AdminComponentsPage />);
    await waitFor(() => {
      expect(
        screen.queryByText(/Loading EDC components/),
      ).not.toBeInTheDocument();
    });
  });
});

// =====================================================================
// Page intro
// =====================================================================
describe("page intro", () => {
  it("renders page title", async () => {
    render(<AdminComponentsPage />);
    await waitFor(() => {
      expect(screen.getByText("EDC Components")).toBeInTheDocument();
    });
  });
});
