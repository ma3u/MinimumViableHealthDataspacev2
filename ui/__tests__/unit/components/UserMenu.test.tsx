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
    sessionStorage.clear();
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
      // Ellipsis character (…) used in updated component
      const dots = screen.getByText("…");
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

    it("opens persona picker dropdown on Sign in click", async () => {
      const user = userEvent.setup();
      render(<UserMenu />);
      await user.click(screen.getByText("Sign in"));
      // Dropdown shows "Returning users" header and persona list
      expect(screen.getByText("Returning users")).toBeInTheDocument();
      expect(screen.getByText("edcadmin")).toBeInTheDocument();
    });

    it("calls signIn('keycloak') with callbackUrl when persona clicked", async () => {
      const user = userEvent.setup();
      render(<UserMenu />);
      await user.click(screen.getByText("Sign in"));
      await user.click(screen.getByText("edcadmin"));
      expect(mockSignIn).toHaveBeenCalledWith(
        "keycloak",
        { callbackUrl: "/graph?persona=edc-admin" },
        { login_hint: "edcadmin" },
      );
    });

    it("does not show user name or dropdown initially", () => {
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
      // Role badge shows friendly label — may appear in nav chip + dropdown
      expect(screen.getAllByText("Dataspace Admin").length).toBeGreaterThan(0);
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
    it("shows multiple role badges with friendly labels", async () => {
      mockUseSession.mockReturnValue(
        sessionWith("Admin", "admin@example.com", [
          "EDC_ADMIN",
          "HDAB_AUTHORITY",
        ]),
      );
      const user = userEvent.setup();
      render(<UserMenu />);
      await user.click(screen.getByText("Admin"));

      // Badges now use ROLE_LABELS friendly names
      expect(screen.getAllByText("Dataspace Admin").length).toBeGreaterThan(0);
      expect(screen.getAllByText("HDAB Authority").length).toBeGreaterThan(0);
    });

    it("shows friendly label for EDC_USER_PARTICIPANT", async () => {
      mockUseSession.mockReturnValue(
        sessionWith("participantuser", "p@example.com", [
          "EDC_USER_PARTICIPANT",
        ]),
      );
      const user = userEvent.setup();
      render(<UserMenu />);
      await user.click(screen.getByText("participantuser"));

      // EDC_USER_PARTICIPANT shows as "Participant" label in nav chip and dropdown
      expect(screen.getAllByText("Participant").length).toBeGreaterThan(0);
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

    it("filters out unknown roles (not in known roles)", async () => {
      mockUseSession.mockReturnValue(
        sessionWith("Tester", "t@example.com", ["EDC_ADMIN", "UNKNOWN_ROLE"]),
      );
      const user = userEvent.setup();
      render(<UserMenu />);
      await user.click(screen.getByText("Tester"));

      expect(screen.getAllByText("Dataspace Admin").length).toBeGreaterThan(0);
      expect(screen.queryByText("UNKNOWN_ROLE")).not.toBeInTheDocument();
    });

    it("shows specific roles when EDC_ADMIN and HDAB_AUTHORITY are present", async () => {
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

      // displayRolesFor hides EDC_USER_PARTICIPANT when specific roles present
      expect(screen.getAllByText("Dataspace Admin").length).toBeGreaterThan(0);
      expect(screen.getAllByText("HDAB Authority").length).toBeGreaterThan(0);
      // EDC_USER_PARTICIPANT is hidden when other specific roles present
      expect(screen.queryByText("Participant")).not.toBeInTheDocument();
    });
  });

  // ── Sign out ─────────────────────────────────────────────────────

  describe("sign out", () => {
    // signOut() returns a Promise — the component chains .then() on it for
    // the Keycloak hard-redirect, so the mock must resolve.
    beforeEach(() => {
      mockSignOut.mockResolvedValue(undefined);
    });

    // ── window.location stub ──────────────────────────────────────
    // The fix navigates the browser to Keycloak's end-session endpoint via
    // `window.location.href = …`. jsdom does not implement cross-origin
    // navigation, so we replace window.location with a plain writable object
    // and read back the href the component set.
    const realLocation = window.location;
    function stubLocation() {
      Object.defineProperty(window, "location", {
        configurable: true,
        writable: true,
        value: {
          ...realLocation,
          origin: "https://ehds.mabu.red",
          href: "https://ehds.mabu.red/",
          assign: vi.fn(),
          replace: vi.fn(),
        },
      });
    }
    afterEach(() => {
      Object.defineProperty(window, "location", {
        configurable: true,
        writable: true,
        value: realLocation,
      });
    });

    /** Stub /api/keycloak-config so UserMenu has a Keycloak public URL. */
    function stubKeycloakConfig(
      publicUrl = "https://keycloak.ehds.mabu.red/realms/edcv",
      clientId = "health-dataspace-ui",
    ) {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ publicUrl, clientId }),
      });
      vi.stubGlobal("fetch", fetchMock);
      return fetchMock;
    }

    it("calls signOut with callbackUrl '/' when no Keycloak URL set", async () => {
      stubLocation();
      mockUseSession.mockReturnValue(sessionWith("User", "u@example.com", []));
      const user = userEvent.setup();
      render(<UserMenu />);
      await user.click(screen.getByText("User"));
      await user.click(screen.getByText("Sign out"));

      expect(mockSignOut).toHaveBeenCalledWith({ callbackUrl: "/" });
    });

    /**
     * REGRESSION — issue #52.
     *
     * Reproduces "logout then re-login keeps the previous user": the sign-out
     * MUST end Keycloak's SSO session, not just the NextAuth app cookie.
     *
     * Before the fix, the component called `signOut({ callbackUrl: logoutUrl })`
     * with a cross-origin Keycloak URL. NextAuth v4 rejects cross-origin
     * callback URLs, so the browser never reached Keycloak and the SSO cookie
     * survived. This test asserts the correct flow instead:
     *   1. signOut is invoked with `{ redirect: false }` (NOT a callbackUrl), and
     *   2. the browser is hard-redirected to Keycloak's end-session endpoint.
     */
    it("hard-redirects the browser to Keycloak's end-session endpoint on sign out", async () => {
      stubLocation();
      stubKeycloakConfig();

      mockUseSession.mockReturnValue(
        sessionWith("Logout User", "logout@example.com", []),
      );
      const user = userEvent.setup();
      render(<UserMenu />);

      await waitFor(() =>
        expect(window.fetch).toHaveBeenCalledWith("/api/keycloak-config"),
      );

      await user.click(screen.getByText("Logout User"));
      await user.click(screen.getByText("Sign out"));

      // 1. signOut must NOT receive the cross-origin Keycloak URL as a
      //    callbackUrl — NextAuth would silently drop it.
      expect(mockSignOut).toHaveBeenCalledWith({ redirect: false });
      expect(mockSignOut).not.toHaveBeenCalledWith(
        expect.objectContaining({
          callbackUrl: expect.stringContaining("openid-connect/logout"),
        }),
      );

      // 2. After signOut resolves, the browser is sent to Keycloak's
      //    end-session endpoint so the SSO cookie is destroyed.
      await waitFor(() =>
        expect(window.location.href).toContain(
          "https://keycloak.ehds.mabu.red/realms/edcv/protocol/openid-connect/logout",
        ),
      );
      expect(window.location.href).toContain("post_logout_redirect_uri=");
      expect(window.location.href).toContain("client_id=health-dataspace-ui");

      vi.unstubAllGlobals();
    });

    it("includes id_token_hint in the logout URL when a session id_token exists", async () => {
      stubLocation();
      stubKeycloakConfig();

      mockUseSession.mockReturnValue({
        data: {
          user: { name: "Token User", email: "tok@example.com" },
          roles: [],
          idToken: "eyJhbGciOiJ.fake.idtoken",
        },
        status: "authenticated" as const,
      });
      const user = userEvent.setup();
      render(<UserMenu />);

      await waitFor(() =>
        expect(window.fetch).toHaveBeenCalledWith("/api/keycloak-config"),
      );

      await user.click(screen.getByText("Token User"));
      await user.click(screen.getByText("Sign out"));

      await waitFor(() =>
        expect(window.location.href).toContain("openid-connect/logout"),
      );
      expect(window.location.href).toContain(
        "id_token_hint=eyJhbGciOiJ.fake.idtoken",
      );

      vi.unstubAllGlobals();
    });

    it("passes clientId from runtime config into logout URL", async () => {
      stubLocation();
      stubKeycloakConfig(
        "https://keycloak.ehds.mabu.red/realms/test",
        "health-dataspace-ui",
      );

      mockUseSession.mockReturnValue(sessionWith("U", "u@test.com", []));
      const user = userEvent.setup();
      render(<UserMenu />);

      await waitFor(() =>
        expect(window.fetch).toHaveBeenCalledWith("/api/keycloak-config"),
      );

      await user.click(screen.getByText("U"));
      await user.click(screen.getByText("Sign out"));

      await waitFor(() =>
        expect(window.location.href).toContain("client_id=health-dataspace-ui"),
      );

      vi.unstubAllGlobals();
    });

    it("closes dropdown after sign-out click", async () => {
      stubLocation();
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

    it("falls back to empty string when both name and email are missing", () => {
      mockUseSession.mockReturnValue({
        data: { user: {}, roles: [] },
        status: "authenticated",
      });
      render(<UserMenu />);
      // Component renders without crashing; Sign in not shown (authenticated)
      expect(screen.queryByText("Sign in")).not.toBeInTheDocument();
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

    it("shows demo suffix and demo session in static mode", async () => {
      const DemoUserMenu = await loadDemoUserMenu();
      render(<DemoUserMenu />);

      // Demo session uses "edcadmin" as the user name
      expect(screen.getByText("edcadmin")).toBeInTheDocument();
      // Demo label shown (either "(demo)" or "demo mode")
      const demoLabel =
        screen.queryByText("(demo)") ?? screen.queryByText("demo mode");
      expect(demoLabel).not.toBeNull();
    });

    it("shows 'Sign out' text in static mode", async () => {
      const DemoUserMenu = await loadDemoUserMenu();
      const user = userEvent.setup();
      render(<DemoUserMenu />);

      await user.click(screen.getByText("edcadmin"));
      expect(screen.getByText("Sign out")).toBeInTheDocument();
    });

    it("sign-in button is no-op in static mode", async () => {
      const DemoUserMenu = await loadDemoUserMenu();
      render(<DemoUserMenu />);
      // Static mode always shows the demo user, never Sign in
      expect(screen.queryByText("Sign in")).not.toBeInTheDocument();
      expect(screen.getByText("edcadmin")).toBeInTheDocument();
    });

    it("sign-out clears persona and redirects in demo mode", async () => {
      const DemoUserMenu = await loadDemoUserMenu();
      const user = userEvent.setup();
      render(<DemoUserMenu />);

      await user.click(screen.getByText("edcadmin"));
      await user.click(screen.getByText("Sign out"));

      // In static mode, signOut (NextAuth) should NOT be called
      expect(mockSignOut).not.toHaveBeenCalled();
      // sessionStorage persona should be set to signed-out sentinel
      expect(sessionStorage.getItem("demo-persona")).toBe("__signed_out__");
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
