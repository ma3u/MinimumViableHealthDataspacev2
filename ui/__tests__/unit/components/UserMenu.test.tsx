/**
 * Comprehensive unit tests for UserMenu component.
 *
 * Overrides the global next-auth/react mock from setup.ts so we can
 * control session state per-test.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/* ── Mocks ────────────────────────────────────────────────────────── */

const mockSignIn = vi.fn();
const mockSignOut = vi.fn();
const mockUseSession = vi.fn();

vi.mock("next-auth/react", () => ({
  useSession: () => mockUseSession(),
  signIn: (...args: unknown[]) => mockSignIn(...args),
  signOut: (...args: unknown[]) => mockSignOut(...args),
}));

import UserMenu from "@/components/UserMenu";

/* ── Helpers ───────────────────────────────────────────────────────── */

function sessionWith(name: string | null, email: string, roles: string[]) {
  return {
    data: {
      user: { name, email },
      roles,
    },
    status: "authenticated" as const,
  };
}

const ENV_BACKUP = { ...process.env };

/* ── Tests ─────────────────────────────────────────────────────────── */

describe("UserMenu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_STATIC_EXPORT = "false";
    process.env.NEXT_PUBLIC_KEYCLOAK_PUBLIC_URL = "";
    process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID = "";
  });

  afterEach(() => {
    process.env = { ...ENV_BACKUP };
  });

  // ── Loading state ────────────────────────────────────────────────

  describe("loading state", () => {
    it("shows animated dots while session loads", () => {
      mockUseSession.mockReturnValue({ data: null, status: "loading" });
      render(<UserMenu />);
      const dots = screen.getByText("...");
      expect(dots).toBeInTheDocument();
      expect(dots.className).toContain("animate-pulse");
    });

    it("does not show sign-in button during loading", () => {
      mockUseSession.mockReturnValue({ data: null, status: "loading" });
      render(<UserMenu />);
      expect(screen.queryByText("Sign in")).not.toBeInTheDocument();
    });
  });

  // ── Unauthenticated state ────────────────────────────────────────

  describe("unauthenticated state", () => {
    beforeEach(() => {
      mockUseSession.mockReturnValue({
        data: null,
        status: "unauthenticated",
      });
    });

    it("shows Sign in button", () => {
      render(<UserMenu />);
      expect(screen.getByText("Sign in")).toBeInTheDocument();
    });

    it("calls signIn('keycloak') on click", async () => {
      const user = userEvent.setup();
      render(<UserMenu />);
      await user.click(screen.getByText("Sign in"));
      expect(mockSignIn).toHaveBeenCalledWith("keycloak");
    });

    it("does not show user name or dropdown", () => {
      render(<UserMenu />);
      expect(screen.queryByText("Roles")).not.toBeInTheDocument();
      expect(screen.queryByText("Sign out")).not.toBeInTheDocument();
    });
  });

  // ── Authenticated state ──────────────────────────────────────────

  describe("authenticated state", () => {
    beforeEach(() => {
      mockUseSession.mockReturnValue(
        sessionWith("Alice Smith", "alice@example.com", ["EDC_ADMIN"]),
      );
    });

    it("shows user name", () => {
      render(<UserMenu />);
      expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    });

    it("does not show dropdown initially", () => {
      render(<UserMenu />);
      expect(screen.queryByText("alice@example.com")).not.toBeInTheDocument();
    });

    it("opens dropdown on click and shows email", async () => {
      const user = userEvent.setup();
      render(<UserMenu />);
      await user.click(screen.getByText("Alice Smith"));
      expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    });

    it("shows role badges in dropdown", async () => {
      const user = userEvent.setup();
      render(<UserMenu />);
      await user.click(screen.getByText("Alice Smith"));
      expect(screen.getByText("EDC_ADMIN")).toBeInTheDocument();
    });

    it("shows sign-out button in dropdown", async () => {
      const user = userEvent.setup();
      render(<UserMenu />);
      await user.click(screen.getByText("Alice Smith"));
      expect(screen.getByText("Sign out")).toBeInTheDocument();
    });
  });

  // ── Dropdown toggle ──────────────────────────────────────────────

  describe("dropdown toggle", () => {
    beforeEach(() => {
      mockUseSession.mockReturnValue(
        sessionWith("Bob Jones", "bob@example.com", []),
      );
    });

    it("closes dropdown when clicking user name again", async () => {
      const user = userEvent.setup();
      render(<UserMenu />);

      // Open — only one "Bob Jones" before dropdown opens
      await user.click(screen.getByText("Bob Jones"));
      expect(screen.getByText("bob@example.com")).toBeInTheDocument();

      // Close — name appears in both trigger and dropdown header,
      // so click the first match (the trigger button)
      await user.click(screen.getAllByText("Bob Jones")[0]);
      expect(screen.queryByText("bob@example.com")).not.toBeInTheDocument();
    });

    it("closes dropdown on outside click", async () => {
      const user = userEvent.setup();
      const { container } = render(<UserMenu />);

      await user.click(screen.getByText("Bob Jones"));
      expect(screen.getByText("bob@example.com")).toBeInTheDocument();

      // Click outside (document body)
      await user.click(container.ownerDocument.body);

      await waitFor(() => {
        expect(screen.queryByText("bob@example.com")).not.toBeInTheDocument();
      });
    });
  });

  // ── Role badges ──────────────────────────────────────────────────

  describe("role badges", () => {
    it("shows multiple role badges", async () => {
      mockUseSession.mockReturnValue(
        sessionWith("Admin", "admin@example.com", [
          "EDC_ADMIN",
          "HDAB_AUTHORITY",
        ]),
      );
      const user = userEvent.setup();
      render(<UserMenu />);
      await user.click(screen.getByText("Admin"));

      expect(screen.getByText("EDC_ADMIN")).toBeInTheDocument();
      expect(screen.getByText("HDAB_AUTHORITY")).toBeInTheDocument();
    });

    it("shows EDC_USER_PARTICIPANT badge with correct styling", async () => {
      mockUseSession.mockReturnValue(
        sessionWith("Participant", "p@example.com", ["EDC_USER_PARTICIPANT"]),
      );
      const user = userEvent.setup();
      render(<UserMenu />);
      await user.click(screen.getByText("Participant"));

      const badge = screen.getByText("EDC_USER_PARTICIPANT");
      expect(badge).toBeInTheDocument();
      expect(badge.className).toContain("bg-blue-700");
    });

    it("hides roles section when no known roles", async () => {
      mockUseSession.mockReturnValue(
        sessionWith("User", "user@example.com", []),
      );
      const user = userEvent.setup();
      render(<UserMenu />);
      await user.click(screen.getByText("User"));

      expect(screen.queryByText("Roles")).not.toBeInTheDocument();
    });

    it("filters out unknown roles (not in roleBadge map)", async () => {
      mockUseSession.mockReturnValue(
        sessionWith("Tester", "t@example.com", ["EDC_ADMIN", "UNKNOWN_ROLE"]),
      );
      const user = userEvent.setup();
      render(<UserMenu />);
      await user.click(screen.getByText("Tester"));

      expect(screen.getByText("EDC_ADMIN")).toBeInTheDocument();
      expect(screen.queryByText("UNKNOWN_ROLE")).not.toBeInTheDocument();
    });

    it("shows all three known role types", async () => {
      mockUseSession.mockReturnValue(
        sessionWith("All Roles", "all@example.com", [
          "EDC_ADMIN",
          "EDC_USER_PARTICIPANT",
          "HDAB_AUTHORITY",
        ]),
      );
      const user = userEvent.setup();
      render(<UserMenu />);
      await user.click(screen.getByText("All Roles"));

      expect(screen.getByText("EDC_ADMIN")).toBeInTheDocument();
      expect(screen.getByText("EDC_USER_PARTICIPANT")).toBeInTheDocument();
      expect(screen.getByText("HDAB_AUTHORITY")).toBeInTheDocument();
    });
  });

  // ── Sign out ─────────────────────────────────────────────────────

  describe("sign out", () => {
    it("calls signOut with callbackUrl '/' when no Keycloak URL set", async () => {
      mockUseSession.mockReturnValue(sessionWith("User", "u@example.com", []));
      const user = userEvent.setup();
      render(<UserMenu />);
      await user.click(screen.getByText("User"));
      await user.click(screen.getByText("Sign out"));

      expect(mockSignOut).toHaveBeenCalledWith({ callbackUrl: "/" });
    });

    it("builds Keycloak logout URL when env vars are set", async () => {
      process.env.NEXT_PUBLIC_KEYCLOAK_PUBLIC_URL =
        "http://keycloak.localhost/realms/EDCV";
      process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID = "my-client";

      mockUseSession.mockReturnValue(
        sessionWith("Logout User", "logout@example.com", []),
      );
      const user = userEvent.setup();
      render(<UserMenu />);
      await user.click(screen.getByText("Logout User"));
      await user.click(screen.getByText("Sign out"));

      expect(mockSignOut).toHaveBeenCalledTimes(1);
      const { callbackUrl } = mockSignOut.mock.calls[0][0];
      expect(callbackUrl).toContain(
        "http://keycloak.localhost/realms/EDCV/protocol/openid-connect/logout",
      );
      expect(callbackUrl).toContain("post_logout_redirect_uri=");
      expect(callbackUrl).toContain("client_id=my-client");
    });

    it("uses default client_id when env var is not set", async () => {
      process.env.NEXT_PUBLIC_KEYCLOAK_PUBLIC_URL =
        "http://keycloak.localhost/realms/test";
      delete process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID;

      mockUseSession.mockReturnValue(sessionWith("U", "u@test.com", []));
      const user = userEvent.setup();
      render(<UserMenu />);
      await user.click(screen.getByText("U"));
      await user.click(screen.getByText("Sign out"));

      const { callbackUrl } = mockSignOut.mock.calls[0][0];
      expect(callbackUrl).toContain("client_id=health-dataspace-ui");
    });

    it("closes dropdown after sign-out click", async () => {
      mockUseSession.mockReturnValue(
        sessionWith("Closer", "c@example.com", []),
      );
      const user = userEvent.setup();
      render(<UserMenu />);
      await user.click(screen.getByText("Closer"));
      await user.click(screen.getByText("Sign out"));

      // Dropdown should be closed
      expect(screen.queryByText("c@example.com")).not.toBeInTheDocument();
    });
  });

  // ── Name fallback ────────────────────────────────────────────────

  describe("name fallback", () => {
    it("falls back to email when name is null", () => {
      mockUseSession.mockReturnValue(
        sessionWith(null, "fallback@example.com", []),
      );
      render(<UserMenu />);
      expect(screen.getByText("fallback@example.com")).toBeInTheDocument();
    });

    it("falls back to 'User' when both name and email are missing", () => {
      mockUseSession.mockReturnValue({
        data: { user: {}, roles: [] },
        status: "authenticated",
      });
      render(<UserMenu />);
      expect(screen.getByText("User")).toBeInTheDocument();
    });
  });

  // ── Static / Demo mode ──────────────────────────────────────────
  // Note: IS_STATIC is evaluated at module load time via
  // process.env.NEXT_PUBLIC_STATIC_EXPORT. Since the module is already
  // imported, we test the live-mode behavior here and verify the demo
  // branch by re-importing with the env var below.

  describe("demo mode (static export)", () => {
    // IS_STATIC is evaluated at module load time, so we must re-import
    // the component with the env var set. Use vi.resetModules() to
    // clear the cache, then dynamically import the fresh module.

    async function loadDemoUserMenu() {
      process.env.NEXT_PUBLIC_STATIC_EXPORT = "true";
      vi.resetModules();
      // Re-register the mock so the fresh import picks it up
      vi.doMock("next-auth/react", () => ({
        useSession: () => mockUseSession(),
        signIn: (...args: unknown[]) => mockSignIn(...args),
        signOut: (...args: unknown[]) => mockSignOut(...args),
      }));
      const mod = await import("@/components/UserMenu");
      return mod.default;
    }

    it("shows (Demo) suffix and demo session in static mode", async () => {
      const DemoUserMenu = await loadDemoUserMenu();
      const { container } = render(<DemoUserMenu />);

      // Demo session uses "edcadmin" as the user name
      expect(screen.getByText("edcadmin")).toBeInTheDocument();
      expect(screen.getByText("(Demo)")).toBeInTheDocument();

      // Shield icon should have amber color class
      const shield = container.querySelector(".text-amber-400");
      expect(shield).not.toBeNull();
    });

    it("shows 'Sign out (disabled in demo)' text in static mode", async () => {
      const DemoUserMenu = await loadDemoUserMenu();
      const user = userEvent.setup();
      render(<DemoUserMenu />);

      await user.click(screen.getByText("edcadmin"));
      expect(
        screen.getByText("Sign out (disabled in demo)"),
      ).toBeInTheDocument();
    });

    it("sign-in button is no-op in static mode", async () => {
      const DemoUserMenu = await loadDemoUserMenu();
      render(<DemoUserMenu />);
      // Static mode always shows the demo user, never Sign in
      expect(screen.queryByText("Sign in")).not.toBeInTheDocument();
      expect(screen.getByText("edcadmin")).toBeInTheDocument();
    });

    it("sign-out is a no-op in demo mode (signOut not called)", async () => {
      const DemoUserMenu = await loadDemoUserMenu();
      const user = userEvent.setup();
      render(<DemoUserMenu />);

      await user.click(screen.getByText("edcadmin"));
      await user.click(screen.getByText("Sign out (disabled in demo)"));

      // signOut should NOT be called in demo mode
      expect(mockSignOut).not.toHaveBeenCalled();
    });
  });

  // ── Dropdown content ─────────────────────────────────────────────

  describe("dropdown content details", () => {
    it("shows user name in the dropdown header", async () => {
      mockUseSession.mockReturnValue(
        sessionWith("Dropdown User", "du@example.com", ["EDC_ADMIN"]),
      );
      const user = userEvent.setup();
      render(<UserMenu />);
      await user.click(screen.getByText("Dropdown User"));

      // Name appears both in trigger and in dropdown header
      const names = screen.getAllByText("Dropdown User");
      expect(names.length).toBeGreaterThanOrEqual(2);
    });

    it("shows email in the dropdown", async () => {
      mockUseSession.mockReturnValue(
        sessionWith("Email Check", "email-check@example.com", []),
      );
      const user = userEvent.setup();
      render(<UserMenu />);
      await user.click(screen.getByText("Email Check"));
      expect(screen.getByText("email-check@example.com")).toBeInTheDocument();
    });
  });
});
