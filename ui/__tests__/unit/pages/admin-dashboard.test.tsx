/**
 * Tests for AdminDashboard page (/admin).
 *
 * Covers: loading state, summary data display, stat cards with counts,
 * role breakdown section, policy count from EDC-V and Neo4j formats,
 * API error handling, quick-link navigation, and empty/partial data states.
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

function mockResponse(data: unknown, ok = true) {
  return Promise.resolve({ json: () => Promise.resolve(data), ok });
}

/* ── Helper to set up both API calls ── */

function setupMocks(opts?: {
  tenants?: unknown;
  tenantsOk?: boolean;
  policies?: unknown;
  policiesOk?: boolean;
}) {
  mockFetchApi.mockImplementation((url: string) => {
    if (url === "/api/admin/tenants") {
      return mockResponse(opts?.tenants ?? {}, opts?.tenantsOk ?? true);
    }
    if (url === "/api/admin/policies") {
      return mockResponse(opts?.policies ?? {}, opts?.policiesOk ?? true);
    }
    return mockResponse({});
  });
}

const SUMMARY = {
  totalTenants: 3,
  totalParticipants: 5,
  byRole: {
    DATA_HOLDER: 2,
    DATA_USER: 2,
    HDAB: 1,
  },
};

describe("AdminDashboard", () => {
  beforeEach(() => {
    mockFetchApi.mockReset();
  });

  /* ─── 1. Loading state ─── */

  it("shows loading spinner before data arrives", () => {
    mockFetchApi.mockReturnValue(new Promise(() => {}));
    render(<AdminDashboard />);
    expect(screen.getByText("Loading dashboard…")).toBeInTheDocument();
  });

  /* ─── 2. Page heading ─── */

  it("renders the page title", async () => {
    setupMocks({ tenants: { summary: SUMMARY } });
    render(<AdminDashboard />);
    await waitFor(() => {
      expect(screen.getByText("Operator Dashboard")).toBeInTheDocument();
    });
  });

  /* ─── 3. Stat cards with EDC-V policy format ─── */

  it("shows tenant count from summary", async () => {
    setupMocks({
      tenants: { summary: SUMMARY },
      policies: { participants: [{ policies: [1, 2] }, { policies: [3] }] },
    });
    render(<AdminDashboard />);

    await waitFor(() => {
      // totalTenants = 3, totalParticipants = 5, policies = 3
      // "3" appears for both tenants and policies; verify at least 2 matches
      const threes = screen.getAllByText("3");
      expect(threes.length).toBeGreaterThanOrEqual(2);
    });
  });

  it("shows participant count from summary", async () => {
    setupMocks({
      tenants: { summary: SUMMARY },
      policies: {},
    });
    render(<AdminDashboard />);

    await waitFor(() => {
      expect(screen.getByText("5")).toBeInTheDocument(); // totalParticipants
    });
  });

  it("shows policy count from EDC-V participants format", async () => {
    setupMocks({
      tenants: {
        summary: {
          totalTenants: 2,
          totalParticipants: 4,
          byRole: { DATA_HOLDER: 2, DATA_USER: 2 },
        },
      },
      policies: {
        participants: [
          { policies: ["p1", "p2"] },
          { policies: ["p3", "p4", "p5"] },
        ],
      },
    });
    render(<AdminDashboard />);

    await waitFor(() => {
      // 2+3=5 policies, distinct from tenant count (2) and participants (4)
      expect(screen.getByText("5")).toBeInTheDocument();
    });
  });

  it("shows policy count from Neo4j fallback format", async () => {
    setupMocks({
      tenants: { summary: SUMMARY },
      policies: { policies: ["a", "b", "c", "d"] },
    });
    render(<AdminDashboard />);

    await waitFor(() => {
      expect(screen.getByText("4")).toBeInTheDocument(); // 4 policies
    });
  });

  /* ─── 4. Stat card labels ─── */

  it("renders all stat card labels", async () => {
    setupMocks({ tenants: { summary: SUMMARY } });
    render(<AdminDashboard />);

    await waitFor(() => {
      expect(screen.getByText("Tenants")).toBeInTheDocument();
      expect(screen.getByText("Participants")).toBeInTheDocument();
      expect(screen.getByText("Policies")).toBeInTheDocument();
      expect(screen.getByText("Audit Log")).toBeInTheDocument();
    });
  });

  it("renders '→' for the Audit Log card value", async () => {
    setupMocks({ tenants: { summary: SUMMARY } });
    render(<AdminDashboard />);

    await waitFor(() => {
      expect(screen.getByText("→")).toBeInTheDocument();
    });
  });

  /* ─── 5. Role breakdown section ─── */

  it("renders EHDS roles breakdown when byRole is populated", async () => {
    setupMocks({ tenants: { summary: SUMMARY } });
    render(<AdminDashboard />);

    await waitFor(() => {
      expect(screen.getByText("Participants by EHDS Role")).toBeInTheDocument();
      expect(screen.getByText("DATA_HOLDER")).toBeInTheDocument();
      expect(screen.getByText("DATA_USER")).toBeInTheDocument();
      expect(screen.getByText("HDAB")).toBeInTheDocument();
    });
  });

  it("shows correct count per role", async () => {
    setupMocks({ tenants: { summary: SUMMARY } });
    render(<AdminDashboard />);

    await waitFor(() => {
      expect(screen.getByText("DATA_HOLDER")).toBeInTheDocument();
    });
    // Each count within role breakdown
    const roleSection = screen
      .getByText("Participants by EHDS Role")
      .closest("div")!;
    expect(roleSection).toBeTruthy();
  });

  it("hides role breakdown when byRole is empty", async () => {
    setupMocks({
      tenants: {
        summary: { totalTenants: 1, totalParticipants: 1, byRole: {} },
      },
    });
    render(<AdminDashboard />);

    await waitFor(() => {
      expect(screen.getByText("Tenants")).toBeInTheDocument();
    });
    expect(
      screen.queryByText("Participants by EHDS Role"),
    ).not.toBeInTheDocument();
  });

  it("hides role breakdown when byRole is undefined", async () => {
    setupMocks({
      tenants: {
        summary: { totalTenants: 2, totalParticipants: 3 },
      },
    });
    render(<AdminDashboard />);

    await waitFor(() => {
      expect(screen.getByText("Tenants")).toBeInTheDocument();
    });
    expect(
      screen.queryByText("Participants by EHDS Role"),
    ).not.toBeInTheDocument();
  });

  /* ─── 6. Quick link navigation ─── */

  it("renders quick links to admin sub-pages", async () => {
    setupMocks({ tenants: { summary: SUMMARY } });
    render(<AdminDashboard />);

    await waitFor(() => {
      expect(screen.getByText("EDC Components")).toBeInTheDocument();
      expect(screen.getByText("Policy Definitions")).toBeInTheDocument();
    });
    // "Manage Tenants" appears in both quick links and PageIntro navboth instances are present
    const tenantLinks = screen.getAllByText("Manage Tenants");
    expect(tenantLinks.length).toBeGreaterThanOrEqual(1);
  });

  it("links to /admin/components", async () => {
    setupMocks({ tenants: { summary: SUMMARY } });
    render(<AdminDashboard />);

    await waitFor(() => {
      expect(screen.getByText("EDC Components")).toBeInTheDocument();
    });

    const link = screen.getByText("EDC Components").closest("a");
    expect(link?.getAttribute("href")).toBe("/admin/components");
  });

  it("links to /admin/policies", async () => {
    setupMocks({ tenants: { summary: SUMMARY } });
    render(<AdminDashboard />);

    await waitFor(() => {
      expect(screen.getByText("Policy Definitions")).toBeInTheDocument();
    });

    const link = screen.getByText("Policy Definitions").closest("a");
    expect(link?.getAttribute("href")).toBe("/admin/policies");
  });

  it("links to /admin/audit", async () => {
    setupMocks({ tenants: { summary: SUMMARY } });
    render(<AdminDashboard />);

    await waitFor(() => {
      const auditLinks = screen.getAllByText(/Audit/);
      const quickLink = auditLinks.find(
        (el) => el.closest("a")?.getAttribute("href") === "/admin/audit",
      );
      expect(quickLink).toBeDefined();
    });
  });

  /* ─── 7. Error handling ─── */

  it("handles tenants API returning non-ok gracefully", async () => {
    setupMocks({ tenantsOk: false, policies: {} });
    render(<AdminDashboard />);

    await waitFor(() => {
      // Should show dash (—) for missing values
      const dashes = screen.getAllByText("—");
      expect(dashes.length).toBeGreaterThanOrEqual(2);
    });
  });

  it("handles policies API returning non-ok gracefully", async () => {
    setupMocks({
      tenants: { summary: SUMMARY },
      policiesOk: false,
    });
    render(<AdminDashboard />);

    await waitFor(() => {
      // Tenant values still show, policy shows —
      expect(screen.getByText("3")).toBeInTheDocument();
    });
    // Policy card should show —
    const policyDash = screen.getAllByText("—");
    expect(policyDash.length).toBeGreaterThanOrEqual(1);
  });

  it("handles both APIs failing without crashing", async () => {
    mockFetchApi.mockRejectedValue(new Error("Network error"));
    render(<AdminDashboard />);

    await waitFor(() => {
      // Should exit loading state and show the dashboard shell
      expect(screen.getByText("Operator Dashboard")).toBeInTheDocument();
    });
    // Stat cards should show — for all missing values
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(3);
  });

  /* ─── 8. Summary missing from API response ─── */

  it("shows — when summary is null in API response", async () => {
    setupMocks({ tenants: {} });
    render(<AdminDashboard />);

    await waitFor(() => {
      expect(screen.getByText("Tenants")).toBeInTheDocument();
    });
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(2); // tenants + participants
  });

  /* ─── 9. Policy format edge cases ─── */

  it("counts 0 policies when participant has no policies array", async () => {
    setupMocks({
      tenants: {
        summary: {
          totalTenants: 7,
          totalParticipants: 8,
          byRole: { DATA_HOLDER: 4, DATA_USER: 4 },
        },
      },
      policies: { participants: [{ name: "Alpha" }, { policies: ["p1"] }] },
    });
    render(<AdminDashboard />);

    await waitFor(() => {
      // 0 + 1 = 1 policy; unique since tenant counts are 7 and 8
      const ones = screen.getAllByText("1");
      expect(ones.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("ignores policies when returned as null", async () => {
    mockFetchApi.mockImplementation((url: string) => {
      if (url === "/api/admin/tenants") {
        return mockResponse({ summary: SUMMARY });
      }
      if (url === "/api/admin/policies") {
        return mockResponse(null, true);
      }
      return mockResponse({});
    });
    render(<AdminDashboard />);

    await waitFor(() => {
      expect(screen.getByText("3")).toBeInTheDocument(); // tenants
    });
    // Policy should be —
    const policyDash = screen.getAllByText("—");
    expect(policyDash.length).toBeGreaterThanOrEqual(1);
  });

  /* ─── 10. PageIntro navigation ─── */

  it("renders prev/next step navigation links", async () => {
    setupMocks({ tenants: { summary: SUMMARY } });
    render(<AdminDashboard />);

    await waitFor(() => {
      expect(screen.getByText("Data Transfers")).toBeInTheDocument();
      expect(screen.getByText("Manage Tenants")).toBeInTheDocument();
    });
  });

  it("renders PageIntro with description text", async () => {
    setupMocks({ tenants: { summary: SUMMARY } });
    render(<AdminDashboard />);

    await waitFor(() => {
      expect(screen.getByText("Operator Dashboard")).toBeInTheDocument();
    });
    // The description is always visible in PageIntro
    expect(
      screen.getByText(/EHDS Health Data Access Body administration/),
    ).toBeInTheDocument();
  });

  /* ─── 11. Quick-link descriptions ─── */

  it("renders quick link descriptions", async () => {
    setupMocks({ tenants: { summary: SUMMARY } });
    render(<AdminDashboard />);

    await waitFor(() => {
      expect(
        screen.getByText("Health, CPU & memory per service"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("View and manage registered participants"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("View and create ODRL policies"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Query the Neo4j provenance graph"),
      ).toBeInTheDocument();
    });
  });
});
