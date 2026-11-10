/**
 * Onboarding and removing a participant through /onboarding (ADR-085 step 3,
 * ADR-088, #973), with CFM or without: the page posts to /api/participants,
 * which provisions through CFM's Tenant Manager when CFM_TENANT_URL is set and
 * by the hub itself otherwise, and removes with DELETE /api/participants/{id}.
 *
 * J1100 onboards and removes on a stack with EDC runtimes (the compose stack,
 * with or without the `cfm` profile); without them the registration is not
 * provisioned and the journey skips, saying so. J1101 and J1102 hold on any
 * stack: a seeded participant offers no removal, and only an EDC_ADMIN may
 * remove.
 *
 *   PLAYWRIGHT_BASE_URL=http://localhost:3003 NEXTAUTH_SECRET=... \
 *     npx playwright test __tests__/e2e/journeys/55-participant-removal.spec.ts
 */
import { expect, test } from "@playwright/test";
import { T } from "./helpers";
import {
  NO_FORGED_SESSION,
  signInPage,
  signedInRequest,
} from "../helpers/forged-session";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem("demo-password-banner-dismissed", "true");
    } catch {
      /* ignore */
    }
  });
});

test.describe("Participant removal through /onboarding", () => {
  // The one this run onboarded, removed afterwards if the journey stopped
  // before its own removal did.
  let onboardedId: string | null = null;

  test.afterEach(async () => {
    if (!onboardedId) return;
    const admin = await signedInRequest(BASE_URL, "edcadmin");
    await admin?.delete(`/api/participants/${onboardedId}`);
    await admin?.dispose();
    onboardedId = null;
  });

  test("J1100 — an admin onboards a participant and removes it again", async ({
    page,
  }) => {
    test.setTimeout(150_000);
    test.skip(!(await signInPage(page, "edcadmin")), NO_FORGED_SESSION);
    await page.goto("/onboarding");

    // Fictional, and unique per run so a left-over never matches.
    const name = `Limburg Medical Centre J1100 ${Date.now().toString(36)}`;
    await page.getByLabel("Display Name").fill(name);
    await page.getByLabel("Organisation").fill("Limburg Medical Centre");

    const [posted] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().endsWith("/api/participants") &&
          r.request().method() === "POST",
        { timeout: 120_000 },
      ),
      page.getByRole("button", { name: "Register Participant" }).click(),
    ]);
    const created = (await posted.json().catch(() => ({}))) as {
      participantId?: string;
      provisioned?: boolean;
      detail?: string;
    };
    test.skip(
      posted.status() !== 201 || created.provisioned === false,
      `No EDC runtimes to provision on (POST /api/participants answered ` +
        `${posted.status()}${created.detail ? `: ${created.detail}` : ""}); ` +
        `run against the compose stack`,
    );
    onboardedId = created.participantId ?? null;
    expect(onboardedId, "the new participant's context id").toBeTruthy();

    // The list is read again after the registration; the new card is first.
    const card = page.getByText(name, { exact: true });
    await expect(card).toBeVisible({ timeout: T });
    await card.click();

    await page.getByTestId("remove-participant").click();
    const [removed] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes(`/api/participants/${onboardedId}`) &&
          r.request().method() === "DELETE",
        { timeout: 60_000 },
      ),
      page.getByTestId("confirm-remove-participant").click(),
    ]);
    const body = (await removed.json()) as {
      complete?: boolean;
      steps?: { step: string; ok: boolean }[];
    };
    expect(removed.status(), JSON.stringify(body.steps)).toBe(200);
    expect(body.steps?.some((s) => s.step === "control plane context")).toBe(
      true,
    );

    await expect(page.getByText(name, { exact: true })).toHaveCount(0, {
      timeout: T,
    });
    const admin = await signedInRequest(BASE_URL, "edcadmin");
    const again = await admin!.delete(`/api/participants/${onboardedId}`);
    await admin!.dispose();
    expect(again.status(), "the context is gone").toBe(404);
    onboardedId = null;
  });

  test("J1101 — a seeded participant offers no removal", async ({ page }) => {
    test.skip(!(await signInPage(page, "edcadmin")), NO_FORGED_SESSION);
    await page.goto("/onboarding");

    const seeded = page.getByText("AlphaKlinik Berlin", { exact: true });
    const listed = await seeded
      .first()
      .waitFor({ timeout: T })
      .then(() => true)
      .catch(() => false);
    test.skip(!listed, "AlphaKlinik Berlin is not listed on this stack");
    await seeded.first().click();

    await expect(page.getByText("Onboarding Progress").first()).toBeVisible({
      timeout: T,
    });
    await expect(page.getByTestId("remove-participant")).toHaveCount(0);
  });

  test("J1102 — only an EDC_ADMIN may remove a participant", async () => {
    const holder = await signedInRequest(BASE_URL, "clinicuser");
    test.skip(!holder, NO_FORGED_SESSION);

    const res = await holder!.delete("/api/participants/alpha-klinik");
    const body = (await res.json()) as { error?: string };
    await holder!.dispose();

    expect(res.status()).toBe(403);
    expect(body.error, "an { error } body").toBeTruthy();
  });
});
