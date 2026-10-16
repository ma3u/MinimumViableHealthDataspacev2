/**
 * DocFigureViewer: a click on a figure of a published report opens it full
 * screen with zoom; the file link is still a link when a modifier is held.
 */
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DocFigureViewer } from "@/components/docs/DocFigureViewer";

const FIGURE =
  '<a href="/published-docs/x.svg" target="_blank" rel="noopener noreferrer" class="doc-figure"><img src="/published-docs/x.svg" alt="The operating model, one swimlane per role" loading="lazy" /></a><p>Some prose</p>';

function renderFigure() {
  return render(
    <DocFigureViewer>
      <div dangerouslySetInnerHTML={{ __html: FIGURE }} />
    </DocFigureViewer>,
  );
}

describe("DocFigureViewer", () => {
  it("opens the diagram full screen on a click and closes on Escape", () => {
    renderFigure();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("img"));
    const dialog = screen.getByRole("dialog", {
      name: "The operating model, one swimlane per role",
    });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByTestId("doc-figure-image")).toHaveAttribute(
      "src",
      "/published-docs/x.svg",
    );
    expect(
      screen.getByRole("link", { name: "Open the file in a new tab" }),
    ).toHaveAttribute("href", "/published-docs/x.svg");
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe("");
  });

  it("zooms in and out with the buttons and the keyboard", () => {
    renderFigure();
    fireEvent.click(screen.getByRole("img"));
    const zoom = screen.getByTestId("doc-figure-zoom");
    expect(zoom).toHaveTextContent("100%");
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(zoom).toHaveTextContent("125%");
    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    expect(zoom).toHaveTextContent("80%");
    fireEvent.keyDown(window, { key: "+" });
    expect(zoom).toHaveTextContent("100%");
  });

  it("zooms with the mouse wheel around the pointer", () => {
    renderFigure();
    fireEvent.click(screen.getByRole("img"));
    fireEvent.wheel(screen.getByTestId("doc-figure-stage"), {
      deltaY: -300,
      clientX: 10,
      clientY: 10,
    });
    const pct = parseInt(
      screen.getByTestId("doc-figure-zoom").textContent ?? "0",
      10,
    );
    expect(pct).toBeGreaterThan(100);
  });

  it("leaves a click with a modifier key to the link itself", () => {
    renderFigure();
    const event = fireEvent.click(screen.getByRole("img"), { metaKey: true });
    expect(event).toBe(true);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("ignores a click outside a figure", () => {
    renderFigure();
    fireEvent.click(screen.getByText("Some prose"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
