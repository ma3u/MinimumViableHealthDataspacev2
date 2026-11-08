/**
 * The access register's criticality and its test identities (J1070 to
 * J1073). /admin/audit, tab Access Logs: every recorded access has a
 * criticality chip (low, medium, high; ui/src/lib/access-criticality.ts),
 * the opened row lists the reasons, a filter shows one level, and a session
 * forged by CI (did:web:ci.test:<persona>) carries a Test badge and can be
 * hidden.
 *
 *   PLAYWRIGHT_BASE_URL=http://localhost:3003 \
 *     npx playwright test __tests__/e2e/journeys/52-audit-criticality.spec.ts
 */
import { expect, test, type Page, type Response } from "@playwright/test";
import { loginAs, skipIfKeycloakDown } from "./helpers";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem("demo-password-banner-dismissed", "true");
    } catch {
      /* ignore */
    }
  });
});

/** The tab's name and the empty register's line, per language. */
const TEXTS = {
  en: { tab: "Access Logs", empty: "No access logs recorded" },
  de: { tab: "Zugriffsprotokolle", empty: "Keine Zugriffsprotokolle erfasst" },
} as const;

/** Opens the Access Logs tab; false when the register is empty. */
async function openAccessLogs(
  page: Page,
  lang: keyof typeof TEXTS = "en",
): Promise<boolean> {
  const auditResponse = (type: string) => (r: Response) =>
    r.url().includes("/api/admin/audit?") && r.url().includes(`type=${type}`);
  // The page loads its overview first and each tab fetches its own rows, and
  // the page keeps whichever answer arrives last. Clicking the tab before the
  // overview had answered let the slower overview replace the access logs:
  // the rows went away mid-click ("element was detached") or the tab said
  // "No access logs recorded" and the test skipped. So the overview first,
  // then the tab and its rows.
  await Promise.all([
    page.waitForResponse(auditResponse("all"), { timeout: 20_000 }),
    page.goto(`/admin/audit?lang=${lang}`),
  ]);
  await Promise.all([
    page.waitForResponse(auditResponse("accesslogs"), { timeout: 20_000 }),
    page.getByRole("button", { name: TEXTS[lang].tab }).first().click(),
  ]);
  const rows = page.getByTestId("access-log-row");
  const empty = page.getByText(TEXTS[lang].empty);
  await expect(rows.first().or(empty)).toBeVisible({ timeout: 20_000 });
  return (await rows.count()) > 0;
}

test.describe("Audit · the criticality of each access", () => {
  test.beforeEach(async ({ page }) => {
    await skipIfKeycloakDown();
    await loginAs(page, "edcadmin", "edcadmin");
  });

  test("J1070 every access has a criticality and the opened row says why", async ({
    page,
  }) => {
    const any = await openAccessLogs(page);
    test.skip(!any, "the access register of this stack holds no access yet");
    await expect(
      page.getByRole("columnheader", { name: "Criticality" }),
    ).toBeVisible();
    const rows = page.getByTestId("access-log-row");
    const chips = page.getByTestId("criticality-chip");
    expect(await chips.count()).toBe(await rows.count());
    await expect(chips.first()).toHaveText(/^(Low|Medium|High)$/i);

    await rows.first().click();
    const reasons = page.getByTestId("criticality-reasons");
    await expect(reasons).toBeVisible();
    await expect(reasons.locator("li").first()).toHaveText(
      /aggregate counts only|record-level data|one patient's full record|catalogue metadata only/,
    );
  });

  test("J1071 the criticality filter shows one level", async ({ page }) => {
    const any = await openAccessLogs(page);
    test.skip(!any, "the access register of this stack holds no access yet");
    const filter = page.getByTestId("criticality-filter");
    for (const level of ["high", "medium", "low"]) {
      await filter.selectOption(level);
      const chips = page.getByTestId("criticality-chip");
      const n = await chips.count();
      for (let i = 0; i < n; i++) {
        await expect(chips.nth(i)).toHaveAttribute("data-level", level);
      }
    }
    await filter.selectOption("");
    await expect(page.getByText(/hidden by the filters/)).toHaveCount(0);
  });

  test("J1072 a forged CI session is marked Test and can be hidden", async ({
    page,
  }) => {
    const any = await openAccessLogs(page);
    test.skip(!any, "the access register of this stack holds no access yet");
    const badges = page.getByTestId("test-identity-badge");
    const tests = await badges.count();
    test.skip(
      tests === 0,
      "no access by a did:web:ci.test session is recorded on this stack yet",
    );
    await expect(badges.first()).toHaveText(/^Test$/i);
    const before = await page.getByTestId("access-log-row").count();
    await page.getByLabel("Hide automated tests").check();
    await expect(badges).toHaveCount(0);
    await expect(page.getByTestId("access-log-row")).toHaveCount(
      before - tests,
    );
  });

  test("J1073 the criticality speaks German", async ({ page }) => {
    const any = await openAccessLogs(page, "de");
    test.skip(!any, "the access register of this stack holds no access yet");
    await expect(
      page.getByRole("columnheader", { name: "Kritikalität" }),
    ).toBeVisible();
    await expect(
      page.getByLabel("Automatisierte Tests ausblenden"),
    ).toBeVisible();
  });
});
