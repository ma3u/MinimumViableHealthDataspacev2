/**
 * Verifies the query audit chain in Neo4j (ADR-045 plane 2, #418): reads every
 * record in order and recomputes each hash and link. Exit 0 intact, 1 broken,
 * 2 could not read. Run through scripts/verify-audit-chain.sh.
 */
import neo4j from "neo4j-driver";
import { NEO4J_PASSWORD, NEO4J_URI, NEO4J_USER } from "../config.js";
import { setDriver } from "../db.js";
import { QUERY_CHAIN, readChain, verifyChain } from "../audit-chain.js";

const chain = process.argv[2] ?? QUERY_CHAIN;
const driver = neo4j.driver(
  NEO4J_URI,
  neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD),
);
setDriver(driver);

try {
  const events = await readChain(chain);
  const check = verifyChain(events);
  if (check.ok) {
    console.log(
      `audit chain "${chain}": intact, ${check.count} record(s), head ${check.head}`,
    );
    process.exitCode = 0;
  } else {
    console.error(
      `audit chain "${chain}": BROKEN at seq ${check.seq}: ${check.reason}`,
    );
    process.exitCode = 1;
  }
} catch (err) {
  console.error(`audit chain "${chain}": could not be read:`, err);
  process.exitCode = 2;
} finally {
  await driver.close();
}
