/**
 * No page links inside the app with a bare <a href="/...">.
 *
 * The GitHub Pages build is served under /MinimumViableHealthDataspacev2.
 * next/link adds that base path; a plain anchor does not, so its target is
 * ma3u.github.io/<path>, outside the site, and GitHub answers 404. That is
 * what the negotiation history's "Transferencia" link did (#876). Use
 * <Link> for a page, and `${BASE_PATH}/file` for a file in public/.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";

const SRC = path.resolve(__dirname, "../../../src");
const RAW_INTERNAL_ANCHOR =
  /<a\b(?:(?!>)[\s\S])*?\bhref=(?:"(\/[^"]*)"|\{`(\/[^`]*)`\}|\{"(\/[^"]*)"\})/g;

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return tsxFiles(full);
    return full.endsWith(".tsx") ? [full] : [];
  });
}

describe("internal links carry the base path", () => {
  it("finds no bare <a href> to a path inside the app", () => {
    const offenders = tsxFiles(SRC).flatMap((file) => {
      const text = readFileSync(file, "utf-8");
      return [...text.matchAll(RAW_INTERNAL_ANCHOR)].map((m) => {
        const line = text.slice(0, m.index).split("\n").length;
        const href = (m[1] ?? m[2] ?? m[3]).split(/[?$\n]/)[0];
        return `${path.relative(SRC, file)}:${line} ${href}`;
      });
    });
    expect(offenders).toEqual([]);
  });

  it("would catch the link that sent Ana to a 404", () => {
    const sample = `<a\n  href={\`/data/transfer?participantId=\${id}\`}\n  className="x"\n>`;
    expect([...sample.matchAll(RAW_INTERNAL_ANCHOR)]).toHaveLength(1);
  });
});
