/**
 * The full-screen journeys page (/journeys): every box has its description,
 * articles and user, in every language; each step links its page on the
 * static demo (as the user it names) and on the live app; the address keeps
 * the step; a box, the arrow keys and the tabs move through the steps.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import {
  JourneysFullscreen,
  placeFromUrl,
  siteUrl,
  stepKey,
} from "@/components/JourneysFullscreen";
import { DEMO_SITES } from "@/components/JourneyFlows";
import { JOURNEY_FLOWS } from "@/lib/journey-flows";
import {
  KLARBEFUND_GUIDE,
  SIGN_IN_LABEL,
  stepInfo,
  stepPage,
  stepTexts,
} from "@/lib/journey-steps";
import { MESSAGES } from "@/messages";
import { setLanguage } from "@/lib/use-language";

const LANGS = ["en", "de", "fr", "nl", "es"] as const;

afterEach(() => {
  act(() => setLanguage("en"));
  window.history.replaceState(null, "", "/");
});

describe("the step data", () => {
  it("describes every box of both journeys", () => {
    for (const f of JOURNEY_FLOWS) {
      const missing = f.nodes
        .filter((n) => !stepInfo(f.id, n))
        .map((n) => n.title);
      expect(missing, f.id).toEqual([]);
    }
  });

  it("has every text in every language", () => {
    const texts = [
      ...stepTexts(),
      ...Object.values(SIGN_IN_LABEL),
      "Step {n} of {m}",
      "Sign in as",
      "Open in the static demo",
      "Open in the live app",
      "Full screen",
      "Exit full screen",
      "Previous step",
      "Next step",
      "Full screen, every step described",
    ];
    for (const lang of LANGS) {
      expect(
        texts.filter((x) => !MESSAGES[lang].home[x]),
        lang,
      ).toEqual([]);
    }
  });

  it("links pages that exist, the app's guide for the Klarbefund steps", () => {
    for (const f of JOURNEY_FLOWS) {
      for (const n of f.nodes) {
        const pages = [stepPage(n), stepInfo(f.id, n)?.extra?.href].filter(
          (p): p is string => Boolean(p),
        );
        for (const p of pages) {
          if (p === KLARBEFUND_GUIDE) continue;
          expect(
            existsSync(path.resolve("src/app", `.${p}`, "page.tsx")),
            `${n.title}: ${p}`,
          ).toBe(true);
        }
      }
    }
    const scan = JOURNEY_FLOWS[0].nodes.find(
      (n) => n.title === "Scan or import",
    )!;
    expect(stepPage(scan)).toBe(KLARBEFUND_GUIDE);
  });

  it("names every step in the address uniquely and finds it again", () => {
    for (const f of JOURNEY_FLOWS) {
      const keys = f.nodes.map(stepKey);
      expect(new Set(keys).size, f.id).toBe(keys.length);
      f.nodes.forEach((n, i) => {
        expect(placeFromUrl(`?flow=${f.id}&step=${stepKey(n)}`)).toEqual({
          flow: f.id,
          index: i,
        });
      });
    }
    expect(stepKey(JOURNEY_FLOWS[1].nodes.find((n) => !n.step)!)).toBe(
      "provision-spe",
    );
    expect(placeFromUrl("?step=nope")).toEqual({ flow: "primary", index: 0 });
  });

  it("opens the static demo as the step's user, and the live app as it is", () => {
    expect(siteUrl("static", "/compliance", "regulator")).toBe(
      `${DEMO_SITES.static}/compliance?persona=regulator`,
    );
    expect(siteUrl("live", "/compliance", "regulator")).toBe(
      `${DEMO_SITES.live}/compliance`,
    );
    expect(siteUrl("static", "/auth/eudi-qr", "wallet")).toBe(
      `${DEMO_SITES.static}/auth/eudi-qr`,
    );
    expect(siteUrl("static", "/docs/x#part", "researcher")).toBe(
      `${DEMO_SITES.static}/docs/x?persona=researcher#part`,
    );
  });
});

describe("JourneysFullscreen", () => {
  it("starts on the person's first step and describes it", () => {
    render(<JourneysFullscreen />);
    const panel = screen.getByTestId("journey-step-panel");
    expect(within(panel).getByRole("heading", { level: 2 })).toHaveTextContent(
      "1 · Result on paper",
    );
    expect(panel).toHaveTextContent(/Step 1 of 10/);
    expect(screen.getByTestId("journey-step-signin")).toHaveTextContent(
      "No sign-in",
    );
  });

  it("picks a box, walks on with the arrow keys, and keeps the step in the address", () => {
    render(<JourneysFullscreen />);
    const svg = screen.getByTestId("journey-flow-primary");
    fireEvent.click(
      within(svg).getByRole("button", { name: /8 · Consent or opt out/ }),
    );
    const heading = () =>
      within(screen.getByTestId("journey-step-panel")).getByRole("heading", {
        level: 2,
      });
    expect(heading()).toHaveTextContent("8 · Consent or opt out");
    expect(screen.getByTestId("journey-step-status")).toHaveTextContent(
      "Implemented",
    );
    expect(screen.getByTestId("journey-open-static")).toHaveAttribute(
      "href",
      `${DEMO_SITES.static}/patient/research?persona=patient1`,
    );
    expect(screen.getByTestId("journey-open-live")).toHaveAttribute(
      "href",
      `${DEMO_SITES.live}/patient/research`,
    );
    expect(window.location.search).toBe("?flow=primary&step=8");
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(heading()).toHaveTextContent("9 · My EHDS record");
    fireEvent.click(screen.getByTestId("journeys-prev"));
    expect(heading()).toHaveTextContent("8 · Consent or opt out");
  });

  it("switches to the researcher's journey and shows a step's second page", () => {
    render(<JourneysFullscreen />);
    fireEvent.click(screen.getByTestId("journeys-tab-secondary"));
    const svg = screen.getByTestId("journey-flow-secondary");
    fireEvent.click(
      within(svg).getByRole("button", { name: /^Provision SPE/ }),
    );
    expect(window.location.search).toBe("?flow=secondary&step=provision-spe");
    const panel = screen.getByTestId("journey-step-panel");
    expect(panel).toHaveTextContent("SPE attestation");
    const statics = within(panel).getAllByTestId("journey-open-static");
    expect(statics[1]).toHaveAttribute(
      "href",
      `${DEMO_SITES.static}/admin/attestation?persona=edcadmin`,
    );
  });

  it("opens on the step the address names", () => {
    window.history.replaceState(null, "", "/journeys?flow=secondary&step=4b");
    render(<JourneysFullscreen />);
    expect(screen.getByTestId("journeys-tab-secondary")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByTestId("journey-step-panel")).toHaveTextContent(
      "4b · Approve data permit",
    );
  });

  it("speaks the picked language", () => {
    act(() => setLanguage("de"));
    render(<JourneysFullscreen />);
    expect(screen.getByTestId("journey-step-signin")).toHaveTextContent(
      "Keine Anmeldung",
    );
    expect(screen.getByTestId("journey-open-static")).toHaveTextContent(
      "In der statischen Demo öffnen",
    );
  });
});

describe("the static demo's ?persona=", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    sessionStorage.clear();
    localStorage.clear();
  });

  it("opens as a known demo user and ignores anything else", async () => {
    vi.stubEnv("NEXT_PUBLIC_STATIC_EXPORT", "true");
    vi.resetModules();
    const { useDemoPersona } = await import("@/lib/use-demo-persona");
    function Who() {
      return <p data-testid="who">{useDemoPersona()?.username ?? "none"}</p>;
    }
    window.history.replaceState(null, "", "/compliance?persona=regulator");
    const first = render(<Who />);
    expect(screen.getByTestId("who")).toHaveTextContent("regulator");
    first.unmount();
    window.history.replaceState(null, "", "/compliance?persona=mallory");
    render(<Who />);
    expect(screen.getByTestId("who")).toHaveTextContent("regulator");
  });
});
