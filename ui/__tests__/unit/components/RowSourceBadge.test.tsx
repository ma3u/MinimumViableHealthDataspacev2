/**
 * Tests for RowSourceBadge (#358).
 *
 * The property under test is what a reader sees: a row the detail endpoint
 * cannot serve says so, and an ordinary control-plane row is not decorated.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import RowSourceBadge from "@/components/RowSourceBadge";

describe("RowSourceBadge", () => {
  it("renders nothing for a control-plane row", () => {
    const { container } = render(<RowSourceBadge source="controlplane" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the row carries no source", () => {
    const { container } = render(<RowSourceBadge />);
    expect(container).toBeEmptyDOMElement();
  });

  it("marks a demo row", () => {
    render(<RowSourceBadge source="demo" />);
    const badge = screen.getByTestId("row-source-demo");
    expect(badge).toHaveTextContent("Demo");
    expect(badge.getAttribute("title")).toContain("cannot be opened");
  });

  it("marks a bundled sample row", () => {
    render(<RowSourceBadge source="mock" />);
    const badge = screen.getByTestId("row-source-mock");
    expect(badge).toHaveTextContent("Sample");
    expect(badge.getAttribute("title")).toContain("cannot be opened");
  });

  it("prefers the row's own reason as the tooltip", () => {
    render(
      <RowSourceBadge source="demo" reason="Finalized by the walkthrough" />,
    );
    expect(screen.getByTestId("row-source-demo").getAttribute("title")).toBe(
      "Finalized by the walkthrough",
    );
  });
});
