/**
 * Component tests for Navigation (ui/src/components/Navigation.tsx)
 *
 * Covers:
 *   - Basic rendering (brand, groups, UserMenu)
 *   - Active-link highlighting
 *   - Role-based filtering for each persona
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Navigation from "@/components/Navigation";

// Mock UserMenu since it has its own session dependencies
vi.mock("@/components/UserMenu", () => ({
  default: () => <div data-testid="user-menu">UserMenu</div>,
}));

// Mock next/link to render a plain anchor (avoids router context issues)
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

// Mock next/navigation — pathname drives active-link highlighting
const mockPathname = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname(),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

// ── Session mock — override per-test ──────────────────────────────────────────

const mockUseSession = vi.fn();
vi.mock("next-auth/react", () => ({
  useSession: () => mockUseSession(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}));

/** Helper: configure the session mock for a given role set. */
function setSession(
  roles: string[],
  username = "testuser",
  status: "authenticated" | "unauthenticated" | "loading" = "authenticated",
) {
  mockUseSession.mockReturnValue({
    data:
      status === "authenticated"
        ? { user: { name: username, email: `${username}@test.eu` }, roles }
        : null,
    status,
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Click a dropdown button to reveal its links. */
async function openDropdown(label: string) {
  const btn = screen.getByRole("button", { name: new RegExp(label, "i") });
  await userEvent.click(btn);
}

/** All visible nav-group button labels (the desktop dropdown triggers). */
function visibleGroupLabels(): string[] {
  // Desktop group buttons are inside the hidden md:flex container
  const nav = screen.getByRole("navigation");
  // Get all buttons, excluding hamburger and UserMenu
  const buttons = nav.querySelectorAll("button");
  return Array.from(buttons)
    .map((b) => b.textContent?.trim() ?? "")
    .filter(
      (t) =>
        t &&
        t !== "UserMenu" &&
        !/open menu/i.test(t) &&
        !/close menu/i.test(t),
    );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Navigation Component", () => {
  beforeEach(() => {
    mockPathname.mockReturnValue("/");
    // Default: EDC_ADMIN sees everything
    setSession(["EDC_ADMIN"], "edcadmin");
  });

  // ── Basic rendering ─────────────────────────────────────────────────────

  it("should render the brand name", () => {
    render(<Navigation />);
    expect(screen.getByText("Health Dataspace")).toBeInTheDocument();
  });

  it("should render participant nav groups for EDC_ADMIN", () => {
    render(<Navigation />);
    const labels = visibleGroupLabels();
    expect(labels).toContain("Explore");
    expect(labels).toContain("Governance");
    expect(labels).toContain("Exchange");
    expect(labels).toContain("Manage");
    expect(labels).toContain("Docs");
    // My Health is PATIENT-only — admin does NOT see it
    expect(labels).not.toContain("My Health");
    // Get Started was removed — Onboarding moved to Manage
    expect(labels).not.toContain("Get Started");
  });

  it("should render the UserMenu", () => {
    render(<Navigation />);
    expect(screen.getByTestId("user-menu")).toBeInTheDocument();
  });

  it("should highlight the active group based on current pathname", () => {
    mockPathname.mockReturnValue("/graph");
    render(<Navigation />);

    const exploreButton = screen.getByText("Explore").closest("button");
    expect(exploreButton?.className).toContain("bg-layer1");

    const docsButton = screen.getByText("Docs").closest("button");
    expect(docsButton?.className).not.toContain("bg-layer1");
  });

  it("should highlight governance group when on /compliance path", () => {
    mockPathname.mockReturnValue("/compliance");
    render(<Navigation />);

    const governanceButton = screen.getByText("Governance").closest("button");
    expect(governanceButton?.className).toContain("bg-layer1");
  });

  it("should have correct href on brand link", () => {
    render(<Navigation />);

    const brandLink = screen.getByText("Health Dataspace").closest("a");
    expect(brandLink).toHaveAttribute("href", "/");
  });

  // ── Dropdown links ──────────────────────────────────────────────────────

  it("should show Onboarding inside Manage dropdown for EDC_ADMIN", async () => {
    render(<Navigation />);
    await openDropdown("Manage");
    expect(screen.getByText("Onboarding")).toBeInTheDocument();
  });

  it("should show Graph Explorer and Catalog inside Explore dropdown", async () => {
    render(<Navigation />);
    await openDropdown("Explore");
    expect(screen.getByText("Graph Explorer")).toBeInTheDocument();
    expect(screen.getByText("Dataset Catalog")).toBeInTheDocument();
  });

  // ── Role-based filtering: PATIENT ───────────────────────────────────────

  describe("PATIENT role filtering", () => {
    beforeEach(() => {
      setSession(["PATIENT"], "patient1");
    });

    it("should show My Health and Docs groups (not Explore)", () => {
      render(<Navigation />);
      const labels = visibleGroupLabels();
      // Patients see My Health instead of Explore (hideForRoles)
      expect(labels).not.toContain("Explore");
      expect(labels).toContain("My Health");
      expect(labels).toContain("Docs");
    });

    it("should NOT show Exchange group", () => {
      render(<Navigation />);
      const labels = visibleGroupLabels();
      expect(labels).not.toContain("Exchange");
    });

    it("should NOT show Governance group", () => {
      render(<Navigation />);
      const labels = visibleGroupLabels();
      expect(labels).not.toContain("Governance");
    });

    it("should NOT show Manage group", () => {
      render(<Navigation />);
      const labels = visibleGroupLabels();
      expect(labels).not.toContain("Manage");
    });

    it("should show My Health links in dropdown", async () => {
      render(<Navigation />);
      await openDropdown("My Health");
      expect(screen.getByText("My Health Records")).toBeInTheDocument();
      expect(screen.getByText("Health Profile & Risks")).toBeInTheDocument();
      expect(screen.getByText("Research Programs")).toBeInTheDocument();
      expect(screen.getByText("Research Insights")).toBeInTheDocument();
    });

    it("should NOT show Explore for PATIENT (My Health replaces it)", () => {
      render(<Navigation />);
      const labels = visibleGroupLabels();
      expect(labels).not.toContain("Explore");
    });
  });

  // ── Role-based filtering: DATA_HOLDER ───────────────────────────────────

  describe("DATA_HOLDER role filtering", () => {
    beforeEach(() => {
      setSession(["EDC_USER_PARTICIPANT", "DATA_HOLDER"], "clinicuser");
    });

    it("should show Explore, Exchange, and Docs", () => {
      render(<Navigation />);
      const labels = visibleGroupLabels();
      expect(labels).toContain("Explore");
      expect(labels).toContain("Exchange");
      expect(labels).toContain("Docs");
      expect(labels).not.toContain("Get Started");
    });

    it("should NOT show Manage group", () => {
      render(<Navigation />);
      const labels = visibleGroupLabels();
      expect(labels).not.toContain("Manage");
    });

    it("should NOT show My Health group", () => {
      render(<Navigation />);
      const labels = visibleGroupLabels();
      expect(labels).not.toContain("My Health");
    });

    it("should show DCAT-AP Editor in Explore", async () => {
      render(<Navigation />);
      await openDropdown("Explore");
      expect(screen.getByText("DCAT-AP Editor")).toBeInTheDocument();
    });
  });

  // ── Role-based filtering: DATA_USER (Researcher) ───────────────────────

  describe("DATA_USER role filtering", () => {
    beforeEach(() => {
      setSession(["EDC_USER_PARTICIPANT", "DATA_USER"], "researcher");
    });

    it("should show My Researches with analytics and query workflow", async () => {
      render(<Navigation />);
      await openDropdown("My Researches");
      expect(screen.getByText("Run Analytics")).toBeInTheDocument();
      expect(screen.getByText("Query & Export")).toBeInTheDocument();
      expect(screen.getByText("Discover Datasets")).toBeInTheDocument();
      expect(screen.getByText("Request Access")).toBeInTheDocument();
    });

    it("should NOT show Manage group", () => {
      render(<Navigation />);
      const labels = visibleGroupLabels();
      expect(labels).not.toContain("Manage");
    });

    it("should show My Researches group", () => {
      render(<Navigation />);
      const labels = visibleGroupLabels();
      expect(labels).toContain("My Researches");
    });
  });

  // ── Role-based filtering: HDAB_AUTHORITY ────────────────────────────────

  describe("HDAB_AUTHORITY role filtering", () => {
    beforeEach(() => {
      setSession(["HDAB_AUTHORITY"], "regulator");
    });

    it("should show Governance group", () => {
      render(<Navigation />);
      const labels = visibleGroupLabels();
      expect(labels).toContain("Governance");
    });

    it("should show Manage group (policies + audit) but NOT Onboarding", async () => {
      render(<Navigation />);
      const labels = visibleGroupLabels();
      expect(labels).toContain("Manage");
      // Onboarding is admin-only within Manage
      await openDropdown("Manage");
      expect(screen.queryByText("Onboarding")).not.toBeInTheDocument();
    });

    it("should NOT show My Health group", () => {
      render(<Navigation />);
      const labels = visibleGroupLabels();
      expect(labels).not.toContain("My Health");
    });
  });

  // ── Unauthenticated user ───────────────────────────────────────────────

  describe("unauthenticated user", () => {
    beforeEach(() => {
      setSession([], "", "unauthenticated");
    });

    it("should only show Explore and Docs groups", () => {
      render(<Navigation />);
      const labels = visibleGroupLabels();
      expect(labels).toContain("Explore");
      expect(labels).toContain("Docs");
      expect(labels).toHaveLength(2);
    });

    it("should NOT show Get Started, Exchange, Governance, Manage, or My Health", () => {
      render(<Navigation />);
      const labels = visibleGroupLabels();
      expect(labels).not.toContain("Get Started");
      expect(labels).not.toContain("Exchange");
      expect(labels).not.toContain("Governance");
      expect(labels).not.toContain("Manage");
      expect(labels).not.toContain("My Health");
    });
  });
});
