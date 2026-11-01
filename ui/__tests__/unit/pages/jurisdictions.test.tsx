/**
 * /jurisdictions (#782): the national implementation profiles, with the
 * fictional access bodies under them and the official sources.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";

const mockFetchApi = vi.fn();
vi.mock("@/lib/api", () => ({
  fetchApi: (...args: unknown[]) => mockFetchApi(...args),
}));
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import JurisdictionsPage from "@/app/jurisdictions/page";

const MOCK = JSON.parse(
  readFileSync(path.resolve("public/mock/jurisdictions.json"), "utf8"),
);

beforeEach(() => {
  mockFetchApi.mockReset();
});

describe("JurisdictionsPage", () => {
  it("shows a profile for each of the six member states", async () => {
    mockFetchApi.mockResolvedValue({ ok: true, json: async () => MOCK });
    render(<JurisdictionsPage />);
    for (const code of ["DE", "AT", "BE", "FR", "NL", "ES"]) {
      expect(await screen.findByTestId(`jurisdiction-${code}`)).toBeVisible();
    }
    expect(mockFetchApi).toHaveBeenCalledWith("/api/jurisdictions");
  });

  it("names the fictional access body and the real law", async () => {
    mockFetchApi.mockResolvedValue({ ok: true, json: async () => MOCK });
    render(<JurisdictionsPage />);
    const de = await screen.findByTestId("jurisdiction-DE");
    expect(within(de).getByText(/MedReg DE/)).toBeInTheDocument();
    const gdng = within(de).getByRole("link", {
      name: /Gesundheitsdatennutzungsgesetz/,
    });
    expect(gdng).toHaveAttribute(
      "href",
      "https://www.gesetze-im-internet.de/gdng/",
    );
    expect(gdng).toHaveAttribute("lang", "de");
    // A bill is shown as a bill.
    expect(
      within(de).getByText(/GeDIG/, { selector: "a" }),
    ).toBeInTheDocument();
    expect(within(de).getAllByText(/· bill/).length).toBeGreaterThan(0);
  });

  it("says when a country has no access body on the hub", async () => {
    mockFetchApi.mockResolvedValue({ ok: true, json: async () => MOCK });
    render(<JurisdictionsPage />);
    const at = await screen.findByTestId("jurisdiction-AT");
    expect(
      within(at).getByText("No access body of this country on the hub yet."),
    ).toBeInTheDocument();
  });

  it("anchors each profile by its country, for links from the access bodies", async () => {
    mockFetchApi.mockResolvedValue({ ok: true, json: async () => MOCK });
    render(<JurisdictionsPage />);
    expect(await screen.findByTestId("jurisdiction-FR")).toHaveAttribute(
      "id",
      "fr",
    );
  });

  it("says so when the profiles cannot be loaded", async () => {
    mockFetchApi.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: "No jurisdiction profiles available" }),
    });
    render(<JurisdictionsPage />);
    expect(
      await screen.findByText(/The national profiles are unavailable/),
    ).toBeInTheDocument();
  });
});
