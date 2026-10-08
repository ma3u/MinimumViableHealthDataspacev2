import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { WalletFlow } from "@/components/wallet/PhoneFrame";
import {
  REGISTER_STEPS,
  LOGIN_STEPS,
  EHR_TRANSFER_STEPS,
} from "@/components/wallet/flows";
import { insurer, donationSources, personalHealth } from "@/lib/journey-config";

afterEach(() => vi.useRealTimers());

describe("wallet flows", () => {
  it("REGISTER cycles dashboard → request → consent → code → sent", () => {
    vi.useFakeTimers();
    render(<WalletFlow loop theme="dyou" steps={REGISTER_STEPS} />);
    expect(screen.getByText("Digital ID")).toBeInTheDocument();
    expect(screen.getByText("Scan QR code")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(2700);
    });
    expect(
      screen.getByText(/This service is requesting data/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Next")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(3300);
    });
    expect(
      screen.getByText(/These data will be transferred/i),
    ).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(3700);
    });
    expect(screen.getByText(/Enter Digital ID code/i)).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(2300);
    });
    expect(screen.getByText(/Data sent successfully/i)).toBeInTheDocument();
    expect(REGISTER_STEPS).toHaveLength(5);
  });

  it("LOGIN is the same presentation without the dashboard in front", () => {
    vi.useFakeTimers();
    render(<WalletFlow loop theme="dyou" steps={LOGIN_STEPS} />);
    expect(
      screen.getByText(/This service is requesting data/i),
    ).toBeInTheDocument();
    expect(screen.getByText("European Health Dataspace")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(3300);
    });
    expect(
      screen.getByText(/These data will be transferred/i),
    ).toBeInTheDocument();
    expect(LOGIN_STEPS).toHaveLength(4);
  });

  it("EHR transfer authorises an ePA pull to the EHDS portal", () => {
    vi.useFakeTimers();
    render(
      <WalletFlow
        loop
        steps={EHR_TRANSFER_STEPS}
        brand={{ name: insurer.name, color: insurer.brand }}
      />,
    );
    expect(screen.getByText(/Connect your health record/i)).toBeInTheDocument();
    expect(screen.getAllByText(/GesundheitsID/i).length).toBeGreaterThan(0);
    act(() => {
      vi.advanceTimersByTime(3100);
    });
    expect(screen.getByText(/Choose what to share/i)).toBeInTheDocument();
    expect(
      screen.getByText(/European Health Dataspace portal/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Medications")).toBeInTheDocument();
    expect(EHR_TRANSFER_STEPS).toHaveLength(4);
  });

  it("defaults to a fictional insurer — no real org without NEXT_PUBLIC_DEMO_TK", () => {
    expect(insurer.name).toContain("AlphaKasse");
    expect(insurer.name).not.toContain("TK");
    expect(insurer.screenshot).toBeNull();
  });

  it("interactive mode advances on click and fires onComplete on the last step", () => {
    const onComplete = vi.fn();
    const onCancel = vi.fn();
    render(
      <WalletFlow
        interactive
        loop={false}
        steps={LOGIN_STEPS}
        theme="dyou"
        onComplete={onComplete}
        onCancel={onCancel}
      />,
    );
    expect(
      screen.getByText(/This service is requesting data/i),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Transfer data" }));
    expect(screen.getByText(/Data sent successfully/i)).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("personal-health sources are fictional + (fitness/labs) image-free by default", () => {
    expect(personalHealth.map((s) => s.id)).toEqual([
      "fitness",
      "labs",
      "nutrition",
    ]);
    for (const s of personalHealth) {
      expect(s.metrics.length).toBeGreaterThan(0);
      for (const brand of ["Whoop", "Blood Test Oracle", "TK", "Techniker"]) {
        expect(s.source).not.toContain(brand);
      }
    }
    expect(
      personalHealth.find((s) => s.id === "fitness")?.screenshot,
    ).toBeNull();
    expect(personalHealth.find((s) => s.id === "labs")?.screenshot).toBeNull();
  });

  it("donation sources are fictional + image-free in the public default", () => {
    expect(donationSources.map((s) => s.id)).toEqual([
      "ehr",
      "fitness",
      "labs",
    ]);
    for (const s of donationSources) {
      expect(s.screenshot).toBeNull();
      for (const brand of ["Whoop", "Blood Test Oracle", "TK", "Techniker"]) {
        expect(s.label).not.toContain(brand);
      }
    }
  });
});
