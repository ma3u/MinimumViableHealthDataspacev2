import { memberReference } from "./member-reference.js";

// ---------------------------------------------------------------------------
// What an insurer collects for its bonus program (#934 step 8, ADR-091;
// ADR-080, decisions 2 and 4): the program, the year, goal met yes or no, and
// the member's reference. Nothing else is read from the graph for it.
// ---------------------------------------------------------------------------

/** The asset the bonus agreement covers (scripts/seed-second-data-space.sh). */
export const PROGRAMME_ANSWER_DATASET = "bonus-programme-answer";

export interface ProgrammeAnswer {
  programme: string;
  year: number;
  goalMet: boolean;
  memberReference: string;
}

/** Every program the crawler indexed, with the participant that published it. */
export const PROGRAMME_PUBLISHERS_CYPHER = `MATCH (s:BonusProgramme)
   RETURN s.serviceId AS programmeId, s.publisherDid AS publisherDid`;

/**
 * The answers members asked the hub to send, for the given programs, and the
 * record that they were collected. Only under an open consent: a withdrawal
 * takes the member's answers out at once (GDPR Art. 7(3)). One answer per
 * consent and year, the latest the member sent. The first collection is the
 * one recorded; a later pull finds deliveredAt set and leaves it.
 */
export const COLLECT_ANSWERS_CYPHER = `MATCH (t:ProgrammeTransfer)-[:UNDER_CONSENT]->(c:ProgrammeConsent)
   WHERE c.programmeId IN $programmeIds
     AND c.withdrawnAt IS NULL
     AND t.goalMet IS NOT NULL
   WITH c, t ORDER BY t.requestedAt DESC
   WITH c, t.year AS year, head(collect(t)) AS t
   SET t.status = 'delivered',
       t.deliveredAt = coalesce(t.deliveredAt, datetime()),
       t.deliveredTo = coalesce(t.deliveredTo, $consumer)
   RETURN c.programmeId AS programmeId, c.consentId AS consentId,
          year, t.goalMet AS goalMet
   ORDER BY programmeId, year, consentId`;

interface WebDid {
  host: string;
  path: string[];
}

function webDid(did: string): WebDid | null {
  const parts = did.split(":");
  if (parts.length < 3 || parts[0] !== "did" || parts[1] !== "web") return null;
  let host: string;
  try {
    host = decodeURIComponent(parts[2]).toLowerCase();
  } catch {
    return null;
  }
  return { host, path: parts.slice(3) };
}

/**
 * Whether the consumer a token names is the participant that published a
 * program. In a real deployment the catalogue names the connector's own DID,
 * and the two are equal. The demo keeps two DID forms for one organisation
 * (.claude/rules/api-conventions.md, DID Conventions): the catalogue says
 * did:web:alphakasse.de:insurer, the connector is
 * did:web:<IdentityHub>:alphakasse. That second form is matched by its slug
 * only when the consumer's DID is hosted where the provider's is, the hub's
 * own IdentityHub, whose participants the operator names. A DID from any
 * other host has to be the publisher's DID itself.
 */
export function publishedBy(
  consumerDid: string,
  providerDid: string,
  publisherDid: string | null,
): boolean {
  if (!publisherDid) return false;
  if (consumerDid === publisherDid) return true;
  const consumer = webDid(consumerDid);
  const provider = webDid(providerDid);
  const publisher = webDid(publisherDid);
  if (!consumer || !provider || !publisher) return false;
  if (consumer.host !== provider.host || consumer.path.length !== 1) {
    return false;
  }
  // A publisher in the connector's own form is matched by equality alone:
  // its host is the IdentityHub, not an organisation's domain.
  if (publisher.host === consumer.host) return false;
  const organisation = publisher.host.split(":")[0].split(".")[0];
  return organisation.length > 0 && consumer.path[0] === organisation;
}

function int(v: unknown): number {
  return Number((v as { toNumber?: () => number })?.toNumber?.() ?? v);
}

/** A row of COLLECT_ANSWERS_CYPHER as the insurer receives it. */
export function toAnswer(row: {
  get: (key: string) => unknown;
}): ProgrammeAnswer {
  return {
    programme: String(row.get("programmeId")),
    year: int(row.get("year")),
    goalMet: row.get("goalMet") === true,
    memberReference: memberReference(String(row.get("consentId"))),
  };
}
