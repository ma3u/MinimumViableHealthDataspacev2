/**
 * /e2e-report, /ci-e2e-report and /test-reports lead to the nightly's reports
 * on GitHub Pages (#951). The server has no copy of them, and a copy it served
 * rendered blank under the app's nonce-based CSP.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const CONFIG = require.resolve("../../../next.config.js");

type Redirect = { source: string; destination: string; permanent: boolean };

afterEach(() => {
  vi.unstubAllEnvs();
});

/**
 * The server build's redirects. next.config.js decides at load time whether it
 * is the static export, which has none, and on GitHub Actions it is unless the
 * variable says "false"; so the module is loaded afresh with it set.
 */
async function redirects(): Promise<Redirect[]> {
  vi.stubEnv("NEXT_PUBLIC_STATIC_EXPORT", "false");
  delete require.cache[CONFIG];
  const config = require(CONFIG) as {
    redirects?: () => Promise<Redirect[]>;
  };
  expect(config.redirects).toBeTypeOf("function");
  return config.redirects!();
}

describe("the test report redirects", () => {
  it.each(["/e2e-report", "/ci-e2e-report", "/test-reports"])(
    "send %s and its files to GitHub Pages",
    async (path) => {
      const all = await redirects();
      const pages = "https://ma3u.github.io/MinimumViableHealthDataspacev2";
      expect(all).toContainEqual({
        source: path,
        destination: `${pages}${path}/`,
        permanent: false,
      });
      expect(all).toContainEqual({
        source: `${path}/:file*`,
        destination: `${pages}${path}/:file*`,
        permanent: false,
      });
    },
  );
});
