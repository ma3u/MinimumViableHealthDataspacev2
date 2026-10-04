/**
 * ADR-053: the off-hours notice links the page the visitor asked for on the
 * static site and says when the live demo is back.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import OfflineNotice from "@/components/OfflineNotice";

afterEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("OfflineNotice", () => {
  it("links the visitor's own page on the static site", () => {
    window.history.replaceState(null, "", "/catalog?q=diabetes");
    render(<OfflineNotice />);
    expect(screen.getByTestId("offline-static-link")).toHaveAttribute(
      "href",
      "https://ma3u.github.io/MinimumViableHealthDataspacev2/catalog?q=diabetes",
    );
    expect(
      screen.getByRole("heading", { name: /offline outside office hours/i }),
    ).toBeInTheDocument();
  });

  it("names the day it is back", () => {
    render(<OfflineNotice />);
    expect(screen.getByTestId("offline-opening").textContent).toMatch(
      /^Back on (Monday|Tuesday|Wednesday|Thursday|Friday)/,
    );
  });
});
