/**
 * Tests for /api/graph/expand/route.ts
 *
 * The route fetches outgoing + incoming neighbours for a given node and
 * applies per-label caps (e.g. Observation=10) so a single click doesn't
 * flood the graph with thousands of nodes. Tests cover:
 *   - Missing ?id= parameter → 400
 *   - Neo4j failure → 502
 *   - Happy path: in/out neighbours merged, edges oriented correctly
 *   - Per-label cap (Observation=10) truncates noisy labels
 *   - Deduplication across out/in directions
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRunQuery = vi.fn();
vi.mock("@/lib/neo4j", () => ({
  runQuery: (...args: unknown[]) => mockRunQuery(...args),
}));

import { GET } from "@/app/api/graph/expand/route";

function makeReq(qs = ""): Request {
  return new Request(`http://localhost/api/graph/expand${qs}`);
}

describe("GET /api/graph/expand", () => {
  beforeEach(() => {
    mockRunQuery.mockReset();
  });

  it("returns 400 when id is missing", async () => {
    const res = await GET(makeReq(""));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("id");
    expect(mockRunQuery).not.toHaveBeenCalled();
  });

  it("returns 502 when Neo4j is unavailable", async () => {
    mockRunQuery.mockRejectedValue(new Error("ECONNREFUSED"));
    const res = await GET(makeReq("?id=abc"));
    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.error).toBe("Neo4j unavailable");
  });

  it("merges outgoing and incoming neighbours with correctly oriented edges", async () => {
    // First call = outgoing, second call = incoming
    mockRunQuery
      .mockResolvedValueOnce([
        {
          nId: "n-out-1",
          nLabels: ["Participant"],
          nName: "AlphaKlinik Berlin",
          relType: "OFFERS",
        },
      ])
      .mockResolvedValueOnce([
        {
          nId: "n-in-1",
          nLabels: ["Contract"],
          nName: "c-1",
          relType: "COVERS",
        },
      ]);

    const res = await GET(makeReq("?id=src-1"));
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.nodes).toHaveLength(2);
    expect(data.links).toHaveLength(2);

    const out = data.links.find(
      (l: { source: string }) => l.source === "src-1",
    );
    expect(out.target).toBe("n-out-1");
    expect(out.type).toBe("OFFERS");

    const inc = data.links.find(
      (l: { target: string }) => l.target === "src-1",
    );
    expect(inc.source).toBe("n-in-1");
    expect(inc.type).toBe("COVERS");
  });

  it("deduplicates neighbours reachable via both directions", async () => {
    mockRunQuery
      .mockResolvedValueOnce([
        { nId: "dup", nLabels: ["Patient"], nName: "P1", relType: "R1" },
      ])
      .mockResolvedValueOnce([
        { nId: "dup", nLabels: ["Patient"], nName: "P1", relType: "R2" },
      ]);

    const res = await GET(makeReq("?id=src-1"));
    const data = await res.json();
    expect(data.nodes).toHaveLength(1);
    // Only the first (outgoing) edge is kept because the second row is
    // filtered by the seen-set; this matches the documented behaviour.
    expect(data.links).toHaveLength(1);
  });

  it("applies per-label cap for noisy labels like Observation", async () => {
    const many = Array.from({ length: 25 }, (_, i) => ({
      nId: `o-${i}`,
      nLabels: ["Observation"],
      nName: `obs-${i}`,
      relType: "HAS_OBSERVATION",
    }));
    mockRunQuery.mockResolvedValueOnce(many).mockResolvedValueOnce([]);

    const res = await GET(makeReq("?id=patient-1"));
    const data = await res.json();
    // LABEL_LIMIT for Observation is 10 — see route.ts:20
    expect(data.nodes).toHaveLength(10);
  });

  it("applies role-specific colors to known labels", async () => {
    mockRunQuery
      .mockResolvedValueOnce([
        {
          nId: "tc-1",
          nLabels: ["TrustCenter"],
          nName: "MedReg DE",
          relType: "GOVERNED_BY",
        },
      ])
      .mockResolvedValueOnce([]);

    const res = await GET(makeReq("?id=src-1"));
    const data = await res.json();
    const node = data.nodes[0];
    expect(node.label).toBe("TrustCenter");
    expect(node.expandable).toBe(true);
    // Color should be a hex string from NODE_ROLE_COLORS or LAYER_COLORS
    expect(node.color).toMatch(/^#[0-9a-fA-F]{3,6}$/);
  });
});
