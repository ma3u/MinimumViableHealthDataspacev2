/**
 * Joining the Klarbefund beta from the start page (ADR-050).
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "fs";
import path from "path";
import { TestflightJoin, TESTFLIGHT_URL } from "@/components/TestflightJoin";

describe("TestflightJoin", () => {
  it("links to the public TestFlight group in a new tab", () => {
    render(<TestflightJoin />);
    const link = screen.getByRole("link", {
      name: /join the beta on testflight/i,
    });
    expect(link).toHaveAttribute("href", TESTFLIGHT_URL);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("shows the QR code under the static build's base path", () => {
    render(<TestflightJoin basePath="/MinimumViableHealthDataspacev2" />);
    expect(
      screen.getByAltText(/QR code: join the Klarbefund beta/i),
    ).toHaveAttribute(
      "src",
      "/MinimumViableHealthDataspacev2/images/klarbefund-testflight-qr.svg",
    );
  });

  it("ships the QR code it points at", () => {
    const svg = readFileSync(
      path.resolve(
        __dirname,
        "../../../public/images/klarbefund-testflight-qr.svg",
      ),
      "utf8",
    );
    expect(svg).toMatch(/^<svg /);
    expect(TESTFLIGHT_URL).toMatch(
      /^https:\/\/testflight\.apple\.com\/join\/\w+$/,
    );
  });
});
