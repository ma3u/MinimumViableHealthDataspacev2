import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WalletFlow, DYOU } from "@/components/wallet/PhoneFrame";
import { REGISTER_STEPS, LOGIN_STEPS } from "@/components/wallet/flows";
import { insurer } from "@/lib/journey-config";

describe("WalletFlow theme='dyou' (the German wallet's chrome)", () => {
  it("draws the d-you header and stacked pill buttons, no brand chip", () => {
    render(
      <WalletFlow
        theme="dyou"
        interactive
        loop={false}
        steps={REGISTER_STEPS}
        ariaLabel="Simulated d-you register"
      />,
    );
    const phone = screen.getByRole("group", {
      name: "Simulated d-you register",
    });
    expect(phone).toHaveAttribute("data-theme", "dyou");
    // one progress segment per step, the first one under way
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuemax", String(REGISTER_STEPS.length));
    expect(bar).toHaveAttribute("aria-valuenow", "1");
    // the mint primary pill with dark text, the outlined secondary below it
    const primary = screen.getByRole("button", { name: "Yes, continue" });
    expect(primary.className).toContain("rounded-full");
    expect(primary.style.background).toBe(
      "rgb(150, 245, 175)", // #96F5AF, logic-ui primaryContainer
    );
    expect(primary.style.color).toBe("rgb(29, 29, 30)"); // #1D1D1E onSurface
    const secondary = screen.getByRole("button", { name: "Cancel" });
    expect(secondary.style.border).toContain("rgb(29, 29, 30)");
    // no chip: d-you shows no logo on its screens
    expect(screen.queryByText("d-you")).toBeNull();
    // the close cross in the header
    expect(
      screen.getByRole("button", { name: "Dismiss request" }),
    ).toBeInTheDocument();
  });

  it("advances the segmented progress and ends on the mint success screen", () => {
    const onComplete = vi.fn();
    render(
      <WalletFlow
        theme="dyou"
        interactive
        loop={false}
        steps={LOGIN_STEPS}
        onComplete={onComplete}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "2",
    );
    expect(screen.getByText(/Welcome back, Maria/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onComplete).toHaveBeenCalledTimes(1);
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
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("the palette is the one from the mirror's Colors.swift", () => {
    expect(DYOU.primaryContainer).toBe("#96F5AF");
    expect(DYOU.pid).toBe("#02818B");
    expect(DYOU.onSurface).toBe("#1D1D1E");
  });
});
