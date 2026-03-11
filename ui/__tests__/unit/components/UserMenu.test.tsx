/**
 * Unit tests for UserMenu component
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import UserMenu from "@/components/UserMenu";

// Mock next-auth/react
const mockUseSession = vi.fn();
const mockSignIn = vi.fn();
const mockSignOut = vi.fn();

vi.mock("next-auth/react", () => ({
  useSession: () => mockUseSession(),
  signIn: (...args: unknown[]) => mockSignIn(...args),
  signOut: (...args: unknown[]) => mockSignOut(...args),
}));

describe("UserMenu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should show loading state", () => {
    mockUseSession.mockReturnValue({ data: null, status: "loading" });

    render(<UserMenu />);
    expect(screen.getByText("...")).toBeInTheDocument();
  });

  it("should show Sign in button when unauthenticated", () => {
    mockUseSession.mockReturnValue({ data: null, status: "unauthenticated" });

    render(<UserMenu />);
    const btn = screen.getByText("Sign in");
    expect(btn).toBeInTheDocument();
  });

  it("should call signIn when Sign in is clicked", () => {
    mockUseSession.mockReturnValue({ data: null, status: "unauthenticated" });

    render(<UserMenu />);
    fireEvent.click(screen.getByText("Sign in"));
    expect(mockSignIn).toHaveBeenCalledWith("keycloak");
  });

  it("should show user name when authenticated", () => {
    mockUseSession.mockReturnValue({
      data: {
        user: { name: "Alice Smith", email: "alice@example.com" },
        roles: ["EDC_ADMIN"],
      },
      status: "authenticated",
    });

    render(<UserMenu />);
    expect(screen.getByText("Alice Smith")).toBeInTheDocument();
  });

  it("should toggle dropdown on click", () => {
    mockUseSession.mockReturnValue({
      data: {
        user: { name: "Bob Jones", email: "bob@example.com" },
        roles: [],
      },
      status: "authenticated",
    });

    render(<UserMenu />);

    // Dropdown should not be visible initially
    expect(screen.queryByText("bob@example.com")).not.toBeInTheDocument();

    // Click to open
    fireEvent.click(screen.getByText("Bob Jones"));
    expect(screen.getByText("bob@example.com")).toBeInTheDocument();
  });

  it("should show role badges for known roles", () => {
    mockUseSession.mockReturnValue({
      data: {
        user: { name: "Admin User", email: "admin@example.com" },
        roles: ["EDC_ADMIN", "HDAB_AUTHORITY"],
      },
      status: "authenticated",
    });

    render(<UserMenu />);
    fireEvent.click(screen.getByText("Admin User"));

    expect(screen.getByText("EDC_ADMIN")).toBeInTheDocument();
    expect(screen.getByText("HDAB_AUTHORITY")).toBeInTheDocument();
  });

  it("should show Sign out button in dropdown", () => {
    mockUseSession.mockReturnValue({
      data: {
        user: { name: "Test User", email: "test@example.com" },
        roles: [],
      },
      status: "authenticated",
    });

    render(<UserMenu />);
    fireEvent.click(screen.getByText("Test User"));

    const signOutBtn = screen.getByText("Sign out");
    expect(signOutBtn).toBeInTheDocument();
  });
});
