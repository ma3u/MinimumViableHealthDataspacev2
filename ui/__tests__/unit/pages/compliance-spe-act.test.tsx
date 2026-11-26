import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { existsSync } from "node:fs";
import path from "node:path";
import SpeActPage from "@/app/compliance/spe-act/page";
import {
  SPE_ACT_REQUIREMENTS,
  allSpeActTexts,
  countByStatus,
} from "@/lib/spe-act-requirements";
import { MESSAGES } from "@/messages";

describe("/compliance/spe-act", () => {
  it("lists every requirement of the draft with its light", () => {
    render(<SpeActPage />);
    for (const r of SPE_ACT_REQUIREMENTS) {
      expect(screen.getByTestId(`spe-act-${r.id}`)).toHaveAttribute(
        "data-status",
        r.status,
      );
    }
    expect(screen.getByTestId("spe-act-verify-instance")).toHaveTextContent(
      "Art. 5(1), (2)",
    );
  });

  it("counts and filters by status", async () => {
    const user = userEvent.setup();
    render(<SpeActPage />);
    const counts = countByStatus();
    expect(screen.getByTestId("spe-act-count-gap")).toHaveTextContent(
      `Not yet · ${counts.gap}`,
    );
    // Filter by a status that always has rows: "Not yet" can be empty.
    await user.click(screen.getByTestId("spe-act-count-partial"));
    const shown = screen.getAllByTestId(/^spe-act-(?!count)/);
    expect(shown).toHaveLength(counts.partial);
    for (const li of shown)
      expect(li).toHaveAttribute("data-status", "partial");
  });

  it("links the draft act and the published feedback", () => {
    render(<SpeActPage />);
    expect(
      screen.getByRole("link", { name: /Read the draft act/ }),
    ).toHaveAttribute("href", expect.stringContaining("initiatives/17192"));
    expect(screen.getByRole("link", { name: /Our feedback/ })).toHaveAttribute(
      "href",
      expect.stringContaining("F33583920"),
    );
  });

  it("points every internal evidence link at a page that exists", () => {
    const app = path.resolve("src/app");
    for (const r of SPE_ACT_REQUIREMENTS)
      for (const e of r.evidence)
        if (e.href.startsWith("/")) {
          const direct = path.join(app, e.href, "page.tsx");
          const slug = path.join(
            app,
            path.dirname(e.href),
            "[slug]",
            "page.tsx",
          );
          expect(
            existsSync(direct) || existsSync(slug),
            `${r.id}: ${e.href}`,
          ).toBe(true);
        }
  });

  it("has every text in every language", () => {
    for (const lang of ["en", "de", "fr", "es", "nl"] as const) {
      const c = MESSAGES[lang].compliance as Record<string, string>;
      expect(
        allSpeActTexts().filter((x) => !c[x]),
        lang,
      ).toEqual([]);
    }
  });

  it("is reached from the Governance group", () => {
    render(<SpeActPage />);
    const intro = screen.getByRole("heading", { level: 1 });
    expect(
      within(intro.parentElement!).getByText("SPE requirements"),
    ).toBeTruthy();
  });
});
