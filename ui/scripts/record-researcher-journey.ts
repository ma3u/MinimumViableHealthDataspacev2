/**
 * Records the researcher's journey on the platform as the frames of the GIF
 * the HL7 blog article and the showcase deck show (issue #252): the persona
 * overview the login lands on, dataset discovery, the negotiation history
 * and the OMOP analytics. Frames are screenshots taken at chosen moments,
 * so loading time never ends up in the animation.
 *
 *   PLAYWRIGHT_BASE_URL=https://ehds.mabu.red npx tsx scripts/record-researcher-journey.ts
 *
 * Writes frame-NNN.png and frames.json (one duration in ms per frame) to OUT
 * (default ./recordings/researcher); scripts/frames-to-gif.py assembles the
 * GIF. Synthetic data only.
 */
import { chromium, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3003";
const OUT = process.env.OUT ?? join(process.cwd(), "recordings", "researcher");
const USER = process.env.RECORD_USER ?? "researcher";
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
  /** Scroll the page in `count` steps, one frame per step. */
  async scroll(total: number, count: number, every = 140) {
    await this.run(count, every, () => this.page.mouse.wheel(0, total / count));
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

  // 1. Where the login lands: my research in one view
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

  // 2. Discovering datasets across holders
  await page.goto(`${BASE}/data/discover`, { waitUntil: "networkidle" });
  await page
    .getByText(/HealthDCAT-AP datasets/i)
    .first()
    .waitFor({ timeout: 45_000 });
  await pause(600);
  await rec.frame(1200);
  await rec.scroll(360, 5);
  const card = page.getByText(/Synthetic Type 2 Diabetes/i).first();
  if (await card.count()) {
    await card.click();
    await pause(500);
    await rec.frame(2000);
  }
  await rec.scroll(420, 6);
  await rec.frame(900);

  // 3. The negotiation history
  await page.goto(`${BASE}/negotiate`, { waitUntil: "networkidle" });
  await page
    .getByRole("option", { name: /Loading participants/i })
    .waitFor({ state: "detached", timeout: 45_000 })
    .catch(() => undefined);
  await pause(600);
  await rec.frame(1200);
  await rec.scroll(820, 10);
  await rec.frame(1800);

  // 4. OMOP analytics over the synthetic cohort
  await page.goto(`${BASE}/analytics`, { waitUntil: "networkidle" });
  await page
    .getByText(/Gender Distribution/i)
    .first()
    .waitFor({ timeout: 45_000 });
  await pause(1200);
  await rec.frame(1400);
  await rec.scroll(1000, 12);
  await rec.frame(2200);

  writeFileSync(join(OUT, "frames.json"), JSON.stringify(rec.durations));
  await browser.close();
  console.log(`${rec.durations.length} frames in ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
