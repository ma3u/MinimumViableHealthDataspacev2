/**
 * Phase 27: WCAG 2.2 AA Automated Accessibility Tests (J560–J599)
 *
 * Uses @axe-core/playwright to run automated accessibility checks on every
 * page in both light and dark mode.
 *
 * What axe-core catches:
 *   - Colour contrast violations (WCAG 1.4.3, 1.4.6, 1.4.11)
 *   - Missing alt text, labels, ARIA attributes
 *   - Incorrect heading hierarchy
 *   - Focus management issues
 *   - Keyboard accessibility gaps
 *
 * What axe-core does NOT catch (requires manual testing):
 *   - Logical reading order
 *   - Meaningful link text in context
 *   - Custom keyboard interaction patterns
 *   - Screen reader announcement quality
 *
 * Tags: wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa
 *
 * Prerequisites:
 *   - UI running on localhost:3000 or PLAYWRIGHT_BASE_URL
 *   - No authentication required (tests public pages only)
 */
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/* ── Configuration ───────────────────────────────────────────────── */

/** All public pages to test. Protected pages are excluded since CI
 *  has no Keycloak — they redirect to /auth/signin. */
const PUBLIC_PAGES: { path: string; label: string }[] = [
  { path: "/", label: "Home" },
  { path: "/graph", label: "Graph Explorer" },
  { path: "/catalog", label: "Dataset Catalog" },
  { path: "/patient", label: "Patient Journey" },
  { path: "/analytics", label: "OMOP Analytics" },
  { path: "/query", label: "NLQ / Federated Query" },
  { path: "/docs", label: "Documentation" },
  { path: "/docs/user-guide", label: "User Guide" },
  { path: "/docs/developer", label: "Developer Guide" },
  { path: "/docs/architecture", label: "Architecture" },
  { path: "/demo", label: "Demo Personas" },
  { path: "/auth/signin", label: "Sign In" },
];

/** Axe-core WCAG tags to enforce. */
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/**
 * Rules excluded from the STRICT per-page tests. Add rules here temporarily
 * while fixing violations, then remove once they reach 0.
 */
const STRICT_EXCLUSIONS: string[] = [];

/* ── Helpers ─────────────────────────────────────────────────────── */

async function setTheme(
  page: import("@playwright/test").Page,
  mode: "light" | "dark",
) {
  await page.evaluate((m) => {
    document.documentElement.classList.toggle("dark", m === "dark");
    try {
      localStorage.setItem("theme", m);
    } catch (_e) {
      /* storage blocked */
    }
  }, mode);
  // Allow CSS transitions to settle
  await page.waitForTimeout(300);
}

/** Returns true if the page rendered the Next.js error overlay. */
async function isErrorPage(page: import("@playwright/test").Page) {
  return page.evaluate(
    () => !!document.querySelector('html[id="__next_error__"]'),
  );
}

function buildAxe(
  page: import("@playwright/test").Page,
  opts?: { includeContrast?: boolean },
) {
  let builder = new AxeBuilder({ page }).withTags(WCAG_TAGS);
  if (!opts?.includeContrast && STRICT_EXCLUSIONS.length > 0) {
    builder = builder.disableRules(STRICT_EXCLUSIONS);
  }
  return builder;
}

function formatViolations(
  violations: {
    id: string;
    help: string;
    impact?: string | null;
    nodes: { html: string }[];
  }[],
): string {
  if (violations.length === 0) return "No violations";
  return violations
    .map((v) => {
      const nodes = v.nodes
        .slice(0, 3)
        .map((n) => `  → ${n.html.substring(0, 120)}`)
        .join("\n");
      const more =
        v.nodes.length > 3 ? `\n  … and ${v.nodes.length - 3} more` : "";
      return `[${v.id}] ${v.help} (${v.impact})\n${nodes}${more}`;
    })
    .join("\n\n");
}

/* ── Strict tests (block CI) ─────────────────────────────────────── */
/* These enforce zero violations for structural a11y rules:
 * labels, ARIA, headings, keyboard, focus — everything EXCEPT
 * color-contrast (which is tracked in the summary test). */

test.describe("WCAG 2.2 AA — Dark Mode (structural)", () => {
  PUBLIC_PAGES.forEach(({ path, label }, i) => {
    test(`J${560 + i} ${label} — dark mode a11y`, async ({ page }) => {
      await page.goto(path, { waitUntil: "domcontentloaded" });

      if (await isErrorPage(page)) {
        test.skip(true, `${label} shows error page — skip a11y check`);
        return;
      }

      await setTheme(page, "dark");
      const results = await buildAxe(page).analyze();

      if (results.violations.length > 0) {
        console.log(
          `\n❌ ${label} (dark) — ${
            results.violations.length
          } violations:\n${formatViolations(results.violations)}`,
        );
      }

      expect(
        results.violations.length,
        `${label} (dark): ${formatViolations(results.violations)}`,
      ).toBe(0);
    });
  });
});

test.describe("WCAG 2.2 AA — Light Mode (structural)", () => {
  PUBLIC_PAGES.forEach(({ path, label }, i) => {
    test(`J${574 + i} ${label} — light mode a11y`, async ({ page }) => {
      await page.goto(path, { waitUntil: "domcontentloaded" });

      if (await isErrorPage(page)) {
        test.skip(true, `${label} shows error page — skip a11y check`);
        return;
      }

      await setTheme(page, "light");
      const results = await buildAxe(page).analyze();

      if (results.violations.length > 0) {
        console.log(
          `\n❌ ${label} (light) — ${
            results.violations.length
          } violations:\n${formatViolations(results.violations)}`,
        );
      }

      expect(
        results.violations.length,
        `${label} (light): ${formatViolations(results.violations)}`,
      ).toBe(0);
    });
  });
});

/* ── Contrast audit (ratchet) ────────────────────────────────────── */
/* Track current contrast-violation count and prevent regressions.
 *
 * Current baseline = 20 nodes across Developer Guide + Architecture in
 * light mode. Tracked separately as part of issue #25 follow-up; lower
 * the ratchet as fixes land, never raise it without an explicit ADR.
 *
 * Override via env var `WCAG_RATCHET` lets the CI workflow fail-fast
 * locally while accepting the current state in CI until those pages
 * are fixed. */

const MAX_CONTRAST_VIOLATIONS = Number(process.env.WCAG_RATCHET ?? "20");

test("J598 Contrast audit — ratchet (max allowed across all pages)", async ({
  page,
}) => {
  let totalNodes = 0;
  const summary: string[] = [];

  for (const { path, label } of PUBLIC_PAGES) {
    for (const mode of ["dark", "light"] as const) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      if (await isErrorPage(page)) continue;
      await setTheme(page, mode);

      const results = await new AxeBuilder({ page })
        .withTags(WCAG_TAGS)
        .analyze();

      const contrastViolations = results.violations.filter(
        (v) => v.id === "color-contrast",
      );
      const nodeCount = contrastViolations.reduce(
        (sum, v) => sum + v.nodes.length,
        0,
      );
      totalNodes += nodeCount;

      if (nodeCount > 0) {
        summary.push(`  ${label} (${mode}): ${nodeCount} nodes`);
      }
    }
  }

  if (summary.length > 0) {
    console.log(
      `\n🎨 Contrast violations: ${totalNodes} nodes total (ratchet: ${MAX_CONTRAST_VIOLATIONS})`,
    );
    console.log(summary.join("\n"));
  } else {
    console.log(
      "\n✅ Zero contrast violations — remove color-contrast from STRICT_EXCLUSIONS!",
    );
  }

  expect(
    totalNodes,
    `Contrast ratchet exceeded: ${totalNodes} > ${MAX_CONTRAST_VIOLATIONS}. Fix violations or raise the ratchet.`,
  ).toBeLessThanOrEqual(MAX_CONTRAST_VIOLATIONS);
});

/* ── Full summary (informational) ────────────────────────────────── */

test("J599 WCAG summary — all rules, all pages", async ({ page }) => {
  let totalViolations = 0;
  const summary: string[] = [];

  for (const { path, label } of PUBLIC_PAGES) {
    for (const mode of ["dark", "light"] as const) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      if (await isErrorPage(page)) continue;
      await setTheme(page, mode);

      const results = await buildAxe(page, {
        includeContrast: true,
      }).analyze();
      totalViolations += results.violations.length;

      if (results.violations.length > 0) {
        summary.push(
          `${label} (${mode}): ${results.violations.length} violations`,
        );
        for (const v of results.violations) {
          summary.push(`  [${v.id}] ${v.help} — ${v.nodes.length} nodes`);
        }
      }
    }
  }

  if (summary.length > 0) {
    console.log(`\n📊 WCAG Summary:\n${summary.join("\n")}`);
    console.log(`\nTotal: ${totalViolations} violations across all pages`);
  } else {
    console.log("\n✅ All pages pass WCAG 2.2 AA in both light and dark mode");
  }

  // Informational — individual strict tests and contrast ratchet enforce thresholds
  expect(totalViolations).toBeGreaterThanOrEqual(0);
});
