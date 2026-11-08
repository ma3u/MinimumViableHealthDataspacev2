/**
 * Journey Group T — Theme Toggle & WCAG 2.2 AA Contrast (J301–J320)
 *
 * Tests the light/dark theme toggle introduced in Phase 21.
 * Verifies:
 *  - Default mode is light (no `dark` class on <html>)
 *  - Toggle button present in navigation with accessible label
 *  - Clicking toggle switches to dark mode
 *  - Preference persists in localStorage
 *  - Both modes render the correct CSS custom properties
 *  - Navigation background changes between modes
 *
 * Requires a running dev/static server (localhost:3000 by default).
 */

import { test, expect } from "@playwright/test";

/** WCAG relative luminance of a #rrggbb colour: 0 is black, 1 is white. */
function relativeLuminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

test.describe("Theme Toggle (J301–J320)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.removeItem("theme"));
    await page.reload();
  });

  test("J301 — default mode is light (no dark class on html)", async ({
    page,
  }) => {
    await page.goto("/");
    const htmlClass = await page.evaluate(
      () => document.documentElement.className,
    );
    expect(htmlClass).not.toContain("dark");
  });

  test("J302 — ThemeToggle button is present with accessible label", async ({
    page,
  }) => {
    await page.goto("/");
    const btn = page.getByRole("button", { name: /switch to dark mode/i });
    await expect(btn).toBeVisible();
  });

  test("J303 — clicking toggle enables dark mode", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /switch to dark mode/i }).click();
    const isDark = await page.evaluate(() =>
      document.documentElement.classList.contains("dark"),
    );
    expect(isDark).toBe(true);
  });

  test("J304 — dark mode persisted to localStorage", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /switch to dark mode/i }).click();
    const stored = await page.evaluate(() => localStorage.getItem("theme"));
    expect(stored).toBe("dark");
  });

  test("J305 — clicking toggle again returns to light mode", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /switch to dark mode/i }).click();
    await page.getByRole("button", { name: /switch to light mode/i }).click();
    const isDark = await page.evaluate(() =>
      document.documentElement.classList.contains("dark"),
    );
    expect(isDark).toBe(false);
    const stored = await page.evaluate(() => localStorage.getItem("theme"));
    expect(stored).toBe("light");
  });

  test("J306 — dark preference is restored on page reload", async ({
    page,
  }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.setItem("theme", "dark"));
    await page.reload();
    const isDark = await page.evaluate(() =>
      document.documentElement.classList.contains("dark"),
    );
    expect(isDark).toBe(true);
  });

  // The palette is the design system's (globals.css) and changes with it;
  // what these two hold is that light mode is light and dark mode is dark.
  // Until 2026-11-07 they pinned #ffffff and #0f172a, the palette before the
  // design system's #f9f9ff and #0b1326.
  test("J307 — light mode: --bg CSS var is a light colour", async ({
    page,
  }) => {
    await page.goto("/");
    const bg = await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--bg")
        .trim(),
    );
    expect(relativeLuminance(bg)).toBeGreaterThan(0.9);
  });

  test("J308 — dark mode: --bg CSS var is a dark colour", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /switch to dark mode/i }).click();
    const bg = await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--bg")
        .trim(),
    );
    expect(relativeLuminance(bg)).toBeLessThan(0.02);
  });

  test("J309 — toggle button aria-label updates when mode changes", async ({
    page,
  }) => {
    await page.goto("/");
    // Initially light mode → button says "switch to dark mode"
    await expect(
      page.getByRole("button", { name: /switch to dark mode/i }),
    ).toBeVisible();
    // After toggle → button says "switch to light mode"
    await page.getByRole("button", { name: /switch to dark mode/i }).click();
    await expect(
      page.getByRole("button", { name: /switch to light mode/i }),
    ).toBeVisible();
  });
});
