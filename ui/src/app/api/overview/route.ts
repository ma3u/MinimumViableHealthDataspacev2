import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions, derivePersonaId } from "@/lib/auth";
import { runQuery } from "@/lib/neo4j";
import { GET as profileGET } from "@/app/api/patient/profile/route";
import { GET as insightsGET } from "@/app/api/patient/insights/route";
import { GET as researchGET } from "@/app/api/patient/research/route";
import { GET as observationsGET } from "@/app/api/patient/observations/route";
import { GET as complianceGET } from "@/app/api/compliance/route";
import { GET as permitsGET } from "@/app/api/permits/route";
import { GET as credentialsGET } from "@/app/api/credentials/route";
import { userToParticipantId } from "@/lib/odrl-engine";
import {
  buildHdabView,
  type ContractShape,
  type CredentialEntry,
  type HdabAccessEvent,
  type MatrixRow,
  type ParticipantShape,
  type RegisterEntry,
} from "@/lib/overview/hdab";
import {
  buildHospitalView,
  type LabelAssessment,
} from "@/lib/overview/hospital";
import { GET as catalogGET } from "@/app/api/catalog/route";
import {
  buildResearcherView,
  type CatalogDataset,
  type StudyRecord,
} from "@/lib/overview/researcher";
import {
  buildPatientView,
  ownPatientId,
  type AccessLogEntry,
  type ConsentShape,
  type InsightsShape,
  type ProfileShape,
  type ResearchShape,
  type StudyShape,
} from "@/lib/overview/patient";
import type { FhirBundle } from "@/lib/overview/observations";
import type { OverviewView } from "@/lib/overview/types";

export const dynamic = "force-dynamic";

const PERSONAS = ["patient", "researcher", "hdab", "hospital"] as const;
type Persona = (typeof PERSONAS)[number];

/** Which overview each role may open. EDC_ADMIN may open any. */
const ROLE_PERSONA: Record<string, Persona> = {
  PATIENT: "patient",
  DATA_USER: "researcher",
  HDAB_AUTHORITY: "hdab",
  DATA_HOLDER: "hospital",
};

class SubRouteError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    super(`sub-route ${status}`);
  }
}

/** Call another route handler in-process and return its JSON. */
async function call<T>(
  handler: (req: Request) => Promise<Response>,
  origin: string,
  path: string,
): Promise<T> {
  const res = await handler(new Request(`${origin}${path}`));
  const body = await res.json();
  if (!res.ok) throw new SubRouteError(res.status, body);
  return body as T;
}

/**
 * GET /api/overview?persona=patient|researcher|hdab|hospital[&patientId=][&asOf=]
 *
 * One state-first view per persona (issue #271, discussion #265): layers,
 * nodes with status and series, links, and the signals sorted worst first.
 * Derived state (trend, chain of trust, clocks) is computed here from the
 * graph and never persisted. The persona defaults to the session's role;
 * a role may only open its own persona, EDC_ADMIN any.
 *
 * M1 the patient, M2 the access body, M3 the holder, M4 the researcher.
 */
export async function GET(req: Request): Promise<Response> {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const roles = (session as { roles?: string[] }).roles ?? [];
  const username = session.user?.name ?? null;
  const url = new URL(req.url);
  const requested = url.searchParams.get("persona");
  const derived = derivePersonaId(roles, username);
  const persona = (requested ??
    (PERSONAS.includes(derived as Persona) ? derived : "patient")) as Persona;
  if (!PERSONAS.includes(persona)) {
    return NextResponse.json(
      { error: `Unknown persona "${persona}"`, personas: PERSONAS },
      { status: 400 },
    );
  }
  const isAdmin = roles.includes("EDC_ADMIN");
  const allowed = roles.map((r) => ROLE_PERSONA[r]).filter(Boolean);
  if (!isAdmin && !allowed.includes(persona)) {
    return NextResponse.json(
      {
        error: "Forbidden",
        reason: `Your role opens the ${
          allowed[0] ?? "no"
        } overview, not ${persona}`,
      },
      { status: 403 },
    );
  }
  const asOf =
    url.searchParams.get("asOf") ?? new Date().toISOString().slice(0, 10);
  if (persona === "hdab") {
    return hdabView(url, roles, username, asOf);
  }
  if (persona === "hospital") {
    return hospitalView(url, roles, username, asOf);
  }
  if (persona === "researcher") {
    return researcherView(url, roles, username, asOf);
  }

  // The patient a PATIENT session owns; anyone else picks one, P1 by default.
  const own =
    roles.includes("PATIENT") && !isAdmin ? ownPatientId(username) : null;
  const patientId = own ?? url.searchParams.get("patientId") ?? "P1";
  const since = new Date(asOf);
  since.setUTCMonth(since.getUTCMonth() - 12);
  since.setUTCDate(1);

  try {
    const origin = url.origin;
    const q = encodeURIComponent(patientId);
    const [
      profile,
      insights,
      research,
      observations,
      holderRows,
      studyRows,
      consentRows,
    ] = await Promise.all([
      call<ProfileShape>(
        profileGET,
        origin,
        `/api/patient/profile?patientId=${q}`,
      ),
      call<InsightsShape>(
        insightsGET,
        origin,
        `/api/patient/insights?patientId=${q}`,
      ),
      call<ResearchShape>(
        researchGET,
        origin,
        `/api/patient/research?patientId=${q}`,
      ),
      call<FhirBundle>(
        observationsGET,
        origin,
        `/api/patient/observations?patientId=${q}`,
      ),
      runQuery<{ did: string; name: string }>(
        `MATCH (p:Patient)-[:TREATED_AT]->(h:Participant)
           WHERE coalesce(p.id, p.resourceId, elementId(p)) = $patientId
           RETURN h.participantId AS did, coalesce(h.name, h.participantId) AS name
           LIMIT 1`,
        { patientId },
      ),
      runQuery<StudyShape>(
        `MATCH (st:ResearchStudy)
           OPTIONAL MATCH (inst:Participant)-[:CONDUCTS]->(st)
           RETURN st.studyId AS studyId,
                  coalesce(st.name, st.studyId) AS studyName,
                  coalesce(inst.name, st.institutionDid, '') AS institution,
                  coalesce(st.purpose, 'secondary-use') AS purpose,
                  st.description AS description,
                  st.dataNeeded AS dataNeeded,
                  st.status AS status,
                  st.participantCount AS participantCount,
                  st.countries AS countries,
                  st.ethicsApproval AS ethicsApproval
           ORDER BY st.studyId
           LIMIT 50`,
      ),
      runQuery<{
        consentId: string;
        dataScope: string | null;
        trustCenter: string | null;
      }>(
        `MATCH (pc:PatientConsent {patientId: $patientId})
           OPTIONAL MATCH (pc)-[:RESOLVED_BY]->(tc:TrustCenter)
           RETURN pc.consentId AS consentId, pc.dataScope AS dataScope, tc.name AS trustCenter`,
        { patientId },
      ),
    ]);

    const holder = holderRows[0] ?? null;
    const accessLog = holder
      ? await runQuery<AccessLogEntry>(
          `MATCH (te:TransferEvent)
           WHERE te.providerDid = $did AND te.timestamp >= datetime($since)
           WITH te, coalesce(te.consumerDid, te.participant) AS consumerDid
           OPTIONAL MATCH (c:Participant {participantId: consumerDid})
           RETURN te.eventId AS id,
                  toString(te.timestamp) AS accessedAt,
                  consumerDid,
                  c.name AS consumerName,
                  te.providerDid AS providerDid,
                  te.datasetId AS datasetId,
                  te.statusCode AS statusCode,
                  te.permitId AS permitId,
                  te.contractId AS contractId,
                  te.responseBytes AS responseBytes
           ORDER BY te.timestamp DESC
           LIMIT 2000`,
          { did: holder.did, since: since.toISOString() },
        )
      : [];

    // Studies from the registry first, then the programmes the research
    // route lists that the registry does not know.
    const known = new Set(studyRows.map((s) => s.studyId));
    const programs = [
      ...studyRows,
      ...(research.programs ?? []).filter((p) => !known.has(p.studyId)),
    ];
    const extra = new Map(consentRows.map((c) => [c.consentId, c]));
    const consents: ConsentShape[] = (research.consents ?? []).map((c) => ({
      ...c,
      dataScope: c.dataScope ?? extra.get(c.consentId)?.dataScope ?? undefined,
      trustCenter:
        c.trustCenter ?? extra.get(c.consentId)?.trustCenter ?? undefined,
    }));

    const view: OverviewView = buildPatientView({
      asOf,
      profile,
      insights,
      research: { ...research, programs, consents },
      observations,
      accessLog,
      holder,
    });
    return NextResponse.json(view);
  } catch (err) {
    if (err instanceof SubRouteError) {
      return NextResponse.json(err.body, { status: err.status });
    }
    return NextResponse.json(
      {
        error: "Neo4j unavailable",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }
}

const DEFAULT_HDAB = { did: "did:web:medreg.de:hdab", name: "MedReg DE" };

/** The access body's own view: chains of trust per consumer, its own clocks. */
async function hdabView(
  url: URL,
  roles: string[],
  username: string | null,
  asOf: string,
): Promise<Response> {
  const requestedMe = url.searchParams.get("me");
  const fromUser = username ? userToParticipantId(username, roles) : "";
  const meDid =
    requestedMe ?? (fromUser.endsWith(":hdab") ? fromUser : DEFAULT_HDAB.did);
  const since = new Date(asOf);
  since.setUTCMonth(since.getUTCMonth() - 12);
  since.setUTCDate(1);
  try {
    const origin = url.origin;
    const [compliance, register, credentials, contractRows, events, meRows] =
      await Promise.all([
        call<{
          consumers: ParticipantShape[];
          datasets: { id: string; title: string }[];
          matrix: MatrixRow[];
        }>(complianceGET, origin, "/api/compliance"),
        call<{ entries: RegisterEntry[] }>(permitsGET, origin, "/api/permits"),
        call<{ credentials: CredentialEntry[] }>(
          credentialsGET,
          origin,
          "/api/credentials",
        ),
        runQuery<ContractShape>(
          `MATCH (c:Contract)
           OPTIONAL MATCH (consumer:Participant)-[:PARTY_TO|CONSUMER_OF|SIGNED]->(c)
           OPTIONAL MATCH (c)-[:GOVERNS|COVERS]->(dp:DataProduct)
           OPTIONAL MATCH (dp)-[:DESCRIBED_BY]->(ds:HealthDataset)
           RETURN c.contractId AS contractId,
                  coalesce(c.consumerDid, consumer.participantId) AS consumerDid,
                  coalesce(c.datasetId, ds.datasetId, dp.productId) AS datasetId,
                  toString(c.validUntil) AS validUntil,
                  c.status AS status
           LIMIT 200`,
        ),
        runQuery<HdabAccessEvent>(
          `MATCH (te:TransferEvent)
           WHERE te.timestamp >= datetime($since)
           WITH te, coalesce(te.consumerDid, te.participant) AS consumerDid
           OPTIONAL MATCH (c:Participant {participantId: consumerDid})
           OPTIONAL MATCH (p:Participant {participantId: te.providerDid})
           OPTIONAL MATCH (ds:HealthDataset {datasetId: te.datasetId})
           RETURN te.eventId AS id,
                  toString(te.timestamp) AS accessedAt,
                  consumerDid,
                  c.name AS consumerName,
                  te.providerDid AS providerDid,
                  p.name AS providerName,
                  te.datasetId AS datasetId,
                  ds.title AS assetTitle,
                  te.statusCode AS statusCode,
                  te.permitId AS permitId,
                  te.contractId AS contractId,
                  te.responseBytes AS responseBytes
           ORDER BY te.timestamp DESC
           LIMIT 5000`,
          { since: since.toISOString() },
        ),
        runQuery<{ did: string; name: string }>(
          `MATCH (p:Participant {participantId: $did})
           RETURN p.participantId AS did, coalesce(p.name, p.participantId) AS name`,
          { did: meDid },
        ),
      ]);
    const me =
      meRows[0] ??
      (meDid === DEFAULT_HDAB.did ? DEFAULT_HDAB : { did: meDid, name: meDid });
    const view: OverviewView = buildHdabView({
      asOf,
      me,
      consumers: compliance.consumers ?? [],
      datasets: compliance.datasets ?? [],
      matrix: compliance.matrix ?? [],
      register: register.entries ?? [],
      credentials: credentials.credentials ?? [],
      contracts: contractRows.filter((c) => c.contractId),
      events,
    });
    return NextResponse.json(view);
  } catch (err) {
    if (err instanceof SubRouteError) {
      return NextResponse.json(err.body, { status: err.status });
    }
    return NextResponse.json(
      {
        error: "Neo4j unavailable",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }
}

const DEFAULT_HOLDER = {
  did: "did:web:alpha-klinik.de:participant",
  name: "AlphaKlinik Berlin",
};

/** The holder's own view: who reads its data with what cover, its own duties. */
async function hospitalView(
  url: URL,
  roles: string[],
  username: string | null,
  asOf: string,
): Promise<Response> {
  const requestedMe = url.searchParams.get("me");
  const fromUser = username ? userToParticipantId(username, roles) : "";
  const meDid =
    requestedMe ??
    (fromUser &&
    !fromUser.startsWith("did:web:unknown") &&
    !fromUser.endsWith(":hdab")
      ? fromUser
      : DEFAULT_HOLDER.did);
  const since = new Date(asOf);
  since.setUTCMonth(since.getUTCMonth() - 12);
  since.setUTCDate(1);
  try {
    const origin = url.origin;
    const [
      compliance,
      register,
      credentials,
      contractRows,
      events,
      meRows,
      assessments,
    ] = await Promise.all([
      call<{
        consumers: ParticipantShape[];
        datasets: { id: string; title: string }[];
        matrix: MatrixRow[];
      }>(complianceGET, origin, "/api/compliance"),
      call<{ entries: RegisterEntry[] }>(permitsGET, origin, "/api/permits"),
      call<{ credentials: CredentialEntry[] }>(
        credentialsGET,
        origin,
        "/api/credentials",
      ),
      runQuery<ContractShape>(
        `MATCH (c:Contract)
           OPTIONAL MATCH (consumer:Participant)-[:PARTY_TO|CONSUMER_OF|SIGNED]->(c)
           OPTIONAL MATCH (c)-[:GOVERNS|COVERS]->(dp:DataProduct)
           OPTIONAL MATCH (dp)-[:DESCRIBED_BY]->(ds:HealthDataset)
           RETURN c.contractId AS contractId,
                  coalesce(c.consumerDid, consumer.participantId) AS consumerDid,
                  coalesce(c.datasetId, ds.datasetId, dp.productId) AS datasetId,
                  toString(c.validUntil) AS validUntil,
                  c.status AS status
           LIMIT 200`,
      ),
      runQuery<HdabAccessEvent>(
        `MATCH (te:TransferEvent)
           WHERE te.timestamp >= datetime($since) AND te.providerDid = $did
           WITH te, coalesce(te.consumerDid, te.participant) AS consumerDid
           OPTIONAL MATCH (c:Participant {participantId: consumerDid})
           OPTIONAL MATCH (ds:HealthDataset {datasetId: te.datasetId})
           RETURN te.eventId AS id,
                  toString(te.timestamp) AS accessedAt,
                  consumerDid,
                  c.name AS consumerName,
                  te.providerDid AS providerDid,
                  te.datasetId AS datasetId,
                  ds.title AS assetTitle,
                  te.statusCode AS statusCode,
                  te.permitId AS permitId,
                  te.contractId AS contractId,
                  te.responseBytes AS responseBytes
           ORDER BY te.timestamp DESC
           LIMIT 5000`,
        { since: since.toISOString(), did: meDid },
      ),
      runQuery<{ did: string; name: string }>(
        `MATCH (p:Participant {participantId: $did})
           RETURN p.participantId AS did, coalesce(p.name, p.participantId) AS name`,
        { did: meDid },
      ),
      runQuery<LabelAssessment>(
        `MATCH (p:Participant {participantId: $did})-[:HOLDS_CREDENTIAL]->(vc:VerifiableCredential)-[:HAS_ASSESSMENT]->(qa:QualityAssessment)
           RETURN vc.credentialId AS credentialId,
                  toString(qa.assessedAt) AS date,
                  qa.conformance AS conformance,
                  qa.completeness AS completeness,
                  qa.timeliness AS timeliness,
                  qa.period AS period
           ORDER BY qa.assessedAt`,
        { did: meDid },
      ),
    ]);
    const me =
      meRows[0] ??
      (meDid === DEFAULT_HOLDER.did
        ? DEFAULT_HOLDER
        : { did: meDid, name: meDid });
    const view: OverviewView = buildHospitalView({
      asOf,
      me,
      consumers: compliance.consumers ?? [],
      datasets: compliance.datasets ?? [],
      matrix: compliance.matrix ?? [],
      register: register.entries ?? [],
      credentials: credentials.credentials ?? [],
      contracts: contractRows.filter((c) => c.contractId),
      events,
      assessments,
    });
    return NextResponse.json(view);
  } catch (err) {
    if (err instanceof SubRouteError) {
      return NextResponse.json(err.body, { status: err.status });
    }
    return NextResponse.json(
      {
        error: "Neo4j unavailable",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }
}

const DEFAULT_USER = {
  did: "did:web:pharmaco.de:research",
  name: "PharmaCo Research AG",
};

/** The researcher's own view: what is permitted, pending, blocked, missing. */
async function researcherView(
  url: URL,
  roles: string[],
  username: string | null,
  asOf: string,
): Promise<Response> {
  const requestedMe = url.searchParams.get("me");
  const fromUser = username ? userToParticipantId(username, roles) : "";
  const meDid =
    requestedMe ??
    (fromUser &&
    !fromUser.startsWith("did:web:unknown") &&
    !fromUser.endsWith(":hdab")
      ? fromUser
      : DEFAULT_USER.did);
  const since = new Date(asOf);
  since.setUTCMonth(since.getUTCMonth() - 12);
  since.setUTCDate(1);
  try {
    const origin = url.origin;
    const [
      compliance,
      register,
      credentials,
      catalog,
      contractRows,
      events,
      meRows,
      studyRows,
    ] = await Promise.all([
      call<{
        consumers: ParticipantShape[];
        datasets: { id: string; title: string }[];
        matrix: MatrixRow[];
      }>(complianceGET, origin, "/api/compliance"),
      call<{ entries: RegisterEntry[] }>(permitsGET, origin, "/api/permits"),
      call<{ credentials: CredentialEntry[] }>(
        credentialsGET,
        origin,
        "/api/credentials",
      ),
      call<CatalogDataset[]>(catalogGET, origin, "/api/catalog"),
      runQuery<ContractShape>(
        `MATCH (c:Contract)
           OPTIONAL MATCH (consumer:Participant)-[:PARTY_TO|CONSUMER_OF|SIGNED]->(c)
           OPTIONAL MATCH (c)-[:GOVERNS|COVERS]->(dp:DataProduct)
           OPTIONAL MATCH (dp)-[:DESCRIBED_BY]->(ds:HealthDataset)
           RETURN c.contractId AS contractId,
                  coalesce(c.consumerDid, consumer.participantId) AS consumerDid,
                  coalesce(c.datasetId, ds.datasetId, dp.productId) AS datasetId,
                  toString(c.validUntil) AS validUntil,
                  c.status AS status
           LIMIT 200`,
      ),
      runQuery<HdabAccessEvent>(
        `MATCH (te:TransferEvent)
           WHERE te.timestamp >= datetime($since)
             AND coalesce(te.consumerDid, te.participant) = $did
           OPTIONAL MATCH (ds:HealthDataset {datasetId: te.datasetId})
           RETURN te.eventId AS id,
                  toString(te.timestamp) AS accessedAt,
                  $did AS consumerDid,
                  te.providerDid AS providerDid,
                  te.datasetId AS datasetId,
                  ds.title AS assetTitle,
                  te.statusCode AS statusCode,
                  te.permitId AS permitId,
                  te.contractId AS contractId,
                  te.responseBytes AS responseBytes
           ORDER BY te.timestamp DESC
           LIMIT 5000`,
        { since: since.toISOString(), did: meDid },
      ),
      runQuery<{ did: string; name: string }>(
        `MATCH (p:Participant {participantId: $did})
           RETURN p.participantId AS did, coalesce(p.name, p.participantId) AS name`,
        { did: meDid },
      ),
      runQuery<StudyRecord>(
        `MATCH (st:ResearchStudy)
           OPTIONAL MATCH (inst:Participant)-[:CONDUCTS]->(st)
           OPTIONAL MATCH (st)-[:HAS_ENROLMENT]->(en:StudyEnrolment)
           WITH st, inst, en ORDER BY en.asOf
           RETURN st.studyId AS studyId,
                  coalesce(st.name, st.studyId) AS studyName,
                  coalesce(inst.name, st.institutionDid, '') AS institution,
                  coalesce(inst.participantId, st.institutionDid) AS institutionDid,
                  st.status AS status,
                  st.dataNeeded AS dataNeeded,
                  st.description AS description,
                  st.countries AS countries,
                  st.participantCount AS participantCount,
                  [x IN collect(CASE WHEN en IS NULL THEN null ELSE {date: toString(en.asOf), value: en.participants} END) WHERE x IS NOT NULL] AS enrolment
           ORDER BY st.studyId
           LIMIT 100`,
      ),
    ]);
    const me =
      meRows[0] ??
      (meDid === DEFAULT_USER.did ? DEFAULT_USER : { did: meDid, name: meDid });
    // The catalogue's descriptions, keyed by dataset id or title
    const byKey = new Map<string, CatalogDataset>();
    for (const c of Array.isArray(catalog) ? catalog : []) {
      byKey.set(c.id, c);
      byKey.set(c.title, c);
    }
    const datasets: CatalogDataset[] = (compliance.datasets ?? []).map((d) => {
      const c = byKey.get(d.id) ?? byKey.get(d.title);
      return {
        id: d.id,
        title: d.title,
        description: c?.description ?? null,
        publisher: c?.publisher ?? null,
        theme: c?.theme ?? null,
        recordCount: c?.recordCount ?? null,
      };
    });
    const view: OverviewView = buildResearcherView({
      asOf,
      me,
      consumers: compliance.consumers ?? [],
      datasets,
      matrix: compliance.matrix ?? [],
      register: register.entries ?? [],
      credentials: credentials.credentials ?? [],
      contracts: contractRows.filter((c) => c.contractId),
      events,
      studies: studyRows,
    });
    return NextResponse.json(view);
  } catch (err) {
    if (err instanceof SubRouteError) {
      return NextResponse.json(err.body, { status: err.status });
    }
    return NextResponse.json(
      {
        error: "Neo4j unavailable",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }
}
