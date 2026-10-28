/**
 * Demo Smoke runs the Bruno collection against the live hub, and its two
 * journeys file a whole procedure each time. Without a clean-up /compliance
 * filled with identical revoked PharmaCo permits (2026-10-28). This pins the
 * pieces that remove them: the marker the journeys write, the Cypher that
 * finds them by it, the seed phase that runs it and the job that starts it.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "../../../..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf-8");

const cleanup = read("neo4j/remove-api-collection-runs.cypher");
const seedSh = read("neo4j/seed.sh");
const seedWorkflow = read(".github/workflows/neo4j-seed.yml");
const demoSmoke = read(".github/workflows/demo-smoke.yml");
const statements = cleanup
  .split("\n")
  .filter((l) => !l.trim().startsWith("//"))
  .join("\n");

describe("the API collection cleans up after itself on the live hub", () => {
  it("both journeys mark what they file with 'Bruno:'", () => {
    expect(
      read(
        "bruno/MVHDv2/07 Journey - Data permit/02 Data user applies (Art. 67(2), eleven items).bru",
      ),
    ).toMatch(/"name": "Bruno: /);
    expect(
      read(
        "bruno/MVHDv2/08 Journey - Data request/01 Data user asks a question (Art. 69).bru",
      ),
    ).toMatch(/"question": "Bruno: /);
  });

  it("removes only what hangs off a marked application or request", () => {
    expect(statements).toMatch(/app\.name STARTS WITH 'Bruno:'/);
    expect(statements).toMatch(/r\.question STARTS WITH 'Bruno:'/);
    // Every MATCH starts from a marked node or from what links to one.
    const firstMatches = statements.match(/^MATCH .*$/gm) ?? [];
    expect(firstMatches).toEqual([
      "MATCH (app:AccessApplication)",
      "MATCH (r:HealthDataRequest)",
    ]);
  });

  it("never touches the hash-chained audit trail (ADR-045)", () => {
    for (const label of ["AuditEvent", "TransferEvent", "AuditLog"]) {
      expect(statements).not.toContain(label);
    }
  });

  it("seed.sh runs it as the api-cleanup phase and fails if any are left", () => {
    expect(seedSh).toMatch(/SEED_PHASE:-\}" = "api-cleanup"/);
    expect(seedSh).toContain("/seed/remove-api-collection-runs.cypher");
    expect(seedSh).toMatch(/failed\+=\("API collection runs left/);
  });

  it("the seed workflow offers the phase, also when called, one run at a time", () => {
    expect(seedWorkflow).toMatch(/- api-cleanup/);
    expect(seedWorkflow).toMatch(/workflow_call:/);
    expect(seedWorkflow).toMatch(/group: neo4j-seed-job/);
  });

  it("Demo Smoke starts it after the collection, on main only", () => {
    const job = demoSmoke.slice(demoSmoke.indexOf("\n  cleanup:"));
    expect(job).toMatch(/needs: \[live, bruno\]/);
    expect(job).toMatch(/github\.ref == 'refs\/heads\/main'/);
    expect(job).toMatch(/uses: \.\/\.github\/workflows\/neo4j-seed\.yml/);
    expect(job).toMatch(/phase: api-cleanup/);
  });
});
