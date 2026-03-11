/**
 * Tests for /auth/signin page — error message handling.
 *
 * Verifies that the sign-in page displays correct, user-friendly error
 * messages for the three OAuth callback failure modes:
 *   - Callback        → issuer mismatch / generic callback error
 *   - OAuthCallback   → Keycloak unreachable or OIDC misconfiguration
 *   - OAuthSignin     → could not initiate sign-in flow
 *
 * These errors historically surfaced as "Error: Callback" when Keycloak's
 * Docker hostname (keycloak:8080) leaked into the `iss` claim and didn't
 * match the NextAuth `issuer` configured for localhost.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// We need to override the global useSearchParams mock per-test
const mockSearchParams = vi.fn(() => new URLSearchParams());

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => "/auth/signin",
  useSearchParams: () => mockSearchParams(),
}));

const mockSignIn = vi.fn();
vi.mock("next-auth/react", () => ({
  signIn: (...args: unknown[]) => mockSignIn(...args),
  useSession: () => ({ data: null, status: "unauthenticated" }),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import SignInPage from "@/app/auth/signin/page";

describe("SignInPage — error messages", () => {
  beforeEach(() => {
    mockSignIn.mockReset();
    mockSearchParams.mockReset();
  });

  it("shows no error banner when no error param", () => {
    mockSearchParams.mockReturnValue(new URLSearchParams());
    render(<SignInPage />);
    expect(screen.getByText("Health Dataspace Login")).toBeInTheDocument();
    // No red error banner
    expect(screen.queryByText(/callback/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Error:/)).not.toBeInTheDocument();
  });

  it("shows Callback error with correct message", () => {
    mockSearchParams.mockReturnValue(new URLSearchParams("error=Callback"));
    render(<SignInPage />);
    expect(
      screen.getByText(
        /OAuth callback error — check that Keycloak is running and the redirect URI is registered/,
      ),
    ).toBeInTheDocument();
  });

  it("shows OAuthCallback error with correct message", () => {
    mockSearchParams.mockReturnValue(
      new URLSearchParams("error=OAuthCallback"),
    );
    render(<SignInPage />);
    expect(
      screen.getByText(
        /Authentication callback failed. Keycloak may be unreachable or misconfigured/,
      ),
    ).toBeInTheDocument();
  });

  it("shows OAuthSignin error with correct message", () => {
    mockSearchParams.mockReturnValue(new URLSearchParams("error=OAuthSignin"));
    render(<SignInPage />);
    expect(
      screen.getByText(
        /Could not start sign-in flow. Is Keycloak running on port 8080/,
      ),
    ).toBeInTheDocument();
  });

  it("shows generic error for unknown error codes", () => {
    mockSearchParams.mockReturnValue(
      new URLSearchParams("error=SomethingWeird"),
    );
    render(<SignInPage />);
    expect(screen.getByText("Error: SomethingWeird")).toBeInTheDocument();
  });

  it("renders error banner with red styling", () => {
    mockSearchParams.mockReturnValue(new URLSearchParams("error=Callback"));
    render(<SignInPage />);
    const errorBanner = screen.getByText(/OAuth callback error/).closest("div");
    expect(errorBanner).toHaveClass("bg-red-900/50");
    expect(errorBanner).toHaveClass("border-red-700");
  });

  it("preserves callbackUrl from search params", async () => {
    mockSearchParams.mockReturnValue(
      new URLSearchParams("callbackUrl=/catalog&error=Callback"),
    );
    render(<SignInPage />);

    const user = userEvent.setup();
    await user.click(screen.getByText(/Sign in with Keycloak/));

    expect(mockSignIn).toHaveBeenCalledWith("keycloak", {
      callbackUrl: "/catalog",
    });
  });

  it("defaults callbackUrl to / when not specified", async () => {
    mockSearchParams.mockReturnValue(new URLSearchParams());
    render(<SignInPage />);

    const user = userEvent.setup();
    await user.click(screen.getByText(/Sign in with Keycloak/));

    expect(mockSignIn).toHaveBeenCalledWith("keycloak", {
      callbackUrl: "/",
    });
  });
});
