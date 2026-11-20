/**
 * meta.profile claims only what validated (#1144). The facade names a profile
 * in meta.profile when, and only when, every resource of that class in the
 * facade sample passed it in scripts/eehrxf/validation-report.json (source
 * `facade`). A claim that stops validating, or a profile the facade starts
 * to pass without claiming it, fails this test.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { claimedProfiles, PROFILE_CLAIMS } from "../src/fhir-profiles.js";

const EEHRXF = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "scripts",
  "eehrxf",
);
const read = (name: string) =>
  JSON.parse(readFileSync(join(EEHRXF, name), "utf8"));

interface ReportProfile {
  canonical: string;
  tested: number;
  passed: number;
  bySource: Record<string, { tested: number; passed: number }>;
}
interface ConfigProfile {
  profileId: string;
  canonical: string;
  baseResource: string;
  sourceFilter?: string;
}

const report = read("validation-report.json");
const config = read("profiles.json");
const sample = read("samples/facade-sample.json") as {
  entry: Array<{ resource: Record<string, unknown> }>;
};

const reported: Record<string, ReportProfile> = {
  ...report.profiles,
  ...(report.national?.profiles ?? {}),
};
const configured: ConfigProfile[] = [
  ...config.profiles,
  ...(config.national?.profiles ?? []),
];
/** validate.py validates at most this many resources per profile and source. */
const MAX_PER_SOURCE: number = report.validator.maxPerSource;

const facade = (p: ReportProfile) => p.bySource.facade;

/** The category a claim needs, from validate.py's sourceFilter. */
function claimCategory(p: ConfigProfile): string | undefined {
  if (!p.sourceFilter) return undefined;
  if (p.sourceFilter === "laboratory") return "laboratory";
  throw new Error(
    `${p.profileId}: claimedProfiles() knows no counterpart of sourceFilter ${p.sourceFilter}`,
  );
}

describe("meta.profile claims (#1144)", () => {
  it("the report has validated the facade sample as it is now", () => {
    expect(report.sources.facade?.files).toEqual([
      "scripts/eehrxf/samples/facade-sample.json",
    ]);
    // A different count means the sample changed after the last run.
    expect(report.sources.facade.resources).toBe(sample.entry.length);
  });

  it("claims exactly the profiles every tested facade resource passed", () => {
    const passed = Object.entries(reported)
      .filter(([, p]) => facade(p) && facade(p).tested > 0)
      .filter(([, p]) => facade(p).passed === facade(p).tested)
      .map(([id]) => id)
      .sort();
    expect(PROFILE_CLAIMS.map((c) => c.profileId).sort()).toEqual(passed);
  });

  it("names each claimed profile as profiles.json and the report do", () => {
    for (const claim of PROFILE_CLAIMS) {
      const cfg = configured.find((p) => p.profileId === claim.profileId);
      expect(cfg, claim.profileId).toBeDefined();
      expect(claim.canonical).toBe(cfg!.canonical);
      expect(claim.canonical).toBe(reported[claim.profileId].canonical);
      expect(claim.resourceType).toBe(cfg!.baseResource);
      expect(claim.category).toBe(claimCategory(cfg!));
    }
  });

  it("had every resource a claim covers validated, none left over the cap", () => {
    for (const claim of PROFILE_CLAIMS) {
      const covered = sample.entry.filter((e) =>
        claimedProfiles(e.resource).includes(claim.canonical),
      ).length;
      expect(covered, claim.profileId).toBeGreaterThan(0);
      expect(covered, claim.profileId).toBeLessThanOrEqual(MAX_PER_SOURCE);
      expect(facade(reported[claim.profileId]).tested, claim.profileId).toBe(
        covered,
      );
    }
  });

  it("writes the claims into the sample's resources and nothing else", () => {
    for (const { resource } of sample.entry) {
      const meta = resource.meta as { profile?: string[] } | undefined;
      expect(
        meta?.profile ?? [],
        `${resource.resourceType}/${resource.id}`,
      ).toEqual(claimedProfiles(resource));
    }
  });
});
