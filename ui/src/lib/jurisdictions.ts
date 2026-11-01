/**
 * National implementation profiles of the EHDS (#782, phase 1).
 *
 * Regulation (EU) 2025/327 is the same text in every member state; what
 * differs is who the health data access body is, which national law it acts
 * under, how a person objects to secondary use, what access costs and when
 * it all applies. That is a jurisdiction, not a translation. The laws and the
 * legal roles here are real; every organisation on the hub stays fictional
 * (MedReg DE, MedReg ES, Institut de Recherche Santé), and the real
 * institution that holds a role is not named.
 *
 * The graph holds them (neo4j/seed-jurisdictions.cypher); the static export
 * reads ui/public/mock/jurisdictions.json, which has the same shape.
 */

export interface NationalLaw {
  lawId: string;
  /** The official title, in the national language. */
  title: string;
  titleEn: string;
  citation?: string | null;
  year?: number | null;
  url?: string | null;
  /** "IN_FORCE", "BILL" or "DRAFT". */
  status: string;
}

export interface Milestone {
  milestoneId: string;
  /** An ISO date, or a year or year-month when no day is fixed. */
  date: string;
  label: string;
  /** "EU" for a date of the Regulation, "NATIONAL" for one of the country. */
  scope: string;
  /** "DONE" or "PLANNED". */
  status: string;
}

export interface ParticipantRef {
  participantId: string;
  name: string;
  type?: string | null;
}

export interface Jurisdiction {
  /** ISO 3166-1 alpha-2. */
  code: string;
  name: string;
  nameNative: string;
  /** ISO 639-1 codes of the languages the access body works in. */
  languages: string[];
  /** The legal role the national law creates, in the national language. */
  accessBodyRole: string;
  accessBodyRoleEn: string;
  /** Where the country is with designating its access body (Art. 55). */
  designationStatus: string;
  /** How a person objects to secondary use today, and Art. 71. */
  optOutModel: string;
  /** Whether and on what basis access is charged for (Art. 62). */
  fees: string;
  summary: string;
  sources: string[];
  laws: NationalLaw[];
  milestones: Milestone[];
  /** The hub's fictional access bodies under this jurisdiction. */
  accessBodies: ParticipantRef[];
  /** The hub's other fictional participants under it. */
  participants: ParticipantRef[];
}

export interface JurisdictionsResponse {
  /** When the profiles were last checked against their sources. */
  reviewedOn: string;
  regulation: { title: string; eli: string };
  jurisdictions: Jurisdiction[];
}

export const EHDS_TITLE =
  "Regulation (EU) 2025/327 on the European Health Data Space";
export const EHDS_ELI = "http://data.europa.eu/eli/reg/2025/327/oj";

/** The query behind /api/jurisdictions. */
export const JURISDICTIONS_CYPHER = `
  MATCH (j:Jurisdiction)
  OPTIONAL MATCH (j)-[:HAS_LEGAL_BASIS]->(law:NationalLaw)
  // The law in force first, then the bills, each oldest first.
  WITH j, law ORDER BY CASE law.status WHEN 'IN_FORCE' THEN 0 ELSE 1 END, law.year, law.lawId
  WITH j, collect(DISTINCT law {.lawId, .title, .titleEn, .citation, .year, .url, .status}) AS laws
  OPTIONAL MATCH (j)-[:HAS_MILESTONE]->(m:JurisdictionMilestone)
  WITH j, laws, m ORDER BY m.date
  WITH j, laws, collect(DISTINCT m {.milestoneId, .date, .label, .scope, .status}) AS milestones
  OPTIONAL MATCH (p:Participant)-[:UNDER_JURISDICTION]->(j)
  WITH j, laws, milestones, p ORDER BY p.name
  // Older seeds mark an access body participantType 'HDAB', newer ones
  // type 'HDAB_AUTHORITY' (seed-es-hdab.cypher).
  WITH j, laws, milestones, p,
       p.type = 'HDAB_AUTHORITY' OR p.participantType = 'HDAB' AS isBody
  WITH j, laws, milestones,
       collect(DISTINCT CASE WHEN isBody
         THEN p {.participantId, .name, type: 'HDAB_AUTHORITY'} END) AS accessBodies,
       collect(DISTINCT CASE WHEN p IS NOT NULL AND NOT coalesce(isBody, false)
         THEN p {.participantId, .name, type: coalesce(p.type, p.participantType)} END) AS participants
  RETURN j.code AS code, j.name AS name, j.nameNative AS nameNative,
         j.languages AS languages, j.accessBodyRole AS accessBodyRole,
         j.accessBodyRoleEn AS accessBodyRoleEn,
         j.designationStatus AS designationStatus, j.optOutModel AS optOutModel,
         j.fees AS fees, j.summary AS summary, j.sources AS sources,
         j.reviewedOn AS reviewedOn,
         laws, milestones, accessBodies, participants
  ORDER BY j.sortOrder, j.code`;
