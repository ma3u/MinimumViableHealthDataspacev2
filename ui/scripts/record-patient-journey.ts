/**
 * Records the person's journey on the platform as the frames of the GIF the
 * HL7 showcase deck shows under the person's swimlane (issue #252): the
 * overview the login lands on, the own record, the research programmes with
 * their revocable consents, and the aggregate findings that came back.
 * Frames are screenshots taken at chosen moments, so loading time never
 * ends up in the animation.
 *
 *   PLAYWRIGHT_BASE_URL=https://ehds.mabu.red npx tsx scripts/record-patient-journey.ts
 *
 * Writes frame-NNN.png and frames.json (one duration in ms per frame) to OUT
 * (default ./recordings/patient); scripts/frames-to-gif.py assembles the
 * GIF. The patient is fictional (Maria Schmidt, the patient1 login).
 */
import { chromium, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3003";
const OUT = process.env.OUT ?? join(process.cwd(), "recordings", "patient");
const USER = process.env.RECORD_USER ?? "patient1";
const PASS = process.env.RECORD_PASS ?? USER;
const SIZE = { width: 1100, height: 690 };

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function login(page: Page) {
  await page.goto(`${BASE}/auth/signin`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /sign in with keycloak/i }).click();
  await page.waitForURL(/protocol\/openid-connect\/auth/, { timeout: 20_000 });
  await page.getByLabel(/username or email/i).fill(USER);
  await page.locator("#password").fill(PASS);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(new RegExp(new URL(BASE).hostname), {
    timeout: 20_000,
  });
  await page.waitForFunction(async () => {
    const r = await fetch("/api/auth/session");
    const s = await r.json();
    return Boolean(s?.user);
  });
}

class Recorder {
  private n = 0;
  readonly durations: number[] = [];
  constructor(private page: Page) {}
  /** One frame, shown for `ms`. */
  async frame(ms: number) {
    const file = join(OUT, `frame-${String(this.n).padStart(3, "0")}.png`);
    await this.page.screenshot({ path: file });
    this.durations.push(ms);
    this.n += 1;
  }
  /** `count` frames `every` ms apart, each shown for that long. */
  async run(count: number, every: number, between?: () => Promise<void>) {
    for (let i = 0; i < count; i++) {
      if (between) await between();
      await this.frame(every);
      await pause(every);
    }
  }
  /** Scroll the page in `count` steps, one frame per step. The scroll is
   *  instant and settles before the frame, so the sticky header never
   *  lags behind the content in a screenshot. */
  async scroll(total: number, count: number, every = 140) {
    const step = total / count;
    await this.run(count, every, async () => {
      await this.page.evaluate(
        (dy) => window.scrollBy({ top: dy, behavior: "instant" }),
        step,
      );
      await pause(80);
    });
  }
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    args: [
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });
  const ctx = await browser.newContext({
    viewport: SIZE,
    deviceScaleFactor: 1,
    reducedMotion: "no-preference",
  });
  // The default-password banner is for the demo persona, not for the film.
  await ctx.addInitScript(() => {
    sessionStorage.setItem("demo-password-banner-dismissed", "true");
  });
  const page = await ctx.newPage();
  await login(page);
  const rec = new Recorder(page);

  // 1. Where the login lands: my health in one view
  await page.goto(`${BASE}/overview`, { waitUntil: "networkidle" });
  await page.getByTestId("overview-question").waitFor({ timeout: 45_000 });
  await page.locator("canvas").first().waitFor({ timeout: 45_000 });
  await pause(4000);
  await rec.frame(1200);
  await page.mouse.move(SIZE.width / 2, SIZE.height / 2);
  await rec.run(8, 150, () => page.keyboard.press("Shift+ArrowRight"));
  await rec.frame(800);
  const signal = page.getByTestId("overview-signal").first();
  if (await signal.count()) {
    await signal.click();
    await rec.run(6, 200);
    await pause(800);
    await rec.frame(2200);
  }

  // 2. My record: diagnoses, medications, the lab values with their ranges.
  // The page's record selector is a demo device that lists the twenty records
  // with the most conditions; the own record is chosen when it is offered.
  await page.goto(`${BASE}/patient/profile`, { waitUntil: "networkidle" });
  const select = page.getByLabel(/select patient record/i);
  await select.waitFor({ timeout: 45_000 });
  const own = await select
    .locator("option", { hasText: /Maria Schmidt/i })
    .first()
    .getAttribute("value", { timeout: 3_000 })
    .catch(() => null);
  if (own) await select.selectOption(own);
  await page
    .getByText(/Loading health profile/i)
    .waitFor({ state: "detached", timeout: 45_000 })
    .catch(() => undefined);
  await pause(800);
  await rec.frame(1400);
  await rec.scroll(900, 10);
  await rec.frame(1600);

  // 3. Research programmes: consent given, consent revocable, the opt-out
  await page.goto(`${BASE}/patient/research`, { waitUntil: "networkidle" });
  await page
    .getByTestId("research-program-card")
    .first()
    .waitFor({ timeout: 45_000 });
  await pause(800);
  await rec.frame(1400);
  await rec.scroll(700, 8);
  await rec.frame(1800);

  // 4. What came back: aggregate findings, recommendations for me
  await page.goto(`${BASE}/patient/insights`, { waitUntil: "networkidle" });
  await page
    .getByTestId("recommendation-card")
    .first()
    .waitFor({ timeout: 45_000 });
  await pause(800);
  await rec.frame(1400);
  await rec.scroll(800, 9);
  await rec.frame(2200);

  writeFileSync(join(OUT, "frames.json"), JSON.stringify(rec.durations));
  await browser.close();
  console.log(`${rec.durations.length} frames in ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
