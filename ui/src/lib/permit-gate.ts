/**
 * The data permit gate.
 *
 * Regulation (EU) 2025/327: a health data user may access electronic health
 * data for secondary use only under a data permit issued by a health data
 * access body (Art. 61(1)); the body issues it after the Art. 68 assessment;
 * access then happens in a secure processing environment (Art. 73). In the
 * graph a permit is an HDABApproval with status APPROVED that APPROVES the
 * consumer's AccessApplication and GRANTS_ACCESS_TO the HealthDataset.
 *
 * POST /api/transfers calls checkPermit() before it does anything else, so a
 * refusal on /compliance really stops step 5 of the journey. Until issue #206
 * that page was read-only and the transfer route never looked at a permit.
 *
 * Dataset matching: the graph keys datasets as "dataset:synthea-fhir-r4-mvd";
 * EDC agreements carry asset ids like "fhir-cohort-bundle", and nothing links
 * the two yet. A caller that names the dataset (datasetId) gets a strict
 * check. A caller with only an asset id gets a best-effort match and, failing
 * that, any valid permit of the consumer; the result says which happened.
 */
import { runQuery } from "@/lib/neo4j";
import { parseGraphTime } from "@/lib/permits";

export const PERMIT_ARTICLE =
  "Regulation (EU) 2025/327, Art. 61(1) and Art. 68";

export interface PermitRow {
  permitId: string;
  status: string;
  datasetId: string | null;
  datasetTitle: string | null;
  validUntil: string | null;
  purpose: string | null;
  applicationId: string | null;
  revokedAt?: string | null;
  revocationReason?: string | null;
}

export interface PermitCheck {
  allowed: boolean;
  consumerDid: string | null;
  permitId: string | null;
  datasetId: string | null;
  datasetMatched: boolean;
  validUntil: string | null;
  purpose: string | null;
  reason: string;
  article: string;
}

/** Every decision the access bodies have taken on this consumer's applications. */
export async function findPermits(consumerDid: string): Promise<PermitRow[]> {
  return runQuery<PermitRow>(
    `MATCH (consumer:Participant)
     WHERE coalesce(consumer.participantId, consumer.id) = $consumerDid
     MATCH (consumer)-[:SUBMITTED]->(app:AccessApplication)<-[:APPROVES]-(permit:HDABApproval)
     OPTIONAL MATCH (permit)-[:GRANTS_ACCESS_TO]->(ds:HealthDataset)
     RETURN permit.approvalId                                       AS permitId,
            toUpper(coalesce(permit.status, ''))                    AS status,
            coalesce(ds.datasetId, ds.id, app.datasetId)            AS datasetId,
            coalesce(ds.title, ds.name)                             AS datasetTitle,
            toString(permit.validUntil)                             AS validUntil,
            coalesce(permit.permittedPurpose, app.requestedPurpose) AS purpose,
            app.applicationId                                       AS applicationId,
            toString(permit.revokedAt)                              AS revokedAt,
            permit.revocationReason                                 AS revocationReason
     ORDER BY permit.validUntil DESC`,
    { consumerDid },
  );
}

function norm(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

function assetMatches(assetId: string, row: PermitRow): boolean {
  const a = norm(assetId);
  if (!a) return false;
  return [row.datasetId, row.datasetTitle]
    .map(norm)
    .filter(Boolean)
    .some((k) => k === a || k.includes(a) || a.includes(k));
}

export async function checkPermit(input: {
  consumerDid: string | null;
  datasetId?: string | null;
  assetId?: string | null;
  now?: Date;
}): Promise<PermitCheck> {
  const base: Omit<PermitCheck, "allowed" | "reason"> = {
    consumerDid: input.consumerDid,
    permitId: null,
    datasetId: null,
    datasetMatched: false,
    validUntil: null,
    purpose: null,
    article: PERMIT_ARTICLE,
  };
  if (!input.consumerDid) {
    return {
      ...base,
      allowed: false,
      reason:
        "The consumer of this contract could not be identified, so no data permit can be verified.",
    };
  }
  const now = (input.now ?? new Date()).getTime();
  const rows = await findPermits(input.consumerDid);
  if (rows.length === 0) {
    return {
      ...base,
      allowed: false,
      reason: `${input.consumerDid} holds no data permit: no health data access body has decided on an access application for this participant.`,
    };
  }
  const approved = rows.filter((r) => r.status === "APPROVED");
  if (approved.length === 0) {
    const revoked = rows.find((r) => r.status === "REVOKED");
    if (revoked) {
      return {
        ...base,
        allowed: false,
        permitId: revoked.permitId,
        reason: `Data permit ${revoked.permitId} was revoked on ${(
          revoked.revokedAt ?? ""
        ).slice(0, 10)} (Art. 63(3))${
          revoked.revocationReason ? `: ${revoked.revocationReason}` : ""
        }.`,
      };
    }
    return {
      ...base,
      allowed: false,
      permitId: rows[0].permitId,
      reason: `The health data access body refused the access application of ${input.consumerDid} (${rows[0].permitId}); no data permit exists.`,
    };
  }
  const valid = approved.filter((r) => {
    const t = parseGraphTime(r.validUntil);
    return t === null || t >= now;
  });
  if (valid.length === 0) {
    return {
      ...base,
      allowed: false,
      permitId: approved[0].permitId,
      validUntil: approved[0].validUntil,
      reason: `Data permit ${approved[0].permitId} expired on ${(
        approved[0].validUntil ?? ""
      ).slice(0, 10)}.`,
    };
  }

  const wanted = norm(input.datasetId);
  if (wanted) {
    const hit = valid.find((r) => norm(r.datasetId) === wanted);
    if (!hit) {
      // A permit for exactly this dataset that the body took back is the
      // reason that matters, not the other permits the consumer still holds.
      const revokedHere = rows.find(
        (r) => r.status === "REVOKED" && norm(r.datasetId) === wanted,
      );
      if (revokedHere) {
        return {
          ...base,
          allowed: false,
          permitId: revokedHere.permitId,
          datasetId: input.datasetId ?? null,
          reason: `Data permit ${revokedHere.permitId} for ${
            input.datasetId
          } was revoked on ${(revokedHere.revokedAt ?? "").slice(
            0,
            10,
          )} (Art. 63(3))${
            revokedHere.revocationReason
              ? `: ${revokedHere.revocationReason}`
              : ""
          }.`,
        };
      }
      return {
        ...base,
        allowed: false,
        datasetId: input.datasetId ?? null,
        reason: `${input.consumerDid} holds ${
          valid.length === 1 ? "a data permit" : "data permits"
        } for ${valid
          .map((r) => r.datasetId ?? "an unnamed dataset")
          .join(", ")}, none for ${input.datasetId}.`,
      };
    }
    return {
      ...base,
      allowed: true,
      permitId: hit.permitId,
      datasetId: hit.datasetId,
      datasetMatched: true,
      validUntil: hit.validUntil,
      purpose: hit.purpose,
      reason: `Covered by data permit ${hit.permitId} for ${hit.datasetId}.`,
    };
  }

  const byAsset = input.assetId
    ? valid.find((r) => assetMatches(input.assetId as string, r))
    : undefined;
  const chosen = byAsset ?? valid[0];
  return {
    ...base,
    allowed: true,
    permitId: chosen.permitId,
    datasetId: chosen.datasetId,
    datasetMatched: Boolean(byAsset),
    validUntil: chosen.validUntil,
    purpose: chosen.purpose,
    reason: byAsset
      ? `Covered by data permit ${chosen.permitId} for ${chosen.datasetId}.`
      : `Covered by data permit ${chosen.permitId}; the asset ${
          input.assetId ?? "(none)"
        } is not mapped to a dataset in the graph, so the permit's dataset ${
          chosen.datasetId ?? "(none)"
        } was not checked against it.`,
  };
}

/**
 * Headers that tell the neo4j-proxy which permit, dataset and purpose an
 * access runs under, so its audit record (TransferEvent) says more than the
 * endpoint. Empty when the consumer holds no valid permit. Never throws: an
 * audit detail must not break the query it describes.
 */
export async function activePermitHeaders(
  consumerDid: string | null,
): Promise<Record<string, string>> {
  if (!consumerDid) return {};
  try {
    const check = await checkPermit({ consumerDid });
    if (!check.allowed || !check.permitId) return {};
    const headers: Record<string, string> = { "X-Permit": check.permitId };
    if (check.datasetId) headers["X-Dataset"] = check.datasetId;
    if (check.purpose) headers["X-Purpose"] = check.purpose;
    return headers;
  } catch {
    return {};
  }
}

const SLUG_TO_DID: Record<string, string> = {
  pharmaco: "did:web:pharmaco.de:research",
  "alpha-klinik": "did:web:alpha-klinik.de:participant",
  alphaklinik: "did:web:alpha-klinik.de:participant",
  lmc: "did:web:lmc.nl:clinic",
  medreg: "did:web:medreg.de:hdab",
  irs: "did:web:irs.fr:hdab",
};

/**
 * The consumer DID behind an agreement's counterparty id. EDC-V identities
 * look like "did:web:identityhub%3A7083:pharmaco"; the fixtures also carry
 * plain did:web ids. Null when nothing recognisable is there.
 */
export function didFromCounterParty(
  counterPartyId: string | null | undefined,
): string | null {
  if (!counterPartyId) return null;
  let decoded = counterPartyId;
  try {
    decoded = decodeURIComponent(counterPartyId);
  } catch {
    // keep the raw value
  }
  if (/^did:web:/i.test(decoded) && !/identityhub/i.test(decoded)) {
    return decoded;
  }
  const slug = decoded.split(":").pop()?.toLowerCase() ?? "";
  return SLUG_TO_DID[slug] ?? null;
}

/**
 * Record a permitted transfer in the audit graph so /admin/audit shows which
 * permit it ran under (Art. 73(1)(e)). Fire and forget: a failure here must
 * not undo a transfer the connector has already accepted.
 */
export async function recordPermittedTransfer(t: {
  transferId: string;
  contractId: string;
  assetId: string;
  consumerDid: string;
  permitId: string;
  datasetId: string | null;
  demo: boolean;
}): Promise<void> {
  try {
    await runQuery(
      `MERGE (t:DataTransfer {id: $transferId})
       SET t.status       = 'STARTED',
           t.timestamp    = toString(datetime()),
           t.transferDate = toString(date()),
           t.contractId   = $contractId,
           t.assetId      = $assetId,
           t.consumerDid  = $consumerDid,
           t.permitId     = $permitId,
           t.protocol     = 'dataspace-protocol-http:2025-1',
           t.demo         = $demo
       WITH t
       OPTIONAL MATCH (consumer:Participant)
         WHERE coalesce(consumer.participantId, consumer.id) = $consumerDid
       FOREACH (_ IN CASE WHEN consumer IS NOT NULL THEN [1] ELSE [] END |
         MERGE (t)-[:TRANSFERRED_BY]->(consumer))
       WITH t
       OPTIONAL MATCH (permit:HDABApproval {approvalId: $permitId})
       FOREACH (_ IN CASE WHEN permit IS NOT NULL THEN [1] ELSE [] END |
         MERGE (t)-[:UNDER_PERMIT]->(permit))
       WITH t
       OPTIONAL MATCH (ds:HealthDataset)
         WHERE $datasetId IS NOT NULL AND coalesce(ds.datasetId, ds.id) = $datasetId
       FOREACH (_ IN CASE WHEN ds IS NOT NULL THEN [1] ELSE [] END |
         MERGE (t)-[:TRANSFERS]->(ds))`,
      t,
    );
  } catch (err) {
    console.warn(
      "Could not record the permitted transfer in the audit graph:",
      err,
    );
  }
}
