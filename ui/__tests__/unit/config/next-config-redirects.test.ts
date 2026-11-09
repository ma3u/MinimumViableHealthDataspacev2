/**
 * /e2e-report, /ci-e2e-report and /test-reports lead to the nightly's reports
 * on GitHub Pages (#951). The server has no copy of them, and a copy it served
 * rendered blank under the app's nonce-based CSP.
 */
import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

type Redirect = { source: string; destination: string; permanent: boolean };

async function redirects(): Promise<Redirect[]> {
  const config = require("../../../next.config.js") as {
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
