import { type Request, type Response } from "express";
import neo4j from "neo4j-driver";
import { getSession } from "./db.js";
import { currentLoadTest, logger } from "./logger.js";

// ---- Audit Logging --------------------------------------------------------

/**
 * Records a data access event in Neo4j for EHDS compliance auditing.
 * Creates (:TransferEvent)-[:ACCESSED]->(:HealthDataset) and
 * (:TransferEvent)-[:REQUESTED_BY]->(:Organization) relationships.
 * Fire-and-forget: errors are logged but do not block the response.
 */
/**
 * What the UI tells the proxy about the access it forwards (the permit, the
 * dataset and the purpose it runs under, the contract if any), plus what the
 * proxy measured itself. All optional: a caller that sends nothing still gets
 * an event, just a thinner one. Issue #206, M3.
 */
interface AuditExtras {
  permitId?: string;
  datasetId?: string;
  purpose?: string;
  contractId?: string;
  responseBytes?: number;
}

export function auditContext(req: Request, res: Response): AuditExtras {
  const header = (name: string): string | undefined => {
    const v = req.headers[name];
    return typeof v === "string" && v.trim() ? v.trim() : undefined;
  };
  return {
    permitId: header("x-permit"),
    datasetId: header("x-dataset"),
    purpose: header("x-purpose"),
    contractId: header("x-contract"),
    responseBytes:
      typeof res.locals.responseBytes === "number"
        ? res.locals.responseBytes
        : undefined,
  };
}

/**
 * How long an access event is kept, draft implementing act on secure
 * processing environments, Art. 16(4) (#1236): five years, or one year after
 * the data permit ends if that is shorter, and never less than the one year
 * of Regulation (EU) 2025/327 Art. 73(1)(e). An event under no permit, or
 * under one with no end date, keeps the one year it was created with.
 *
 * A Cypher fragment for a query that has the event as `event` and the
 * permit (an `HDABApproval`, possibly null) as `permit` in scope.
 */
export function retentionCypher(event: string, permit: string): string {
  return `FOREACH (_ IN CASE WHEN ${permit} IS NOT NULL AND ${permit}.validUntil IS NOT NULL THEN [1] ELSE [] END |
        SET ${event}.retainUntil = CASE
          WHEN datetime(toString(${permit}.validUntil)) + duration({years: 1}) < datetime(toString(${event}.timestamp)) + duration({years: 1})
            THEN datetime(toString(${event}.timestamp)) + duration({years: 1})
          WHEN datetime(toString(${permit}.validUntil)) + duration({years: 1}) < datetime(toString(${event}.timestamp)) + duration({years: 5})
            THEN datetime(toString(${permit}.validUntil)) + duration({years: 1})
          ELSE datetime(toString(${event}.timestamp)) + duration({years: 5})
        END
      )`;
}

export async function logTransferEvent(
  endpoint: string,
  method: string,
  participantHint: string | undefined,
  statusCode: number,
  resultCount: number | undefined,
  extra: AuditExtras = {},
): Promise<void> {
  // A load test's accesses are marked with the run, as its audit records are:
  // the access register keeps them a year, and they are not real use (#571).
  const loadTest = currentLoadTest() ?? null;
  const session = getSession();
  const consumerDid =
    participantHint &&
    participantHint.startsWith("did:web:") &&
    !participantHint.includes(":unknown:")
      ? participantHint
      : null;
  try {
    await session.run(
      `
      CREATE (te:TransferEvent {
        eventId: randomUUID(),
        timestamp: datetime(),
        // Art. 73(1)(e): kept for at least one year; under a permit the
        // draft Art. 16(4) rule below replaces this (retentionCypher).
        retainUntil: datetime() + duration({years: 1}),
        endpoint: $endpoint,
        method: $method,
        participant: $participant,
        consumerDid: $consumerDid,
        statusCode: $statusCode,
        resultCount: $resultCount,
        responseBytes: $responseBytes,
        permitId: $permitId,
        datasetId: $datasetId,
        purpose: $purpose,
        contractId: $contractId,
        loadTest: $loadTest
      })
      WITH te
      // The dataset: the one the caller named, else a guess from the endpoint
      OPTIONAL MATCH (exact:HealthDataset)
        WHERE $datasetId IS NOT NULL
          AND coalesce(exact.datasetId, exact.id) = $datasetId
      WITH te, collect(exact)[0] AS exact
      OPTIONAL MATCH (guess:HealthDataset)
        WHERE exact IS NULL AND $datasetId IS NULL AND (
             ($endpoint CONTAINS 'fhir' AND guess.title CONTAINS 'FHIR')
          OR ($endpoint CONTAINS 'omop' AND guess.title CONTAINS 'OMOP')
          OR ($endpoint CONTAINS 'catalog' AND guess.title CONTAINS 'Catalog'))
      WITH te, exact, collect(guess)[0] AS guessed
      WITH te, coalesce(exact, guessed) AS ds
      FOREACH (_ IN CASE WHEN ds IS NOT NULL THEN [1] ELSE [] END |
        MERGE (te)-[:ACCESSED]->(ds)
        SET te.datasetId = coalesce(te.datasetId, ds.datasetId, ds.id)
      )
      WITH te, ds
      // The provider: whoever offers the data product the dataset describes
      OPTIONAL MATCH (offers:Participant)-[:OFFERS]->(:DataProduct)-[:DESCRIBED_BY]->(ds)
      WITH te, ds, collect(offers)[0] AS offers
      OPTIONAL MATCH (ds)-[:PROVIDED_BY]->(provides:Participant)
      WITH te, coalesce(offers, provides) AS holder
      FOREACH (_ IN CASE WHEN holder IS NOT NULL THEN [1] ELSE [] END |
        SET te.providerDid = coalesce(te.providerDid, holder.participantId, holder.id)
        MERGE (te)-[:PROVIDED_BY]->(holder)
      )
      WITH te
      OPTIONAL MATCH (consumer:Participant)
        WHERE $consumerDid IS NOT NULL
          AND coalesce(consumer.participantId, consumer.id) = $consumerDid
      FOREACH (_ IN CASE WHEN consumer IS NOT NULL THEN [1] ELSE [] END |
        MERGE (te)-[:REQUESTED_BY]->(consumer)
      )
      WITH te
      OPTIONAL MATCH (permit:HDABApproval)
        WHERE $permitId IS NOT NULL AND permit.approvalId = $permitId
      FOREACH (_ IN CASE WHEN permit IS NOT NULL THEN [1] ELSE [] END |
        MERGE (te)-[:UNDER_PERMIT]->(permit)
      )
      WITH te, permit
      ${retentionCypher("te", "permit")}
      RETURN te.eventId AS eventId
      `,
      {
        endpoint,
        method,
        participant: participantHint ?? "unknown",
        consumerDid,
        statusCode: neo4j.int(statusCode),
        resultCount: resultCount != null ? neo4j.int(resultCount) : null,
        responseBytes:
          extra.responseBytes != null ? neo4j.int(extra.responseBytes) : null,
        permitId: extra.permitId ?? null,
        datasetId: extra.datasetId ?? null,
        purpose: extra.purpose ?? null,
        contractId: extra.contractId ?? null,
        loadTest,
      },
    );
  } catch (err) {
    logger.error({ err }, "Audit log failed");
  } finally {
    await session.close();
  }
}
