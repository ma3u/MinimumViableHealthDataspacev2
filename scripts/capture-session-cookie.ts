/* eslint-disable no-console */
// Launches a Chromium browser, performs the NextAuth → Keycloak login against
// the target UI, and prints the session cookie in `name=value` form to stdout.
// Consumed by the authenticated ZAP scan, by demo-smoke.yml, and by any script
// that needs to drive the UI as a logged-in user.
//
// Usage:
//   npx tsx scripts/capture-session-cookie.ts \
//     --base-url https://ehds.mabu.red \
//     --user edcadmin --pass edcadmin
import { chromium } from "@playwright/test";
import {
  keycloakLogin,
  getSessionCookie,
} from "../ui/__tests__/e2e/helpers/keycloak-login";

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  if (fallback !== undefined) return fallback;
  throw new Error(`missing --${name}`);
}

async function main(): Promise<void> {
  const baseUrl = arg("base-url", "http://localhost:3000");
  const username = arg("user", "edcadmin");
  const password = arg("pass", "edcadmin");

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ baseURL: baseUrl });
    const page = await context.newPage();
    await keycloakLogin(page, { username, password });
    const cookie = await getSessionCookie(context, baseUrl);
    console.log(cookie);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
