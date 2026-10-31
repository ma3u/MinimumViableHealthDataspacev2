/**
 * Art. 71 (ADR-062) across the SPE boundary (ADR-069): a person who opts out
 * on the hub after the extract was sealed stops counting in the workspace's
 * secondary-use answers after one sync, and counts again after the reversal.
 *
 * Needs two throwaway Neo4j databases (it writes and deletes test nodes):
 *
 *   SPE_OPTOUT_IT_HUB=bolt://localhost:17691 SPE_OPTOUT_IT_WORKSPACE=bolt://localhost:17692 \
 *     npx vitest run __tests__/spe-optout.neo4j.test.ts
 */
import neo4j, { type Driver } from "neo4j-driver";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setDriver } from "../src/db.js";
import { secondaryUseView } from "../src/opt-out.js";
import { syncOptOuts } from "../src/spe-status.js";

const HUB = process.env.SPE_OPTOUT_IT_HUB;
const WORKSPACE = process.env.SPE_OPTOUT_IT_WORKSPACE;
const auth = neo4j.auth.basic(
  process.env.NEO4J_USER ?? "neo4j",
  process.env.NEO4J_PASSWORD ?? "healthdataspace",
);
const IDS = ["it-oo-1", "it-oo-2", "it-oo-3", "it-oo-4", "it-oo-5", "it-oo-6"];

describe.skipIf(!HUB || !WORKSPACE)("opt-outs reach the workspace", () => {
  let hub: Driver;
  let ws: Driver;

  const write = (d: Driver, q: string, p: Record<string, unknown> = {}) =>
    d.executeQuery(q, p, { database: "neo4j" });
  // What a federated secondary-use count asks the workspace (k = 5 is applied
  // afterwards, on the merged answer; here the raw count is the point).
  const counted = async () => {
    const q = secondaryUseView(
      "MATCH (p:Patient) WHERE p._speKey STARTS WITH 'it-oo-' RETURN count(p) AS c",
    );
    const r = await ws.executeQuery(q, {}, { database: "neo4j" });
    return r.records[0].get("c").toNumber();
  };
  const sync = () =>
    syncOptOuts(hub, [{ id: "SPE-2", driver: ws, read: null }]);

  beforeAll(async () => {
    hub = neo4j.driver(HUB!, auth);
    ws = neo4j.driver(WORKSPACE!, auth);
    setDriver(hub);
    await write(
      hub,
      "UNWIND $ids AS id MERGE (p:Patient {id: id}) ON CREATE SET p.it = true REMOVE p:OptedOut",
      { ids: IDS },
    );
    await write(
      ws,
      "UNWIND $ids AS id MERGE (p:Patient {_speKey: id}) ON CREATE SET p.it = true REMOVE p:OptedOut",
      { ids: IDS },
    );
  });

  afterAll(async () => {
    await write(hub, "MATCH (p:Patient) WHERE p.it = true DETACH DELETE p");
    await write(ws, "MATCH (p:Patient) WHERE p.it = true DETACH DELETE p");
    await hub.close();
    await ws.close();
  });

  it("an opt-out on the hub stops counting after one sync, its reversal counts again", async () => {
    expect(await counted()).toBe(6);

    await write(hub, "MATCH (p:Patient {id: 'it-oo-3'}) SET p:OptedOut");
    expect(await counted()).toBe(6); // not yet: the workspace has its own copy
    const [added] = await sync();
    expect(added).toMatchObject({ id: "SPE-2", added: 1, removed: 0 });
    expect(await counted()).toBe(5);

    const [again] = await sync();
    expect(again).toMatchObject({ added: 0, removed: 0 }); // idempotent

    await write(hub, "MATCH (p:Patient {id: 'it-oo-3'}) REMOVE p:OptedOut");
    const [reversed] = await sync();
    expect(reversed).toMatchObject({ added: 0, removed: 1 });
    expect(await counted()).toBe(6);
  });
});
