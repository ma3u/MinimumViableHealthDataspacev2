/**
 * Tests for the Home page (ui/src/app/page.tsx)
 * Server component — static card grid, no fetch
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

import Home from "@/app/page";

describe("Home Page", () => {
  it("renders the main heading", () => {
    render(<Home />);
    expect(screen.getByText("Health Dataspace v2")).toBeInTheDocument();
  });

  it("renders the subtitle", () => {
    render(<Home />);
    expect(screen.getByText(/EHDS-compliant demo/)).toBeInTheDocument();
  });

  it("renders Explore section cards", () => {
    render(<Home />);
    expect(screen.getByText("Graph Explorer")).toBeInTheDocument();
    expect(screen.getByText("Dataset Catalog")).toBeInTheDocument();
    expect(screen.getByText("Patient Journey")).toBeInTheDocument();
    expect(screen.getByText("OMOP Analytics")).toBeInTheDocument();
    expect(screen.getByText("EEHRxF Profiles")).toBeInTheDocument();
  });

  it("renders action section cards", () => {
    render(<Home />);
    expect(screen.getByText("Governance")).toBeInTheDocument();
    expect(screen.getByText("Data Exchange")).toBeInTheDocument();
    expect(screen.getByText("Portal Admin")).toBeInTheDocument();
    expect(screen.getByText("Documentation")).toBeInTheDocument();
  });

  it("renders correct links for explore cards", () => {
    render(<Home />);
    expect(screen.getByText("Graph Explorer").closest("a")).toHaveAttribute(
      "href",
      "/graph",
    );
    expect(screen.getByText("Dataset Catalog").closest("a")).toHaveAttribute(
      "href",
      "/catalog",
    );
    expect(screen.getByText("Patient Journey").closest("a")).toHaveAttribute(
      "href",
      "/patient",
    );
  });

  it("renders correct links for action cards", () => {
    render(<Home />);
    expect(screen.getByText("Governance").closest("a")).toHaveAttribute(
      "href",
      "/compliance",
    );
    expect(screen.getByText("Data Exchange").closest("a")).toHaveAttribute(
      "href",
      "/data/share",
    );
    expect(screen.getByText("Documentation").closest("a")).toHaveAttribute(
      "href",
      "/docs",
    );
  });

  it("renders section headings", () => {
    render(<Home />);
    expect(screen.getByText("Explore")).toBeInTheDocument();
    expect(screen.getByText("Govern · Exchange · Manage")).toBeInTheDocument();
  });
});
