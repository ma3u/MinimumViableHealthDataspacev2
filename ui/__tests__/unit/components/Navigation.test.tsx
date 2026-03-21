/**
 * Component tests for Navigation (ui/src/components/Navigation.tsx)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
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

describe("Navigation Component", () => {
  beforeEach(() => {
    mockPathname.mockReturnValue("/");
  });

  it("should render the brand name", () => {
    render(<Navigation />);
    expect(screen.getByText("Health Dataspace")).toBeInTheDocument();
  });

  it("should render all main navigation links", () => {
    render(<Navigation />);
    // All links are now inside dropdown groups
    expect(screen.getByText("Get Started")).toBeInTheDocument();
    expect(screen.getByText("Explore")).toBeInTheDocument();
    expect(screen.getByText("Governance")).toBeInTheDocument();
    expect(screen.getByText("Exchange")).toBeInTheDocument();
    expect(screen.getByText("Manage")).toBeInTheDocument();
    expect(screen.getByText("Docs")).toBeInTheDocument();
  });

  it("should render dropdown group labels", () => {
    render(<Navigation />);
    expect(screen.getByText("Explore")).toBeInTheDocument();
    expect(screen.getByText("Exchange")).toBeInTheDocument();
    expect(screen.getByText("Manage")).toBeInTheDocument();
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

    const governanceButton = screen.getByText("Governance").closest("button");
    expect(governanceButton?.className).not.toContain("bg-layer1");
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
});
