/**
 * Demo data names fictional organisations only (.claude/rules/code-style.md).
 *
 * scripts/generate-graph-seed.py wrote six real organisations into the graph
 * as participants, and dataset titles naming real agencies; on 2026-11-16 they
 * showed on /data/discover of a local stack. This test reads every file that
 * writes graph or mock data and fails on the names the policy forbids and on
 * the ones that generator used.
 *
 * Real names that are allowed behind NEXT_PUBLIC_DEMO_TK (TK, gematik) live in
 * ui/src/lib/journey-config.ts, which is not scanned here.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const REPO = path.resolve(__dirname, "../../../..");

// The directories whose files write graph, seed or mock data.
const SCANNED = ["neo4j", "scripts", "jad", "ui/public/mock"];
const TEXT_EXT = new Set([".cypher", ".py", ".sh", ".json", ".ts", ".js"]);
const SKIP_DIRS = new Set(["node_modules", ".venv", "__pycache__", ".git"]);

// The migration has to name the old ids to rename them.
const ALLOWED_FILES = new Set(["neo4j/migrate-fictional-organisations.cypher"]);

const FORBIDDEN: { name: string; re: RegExp }[] = [
  // The policy's own list.
  { name: "Charité", re: /\bCharit(?:é|e\b)/i },
  { name: "Bayer", re: /\bBayer\b/ },
  { name: "BfArM", re: /\bBfArM\b/i },
  { name: "Zuyderland", re: /Zuyderland/i },
  { name: "INSERM", re: /\bINSERM\b/ },
  // What scripts/generate-graph-seed.py used to write.
  { name: "Helsinki University Hospital", re: /Helsinki University Hospital/i },
  { name: "Karolinska", re: /Karolinska/i },
  { name: "Centro Hospitalar", re: /Centro Hospitalar/i },
  { name: "Polskie Centrum Zdrowia", re: /Polskie Centrum Zdrowia/i },
  { name: "European Medicines Agency", re: /European Medicines Agency/i },
  { name: "ECDC", re: /\bECDC\b/i },
  { name: "EudraVigilance", re: /EudraVigilance/i },
  { name: "Eurotransplant", re: /Euro ?transplant/i },
  {
    name: "a real organisation's did:web",
    re: /did:web:(?:hus\.fi|ki\.se|chlisboa\.pt|pcz\.pl|ema\.europa\.eu|ecdc\.europa\.eu)\b/,
  },
];

function walk(dir: string, out: string[]): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(path.join(dir, entry.name), out);
    } else if (TEXT_EXT.has(path.extname(entry.name))) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

const files = SCANNED.flatMap((d) => walk(path.join(REPO, d), []))
  .map((f) => path.relative(REPO, f))
  .filter((f) => !ALLOWED_FILES.has(f));

describe("demo data names fictional organisations only", () => {
  it("scans the generator, the seeds and the mocks", () => {
    expect(files).toContain("scripts/generate-graph-seed.py");
    expect(files).toContain("neo4j/seed-catalog-translations.cypher");
    expect(files.some((f) => f.startsWith("ui/public/mock/"))).toBe(true);
  });

  it("finds no forbidden organisation in them", () => {
    const hits: string[] = [];
    for (const rel of files) {
      const lines = fs.readFileSync(path.join(REPO, rel), "utf-8").split("\n");
      lines.forEach((line, i) => {
        for (const { name, re } of FORBIDDEN) {
          if (re.test(line)) hits.push(`${rel}:${i + 1} names ${name}`);
        }
      });
    }
    expect(hits).toEqual([]);
  });

  it("catches a real name the way the generator used to write it", () => {
    const line = `("Helsinki University Hospital", "did:web:hus.fi:clinic", "DATA_HOLDER"),`;
    const caught = FORBIDDEN.filter(({ re }) => re.test(line)).map(
      (f) => f.name,
    );
    expect(caught).toEqual([
      "Helsinki University Hospital",
      "a real organisation's did:web",
    ]);
  });
});
