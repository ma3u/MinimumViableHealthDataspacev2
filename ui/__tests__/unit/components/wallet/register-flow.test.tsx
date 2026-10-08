import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { WalletFlow } from "@/components/wallet/PhoneFrame";
import { REGISTER_STEPS } from "@/components/wallet/flows";

afterEach(() => vi.useRealTimers());

describe("WalletFlow with REGISTER_STEPS (d-you's PID presentation)", () => {
  it("auto-cycles dashboard → request → consent → code → sent → loop", () => {
    vi.useFakeTimers();
    render(
      <WalletFlow
        loop
        theme="dyou"
        ariaLabel="Simulated d-you registration"
        steps={REGISTER_STEPS}
      />,
    );

    // step 0: the dashboard with the Digital ID, the scanner is the action
    expect(screen.getByText("Digital ID")).toBeInTheDocument();
    expect(screen.getByText("Scan QR code")).toBeInTheDocument();

    // step 1: the relying party asks
    act(() => {
      vi.advanceTimersByTime(2700);
    });
    expect(
      screen.getByText(/This service is requesting data/i),
    ).toBeInTheDocument();
    expect(screen.getByText("European Health Dataspace")).toBeInTheDocument();
    expect(
      screen.getByText(/Do you want to share your data with this service/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Reject")).toBeInTheDocument();
    expect(screen.getByText("Next")).toBeInTheDocument();

    // step 2: the consent with the Digital ID card, age over 18, no birth date
    act(() => {
      vi.advanceTimersByTime(3300);
    });
    expect(
      screen.getByText(/These data will be transferred/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/3 out of 14 from Digital ID/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Age over 18")).toBeInTheDocument();
    expect(screen.queryByText(/Date of birth/i)).toBeNull();

    // step 3: the Digital ID code
    act(() => {
      vi.advanceTimersByTime(3700);
    });
    expect(
      screen.getByText(/Enter Digital ID code to confirm/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Transfer data")).toBeInTheDocument();

    // step 4: sent
    act(() => {
      vi.advanceTimersByTime(2300);
    });
    expect(screen.getByText(/Data sent successfully/i)).toBeInTheDocument();
    expect(screen.getByText("Close")).toBeInTheDocument();

    // loops back to the dashboard
    act(() => {
      vi.advanceTimersByTime(2700);
    });
    expect(screen.getByText("Digital ID")).toBeInTheDocument();
  });
});
