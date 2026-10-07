// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { transform } from "lightningcss";

/**
 * The glass utilities in globals.css must survive the build with an
 * unprefixed backdrop-filter.
 *
 * Incident (2026-10-07): every rule wrote `backdrop-filter` and then
 * `-webkit-backdrop-filter`. lightningcss, which Tailwind v4 runs, keeps only
 * the last of the two, so the shipped CSS held the prefixed property alone.
 * Chrome ignores it: the sticky navigation had no blur, only 80 % opacity, and
 * the page read through it on https://ehds.mabu.red/onboarding. With the
 * prefixed one first, lightningcss keeps both (Tailwind's own backdrop-blur
 * utilities are emitted in that order).
 */

const CSS = readFileSync(
  join(__dirname, "../../../src/app/globals.css"),
  "utf8",
);

// Tailwind v4's browser targets: Safari 16.4, Chrome 111, Firefox 128.
const v = (major: number, minor = 0) => (major << 16) | (minor << 8);
const TARGETS = {
  safari: v(16, 4),
  ios_saf: v(16, 4),
  chrome: v(111),
  firefox: v(128),
};

/** Each block's declarations, for the blocks that set a backdrop-filter. */
function blocksWithBackdrop(css: string): string[][] {
  return css
    .split(/[{}]/)
    .map((body) =>
      body
        .split(";")
        .map((d) => d.replace(/\/\*[\s\S]*?\*\//g, "").trim())
        .filter((d) => d.includes(":") && !d.startsWith("@")),
    )
    .filter((decls) =>
      decls.some((d) => /^(-webkit-)?backdrop-filter\s*:/.test(d)),
    );
}

describe("backdrop-filter in globals.css", () => {
  const blocks = blocksWithBackdrop(CSS);

  it("finds the glass rules", () => {
    expect(blocks.length).toBeGreaterThanOrEqual(6);
  });

  it("writes the prefixed property before the unprefixed one", () => {
    for (const decls of blocks) {
      const prefixed = decls.findIndex((d) =>
        d.startsWith("-webkit-backdrop-filter"),
      );
      const plain = decls.findIndex((d) => d.startsWith("backdrop-filter"));
      expect(plain, decls.join("; ")).toBeGreaterThanOrEqual(0);
      expect(prefixed, decls.join("; ")).toBeLessThan(plain);
    }
  });

  it("ships an unprefixed backdrop-filter after the build's minifier", () => {
    for (const decls of blocks) {
      const out = transform({
        filename: "glass.css",
        code: Buffer.from(`.x{${decls.join(";")}}`),
        minify: true,
        targets: TARGETS,
      }).code.toString();
      expect(out, out).toMatch(/[{;]backdrop-filter:/);
      expect(out, out).toMatch(/-webkit-backdrop-filter:/);
    }
  });
});
