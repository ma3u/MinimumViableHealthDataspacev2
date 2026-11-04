// @vitest-environment node
/**
 * scripts/gen-docs-content.py writes the translations of the published
 * documents (ADR-071): docs/i18n/<lang>/<path below docs/> with a
 * frontmatter (source, sourceHash, language) becomes
 * ui/public/published-docs/i18n/<lang>/<section>/<slug>.json, listed in
 * ui/src/content/published-docs-i18n.json as current or stale.
 *
 * The real script runs against a copy of the repository in a temp dir:
 * every published source as a stub, the SBOM README with a link, an image
 * and a German variant of the image, and translations made for the test.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import published from "@/content/published-docs.json";

const SCRIPT = resolve(__dirname, "../../../../scripts/gen-docs-content.py");
const ENGLISH = `# Software bills of materials

One file per part. See the [self-assessment](../klarbefund/self-assessment.md).

![The flow](img/flow.png)
`;

let root: string;

function put(rel: string, body: string | Buffer) {
  const p = join(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, body);
}

function gen(...args: string[]) {
  const r = spawnSync("python3", [SCRIPT, "--root", root, ...args], {
    encoding: "utf8",
  });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

function json(rel: string) {
  return JSON.parse(readFileSync(join(root, rel), "utf8"));
}

const INDEX = "ui/src/content/published-docs-i18n.json";
const DE = "ui/public/published-docs/i18n/de/security/sbom.json";
const FR = "ui/public/published-docs/i18n/fr/security/sbom.json";

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "docs-i18n-"));
  for (const d of published.docs) {
    put(d.source, `# ${d.slug}\n\nStub.\n`);
  }
  put("docs/sbom/README.md", ENGLISH);
  put("docs/sbom/img/flow.png", Buffer.from("english png"));
  put("docs/sbom/img/flow.de.png", Buffer.from("german png"));
  // German, stamped by the script against the English now.
  put(
    "docs/i18n/de/sbom/README.md",
    "# Software-Stücklisten\n\nEine Datei je Teil. Siehe die [Selbstbewertung](../klarbefund/self-assessment.md).\n\n![Der Ablauf](img/flow.png)\n",
  );
  // French, against an English that is not this one: stale from the start.
  put(
    "docs/i18n/fr/sbom/README.md",
    `---\nsource: docs/sbom/README.md\nsourceHash: ${"0".repeat(
      64,
    )}\nlanguage: fr\n---\n\n# Nomenclatures logicielles\n\n![Le flux](img/flow.png)\n`,
  );
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("gen-docs-content.py and the translations", () => {
  it("stamps a translation's frontmatter against the English file", () => {
    expect(gen("--stamp", "docs/i18n/de/sbom/README.md").code).toBe(0);
    const text = readFileSync(
      join(root, "docs/i18n/de/sbom/README.md"),
      "utf8",
    );
    expect(text).toMatch(
      /^---\nsource: docs\/sbom\/README\.md\nsourceHash: [0-9a-f]{64}\nlanguage: de\n---\n\n# Software-Stücklisten/,
    );
  });

  it("keeps a summary quoted when it is restamped", () => {
    // A summary with ": " is not a plain YAML scalar; stamping used to drop
    // its quotes, and a parser then read "Wie: a" as a nested mapping (#839).
    const summary = 'Wie eine Änderung den Hub erreicht: Hooks, "PR Gate"';
    put(
      "docs/i18n/de/sbom/README.md",
      `---\nsource: docs/sbom/README.md\nsourceHash: ${"0".repeat(
        64,
      )}\nlanguage: de\nsummary: ${JSON.stringify(
        summary,
      )}\n---\n\n# Software-Stücklisten\n`,
    );
    expect(gen("--stamp", "docs/i18n/de/sbom/README.md").code).toBe(0);
    expect(gen("--stamp", "docs/i18n/de/sbom/README.md").code).toBe(0);
    const text = readFileSync(
      join(root, "docs/i18n/de/sbom/README.md"),
      "utf8",
    );
    expect(text).toContain(`\nsummary: ${JSON.stringify(summary)}\n`);
    expect(gen().code).toBe(0);
    expect(json(INDEX).docs["security/sbom"].de.summary).toBe(summary);
  });

  it("writes each translation and lists it as current or stale", () => {
    gen("--stamp", "docs/i18n/de/sbom/README.md");
    const r = gen();
    expect(r.code, r.err).toBe(0);

    expect(json(INDEX).languages).toEqual(["de", "fr", "nl", "es"]);
    expect(json(INDEX).docs).toEqual({
      "security/sbom": {
        de: { status: "current", title: "Software-Stücklisten" },
        fr: { status: "stale", title: "Nomenclatures logicielles" },
      },
    });

    const de = json(DE);
    expect(de).toMatchObject({
      section: "security",
      slug: "sbom",
      language: "de",
      source: "docs/sbom/README.md",
      translation: "docs/i18n/de/sbom/README.md",
    });
    // Links and images resolve against the English file's folder.
    expect(de.markdown).toContain(
      "[Selbstbewertung](/docs/security/klarbefund-self-assessment)",
    );
    // The German variant of the image, copied next to the English one.
    expect(de.markdown).toContain(
      "![Der Ablauf](__BASE_PATH__/published-docs/flow.de.png)",
    );
    expect(
      readFileSync(join(root, "ui/public/published-docs/flow.de.png"), "utf8"),
    ).toBe("german png");
    // No French variant: the English image.
    expect(json(FR).markdown).toContain(
      "![Le flux](__BASE_PATH__/published-docs/flow.png)",
    );

    expect(gen("--check").code).toBe(0);
  });

  it("marks a translation stale when the English changes, without failing on it", () => {
    gen("--stamp", "docs/i18n/de/sbom/README.md");
    gen();
    put("docs/sbom/README.md", ENGLISH + "\nA new paragraph.\n");

    // The copy and the index are out of date, as for any English edit ...
    const check = gen("--check");
    expect(check.code).toBe(1);
    expect(check.err).toContain(`${INDEX} is stale`);

    // ... and once regenerated the translation is listed as stale, not refused.
    expect(gen().code).toBe(0);
    expect(json(INDEX).docs["security/sbom"].de.status).toBe("stale");
    expect(gen("--check").code).toBe(0);

    const report = gen("--report-i18n");
    expect(report.code).toBe(0);
    expect(report.out).toContain(
      `de: 1/${published.docs.length} translated, 1 stale, ${
        published.docs.length - 1
      } missing`,
    );
    expect(report.out).toContain(
      "stale    docs/i18n/de/sbom/README.md (English docs/sbom/README.md changed)",
    );
    expect(report.out).toContain("missing  docs/i18n/nl/sbom/README.md");

    // Stamped again after the translation is updated: current.
    gen("--stamp", "docs/i18n/de/sbom/README.md");
    gen();
    expect(json(INDEX).docs["security/sbom"].de.status).toBe("current");
  });

  it("removes the copy of a translation that is gone", () => {
    gen("--stamp", "docs/i18n/de/sbom/README.md");
    gen();
    rmSync(join(root, "docs/i18n/fr/sbom/README.md"));
    const check = gen("--check");
    expect(check.code).toBe(1);
    expect(check.err).toContain(`${FR} has no translation behind it`);
    expect(gen().code).toBe(0);
    expect(existsSync(join(root, FR))).toBe(false);
    expect(Object.keys(json(INDEX).docs["security/sbom"])).toEqual(["de"]);
  });

  it("refuses a translation in the wrong place or without its frontmatter", () => {
    put(
      "docs/i18n/de/elsewhere/README.md",
      `---\nsource: docs/sbom/README.md\nsourceHash: ${"0".repeat(
        64,
      )}\nlanguage: de\n---\n\n# X\n`,
    );
    put("docs/i18n/nl/sbom/README.md", "# Geen frontmatter\n");
    const r = gen("--check");
    expect(r.code).toBe(1);
    expect(r.err).toContain(
      "docs/i18n/de/elsewhere/README.md: a translation of docs/sbom/README.md belongs at docs/i18n/de/sbom/README.md",
    );
    expect(r.err).toContain("docs/i18n/nl/sbom/README.md: no frontmatter");
  });

  it("refuses a relative link that does not resolve from the English folder", () => {
    // Written as if from docs/i18n/de/sbom/, where the Markdown checker
    // would look; the generator resolves it from docs/sbom/ instead.
    put(
      "docs/i18n/de/sbom/README.md",
      "# X\n\nSiehe [hier](../../../klarbefund/self-assessment.md).\n",
    );
    gen("--stamp", "docs/i18n/de/sbom/README.md");
    const r = gen("--check");
    expect(r.code).toBe(1);
    expect(r.err).toContain(
      "docs/i18n/de/sbom/README.md: ../../../klarbefund/self-assessment.md does not exist next to docs/sbom/README.md",
    );
  });
});
