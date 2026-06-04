import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { WalletSimulation } from "@/components/WalletSimulation";

afterEach(() => vi.useRealTimers());

describe("WalletSimulation", () => {
  it("auto-cycles through trust → review → success → loop", () => {
    vi.useFakeTimers();
    render(<WalletSimulation />);

    // step 0 — trust the verifier
    expect(screen.getByText(/Do you trust EHDS/i)).toBeInTheDocument();
    expect(screen.getByText(/Verified organization/i)).toBeInTheDocument();
    expect(screen.getByText("Yes, continue")).toBeInTheDocument();

    // step 1 — review & share the PID
    act(() => {
      vi.advanceTimersByTime(3300);
    });
    expect(screen.getByText(/Review the request/i)).toBeInTheDocument();
    expect(screen.getByText(/Person Identification Data/i)).toBeInTheDocument();
    expect(screen.getByText("Share")).toBeInTheDocument();

    // step 2 — success
    act(() => {
      vi.advanceTimersByTime(3700);
    });
    expect(screen.getByText(/Success/i)).toBeInTheDocument();
    expect(screen.getByText("Go to wallet")).toBeInTheDocument();

    // loops back to step 0
    act(() => {
      vi.advanceTimersByTime(2700);
    });
    expect(screen.getByText(/Do you trust EHDS/i)).toBeInTheDocument();
  });
});
