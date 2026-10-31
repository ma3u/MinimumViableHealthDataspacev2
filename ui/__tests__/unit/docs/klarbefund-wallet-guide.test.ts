// @vitest-environment node
/**
 * The wallet pages tell a person what to press (#708, PR #767). Every label
 * they name must exist where it is rendered, or the guide sends the reader to
 * a button that is not there.
 *
 * The labels are not listed here: they are the bold text of the two sections
 * below, read from the documents on every run. Two kinds of bold are not
 * labels and are skipped: a bold line on its own (a paragraph heading such as
 * "You have Klarbefund first, and add the wallet later") and bold that ends a
 * sentence (emphasis such as "a wallet sign-in never links."). A path like
 * "Connect to EHDS › Create an EHDS account" is checked part by part.
 *
 * Where a label lives is read from the document too: the nearest "app",
 * "page" or "website" before it in the same step, paragraph or table row.
 * "app" means the Klarbefund app (`clients/ios/Sources`, an English string
 * literal in Swift that `de.lproj/Localizable.strings` translates; English is
 * the base language, so `en.lproj` holds no overrides); anything else means
 * the website (`ui/src`, without the docs pages, which quote the guide). The
 * wallet's name is `CITIZEN_WALLET.name` in the web source, so
 * `{CITIZEN_WALLET.name}` there reads as "d-you".
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { CITIZEN_WALLET } from "@/lib/wallet-config";

const REPO = path.resolve(__dirname, "../../../..");

const DOCUMENTS = [
  {
    file: "docs/klarbefund/user-guide.md",
    section: "Your EUDI wallet, if you want one",
  },
  {
    file: "docs/knowledge/runbooks/klarbefund-connect.md",
    section: "A wallet on the same account (ADR-067)",
  },
] as const;

type Surface = "app" | "website";

interface Label {
  label: string;
  surface: Surface;
  document: string;
}

/**
 * The prose lines of one section, from its heading to the next heading of its
 * level or above. Fenced code is left out: a `# comment` in a bash block is
 * not a heading, and nothing in a code block is a label.
 */
function sectionOf(file: string, heading: string): string[] {
  const lines = fs.readFileSync(path.join(REPO, file), "utf8").split("\n");
  let fenced = false;
  const prose = lines.map((l) => {
    if (/^\s*```/.test(l)) {
      fenced = !fenced;
      return "";
    }
    return fenced ? "" : l;
  });
  const levelOf = (l: string) => /^(#{1,6}) /.exec(l)?.[1].length ?? 0;
  const start = prose.findIndex(
    (l) => levelOf(l) > 0 && l.replace(/^#+ /, "") === heading,
  );
  if (start < 0) {
    throw new Error(`${file} has no section "${heading}" any more`);
  }
  const level = levelOf(prose[start]);
  const end = prose.findIndex(
    (l, i) => i > start && levelOf(l) > 0 && levelOf(l) <= level,
  );
  return prose.slice(start + 1, end < 0 ? undefined : end);
}

/** Paragraphs, list items and table rows, each joined into one line. */
function blocksOf(lines: string[]): string[] {
  const blocks: string[] = [];
  let current: string[] = [];
  const flush = () => {
    if (current.length) blocks.push(current.join(" "));
    current = [];
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flush();
    } else if (/^(\d+\.|[-*]) /.test(line) || line.startsWith("|")) {
      flush();
      current.push(line);
    } else {
      current.push(line);
    }
  }
  flush();
  return blocks;
}

function labelsOf(document: (typeof DOCUMENTS)[number]): Label[] {
  const labels: Label[] = [];
  for (const block of blocksOf(sectionOf(document.file, document.section))) {
    for (const m of block.matchAll(/\*\*(.+?)\*\*/g)) {
      const bold = m[1].trim();
      if (block === m[0]) continue; // a paragraph heading
      if (/[.:!?]$/.test(bold)) continue; // emphasis, not a label
      const before = block.slice(0, m.index);
      const words = [...before.matchAll(/\b(app|page|website)\b/gi)];
      const surface: Surface =
        words.at(-1)?.[1].toLowerCase() === "app" ? "app" : "website";
      for (const part of bold.split("›")) {
        labels.push({ label: part.trim(), surface, document: document.file });
      }
    }
  }
  return labels;
}

function filesUnder(dir: string, ext: RegExp, skip: string[] = []): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (skip.some((s) => full.startsWith(path.join(REPO, s)))) continue;
    if (entry.isDirectory()) out.push(...filesUnder(full, ext, skip));
    else if (ext.test(entry.name)) out.push(full);
  }
  return out;
}

/** Source without its comments, so a label named only in a comment does not count. */
function withoutComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

/** What the website renders: every .ts and .tsx under ui/src but the docs. */
const WEB = filesUnder(path.join(REPO, "ui/src"), /\.tsx?$/, [
  "ui/src/app/docs",
  "ui/src/lib/docs",
  "ui/src/content",
])
  .map((f) => withoutComments(fs.readFileSync(f, "utf8")))
  .join("\n")
  .replace(/\$?\{\s*(?:CITIZEN_)?WALLET\.name\s*\}/g, CITIZEN_WALLET.name)
  .replace(/\s+/g, " ");

const IOS = path.join(REPO, "clients/ios/Sources");
const SWIFT = filesUnder(IOS, /\.swift$/)
  .map((f) => withoutComments(fs.readFileSync(f, "utf8")))
  .join("\n");
const GERMAN = fs.readFileSync(
  path.join(IOS, "MeinBefund/de.lproj/Localizable.strings"),
  "utf8",
);

const LABELS = DOCUMENTS.flatMap(labelsOf);

describe("the wallet pages of the Klarbefund guide and runbook name real labels", () => {
  it.each(DOCUMENTS)("$file names labels in its section", ({ file }) => {
    expect(
      LABELS.filter((l) => l.document === file).length,
      `${file}: no bold label found; was the section rewritten?`,
    ).toBeGreaterThan(0);
  });

  it.each(LABELS)(
    '"$label" ($surface) from $document exists',
    ({ label, surface, document }) => {
      if (surface === "website") {
        expect(
          WEB.includes(label),
          `"${label}" in ${document} is a website label, but nothing under ui/src renders it`,
        ).toBe(true);
        return;
      }
      expect(
        SWIFT.includes(JSON.stringify(label)),
        `"${label}" in ${document} is an app label, but no Swift source under clients/ios/Sources has the string`,
      ).toBe(true);
      expect(
        GERMAN.includes(`${JSON.stringify(label)} =`),
        `"${label}" in ${document} is an app label, but de.lproj/Localizable.strings does not translate it`,
      ).toBe(true);
    },
  );
});
