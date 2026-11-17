/**
 * Records the ten-minute version of the TEHDAS2 final conference demo (#994,
 * docs/demos/tehdas2-final-conference-2026-11-16.md) as one video: steps 1, 3,
 * 4, 5, 6, 7, 10 and 13, each held for its time in the script, with a caption
 * naming the step and the TEHDAS2 document it shows. It is the fallback for
 * step 7, which the static site cannot answer, and for a dead network.
 *
 *   cd ui
 *   PLAYWRIGHT_BASE_URL=https://ehds.mabu.red \
 *   RECORD_PASS_RESEARCHER=… RECORD_PASS_REGULATOR=… \
 *   RECORD_PASS_EDCADMIN=… RECORD_PASS_PATIENT1=… \
 *   npx tsx scripts/record-tehdas2-demo.ts
 *
 * Each persona signs in once, before anything is recorded; the sessions stay
 * in memory and never reach a file. A password not set falls back to the
 * username, as the local stack's seed users have it. The script only reads:
 * it opens pages, scrolls and asks one question on /query, and never submits
 * a form, so it changes nothing on the hub.
 *
 * Writes step-NN.webm (one per step, the page load cut off) and
 * tehdas2-demo-10min.mp4 to OUT (default: a folder in the system temp
 * directory, so no video lands in the repository). SPEED=0.2 runs it five
 * times faster, for a test. Needs ffmpeg on the PATH for the cut and the mp4.
 * Synthetic data and fictional organisations only.
 */
/* eslint-disable no-console -- a command-line tool reports on the console */
import { chromium, type Browser, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = (
  process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3003"
).replace(/\/$/, "");
const OUT = process.env.OUT ?? join(tmpdir(), "tehdas2-demo");
const SPEED = Number(process.env.SPEED ?? "1");
const SIZE = { width: 1440, height: 900 };

type Persona = "researcher" | "regulator" | "edcadmin" | "patient1";
type StorageState = Awaited<
  ReturnType<import("@playwright/test").BrowserContext["storageState"]>
>;

interface Step {
  n: number;
  persona: Persona;
  path: string;
  seconds: number;
  caption: string;
  /** What to wait for before the clip starts. */
  ready: RegExp;
  /** Texts to scroll to, one after the other; none means scroll the page. */
  stops?: RegExp[];
  /** Hold the first view for the whole step. */
  still?: boolean;
  act?: (page: Page) => Promise<void>;
}

const STEPS: Step[] = [
  {
    n: 1,
    persona: "researcher",
    path: "/catalog",
    seconds: 60,
    caption:
      "1 · Discovery and access · The catalogue in HealthDCAT-AP Release 8 · TEHDAS2 D5.1, D5.3",
    ready: /Dataset Catalog/i,
  },
  {
    n: 3,
    persona: "researcher",
    path: "/applications",
    seconds: 60,
    caption:
      "3 · Discovery and access · An application: purpose, datasets, legal basis · TEHDAS2 D6.2",
    ready: /Data permit applications/i,
  },
  {
    n: 4,
    persona: "regulator",
    path: "/compliance",
    seconds: 90,
    caption:
      "4 · Discovery and access · The access body's desk: applications and decision deadlines · TEHDAS2 D6.3, D6.4",
    ready: /EHDS Compliance Overview/i,
    stops: [/Participant Compliance Matrix/i],
  },
  {
    n: 5,
    persona: "regulator",
    path: "/permits",
    seconds: 60,
    caption:
      "5 · Discovery and access · The permit and the public register of permits · TEHDAS2 D6.3, D6.4",
    ready: /Data permits register/i,
  },
  {
    n: 6,
    persona: "edcadmin",
    path: "/admin/attestation",
    seconds: 90,
    caption:
      "6 · Safe and secure use · SPE workspaces as confidential containers; the key only for an attested one · TEHDAS2 D7.1, D7.4",
    ready: /SPE attestation/i,
  },
  {
    n: 7,
    persona: "researcher",
    path: "/query",
    seconds: 90,
    caption:
      "7 · Safe and secure use · Only aggregates leave; groups under five are suppressed · TEHDAS2 D7.1, D7.2",
    ready: /Natural Language Query/i,
    act: async (page) => {
      await page
        .getByText("Patients with diabetes", { exact: true })
        .first()
        .click();
      await pause(1500);
      await page.getByRole("button", { name: /^ask$/i }).click();
      await page.getByText(/k = 5/).first().waitFor({ timeout: 60_000 });
      await pause(800);
    },
    stops: [/k = 5/],
  },
  {
    n: 10,
    persona: "patient1",
    path: "/patient/research",
    seconds: 90,
    caption:
      "10 · Citizens at the heart · The Art. 71 opt-out, a record and a label · TEHDAS2 D8.1",
    ready: /Research Programs/i,
  },
  {
    n: 13,
    persona: "researcher",
    path: "/docs/roadmap#e990",
    seconds: 60,
    caption:
      "13 · Building the EHDS together · What the hub takes over from TEHDAS2, and the roadmap",
    ready: /Roadmap/i,
    still: true,
  },
];

const pause = (ms: number) =>
  new Promise((r) => setTimeout(r, Math.max(0, ms * SPEED)));

function password(user: Persona): string {
  return process.env[`RECORD_PASS_${user.toUpperCase()}`] ?? user;
}

async function signIn(browser: Browser, user: Persona): Promise<StorageState> {
  const ctx = await browser.newContext({ viewport: SIZE, locale: "en-GB" });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/auth/signin?lang=en`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /sign in with keycloak/i }).click();
  await page.waitForURL(/protocol\/openid-connect\/auth/, { timeout: 30_000 });
  await page.locator("#username").fill(user);
  await page.locator("#password").fill(password(user));
  await page.locator("#kc-login").click();
  // Keycloak sends the browser back to the UI's own address, which on the
  // compose stack is Traefik's port, not always BASE.
  await page.waitForURL((u) => !/openid-connect|\/auth\/signin/.test(u.href), {
    timeout: 30_000,
    waitUntil: "commit",
  });
  const home = new URL(page.url()).origin;
  await page.waitForFunction(
    async () => {
      const r = await fetch("/api/auth/session");
      const s = await r.json();
      return Boolean(s?.roles?.length);
    },
    undefined,
    { timeout: 20_000 },
  );
  if (home !== BASE) {
    throw new Error(
      `${user} landed on ${home}; set PLAYWRIGHT_BASE_URL=${home}`,
    );
  }
  const state = await ctx.storageState();
  await ctx.close();
  return state;
}

/** A caption bar at the foot of the page, above everything else. */
async function caption(page: Page, text: string) {
  await page.evaluate((t) => {
    const bar = document.createElement("div");
    bar.textContent = t;
    bar.setAttribute("aria-hidden", "true");
    Object.assign(bar.style, {
      position: "fixed",
      left: "0",
      right: "0",
      bottom: "0",
      zIndex: "2147483647",
      padding: "14px 28px",
      background: "rgba(17, 24, 39, 0.92)",
      color: "#f9fafb",
      font: "600 20px/1.35 system-ui, -apple-system, sans-serif",
      letterSpacing: "0.01em",
    });
    document.body.appendChild(bar);
  }, text);
}

// A string, not a function: tsx wraps named functions in a __name() helper
// that does not exist in the page.
const SMOOTH_SCROLL = `(async ([to, dur]) => {
  const from = window.scrollY;
  const start = performance.now();
  await new Promise((done) => {
    function step(now) {
      const t = Math.min(1, (now - start) / dur);
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      window.scrollTo(0, from + (to - from) * eased);
      if (t < 1) requestAnimationFrame(step); else done();
    }
    requestAnimationFrame(step);
  });
})`;

async function smoothTo(page: Page, top: number, ms: number) {
  await page.evaluate(
    `${SMOOTH_SCROLL}([${top}, ${Math.max(200, ms * SPEED)}])`,
  );
}

/** Holds the step for its time: the top first, then each stop or the page in screens. */
async function tour(page: Page, step: Step, spentMs: number) {
  const total = step.seconds * 1000 - spentMs;
  const glide = 2500;
  let targets: number[] = [];
  if (step.stops?.length) {
    for (const re of step.stops) {
      const el = page.getByText(re).first();
      if (await el.count()) {
        const box = await el.evaluate(
          (e) => e.getBoundingClientRect().top + window.scrollY,
        );
        targets.push(Math.max(0, box - 120));
      }
    }
  } else if (!step.still) {
    // At most three screens down from the top, never the far end of a long page.
    const height = await page.evaluate(
      () => document.documentElement.scrollHeight - window.innerHeight,
    );
    const screen = Math.round(SIZE.height * 0.75);
    const screens = Math.min(3, Math.floor(height / screen));
    targets = Array.from({ length: screens }, (_, i) => (i + 1) * screen);
  }
  const hold = Math.max(
    3000,
    (total - targets.length * glide) / (targets.length + 1),
  );
  await pause(hold);
  for (const top of targets) {
    await smoothTo(page, top, glide);
    await pause(hold);
  }
}

async function record(
  browser: Browser,
  step: Step,
  state: StorageState,
): Promise<number> {
  const ctx = await browser.newContext({
    viewport: SIZE,
    locale: "en-GB",
    storageState: state,
    recordVideo: { dir: OUT, size: SIZE },
  });
  await ctx.addInitScript(() => {
    sessionStorage.setItem("demo-password-banner-dismissed", "true");
  });
  const page = await ctx.newPage();
  const opened = Date.now();
  await page.goto(`${BASE}${step.path}`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.getByText(step.ready).first().waitFor({ timeout: 60_000 });
  await page
    .waitForLoadState("networkidle", { timeout: 15_000 })
    .catch(() => undefined);
  if (step.path.includes("#")) {
    await page
      .locator(`#${step.path.split("#")[1]}`)
      .scrollIntoViewIfNeeded()
      .catch(() => undefined);
  }
  await caption(page, step.caption);
  const cut = (Date.now() - opened) / 1000;
  const started = Date.now();
  if (step.act) await step.act(page);
  await tour(page, step, (Date.now() - started) / SPEED);
  const video = page.video();
  await ctx.close();
  const file = join(OUT, `step-${String(step.n).padStart(2, "0")}.webm`);
  if (video) renameSync(await video.path(), file);
  console.log(
    `step ${step.n}: ${step.path} as ${step.persona}, cut ${cut.toFixed(
      1,
    )} s of loading`,
  );
  return cut;
}

function assemble(cuts: Map<number, number>) {
  const parts: string[] = [];
  for (const step of STEPS) {
    const src = join(OUT, `step-${String(step.n).padStart(2, "0")}.webm`);
    const dst = join(OUT, `cut-${String(step.n).padStart(2, "0")}.mp4`);
    execFileSync("ffmpeg", [
      "-y",
      "-loglevel",
      "error",
      "-ss",
      String(cuts.get(step.n) ?? 0),
      "-i",
      src,
      "-vf",
      "fps=25,format=yuv420p",
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      "20",
      "-an",
      dst,
    ]);
    parts.push(`file '${dst}'`);
  }
  const list = join(OUT, "parts.txt");
  writeFileSync(list, parts.join("\n") + "\n");
  const out = join(OUT, "tehdas2-demo-10min.mp4");
  execFileSync("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    list,
    "-c",
    "copy",
    out,
  ]);
  for (const f of readdirSync(OUT)) {
    if (f.startsWith("cut-") || f === "parts.txt") {
      renameSync(join(OUT, f), join(tmpdir(), `tehdas2-${f}`));
    }
  }
  console.log(`\n${out}`);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const states = new Map<Persona, StorageState>();
  for (const p of new Set(STEPS.map((s) => s.persona))) {
    states.set(p, await signIn(browser, p));
    console.log(`signed in: ${p}`);
  }
  const cuts = new Map<number, number>();
  for (const step of STEPS) {
    cuts.set(step.n, await record(browser, step, states.get(step.persona)!));
  }
  await browser.close();
  assemble(cuts);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
