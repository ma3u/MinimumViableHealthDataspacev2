import { randomUUID } from "node:crypto";
import type { Response } from "express";
import type { Session } from "neo4j-driver";
import { logger } from "./logger.js";

// ---- One id per federated query (ADR-100 decision 4, #1236) -----------------
//
// Draft SPE implementing act, Art. 18(2)(f): logging across the federation
// that joins each instance's logs. The coordinator gives every federated
// query one id. It is on the coordinator's QueryAuditEvent, in the answer and
// its X-Federation-Query-Id header, on every log line of the query beside the
// W3C trace_id, and it travels to each workspace as the transaction's
// metadata. Until the workspace gateway (ADR-100 decision 2) writes its own
// SpeEvent with the id, the coordinator logs one dispatch line per workspace.

/** The third argument of Session.run (the driver does not export its name). */
export type TransactionConfig = NonNullable<Parameters<Session["run"]>[2]>;

export const FEDERATION_QUERY_HEADER = "X-Federation-Query-Id";

/** A new id for one federated query. */
export function newFederationQueryId(): string {
  return randomUUID();
}

/** The transaction config that carries the id into a workspace's session. */
export function federationTxConfig(
  federationQueryId: string,
): TransactionConfig {
  return { metadata: { federationQueryId, app: "mvhd-federation" } };
}

/** Puts the id on the answer's header before the body is sent. */
export function tagFederatedResponse(
  res: Response,
  federationQueryId: string,
): void {
  res.setHeader(FEDERATION_QUERY_HEADER, federationQueryId);
}

/** One line per workspace asked: which, how it went, how many rows, how long. */
export function logDispatch(entry: {
  federationQueryId: string;
  route: string;
  spe: string;
  outcome: "answered" | "failed";
  rows: number;
  ms: number;
}): void {
  logger.info(entry, "federated query dispatched");
}
