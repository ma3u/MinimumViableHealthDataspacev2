/**
 * The permit records each workspace's policy hash (#833). One permit covers
 * both workspaces on ACI, each group with its own ccePolicy; with a single
 * `policyHash` the second record-permit overwrote the first, so the policies
 * page could not say which hash opens which Trustee resource.
 */
import type { Session } from "neo4j-driver";
import { describe, expect, it, vi } from "vitest";
import { recordPermit } from "../src/hub.js";

describe("recordPermit", () => {
  it("keeps the hash per workspace next to the last one recorded", async () => {
    const run = vi.fn().mockResolvedValue({ records: [] });
    const hash = `sha256:${"b".repeat(64)}`;
    await recordPermit({ run } as unknown as Session, {
      permitId: "hdab-medreg-spe-2026-001",
      policyHash: hash,
      speId: "SPE-2",
      keyPath: "default/spe-2/extract-key",
      holder: "Limburg Medical Centre",
    });
    const [cypher, params] = run.mock.calls[0];
    expect(cypher).toContain("a.policyHash = $policyHash");
    // Replaces this workspace's entry, keeps the other workspace's.
    expect(cypher).toMatch(
      /a\.policyHashBySpe = \[h IN coalesce\(a\.policyHashBySpe, \[\]\) WHERE NOT h STARTS WITH \(\$speId \+ '='\)\]\s+\+ \(\$speId \+ '=' \+ \$policyHash\)/,
    );
    expect(params).toMatchObject({ speId: "SPE-2", policyHash: hash });
  });
});
