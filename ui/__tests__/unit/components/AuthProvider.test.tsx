/**
 * Tests for AuthProvider component.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import React from "react";

// Mock next-auth/react SessionProvider
vi.mock("next-auth/react", () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", { "data-testid": "session-provider" }, children),
}));

import { render, screen } from "@testing-library/react";
import AuthProvider from "@/components/AuthProvider";

describe("AuthProvider", () => {
  it("should render children inside SessionProvider", () => {
    render(
      <AuthProvider>
        <span data-testid="child">Hello</span>
      </AuthProvider>,
    );
    expect(screen.getByTestId("session-provider")).toBeDefined();
    expect(screen.getByTestId("child")).toBeDefined();
    expect(screen.getByText("Hello")).toBeDefined();
  });
});
