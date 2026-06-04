import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import JourneyPage from "@/app/journey/page";

describe("JourneyPage (presentation)", () => {
  it("opens on the title slide", () => {
    render(<JourneyPage />);
    expect(screen.getByText(/Maria takes control of/i)).toBeInTheDocument();
    expect(screen.getByText("1 / 5")).toBeInTheDocument();
  });

  it("walks through all four steps via Next", () => {
    render(<JourneyPage />);
    const next = screen.getByRole("button", { name: /next step/i });
    fireEvent.click(next);
    expect(
      screen.getByText(/Register with your EUDI Wallet/i),
    ).toBeInTheDocument();
    fireEvent.click(next);
    expect(
      screen.getByText(/Pull my record from my insurance/i),
    ).toBeInTheDocument();
    fireEvent.click(next);
    expect(screen.getByText(/Donate my data to research/i)).toBeInTheDocument();
    fireEvent.click(next);
    expect(
      screen.getByText(/My personal research results/i),
    ).toBeInTheDocument();
    expect(screen.getByText("5 / 5")).toBeInTheDocument();
  });

  it("disables Previous on the first slide", () => {
    render(<JourneyPage />);
    expect(
      screen.getByRole("button", { name: /previous step/i }),
    ).toBeDisabled();
  });

  it("jumps to a step via the progress dots", () => {
    render(<JourneyPage />);
    fireEvent.click(screen.getByRole("button", { name: /go to 3/i }));
    expect(screen.getByText(/Donate my data to research/i)).toBeInTheDocument();
  });

  it("advances with the ArrowRight key", () => {
    render(<JourneyPage />);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(
      screen.getByText(/Register with your EUDI Wallet/i),
    ).toBeInTheDocument();
  });
});
