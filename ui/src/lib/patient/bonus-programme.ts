/**
 * A bonus program of another data space, as /api/patient/programmes returns
 * it (#934, step 3). Here and not in the route: the page imports it, and the
 * static build removes src/app/api.
 */
export interface BonusProgramme {
  programmeId: string;
  title: string;
  description: string | null;
  publisherName: string;
  publisherDid: string;
  dataSpace: string | null;
  endpointUrl: string | null;
  ruleTitle: string | null;
  ruleDescription: string | null;
  ruleVersion: string | null;
  lastSeenAt: string | null;
}

/** One consent of the person to one program (#934, step 4). */
export interface ProgrammeConsent {
  consentId: string;
  programmeId: string;
  joinedAt: string;
  withdrawnAt: string | null;
}
