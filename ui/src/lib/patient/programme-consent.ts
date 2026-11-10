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
import {
  evaluateYear,
  ruleYear,
  type YearEvaluation,
} from "@/lib/patient/programme-rule";

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
 * carries is the program, the year and goal met, nothing else: the hub has
 * evaluated the ended year inside the record (step 6, ADR-087), and the
 * breakdown behind the answer is not stored with it. Delivery to the
 * program's connector is step 8; until then the status says it is ready.
 */
export const RECORD_TRANSFER_CYPHER = `MATCH (c:ProgrammeConsent {consentId: $consentId})
   MERGE (t:ProgrammeTransfer {transferId: $transferId})
     ON CREATE SET t.patientId = $patientId,
                   t.programmeId = $programmeId,
                   t.year = toInteger($year),
                   t.goalMet = $goalMet,
                   t.status = 'evaluated',
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

/** A program's rule version, or no row when the crawler never indexed it. */
export const PROGRAMME_RULE_CYPHER = `MATCH (s:BonusProgramme {serviceId: $programmeId})
   RETURN s.ruleVersion AS ruleVersion
   LIMIT 1`;

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
 * The bonus programs the crawler indexed, as the enricher wrote it (DCAT-AP
 * dcat:DataService typed ehds:BonusProgramme, #934 step 3). Only those the
 * publisher's latest catalogue still lists: the enricher stamps lastSeenAt
 * on each crawl and never deletes, so a programme a catalogue dropped
 * (2027 became 2025, ADR-087) is left out here, while the consents given to
 * it stay on record.
 */
export const BONUS_PROGRAMMES_CYPHER = `MATCH (s:DataService:BonusProgramme)
   OPTIONAL MATCH (s)-[:PUBLISHED_BY]->(p:Participant)
   WITH s, p, coalesce(p.participantId, s.publisherDid, s.serviceId) AS publisher
   WITH publisher, collect({s: s, p: p}) AS offers, max(s.lastSeenAt) AS latest
   UNWIND offers AS offer
   WITH offer.s AS s, offer.p AS p, latest
   WHERE s.lastSeenAt IS NULL OR latest IS NULL
      OR s.lastSeenAt >= latest - duration('PT1H')
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
 * Checks that the program exists and that its rule covers the year: 404 for
 * a program the crawler never indexed, 400 for a year its rule does not
 * cover. A rule version that names no year covers any.
 */
async function checkProgrammeYear(
  programmeId: string,
  year: number,
): Promise<NextResponse | null> {
  const [programme] = await runQuery<{ ruleVersion: string | null }>(
    PROGRAMME_RULE_CYPHER,
    { programmeId },
  );
  if (!programme) {
    return NextResponse.json(
      { error: `No bonus program '${programmeId}'` },
      { status: 404 },
    );
  }
  const covered = ruleYear(programme.ruleVersion);
  if (covered !== null && covered !== year) {
    return NextResponse.json(
      { error: `This program's rule covers ${covered}, not ${year}` },
      { status: 400 },
    );
  }
  return null;
}

/** The year the request names, or the program's rule year, or a 400. */
export function parseEvaluationRequest(
  params: URLSearchParams,
): { programmeId: string; year: number | null } | NextResponse {
  const programmeId = params.get("programmeId");
  const raw = params.get("year");
  const year = raw === null ? null : Number(raw);
  if (
    !programmeId ||
    (year !== null && (!Number.isInteger(year) || year < 2000 || year > 2100))
  ) {
    return NextResponse.json(
      { error: "programmeId is required, and year must be a calendar year" },
      { status: 400 },
    );
  }
  return { programmeId, year };
}

/**
 * The member's own result for a program year, before anything is sent
 * (ADR-080, decision 3). The breakdown is in the answer because the member
 * is the one reading it; it is never stored with a transfer.
 */
export async function evaluateProgrammeYear(
  patientId: string,
  programmeId: string,
  year: number | null,
  now: Date = new Date(),
): Promise<NextResponse> {
  let target = year;
  if (target === null) {
    const [programme] = await runQuery<{ ruleVersion: string | null }>(
      PROGRAMME_RULE_CYPHER,
      { programmeId },
    );
    if (!programme) {
      return NextResponse.json(
        { error: `No bonus program '${programmeId}'` },
        { status: 404 },
      );
    }
    target = ruleYear(programme.ruleVersion) ?? now.getUTCFullYear() - 1;
  } else {
    const refused = await checkProgrammeYear(programmeId, target);
    if (refused) return refused;
  }
  const evaluation = await evaluateYear(patientId, target, now);
  if (!evaluation) {
    return NextResponse.json({ error: "Patient not found" }, { status: 404 });
  }
  return NextResponse.json({ programmeId, evaluation });
}

/**
 * The person's instruction to send a year's answer. Only under an open
 * consent (403 otherwise, and nothing is recorded, GDPR Art. 7(3)); only for
 * a year the program's rule covers (400) and that has ended (409, with the
 * date it can be evaluated). Then the hub evaluates the year inside the
 * record and records the program, the year and goal met: 202.
 */
export async function requestProgrammeTransfer(
  patientId: string,
  programmeId: string,
  year: number,
  now: Date = new Date(),
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
  const refused = await checkProgrammeYear(programmeId, year);
  if (refused) return refused;
  const evaluation: YearEvaluation | null = await evaluateYear(
    patientId,
    year,
    now,
  );
  if (!evaluation) {
    return NextResponse.json({ error: "Patient not found" }, { status: 404 });
  }
  if (evaluation.status === "year-not-over") {
    return NextResponse.json(
      {
        error: `${year} is not over: the hub evaluates it from ${evaluation.evaluableFrom}, and nothing is sent before.`,
        evaluation,
      },
      { status: 409 },
    );
  }
  const [transfer] = await runQuery<ProgrammeTransferRow>(
    RECORD_TRANSFER_CYPHER,
    {
      consentId,
      transferId: randomUUID(),
      patientId,
      programmeId,
      year,
      goalMet: evaluation.goalMet,
    },
  );
  return NextResponse.json(
    { transfer, legalBasis: PROGRAMME_CONSENT_BASIS },
    { status: 202 },
  );
}
