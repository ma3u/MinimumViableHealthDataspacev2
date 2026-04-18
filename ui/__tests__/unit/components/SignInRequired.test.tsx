/**
 * Unit tests for <SignInRequired /> — the fallback rendered on protected
 * pages when a user is not authenticated. Small surface, zero prior
 * coverage; bringing it to 100% lifts global line/statement coverage.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const signInMock = vi.fn();
vi.mock("next-auth/react", () => ({
  signIn: (...args: unknown[]) => signInMock(...args),
}));

import { SignInRequired } from "@/components/SignInRequired";

describe("SignInRequired", () => {
  beforeEach(() => signInMock.mockReset());

  it("renders the default title when none is provided", () => {
    render(<SignInRequired description="Please log in to continue." />);
    expect(
      screen.getByText("Sign in required", { selector: "p" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Please log in to continue.")).toBeInTheDocument();
  });

  it("accepts a custom title", () => {
    render(<SignInRequired title="Restricted" description="desc" />);
    expect(screen.getByText("Restricted")).toBeInTheDocument();
  });

  it("calls signIn('keycloak') on button click", () => {
    render(<SignInRequired description="x" />);
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    expect(signInMock).toHaveBeenCalledOnce();
    expect(signInMock).toHaveBeenCalledWith("keycloak");
  });
});
