/**
 * Tests for unauthorized page
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

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

vi.mock("lucide-react", async () => {
  const actual = await vi.importActual("lucide-react");
  return {
    ...actual,
    ShieldCheck: (props: Record<string, unknown>) => (
      <svg data-testid="shield-icon" {...props} />
    ),
  };
});

import UnauthorizedPage from "@/app/auth/unauthorized/page";

describe("UnauthorizedPage", () => {
  it("renders Access Denied heading", () => {
    render(<UnauthorizedPage />);
    expect(screen.getByText("Access Denied")).toBeInTheDocument();
  });

  it("shows explanation text", () => {
    render(<UnauthorizedPage />);
    expect(
      screen.getByText(/do not have the required role/),
    ).toBeInTheDocument();
  });

  it("has a link back to home", () => {
    render(<UnauthorizedPage />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/");
  });

  it("renders shield icon", () => {
    render(<UnauthorizedPage />);
    expect(screen.getByTestId("shield-icon")).toBeInTheDocument();
  });
});
