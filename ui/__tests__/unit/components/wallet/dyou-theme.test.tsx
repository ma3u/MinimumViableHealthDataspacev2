import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WalletFlow, DYOU } from "@/components/wallet/PhoneFrame";
import { REGISTER_STEPS, LOGIN_STEPS } from "@/components/wallet/flows";
import { insurer } from "@/lib/journey-config";

describe("WalletFlow theme='dyou' (the German wallet's own screens)", () => {
  it("lays out the request screen like RPInfoView: close only, Reject beside the mint Next", () => {
    render(
      <WalletFlow
        theme="dyou"
        interactive
        loop={false}
        steps={LOGIN_STEPS}
        ariaLabel="Simulated d-you login"
      />,
    );
    const phone = screen.getByRole("group", { name: "Simulated d-you login" });
    expect(phone).toHaveAttribute("data-theme", "dyou");
    // the mint DSPrimaryButton with dark text, the outlined DSSecondaryButton
    const primary = screen.getByRole("button", { name: "Next" });
    expect(primary.className).toContain("rounded-full");
    expect(primary.style.background).toBe("rgb(150, 245, 175)"); // #96F5AF
    expect(primary.style.color).toBe("rgb(29, 29, 30)"); // #1D1D1E
    const secondary = screen.getByRole("button", { name: "Reject" });
    expect(secondary.style.border).toContain("rgb(29, 29, 30)");
    // no chip, no progress bar: d-you shows neither on a presentation screen
    expect(screen.queryByText("d-you")).toBeNull();
    expect(screen.queryByRole("progressbar")).toBeNull();
    // the close cross of HeaderContentView
    expect(
      screen.getByRole("button", { name: "Dismiss request" }),
    ).toBeInTheDocument();
  });

  it("walks the real presentation: request → consent → code → sent, then Close completes", () => {
    const onComplete = vi.fn();
    const onCancel = vi.fn();
    render(
      <WalletFlow
        theme="dyou"
        interactive
        loop={false}
        steps={LOGIN_STEPS}
        onComplete={onComplete}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(
      screen.getByText(/These data will be transferred/i),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(
      screen.getByText(/Enter Digital ID code to confirm/i),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Transfer data" }));
    expect(screen.getByText(/Data sent successfully/i)).toBeInTheDocument();
    // the result screen has the primary alone, no header
    expect(screen.queryByRole("button", { name: "Reject" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Dismiss request" }),
    ).toBeNull();
    expect(onComplete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("Reject on the request screen cancels", () => {
    const onCancel = vi.fn();
    render(
      <WalletFlow
        theme="dyou"
        interactive
        loop={false}
        steps={LOGIN_STEPS}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("starts the registration on the dashboard, where the scanner is the action", () => {
    render(
      <WalletFlow
        theme="dyou"
        interactive
        loop={false}
        steps={REGISTER_STEPS}
      />,
    );
    expect(screen.getByText("Overview")).toBeInTheDocument();
    expect(screen.getByText("Activity")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Dismiss request" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Scan QR code" }));
    expect(
      screen.getByText(/This service is requesting data/i),
    ).toBeInTheDocument();
  });

  it("the classic theme keeps the brand chip for the insurer's app", () => {
    render(
      <WalletFlow
        loop
        steps={LOGIN_STEPS}
        brand={{ name: insurer.name, color: insurer.brand }}
      />,
    );
    expect(screen.getByText(insurer.name)).toBeInTheDocument();
  });

  it("the palette is the one from the mirror's Colors.swift", () => {
    expect(DYOU.primaryContainer).toBe("#96F5AF");
    expect(DYOU.pid).toBe("#02818B");
    expect(DYOU.onSurface).toBe("#1D1D1E");
  });
});
