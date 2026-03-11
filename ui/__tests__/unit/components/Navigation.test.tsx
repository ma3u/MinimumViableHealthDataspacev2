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
    expect(screen.getByText("Graph Explorer")).toBeInTheDocument();
    expect(screen.getByText("Dataset Catalog")).toBeInTheDocument();
    expect(screen.getByText("Patient Journey")).toBeInTheDocument();
    expect(screen.getByText("Analytics")).toBeInTheDocument();
    expect(screen.getByText("NLQ / Federated")).toBeInTheDocument();
  });

  it("should render dropdown group labels", () => {
    render(<Navigation />);
    expect(screen.getByText("Onboarding")).toBeInTheDocument();
    expect(screen.getByText("Data Exchange")).toBeInTheDocument();
    expect(screen.getByText("Admin")).toBeInTheDocument();
  });

  it("should render the UserMenu", () => {
    render(<Navigation />);
    expect(screen.getByTestId("user-menu")).toBeInTheDocument();
  });

  it("should highlight the active link based on current pathname", () => {
    mockPathname.mockReturnValue("/graph");
    render(<Navigation />);

    const graphLink = screen.getByText("Graph Explorer").closest("a");
    expect(graphLink?.className).toContain("bg-layer1");

    const catalogLink = screen.getByText("Dataset Catalog").closest("a");
    expect(catalogLink?.className).not.toContain("bg-layer1");
  });

  it("should highlight catalog link when on /catalog path", () => {
    mockPathname.mockReturnValue("/catalog");
    render(<Navigation />);

    const catalogLink = screen.getByText("Dataset Catalog").closest("a");
    expect(catalogLink?.className).toContain("bg-layer1");
  });

  it("should have correct href attributes on links", () => {
    render(<Navigation />);

    const graphLink = screen.getByText("Graph Explorer").closest("a");
    expect(graphLink).toHaveAttribute("href", "/graph");

    const catalogLink = screen.getByText("Dataset Catalog").closest("a");
    expect(catalogLink).toHaveAttribute("href", "/catalog");

    const patientLink = screen.getByText("Patient Journey").closest("a");
    expect(patientLink).toHaveAttribute("href", "/patient");
  });
});
