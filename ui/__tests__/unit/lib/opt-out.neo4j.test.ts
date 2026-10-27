/**
 * The Art. 71 opt-out statements against a real Neo4j (ADR-062), inside a
 * transaction that is rolled back, so the graph is left as it was.
 *
 * Skipped unless OPT_OUT_IT_BOLT points at a seeded Neo4j:
 *
 *   OPT_OUT_IT_BOLT=bolt://localhost:7687 npx vitest run __tests__/unit/lib/opt-out.neo4j.test.ts
 */
import neo4j, { type Transaction } from "neo4j-driver";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  OPT_OUT_CYPHER,
  OPT_OUT_HISTORY_CYPHER,
  OPTED_OUT_AS_OF_CYPHER,
  PERSON_LABELS,
  REVERSE_OPT_OUT_CYPHER,
  secondaryUseView,
} from "@/lib/opt-out";

const BOLT = process.env.OPT_OUT_IT_BOLT;

describe.skipIf(!BOLT)("the opt-out statements on Neo4j", () => {
  const driver = neo4j.driver(
    BOLT ?? "bolt://localhost:7687",
    neo4j.auth.basic(
      process.env.NEO4J_USER ?? "neo4j",
      process.env.NEO4J_PASSWORD ?? "healthdataspace",
    ),
  );
  const session = driver.session();
  let tx: Transaction;
  let patientId = "";
  // A dev graph may already hold earlier, reversed opt-outs of this person.
  let historyBefore = 0;
  const personLabels = [...PERSON_LABELS];
  const num = async (q: string, p: Record<string, unknown> = {}) =>
    Number(
      (await tx.run(q, { patientId, personLabels, ...p })).records[0].get(0),
    );

  beforeAll(async () => {
    tx = session.beginTransaction();
    const pick = await tx.run(
      `MATCH (p:Patient)-[:MAPPED_TO]->(:OMOPPerson)
       WHERE NOT p:OptedOut
       RETURN coalesce(p.id, p.resourceId, elementId(p)) AS id LIMIT 1`,
    );
    patientId = pick.records[0].get("id");
    historyBefore = (await tx.run(OPT_OUT_HISTORY_CYPHER, { patientId }))
      .records.length;
  });

  afterAll(async () => {
    await tx.rollback();
    await session.close();
    await driver.close();
  });

  it("opts out once, marks only the person's own nodes, and leaves them out of secondary use", async () => {
    const persons = await num(`MATCH (op:OMOPPerson) RETURN count(op)`);
    const first = await tx.run(OPT_OUT_CYPHER, {
      patientId,
      personLabels,
      source: "test",
    });
    const again = await tx.run(OPT_OUT_CYPHER, {
      patientId,
      personLabels,
      source: "test",
    });
    expect(first.records).toHaveLength(1);
    expect(again.records[0].get("optOutId")).toBe(
      first.records[0].get("optOutId"),
    );
    expect(Number(first.records[0].get("marked"))).toBeGreaterThan(1);

    const others = await num(
      `MATCH (n:OptedOut)
       WHERE NOT EXISTS {
         MATCH (p:Patient)-[*0..3]->(n)
         WHERE coalesce(p.id, p.resourceId, elementId(p)) = $patientId
       }
       RETURN count(n)`,
    );
    expect(others).toBe(0);
    expect(
      await num(secondaryUseView(`MATCH (op:OMOPPerson) RETURN count(op)`)),
    ).toBe(persons - 1);
    expect(
      await num(OPTED_OUT_AS_OF_CYPHER, { asOf: new Date().toISOString() }),
    ).toBeGreaterThanOrEqual(1);
  });

  it("reverses: the marker goes, the record stays, and the list as of a later date no longer has the person", async () => {
    const before = await num(OPTED_OUT_AS_OF_CYPHER, {
      asOf: new Date().toISOString(),
    });
    const rev = await tx.run(REVERSE_OPT_OUT_CYPHER, {
      patientId,
      personLabels,
      source: "test",
    });
    expect(rev.records[0].get("reversedAt")).toBeTruthy();
    expect(
      await num(
        `MATCH (p:Patient)-[*0..3]->(n:OptedOut)
         WHERE coalesce(p.id, p.resourceId, elementId(p)) = $patientId
         RETURN count(n)`,
      ),
    ).toBe(0);
    const history = await tx.run(OPT_OUT_HISTORY_CYPHER, { patientId });
    expect(history.records).toHaveLength(historyBefore + 1);
    const later = new Date(Date.now() + 3_600_000).toISOString();
    expect(await num(OPTED_OUT_AS_OF_CYPHER, { asOf: later })).toBe(before - 1);
  });
});
