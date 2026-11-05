/**
 * J1090–J1091: a contract negotiation started from /negotiate reaches the
 * connector and finalizes, on the live hub.
 *
 * The API collection walks the same DSP flow (bruno/MVHDv2/03 Data User/15
 * to 20), but it sends what it chooses, not what the page sends. On
 * 2026-11-05 it was green while every negotiation started from the page
 * stayed REQUESTING: the page sent a fixed http://controlplane:8082, the
 * compose host, which does not resolve on Azure (#876). Only a click through
 * the page catches that.
 *
 * Runs only with LIVE_DSP_FLOW=true (Demo Smoke, against
 * https://ehds.mabu.red); the compose data planes crash on start (#542).
 * Each run leaves one negotiation on the connector.
 */
import { test, expect } from "@playwright/test";
import { signInPage, NO_FORGED_SESSION } from "../helpers/forged-session";

const LIVE = process.env.LIVE_DSP_FLOW === "true";

test.describe("Live DSP negotiation from the page (#876)", () => {
  test.skip(!LIVE, "LIVE_DSP_FLOW is not set: only the live hub runs this");
  test.setTimeout(150_000);

  test("J1090 — the catalogue comes from the connector, not the demo catalogue", async ({
    page,
  }) => {
    expect(await signInPage(page, "researcher"), NO_FORGED_SESSION).toBe(true);
    await page.goto("/negotiate");

    // The defaults: the data user asks, a data holder is asked.
    await expect(
      page
        .getByLabel("Requesting as (your participant)")
        .locator("option:checked"),
    ).toHaveText(/PharmaCo Research AG/);
    await expect(
      page.getByLabel("Data Provider").locator("option:checked"),
    ).toHaveText(/AlphaKlinik Berlin/);

    const catalog = page.waitForResponse((r) =>
      r.url().includes("catalog=true"),
    );
    await page.getByRole("button", { name: "Discover Offers" }).click();
    const body = (await (await catalog).json()) as {
      demo?: boolean;
      upstreamError?: string;
    };

    expect(
      body.demo,
      `demo catalogue served: ${body.upstreamError ?? ""}`,
    ).not.toBe(true);
    await expect(page.getByText(/offer\(s\) found/)).toBeVisible();
    await expect(page.getByText(/demonstrator's own catalogue/)).toHaveCount(0);
  });

  test("J1091 — a negotiation started from the page reaches FINALIZED", async ({
    page,
  }) => {
    expect(await signInPage(page, "researcher"), NO_FORGED_SESSION).toBe(true);
    await page.goto("/negotiate");
    await page.getByRole("button", { name: "Discover Offers" }).click();
    await expect(page.getByText(/offer\(s\) found/)).toBeVisible({
      timeout: 30_000,
    });
    await page
      .getByRole("button", { name: /Fhir Patient Search/i })
      .first()
      .click();

    const started = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/negotiations") &&
        r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Start Negotiation" }).click();
    const response = await started;
    const sent = response.request().postDataJSON() as {
      participantId: string;
      counterPartyAddress?: string;
    };
    const created = (await response.json()) as { "@id": string };

    expect(response.status(), JSON.stringify(created)).toBe(201);
    expect(created["@id"], "recorded as a demo negotiation").not.toMatch(
      /^demo-/,
    );
    expect(sent.counterPartyAddress ?? "", "a compose host name").not.toMatch(
      /\/\/controlplane:/,
    );

    await expect
      .poll(
        async () => {
          const res = await page.request.get(
            `/api/negotiations?participantId=${sent.participantId}`,
          );
          const rows = (await res.json()) as {
            "@id": string;
            state?: string;
          }[];
          return rows.find((n) => n["@id"] === created["@id"])?.state;
        },
        {
          message: `negotiation ${created["@id"]} did not finalize`,
          timeout: 90_000,
          intervals: [5_000],
        },
      )
      .toBe("FINALIZED");

    // The page follows the negotiation itself and leads on to the transfer:
    // a demo user must not be left at "Negotiation initiated".
    await expect(
      page.getByRole("link", { name: /Continue to transfer/ }),
    ).toBeVisible({ timeout: 15_000 });
  });
});
