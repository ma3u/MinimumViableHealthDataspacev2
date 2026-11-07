/**
 * The start page's "Latest updates" and Klarbefund section follow the
 * language picker (#782, ADR-070): every entry's title and text is a key of
 * the home dictionary in every language, and dates are written the way the
 * picked language writes them.
 */
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { act, render, screen } from "@testing-library/react";
import {
  LATEST_UPDATES,
  LatestUpdates,
  isWordLabel,
} from "@/components/LatestUpdates";
import { KlarbefundShowcase } from "@/components/KlarbefundShowcase";
import { MESSAGES } from "@/messages";
import { setLanguage } from "@/lib/use-language";

const LANGS = ["en", "de", "fr", "nl", "es"] as const;

afterEach(() => {
  act(() => setLanguage("en"));
  localStorage.clear();
});

describe("the latest updates", () => {
  it("has every entry's title, text and word label in every language", () => {
    const texts = LATEST_UPDATES.flatMap((u) => [
      u.title,
      u.text,
      ...u.links.map((l) => l.label).filter(isWordLabel),
    ]);
    expect(texts.length).toBeGreaterThan(20);
    for (const lang of LANGS) {
      expect(
        texts.filter((x) => !MESSAGES[lang].home[x]),
        lang,
      ).toEqual([]);
    }
  });

  it("lists the newest first, with unique titles", () => {
    const dates = LATEST_UPDATES.map((u) => u.date);
    expect([...dates].sort().reverse()).toEqual(dates);
    const titles = LATEST_UPDATES.map((u) => u.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("leads with the EDC 1.0 migration and its tracking issue", () => {
    const [first] = LATEST_UPDATES;
    expect(first.title).toContain("EDC 1.0");
    expect(first.links.map((l) => l.label)).toContain("#881");
  });

  it("links every entry to its pull request, issue or decision", () => {
    for (const u of LATEST_UPDATES) {
      expect(u.links.length, u.title).toBeGreaterThan(0);
    }
    expect(isWordLabel("#819")).toBe(false);
    expect(isWordLabel("ADR-071")).toBe(false);
    expect(isWordLabel("The app")).toBe(true);
  });

  it("shows in English by default", () => {
    render(<LatestUpdates />);
    expect(
      screen.getByRole("heading", { name: "Latest updates" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("The hub and its documentation in five languages"),
    ).toBeInTheDocument();
  });

  it("shows in German, dates written the German way", () => {
    render(<LatestUpdates />);
    act(() => setLanguage("de"));
    expect(
      screen.getByRole("heading", { name: "Neuigkeiten" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Der Hub und seine Dokumentation in fünf Sprachen"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Latest updates")).toBeNull();
    const first = document.querySelector('time[datetime="2026-11-02"]');
    expect(first?.textContent).toBe("2. Nov. 2026");
  });
});

describe("the Klarbefund section of the start page", () => {
  it("has the tour's description in every language", () => {
    const src = readFileSync(
      path.resolve("src/components/KlarbefundShowcase.tsx"),
      "utf8",
    );
    const alt = /const TOUR_ALT =\s*"([^"]+)"/.exec(src)?.[1];
    expect(alt).toMatch(/^A tour through the Klarbefund app/);
    for (const lang of LANGS) {
      expect(MESSAGES[lang].home[alt!], lang).toBeTruthy();
    }
  });

  it("shows in Spanish, links and button included", () => {
    render(<KlarbefundShowcase />);
    act(() => setLanguage("es"));
    expect(
      screen.getByText(/Los espacios de datos de salud funcionan/),
    ).toBeInTheDocument();
    expect(screen.getByText("Política de privacidad")).toBeInTheDocument();
    expect(
      screen.getByText("Únase a la beta en TestFlight").closest("a"),
    ).toHaveAttribute("href", expect.stringContaining("testflight"));
    expect(screen.getByText("RGPD.").tagName).toBe("STRONG");
    expect(screen.queryByText(/Health dataspaces run/)).toBeNull();
  });
});
