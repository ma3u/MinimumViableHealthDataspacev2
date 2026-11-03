/**
 * Tests for AuthProvider component.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";

// Mock next-auth/react SessionProvider, keeping the session it was given
const providerSession = vi.fn();
vi.mock("next-auth/react", () => ({
  SessionProvider: ({
    children,
    session,
  }: {
    children: React.ReactNode;
    session?: unknown;
  }) => {
    providerSession(session);
    return React.createElement(
      "div",
      { "data-testid": "session-provider" },
      children,
    );
  },
}));

import { render, screen } from "@testing-library/react";

describe("AuthProvider", () => {
  beforeEach(() => {
    providerSession.mockClear();
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("should render children inside SessionProvider", async () => {
    const { default: AuthProvider } = await import("@/components/AuthProvider");
    render(
      <AuthProvider>
        <span data-testid="child">Hello</span>
      </AuthProvider>,
    );
    expect(screen.getByTestId("session-provider")).toBeDefined();
    expect(screen.getByTestId("child")).toBeDefined();
    expect(screen.getByText("Hello")).toBeDefined();
  });

  it("lets next-auth fetch the session on the hub", async () => {
    vi.stubEnv("NEXT_PUBLIC_STATIC_EXPORT", "");
    const { default: AuthProvider } = await import("@/components/AuthProvider");
    render(<AuthProvider>x</AuthProvider>);
    expect(providerSession).toHaveBeenCalledWith(undefined);
  });

  it("starts from no session in the static build, so nothing asks /api/auth/session", async () => {
    vi.stubEnv("NEXT_PUBLIC_STATIC_EXPORT", "true");
    const { default: AuthProvider } = await import("@/components/AuthProvider");
    render(<AuthProvider>x</AuthProvider>);
    expect(providerSession).toHaveBeenCalledWith(null);
  });
});
