import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { WalletFlow } from "@/components/wallet/PhoneFrame";
import {
  REGISTER_STEPS,
  LOGIN_STEPS,
  EHR_TRANSFER_STEPS,
} from "@/components/wallet/flows";
import { insurer, donationSources } from "@/lib/journey-config";

afterEach(() => vi.useRealTimers());

describe("wallet flows", () => {
  it("REGISTER cycles trust → review → success", () => {
    vi.useFakeTimers();
    render(<WalletFlow loop steps={REGISTER_STEPS} />);
    expect(screen.getByText(/Do you trust EHDS/i)).toBeInTheDocument();
    expect(screen.getByText("Yes, continue")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(3300);
    });
    expect(screen.getByText(/Review the request/i)).toBeInTheDocument();
    expect(screen.getByText("Share")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(3700);
    });
    expect(screen.getByText(/Success/i)).toBeInTheDocument();
    expect(screen.getByText("Go to wallet")).toBeInTheDocument();
  });

  it("LOGIN is a 2-step returning flow that skips the trust step", () => {
    vi.useFakeTimers();
    render(<WalletFlow loop steps={LOGIN_STEPS} />);
    expect(screen.getByText(/Sign in to EHDS/i)).toBeInTheDocument();
    expect(screen.getByText(/shared with EHDS before/i)).toBeInTheDocument();
    expect(screen.getByText("Approve")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(screen.getByText(/Welcome back/i)).toBeInTheDocument();
    expect(LOGIN_STEPS).toHaveLength(2);
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
