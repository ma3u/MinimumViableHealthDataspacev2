/**
 * The start page's register dialog on the hub (J1104–J1105). Its two ways in:
 *
 * - The simulated phone signs in as the demo patient patient1, with a real
 *   session, and lands on /patient. Until 2026-11-11 it set a persona in the
 *   browser only, which /patient does not accept: the visitor was sent to
 *   sign in instead.
 * - The QR code is the hub's own OpenID4VP request, which a wallet can
 *   answer. Until 2026-11-11 it was a fixed link to /auth/eudi-qr. Signing in
 *   to a personal account, creating one from a PID and connecting Klarbefund
 *   afterwards need a real wallet; the unit tests and a person with a phone
 *   cover those.
 *
 * The static export keeps the simulation (spec 19, J319). Nothing is stubbed.
 */
import { test, expect } from "@playwright/test";
import { T } from "./helpers";

const IS_STATIC = process.env.NEXT_PUBLIC_STATIC_EXPORT === "true";

test.describe("Register dialog on the hub", () => {
  test.skip(IS_STATIC, "the static export keeps the simulation (spec 19)");

  test("J1104 the simulated phone signs in as the demo patient patient1", async ({
    page,
  }) => {
    // Allowed only where EUDI_DEMO_WALLET=true (compose, CI, the Azure demo).
    const probe = await page.request.post("/api/auth/eudi/start", {
      data: { demo: true },
    });
    test.skip(
      probe.status() === 404,
      "EUDI_DEMO_WALLET is not true on this stack, so the simulated phone cannot sign in",
    );
    expect(probe.status()).toBe(200);

    await page.goto("/");
    await page.getByRole("button", { name: /Register with d-you/ }).click();
    const dialog = page.getByRole("dialog");
    const phone = dialog.getByRole("group", { name: /Approve d-you register/ });
    for (const step of [
      "Scan QR code",
      "Next",
      "Next",
      "Transfer data",
      "Close",
    ]) {
      await phone.getByRole("button", { name: step, exact: true }).click();
    }

    await page.waitForURL(/\/patient(\/|$|\?)/, { timeout: T });
    const session = await (await page.request.get("/api/auth/session")).json();
    expect(session.user.preferredUsername).toBe("patient1");
    expect(session.roles).toContain("PATIENT");
    // A simulated approval proves nothing about the person: assurance low.
    expect(session.assurance).toBe("low");
    // The page that needs a session shows the record, not the sign-in.
    await expect(page).not.toHaveURL(/\/auth\/signin/);
  });

  test("J1105 the dialog's QR code is the hub's own wallet request", async ({
    page,
  }) => {
    await page.goto("/");
    const started = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/auth/eudi/start") &&
        r.request().method() === "POST",
    );
    await page.getByRole("button", { name: /Register with d-you/ }).click();
    const res = await started;
    const dialog = page.getByRole("dialog");

    if (res.ok()) {
      // A stack with a verifier: the QR and the link are its request.
      const body = (await res.json()) as {
        qrDataUri: string;
        walletLink: string;
      };
      await expect(
        dialog.getByAltText("d-you OpenID4VP QR code"),
      ).toHaveAttribute("src", body.qrDataUri, { timeout: T });
      await expect(
        dialog.getByRole("link", { name: /Tap to open d-you/ }),
      ).toHaveAttribute("href", body.walletLink);
    } else {
      // No verifier here (CI): the dialog says so rather than show a code
      // no wallet can answer.
      await expect(
        dialog.getByText("Could not reach the EUDI verifier."),
      ).toBeVisible({ timeout: T });
    }
    // Never the fixed link to a page that it was before.
    await expect(
      dialog.getByAltText("Scan with d-you: OpenID4VP QR code"),
    ).toHaveCount(0);
    // The simulated phone is there either way.
    await expect(
      dialog.getByRole("group", { name: /Approve d-you register/ }),
    ).toBeVisible();
  });
});
