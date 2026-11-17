/**
 * The two journeys of the HL7 showcase deck on the start page: the person's
 * (primary use) and the researcher's (secondary use). Every text is in every
 * language, every box with a page points at a page that exists, the boxes
 * open this site or the other one, and the tabs switch the drawing.
 */
import { afterEach, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import {
  DEMO_SITES,
  JourneyFlows,
  STATUS_MARK,
  nodeTarget,
} from "@/components/JourneyFlows";
import { findDoc } from "@/lib/docs/published-docs";
import {
  JOURNEY_FLOWS,
  arrowHead,
  flowDuration,
  flowTexts,
  pathOf,
} from "@/lib/journey-flows";
import { MESSAGES } from "@/messages";
import { setLanguage } from "@/lib/use-language";

const LANGS = ["en", "de", "fr", "nl", "es"] as const;

afterEach(() => {
  act(() => setLanguage("en"));
  localStorage.clear();
});

describe("the journey data", () => {
  it("has the deck's two flows: ten steps for the person, twelve for the researcher", () => {
    expect(JOURNEY_FLOWS.map((f) => f.id)).toEqual(["primary", "secondary"]);
    expect(JOURNEY_FLOWS[0].nodes).toHaveLength(10);
    expect(JOURNEY_FLOWS[1].nodes).toHaveLength(12);
    for (const f of JOURNEY_FLOWS) expect(f.lanes).toHaveLength(5);
  });

  it("has every text in every language", () => {
    const texts = JOURNEY_FLOWS.flatMap(flowTexts);
    expect(texts.length).toBeGreaterThan(80);
    for (const lang of LANGS) {
      expect(
        texts.filter((x) => !MESSAGES[lang].home[x]),
        lang,
      ).toEqual([]);
    }
  });

  it("links every box to a page of the demo that exists, or to the app's section", () => {
    const hrefs = JOURNEY_FLOWS.flatMap((f) =>
      f.nodes.flatMap((n) => (n.href ? [n.href] : [])),
    );
    for (const href of hrefs) {
      if (href.startsWith("#")) {
        expect(href).toBe("#klarbefund-title");
        continue;
      }
      expect(
        existsSync(path.resolve("src/app", `.${href}`, "page.tsx")),
        href,
      ).toBe(true);
    }
  });

  it("gives every step but the paper result a status, and each journey its page", () => {
    for (const f of JOURNEY_FLOWS) {
      const unrated = f.nodes.filter((n) => !n.status).map((n) => n.title);
      expect(unrated, f.id).toEqual(
        f.id === "primary" ? ["Result on paper"] : [],
      );
      expect(f.details).toMatch(/^\/docs\/ehds\//);
      const slug = f.details.split("/").pop() ?? "";
      const doc = findDoc("ehds", slug);
      expect(doc, f.details).toBeDefined();
      // The page rates the steps with the words the legend uses.
      for (const s of new Set(
        f.nodes.flatMap((n) => (n.status ? [n.status] : [])),
      )) {
        expect(doc?.markdown, `${f.id} ${s}`).toContain(
          `**${STATUS_MARK[s].label}**`,
        );
      }
    }
    for (const lang of LANGS) {
      const home = MESSAGES[lang].home;
      for (const key of [
        ...Object.values(STATUS_MARK).map((m) => m.label),
        "Status of each step:",
        "Step by step: what is implemented and what is planned",
      ]) {
        expect(home[key], `${lang}: ${key}`).toBeTruthy();
      }
    }
  });

  it("keeps every box inside the drawing and in its lane", () => {
    for (const f of JOURNEY_FLOWS) {
      for (const n of f.nodes) {
        expect(n.x + 210, n.title).toBeLessThanOrEqual(1600);
        const laneTop = 20 + n.lane * 124;
        expect(n.y, n.title).toBeGreaterThanOrEqual(laneTop);
        expect(n.y + 66, n.title).toBeLessThanOrEqual(laneTop + 116);
      }
    }
  });

  it("draws a polyline and puts the arrowhead on its last segment", () => {
    const pts = [
      [10, 20],
      [10, 80],
      [50, 80],
    ] as const;
    expect(pathOf(pts)).toBe("M10,20 L10,80 L50,80");
    expect(arrowHead(pts)).toEqual({ x: 50, y: 80, angle: 0 });
    expect(
      arrowHead([
        [0, 100],
        [0, 10],
      ]).angle,
    ).toBe(-90);
  });

  it("is drawn within five seconds", () => {
    for (const f of JOURNEY_FLOWS) {
      expect(flowDuration(f)).toBeLessThanOrEqual(5.5);
    }
  });
});

describe("where a box leads", () => {
  it("stays on this site when the switch names it, and opens the other one in full", () => {
    // Vitest runs the hub build, so this site is the live one.
    expect(nodeTarget("/analytics", "live")).toEqual({
      href: "/analytics",
      external: false,
    });
    expect(nodeTarget("/analytics", "static")).toEqual({
      href: `${DEMO_SITES.static}/analytics`,
      external: true,
    });
    expect(nodeTarget("#klarbefund-title", "static")).toEqual({
      href: "#klarbefund-title",
      external: false,
    });
  });
});

describe("JourneyFlows", () => {
  it("shows the person's journey first, with its boxes as links", () => {
    render(<JourneyFlows />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual([
      "Primary use: the person",
      "Secondary use: the researcher",
    ]);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    const svg = screen.getByTestId("journey-flow-primary");
    expect(within(svg).getAllByTestId("journey-flow-step")).toHaveLength(10);
    const consent = within(svg).getByRole("link", {
      name: /8 · Consent or opt out/,
    });
    expect(consent).toHaveAttribute("href", "/patient/research");
    expect(consent).not.toHaveAttribute("target");
  });

  it("switches to the researcher's journey by click and by arrow key", () => {
    render(<JourneyFlows />);
    const [first, second] = screen.getAllByRole("tab");
    fireEvent.click(second);
    expect(second).toHaveAttribute("aria-selected", "true");
    const svg = screen.getByTestId("journey-flow-secondary");
    expect(
      within(svg).getByRole("link", { name: /4b · Approve data permit/ }),
    ).toHaveAttribute("href", "/compliance");
    fireEvent.keyDown(second, { key: "ArrowRight" });
    expect(first).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("journey-flow-primary")).toBeInTheDocument();
  });

  it("opens the boxes on the static demo, in a new tab, when the switch says so", () => {
    render(<JourneyFlows />);
    fireEvent.click(screen.getByTestId("journey-site-static"));
    expect(screen.getByTestId("journey-site-static")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    const insights = screen.getByRole("link", { name: /10 · What came back/ });
    expect(insights).toHaveAttribute(
      "href",
      `${DEMO_SITES.static}/patient/insights`,
    );
    expect(insights).toHaveAttribute("target", "_blank");
    // The Klarbefund boxes still lead down this page.
    expect(
      screen.getByRole("link", { name: /2 · Scan or import/ }),
    ).toHaveAttribute("href", "#klarbefund-title");
  });

  it("links each journey to its slide in the HL7 deck", () => {
    render(<JourneyFlows />);
    expect(
      screen.getByRole("link", { name: /In the HL7 showcase deck/ }),
    ).toHaveAttribute("href", "/presentations/hl7-showcase-2026/index.html#/2");
    fireEvent.click(screen.getAllByRole("tab")[1]);
    expect(
      screen.getByRole("link", { name: /In the HL7 showcase deck/ }),
    ).toHaveAttribute("href", "/presentations/hl7-showcase-2026/index.html#/4");
  });

  it("says each step's status in its name and links the journey's page", () => {
    render(<JourneyFlows />);
    expect(
      screen.getByRole("link", { name: /7 · Sign in with d-you.*\(Partial\)/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: /8 · Consent or opt out.*\(Implemented\)/,
      }),
    ).toBeInTheDocument();
    const legend = screen.getByTestId("journey-status-legend");
    expect(legend).toHaveTextContent(/Implemented.*Partial.*Planned/);
    expect(screen.getByTestId("journey-details")).toHaveAttribute(
      "href",
      "/docs/ehds/person-journey",
    );
    expect(screen.getByTestId("journey-fullscreen")).toHaveAttribute(
      "href",
      "/journeys?flow=primary",
    );
    fireEvent.click(screen.getAllByRole("tab")[1]);
    expect(screen.getByTestId("journey-details")).toHaveAttribute(
      "href",
      "/docs/ehds/researcher-journey",
    );
    expect(screen.getByTestId("journey-fullscreen")).toHaveAttribute(
      "href",
      "/journeys?flow=secondary",
    );
  });

  it("starts drawing when it is on screen, and draws again on Replay", () => {
    render(<JourneyFlows />);
    // jsdom has no IntersectionObserver: the drawing plays at once.
    const svg = () => screen.getByTestId("journey-flow-primary");
    expect(svg()).toHaveClass("is-playing");
    const before = svg();
    fireEvent.click(screen.getByTestId("journey-replay"));
    expect(svg()).not.toBe(before);
    expect(svg()).toHaveClass("is-playing");
  });

  it("speaks the picked language", () => {
    act(() => setLanguage("de"));
    render(<JourneyFlows />);
    expect(
      screen.getByRole("heading", { name: "Zwei Wege durch einen Datenraum" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /8 · Einwilligen oder widersprechen/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("Studienzentrum")).toBeInTheDocument();
  });
});
