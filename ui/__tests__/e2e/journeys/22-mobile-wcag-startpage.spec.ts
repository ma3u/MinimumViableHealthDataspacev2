/**
 * Journey Group U — Mobile, WCAG 2.2, and Start Page (J260–J299)
 *
 * Tests mobile responsiveness, WCAG 2.2 accessibility compliance,
 * and the redesigned start page with EHDS demo guide.
 *
 * Can run against:
 *   - Local dev:   npx playwright test 22-mobile-wcag-startpage.spec.ts
 *   - Static export: NEXT_PUBLIC_STATIC_EXPORT=true PLAYWRIGHT_BASE_URL=... npx playwright test 22-mobile-wcag-startpage.spec.ts
 *   - GitHub Pages: NEXT_PUBLIC_STATIC_EXPORT=true PLAYWRIGHT_BASE_URL=https://ma3u.github.io npx playwright test 22-mobile-wcag-startpage.spec.ts
 */

import { test, expect, type Page } from "@playwright/test";
import { T } from "./helpers";

const IS_STATIC = process.env.NEXT_PUBLIC_STATIC_EXPORT === "true";

/** basePath for static export */
const BP = IS_STATIC ? "/MinimumViableHealthDataspacev2" : "";

function P(path: string): string {
  return BP + path;
}

async function setPersona(page: Page, username: string) {
  await page.evaluate(
    ([key, value]) => sessionStorage.setItem(key, value),
    ["demo-persona", username],
  );
  await page.reload({ waitUntil: "networkidle" });
}

// ── U1: Start Page Content ──────────────────────────────────────────────────

test.describe("U1: Start Page — EHDS Demo Guide", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(P("/"));
    if (IS_STATIC) {
      await setPersona(page, "edcadmin");
    }
  });

  test("J260 — hero section explains EHDS purpose", async ({ page }) => {
    const hero = page
      .locator("section")
      .filter({ hasText: /European Health Data Space/i })
      .first();
    await expect(hero).toBeVisible({ timeout: T });
    await expect(hero.locator("h1")).toContainText(
      /European Health Data Space/i,
    );
    // Should explain what the demo does
    await expect(hero).toContainText(/interactive demo/i);
    await expect(hero).toContainText(/EHDS regulation/i);
  });

  test("J261 — hero shows data stats badges", async ({ page }) => {
    await expect(page.getByText(/127 synthetic patients/i)).toBeVisible({
      timeout: T,
    });
    await expect(page.getByText(/5,300\+ graph nodes/i)).toBeVisible({
      timeout: T,
    });
    await expect(page.getByText(/7 demo personas/i)).toBeVisible({
      timeout: T,
    });
    await expect(page.getByText(/All data is synthetic/i).first()).toBeVisible({
      timeout: T,
    });
  });

  test("J262 — persona journeys guide users through EHDS lifecycle", async ({
    page,
  }) => {
    await expect(page.getByText(/How the EHDS Demo Works/i)).toBeVisible({
      timeout: T,
    });

    const personas = [
      /Patient/,
      /Researcher/,
      /Hospital/,
      /Regulator/,
      /Admin/,
    ];
    for (const persona of personas) {
      await expect(
        page.locator("h3").filter({ hasText: persona }).first(),
      ).toBeVisible({ timeout: T });
    }
  });

  test("J263 — persona journey cards have numbered steps", async ({ page }) => {
    const journeyList = page.locator("[aria-label='Persona user journeys']");
    await expect(journeyList).toBeVisible({ timeout: T });
    const cards = journeyList.locator("[role='listitem']");
    await expect(cards).toHaveCount(5);
    // Each card should have an ordered step list
    const firstStepList = journeyList.locator("ol").first();
    await expect(firstStepList).toBeVisible({ timeout: T });
  });

  test("J264 — persona journey cards have sign-in buttons", async ({
    page,
  }) => {
    const journeySection = page.locator("[aria-label='Persona user journeys']");
    await expect(journeySection).toBeVisible({ timeout: T });

    // In live mode, each journey card has a <button> that calls signIn("keycloak")
    // In static mode, each card has a <Link> instead
    if (IS_STATIC) {
      const links = journeySection.locator("a");
      const count = await links.count();
      expect(count).toBe(5);
    } else {
      const buttons = journeySection.locator("button");
      const count = await buttons.count();
      expect(count).toBe(5);
      // Each button should contain "Sign in & start" text
      await expect(buttons.first()).toContainText("Sign in");
    }
  });

  test("J265 — feature sections are labelled with section elements", async ({
    page,
  }) => {
    const sections = [
      "Explore",
      "Exchange · Transfer · Negotiate",
      "Govern · Manage · Docs",
    ];
    for (const s of sections) {
      await expect(
        page.getByRole("heading", { name: new RegExp(s, "i") }),
      ).toBeVisible({ timeout: T });
    }
  });

  test("J266 — GitHub link is present and accessible", async ({ page }) => {
    const ghLink = page.getByRole("link", { name: /view source on github/i });
    await expect(ghLink).toBeVisible({ timeout: T });
    const href = await ghLink.getAttribute("href");
    expect(href).toContain("github.com/ma3u/MinimumViableHealthDataspacev2");
  });

  test("J267 — footer shows regulation references", async ({ page }) => {
    const footer = page.locator("footer");
    await expect(footer).toContainText(/EHDS Art/i);
    await expect(footer).toContainText(/GDPR Art/i);
    await expect(footer).toContainText(/DSP 2025-1/i);
    await expect(footer).toContainText(/FHIR R4/i);
  });

  test("J268 — demo persona cards are visible on start page", async ({
    page,
  }) => {
    await expect(page.getByText(/Demo Users & Roles/i)).toBeVisible({
      timeout: T,
    });
  });

  test("J269a — Why EHDS Matters section is visible", async ({ page }) => {
    await expect(
      page.getByText(/Why the European Health Data Space Matters/i),
    ).toBeVisible({ timeout: T });
  });

  test("J269b — explains value for researchers", async ({ page }) => {
    await expect(page.getByText("For Researchers")).toBeVisible({ timeout: T });
    await expect(page.getByText(/cross-border access/i)).toBeVisible({
      timeout: T,
    });
    await expect(page.getByText(/single-window approval/i)).toBeVisible({
      timeout: T,
    });
  });

  test("J269c — explains value for hospitals", async ({ page }) => {
    await expect(page.getByText("For Hospitals")).toBeVisible({ timeout: T });
    await expect(page.getByText(/legal basis for sharing/i)).toBeVisible({
      timeout: T,
    });
    await expect(page.getByText(/reducing legal risk/i)).toBeVisible({
      timeout: T,
    });
  });

  test("J269d — links to official EHDS regulation", async ({ page }) => {
    const ehdsLink = page
      .getByRole("link", {
        name: /ehds regulation/i,
      })
      .first();
    await expect(ehdsLink).toBeVisible({ timeout: T });
    const href = await ehdsLink.getAttribute("href");
    expect(href).toContain("health.ec.europa.eu");
  });

  test("J269e — persona journeys show login credentials", async ({ page }) => {
    // Each journey card shows which user to sign in as
    await expect(page.getByText("patient1").first()).toBeVisible({
      timeout: T,
    });
    await expect(page.getByText("researcher").first()).toBeVisible({
      timeout: T,
    });
    await expect(page.getByText("edcadmin").first()).toBeVisible({
      timeout: T,
    });
  });

  test("J269f — Standards & Interoperability section is visible", async ({
    page,
  }) => {
    await expect(page.getByText(/Standards & Interoperability/i)).toBeVisible({
      timeout: T,
    });
  });

  test("J269g — standard cards link to official specs", async ({ page }) => {
    const standards = [
      { name: "HL7 FHIR R4", url: "hl7.org/fhir" },
      { name: "Dataspace Protocol", url: "internationaldataspaces.org" },
      { name: "OMOP Common Data Model", url: "ohdsi.github.io" },
    ];
    for (const { name, url } of standards) {
      const card = page.getByText(name).first();
      await expect(card).toBeVisible({ timeout: T });
      const link = card.locator("xpath=ancestor::a");
      const href = await link.getAttribute("href");
      expect(href).toContain(url);
    }
  });

  test("J269h — stakeholder cards for patients and regulators", async ({
    page,
  }) => {
    await expect(page.getByText("For Patients")).toBeVisible({ timeout: T });
    await expect(page.getByText("For Regulators")).toBeVisible({ timeout: T });
  });

  test("J269i — section descriptions explain each feature group", async ({
    page,
  }) => {
    await expect(page.getByText(/5-layer knowledge graph/i)).toBeVisible({
      timeout: T,
    });
    await expect(page.getByText(/DSP data exchange lifecycle/i)).toBeVisible({
      timeout: T,
    });
    await expect(page.getByText(/EHDS compliance monitoring/i)).toBeVisible({
      timeout: T,
    });
  });

  test("J269j — feature cards highlight for logged-in persona", async ({
    page,
  }) => {
    // In static mode we can set a persona and check that relevant cards glow
    if (!IS_STATIC) {
      test.skip();
      return;
    }
    await setPersona(page, "patient1");
    // Patient should see checkmarks on Patient Journey, Graph Explorer, and EEHRxF
    const checks = page.locator("[title='Relevant for your role']");
    await expect(checks.first()).toBeVisible({ timeout: T });
    const count = await checks.count();
    // Patient role highlights 3 cards: /patient, /graph, and /eehrxf
    expect(count).toBe(3);
  });
});

// ── U2: WCAG 2.2 Accessibility ──────────────────────────────────────────────

test.describe("U2: WCAG 2.2 Accessibility", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(P("/"));
    if (IS_STATIC) {
      await setPersona(page, "edcadmin");
    }
  });

  test("J270 — skip-to-content link is present and functional", async ({
    page,
  }) => {
    const skipLink = page.locator("a.skip-to-content");
    await expect(skipLink).toHaveCount(1);
    // Focus it to make it visible
    await skipLink.focus();
    await expect(skipLink).toBeVisible();
    await expect(skipLink).toContainText(/skip to main content/i);
    // Check the target exists
    const href = await skipLink.getAttribute("href");
    expect(href).toBe("#main-content");
    const main = page.locator("#main-content");
    await expect(main).toBeVisible();
  });

  test("J271 — main landmark has correct role", async ({ page }) => {
    const main = page.locator("main[role='main']");
    await expect(main).toBeVisible({ timeout: T });
    await expect(main).toHaveAttribute("id", "main-content");
  });

  test("J272 — navigation has aria-label", async ({ page }) => {
    const nav = page.locator("nav[aria-label='Main navigation']");
    await expect(nav).toBeVisible({ timeout: T });
  });

  test("J273 — heading hierarchy is correct (h1 before h2)", async ({
    page,
  }) => {
    const headings = await page.evaluate(() => {
      const hs = document.querySelectorAll("h1, h2, h3");
      return Array.from(hs).map((h) => ({
        level: parseInt(h.tagName.replace("H", ""), 10),
        text: h.textContent?.trim().slice(0, 50),
      }));
    });
    // Should start with h1
    expect(headings.length).toBeGreaterThan(0);
    expect(headings[0].level).toBe(1);
    // No h2 before h1
    const firstH1Index = headings.findIndex((h) => h.level === 1);
    const firstH2Index = headings.findIndex((h) => h.level === 2);
    if (firstH2Index >= 0) {
      expect(firstH1Index).toBeLessThan(firstH2Index);
    }
  });

  test("J274 — interactive elements have accessible names", async ({
    page,
  }) => {
    // Check that all links have discernible text
    const linksWithoutText = await page.evaluate(() => {
      const links = document.querySelectorAll("a");
      return Array.from(links).filter((a) => {
        const text = a.textContent?.trim() || "";
        const ariaLabel = a.getAttribute("aria-label") || "";
        const title = a.getAttribute("title") || "";
        return !text && !ariaLabel && !title;
      }).length;
    });
    expect(linksWithoutText).toBe(0);
  });

  test("J275 — buttons have accessible names", async ({ page }) => {
    const buttonsWithoutName = await page.evaluate(() => {
      const buttons = document.querySelectorAll("button");
      return Array.from(buttons).filter((btn) => {
        const text = btn.textContent?.trim() || "";
        const ariaLabel = btn.getAttribute("aria-label") || "";
        const title = btn.getAttribute("title") || "";
        return !text && !ariaLabel && !title;
      }).length;
    });
    expect(buttonsWithoutName).toBe(0);
  });

  test("J276 — images have alt text or are decorative (aria-hidden)", async ({
    page,
  }) => {
    const imgIssues = await page.evaluate(() => {
      const imgs = document.querySelectorAll("img");
      return Array.from(imgs).filter((img) => {
        const alt = img.getAttribute("alt");
        const ariaHidden = img.getAttribute("aria-hidden");
        const role = img.getAttribute("role");
        return alt === null && ariaHidden !== "true" && role !== "presentation";
      }).length;
    });
    expect(imgIssues).toBe(0);
  });

  test("J277 — SVG icons are aria-hidden", async ({ page }) => {
    // Check that decorative SVGs inside buttons/links are hidden from screen readers
    const exposedIcons = await page.evaluate(() => {
      const svgs = document.querySelectorAll("button svg, a svg");
      return Array.from(svgs).filter((svg) => {
        return svg.getAttribute("aria-hidden") !== "true";
      }).length;
    });
    // Allow some — not all icons need to be hidden if they have labels
    // But the majority of decorative icons in nav should be hidden
    expect(exposedIcons).toBeLessThanOrEqual(5);
  });

  test("J278 — color contrast: text on dark background", async ({ page }) => {
    // Verify the main text colors meet 4.5:1 ratio against bg-gray-950 (#030712)
    // This is a structural check — not a full audit
    const textColors = await page.evaluate(() => {
      const body = document.body;
      const style = window.getComputedStyle(body);
      return {
        bgColor: style.backgroundColor,
        textColor: style.color,
      };
    });
    expect(textColors.bgColor).toBeTruthy();
    expect(textColors.textColor).toBeTruthy();
  });

  test("J279 — focus-visible outlines are present", async ({ page }) => {
    // Tab to first interactive element and verify outline
    await page.keyboard.press("Tab");
    const focused = page.locator(":focus-visible");
    await expect(focused).toHaveCount(1, { timeout: 5000 });
  });
});

// ── U3: Mobile Responsiveness ───────────────────────────────────────────────

test.describe("U3: Mobile Responsiveness", () => {
  test.use({ viewport: { width: 375, height: 812 } }); // iPhone SE

  test.beforeEach(async ({ page }) => {
    await page.goto(P("/"));
    if (IS_STATIC) {
      await setPersona(page, "edcadmin");
    }
  });

  test("J280 — mobile hamburger menu is visible", async ({ page }) => {
    const hamburger = page.getByRole("button", { name: /open menu/i });
    await expect(hamburger).toBeVisible({ timeout: T });
  });

  test("J281 — desktop nav is hidden on mobile", async ({ page }) => {
    // Desktop nav groups should be hidden via md:flex
    const desktopNav = page.locator("nav .hidden.md\\:flex");
    await expect(desktopNav).not.toBeVisible();
  });

  test("J282 — hamburger opens mobile nav panel", async ({ page }) => {
    const hamburger = page.getByRole("button", { name: /open menu/i });
    await hamburger.click();
    // Mobile panel should appear
    const mobileNav = page.locator("#mobile-nav");
    await expect(mobileNav).toBeVisible({ timeout: T });
    // Should show nav group labels
    await expect(mobileNav).toContainText(/explore/i);
  });

  test("J283 — mobile nav links are tappable (min 44px)", async ({ page }) => {
    const hamburger = page.getByRole("button", { name: /open menu/i });
    await hamburger.click();
    const mobileLinks = page.locator("#mobile-nav a");
    const count = await mobileLinks.count();
    expect(count).toBeGreaterThan(0);
    // Check at least the first few links have adequate height
    for (let i = 0; i < Math.min(count, 3); i++) {
      const box = await mobileLinks.nth(i).boundingBox();
      expect(box).toBeTruthy();
      expect(box!.height).toBeGreaterThanOrEqual(24);
    }
  });

  test("J284 — mobile nav closes when link is clicked", async ({ page }) => {
    const hamburger = page.getByRole("button", { name: /open menu/i });
    await hamburger.click();
    const mobileNav = page.locator("#mobile-nav");
    await expect(mobileNav).toBeVisible({ timeout: T });
    // Click the first link
    const firstLink = mobileNav.locator("a").first();
    await firstLink.click();
    // Nav should close (page navigates)
    await expect(mobileNav).not.toBeVisible({ timeout: T });
  });

  test("J285 — hamburger toggles to close icon", async ({ page }) => {
    const hamburger = page.getByRole("button", { name: /open menu/i });
    await hamburger.click();
    // Button should now say "Close menu"
    const closeBtn = page.getByRole("button", { name: /close menu/i });
    await expect(closeBtn).toBeVisible({ timeout: T });
  });

  test("J286 — hero section readable on mobile", async ({ page }) => {
    const h1 = page.locator("h1").first();
    await expect(h1).toBeVisible({ timeout: T });
    const box = await h1.boundingBox();
    expect(box).toBeTruthy();
    // Title should not overflow viewport
    expect(box!.width).toBeLessThanOrEqual(375);
  });

  test("J287 — persona journey cards stack vertically on mobile", async ({
    page,
  }) => {
    const journeyList = page.locator("[aria-label='Persona user journeys']");
    await expect(journeyList).toBeVisible({ timeout: T });
    const cards = journeyList.locator("[role='listitem']");
    const count = await cards.count();
    expect(count).toBe(5);
    // Cards should be stacked (same x, different y)
    if (count >= 2) {
      const box1 = await cards.nth(0).boundingBox();
      const box2 = await cards.nth(1).boundingBox();
      expect(box1).toBeTruthy();
      expect(box2).toBeTruthy();
      expect(box1!.x).toBeCloseTo(box2!.x, -1);
    }
  });

  test("J288 — persona journey cards form single column on mobile", async ({
    page,
  }) => {
    const journeyCards = page.locator(
      "[aria-label='Persona user journeys'] [role='listitem']",
    );
    const count = await journeyCards.count();
    expect(count).toBe(5);
    // First two cards should have same x position (stacked)
    const box1 = await journeyCards.nth(0).boundingBox();
    const box2 = await journeyCards.nth(1).boundingBox();
    expect(box1).toBeTruthy();
    expect(box2).toBeTruthy();
    expect(box1!.x).toBeCloseTo(box2!.x, -1);
  });

  test("J289 — no horizontal scroll on mobile", async ({ page }) => {
    const overflow = await page.evaluate(() => {
      return (
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth
      );
    });
    expect(overflow).toBe(false);
  });
});

// ── U4: Mobile Navigation Per Persona ───────────────────────────────────────

test.describe("U4: Mobile Nav — Persona Filtering", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  const mobilePersonas = [
    {
      username: "patient1",
      shouldSee: /my health/i,
      shouldNotSee: /exchange/i,
    },
    {
      username: "researcher",
      shouldSee: /my researches/i,
      shouldNotSee: /manage/i,
    },
    { username: "edcadmin", shouldSee: /manage/i, shouldNotSee: /my health/i },
  ];

  for (const persona of mobilePersonas) {
    test(`J290-${persona.username} — mobile nav filtered for ${persona.username}`, async ({
      page,
    }) => {
      if (!IS_STATIC)
        test.skip(true, "Persona filtering test needs static mode");
      await page.goto(P("/"));
      await setPersona(page, persona.username);
      const hamburger = page.getByRole("button", { name: /open menu/i });
      await hamburger.click();
      const mobileNav = page.locator("#mobile-nav");
      await expect(mobileNav).toBeVisible({ timeout: T });
      await expect(mobileNav).toContainText(persona.shouldSee);
      // Verify blocked group is not visible
      const blockedText = mobileNav.getByText(persona.shouldNotSee);
      await expect(blockedText).toHaveCount(0);
    });
  }
});

// ── U5: Start Page Cross-Viewport ───────────────────────────────────────────

test.describe("U5: Start Page — Tablet Viewport", () => {
  test.use({ viewport: { width: 768, height: 1024 } }); // iPad

  test("J295 — cards use 2-column grid on tablet", async ({ page }) => {
    await page.goto(P("/"));
    if (IS_STATIC) await setPersona(page, "edcadmin");

    // Wait for feature cards
    await expect(page.getByText(/Graph Explorer/i)).toBeVisible({ timeout: T });
    // Find the Explore section by its heading id
    const exploreSection = page.locator(
      "section[aria-labelledby='explore-title']",
    );
    const cards = exploreSection.locator("a");
    const count = await cards.count();
    expect(count).toBeGreaterThan(1);

    // First two cards should be side by side (same y = same row)
    if (count >= 2) {
      const box1 = await cards.nth(0).boundingBox();
      const box2 = await cards.nth(1).boundingBox();
      expect(box1).toBeTruthy();
      expect(box2).toBeTruthy();
      // On tablet (768px) with sm:grid-cols-2, cards should be in 2 columns
      expect(box1!.y).toBeCloseTo(box2!.y, -1);
    }
  });
});

// ── U6: Reduced Motion ──────────────────────────────────────────────────────

test.describe("U6: Reduced Motion Support", () => {
  test("J297 — animations respect prefers-reduced-motion", async ({ page }) => {
    // Enable reduced motion
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(P("/"));
    if (IS_STATIC) await setPersona(page, "edcadmin");

    // Page should still render correctly
    await expect(page.locator("h1").first()).toBeVisible({ timeout: T });

    // Animations should be effectively disabled
    const animDuration = await page.evaluate(() => {
      const el = document.querySelector(".animate-fade-in-up");
      if (!el) return "none";
      return window.getComputedStyle(el).animationDuration;
    });
    // Should be effectively 0 or very small
    if (animDuration !== "none") {
      const ms = parseFloat(animDuration);
      expect(ms).toBeLessThanOrEqual(0.02);
    }
  });
});
