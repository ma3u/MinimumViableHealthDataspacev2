/**
 * Consent to a bonus program (#934, step 4; ADR-080, decision 6).
 *
 * A person joins one program, sees that they joined, and withdraws, each on
 * their own record. It is its own record, (:ProgrammeConsent), next to two
 * that sound close and are not this one: study consent (PatientConsent) and
 * the Art. 71 opt-out (OptOutRecord). The opt-out governs secondary use and
 * does not stop sharing the person directs themselves, so nothing here reads
 * it; joining a program never enrolls anyone in research.
 *
 * Withdrawal ends transfers at once: programmeTransferAllowed() is the one
 * gate every transfer of a program's answer passes, and it asks for an open
 * consent (GDPR Art. 7(3), Art. 9(2)(a)).
 */
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { runQuery } from "@/lib/neo4j";
import type {
  BonusProgramme,
  ProgrammeConsent,
} from "@/lib/patient/bonus-programme";
import { ownRecordId, refuseForeignRecord } from "@/lib/patient/own-record";

const PATIENT_BY_KEY = `MATCH (p:Patient)
   WHERE coalesce(p.id, p.resourceId, elementId(p)) = $patientId`;

/** One consent of one person to one program; open while withdrawnAt is null. */
export type ProgrammeConsentRow = ProgrammeConsent;

/**
 * Join: an open consent for the program, or the one already open. A program
 * the crawler has not indexed, or a record that does not exist, returns no
 * row. MERGE on a consent id made by the caller, so a retried request with
 * the same id writes nothing twice.
 */
export const JOIN_PROGRAMME_CYPHER = `${PATIENT_BY_KEY}
   MATCH (s:BonusProgramme {serviceId: $programmeId})
   OPTIONAL MATCH (p)-[:GAVE_PROGRAMME_CONSENT]->(open:ProgrammeConsent {programmeId: $programmeId})
     WHERE open.withdrawnAt IS NULL
   WITH p, s, open
   CALL (p, s, open) {
     WITH p, s, open WHERE open IS NULL
     MERGE (c:ProgrammeConsent {consentId: $consentId})
       ON CREATE SET c.patientId = $patientId,
                     c.programmeId = $programmeId,
                     c.joinedAt = datetime(),
                     c.source = $source
     MERGE (p)-[:GAVE_PROGRAMME_CONSENT]->(c)
     MERGE (c)-[:FOR_PROGRAMME]->(s)
     RETURN c
     UNION
     WITH open WHERE open IS NOT NULL
     RETURN open AS c
   }
   RETURN c.consentId AS consentId, c.programmeId AS programmeId,
          toString(c.joinedAt) AS joinedAt, toString(c.withdrawnAt) AS withdrawnAt`;

/** Withdraw: close the open consent. No row when none is open. */
export const WITHDRAW_PROGRAMME_CYPHER = `MATCH (c:ProgrammeConsent {patientId: $patientId, programmeId: $programmeId})
   WHERE c.withdrawnAt IS NULL
   SET c.withdrawnAt = datetime()
   RETURN c.consentId AS consentId, c.programmeId AS programmeId,
          toString(c.joinedAt) AS joinedAt, toString(c.withdrawnAt) AS withdrawnAt`;

/** Every consent of the person to any program, newest first. */
export const PROGRAMME_CONSENTS_CYPHER = `MATCH (c:ProgrammeConsent {patientId: $patientId})
   RETURN c.consentId AS consentId, c.programmeId AS programmeId,
          toString(c.joinedAt) AS joinedAt, toString(c.withdrawnAt) AS withdrawnAt
   ORDER BY c.joinedAt DESC`;

/** The open consent, if any: what the transfer gate reads. */
export const OPEN_PROGRAMME_CONSENT_CYPHER = `MATCH (c:ProgrammeConsent {patientId: $patientId, programmeId: $programmeId})
   WHERE c.withdrawnAt IS NULL
   RETURN c.consentId AS consentId
   LIMIT 1`;

/**
 * A transfer the person asked for (ADR-080, decision 4, second path). What it
 * carries is the program, the year and goal met; the answer is computed in
 * step 6, so until then goalMet stays null and the status says so.
 */
export const RECORD_TRANSFER_CYPHER = `MATCH (c:ProgrammeConsent {consentId: $consentId})
   MERGE (t:ProgrammeTransfer {transferId: $transferId})
     ON CREATE SET t.patientId = $patientId,
                   t.programmeId = $programmeId,
                   t.year = toInteger($year),
                   t.goalMet = null,
                   t.status = 'awaiting-evaluation',
                   t.requestedAt = datetime()
   MERGE (t)-[:UNDER_CONSENT]->(c)
   RETURN t.transferId AS transferId, t.programmeId AS programmeId, t.year AS year,
          t.goalMet AS goalMet, t.status AS status, toString(t.requestedAt) AS requestedAt`;

export interface ProgrammeTransferRow {
  transferId: string;
  programmeId: string;
  year: number;
  goalMet: boolean | null;
  status: string;
  requestedAt: string;
}

/**
 * Where a join came from. The API collection marks its own with
 * "api-collection", so the live clean-up removes them and nothing else
 * (neo4j/remove-api-collection-runs.cypher).
 */
export const PROGRAMME_CONSENT_SOURCES = [
  "patient-portal",
  "klarbefund",
  "api-collection",
] as const;

/** The legal basis the routes name in their answers. */
const PROGRAMME_CONSENT_BASIS =
  "Explicit consent to one program, GDPR Art. 9(2)(a), withdrawable at any time, Art. 7(3); EHDS Art. 7(3) (ADR-080)";

/** The open consent of a person to a program, or null. */
export function openConsent(
  rows: ProgrammeConsentRow[],
  programmeId: string,
): ProgrammeConsentRow | null {
  return (
    rows.find((r) => r.programmeId === programmeId && !r.withdrawnAt) ?? null
  );
}

/**
 * The gate: the consent id a transfer may go out under, or null when the
 * person has not joined the program or has withdrawn.
 */
async function programmeTransferAllowed(
  patientId: string,
  programmeId: string,
): Promise<string | null> {
  const [row] = await runQuery<{ consentId: string }>(
    OPEN_PROGRAMME_CONSENT_CYPHER,
    { patientId, programmeId },
  );
  return row?.consentId ?? null;
}

/**
 * Whose record a program route acts on, after the route's own requireAuth()
 * (ADR-044: the gate stays visible in each handler). A PATIENT acts on their
 * own record only (a foreign patientId is refused with 403, #475); EDC_ADMIN
 * names one. With required=false a session without a record (an operator who
 * names none) gets { patientId: null }, which the list route answers without
 * consents.
 */
export async function resolveProgrammePatient(
  roles: readonly string[],
  named: string | null,
  required = true,
): Promise<{ patientId: string | null } | NextResponse> {
  const patientId = named ?? (await ownRecordId());
  if (!patientId) {
    return required
      ? NextResponse.json({ error: "patientId is required" }, { status: 400 })
      : { patientId: null };
  }
  const refused = await refuseForeignRecord(roles, patientId);
  return refused ?? { patientId };
}

/**
 * Every bonus program the crawler indexed, as the enricher wrote it
 * (DCAT-AP dcat:DataService typed ehds:BonusProgramme, #934 step 3).
 */
export const BONUS_PROGRAMMES_CYPHER = `MATCH (s:DataService:BonusProgramme)
   OPTIONAL MATCH (s)-[:PUBLISHED_BY]->(p:Participant)
   RETURN s.serviceId AS programmeId,
          s.title AS title,
          s.description AS description,
          coalesce(p.name, s.publisherName, s.publisherDid) AS publisherName,
          s.publisherDid AS publisherDid,
          p.dataSpace AS dataSpace,
          s.endpointUrl AS endpointUrl,
          s.ruleTitle AS ruleTitle,
          s.ruleDescription AS ruleDescription,
          s.ruleVersion AS ruleVersion,
          toString(s.lastSeenAt) AS lastSeenAt
   ORDER BY s.title`;

/**
 * What happens once a route has decided whose record it acts on. The portal
 * routes (a session, requireAuth) and the Klarbefund routes (an app token,
 * requireAppToken, ADR-049) each keep their own gate and call these, so the
 * phone and the browser get the same answers from the same queries.
 */

/** The offer and the person's own consents; none for a record left unnamed. */
export async function listProgrammes(patientId: string | null) {
  const programmes = await runQuery<BonusProgramme>(BONUS_PROGRAMMES_CYPHER);
  const consents = patientId
    ? await runQuery<ProgrammeConsentRow>(PROGRAMME_CONSENTS_CYPHER, {
        patientId,
      })
    : [];
  return {
    programmes,
    consents,
    legalBasis:
      "Primary use the person directs, EHDS Art. 2(2)(d) and 7(3); explicit consent, GDPR Art. 9(2)(a) (ADR-080)",
  };
}

/** Join: 201 with the open consent, or 404 for an unknown program or record. */
export async function joinProgramme(
  patientId: string,
  programmeId: string,
  source: (typeof PROGRAMME_CONSENT_SOURCES)[number],
): Promise<NextResponse> {
  const [consent] = await runQuery<ProgrammeConsentRow>(JOIN_PROGRAMME_CYPHER, {
    patientId,
    programmeId,
    consentId: randomUUID(),
    source,
  });
  if (!consent) {
    return NextResponse.json(
      {
        error: `No bonus program '${programmeId}', or no record '${patientId}'`,
      },
      { status: 404 },
    );
  }
  return NextResponse.json(
    { consent, legalBasis: PROGRAMME_CONSENT_BASIS },
    { status: 201 },
  );
}

/** Withdraw: 200 with the closed consent, or 404 when none is open. */
export async function withdrawProgramme(
  patientId: string,
  programmeId: string,
): Promise<NextResponse> {
  const [consent] = await runQuery<ProgrammeConsentRow>(
    WITHDRAW_PROGRAMME_CYPHER,
    { patientId, programmeId },
  );
  if (!consent) {
    return NextResponse.json(
      { error: "There is no open consent to this program to withdraw" },
      { status: 404 },
    );
  }
  return NextResponse.json({ consent, legalBasis: PROGRAMME_CONSENT_BASIS });
}

/** A transfer body's program and calendar year, or a 400. */
export function parseTransferRequest(body: {
  programmeId?: unknown;
  year?: unknown;
}): { programmeId: string; year: number } | NextResponse {
  const year = Number(body.year);
  if (
    typeof body.programmeId !== "string" ||
    !body.programmeId ||
    !Number.isInteger(year) ||
    year < 2000 ||
    year > 2100
  ) {
    return NextResponse.json(
      { error: "programmeId and a calendar year are required" },
      { status: 400 },
    );
  }
  return { programmeId: body.programmeId, year };
}

/**
 * The person's instruction to send a year's answer: 202 under an open
 * consent, 403 without one (never joined, or withdrawn), and then nothing is
 * recorded (GDPR Art. 7(3)).
 */
export async function requestProgrammeTransfer(
  patientId: string,
  programmeId: string,
  year: number,
): Promise<NextResponse> {
  const consentId = await programmeTransferAllowed(patientId, programmeId);
  if (!consentId) {
    return NextResponse.json(
      {
        error:
          "No open consent to this program: join it first. After a withdrawal nothing is sent.",
      },
      { status: 403 },
    );
  }
  const [transfer] = await runQuery<ProgrammeTransferRow>(
    RECORD_TRANSFER_CYPHER,
    { consentId, transferId: randomUUID(), patientId, programmeId, year },
  );
  return NextResponse.json(
    { transfer, legalBasis: PROGRAMME_CONSENT_BASIS },
    { status: 202 },
  );
}
